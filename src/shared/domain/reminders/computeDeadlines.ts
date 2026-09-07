export type DeadlineColor = 'red' | 'amber' | 'green';
export type HstFilingFrequency = 'Monthly' | 'Quarterly' | 'Annually' | 'None';

export interface ClientDeadlineInput {
  fiscalYearEndMonth: number; // 1-12
  fiscalYearEndDay: number;
  hstFilingFrequency: HstFilingFrequency;
}

export interface ComputedDeadline {
  category: 'TaxFiling' | 'HstFiling' | 'YearEnd';
  label: string;
  dueDate: string;
  color: DeadlineColor;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Builds an ISO date, clamping the day to the target month's actual last day (e.g. Feb 30 -> Feb 28). */
function clampedDate(year: number, month1to12: number, day: number): string {
  const lastDay = new Date(year, month1to12, 0).getDate();
  return `${year}-${pad2(month1to12)}-${pad2(Math.min(day, lastDay))}`;
}

function addMonths(dateIso: string, months: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return clampedDate(newYear, newMonth, d);
}

/** Days from `referenceDate` to `dueDate` (negative if dueDate is in the past). */
function daysUntil(referenceDate: string, dueDate: string): number {
  const a = new Date(`${referenceDate}T00:00:00Z`).getTime();
  const b = new Date(`${dueDate}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Red once overdue or within 2 weeks, amber within a month, green beyond that. */
export function colorForDueDate(dueDate: string, referenceDate: string): DeadlineColor {
  const days = daysUntil(referenceDate, dueDate);
  if (days < 14) return 'red';
  if (days <= 30) return 'amber';
  return 'green';
}

/** The next occurrence (on/after referenceDate) of an event that recurs annually `offsetMonths`
 * after a month/day anchor — covers fiscal year-end itself (offset 0), the T2 filing deadline
 * (offset 6), and an annual HST filer's deadline (offset 3), all with the same recurrence logic. */
function nextRecurringDeadline(month: number, day: number, offsetMonths: number, referenceDate: string): string {
  const refYear = Number(referenceDate.slice(0, 4));
  const candidates = [refYear - 1, refYear, refYear + 1].map((y) => addMonths(clampedDate(y, month, day), offsetMonths));
  const upcoming = candidates.filter((d) => d >= referenceDate).sort();
  return upcoming[0] ?? candidates.sort().slice(-1)[0];
}

function nextFromSet(candidateDates: string[], referenceDate: string): string {
  const sorted = [...candidateDates].sort();
  return sorted.find((d) => d >= referenceDate) ?? sorted[0];
}

/** Monthly GST/HST filers: deadline recurs on the last day of every month. */
function nextMonthlyHstDeadline(referenceDate: string): string {
  const [y, m] = referenceDate.slice(0, 7).split('-').map(Number);
  const thisMonthEnd = clampedDate(y, m, 31);
  return thisMonthEnd >= referenceDate ? thisMonthEnd : addMonths(thisMonthEnd, 1);
}

/** Quarterly GST/HST filers: deadline is one month after each calendar quarter-end
 * (Jan 31, Apr 30, Jul 31, Oct 31), recurring every year. */
function nextQuarterlyHstDeadline(referenceDate: string): string {
  const year = Number(referenceDate.slice(0, 4));
  const candidates = [
    clampedDate(year, 1, 31),
    clampedDate(year, 4, 30),
    clampedDate(year, 7, 31),
    clampedDate(year, 10, 31),
    clampedDate(year + 1, 1, 31),
  ];
  return nextFromSet(candidates, referenceDate);
}

/**
 * Corporate Tax (T2) filing deadline: a well-established general rule — 6 months after fiscal
 * year-end, recurring annually. This is a planning estimate, not a substitute for the actual
 * deadline on a Notice of Assessment.
 */
export function computeTaxFilingDeadline(client: ClientDeadlineInput, referenceDate: string): ComputedDeadline {
  const dueDate = nextRecurringDeadline(client.fiscalYearEndMonth, client.fiscalYearEndDay, 6, referenceDate);
  return { category: 'TaxFiling', label: 'Corporate Tax (T2) Filing', dueDate, color: colorForDueDate(dueDate, referenceDate) };
}

export function computeYearEndDeadline(client: ClientDeadlineInput, referenceDate: string): ComputedDeadline {
  const dueDate = nextRecurringDeadline(client.fiscalYearEndMonth, client.fiscalYearEndDay, 0, referenceDate);
  return { category: 'YearEnd', label: 'Fiscal Year-End', dueDate, color: colorForDueDate(dueDate, referenceDate) };
}

/**
 * GST/HST filing deadline, based on filing frequency — general CRA guidelines (monthly/quarterly:
 * one month after the period end; annual corporate filers: three months after fiscal year-end).
 * Returns null when the client has no HST filing obligation on record.
 */
export function computeHstFilingDeadline(client: ClientDeadlineInput, referenceDate: string): ComputedDeadline | null {
  if (client.hstFilingFrequency === 'None') return null;

  let dueDate: string;
  if (client.hstFilingFrequency === 'Monthly') {
    dueDate = nextMonthlyHstDeadline(referenceDate);
  } else if (client.hstFilingFrequency === 'Quarterly') {
    dueDate = nextQuarterlyHstDeadline(referenceDate);
  } else {
    dueDate = nextRecurringDeadline(client.fiscalYearEndMonth, client.fiscalYearEndDay, 3, referenceDate);
  }

  return { category: 'HstFiling', label: `GST/HST Filing (${client.hstFilingFrequency})`, dueDate, color: colorForDueDate(dueDate, referenceDate) };
}

export function computeAllDeadlines(client: ClientDeadlineInput, referenceDate: string): ComputedDeadline[] {
  const deadlines = [computeTaxFilingDeadline(client, referenceDate), computeYearEndDeadline(client, referenceDate)];
  const hst = computeHstFilingDeadline(client, referenceDate);
  if (hst) deadlines.push(hst);
  return deadlines.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
