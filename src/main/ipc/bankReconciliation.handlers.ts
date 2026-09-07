import { completeBankReconciliationSchema, startBankReconciliationSchema, toggleReconciliationLineSchema } from '@shared/validation/schemas';
import { computeClearedBalanceCents, computeDifferenceCents, defaultStartingBalanceCents } from '@shared/domain/ledger/bankReconciliation';
import type { BankReconciliation } from '@shared/domain/types';
import { getCurrentDb } from '../companyFile';
import {
  getAllAccounts,
  getAllBankReconciliations,
  getBankReconciliationById,
  getClearedLinesForReconciliation,
  getLatestCompletedReconciliation,
  getUnclearedPostedLinesForAccount,
  type ReconciliationCandidateLine,
} from '../db/queries';

export interface BankReconciliationDetail {
  reconciliation: BankReconciliation;
  clearedLines: ReconciliationCandidateLine[];
  unclearedLines: ReconciliationCandidateLine[];
  clearedBalanceCents: number;
  differenceCents: number;
}

export async function bankReconciliationList(accountId?: number) {
  const db = getCurrentDb();
  return getAllBankReconciliations(db, accountId);
}

async function bankReconciliationGetInternal(id: number): Promise<BankReconciliationDetail> {
  const db = getCurrentDb();
  const reconciliation = await getBankReconciliationById(db, id);
  if (!reconciliation) throw new Error(`Bank reconciliation ${id} not found.`);

  const accounts = await getAllAccounts(db);
  const account = accounts.find((a) => a.id === reconciliation.accountId);
  if (!account) throw new Error(`Account ${reconciliation.accountId} not found.`);

  const clearedLines = await getClearedLinesForReconciliation(db, id);
  const unclearedLines =
    reconciliation.status === 'in_progress' ? await getUnclearedPostedLinesForAccount(db, reconciliation.accountId, reconciliation.statementDate) : [];

  const clearedBalanceCents = computeClearedBalanceCents(
    reconciliation.startingBalanceCents,
    clearedLines.map((c) => c.line),
    account.normalBalance,
  );
  const differenceCents = computeDifferenceCents(clearedBalanceCents, reconciliation.endingBalanceCents);

  return { reconciliation, clearedLines, unclearedLines, clearedBalanceCents, differenceCents };
}

export async function bankReconciliationGet(id: number) {
  return bankReconciliationGetInternal(id);
}

/** Starts a new reconciliation for this account, defaulting the starting balance to the previous
 * completed reconciliation's ending balance (or zero for the account's first ever statement) so
 * consecutive statements chain together. */
