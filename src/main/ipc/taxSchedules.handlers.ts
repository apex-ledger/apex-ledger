import { getCurrentDb } from '../companyFile';
import { ccaSchedule, type CcaClassInput } from '@shared/domain/tax/capitalCostAllowance';
import { amortizationSchedule, type LoanTerms, type PaymentFrequency } from '@shared/domain/tax/loanAmortization';
import { budgetVsActual } from '@shared/domain/ledger/budgetVsActual';
import { getAllAccounts, getAllJournalEntriesWithLines } from '../db/queries';

/** CCA pools and loan schedules — the two spreadsheets that used to live beside the books. */

export async function ccaPoolsList(input: unknown) {
  const { fiscalYearEnd } = (input ?? {}) as { fiscalYearEnd?: string };
  const db = getCurrentDb();
  let query = db.selectFrom('ccaPools').selectAll();
  if (fiscalYearEnd) query = query.where('fiscalYearEnd', '=', fiscalYearEnd);
  return query.orderBy('fiscalYearEnd').orderBy('classCode').execute();
}

export async function ccaPoolSave(input: unknown) {
  const payload = input as {
    id?: number;
    fiscalYearEnd: string;
    classCode: string;
    openingUccCents: number;
    additionsCents: number;
    dispositionsCents: number;
    availableForUseYear: number | null;
    rateOverride: number | null;
    claimCents: number | null;
    note: string | null;
  };
  if (!payload.classCode?.trim()) throw new Error('Choose a CCA class.');
  if (!payload.fiscalYearEnd) throw new Error('A fiscal year end is required.');
  const db = getCurrentDb();

  if (payload.id) {
    await db
      .updateTable('ccaPools')
      .set({
        classCode: payload.classCode.trim(),
        openingUccCents: payload.openingUccCents,
        additionsCents: payload.additionsCents,
        dispositionsCents: payload.dispositionsCents,
        availableForUseYear: payload.availableForUseYear,
        rateOverride: payload.rateOverride,
        claimCents: payload.claimCents,
        note: payload.note,
      })
      .where('id', '=', payload.id)
      .execute();
    return db.selectFrom('ccaPools').selectAll().where('id', '=', payload.id).executeTakeFirstOrThrow();
  }

  // One row per class per year — the unique index enforces it, so a duplicate is reported plainly
  // rather than surfacing as a raw constraint error.
  const clash = await db
    .selectFrom('ccaPools')
    .select('id')
    .where('fiscalYearEnd', '=', payload.fiscalYearEnd)
    .where('classCode', '=', payload.classCode.trim())
    .executeTakeFirst();
  if (clash) throw new Error(`Class ${payload.classCode} already has a pool for ${payload.fiscalYearEnd}.`);

  return db
    .insertInto('ccaPools')
    .values({
      fiscalYearEnd: payload.fiscalYearEnd,
      classCode: payload.classCode.trim(),
      openingUccCents: payload.openingUccCents,
      additionsCents: payload.additionsCents,
      dispositionsCents: payload.dispositionsCents,
      availableForUseYear: payload.availableForUseYear,
      rateOverride: payload.rateOverride,
      claimCents: payload.claimCents,
      note: payload.note,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function ccaPoolDelete(id: number) {
  const db = getCurrentDb();
  await db.deleteFrom('ccaPools').where('id', '=', id).execute();
  return { deleted: true as const };
}

export async function ccaScheduleReport(input: unknown) {
  const { fiscalYearEnd } = input as { fiscalYearEnd: string };
  const db = getCurrentDb();
  const pools = await db.selectFrom('ccaPools').selectAll().where('fiscalYearEnd', '=', fiscalYearEnd).execute();
  const year = Number(fiscalYearEnd.slice(0, 4));
  const classes: CcaClassInput[] = pools.map((p) => ({
    code: p.classCode,
    openingUccCents: p.openingUccCents,
    additionsCents: p.additionsCents,
    dispositionsCents: p.dispositionsCents,
    rateOverride: p.rateOverride ?? undefined,
    claimCents: p.claimCents ?? undefined,
    availableForUseYear: p.availableForUseYear ?? year,
  }));
  const result = ccaSchedule(classes, fiscalYearEnd);
  // Carry the pool id through so the page can edit the row a figure came from.
  const idByClass = new Map(pools.map((p) => [p.classCode, p.id]));
  return { ...result, rows: result.rows.map((r) => ({ ...r, poolId: idByClass.get(r.code) ?? null })) };
}

/** Rolls every closing UCC into the opening UCC of the next year — the reason pools are stored at
 * all. Refuses to overwrite a year that already has pools, so running it twice is harmless. */
export async function ccaRollForward(input: unknown) {
  const { fromFiscalYearEnd, toFiscalYearEnd } = input as { fromFiscalYearEnd: string; toFiscalYearEnd: string };
  const db = getCurrentDb();

  const existing = await db.selectFrom('ccaPools').select('id').where('fiscalYearEnd', '=', toFiscalYearEnd).executeTakeFirst();
  if (existing) throw new Error(`${toFiscalYearEnd} already has CCA pools. Delete them first if you want to roll forward again.`);

  const previous = await ccaScheduleReport({ fiscalYearEnd: fromFiscalYearEnd });
  if (previous.rows.length === 0) throw new Error(`No CCA pools found for ${fromFiscalYearEnd}.`);

  const toYear = Number(toFiscalYearEnd.slice(0, 4));
  for (const row of previous.rows) {
    // A pool that closed at nothing has no assets left; carrying an empty class forward is clutter.
    if (row.closingUccCents === 0) continue;
    await db
      .insertInto('ccaPools')
      .values({
        fiscalYearEnd: toFiscalYearEnd,
        classCode: row.code,
        openingUccCents: row.closingUccCents,
        additionsCents: 0,
        dispositionsCents: 0,
        availableForUseYear: toYear,
        rateOverride: null,
        claimCents: null,
        note: null,
      })
      .execute();
  }
  return { created: previous.rows.filter((r) => r.closingUccCents !== 0).length };
}

export async function loansList() {
  const db = getCurrentDb();
  const rows = await db.selectFrom('loans').selectAll().orderBy('name').execute();
  return rows.map((r) => ({ ...r, isActive: Boolean(r.isActive) }));
}

export async function loanSave(input: unknown) {
  const payload = input as {
    id?: number;
    name: string;
    lender: string | null;
    principalCents: number;
    annualRate: number;
    frequency: string;
    numberOfPayments: number;
    compounding: string;
    startDate: string | null;
    liabilityAccountId: number | null;
    interestAccountId: number | null;
  };
  if (!payload.name?.trim()) throw new Error('Give the loan a name.');
  if (payload.principalCents <= 0) throw new Error('Enter the amount borrowed.');
  if (payload.numberOfPayments <= 0) throw new Error('Enter how many payments the loan runs for.');
  const db = getCurrentDb();

  const values = {
    name: payload.name.trim(),
    lender: payload.lender,
    principalCents: payload.principalCents,
    annualRate: payload.annualRate,
    frequency: payload.frequency,
    numberOfPayments: payload.numberOfPayments,
    compounding: payload.compounding,
    startDate: payload.startDate,
    liabilityAccountId: payload.liabilityAccountId,
    interestAccountId: payload.interestAccountId,
  };

  if (payload.id) {
    await db.updateTable('loans').set(values).where('id', '=', payload.id).execute();
    return db.selectFrom('loans').selectAll().where('id', '=', payload.id).executeTakeFirstOrThrow();
  }
  return db.insertInto('loans').values(values).returningAll().executeTakeFirstOrThrow();
}

export async function loanDelete(id: number) {
  const db = getCurrentDb();
  await db.deleteFrom('loans').where('id', '=', id).execute();
  return { deleted: true as const };
}

export async function loanScheduleReport(input: unknown) {
  const { loanId, overridePaymentCents } = input as { loanId: number; overridePaymentCents?: number };
  const db = getCurrentDb();
  const loan = await db.selectFrom('loans').selectAll().where('id', '=', loanId).executeTakeFirstOrThrow();
  const terms: LoanTerms = {
    principalCents: loan.principalCents,
    annualRate: loan.annualRate,
    frequency: loan.frequency as PaymentFrequency,
    numberOfPayments: loan.numberOfPayments,
    compounding: loan.compounding as LoanTerms['compounding'],
  };
  return { loan: { ...loan, isActive: Boolean(loan.isActive) }, ...amortizationSchedule(terms, overridePaymentCents) };
}


export async function budgetsList() {
  const db = getCurrentDb();
  const rows = await db.selectFrom('budgets').selectAll().orderBy('fiscalYearEnd', 'desc').execute();
  return rows.map((r) => ({ ...r, isActive: Boolean(r.isActive) }));
}

export async function budgetCreate(input: unknown) {
  const { name, fiscalYearEnd } = input as { name: string; fiscalYearEnd: string };
  if (!name?.trim()) throw new Error('Give the budget a name.');
  const db = getCurrentDb();
  const row = await db
    .insertInto('budgets')
    .values({ name: name.trim(), fiscalYearEnd, note: null })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { ...row, isActive: Boolean(row.isActive) };
}

export async function budgetDelete(id: number) {
  const db = getCurrentDb();
  await db.deleteFrom('budgets').where('id', '=', id).execute();
  return { deleted: true as const };
}

export async function budgetLinesList(input: unknown) {
  const { budgetId } = input as { budgetId: number };
  const db = getCurrentDb();
  return db.selectFrom('budgetLines').selectAll().where('budgetId', '=', budgetId).execute();
}

/** Sets one account's figure for one period. Zero deletes the row rather than storing it: a budget
 * of nothing and no budget at all mean the same thing, and keeping both makes the table grow with
 * rows that say nothing. */
export async function budgetLineSet(input: unknown) {
  const { budgetId, accountId, period, amountCents } = input as {
    budgetId: number;
    accountId: number;
    period: number;
    amountCents: number;
  };
  if (period < 1 || period > 12) throw new Error('Period must be between 1 and 12.');
  const db = getCurrentDb();

  const existing = await db
    .selectFrom('budgetLines')
    .select('id')
    .where('budgetId', '=', budgetId)
    .where('accountId', '=', accountId)
    .where('period', '=', period)
    .executeTakeFirst();

  if (amountCents === 0) {
    if (existing) await db.deleteFrom('budgetLines').where('id', '=', existing.id).execute();
    return { ok: true as const };
  }
  if (existing) {
    await db.updateTable('budgetLines').set({ amountCents }).where('id', '=', existing.id).execute();
  } else {
    await db.insertInto('budgetLines').values({ budgetId, accountId, period, amountCents }).execute();
  }
  return { ok: true as const };
}

/** Spreads one annual figure evenly across the twelve periods — a starting point, not an answer.
 * Rent really is flat; heating and sales are not, and the page says so. The remainder lands on the
 * first period so the twelve add back to exactly the annual figure. */
export async function budgetSpreadEvenly(input: unknown) {
  const { budgetId, accountId, annualCents } = input as { budgetId: number; accountId: number; annualCents: number };
  const perPeriod = Math.trunc(annualCents / 12);
  const remainder = annualCents - perPeriod * 12;
  for (let period = 1; period <= 12; period += 1) {
    await budgetLineSet({ budgetId, accountId, period, amountCents: period === 1 ? perPeriod + remainder : perPeriod });
  }
  return { ok: true as const };
}

export async function budgetVsActualReport(input: unknown) {
  const { budgetId, fiscalYearStart, periodStart, periodEnd } = input as {
    budgetId: number;
    fiscalYearStart: string;
    periodStart: string;
    periodEnd: string;
  };
  const db = getCurrentDb();
  const [accounts, entries, lines] = await Promise.all([
    getAllAccounts(db),
    getAllJournalEntriesWithLines(db),
    db.selectFrom('budgetLines').selectAll().where('budgetId', '=', budgetId).execute(),
  ]);
  return budgetVsActual(accounts, entries, lines, fiscalYearStart, periodStart, periodEnd);
}
