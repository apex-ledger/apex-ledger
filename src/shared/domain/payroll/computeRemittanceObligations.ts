import type { PayrollRun } from '../types';
import { computePd7aSummary } from './computePd7aSummary';

export type PayrollRemitterType = 'quarterly' | 'regular' | 'accelerated1' | 'accelerated2';

export interface PayrollRemittanceObligation {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  dueDateEstimate: boolean;
  payRunCount: number;
  employeeCount: number;
  totalRemittanceCents: number;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthParts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function thirdWeekdayAfter(periodEnd: string): string {
  const date = new Date(`${periodEnd}T00:00:00Z`);
  let weekdays = 0;
  while (weekdays < 3) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) weekdays += 1;
  }
  return date.toISOString().slice(0, 10);
}

function periodFor(payDate: string, remitterType: PayrollRemitterType) {
  const { year, month, day } = monthParts(payDate);
  if (remitterType === 'quarterly') {
    const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
    const endMonth = firstMonth + 2;
    const after = nextMonth(year, endMonth);
    return {
      key: `${year}-Q${Math.floor((month - 1) / 3) + 1}`,
      label: `${year} Q${Math.floor((month - 1) / 3) + 1}`,
      start: iso(year, firstMonth, 1),
      end: iso(year, endMonth, lastDay(year, endMonth)),
      due: iso(after.year, after.month, 15),
      estimated: false,
    };
  }
  if (remitterType === 'accelerated1') {
    const firstHalf = day <= 15;
    const after = nextMonth(year, month);
    return {
      key: `${year}-${pad2(month)}-${firstHalf ? 'H1' : 'H2'}`,
      label: `${year}-${pad2(month)} ${firstHalf ? 'days 1–15' : 'days 16–end'}`,
      start: iso(year, month, firstHalf ? 1 : 16),
      end: iso(year, month, firstHalf ? 15 : lastDay(year, month)),
      due: firstHalf ? iso(year, month, 25) : iso(after.year, after.month, 10),
      estimated: false,
    };
  }
  if (remitterType === 'accelerated2') {
    const bandStart = day <= 7 ? 1 : day <= 14 ? 8 : day <= 21 ? 15 : 22;
    const bandEnd = bandStart === 1 ? 7 : bandStart === 8 ? 14 : bandStart === 15 ? 21 : lastDay(year, month);
    const end = iso(year, month, bandEnd);
    return {
      key: `${year}-${pad2(month)}-${bandStart}`,
      label: `${year}-${pad2(month)} days ${bandStart}–${bandEnd}`,
      start: iso(year, month, bandStart),
      end,
      due: thirdWeekdayAfter(end),
      // CRA public holidays cannot safely be inferred from weekends alone.
      estimated: true,
    };
  }
  const after = nextMonth(year, month);
  return {
    key: `${year}-${pad2(month)}`,
    label: `${year}-${pad2(month)}`,
    start: iso(year, month, 1),
    end: iso(year, month, lastDay(year, month)),
    due: iso(after.year, after.month, 15),
    estimated: false,
  };
}

/** Groups posted pay runs into the actual remitting periods for the selected CRA remitter type,
 * then calculates both the source-deduction amount and its statutory due date. */
export function computeRemittanceObligations(
  runs: PayrollRun[],
  payDateFrom: string,
  payDateTo: string,
  remitterType: PayrollRemitterType,
): PayrollRemittanceObligation[] {
  const groups = new Map<string, { period: ReturnType<typeof periodFor>; runs: PayrollRun[] }>();
  for (const run of runs) {
    if (run.status !== 'posted' || run.payDate < payDateFrom || run.payDate > payDateTo) continue;
    const period = periodFor(run.payDate, remitterType);
    const group = groups.get(period.key) ?? { period, runs: [] };
    group.runs.push(run);
    groups.set(period.key, group);
  }

  return [...groups.values()]
    .sort((a, b) => a.period.start.localeCompare(b.period.start))
    .map(({ period, runs: periodRuns }) => {
      const summary = computePd7aSummary(periodRuns, period.start, period.end);
      return {
        periodLabel: period.label,
        periodStart: period.start,
        periodEnd: period.end,
        dueDate: period.due,
        dueDateEstimate: period.estimated,
        payRunCount: summary.payRunCount,
        employeeCount: summary.employeeCount,
        totalRemittanceCents: summary.totalRemittanceCents,
      };
    });
}
