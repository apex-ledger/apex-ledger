import type { BankReconciliation, JournalEntryLine, NormalBalance } from '../types';

/**
 * The book balance implied by a starting balance plus every line the accountant has ticked
 * "cleared" so far. For a Debit-normal account (a real bank account, an Asset) debits increase
 * the balance; for a Credit-normal account (a credit card, a Liability) credits do, matching how
 * the statement's own ending balance is reported as a positive amount either way.
 */
export function computeClearedBalanceCents(
  startingBalanceCents: number,
  clearedLines: Pick<JournalEntryLine, 'debitCents' | 'creditCents'>[],
  normalBalance: NormalBalance,
): number {
  const netCents = clearedLines.reduce((sum, l) => sum + (l.debitCents - l.creditCents), 0);
  return normalBalance === 'Debit' ? startingBalanceCents + netCents : startingBalanceCents - netCents;
}

/** Zero once every transaction on the real statement has been ticked off — the gate for
 * "Finish" on a reconciliation. */
export function computeDifferenceCents(clearedBalanceCents: number, statementEndingBalanceCents: number): number {
  return clearedBalanceCents - statementEndingBalanceCents;
}

/** A new reconciliation picks up where the last completed one on this account left off, so
 * consecutive statements chain together instead of each starting from zero. */
export function defaultStartingBalanceCents(previousCompleted: BankReconciliation | undefined): number {
  return previousCompleted?.endingBalanceCents ?? 0;
}

/** Guards journalVoid: once a line has cleared a completed reconciliation it's effectively
 * permanent — voiding it would silently break a statement that's already been signed off on. */
export function hasReconciledLines(lines: Pick<JournalEntryLine, 'clearedAt'>[]): boolean {
  return lines.some((l) => l.clearedAt !== null);
}
