import type { Account, JournalEntry } from '../types';
import { computeAccountBalances, filterEntriesByDateRange } from './computeAccountBalances';

/** Budget against actual, per account, with the variance and whether it is good news or bad.
 *
 * The sign work is the whole difficulty. Spending 500 less than budgeted and earning 500 less than
 * budgeted are the same arithmetic and opposite outcomes, so a report that shows a bare
 * actual-minus-budget number leaves the reader to work out which is which on every line — and they
 * will get it wrong on the line that matters. Every row here carries an explicit favourable flag.
 */

export interface BudgetLineInput {
  accountId: number;
  /** 1-12, the period within the fiscal year rather than the calendar month. */
  period: number;
  amountCents: number;
}

export interface BudgetVsActualRow {
  account: Account;
  budgetCents: number;
  actualCents: number;
  /** actual − budget, in the account's own direction. */
  varianceCents: number;
  /** Variance as a share of the budget, or null when there was no budget to vary from. */
  variancePercent: number | null;
  /** True when the variance helps the business: more revenue, or less cost. */
  isFavourable: boolean;
}

export interface BudgetVsActualResult {
  periodStart: string;
  periodEnd: string;
  revenue: BudgetVsActualRow[];
  expenses: BudgetVsActualRow[];
  totalBudgetRevenueCents: number;
  totalActualRevenueCents: number;
  totalBudgetExpenseCents: number;
  totalActualExpenseCents: number;
  budgetNetIncomeCents: number;
  actualNetIncomeCents: number;
  netVarianceCents: number;
  netIsFavourable: boolean;
}

/** Which periods of the fiscal year fall inside the reporting window.
 *
 * A budget is entered per period; a report can be run for part of a year. Comparing a quarter's
 * actuals against a whole year's budget would look catastrophic every time, so only the periods
 * actually being reported on are summed.
 */
export function periodsInRange(fiscalYearStart: string, periodStart: string, periodEnd: string): number[] {
  const startYear = Number(fiscalYearStart.slice(0, 4));
  const startMonth = Number(fiscalYearStart.slice(5, 7));

  const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
  const fiscalStartIndex = startYear * 12 + startMonth - 1;

  const periods: number[] = [];
  for (let period = 1; period <= 12; period += 1) {
    const index = fiscalStartIndex + period - 1;
    // A period counts when any part of its month is inside the window.
    if (index >= monthIndex(periodStart) && index <= monthIndex(periodEnd)) periods.push(period);
  }
  return periods;
}

export function budgetVsActual(
  accounts: Account[],
  entries: JournalEntry[],
  budgetLines: BudgetLineInput[],
  fiscalYearStart: string,
  periodStart: string,
  periodEnd: string,
): BudgetVsActualResult {
  const wanted = new Set(periodsInRange(fiscalYearStart, periodStart, periodEnd));
  const budgetByAccount = new Map<number, number>();
  for (const line of budgetLines) {
    if (!wanted.has(line.period)) continue;
    budgetByAccount.set(line.accountId, (budgetByAccount.get(line.accountId) ?? 0) + line.amountCents);
  }

  const balances = computeAccountBalances(accounts, filterEntriesByDateRange(entries, periodStart, periodEnd));

  function rowsFor(accountType: 'Revenue' | 'Expense'): BudgetVsActualRow[] {
    const rows: BudgetVsActualRow[] = [];
    for (const account of accounts) {
      if (account.accountType !== accountType) continue;
      const budgetCents = budgetByAccount.get(account.id) ?? 0;
      const actualCents = balances.get(account.id)?.balanceCents ?? 0;
      // An account with neither a budget nor any activity is noise.
      if (budgetCents === 0 && actualCents === 0) continue;

      const varianceCents = actualCents - budgetCents;
      rows.push({
        account,
        budgetCents,
        actualCents,
        varianceCents,
        variancePercent: budgetCents !== 0 ? (varianceCents / Math.abs(budgetCents)) * 100 : null,
        // More revenue is good; more cost is not. This is the distinction a bare variance loses.
        isFavourable: accountType === 'Revenue' ? varianceCents >= 0 : varianceCents <= 0,
      });
    }
    return rows.sort((a, b) => a.account.code.localeCompare(b.account.code));
  }

  const revenue = rowsFor('Revenue');
  const expenses = rowsFor('Expense');

  const totalBudgetRevenueCents = revenue.reduce((sum, r) => sum + r.budgetCents, 0);
  const totalActualRevenueCents = revenue.reduce((sum, r) => sum + r.actualCents, 0);
  const totalBudgetExpenseCents = expenses.reduce((sum, r) => sum + r.budgetCents, 0);
  const totalActualExpenseCents = expenses.reduce((sum, r) => sum + r.actualCents, 0);

  const budgetNetIncomeCents = totalBudgetRevenueCents - totalBudgetExpenseCents;
  const actualNetIncomeCents = totalActualRevenueCents - totalActualExpenseCents;
  const netVarianceCents = actualNetIncomeCents - budgetNetIncomeCents;

  return {
    periodStart,
    periodEnd,
    revenue,
    expenses,
    totalBudgetRevenueCents,
    totalActualRevenueCents,
    totalBudgetExpenseCents,
    totalActualExpenseCents,
    budgetNetIncomeCents,
    actualNetIncomeCents,
    netVarianceCents,
    netIsFavourable: netVarianceCents >= 0,
  };
}
