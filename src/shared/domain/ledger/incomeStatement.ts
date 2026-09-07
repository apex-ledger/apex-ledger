import { splitExpenseAccounts } from './costOfSales';
import type { Account, JournalEntry } from '../types';
import { computeAccountBalances, filterEntriesByDateRange } from './computeAccountBalances';
import { buildSection, type Section } from './sectionHelpers';

export interface IncomeStatementResult {
  periodStart: string;
  periodEnd: string;
  comparativeStart?: string;
  comparativeEnd?: string;
  revenue: Section;
  /** EVERY expense, cost of sales included. Kept as it was so that callers which only want
   * "revenue less expenses" — the Business Snapshot, period statements, the balance sheet's net
   * income line — carry on reading one number and cannot drift from it. */
  expenses: Section;
  /** The two halves of `expenses`, split so a gross profit can be drawn between them. */
  costOfSales: Section;
  operatingExpenses: Section;
  /** Revenue less cost of sales: whether the thing being sold is sold at a sensible margin. */
  grossProfitCents: number;
  comparativeGrossProfitCents?: number;
  netIncomeCents: number;
  comparativeNetIncomeCents?: number;
}

export function incomeStatement(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart: string,
  periodEnd: string,
  comparativeStart?: string,
  comparativeEnd?: string,
): IncomeStatementResult {
  const revenueAccounts = accounts.filter((a) => a.accountType === 'Revenue');
  const expenseAccounts = accounts.filter((a) => a.accountType === 'Expense');

  const periodEntries = filterEntriesByDateRange(entries, periodStart, periodEnd);
  const balances = computeAccountBalances(accounts, periodEntries);

  // See balanceSheet.ts for why this second pass exists — isolates just the adjusting-entry
  // portion of each line's balance for this same period, without changing amountCents' meaning.
  const adjustingBalances = computeAccountBalances(accounts, periodEntries.filter((e) => e.isAdjustingEntry));

  const comparativeBalances =
    comparativeStart && comparativeEnd
      ? computeAccountBalances(accounts, filterEntriesByDateRange(entries, comparativeStart, comparativeEnd))
      : undefined;

  const revenue = buildSection('Revenue', revenueAccounts, balances, comparativeBalances, adjustingBalances);
  const expenses = buildSection('Expenses', expenseAccounts, balances, comparativeBalances, adjustingBalances);

  // The same accounts as `expenses`, divided in two. Built from the same balances rather than
  // recomputed, so the halves cannot fail to add back up to the whole.
  const split = splitExpenseAccounts(accounts);
  const costOfSales = buildSection('Cost of Sales', split.costOfSales, balances, comparativeBalances, adjustingBalances);
  const operatingExpenses = buildSection('Operating Expenses', split.operating, balances, comparativeBalances, adjustingBalances);

  const grossProfitCents = revenue.totalCents - costOfSales.totalCents;
  const comparativeGrossProfitCents =
    revenue.comparativeTotalCents !== undefined && costOfSales.comparativeTotalCents !== undefined
      ? revenue.comparativeTotalCents - costOfSales.comparativeTotalCents
      : undefined;

  const netIncomeCents = revenue.totalCents - expenses.totalCents;
  const comparativeNetIncomeCents =
    revenue.comparativeTotalCents !== undefined && expenses.comparativeTotalCents !== undefined
      ? revenue.comparativeTotalCents - expenses.comparativeTotalCents
      : undefined;

  return {
    periodStart,
    periodEnd,
    comparativeStart,
    comparativeEnd,
    revenue,
    expenses,
    costOfSales,
    operatingExpenses,
    grossProfitCents,
    comparativeGrossProfitCents,
    netIncomeCents,
    comparativeNetIncomeCents,
  };
}
