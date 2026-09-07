/**
 * Record of Employment (ROE) — the Service Canada form issued when an employee stops earning
 * insurable earnings. The hard part is block 15: the employee's insurable hours (15A) and
 * insurable earnings by pay period (15B/15C) over a look-back that depends on the pay period
 * type. Everything else on the form is identification and dates, which the pay runs already
 * know. The output is (a) the figures for the worksheet and (b) the ROE Web XML that Service
 * Canada's bulk upload accepts, so the firm keys nothing twice.
 */
export type PayPeriodType = 'W' | 'B' | 'S' | 'M';
export const PAY_PERIOD_TYPE_LABELS: Record<PayPeriodType, string> = { W: 'Weekly', B: 'Bi-weekly', S: 'Semi-monthly', M: 'Monthly' };

/** ESDC's look-back: how many of the most recent pay periods block 15B and 15C report. */
export const BLOCK15B_PERIODS: Record<PayPeriodType, number> = { W: 27, B: 14, S: 13, M: 7 };
export const BLOCK15C_PERIODS: Record<PayPeriodType, number> = { W: 53, B: 27, S: 25, M: 13 };

export const ROE_REASON_CODES: Array<{ code: string; label: string }> = [
  { code: 'A', label: 'Shortage of work / end of contract or season' },
  { code: 'B', label: 'Strike or lockout' },
  { code: 'D', label: 'Illness or injury' },
  { code: 'E', label: 'Quit' },
  { code: 'F', label: 'Maternity' },
  { code: 'G', label: 'Mandatory retirement' },
  { code: 'H', label: 'Work-sharing' },
  { code: 'J', label: 'Apprentice training' },
  { code: 'K', label: 'Other' },
  { code: 'M', label: 'Dismissal or suspension' },
  { code: 'N', label: 'Leave of absence' },
  { code: 'P', label: 'Parental' },
  { code: 'Z', label: 'Compassionate care / family caregiver' },
];

export interface RoePayRun {
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  regularHours: number | null;
  overtimeHours: number | null;
  grossPayCents: number;
  vacationPayCents: number;
  isVacationPayout: boolean;
}

export interface RoeInput {
  employee: { name: string; sin: string | null; payPeriodsPerYear: number; payType: 'Hourly' | 'Salary'; addressLines: string[] };
  employer: { legalName: string; payrollNumber: string | null; addressLines: string[]; contactName: string | null; contactPhone: string | null };
  runs: RoePayRun[];
  reasonCode: string;
  lastDayPaid: string;
  expectedRecall: 'unknown' | 'notReturning' | { date: string };
  comments?: string | null;
  /** Standard weekly hours for a salaried employee whose runs carry no hours. */
  standardWeeklyHours?: number;
}

export interface RoePeriod {
  index: number;
  payPeriodStart: string;
  payPeriodEnd: string;
  insurableEarningsCents: number;
  insurableHours: number;
}

export interface RoeResult {
  payPeriodType: PayPeriodType;
  firstDayWorked: string;
  lastDayPaid: string;
  finalPayPeriodEnd: string;
  totalInsurableHours: number;
  totalInsurableEarningsCents: number;
  /** Most recent first, as the form lists them (P.P. 1 = the last pay period). */
  periods: RoePeriod[];
  periodsRequired15B: number;
  periodsRequired15C: number;
  vacationPayOnSeparationCents: number;
  warnings: string[];
}

export function payPeriodTypeFor(payPeriodsPerYear: number): PayPeriodType {
  if (payPeriodsPerYear >= 52) return 'W';
  if (payPeriodsPerYear >= 26) return 'B';
  if (payPeriodsPerYear >= 24) return 'S';
  return 'M';
}

function hoursFor(run: RoePayRun, payType: 'Hourly' | 'Salary', weeklyHours: number, periodsPerYear: number): number {
  const recorded = (run.regularHours ?? 0) + (run.overtimeHours ?? 0);
  if (recorded > 0) return recorded;
  if (run.isVacationPayout) return 0;
  if (payType === 'Salary') return Math.round(((weeklyHours * 52) / periodsPerYear) * 100) / 100;
  return 0;
}

