import type { Account, JournalEntry } from '../types';
import { computeAccountBalances, filterEntriesByDateRange } from './computeAccountBalances';

/**
 * A working trial balance — the year-end review sheet an accountant actually works from, which is
 * what QuickBooks Online Accountant calls "Workpapers". The plain Trial Balance report answers
 * "what are the balances"; this answers "which balances moved, by how much, and have I signed off
 * on them yet".
 *
 * Three things make it a workpaper rather than a report:
 *  - prior-period comparison, so an unexpected swing is visible without pulling a second report
 *  - the adjusting-entry portion broken out, so pre-adjustment and post-adjustment balances can be
 *    read side by side (the same split buildSection already supports for statements)
 *  - a per-account review state that lives outside the ledger (see the workpaper_accounts table),
 *    because "I've checked this account" is a fact about the review, not about the books
 */
export type WorkpaperReviewStatus = 'pending' | 'reviewed' | 'query';

export interface WorkpaperRow {
  account: Account;
  /** Signed balance in the account's own normal-balance direction (debit-normal accounts positive
   * when debit-heavy), so a comparison against the prior period is apples-to-apples. */
  currentCents: number;
  priorCents: number;
  changeCents: number;
  /** Null when the prior balance was zero — a percentage change from nothing is meaningless, and
   * showing "∞" or "100%" in a review column invites the wrong conclusion. */
  changePercent: number | null;
  /** The portion of currentCents contributed by entries flagged as adjusting. */
  adjustingCents: number;
  /** currentCents less the adjusting portion — the balance as the books stood before year-end
   * adjustments, which is the figure a reviewer ties back to source documents. */
  preAdjustmentCents: number;
  debitCents: number;
  creditCents: number;
}

export interface WorkpaperTrialBalance {
  periodEnd: string;
  priorPeriodEnd: string;
  rows: WorkpaperRow[];
  totalDebitCents: number;
  totalCreditCents: number;
  isBalanced: boolean;
}

/** Same one-year-back convention QBO's workpapers default to. Handles Feb 29 by letting the Date
 * constructor normalize (2028-02-29 minus a year becomes 2027-03-01, not an invalid date). */
export function priorPeriodEndFor(periodEnd: string): string {
  const [year, month, day] = periodEnd.split('-').map(Number);
  const prior = new Date(Date.UTC(year - 1, month - 1, day));
  return prior.toISOString().slice(0, 10);
}

function signedBalance(account: Account, balanceCents: number): number {
  // computeAccountBalances already returns each balance in its account's normal direction, so this
  // is just a named pass-through — kept explicit so the intent survives future refactors.
  return balanceCents;
}

export function buildWorkpaperTrialBalance(
  accounts: Account[],
  entries: JournalEntry[],
  periodEnd: string,
  priorPeriodEnd: string = priorPeriodEndFor(periodEnd),
): WorkpaperTrialBalance {
  const current = filterEntriesByDateRange(entries, undefined, periodEnd);
  const prior = filterEntriesByDateRange(entries, undefined, priorPeriodEnd);
  const adjustingOnly = current.filter((e: JournalEntry) => e.isAdjustingEntry);

  const currentBalances = computeAccountBalances(accounts, current);
  const priorBalances = computeAccountBalances(accounts, prior);
  const adjustingBalances = computeAccountBalances(accounts, adjustingOnly);

  let totalDebitCents = 0;
  let totalCreditCents = 0;

  const rows: WorkpaperRow[] = accounts
    .map((account) => {
      const currentCents = signedBalance(account, currentBalances.get(account.id)?.balanceCents ?? 0);
      const priorCents = signedBalance(account, priorBalances.get(account.id)?.balanceCents ?? 0);
      const adjustingCents = signedBalance(account, adjustingBalances.get(account.id)?.balanceCents ?? 0);
      const changeCents = currentCents - priorCents;

      // A trial balance presents each balance on its natural side. Debit-normal accounts with a
      // negative balance (a bank account overdrawn, say) legitimately sit on the credit side.
      const isDebitNormal = account.normalBalance === 'Debit';
      const onDebitSide = isDebitNormal ? currentCents >= 0 : currentCents < 0;
      const debitCents = onDebitSide ? Math.abs(currentCents) : 0;
      const creditCents = onDebitSide ? 0 : Math.abs(currentCents);
      totalDebitCents += debitCents;
      totalCreditCents += creditCents;

      return {
        account,
        currentCents,
        priorCents,
        changeCents,
        changePercent: priorCents === 0 ? null : (changeCents / Math.abs(priorCents)) * 100,
        adjustingCents,
        preAdjustmentCents: currentCents - adjustingCents,
        debitCents,
        creditCents,
      };
    })
    // Accounts with nothing in either period aren't part of the review. One that went to zero this
    // period IS — a balance disappearing is exactly what a reviewer needs to see.
    .filter((row) => row.currentCents !== 0 || row.priorCents !== 0)
    .sort((a, b) => a.account.code.localeCompare(b.account.code));

  return {
    periodEnd,
    priorPeriodEnd,
    rows,
    totalDebitCents,
    totalCreditCents,
    isBalanced: totalDebitCents === totalCreditCents,
  };
}

