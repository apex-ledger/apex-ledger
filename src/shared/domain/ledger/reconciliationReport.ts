import type { Account, BankReconciliation, JournalEntry } from '../types';

/** The reconciliation report: the page that proves the bank and the books agree.
 *
 * The reconciliation SCREEN is where the ticking happens. This is the statement of the result, and
 * it is a different artefact — it is what gets printed, filed, and handed to whoever asks how the
 * bank balance was proved. Without it the work is done but leaves no evidence behind.
 *
 * The shape is the standard one, and it runs from the bank's number to the books' number rather
 * than the other way round: the statement is the fact, and the difference is what the business
 * knows that the bank does not yet.
 *
 *   statement closing balance
 *   + deposits recorded but not yet on the statement
 *   − cheques written but not yet cashed
 *   = the balance the books should show
 */

export interface OutstandingItem {
  entryId: number;
  entryDate: string;
  /** When the entry was keyed in (stored UTC) — the Entered column beside Date. */
  createdAt?: string;
  description: string;
  amountCents: number;
}

export interface ReconciliationReportResult {
  reconciliationId: number;
  accountId: number;
  accountName: string;
  statementDate: string;
  statementOpeningCents: number;
  statementClosingCents: number;
  /** Money in that the bank has not shown yet. */
  outstandingDeposits: OutstandingItem[];
  outstandingDepositsCents: number;
  /** Cheques and payments written but not yet presented. */
  outstandingPayments: OutstandingItem[];
  outstandingPaymentsCents: number;
  /** statement + deposits − payments: what the books ought to say. */
  adjustedBalanceCents: number;
  /** What the books actually say at the statement date. */
  bookBalanceCents: number;
  /** adjustedBalance − bookBalance. Zero when the account is reconciled. */
  differenceCents: number;
  isReconciled: boolean;
  clearedCount: number;
  completedAt: string | null;
}

export function reconciliationReport(
  reconciliation: BankReconciliation,
  account: Account,
  entries: JournalEntry[],
): ReconciliationReportResult {
  let bookBalanceCents = 0;
  let clearedCount = 0;
  const outstandingDeposits: OutstandingItem[] = [];
  const outstandingPayments: OutstandingItem[] = [];

  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    // Everything up to the statement date counts towards the book balance. Anything after it is
    // next month's problem and belongs on the next reconciliation, not this one.
    if (entry.entryDate > reconciliation.statementDate) continue;

    for (const line of entry.lines) {
      if (line.accountId !== account.id) continue;
      const amountCents = line.debitCents - line.creditCents;
      bookBalanceCents += amountCents;

      if (line.clearedAt) {
        clearedCount += 1;
        continue;
      }

      // Not ticked off: the business has recorded it, the bank has not seen it.
      const item: OutstandingItem = {
        entryId: entry.id,
        entryDate: entry.entryDate,
        createdAt: entry.createdAt,
        description: line.description ?? entry.memo ?? entry.reference ?? '—',
        amountCents: Math.abs(amountCents),
      };
      if (amountCents > 0) outstandingDeposits.push(item);
      else if (amountCents < 0) outstandingPayments.push(item);
    }
  }

  const byDate = (a: OutstandingItem, b: OutstandingItem) => a.entryDate.localeCompare(b.entryDate) || a.entryId - b.entryId;
  outstandingDeposits.sort(byDate);
  outstandingPayments.sort(byDate);

  const outstandingDepositsCents = outstandingDeposits.reduce((sum, i) => sum + i.amountCents, 0);
  const outstandingPaymentsCents = outstandingPayments.reduce((sum, i) => sum + i.amountCents, 0);
  const adjustedBalanceCents = reconciliation.endingBalanceCents + outstandingDepositsCents - outstandingPaymentsCents;
  const differenceCents = adjustedBalanceCents - bookBalanceCents;

  return {
    reconciliationId: reconciliation.id,
    accountId: account.id,
    accountName: account.name,
    statementDate: reconciliation.statementDate,
    statementOpeningCents: reconciliation.startingBalanceCents,
    statementClosingCents: reconciliation.endingBalanceCents,
    outstandingDeposits,
    outstandingDepositsCents,
    outstandingPayments,
    outstandingPaymentsCents,
    adjustedBalanceCents,
    bookBalanceCents,
    differenceCents,
    isReconciled: differenceCents === 0,
    clearedCount,
    completedAt: reconciliation.completedAt,
  };
}

/** How long an outstanding item has been sitting there, in days.
 *
 * A cheque outstanding for six months is usually stale-dated and needs reversing rather than
 * waiting for; one outstanding for six days is simply in the post. The report flags the former
 * because it is the thing a reviewer is looking for and the thing nobody notices. */
export function daysOutstanding(item: OutstandingItem, asOfDate: string): number {
  const from = Date.parse(`${item.entryDate}T00:00:00Z`);
  const to = Date.parse(`${asOfDate}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/** Six months is the point at which a Canadian bank will normally refuse a cheque as stale-dated. */
export const STALE_DAYS = 180;
