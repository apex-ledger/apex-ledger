import type { IncomeStatementResult } from './incomeStatement';
import type { SectionLine } from './sectionHelpers';

export interface PerformanceMover {
  accountName: string;
  currentCents: number;
  comparativeCents: number;
  changeCents: number;
  /** null when the comparative period was zero — a percentage change from zero is undefined,
   * not "infinite" or "0%", so callers should render something like "new this period" instead. */
  changePercent: number | null;
}

export type PerformanceVerdict = 'growing' | 'declining' | 'flat';

export interface BusinessPerformanceResult {
  verdict: PerformanceVerdict;
  revenueCurrentCents: number;
  revenueComparativeCents: number;
  revenueChangePercent: number | null;
  expenseCurrentCents: number;
  expenseComparativeCents: number;
  expenseChangePercent: number | null;
  netIncomeCurrentCents: number;
  netIncomeComparativeCents: number;
  netIncomeChangePercent: number | null;
  marginCurrentPercent: number | null;
  marginComparativePercent: number | null;
  topRevenueMovers: PerformanceMover[];
  topExpenseMovers: PerformanceMover[];
  insights: string[];
}

/** A swing smaller than this (in either direction) reads as noise rather than a real trend —
 * keeps a business that's essentially flat from being labeled "growing" or "declining" over a
 * rounding-sized wobble. */
const FLAT_THRESHOLD_PERCENT = 3;
const TOP_MOVER_COUNT = 5;

function percentChange(current: number, comparative: number): number | null {
  if (comparative === 0) return current === 0 ? 0 : null;
  return ((current - comparative) / Math.abs(comparative)) * 100;
}

