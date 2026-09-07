import { getCurrentDb } from '../companyFile';
import { computeMileageClaim, type Trip } from '@shared/domain/tax/mileage';
import { ensureAccountByName } from '../db/ensureAccount';
import { journalCreate, journalPost, journalVoid } from './journal.handlers';

/** The mileage log, and turning a year of it into a deduction.
 *
 * Trips are recorded without posting. The rate steps down after the first 5,000 km in a calendar
 * year, so what any one trip is worth depends on every trip before it — a journal entry written at
 * the moment a trip is logged would be wrong for any trip that later turns out to sit past the
 * step. The claim is therefore computed over the whole year and posted once.
 */

export interface TripInput {
  tripDate: string;
  kilometres: number;
  purpose: string;
  vehicle: string | null;
  startLocation: string | null;
  endLocation: string | null;
}

export async function mileageList(input?: unknown) {
  const { year } = (input ?? {}) as { year?: number };
  const db = getCurrentDb();
  let query = db.selectFrom('mileageTrips').selectAll();
  if (year) {
    query = query.where('tripDate', '>=', `${year}-01-01`).where('tripDate', '<=', `${year}-12-31`);
  }
  return query.orderBy('tripDate', 'desc').orderBy('id', 'desc').execute();
}

function validate(payload: TripInput): void {
  if (!payload.tripDate) throw new Error('A trip needs a date.');
  if (!payload.purpose?.trim()) {
    // The CRA expects a log that says why each trip was business travel. A distance with no reason
    // is not a record, and it is the first thing asked for if the claim is ever questioned.
    throw new Error('A trip needs a purpose — a log without one does not support the claim.');
  }
  if (!(payload.kilometres > 0)) throw new Error('A trip needs a distance greater than zero.');
}

