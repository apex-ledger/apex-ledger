import { fileHstReturnSchema } from '@shared/validation/schemas';
import { computeHstSummary } from '@shared/domain/ledger/hstSummary';
import { buildHstFilingJournalLines, computeHstFilingFigures, hstFilingTimingError, periodsOverlap } from '@shared/domain/ledger/hstFiling';
import { getCurrentDb } from '../companyFile';
import { ensureGstHstAccountId } from '../db/buildTaxSplitLines';
import { ensureAccountByName } from '../db/ensureAccount';
import { getAllAccounts, getAllJournalEntriesWithLines } from '../db/queries';
import { mapHstFilingRow } from '../db/mappers';
import { journalCreate, journalPost, journalVoid } from './journal.handlers';
import { localIsoDate } from '@shared/domain/dates/localDate';

export async function hstFilingsList() {
  const db = getCurrentDb();
  const rows = await db.selectFrom('hstFilings').selectAll().orderBy('periodStart', 'desc').execute();
  return rows.map(mapHstFilingRow);
}

/** What a filing for this period WOULD post, without filing it — drives the confirmation screen so
 * the numbers on screen are the same ones the handler will use. */
export async function hstFilingsPreview(input: unknown) {
  const { periodStart, periodEnd } = fileHstReturnSchema.pick({ periodStart: true, periodEnd: true }).parse(input);
  const db = getCurrentDb();
  const accounts = await getAllAccounts(db);
  const entries = await getAllJournalEntriesWithLines(db);
  const summary = computeHstSummary(accounts, entries, periodStart, periodEnd);

  const collectedCents = summary.annual.reduce((sum, p) => sum + p.collectedCents, 0);
  const itcCents = summary.annual.reduce((sum, p) => sum + p.itcCents, 0);
  const pendingManualCount = summary.annual.reduce((sum, p) => sum + p.manualCount, 0);
  const taxableIncomeCents = summary.byAccount
    .filter((row) => row.direction === 'collected')
    .reduce((sum, row) => sum + row.baseAmountCents, 0);
  const taxablePurchasesCents = summary.byAccount
    .filter((row) => row.direction === 'itc')
    .reduce((sum, row) => sum + row.baseAmountCents, 0);

  const existing = await db.selectFrom('hstFilings').selectAll().execute();
  const overlapping = existing.filter((f) => periodsOverlap(periodStart, periodEnd, f.periodStart, f.periodEnd)).map(mapHstFilingRow);

  return {
    ...computeHstFilingFigures(collectedCents, itcCents),
    taxableIncomeCents,
    taxablePurchasesCents,
    /** Manual-HST lines in the period with no amount entered yet — they're excluded from the
     * totals, so filing before they're filled in under-reports. Surfaced, never blocking. */
    pendingManualCount,
    overlappingFilings: overlapping,
  };
}

/**
 * Files a GST/HST return: clears the period's GST/HST Payable against GST/HST Recoverable and
 * reclassifies the net to a filed CRA payable or refund receivable. Filing NEVER moves cash; the
 * later CRA payment/refund is a separate banking event with its own real transaction date.
 * Figures are recomputed here rather than trusted from the renderer.
 */
export async function hstFilingsCreate(input: unknown) {
  const payload = fileHstReturnSchema.parse(input);
  const db = getCurrentDb();

  if (payload.periodEnd < payload.periodStart) {
    throw new Error('The filing period ends before it starts.');
  }
  const timingError = hstFilingTimingError(payload.periodEnd, payload.filingDate, localIsoDate());
  if (timingError) throw new Error(timingError);

  const existing = await db.selectFrom('hstFilings').selectAll().execute();
  const clash = existing.find((f) => periodsOverlap(payload.periodStart, payload.periodEnd, f.periodStart, f.periodEnd));
  if (clash) {
    throw new Error(`${clash.periodStart} to ${clash.periodEnd} has already been filed — voiding that filing first is the way to re-file this period.`);
  }

  const accounts = await getAllAccounts(db);
  const entries = await getAllJournalEntriesWithLines(db);
  const summary = computeHstSummary(accounts, entries, payload.periodStart, payload.periodEnd);
  const figures = computeHstFilingFigures(
    summary.annual.reduce((sum, p) => sum + p.collectedCents, 0),
    summary.annual.reduce((sum, p) => sum + p.itcCents, 0),
  );

  const gstHstPayableAccountId = await ensureGstHstAccountId(db, 'payable');
  const gstHstRecoverableAccountId = await ensureGstHstAccountId(db, 'recoverable');
  const filedPayableAccountId = await ensureAccountByName(db, 'GST/HST Filed Payable', 'Liability', '2285', '2680', 'Current Liability');
  const refundReceivableAccountId = await ensureAccountByName(db, 'GST/HST Refund Receivable', 'Asset', '1255', '1066', 'Current Asset');
  const periodLabel = `${payload.periodStart} to ${payload.periodEnd}`;

  const lines = buildHstFilingJournalLines(
    figures,
    { gstHstPayableAccountId, gstHstRecoverableAccountId, filedPayableAccountId, refundReceivableAccountId },
    periodLabel,
  );

  const inserted = await db.transaction().execute(async (trx) => {
    const entry = await journalCreate(
      {
        entryDate: payload.filingDate,
        memo: payload.memo ?? `GST/HST return filed — ${periodLabel}`,
        reference: `HST-${payload.periodStart}`,
        lines,
      },
      trx,
    );
    const posted = await journalPost(entry.id, trx);
    const lockedPeriod = await trx.insertInto('fiscalPeriods').values({ periodStart: payload.periodStart, periodEnd: payload.periodEnd, label: `GST/HST filed — ${periodLabel}`, isLocked: 1, lockedAt: new Date().toISOString() }).returning('id').executeTakeFirstOrThrow();

    return trx
      .insertInto('hstFilings')
      .values({
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        filingDate: payload.filingDate,
        collectedCents: figures.collectedCents,
        itcCents: figures.itcCents,
        netPayableCents: figures.netPayableCents,
        // Historical column retained for schema compatibility. Filing no longer moves cash.
        paymentAccountId: null,
        journalEntryId: posted.id,
        fiscalPeriodId: lockedPeriod.id,
        memo: payload.memo,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  });

  return mapHstFilingRow(inserted);
}

/** Voids a filing's GL entry and removes the record, reopening the period for re-filing — the way
 * to correct a return filed on the wrong period or before late entries were booked. */
export async function hstFilingsVoid(id: number) {
  const db = getCurrentDb();
  const filing = await db.selectFrom('hstFilings').selectAll().where('id', '=', id).executeTakeFirst();
  if (!filing) throw new Error(`GST/HST filing ${id} not found.`);

  await db.transaction().execute(async (trx) => {
    if (filing.fiscalPeriodId !== null) await trx.deleteFrom('fiscalPeriods').where('id', '=', filing.fiscalPeriodId).execute();
    if (filing.journalEntryId !== null) await journalVoid(filing.journalEntryId, false, trx, true);
    await trx.deleteFrom('hstFilings').where('id', '=', id).execute();
  });
  return mapHstFilingRow(filing);
}
