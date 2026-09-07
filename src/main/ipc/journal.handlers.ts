import { newJournalEntrySchema, setLineTaxCodeSchema, setManualHstSchema, updateJournalEntryDateSchema, updateJournalEntrySchema } from '@shared/validation/schemas';
import { validateJournalEntryForPosting, validateJournalEntryLines, isDateInLockedPeriod, postingLockWithReason } from '@shared/domain/ledger/postJournalEntry';
import { hasReconciledLines } from '@shared/domain/ledger/bankReconciliation';
import { findPossibleDuplicates, findEntryByReference, findMostRecentEntryByMemo } from '@shared/domain/journal/findPossibleDuplicates';
import { mostCommonTaxCodeForAccount } from '@shared/domain/journal/suggestTaxCodeForAccount';
import { getCurrentDb } from '../companyFile';
import type { AppDb } from '../db/schema';
import { diffJournalEntry } from '@shared/domain/ledger/journalEntryDiff';
import { bestContraAccount } from '@shared/domain/journal/suggestContraAccount';
import { getAllAccounts, getAllFiscalPeriods, getAllJournalEntriesWithLines, getJournalEntryById } from '../db/queries';
import { getAccessIdentity } from '../accessSession';
import { approvalBlockReason, canApprove, canTransitionApproval, initialApprovalStatus, type ApprovalStatus } from '@shared/domain/workflow/approvals';
import { getAccessRole } from '../accessSession';

export interface JournalListFilter {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  accountId?: number;
}

export async function journalList(filter?: JournalListFilter) {
  const db = getCurrentDb();
  let entries = await getAllJournalEntriesWithLines(db);
  if (filter?.dateFrom) entries = entries.filter((e) => e.entryDate >= filter.dateFrom!);
  if (filter?.dateTo) entries = entries.filter((e) => e.entryDate <= filter.dateTo!);
  if (filter?.status) entries = entries.filter((e) => e.status === filter.status);
  if (filter?.accountId !== undefined) {
    entries = entries.filter((e) => e.lines.some((l) => l.accountId === filter.accountId));
  }
  return entries.sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.id - a.id);
}

export async function journalGet(id: number, executor?: AppDb) {
  const db = executor ?? getCurrentDb();
  const entry = await getJournalEntryById(db, id);
  if (!entry) throw new Error(`Journal entry ${id} not found.`);
  return entry;
}

/** `executor`, when passed, is an outer caller's already-open transaction (e.g. billsCreate
 * posting its GL entry and inserting the bill row as one atomic unit) — the insert then runs
 * directly against it instead of opening a second, nested transaction, and the caller's rollback
 * covers this entry too if a later step in their flow fails. Called with no executor, it opens
 * its own transaction as before so standalone journal entry creation stays atomic on its own. */