function formatPercent(p: number | null): string {
  if (p === null) return 'new this period (nothing in the prior period to compare against)';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

function buildMovers(lines: SectionLine[]): PerformanceMover[] {
  return lines
    .map((line) => {
      const comparativeCents = line.comparativeAmountCents ?? 0;
      return {
        accountName: line.account.name,
        currentCents: line.amountCents,
        comparativeCents,
        changeCents: line.amountCents - comparativeCents,
        changePercent: percentChange(line.amountCents, comparativeCents),
      };
    })
    .filter((mover) => mover.changeCents !== 0)
    .sort((a, b) => Math.abs(b.changeCents) - Math.abs(a.changeCents))
    .slice(0, TOP_MOVER_COUNT);
}

function buildInsights(input: {
  verdict: PerformanceVerdict;
  netIncomeChangePercent: number | null;
  topRevenueMovers: PerformanceMover[];
  topExpenseMovers: PerformanceMover[];
  marginCurrentPercent: number | null;
  marginComparativePercent: number | null;
}): string[] {
  const { verdict, netIncomeChangePercent, topRevenueMovers, topExpenseMovers, marginCurrentPercent, marginComparativePercent } = input;
  const insights: string[] = [];

  if (verdict === 'growing') {
    insights.push(`Net income is up ${formatPercent(netIncomeChangePercent)} compared to the prior period.`);
  } else if (verdict === 'declining') {
    insights.push(`Net income is down ${formatPercent(netIncomeChangePercent)} compared to the prior period.`);
  } else {
    insights.push(`Net income is essentially flat compared to the prior period (${formatPercent(netIncomeChangePercent)}).`);
  }

  const topRevenueGain = topRevenueMovers.find((m) => m.changeCents > 0);
  const topRevenueDrop = topRevenueMovers.find((m) => m.changeCents < 0);
  if (topRevenueDrop && (verdict === 'declining' || !topRevenueGain)) {
    insights.push(`The biggest drag on revenue was "${topRevenueDrop.accountName}", down ${formatPercent(topRevenueDrop.changePercent)}.`);
  } else if (topRevenueGain) {
    insights.push(`Revenue growth was led by "${topRevenueGain.accountName}", up ${formatPercent(topRevenueGain.changePercent)}.`);
  }

  const topExpenseGain = topExpenseMovers.find((m) => m.changeCents > 0);
  const topExpenseDrop = topExpenseMovers.find((m) => m.changeCents < 0);
  if (topExpenseGain) {
    insights.push(`The largest expense increase was "${topExpenseGain.accountName}", up ${formatPercent(topExpenseGain.changePercent)}.`);
  } else if (topExpenseDrop) {
    insights.push(`Expenses were trimmed most in "${topExpenseDrop.accountName}", down ${formatPercent(topExpenseDrop.changePercent)}.`);
  }

  if (marginCurrentPercent !== null && marginComparativePercent !== null) {
    const marginDeltaPoints = marginCurrentPercent - marginComparativePercent;
    if (marginDeltaPoints <= -2) {
      insights.push(
        `Profit margin fell from ${marginComparativePercent.toFixed(1)}% to ${marginCurrentPercent.toFixed(1)}% of revenue — expenses grew faster than revenue this period.`,
      );
    } else if (marginDeltaPoints >= 2) {
      insights.push(`Profit margin improved from ${marginComparativePercent.toFixed(1)}% to ${marginCurrentPercent.toFixed(1)}% of revenue.`);
    }
  }

  if (verdict === 'declining') {
    const revenueFocus = topRevenueDrop?.accountName ?? 'your top revenue category';
    const expenseFocus = topExpenseGain?.accountName ?? 'your largest expense categories';
    insights.push(`To turn this around: look at why "${revenueFocus}" declined, and check whether "${expenseFocus}" can be trimmed back.`);
  } else if (verdict === 'growing') {
    const revenueFocus = topRevenueGain?.accountName ?? 'your top revenue driver';
    const expenseFocus = topExpenseGain?.accountName ?? 'rising costs';
    insights.push(`To keep the momentum: consider investing further in "${revenueFocus}", while watching "${expenseFocus}" so it doesn't erode the margin gain.`);
  }

  return insights;
}

/** Turns a comparative Income Statement into a plain-language growth/decline read plus the
 * specific accounts driving it — every figure here comes straight from the ledger comparison
 * already computed by incomeStatement(); nothing is predicted or estimated. Returns null if the
 * caller didn't supply a comparative period (nothing to compare against). */
export function computeBusinessPerformance(result: IncomeStatementResult): BusinessPerformanceResult | null {
  if (result.comparativeNetIncomeCents === undefined || result.revenue.comparativeTotalCents === undefined || result.expenses.comparativeTotalCents === undefined) {
    return null;
  }

  const revenueCurrentCents = result.revenue.totalCents;
  const revenueComparativeCents = result.revenue.comparativeTotalCents;
  const expenseCurrentCents = result.expenses.totalCents;
  const expenseComparativeCents = result.expenses.comparativeTotalCents;
  const netIncomeCurrentCents = result.netIncomeCents;
  const netIncomeComparativeCents = result.comparativeNetIncomeCents;

  const revenueChangePercent = percentChange(revenueCurrentCents, revenueComparativeCents);
  const expenseChangePercent = percentChange(expenseCurrentCents, expenseComparativeCents);
  const netIncomeChangePercent = percentChange(netIncomeCurrentCents, netIncomeComparativeCents);

  const marginCurrentPercent = revenueCurrentCents !== 0 ? (netIncomeCurrentCents / revenueCurrentCents) * 100 : null;
  const marginComparativePercent = revenueComparativeCents !== 0 ? (netIncomeComparativeCents / revenueComparativeCents) * 100 : null;

  const topRevenueMovers = buildMovers(result.revenue.lines);
  const topExpenseMovers = buildMovers(result.expenses.lines);

  const verdict: PerformanceVerdict =
    netIncomeChangePercent === null || Math.abs(netIncomeChangePercent) < FLAT_THRESHOLD_PERCENT
      ? 'flat'
      : netIncomeChangePercent > 0
        ? 'growing'
        : 'declining';

  const insights = buildInsights({ verdict, netIncomeChangePercent, topRevenueMovers, topExpenseMovers, marginCurrentPercent, marginComparativePercent });

  return {
    verdict,
    revenueCurrentCents,
    revenueComparativeCents,
    revenueChangePercent,
    expenseCurrentCents,
    expenseComparativeCents,
    expenseChangePercent,
    netIncomeCurrentCents,
    netIncomeComparativeCents,
    netIncomeChangePercent,
    marginCurrentPercent,
    marginComparativePercent,
    topRevenueMovers,
    topExpenseMovers,
    insights,
  };
}
