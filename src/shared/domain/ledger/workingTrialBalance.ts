import type { Account, JournalEntry } from '../types';
import { computeAccountBalances, filterEntriesByDateRange } from './computeAccountBalances';

/** The working trial balance: opening balance, the period's movement, the adjustments made to it,
 * and the closing balance — every account on one sheet.
 *
 * This is the page an accountant actually works from at year end. The plain trial balance gives
 * closing balances only, which answers "what does it say now" but not "what did I change to get
 * here" — and the second question is the whole of a year-end file review.
 *
 * Adjustments are shown as a column of their own AND are already inside the closing balance, the
 * same convention the Balance Sheet's adjusting-entries view uses. The unadjusted column is derived
 * by subtraction rather than computed separately, so the two can never disagree.
 */

export interface WorkingTrialBalanceRow {
  account: Account;
  /** Balance brought forward from before the period, signed to the account's normal direction. */
  openingCents: number;
  /** The period's movement excluding adjusting entries. */
  movementCents: number;
  /** The part of the period's movement contributed by entries flagged as adjusting. */
  adjustmentCents: number;
  /** opening + movement — what the books said before the accountant touched them. */
  unadjustedCents: number;
  /** opening + movement + adjustments. */
  closingCents: number;
  /** Closing balance split into the columns a trial balance prints. */
  closingDebitCents: number;
  closingCreditCents: number;
}

export interface WorkingTrialBalanceResult {
  periodStart: string;
  periodEnd: string;
  rows: WorkingTrialBalanceRow[];
  totalOpeningCents: number;
  totalMovementCents: number;
  totalAdjustmentCents: number;
  totalClosingDebitCents: number;
  totalClosingCreditCents: number;
  /** Debits equal credits at the close. Holds by construction for a set of balanced entries; still
   * checked, because a trial balance that silently did not balance would be worse than useless. */
  isBalanced: boolean;
}

export function workingTrialBalance(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart: string,
  periodEnd: string,
): WorkingTrialBalanceResult {
  const priorEntries = entries.filter((e) => e.entryDate < periodStart);
  const periodEntries = filterEntriesByDateRange(entries, periodStart, periodEnd);
  const adjustingEntries = periodEntries.filter((e) => e.isAdjustingEntry);
  const ordinaryEntries = periodEntries.filter((e) => !e.isAdjustingEntry);

  const opening = computeAccountBalances(accounts, priorEntries);
  const movement = computeAccountBalances(accounts, ordinaryEntries);
  const adjustment = computeAccountBalances(accounts, adjustingEntries);

  const rows: WorkingTrialBalanceRow[] = [];
  for (const account of accounts) {
    const openingCents = opening.get(account.id)?.balanceCents ?? 0;
    const movementCents = movement.get(account.id)?.balanceCents ?? 0;
    const adjustmentCents = adjustment.get(account.id)?.balanceCents ?? 0;
    const closingCents = openingCents + movementCents + adjustmentCents;

    // An account never touched is noise on a sheet that already runs to several pages. Judged on
    // whether anything was POSTED to it, not on whether the net figures are zero: an account that
    // went up 100 and back down 100 nets to nothing but was used all year, and dropping it would
    // hide activity an accountant is reviewing the year to find.
    const movedInPeriod =
      (movement.get(account.id)?.debitCents ?? 0) +
        (movement.get(account.id)?.creditCents ?? 0) +
        (adjustment.get(account.id)?.debitCents ?? 0) +
        (adjustment.get(account.id)?.creditCents ?? 0) >
      0;
    if (openingCents === 0 && !movedInPeriod) continue;

    rows.push({
      account,
      openingCents,
      movementCents,
      adjustmentCents,
      unadjustedCents: openingCents + movementCents,
      closingCents,
      closingDebitCents: account.normalBalance === 'Debit' ? Math.max(closingCents, 0) : Math.max(-closingCents, 0),
      closingCreditCents: account.normalBalance === 'Credit' ? Math.max(closingCents, 0) : Math.max(-closingCents, 0),
    });
  }

  rows.sort((a, b) => a.account.code.localeCompare(b.account.code));

  const totalClosingDebitCents = rows.reduce((sum, r) => sum + r.closingDebitCents, 0);
  const totalClosingCreditCents = rows.reduce((sum, r) => sum + r.closingCreditCents, 0);

  return {
    periodStart,
    periodEnd,
    rows,
    totalOpeningCents: rows.reduce((sum, r) => sum + r.openingCents, 0),
    totalMovementCents: rows.reduce((sum, r) => sum + r.movementCents, 0),
    totalAdjustmentCents: rows.reduce((sum, r) => sum + r.adjustmentCents, 0),
    totalClosingDebitCents,
    totalClosingCreditCents,
    isBalanced: totalClosingDebitCents === totalClosingCreditCents,
  };
}