export async function journalCreate(input: unknown, executor?: AppDb) {
  const payload = newJournalEntrySchema.parse(input);
  const db = executor ?? getCurrentDb();
  const accounts = await getAllAccounts(db);

  const structural = validateJournalEntryLines(payload.lines, accounts);
  if (!structural.ok) throw new Error(structural.error);
  // Read the threshold before any transaction opens: a second query on the outer connection from
  // inside a transaction would wait on itself.
  const journalThreshold = (await db.selectFrom('companyInfo').select('approvalJournalThresholdCents').where('id', '=', 1).executeTakeFirst())?.approvalJournalThresholdCents ?? null;
  const journalApprovalStatus = payload.source === 'manual' && !payload.reference ? initialApprovalStatus(payload.lines.reduce((t, l) => t + l.debitCents, 0), journalThreshold) : 'notRequired';

  async function insertEntry(trx: AppDb): Promise<number> {
    const entryRow = await trx
      .insertInto('journalEntries')
      .values({
        entryDate: payload.entryDate,
        memo: payload.memo ?? null,
        reference: payload.reference ?? null,
        status: 'draft',
        postedAt: null,
        createdBy: getAccessIdentity().name,
        approvalStatus: journalApprovalStatus,
        periodFrom: payload.periodFrom ?? null,
        periodTo: payload.periodTo ?? null,
        isAdjustingEntry: payload.isAdjustingEntry ? 1 : 0,
        source: payload.source,
        sourceReference: payload.sourceReference ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    for (const [i, line] of payload.lines.entries()) {
      await trx
        .insertInto('journalEntryLines')
        .values({
          journalEntryId: entryRow.id,
          accountId: line.accountId,
          debitCents: line.debitCents,
          creditCents: line.creditCents,
          description: line.description ?? null,
          lineOrder: i,
          taxCode: line.taxCode ?? null,
          manualHstCents: line.manualHstCents ?? null,
          baseCents: line.baseCents ?? null,
          vendorId: line.vendorId ?? null,
          customerId: line.customerId ?? null,
          foreignCurrency: line.foreignCurrency ?? null,
          foreignAmountCents: line.foreignAmountCents ?? null,
          exchangeRate: line.exchangeRate ?? null,
        })
        .execute();
    }
    return entryRow.id;
  }

  const insertedId = executor ? await insertEntry(executor) : await db.transaction().execute((trx) => insertEntry(trx));

  return journalGet(insertedId, executor ?? db);
}

/** See journalCreate's note on `executor` — same "join the caller's transaction if given one"
 * behavior, so "create the GL entry" and "post it" can be one atomic step with whatever the
 * caller does next (e.g. marking a bill paid). */
export async function journalPost(id: number, executor?: AppDb) {
  const db = executor ?? getCurrentDb();
  const entry = await journalGet(id, db);
  if (entry.status !== 'draft') {
    throw new Error(`Only draft entries can be posted (entry ${id} is ${entry.status}).`);
  }
  const approvalBlock = approvalBlockReason(entry.approvalStatus ?? 'notRequired', 'journal entry');
  if (approvalBlock) throw new Error(approvalBlock);

  const accounts = await getAllAccounts(db);
  const fiscalPeriods = await getAllFiscalPeriods(db);
  const validation = validateJournalEntryForPosting(
    { entryDate: entry.entryDate, lines: entry.lines },
    accounts,
    fiscalPeriods,
  );
  if (!validation.ok) throw new Error(validation.error);

  await db
    .updateTable('journalEntries')
    .set({ status: 'posted', postedAt: new Date().toISOString() })
    .where('id', '=', id)
    .execute();

  return journalGet(id, db);
}

/** True when an entry's corrections are worth reporting on: it came from somewhere else, so a
 * change to it is the accountant correcting supplied data rather than finishing their own. */
function isTracked(entry: { source?: string | null }): boolean {
  return (entry.source ?? 'manual') !== 'manual';
}

/** Writes a set of changes to the revision log. Used by every path that can alter an entry — not
 * only journalUpdate — because a posted entry is corrected through the narrower handlers below
 * (date, tax code, manual HST) or by being voided, and a report that missed those would quietly
 * under-report the year's adjustments. */
async function recordRevisions(
  executor: AppDb,
  journalEntryId: number,
  changes: { field: string; label: string; kind: string; oldValue: string | null; newValue: string | null; lineLabel?: string | null }[],
) {
  if (changes.length === 0) return;
  await executor
    .insertInto('journalEntryRevisions')
    .values(
      changes.map((c) => ({
        journalEntryId,
        field: c.field,
        label: c.label,
        kind: c.kind,
        oldValue: c.oldValue,
        newValue: c.newValue,
        lineLabel: c.lineLabel ?? null,
        changedBy: getAccessIdentity().name,
      })),
    )
    .execute();
}

/** Describes one line the way the revision log labels it, so a tax-code or HST change points at
 * the same line text the full diff would have produced. */
async function lineLabelFor(executor: AppDb, lineId: number): Promise<string | null> {
  const line = await executor.selectFrom('journalEntryLines').selectAll().where('id', '=', lineId).executeTakeFirst();
  if (!line) return null;
  const account = await executor.selectFrom('accounts').selectAll().where('id', '=', line.accountId).executeTakeFirst();
  const who = account ? account.name : 'Unknown account';
  const side = line.debitCents > 0 ? `Dr ${(line.debitCents / 100).toFixed(2)}` : `Cr ${(line.creditCents / 100).toFixed(2)}`;
  return `${who} — ${side}`;
}

export async function journalUpdate(input: unknown) {
  const { id, patch } = updateJournalEntrySchema.parse(input);
  const db = getCurrentDb();
  const entry = await journalGet(id);
  if (entry.status !== 'draft') {
    throw new Error(`Only draft entries can be edited (entry ${id} is ${entry.status}).`);
  }

  if (patch.lines) {
    const accounts = await getAllAccounts(db);
    const structural = validateJournalEntryLines(patch.lines, accounts);
    if (!structural.ok) throw new Error(structural.error);
  }

  // Snapshot before the write, so the change can be described afterwards. Only entries somebody
  // else supplied are tracked: recording every keystroke on an entry the accountant is still
  // drafting would bury the corrections that actually matter under their own typing.
  const trackChanges = isTracked(entry);
  const accountsForDiff = trackChanges ? await getAllAccounts(db) : [];

  await db.transaction().execute(async (trx) => {
    const headerPatch: Record<string, unknown> = {};
    if (patch.entryDate !== undefined) headerPatch.entryDate = patch.entryDate;
    if (patch.memo !== undefined) headerPatch.memo = patch.memo;
    if (patch.reference !== undefined) headerPatch.reference = patch.reference;
    if (patch.periodFrom !== undefined) headerPatch.periodFrom = patch.periodFrom;
    if (patch.periodTo !== undefined) headerPatch.periodTo = patch.periodTo;
    if (patch.isAdjustingEntry !== undefined) headerPatch.isAdjustingEntry = patch.isAdjustingEntry ? 1 : 0;
    if (Object.keys(headerPatch).length > 0) {
      await trx.updateTable('journalEntries').set(headerPatch).where('id', '=', id).execute();
    }

    if (patch.lines) {
      // Editing an entry rewrites its lines wholesale, which means new line ids — and the tag rows
      // pointing at the old ids are cascade-deleted with them. Without carrying them over, tagging
      // a draft and then saving it again would silently drop every tag, with nothing on screen to
      // say so. Matched by position, since patch lines carry no id of their own: a line that keeps
      // its place keeps its tags, and one inserted above them shifts them, which is visible and
      // correctable rather than silent.
      const priorTags = await trx
        .selectFrom('journalEntryLineTags')
        .innerJoin('journalEntryLines', 'journalEntryLines.id', 'journalEntryLineTags.journalEntryLineId')
        .select(['journalEntryLines.lineOrder as lineOrder', 'journalEntryLineTags.tagId as tagId'])
        .where('journalEntryLines.journalEntryId', '=', id)
        .execute();

      await trx.deleteFrom('journalEntryLines').where('journalEntryId', '=', id).execute();
      for (const [i, line] of patch.lines.entries()) {
        const inserted = await trx
          .insertInto('journalEntryLines')
          .values({
            journalEntryId: id,
            accountId: line.accountId,
            debitCents: line.debitCents,
            creditCents: line.creditCents,
            description: line.description ?? null,
            lineOrder: i,
            taxCode: line.taxCode ?? null,
            manualHstCents: line.manualHstCents ?? null,
            vendorId: line.vendorId ?? null,
            customerId: line.customerId ?? null,
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        const carried = priorTags.filter((t) => t.lineOrder === i);
        if (carried.length > 0) {
          await trx
            .insertInto('journalEntryLineTags')
            .values(carried.map((t) => ({ journalEntryLineId: inserted.id, tagId: t.tagId })))
            .execute();
        }
      }
    }
  });

  const updated = await journalGet(id);

  if (trackChanges) {
    await recordRevisions(db, id, diffJournalEntry(entry, updated, accountsForDiff));
  }

  return updated;
}

/** Every recorded change to entries that came from somewhere other than this app, newest first.
 * Feeds the Adjusting Entries report. */
export async function journalRevisions(input: unknown) {
  const { periodStart, periodEnd } = (input ?? {}) as { periodStart?: string; periodEnd?: string };
  const db = getCurrentDb();
  let query = db
    .selectFrom('journalEntryRevisions')
    .innerJoin('journalEntries', 'journalEntries.id', 'journalEntryRevisions.journalEntryId')
    .select([
      'journalEntryRevisions.id as id',
      'journalEntryRevisions.journalEntryId as journalEntryId',
      'journalEntryRevisions.changedAt as changedAt',
      'journalEntryRevisions.field as field',
      'journalEntryRevisions.label as label',
      'journalEntryRevisions.kind as kind',
      'journalEntryRevisions.oldValue as oldValue',
      'journalEntryRevisions.newValue as newValue',
      'journalEntryRevisions.lineLabel as lineLabel',
      'journalEntryRevisions.changedBy as changedBy',
      'journalEntries.entryDate as entryDate',
      'journalEntries.memo as memo',
      'journalEntries.reference as reference',
      'journalEntries.source as source',
      'journalEntries.sourceReference as sourceReference',
      'journalEntries.isAdjustingEntry as isAdjustingEntry',
      'journalEntries.status as status',
    ]);
  // Filtered on the ENTRY's date, not when the edit was made — the report is about a fiscal
  // period, and a March entry corrected in June belongs to March.
  if (periodStart) query = query.where('journalEntries.entryDate', '>=', periodStart);
  if (periodEnd) query = query.where('journalEntries.entryDate', '<=', periodEnd);
  const rows = await query.orderBy('journalEntries.entryDate', 'desc').orderBy('journalEntryRevisions.id', 'asc').execute();
  return rows.map((r) => ({ ...r, isAdjustingEntry: Boolean(r.isAdjustingEntry) }));
}

/** Corrects just the entry date — unlike journalUpdate, this works on posted entries too (not
 * only draft), since the date has no bearing on whether debits equal credits and doesn't touch
 * any account balance beyond which reporting period it lands in. Still blocked if either the old
 * or new date falls in a locked fiscal period, and if any line is already cleared in a bank
 * reconciliation — same protections journalVoid applies, since moving a cleared/reconciled entry's
 * date around would silently break that reconciliation's own date-range math. */
export async function journalUpdateDate(input: unknown) {
  const { id, entryDate } = updateJournalEntryDateSchema.parse(input);
  const db = getCurrentDb();
  const entry = await journalGet(id);

  const fiscalPeriods = await getAllFiscalPeriods(db);
  const lockedOld = isDateInLockedPeriod(entry.entryDate, fiscalPeriods);
  if (lockedOld) throw new Error(`Cannot change the date: fiscal period "${lockedOld.label}" (the current date) is locked.`);
  const lockedNew = isDateInLockedPeriod(entryDate, fiscalPeriods);
  if (lockedNew) throw new Error(`Cannot change the date: fiscal period "${lockedNew.label}" (the new date) is locked.`);
  if (hasReconciledLines(entry.lines)) {
    throw new Error('Cannot change the date: this entry has a line already cleared in a bank reconciliation.');
  }

  await db.updateTable('journalEntries').set({ entryDate }).where('id', '=', id).execute();
  // Works on posted entries, so this is one of the few ways a client-supplied entry legitimately
  // changes after posting — it belongs on the adjustments report like any other correction.
  if (isTracked(entry) && entry.entryDate !== entryDate) {
    await recordRevisions(db, id, [
      { field: 'entryDate', label: 'Date', kind: 'changed', oldValue: entry.entryDate, newValue: entryDate },
    ]);
  }
  return journalGet(id);
}

async function linkedBusinessDocument(id: number, db: AppDb): Promise<string | null> {
  const checks: [string, Promise<unknown>][] = [
    ['customer invoice', db.selectFrom('invoices').select('id').where('invoiceJournalEntryId', '=', id).executeTakeFirst()],
    ['customer invoice payment', db.selectFrom('invoicePayments').select('id').where('journalEntryId', '=', id).executeTakeFirst()],
    ['legacy customer invoice payment', db.selectFrom('invoices').select('id').where('paymentJournalEntryId', '=', id).executeTakeFirst()],
    ['vendor bill', db.selectFrom('bills').select('id').where('billJournalEntryId', '=', id).executeTakeFirst()],
    ['vendor bill payment', db.selectFrom('billPayments').select('id').where('journalEntryId', '=', id).executeTakeFirst()],
    ['legacy vendor bill payment', db.selectFrom('bills').select('id').where('paymentJournalEntryId', '=', id).executeTakeFirst()],
    ['sales receipt', db.selectFrom('salesReceipts').select('id').where('journalEntryId', '=', id).executeTakeFirst()],
    ['bank deposit', db.selectFrom('deposits').select('id').where('journalEntryId', '=', id).executeTakeFirst()],
    ['GST/HST filing', db.selectFrom('hstFilings').select('id').where('journalEntryId', '=', id).executeTakeFirst()],
    ['credit note', db.selectFrom('creditNotes').select('id').where('creditJournalEntryId', '=', id).executeTakeFirst()],
    ['credit-note refund', db.selectFrom('creditNotes').select('id').where('refundJournalEntryId', '=', id).executeTakeFirst()],
    ['T5 shareholder payment', db.selectFrom('t5Payments').select('id').where('journalEntryId', '=', id).executeTakeFirst()],
    ['payroll run', db.selectFrom('payrollRuns').select('id').where('journalEntryId', '=', id).executeTakeFirst()],
    ['mileage claim', db.selectFrom('mileageTrips').select('id').where('journalEntryId', '=', id).executeTakeFirst()],
    ['purchase-order goods receipt', db.selectFrom('purchaseOrderReceipts').select('id').where('journalEntryId', '=', id).executeTakeFirst()],
    ['inventory movement', db.selectFrom('inventoryMovements').select('id').where('journalEntryId', '=', id).executeTakeFirst()],
    ['receipt-inbox quick entry', db.selectFrom('receiptImports').select('id').where('journalEntryId', '=', id).executeTakeFirst()],
  ];
  const results = await Promise.all(checks.map(([, query]) => query));
  const index = results.findIndex(Boolean);
  return index < 0 ? null : checks[index][0];
}

export async function journalVoid(id: number, allowLockedOverride = false, executor?: AppDb, allowLinkedDocument = false) {
  const db = executor ?? getCurrentDb();
  if (!allowLinkedDocument) {
    const linked = await linkedBusinessDocument(id, db);
    if (linked) throw new Error(`This journal belongs to a ${linked}. Open the original document and use its Delete, Reverse, or Void action so the document and ledger stay together.`);
  }
  const entry = await journalGet(id, db);
  if (entry.status !== 'posted') {
    throw new Error(`Only posted entries can be voided (entry ${id} is ${entry.status}).`);
  }
  const fiscalPeriods = await getAllFiscalPeriods(db);
  const locked = isDateInLockedPeriod(entry.entryDate, fiscalPeriods);
  // A locked period is normally off-limits. The renderer surfaces an explicit "this may affect a
  // filed HST return — override?" confirmation and only then passes allowLockedOverride, so the
  // block still guards against accidental changes while letting a deliberate correction through.
  if (locked && !allowLockedOverride) throw new Error(`Cannot void: fiscal period "${locked.label}" is locked. Confirm the override to proceed.`);
  // Voiding is the mirror of posting: reversing an entry that carried GST/HST inside a filed
  // return restates the figures already sent to the CRA, exactly as posting a new one would.
  // Document deletes never pass the override, so an invoice inside a filed quarter has to go
  // through GST/HST Centre first; the journal screens offer the same deliberate override they do for
  // an accountant lock.
  const filedReturn = postingLockWithReason({ entryDate: entry.entryDate, lines: entry.lines }, await getAllAccounts(db), fiscalPeriods);
  if (filedReturn?.kind === 'hstFiling' && !allowLockedOverride) {
    throw new Error(`Cannot void: this entry carries GST/HST inside "${filedReturn.period.label}", which has already been filed. Reopen that return (void it from GST/HST Centre) before changing the tax it reports.`);
  }
  if (hasReconciledLines(entry.lines)) {
    throw new Error('Cannot void: this entry has a line already cleared in a bank reconciliation.');
  }

  await db.updateTable('journalEntries').set({ status: 'void' }).where('id', '=', id).execute();
  // Voiding is how a POSTED entry gets corrected — the entry is reversed and re-entered — so for
  // client-supplied data it is an adjustment in its own right, and the most significant kind. The
  // entry's total goes in the log so the report can show what was backed out without having to
  // re-read the voided lines.
  if (isTracked(entry)) {
    const totalCents = entry.lines.reduce((sum, l) => sum + l.debitCents, 0);
    await recordRevisions(db, id, [
      {
        field: 'status',
        label: 'Entry voided',
        kind: 'removed',
        oldValue: `Posted — ${(totalCents / 100).toFixed(2)}`,
        newValue: null,
      },
    ]);
  }
  return journalGet(id, db);
}

/** Immediate-post workflows (imports, transfers, opening balances) must not leave a hidden draft
 * if posting validation fails. Creation and posting share one transaction, so both commit or both
 * roll back. The full journal form deliberately keeps its separate Save Draft / Post actions. */
export async function journalCreateAndPost(input: unknown, executor?: AppDb) {
  const db = executor ?? getCurrentDb();
  return db.transaction().execute(async (trx) => {
    const draft = await journalCreate(input, trx);
    return journalPost(draft.id, trx);
  });
}

export async function journalDelete(id: number) {
  const db = getCurrentDb();
  const entry = await journalGet(id);
  // Draft: never affected any balance, so deleting it removes nothing that mattered. Void: was
  // reversed via journalVoid and already carries zero effect on every balance/report — deleting it
  // only removes the historical "this was entered then voided" record, not any financial figure.
  // A posted entry can never be deleted directly; it must be voided first.
  if (entry.status !== 'draft' && entry.status !== 'void') {
    throw new Error(`Only draft or voided entries can be deleted (entry ${id} is ${entry.status}). Void a posted entry first.`);
  }
  await db.deleteFrom('journalEntries').where('id', '=', id).execute();
  return { deleted: true };
}

export interface FindPossibleDuplicatesInput {
  entryDate: string;
  accountId: number;
  amountCents: number;
  excludeEntryId?: number;
}

/** A heads-up, not a gate — surfaces existing entries that look like they might be the same
 * transaction entered twice (same account, same amount, within a few days), so the reviewer can
 * double-check before saving. Never blocks the save itself; same-day identical amounts are a
 * normal occurrence in real bookkeeping. */
export async function journalFindPossibleDuplicates(input: unknown) {
  const { entryDate, accountId, amountCents, excludeEntryId } = input as FindPossibleDuplicatesInput;
  const db = getCurrentDb();
  const entries = await getAllJournalEntriesWithLines(db);
  return findPossibleDuplicates(entries, { entryDate, accountId, amountCents, excludeEntryId });
}

/** Looks up a posted entry by its exact reference tag — used to detect that a credit-card payment
 * being reviewed in Bank Import was already recorded from the other account (see
 * findEntryByReference's own doc comment for why an exact reference match is trustworthy where the
 * fuzzy account+amount+date duplicate check above is only a maybe). */
export async function journalFindByReference(reference: unknown) {
  const db = getCurrentDb();
  const entries = await getAllJournalEntriesWithLines(db);
  return findEntryByReference(entries, String(reference));
}

export interface FindRecentEntryByMemoInput {
  memo: string;
  excludeEntryId?: number;
}

/** The "repeat transaction" sensor — the reviewer typing a Memo that exactly matches a past posted
 * entry's memo (e.g. "Rent", the same recurring service fee) gets that entry's lines offered as a
 * one-click starting point. See findMostRecentEntryByMemo's own doc comment for why this is a
 * strict, not fuzzy, match. */
export async function journalFindRecentByMemo(input: unknown) {
  const { memo, excludeEntryId } = input as FindRecentEntryByMemoInput;
  const db = getCurrentDb();
  const entries = await getAllJournalEntriesWithLines(db);
  return findMostRecentEntryByMemo(entries, memo, excludeEntryId);
}

/** The tax-code half of the "auto-suggest" ask — see mostCommonTaxCodeForAccount's own doc comment. */
export async function journalSuggestTaxCodeForAccount(accountId: unknown) {
  const db = getCurrentDb();
  const entries = await getAllJournalEntriesWithLines(db);
  return mostCommonTaxCodeForAccount(entries, Number(accountId));
}

/** Links the accountant's hand-calculated HST amount to a 'Manual'-tagged line, so it flows into
 * the HST Payable totals instead of sitting excluded/pending forever. */
/** The account usually posted opposite this one, when this one is used on the given side. Null
 * when there is no settled habit — see bestContraAccount for the thresholds and why they exist. */
export async function journalSuggestContraAccount(input: unknown) {
  const { accountId, side } = input as { accountId: number; side: 'debit' | 'credit' };
  if (typeof accountId !== 'number' || (side !== 'debit' && side !== 'credit')) {
    throw new Error('accountId and side ("debit" or "credit") are required.');
  }
  const db = getCurrentDb();
  const entries = await getAllJournalEntriesWithLines(db);
  return bestContraAccount(entries, accountId, side);
}

export async function journalSetManualHst(input: unknown) {
  const { lineId, manualHstCents } = setManualHstSchema.parse(input);
  const db = getCurrentDb();

  const line = await db.selectFrom('journalEntryLines').selectAll().where('id', '=', lineId).executeTakeFirst();
  if (!line) throw new Error(`Journal entry line ${lineId} not found.`);
  if (line.taxCode !== 'Manual') {
    throw new Error('Only lines tagged "Manual HST" can have a manual HST amount entered.');
  }

  const entry = await journalGet(line.journalEntryId);
  await db.updateTable('journalEntryLines').set({ manualHstCents }).where('id', '=', lineId).execute();
  if (isTracked(entry) && (line.manualHstCents ?? null) !== manualHstCents) {
    await recordRevisions(db, line.journalEntryId, [
      {
        field: 'line.manualHstCents',
        label: 'Manual HST',
        kind: 'changed',
        oldValue: line.manualHstCents === null ? null : (line.manualHstCents / 100).toFixed(2),
        newValue: manualHstCents === null ? null : (manualHstCents / 100).toFixed(2),
        lineLabel: await lineLabelFor(db, lineId),
      },
    ]);
  }
  return journalGet(line.journalEntryId);
}

/** Retags a line's HST treatment (or clears it) independent of whether the parent entry is a
 * draft or already posted — this is purely informational metadata for HST reporting, so it isn't
 * gated behind the draft-only edit rules that protect the entry's actual debit/credit history.
 * Switching away from 'Manual' clears any manualHstCents so a stale linked amount can't survive
 * under a different tax code. */
export async function journalSetLineTaxCode(input: unknown) {
  const { lineId, taxCode } = setLineTaxCodeSchema.parse(input);
  const db = getCurrentDb();

  const line = await db.selectFrom('journalEntryLines').selectAll().where('id', '=', lineId).executeTakeFirst();
  if (!line) throw new Error(`Journal entry line ${lineId} not found.`);

  const entry = await journalGet(line.journalEntryId);
  const lineLabel = await lineLabelFor(db, lineId);
  await db
    .updateTable('journalEntryLines')
    .set({ taxCode, manualHstCents: taxCode === 'Manual' ? line.manualHstCents : null })
    .where('id', '=', lineId)
    .execute();
  if (isTracked(entry) && (line.taxCode ?? null) !== (taxCode ?? null)) {
    await recordRevisions(db, line.journalEntryId, [
      { field: 'line.taxCode', label: 'Tax code', kind: 'changed', oldValue: line.taxCode ?? null, newValue: taxCode ?? null, lineLabel },
    ]);
  }
  return journalGet(line.journalEntryId);
}

/** Approves or rejects a journal entry awaiting approval. Only administrators and accountants
 * may decide; a rejection needs a note so the preparer knows what to change. */
export async function journalSetApproval(input: unknown) {
  const { id, approvalStatus, note } = input as { id: number; approvalStatus: ApprovalStatus; note?: string | null };
  if (!canApprove(getAccessRole())) throw new Error('Only an administrator or accountant can approve or reject entries.');
  const db = getCurrentDb();
  const entry = await journalGet(id, db);
  if (!canTransitionApproval(entry.approvalStatus ?? 'notRequired', approvalStatus)) throw new Error(`This entry is ${entry.approvalStatus ?? 'not requiring approval'} and cannot be marked ${approvalStatus}.`);
  if (approvalStatus === 'rejected' && !note?.trim()) throw new Error('Say why the entry is rejected so the preparer can fix it.');
  const actor = getAccessIdentity().name;
  await db.updateTable('journalEntries').set({ approvalStatus, approvedBy: approvalStatus === 'approved' ? actor : null, approvedAt: approvalStatus === 'approved' ? new Date().toISOString() : null, approvalNote: note?.trim() || null }).where('id', '=', id).execute();
  return journalGet(id, db);
}