export interface WorkpaperGroup {
  label: string;
  rows: WorkpaperRow[];
  currentTotalCents: number;
  priorTotalCents: number;
  changeCents: number;
  changePercent: number | null;
  adjustingTotalCents: number;
}

/**
 * The sheet split the way a reviewer reads it: a balance-sheet block and a profit-and-loss block,
 * each grouped by account type with its own totals — rather than one flat list of accounts. Mirrors
 * how QuickBooks Online Accountant lays its workpapers out, and how a set of statements is
 * structured, so a reviewer can tick off a whole section and see it total correctly.
 */
export interface WorkpaperStatements {
  balanceSheet: WorkpaperGroup[];
  profitAndLoss: WorkpaperGroup[];
  /** Assets − (Liabilities + Equity) at the period end. Non-zero means the books don't balance. */
  balanceSheetDifferenceCents: number;
  netIncomeCurrentCents: number;
  netIncomePriorCents: number;
}

function group(label: string, rows: WorkpaperRow[]): WorkpaperGroup {
  const currentTotalCents = rows.reduce((sum, r) => sum + r.currentCents, 0);
  const priorTotalCents = rows.reduce((sum, r) => sum + r.priorCents, 0);
  const changeCents = currentTotalCents - priorTotalCents;
  return {
    label,
    rows,
    currentTotalCents,
    priorTotalCents,
    changeCents,
    changePercent: priorTotalCents === 0 ? null : (changeCents / Math.abs(priorTotalCents)) * 100,
    adjustingTotalCents: rows.reduce((sum, r) => sum + r.adjustingCents, 0),
  };
}

export function groupWorkpaperRows(trialBalance: WorkpaperTrialBalance): WorkpaperStatements {
  const byType = (type: string) => trialBalance.rows.filter((r) => r.account.accountType === type);

  const assets = group('Assets', byType('Asset'));
  const liabilities = group('Liabilities', byType('Liability'));
  const equity = group('Equity', byType('Equity'));
  const income = group('Income', byType('Revenue'));
  const expenses = group('Expenses', byType('Expense'));

  return {
    balanceSheet: [assets, liabilities, equity],
    profitAndLoss: [income, expenses],
    // Retained earnings for the current period aren't posted until closing entries, so the
    // difference is expected to equal net income until the year is closed — surfaced rather than
    // hidden so a reviewer can confirm it's that and not a real imbalance.
    balanceSheetDifferenceCents: assets.currentTotalCents - (liabilities.currentTotalCents + equity.currentTotalCents),
    netIncomeCurrentCents: income.currentTotalCents - expenses.currentTotalCents,
    netIncomePriorCents: income.priorTotalCents - expenses.priorTotalCents,
  };
}

/** Review progress across the sheet, for the "12 of 40 reviewed" header a workpaper needs. */
export function summarizeReviewProgress(statuses: WorkpaperReviewStatus[]): { reviewed: number; queries: number; pending: number; total: number } {
  return {
    reviewed: statuses.filter((s) => s === 'reviewed').length,
    queries: statuses.filter((s) => s === 'query').length,
    pending: statuses.filter((s) => s === 'pending').length,
    total: statuses.length,
  };
}