export function computeRoe(input: RoeInput): RoeResult {
  const type = payPeriodTypeFor(input.employee.payPeriodsPerYear);
  const runs = [...input.runs].filter((r) => r.payPeriodEnd <= input.lastDayPaid || r.payDate <= input.lastDayPaid).sort((a, b) => b.payPeriodEnd.localeCompare(a.payPeriodEnd) || b.payDate.localeCompare(a.payDate));
  const warnings: string[] = [];
  if (runs.length === 0) warnings.push('No posted pay runs on or before the last day paid.');
  const weekly = input.standardWeeklyHours ?? 40;
  const regular = runs.filter((r) => !r.isVacationPayout);
  const payouts = runs.filter((r) => r.isVacationPayout);
  const vacationPayOnSeparationCents = payouts.reduce((s, r) => s + r.vacationPayCents + r.grossPayCents, 0);

  const need15C = BLOCK15C_PERIODS[type];
  const periods: RoePeriod[] = regular.slice(0, need15C).map((r, i) => ({
    index: i + 1,
    payPeriodStart: r.payPeriodStart,
    payPeriodEnd: r.payPeriodEnd,
    insurableEarningsCents: r.grossPayCents + r.vacationPayCents,
    insurableHours: hoursFor(r, input.employee.payType, weekly, input.employee.payPeriodsPerYear),
  }));
  if (regular.length < BLOCK15B_PERIODS[type]) warnings.push(`Only ${regular.length} pay period${regular.length === 1 ? '' : 's'} on file; block 15B normally covers the last ${BLOCK15B_PERIODS[type]}. Earlier periods must be added from prior records if the employee worked them.`);
  if (input.employee.payType === 'Salary' && regular.some((r) => !r.regularHours)) warnings.push(`Salaried runs without recorded hours are counted at ${weekly} hours per week.`);
  if (!input.employee.sin) warnings.push('Employee SIN is missing — required in block 8.');

  const totalInsurableHours = Math.round(periods.reduce((s, p) => s + p.insurableHours, 0) * 100) / 100;
  const totalInsurableEarningsCents = periods.slice(0, BLOCK15B_PERIODS[type]).reduce((s, p) => s + p.insurableEarningsCents, 0) + vacationPayOnSeparationCents;
  const firstDayWorked = runs.length ? runs[runs.length - 1].payPeriodStart : input.lastDayPaid;
  const finalPayPeriodEnd = regular[0]?.payPeriodEnd ?? input.lastDayPaid;
  return { payPeriodType: type, firstDayWorked, lastDayPaid: input.lastDayPaid, finalPayPeriodEnd, totalInsurableHours, totalInsurableEarningsCents, periods, periodsRequired15B: BLOCK15B_PERIODS[type], periodsRequired15C: BLOCK15C_PERIODS[type], vacationPayOnSeparationCents, warnings };
}

function esc(value: string | null | undefined): string {
  return (value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function dollars(cents: number): string { return (cents / 100).toFixed(2); }

/** ROE Web bulk-transfer XML (schema version 2.0 element names). The file is validated by
 * Service Canada's ROE Web on upload; the firm submits it there under its own credentials. */
export function buildRoeXml(input: RoeInput, roe: RoeResult, issuedOn: string): string {
  const e = input.employee; const r = input.employer;
  const recall = input.expectedRecall === 'unknown' ? 'U' : input.expectedRecall === 'notReturning' ? 'N' : 'Y';
  const recallDate = typeof input.expectedRecall === 'object' ? input.expectedRecall.date : '';
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<ROEHEADER FileVersion="W-2.0" SoftwareVendor="Apex Ledger" ProductName="Apex Ledger Ultimate" ProductVersion="1.0">');
  lines.push('  <ROE Issue="S" PrintingLanguage="E">');
  lines.push(`    <B2>${esc(r.payrollNumber ?? '')}</B2>`);
  lines.push(`    <B3>${esc(r.payrollNumber ?? '')}</B3>`);
  lines.push(`    <B4>${esc(r.legalName)}</B4>`);
  r.addressLines.forEach((l, i) => lines.push(`    <B4A${i + 1}>${esc(l)}</B4A${i + 1}>`));
  lines.push(`    <B5>${esc(issuedOn)}</B5>`);
  lines.push(`    <B6>${roe.payPeriodType}</B6>`);
  lines.push(`    <B8>${esc((e.sin ?? '').replace(/\D/g, ''))}</B8>`);
  lines.push(`    <B9>${esc(e.name)}</B9>`);
  e.addressLines.forEach((l, i) => lines.push(`    <B9A${i + 1}>${esc(l)}</B9A${i + 1}>`));
  lines.push(`    <B10>${esc(roe.firstDayWorked)}</B10>`);
  lines.push(`    <B11>${esc(roe.lastDayPaid)}</B11>`);
  lines.push(`    <B12>${esc(roe.finalPayPeriodEnd)}</B12>`);
  lines.push(`    <B14>${recall}</B14>`);
  if (recallDate) lines.push(`    <B14D>${esc(recallDate)}</B14D>`);
  lines.push(`    <B15A>${roe.totalInsurableHours.toFixed(0)}</B15A>`);
  lines.push(`    <B15B>${dollars(roe.totalInsurableEarningsCents)}</B15B>`);
  lines.push('    <B15C>');
  for (const p of roe.periods) lines.push(`      <PP nbr="${p.index}" amt="${dollars(p.insurableEarningsCents)}"/>`);
  lines.push('    </B15C>');
  lines.push(`    <B16>${esc(input.reasonCode)}</B16>`);
  if (r.contactName) lines.push(`    <B16CN>${esc(r.contactName)}</B16CN>`);
  if (r.contactPhone) lines.push(`    <B16CT>${esc(r.contactPhone.replace(/\D/g, ''))}</B16CT>`);
  if (roe.vacationPayOnSeparationCents > 0) lines.push(`    <B17A code="1" amt="${dollars(roe.vacationPayOnSeparationCents)}"/>`);
  if (input.comments?.trim()) lines.push(`    <B18>${esc(input.comments.trim().slice(0, 160))}</B18>`);
  lines.push('  </ROE>');
  lines.push('</ROEHEADER>');
  return lines.join('\n') + '\n';
}
