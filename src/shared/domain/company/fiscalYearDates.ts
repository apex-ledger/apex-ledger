export interface FiscalYearDateRange {
  startDate: string;
  endDate: string;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIso(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || iso(date) !== value ? null : date;
}

/** A normal 12-month fiscal year ends one calendar day before the anniversary of its start. */
export function fiscalYearEndFromStart(startDate: string): string | null {
  const start = parseIso(startDate);
  if (!start) return null;
  const anniversary = new Date(start.getTime());
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
  anniversary.setUTCDate(anniversary.getUTCDate() - 1);
  return iso(anniversary);
}

/** Reconstructs the current fiscal period shown in Settings from the recurring month/day stored
 * in the company file. The period returned is the one containing `referenceDate`. */
export function currentFiscalYearDates(
  fiscalYearEndMonth: number,
  fiscalYearEndDay: number,
  referenceDate: string,
): FiscalYearDateRange {
  const reference = parseIso(referenceDate) ?? new Date();
  const referenceYear = reference.getUTCFullYear();
  const clampedDay = (year: number) => Math.min(fiscalYearEndDay, new Date(Date.UTC(year, fiscalYearEndMonth, 0)).getUTCDate());
  let end = new Date(Date.UTC(referenceYear, fiscalYearEndMonth - 1, clampedDay(referenceYear)));
  if (end.getTime() < reference.getTime()) {
    const nextYear = referenceYear + 1;
    end = new Date(Date.UTC(nextYear, fiscalYearEndMonth - 1, clampedDay(nextYear)));
  }
  const start = new Date(end.getTime());
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  start.setUTCDate(start.getUTCDate() + 1);
  return { startDate: iso(start), endDate: iso(end) };
}

export function fiscalYearEndParts(startDate: string, endDate: string): { month: number; day: number } | null {
  const start = parseIso(startDate);
  const end = parseIso(endDate);
  if (!start || !end || end.getTime() < start.getTime()) return null;
  return { month: end.getUTCMonth() + 1, day: end.getUTCDate() };
}
