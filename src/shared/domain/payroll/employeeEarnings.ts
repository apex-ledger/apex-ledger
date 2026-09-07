import { summarizePayRunItems, type PayRunItem } from './payrollItems';

/**
 * Employee earnings record — one employee's pay history for a period with year-to-date beside it:
 * the sheet a bookkeeper reads when checking a T4, answering a CRA query, preparing an ROE, or
 * reconciling the remittances. Only posted runs count; drafts are not earnings yet.
 */
export interface EarningsRun {
  id: number;
  employeeId: number;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  status: string;
  regularHours: number | null;
  overtimeHours: number | null;
  regularPayCents: number;
  overtimePayCents: number;
  grossPayCents: number;
  vacationPayCents: number;
  cpp1EmployeeCents: number;
  cpp2EmployeeCents: number;
  eiEmployeeCents: number;
  incomeTaxCents: number;
  cpp1EmployerCents: number;
  cpp2EmployerCents: number;
  eiEmployerCents: number;
  wsibEmployerCents: number;
  rrspEmployerMatchCents: number;
  healthBenefitCents: number;
  netPayCents: number;
  isVacationPayout: boolean;
  items?: PayRunItem[];
}

export interface EarningsTotals {
  runs: number;
  hours: number;
  regularPayCents: number;
  overtimePayCents: number;
  otherEarningsCents: number;
  vacationPayCents: number;
  grossCents: number;
  taxableBenefitsCents: number;
  cppCents: number;
  eiCents: number;
  incomeTaxCents: number;
  otherDeductionsCents: number;
  reimbursementsCents: number;
  netPayCents: number;
  employerCppCents: number;
  employerEiCents: number;
  wsibCents: number;
  employerBenefitsCents: number;
  employerCostCents: number;
}

export interface EarningsRunLine extends EarningsTotals {
  runId: number;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  isVacationPayout: boolean;
  itemNames: string;
}

export interface EmployeeEarningsRecord {
  employeeId: number;
  employeeName: string;
  province: string;
  payType: string;
  sinLastFour: string | null;
  runs: EarningsRunLine[];
  period: EarningsTotals;
  yearToDate: EarningsTotals;
  vacationOwingCents: number;
}

export interface EmployeeEarningsReport {
  periodStart: string;
  periodEnd: string;
  employees: EmployeeEarningsRecord[];
  grand: EarningsTotals;
}

export const ZERO_TOTALS: EarningsTotals = { runs: 0, hours: 0, regularPayCents: 0, overtimePayCents: 0, otherEarningsCents: 0, vacationPayCents: 0, grossCents: 0, taxableBenefitsCents: 0, cppCents: 0, eiCents: 0, incomeTaxCents: 0, otherDeductionsCents: 0, reimbursementsCents: 0, netPayCents: 0, employerCppCents: 0, employerEiCents: 0, wsibCents: 0, employerBenefitsCents: 0, employerCostCents: 0 };

export function runTotals(run: EarningsRun): EarningsTotals {
  const items = summarizePayRunItems(run.items ?? []);
  const cpp = run.cpp1EmployeeCents + run.cpp2EmployeeCents;
  const employerCpp = run.cpp1EmployerCents + run.cpp2EmployerCents;
  const employerBenefits = run.rrspEmployerMatchCents + run.healthBenefitCents + items.benefitsCents + items.employerContributionsCents;
  const gross = run.grossPayCents + run.vacationPayCents;
  return {
    runs: 1,
    hours: (run.regularHours ?? 0) + (run.overtimeHours ?? 0),
    regularPayCents: run.regularPayCents,
    overtimePayCents: run.overtimePayCents,
    otherEarningsCents: items.earningsCents,
    vacationPayCents: run.vacationPayCents,
    grossCents: gross,
    taxableBenefitsCents: items.taxableBenefitsCents,
    cppCents: cpp,
    eiCents: run.eiEmployeeCents,
    incomeTaxCents: run.incomeTaxCents,
    otherDeductionsCents: items.deductionsCents,
    reimbursementsCents: items.reimbursementsCents,
    netPayCents: run.netPayCents,
    employerCppCents: employerCpp,
    employerEiCents: run.eiEmployerCents,
    wsibCents: run.wsibEmployerCents,
    employerBenefitsCents: employerBenefits,
    employerCostCents: gross + employerCpp + run.eiEmployerCents + run.wsibEmployerCents + employerBenefits + items.reimbursementsCents,
  };
}

export function addTotals(a: EarningsTotals, b: EarningsTotals): EarningsTotals {
  const out = { ...a };
  for (const key of Object.keys(ZERO_TOTALS) as Array<keyof EarningsTotals>) out[key] = a[key] + b[key];
  return out;
}

export function computeEmployeeEarnings(
  employees: Array<{ id: number; name: string; province: string; payType: string; sinLastFour: string | null; vacationPayAccrued: boolean; isActive: boolean }>,
  runs: EarningsRun[],
  periodStart: string,
  periodEnd: string,
): EmployeeEarningsReport {
  const posted = runs.filter((r) => r.status === 'posted');
  const yearStart = `${periodEnd.slice(0, 4)}-01-01`;
  const records: EmployeeEarningsRecord[] = [];
  let grand = { ...ZERO_TOTALS };
  for (const e of employees) {
    const own = posted.filter((r) => r.employeeId === e.id);
    const inPeriod = own.filter((r) => r.payDate >= periodStart && r.payDate <= periodEnd).sort((a, b) => a.payDate.localeCompare(b.payDate) || a.id - b.id);
    const ytd = own.filter((r) => r.payDate >= yearStart && r.payDate <= periodEnd);
    if (inPeriod.length === 0 && ytd.length === 0 && !e.isActive) continue;
    const lines: EarningsRunLine[] = inPeriod.map((r) => ({
      ...runTotals(r),
      runId: r.id,
      payPeriodStart: r.payPeriodStart,
      payPeriodEnd: r.payPeriodEnd,
      payDate: r.payDate,
      isVacationPayout: r.isVacationPayout,
      itemNames: (r.items ?? []).filter((i) => i.amountCents > 0).map((i) => i.name).join(', '),
    }));
    const period = lines.reduce((t, l) => addTotals(t, l), { ...ZERO_TOTALS });
    const yearToDate = ytd.reduce((t, r) => addTotals(t, runTotals(r)), { ...ZERO_TOTALS });
    grand = addTotals(grand, period);
    // Vacation owing: what accrued on regular runs less what payout runs released. Employees paid
    // out each period accrue nothing, so nothing is owed.
    const vacationOwingCents = e.vacationPayAccrued
      ? own.filter((r) => r.payDate <= periodEnd).reduce((t, r) => t + (r.isVacationPayout ? -r.grossPayCents : r.vacationPayCents), 0)
      : 0;
    records.push({ employeeId: e.id, employeeName: e.name, province: e.province, payType: e.payType, sinLastFour: e.sinLastFour, runs: lines, period, yearToDate, vacationOwingCents: Math.max(0, vacationOwingCents) });
  }
  records.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  return { periodStart, periodEnd, employees: records, grand };
}
