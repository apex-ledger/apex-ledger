import { z } from 'zod';
import { depreciationSchedule, disposalFigures, lastDayOfMonth, missingMonths, monthlyDepreciationCents, type DepreciationMethod } from '@shared/domain/assets/fixedAssets';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { getCurrentDb } from '../companyFile';
import { getAllFiscalPeriods } from '../db/queries';
import { isDateInLockedPeriod } from '@shared/domain/ledger/postJournalEntry';
import { ensureAccountByName } from '../db/ensureAccount';
import type { AppDb } from '../db/schema';
import { journalCreate, journalPost } from './journal.handlers';

export const fixedAssetSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional().default(null),
  assetAccountId: z.number().int().positive(),
  accumulatedDepreciationAccountId: z.number().int().positive().nullable().optional().default(null),
  depreciationExpenseAccountId: z.number().int().positive().nullable().optional().default(null),
  costCents: z.number().int().min(0),
  salvageCents: z.number().int().min(0).optional().default(0),
  acquiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inServiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(['straightLine', 'decliningBalance']),
  usefulLifeMonths: z.number().int().min(0).max(1200).optional().default(0),
  decliningRate: z.number().min(0).max(1).optional().default(0),
  ccaClass: z.string().trim().max(10).nullable().optional().default(null),
  serialNumber: z.string().trim().max(80).nullable().optional().default(null),
  location: z.string().trim().max(120).nullable().optional().default(null),
  notes: z.string().trim().max(1000).nullable().optional().default(null),
});
export type FixedAssetInput = z.infer<typeof fixedAssetSchema>;

export interface FixedAssetRow extends Omit<FixedAssetInput, 'id'> {
  id: number;
  status: 'active' | 'disposed';
  disposedDate: string | null;
  proceedsCents: number | null;
  disposalJournalEntryId: number | null;
  createdAt: string;
  /** Derived: what has been posted so far. */
  accumulatedCents: number;
  bookValueCents: number;
  monthsPosted: number;
  lastPostedMonth: string | null;
  nextMonthlyCents: number;
}

export interface DepreciationPostingRow {
  id: number;
  assetId: number;
  periodMonth: string;
  amountCents: number;
  journalEntryId: number | null;
}

