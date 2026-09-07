import type { Account, JournalEntry } from '../types';
import { incomeStatement } from './incomeStatement';

export interface MonthlySummary {
  /** YYYY-MM */
  month: string;
  revenueCents: number;
  expenseCents: number;
  netIncomeCents: number;
}

export interface ProjectionResult {
  /** Actual monthly totals, oldest first. */
  history: MonthlySummary[];
  /** Flat-average-based estimate for the months after `asOfDate` — not a forecast model,
   * just "if the trailing average holds." Always present alongside the history so the UI can
   * make clear which bars are actual and which are projected. */
  projected: MonthlySummary[];
  averageMonthlyRevenueCents: number;
  averageMonthlyExpenseCents: number;
  averageMonthlyNetIncomeCents: number;
}

function addMonths(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, '0')}`;
}

function monthBounds(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = `${yearMonth}-01`;
  const lastDay = new Date(y, m, 0).getDate(); // day 0 of "month m" (1-indexed) = last day of that month
  const end = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

/**
 * Builds trailing monthly Revenue/Expense/Net Income totals and a simple flat-average projection
 * forward. This is a transparent historical-average estimate, not a predictive model or
 * financial advice — the UI must present it as such.
 */
export function computeMonthlyProjection(
  accounts: Account[],
  entries: JournalEntry[],
  asOfDate: string,
  monthsOfHistory = 6,
  monthsToProject = 3,
): ProjectionResult {
  const asOfMonth = asOfDate.slice(0, 7);
  const history: MonthlySummary[] = [];

  for (let i = monthsOfHistory - 1; i >= 0; i--) {
    const month = addMonths(asOfMonth, -i);
    const { start, end } = monthBounds(month);
    if (start > asOfDate) continue; // don't include months that haven't started yet
    const clampedEnd = end > asOfDate ? asOfDate : end;
    const is = incomeStatement(accounts, entries, start, clampedEnd);
    history.push({
      month,
      revenueCents: is.revenue.totalCents,
      expenseCents: is.expenses.totalCents,
      netIncomeCents: is.netIncomeCents,
    });
  }

  const sampleSize = history.length || 1;
  const averageMonthlyRevenueCents = Math.round(history.reduce((s, h) => s + h.revenueCents, 0) / sampleSize);
  const averageMonthlyExpenseCents = Math.round(history.reduce((s, h) => s + h.expenseCents, 0) / sampleSize);
  const averageMonthlyNetIncomeCents = averageMonthlyRevenueCents - averageMonthlyExpenseCents;

  const projected: MonthlySummary[] = [];
  for (let i = 1; i <= monthsToProject; i++) {
    projected.push({
      month: addMonths(asOfMonth, i),
      revenueCents: averageMonthlyRevenueCents,
      expenseCents: averageMonthlyExpenseCents,
      netIncomeCents: averageMonthlyNetIncomeCents,
    });
  }

  return { history, projected, averageMonthlyRevenueCents, averageMonthlyExpenseCents, averageMonthlyNetIncomeCents };
}
