export type PeriodPresetId = 'thisQuarter' | 'lastQuarter' | 'thisHalf' | 'lastHalf' | 'thisYear' | 'lastYear';

export interface PeriodPreset {
  id: PeriodPresetId;
  label: string;
  periodStart: string;
  periodEnd: string;
  comparativeStart: string;
  comparativeEnd: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function lastDayOfMonth(year: number, month1Based: number): number {
  return new Date(year, month1Based, 0).getDate();
}

/** Calendar-month arithmetic that handles wrapping across year boundaries in both directions
 * (e.g. 3 months before January 2026 is October 2025) — plain `(month + delta) % 12` breaks for
 * negative deltas in JS, since `%` keeps the sign of the dividend. */
function addMonths(year: number, month1Based: number, deltaMonths: number): { year: number; month: number } {
  const total = year * 12 + (month1Based - 1) + deltaMonths;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

function periodRange(year: number, startMonth: number, lengthMonths: number): { start: string; end: string } {
  const endPoint = addMonths(year, startMonth, lengthMonths - 1);
  return { start: iso(year, startMonth, 1), end: iso(endPoint.year, endPoint.month, lastDayOfMonth(endPoint.year, endPoint.month)) };
}

function previousPeriodStart(year: number, startMonth: number, lengthMonths: number): { year: number; startMonth: number } {
  const p = addMonths(year, startMonth, -lengthMonths);
  return { year: p.year, startMonth: p.month };
}

function buildPreset(id: PeriodPresetId, label: string, year: number, startMonth: number, lengthMonths: number): PeriodPreset {
  const current = periodRange(year, startMonth, lengthMonths);
  const prev = previousPeriodStart(year, startMonth, lengthMonths);
  const comparative = periodRange(prev.year, prev.startMonth, lengthMonths);
  return { id, label, periodStart: current.start, periodEnd: current.end, comparativeStart: comparative.start, comparativeEnd: comparative.end };
}

/** This Quarter/Half/Year and Last Quarter/Half/Year, each paired with the calendar period
 * immediately before it (quarter-over-quarter, half-over-half, year-over-year) — the standard way
 * a business reads its own trend, so "This Quarter" always compares to the quarter right before
 * it, not the same quarter a year ago. Calendar-based (Jan–Dec), not fiscal-year-aware. Takes
 * "today" as a plain ISO date string rather than reading the clock itself, so it stays a pure,
 * easily-tested function. */
export function computePeriodPresets(todayIso: string): PeriodPreset[] {
  const year = Number(todayIso.slice(0, 4));
  const month = Number(todayIso.slice(5, 7));

  const quarterNum = Math.floor((month - 1) / 3) + 1;
  const thisQuarterStart = (quarterNum - 1) * 3 + 1;
  const halfNum = Math.floor((month - 1) / 6) + 1;
  const thisHalfStart = (halfNum - 1) * 6 + 1;

  const thisQuarter = buildPreset('thisQuarter', `This Quarter (Q${quarterNum} ${year})`, year, thisQuarterStart, 3);

  const lastQuarterStart = previousPeriodStart(year, thisQuarterStart, 3);
  const lastQuarterNum = Math.floor((lastQuarterStart.startMonth - 1) / 3) + 1;
  const lastQuarter = buildPreset(
    'lastQuarter',
    `Last Quarter (Q${lastQuarterNum} ${lastQuarterStart.year})`,
    lastQuarterStart.year,
    lastQuarterStart.startMonth,
    3,
  );

  const thisHalf = buildPreset('thisHalf', `This Half (H${halfNum} ${year})`, year, thisHalfStart, 6);

  const lastHalfStart = previousPeriodStart(year, thisHalfStart, 6);
  const lastHalfNum = Math.floor((lastHalfStart.startMonth - 1) / 6) + 1;
  const lastHalf = buildPreset('lastHalf', `Last Half (H${lastHalfNum} ${lastHalfStart.year})`, lastHalfStart.year, lastHalfStart.startMonth, 6);

  const thisYear = buildPreset('thisYear', `This Year (${year})`, year, 1, 12);
  const lastYear = buildPreset('lastYear', `Last Year (${year - 1})`, year - 1, 1, 12);

  return [thisQuarter, lastQuarter, thisHalf, lastHalf, thisYear, lastYear];
}