function toRow(r: Record<string, unknown>, postings: DepreciationPostingRow[]): FixedAssetRow {
  const own = postings.filter((p) => p.assetId === r.id).sort((a, b) => a.periodMonth.localeCompare(b.periodMonth));
  const accumulatedCents = own.reduce((s, p) => s + p.amountCents, 0);
  const asset = {
    costCents: r.costCents as number,
    salvageCents: r.salvageCents as number,
    inServiceDate: r.inServiceDate as string,
    method: r.method as DepreciationMethod,
    usefulLifeMonths: r.usefulLifeMonths as number,
    decliningRate: r.decliningRate as number,
  };
  return {
    id: r.id as number,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    assetAccountId: r.assetAccountId as number,
    accumulatedDepreciationAccountId: (r.accumulatedDepreciationAccountId as number | null) ?? null,
    depreciationExpenseAccountId: (r.depreciationExpenseAccountId as number | null) ?? null,
    costCents: asset.costCents,
    salvageCents: asset.salvageCents,
    acquiredDate: r.acquiredDate as string,
    inServiceDate: asset.inServiceDate,
    method: asset.method,
    usefulLifeMonths: asset.usefulLifeMonths,
    decliningRate: asset.decliningRate,
    ccaClass: (r.ccaClass as string | null) ?? null,
    serialNumber: (r.serialNumber as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    status: (r.status as 'active' | 'disposed') ?? 'active',
    disposedDate: (r.disposedDate as string | null) ?? null,
    proceedsCents: (r.proceedsCents as number | null) ?? null,
    disposalJournalEntryId: (r.disposalJournalEntryId as number | null) ?? null,
    createdAt: r.createdAt as string,
    accumulatedCents,
    bookValueCents: asset.costCents - accumulatedCents,
    monthsPosted: own.length,
    lastPostedMonth: own.at(-1)?.periodMonth ?? null,
    nextMonthlyCents: r.status === 'disposed' ? 0 : monthlyDepreciationCents(asset, accumulatedCents, own.length),
  };
}

async function loadPostings(db: AppDb): Promise<DepreciationPostingRow[]> {
  const rows = await db.selectFrom('fixedAssetDepreciation').selectAll().execute();
  return rows.map((r) => ({ id: r.id, assetId: r.assetId, periodMonth: r.periodMonth, amountCents: r.amountCents, journalEntryId: r.journalEntryId }));
}

export async function fixedAssetsList(): Promise<FixedAssetRow[]> {
  const db = getCurrentDb();
  const [rows, postings] = await Promise.all([db.selectFrom('fixedAssets').selectAll().orderBy('name').execute(), loadPostings(db)]);
  return rows.map((r) => toRow(r as unknown as Record<string, unknown>, postings));
}

export async function fixedAssetsSave(input: unknown): Promise<FixedAssetRow> {
  const { id, ...payload } = fixedAssetSchema.parse(input);
  if (payload.method === 'straightLine' && payload.usefulLifeMonths <= 0) throw new Error('Straight-line depreciation needs a useful life in months.');
  if (payload.method === 'decliningBalance' && payload.decliningRate <= 0) throw new Error('Declining balance needs an annual rate.');
  if (payload.salvageCents > payload.costCents) throw new Error('Salvage value cannot exceed cost.');
  if (payload.inServiceDate < payload.acquiredDate) throw new Error('In-service date cannot be before the acquisition date.');
  const db = getCurrentDb();
  const values = { ...payload };
  if (id) {
    const posted = await db.selectFrom('fixedAssetDepreciation').select('id').where('assetId', '=', id).executeTakeFirst();
    if (posted) {
      // Depreciation already in the books: the figures that drive it are frozen; only labels move.
      const current = await db.selectFrom('fixedAssets').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
      for (const key of ['costCents', 'salvageCents', 'inServiceDate', 'method', 'usefulLifeMonths', 'decliningRate'] as const) {
        if ((values as Record<string, unknown>)[key] !== (current as Record<string, unknown>)[key]) throw new Error('Cost, salvage, in-service date and method are locked once depreciation has been posted. Dispose the asset and add it again to change them.');
      }
    }
    await db.updateTable('fixedAssets').set(values).where('id', '=', id).execute();
    return (await fixedAssetsList()).find((a) => a.id === id)!;
  }
  const inserted = await db.insertInto('fixedAssets').values(values).returning('id').executeTakeFirstOrThrow();
  return (await fixedAssetsList()).find((a) => a.id === inserted.id)!;
}

export async function fixedAssetsDelete(id: number): Promise<{ deleted: true }> {
  const db = getCurrentDb();
  const posted = await db.selectFrom('fixedAssetDepreciation').select('id').where('assetId', '=', id).executeTakeFirst();
  if (posted) throw new Error('This asset has depreciation posted. Dispose it instead of deleting it.');
  await db.deleteFrom('fixedAssets').where('id', '=', id).execute();
  return { deleted: true };
}

export async function fixedAssetsSchedule(id: number) {
  const db = getCurrentDb();
  const row = await db.selectFrom('fixedAssets').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  const taken = (await loadPostings(db)).filter((p) => p.assetId === id).map((p) => ({ month: p.periodMonth, amountCents: p.amountCents }));
  const asset = { costCents: row.costCents, salvageCents: row.salvageCents, inServiceDate: row.inServiceDate, method: row.method as DepreciationMethod, usefulLifeMonths: row.usefulLifeMonths, decliningRate: row.decliningRate };
  // Show far enough ahead to reach salvage, capped at 40 years.
  let through = row.inServiceDate.slice(0, 7);
  const full = depreciationSchedule(asset, `${Number(through.slice(0, 4)) + 40}-12`, taken);
  const lastNonZero = full.findIndex((r, i) => i > 0 && r.amountCents === 0);
  through = (lastNonZero > 0 ? full[lastNonZero - 1] : full.at(-1))?.month ?? through;
  return { rows: depreciationSchedule(asset, through, taken), postedMonths: taken.map((t) => t.month) };
}

async function depreciationAccounts(db: AppDb, asset: { accumulatedDepreciationAccountId: number | null; depreciationExpenseAccountId: number | null }) {
  const accumulated = asset.accumulatedDepreciationAccountId ?? (await ensureAccountByName(db, 'Accumulated Depreciation', 'Asset', '1650', '2009', 'Fixed Asset'));
  const expense = asset.depreciationExpenseAccountId ?? (await ensureAccountByName(db, 'Depreciation', 'Expense', '9750', '8670', 'Operating Expense'));
  return { accumulated, expense };
}

/** Posts every missing month of depreciation for every active asset through `throughMonth`, one
 * journal entry per month dated the month end. Re-running is safe: months already posted are
 * skipped, so a partial run never doubles up. */
export async function fixedAssetsRunDepreciation(input: unknown): Promise<{ postedMonths: number; assets: number; totalCents: number; skippedLocked: string[] }> {
  const { throughMonth } = z.object({ throughMonth: z.string().regex(/^\d{4}-\d{2}$/) }).parse(input ?? {});
  if (throughMonth > localIsoDate().slice(0, 7)) throw new Error('Depreciation can only be posted through the current month.');
  const db = getCurrentDb();
  const assets = await db.selectFrom('fixedAssets').selectAll().where('status', '=', 'active').execute();
  const postings = await loadPostings(db);
  const fiscalPeriods = await getAllFiscalPeriods(db);
  const skippedLocked: string[] = [];
  let postedMonths = 0;
  let totalCents = 0;
  const touched = new Set<number>();

  // Gather every (month → lines) first so each month becomes one balanced entry.
  const byMonth = new Map<string, Array<{ assetId: number; amountCents: number; name: string; accounts: { accumulated: number; expense: number } }>>();
  for (const a of assets) {
    const own = postings.filter((p) => p.assetId === a.id).map((p) => ({ month: p.periodMonth, amountCents: p.amountCents }));
    const asset = { costCents: a.costCents, salvageCents: a.salvageCents, inServiceDate: a.inServiceDate, method: a.method as DepreciationMethod, usefulLifeMonths: a.usefulLifeMonths, decliningRate: a.decliningRate };
    const months = missingMonths(asset, throughMonth, own);
    if (months.length === 0) continue;
    const accounts = await depreciationAccounts(db, a);
    const schedule = depreciationSchedule(asset, throughMonth, own);
    for (const month of months) {
      const amount = schedule.find((r) => r.month === month)?.amountCents ?? 0;
      if (amount <= 0) continue;
      byMonth.set(month, [...(byMonth.get(month) ?? []), { assetId: a.id, amountCents: amount, name: a.name, accounts }]);
    }
  }

  for (const [month, lines] of [...byMonth.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    // A locked period is closed and filed; depreciation for it must go through a deliberate
    // adjusting entry, not a routine run.
    if (isDateInLockedPeriod(lastDayOfMonth(month), fiscalPeriods)) {
      skippedLocked.push(month);
      continue;
    }
    await db.transaction().execute(async (trx) => {
      const created = await journalCreate(
        {
          entryDate: lastDayOfMonth(month),
          memo: `Depreciation — ${month}`,
          reference: `DEPR-${month}`,
          lines: lines.flatMap((l) => [
            { accountId: l.accounts.expense, debitCents: l.amountCents, creditCents: 0, description: `Depreciation — ${l.name}` },
            { accountId: l.accounts.accumulated, debitCents: 0, creditCents: l.amountCents, description: `Accumulated depreciation — ${l.name}` },
          ]),
        },
        trx,
      );
      const posted = await journalPost(created.id, trx);
      await trx.insertInto('fixedAssetDepreciation').values(lines.map((l) => ({ assetId: l.assetId, periodMonth: month, amountCents: l.amountCents, journalEntryId: posted.id }))).execute();
      for (const l of lines) {
        touched.add(l.assetId);
        totalCents += l.amountCents;
      }
    });
    postedMonths += 1;
  }
  return { postedMonths, assets: touched.size, totalCents, skippedLocked };
}

/** Disposal: clears cost and accumulated depreciation, books the proceeds to the chosen account
 * (bank, or a receivable), and the difference to gain/loss on disposal. */
export async function fixedAssetsDispose(input: unknown): Promise<FixedAssetRow> {
  const { id, disposedDate, proceedsCents, proceedsAccountId } = z
    .object({ id: z.number().int().positive(), disposedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), proceedsCents: z.number().int().min(0), proceedsAccountId: z.number().int().positive().nullable().optional() })
    .parse(input);
  const db = getCurrentDb();
  const a = await db.selectFrom('fixedAssets').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  if (a.status === 'disposed') throw new Error('This asset has already been disposed.');
  if (proceedsCents > 0 && !proceedsAccountId) throw new Error('Choose the account the proceeds went to.');
  const postings = (await loadPostings(db)).filter((p) => p.assetId === id);
  const accumulatedCents = postings.reduce((s, p) => s + p.amountCents, 0);
  const figures = disposalFigures(a.costCents, accumulatedCents, proceedsCents);
  const accounts = await depreciationAccounts(db, a);
  const gainLossAccount = await ensureAccountByName(db, 'Gain or Loss on Disposal of Assets', figures.gainLossCents >= 0 ? 'Revenue' : 'Expense', figures.gainLossCents >= 0 ? '4950' : '9760', figures.gainLossCents >= 0 ? '8210' : '8790', figures.gainLossCents >= 0 ? 'Other Income' : 'Operating Expense');

  const lines = [
    ...(accumulatedCents > 0 ? [{ accountId: accounts.accumulated, debitCents: accumulatedCents, creditCents: 0, description: `Clear accumulated depreciation — ${a.name}` }] : []),
    ...(proceedsCents > 0 && proceedsAccountId ? [{ accountId: proceedsAccountId, debitCents: proceedsCents, creditCents: 0, description: `Proceeds on disposal — ${a.name}` }] : []),
    ...(figures.gainLossCents < 0 ? [{ accountId: gainLossAccount, debitCents: -figures.gainLossCents, creditCents: 0, description: `Loss on disposal — ${a.name}` }] : []),
    { accountId: a.assetAccountId, debitCents: 0, creditCents: a.costCents, description: `Remove asset at cost — ${a.name}` },
    ...(figures.gainLossCents > 0 ? [{ accountId: gainLossAccount, debitCents: 0, creditCents: figures.gainLossCents, description: `Gain on disposal — ${a.name}` }] : []),
  ];
  await db.transaction().execute(async (trx) => {
    const created = await journalCreate({ entryDate: disposedDate, memo: `Disposal of ${a.name}`, reference: `ASSET-DISP-${a.id}`, lines }, trx);
    const posted = await journalPost(created.id, trx);
    await trx.updateTable('fixedAssets').set({ status: 'disposed', disposedDate, proceedsCents, disposalJournalEntryId: posted.id }).where('id', '=', id).execute();
  });
  return (await fixedAssetsList()).find((x) => x.id === id)!;
}