export async function mileageCreate(input: unknown) {
  const payload = input as TripInput;
  validate(payload);

  const db = getCurrentDb();
  return db
    .insertInto('mileageTrips')
    .values({
      tripDate: payload.tripDate,
      kilometres: payload.kilometres,
      purpose: payload.purpose.trim(),
      vehicle: payload.vehicle?.trim() || null,
      startLocation: payload.startLocation?.trim() || null,
      endLocation: payload.endLocation?.trim() || null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function mileageUpdate(input: unknown) {
  const { id, patch } = input as { id: number; patch: TripInput };
  const db = getCurrentDb();

  const existing = await db.selectFrom('mileageTrips').selectAll().where('id', '=', id).executeTakeFirst();
  if (!existing) throw new Error(`Trip ${id} not found.`);
  if (existing.journalEntryId !== null) {
    throw new Error('This trip has already been claimed. Void the claim entry first if it needs changing.');
  }

  validate(patch);
  return db
    .updateTable('mileageTrips')
    .set({
      tripDate: patch.tripDate,
      kilometres: patch.kilometres,
      purpose: patch.purpose.trim(),
      vehicle: patch.vehicle?.trim() || null,
      startLocation: patch.startLocation?.trim() || null,
      endLocation: patch.endLocation?.trim() || null,
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function mileageDelete(id: number) {
  const db = getCurrentDb();
  const existing = await db.selectFrom('mileageTrips').selectAll().where('id', '=', id).executeTakeFirst();
  if (!existing) throw new Error(`Trip ${id} not found.`);
  if (existing.journalEntryId !== null) {
    throw new Error('This trip has already been claimed and cannot be deleted.');
  }
  await db.deleteFrom('mileageTrips').where('id', '=', id).execute();
  return { deleted: true } as const;
}

async function companyProvince(db: ReturnType<typeof getCurrentDb>): Promise<string | null> {
  const company = await db.selectFrom('companyInfo').selectAll().executeTakeFirst();
  // The territories get 4¢ a kilometre more, and the business address is what decides it.
  return company?.businessProvince ?? null;
}

/** The year's claim, worked out but not posted — what the screen shows. */
export async function mileageClaim(input: unknown) {
  const { year } = input as { year: number };
  const db = getCurrentDb();
  const rows = await db
    .selectFrom('mileageTrips')
    .selectAll()
    .where('tripDate', '>=', `${year}-01-01`)
    .where('tripDate', '<=', `${year}-12-31`)
    .execute();

  const trips: Trip[] = rows.map((r) => ({
    id: r.id,
    tripDate: r.tripDate,
    kilometres: r.kilometres,
    purpose: r.purpose,
    vehicle: r.vehicle,
  }));

  const result = computeMileageClaim(trips, year, await companyProvince(db));
  const claimedIds = new Set(rows.filter((r) => r.journalEntryId !== null).map((r) => r.id));

  return {
    ...result,
    // Which trips are already on the books, so the screen can show what a fresh claim would cover.
    alreadyClaimedTripIds: [...claimedIds],
    unclaimedCount: rows.length - claimedIds.size,
  };
}

/**
 * Posts a year's unclaimed mileage as an expense.
 *
 * Debit the vehicle expense account, credit whatever the allowance is owed to — normally the
 * shareholder or owner, since the money was their own. Only unclaimed trips are included, and each
 * is stamped with the entry, which is what stops the same kilometres being deducted twice.
 */
export async function mileagePostClaim(input: unknown) {
  const { year, expenseAccountId, creditAccountId, entryDate } = input as {
    year: number;
    expenseAccountId?: number;
    creditAccountId?: number;
    entryDate?: string;
  };

  const db = getCurrentDb();
  const rows = await db
    .selectFrom('mileageTrips')
    .selectAll()
    .where('tripDate', '>=', `${year}-01-01`)
    .where('tripDate', '<=', `${year}-12-31`)
    .execute();

  const unclaimed = rows.filter((r) => r.journalEntryId === null);
  if (unclaimed.length === 0) throw new Error(`Every ${year} trip has already been claimed.`);

  // Computed over ALL the year's trips, then apportioned: the rate depends on the whole year's
  // running total, so claiming only the unclaimed ones at first-tier rates would over-claim
  // whenever an earlier batch had already used up the 5,000 km.
  const province = await companyProvince(db);
  const full = computeMileageClaim(
    rows.map((r) => ({ id: r.id, tripDate: r.tripDate, kilometres: r.kilometres, purpose: r.purpose, vehicle: r.vehicle })),
    year,
    province,
  );

  const unclaimedIds = new Set(unclaimed.map((r) => r.id));
  const amountCents = full.trips.filter((t) => unclaimedIds.has(t.id)).reduce((sum, t) => sum + t.amountCents, 0);
  if (amountCents <= 0) throw new Error('There is nothing to claim for that year.');

  const expenseId = expenseAccountId ?? (await ensureAccountByName(db, 'Motor Vehicle Expenses', 'Expense', '5070', '8960', 'Operating Expense'));
  const creditId = creditAccountId ?? (await ensureAccountByName(db, 'Due to Shareholder', 'Liability', '2700', '2780', 'Long-Term Liability'));
  const date = entryDate ?? `${year}-12-31`;

  const km = full.trips.filter((t) => unclaimedIds.has(t.id)).reduce((sum, t) => sum + t.kilometres, 0);
  const memo = `Mileage claim ${year} — ${km.toLocaleString('en-CA')} km at CRA ${full.rate.year} rates`;

  const posted = await db.transaction().execute(async (trx) => {
    const entry = await journalCreate(
      {
        entryDate: date,
        memo,
        reference: `MILEAGE-${year}`,
        lines: [
          { accountId: expenseId, debitCents: amountCents, creditCents: 0, description: memo },
          { accountId: creditId, debitCents: 0, creditCents: amountCents, description: memo },
        ],
      },
      trx,
    );
    const entryPosted = await journalPost(entry.id, trx);

    // Stamped in the same transaction as the entry: a trip marked claimed without an entry, or an
    // entry without the trips marked, would let the same kilometres be deducted twice.
    for (const trip of unclaimed) {
      await trx
        .updateTable('mileageTrips')
        .set({ journalEntryId: entryPosted.id, claimedAt: new Date().toISOString() })
        .where('id', '=', trip.id)
        .execute();
    }

    return entryPosted;
  });

  return { journalEntryId: posted.id, amountCents, tripCount: unclaimed.length, kilometres: km, rateYear: full.rate.year };
}

/** Reverses only the most recently posted batch for the year and releases its trips. */
export async function mileageReverseLatestClaim(input: unknown) {
  const { year } = input as { year: number };
  const db = getCurrentDb();
  const latest = await db.selectFrom('mileageTrips').select(['journalEntryId', 'claimedAt']).where('tripDate', '>=', `${year}-01-01`).where('tripDate', '<=', `${year}-12-31`).where('journalEntryId', 'is not', null).orderBy('claimedAt', 'desc').orderBy('id', 'desc').executeTakeFirst();
  if (!latest?.journalEntryId) throw new Error(`There is no posted ${year} mileage claim to reverse.`);
  const affected = await db.selectFrom('mileageTrips').select('id').where('journalEntryId', '=', latest.journalEntryId).execute();
  await db.transaction().execute(async (trx) => {
    await journalVoid(latest.journalEntryId!, false, trx, true);
    await trx.updateTable('mileageTrips').set({ journalEntryId: null, claimedAt: null }).where('journalEntryId', '=', latest.journalEntryId!).execute();
  });
  return { journalEntryId: latest.journalEntryId, releasedTrips: affected.length };
}
