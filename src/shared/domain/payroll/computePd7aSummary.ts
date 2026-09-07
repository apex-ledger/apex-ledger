import type { PayrollRun } from '../types';

/**
 * A PD7A is the CRA's "Statement of account for current source deductions" — the remittance
 * voucher summarizing what an employer owes CRA for a period (CPP + EI, both employee and
 * employer portions, plus income tax withheld). This computes the same total from posted pay
 * runs, grouped by PAY DATE (the date deductions were actually withheld, which is what the
 * remittance is based on — not the period worked or when the run was entered).
 */
export interface Pd7aSummaryResult {
  payDateFrom: string;
  payDateTo: string;
  payRunCount: number;
  employeeCount: number;
  grossPayrollCents: number;
  cppEmployeeCents: number;
  cppEmployerCents: number;
  eiEmployeeCents: number;
  eiEmployerCents: number;
  incomeTaxCents: number;
  totalRemittanceCents: number;
}

function includedRuns(runs: PayrollRun[], payDateFrom: string, payDateTo: string): PayrollRun[] {
  return runs.filter((r) => r.status === 'posted' && r.payDate >= payDateFrom && r.payDate <= payDateTo);
}

export function computePd7aSummary(runs: PayrollRun[], payDateFrom: string, payDateTo: string): Pd7aSummaryResult {
  const included = includedRuns(runs, payDateFrom, payDateTo);

  const totals = included.reduce(
    (acc, r) => ({
      grossPayrollCents: acc.grossPayrollCents + r.grossPayCents + r.vacationPayCents,
      cppEmployeeCents: acc.cppEmployeeCents + r.cpp1EmployeeCents + r.cpp2EmployeeCents,
      cppEmployerCents: acc.cppEmployerCents + r.cpp1EmployerCents + r.cpp2EmployerCents,
      eiEmployeeCents: acc.eiEmployeeCents + r.eiEmployeeCents,
      eiEmployerCents: acc.eiEmployerCents + r.eiEmployerCents,
      incomeTaxCents: acc.incomeTaxCents + r.incomeTaxCents,
    }),
    { grossPayrollCents: 0, cppEmployeeCents: 0, cppEmployerCents: 0, eiEmployeeCents: 0, eiEmployerCents: 0, incomeTaxCents: 0 },
  );

  const totalRemittanceCents =
    totals.cppEmployeeCents + totals.cppEmployerCents + totals.eiEmployeeCents + totals.eiEmployerCents + totals.incomeTaxCents;

  return {
    payDateFrom,
    payDateTo,
    payRunCount: included.length,
    employeeCount: new Set(included.map((r) => r.employeeId)).size,
    ...totals,
    totalRemittanceCents,
  };
}

/** One row per calendar month that has at least one posted pay run — mirrors a year-at-a-glance
 * remittance summary, handy for spotting which months' PD7As still need to be filed. */
export function computePd7aMonthlyBreakdown(runs: PayrollRun[]): Pd7aSummaryResult[] {
  const months = new Set(runs.filter((r) => r.status === 'posted').map((r) => r.payDate.slice(0, 7)));
  return Array.from(months)
    .sort()
    .map((month) => computePd7aSummary(runs, `${month}-01`, `${month}-31`));
}