export async function bankReconciliationStart(input: unknown) {
  const payload = startBankReconciliationSchema.parse(input);
  const db = getCurrentDb();

  const inserted = await db.transaction().execute(async (trx) => {
    const account = await trx.selectFrom('accounts').select(['id', 'accountType', 'isActive']).where('id', '=', payload.accountId).executeTakeFirst();
    if (!account || !account.isActive || (account.accountType !== 'Asset' && account.accountType !== 'Liability')) {
      throw new Error('Reconciliation requires an active bank, cash, or credit-card account.');
    }
    const open = await trx.selectFrom('bankReconciliations').select(['id', 'statementDate']).where('accountId', '=', payload.accountId).where('status', '=', 'in_progress').executeTakeFirst();
    if (open) throw new Error(`This account already has a ${open.statementDate} reconciliation in progress. Resume or abandon it first.`);
    const previous = await getLatestCompletedReconciliation(trx, payload.accountId);
    if (previous && payload.statementDate <= previous.statementDate) {
      throw new Error(`Statement date must be after the latest completed reconciliation (${previous.statementDate}).`);
    }
    const startingBalanceCents = defaultStartingBalanceCents(previous);

    return trx
      .insertInto('bankReconciliations')
      .values({
        accountId: payload.accountId,
        statementDate: payload.statementDate,
        startingBalanceCents,
        endingBalanceCents: payload.endingBalanceCents,
        status: 'in_progress',
        completedAt: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  });

  return bankReconciliationGetInternal(inserted.id);
}

/** Ticks (or unticks) a single line's cleared state. Only lines on the reconciliation's own
 * account can be toggled, and only while the reconciliation is still in progress. */
export async function bankReconciliationToggleLine(input: unknown) {
  const payload = toggleReconciliationLineSchema.parse(input);
  const db = getCurrentDb();

  const reconciliation = await getBankReconciliationById(db, payload.reconciliationId);
  if (!reconciliation) throw new Error(`Bank reconciliation ${payload.reconciliationId} not found.`);
  if (reconciliation.status !== 'in_progress') throw new Error('This reconciliation is already completed.');

  const line = await db.selectFrom('journalEntryLines').selectAll().where('id', '=', payload.lineId).executeTakeFirst();
  if (!line) throw new Error(`Journal entry line ${payload.lineId} not found.`);
  if (line.accountId !== reconciliation.accountId) throw new Error("This line does not belong to the reconciliation's account.");

  if (payload.cleared) {
    if (line.reconciliationId !== null && line.reconciliationId !== reconciliation.id) {
      throw new Error('This line is already cleared against a different reconciliation.');
    }
    await db
      .updateTable('journalEntryLines')
      .set({ clearedAt: new Date().toISOString(), reconciliationId: reconciliation.id })
      .where('id', '=', payload.lineId)
      .execute();
  } else {
    await db.updateTable('journalEntryLines').set({ clearedAt: null, reconciliationId: null }).where('id', '=', payload.lineId).execute();
  }

  return bankReconciliationGetInternal(reconciliation.id);
}

/** Locks in the reconciliation once the cleared balance matches the statement ending balance
 * exactly — recomputed server-side so a stale client can't force a mismatched finish through. */
export async function bankReconciliationComplete(input: unknown) {
  const { id } = completeBankReconciliationSchema.parse(input);
  const db = getCurrentDb();

  const detail = await bankReconciliationGetInternal(id);
  if (detail.reconciliation.status !== 'in_progress') throw new Error('This reconciliation is already completed.');
  if (detail.differenceCents !== 0) {
    throw new Error(`Cannot finish: cleared balance differs from the statement ending balance by ${detail.differenceCents} cents.`);
  }

  await db.updateTable('bankReconciliations').set({ status: 'completed', completedAt: new Date().toISOString() }).where('id', '=', id).execute();
  return bankReconciliationGetInternal(id);
}

/** Reopens only the latest statement for an account. A later reconciliation chains its starting
 * balance from this one's ending balance, so reopening an older one would invalidate that chain. */
export async function bankReconciliationReopen(id: number) {
  const db = getCurrentDb();
  const reconciliation = await getBankReconciliationById(db, id);
  if (!reconciliation) throw new Error(`Bank reconciliation ${id} not found.`);
  if (reconciliation.status !== 'completed') throw new Error('Only a completed reconciliation can be reopened.');
  const all = await getAllBankReconciliations(db, reconciliation.accountId);
  const later = all.find((row) => row.id !== id && (row.statementDate > reconciliation.statementDate || (row.statementDate === reconciliation.statementDate && row.id > id)));
  if (later) throw new Error(`Reopen the later ${later.statementDate} reconciliation first so statement balances remain chained correctly.`);

  await db.updateTable('bankReconciliations').set({ status: 'in_progress', completedAt: null }).where('id', '=', id).execute();
  return bankReconciliationGetInternal(id);
}

/** Cancels only unfinished work. Cleared marks owned by this reconciliation and its header are
 * removed together so the account is immediately ready for the correct statement. */
export async function bankReconciliationAbandon(id: number) {
  const db = getCurrentDb();
  const reconciliation = await getBankReconciliationById(db, id);
  if (!reconciliation) throw new Error(`Bank reconciliation ${id} not found.`);
  if (reconciliation.status !== 'in_progress') throw new Error('A completed reconciliation must be reopened before it can be abandoned.');
  await db.transaction().execute(async (trx) => {
    await trx.updateTable('journalEntryLines').set({ clearedAt: null, reconciliationId: null }).where('reconciliationId', '=', id).execute();
    await trx.deleteFrom('bankReconciliations').where('id', '=', id).execute();
  });
  return { abandoned: true as const };
}
