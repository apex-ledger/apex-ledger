import type { Employee, PayrollRun } from '../types';
import { CRA_PAYROLL_RATES_2026 } from './craRates2026';
import { employeeAddressLines } from './employeeAddress';
import { summarizePayRunItems } from './payrollItems';

/**
 * A T4 is the CRA's "Statement of Remuneration Paid" — the annual slip reporting an employee's
 * employment income and deductions for a calendar year, based on posted pay runs grouped by PAY
 * DATE (the year money was actually paid, same convention as the PD7A). Box numbers match the T4
 * slip's own layout; box 16A (CPP2) was added starting the 2024 tax year.
 */
export interface T4SlipResult {
  employeeId: number;
  employeeName: string;
  /** The employee's mailing address, pre-formatted for the slip — empty when none is on file. */
  addressLines: string[];
  sin: string | null;
  province: string;
  /** Box 14 — Employment income. */
  employmentIncomeCents: number;
  /** Box 16 — Employee's CPP contributions (base + first additional, at the full rate). */
  cpp1Cents: number;
  /** Box 16A — Employee's second additional CPP contributions (CPP2). */
  cpp2Cents: number;
  /** Box 18 — Employee's EI premiums. */
  eiPremiumsCents: number;
  /** Box 22 — Income tax deducted. */
  incomeTaxDeductedCents: number;
  /** Box 24 — EI insurable earnings, capped at the year's maximum insurable earnings. */
  eiInsurableEarningsCents: number;
  /** Box 26 — CPP/QPP pensionable earnings, capped at the year's YMPE. */
  cppPensionableEarningsCents: number;
  /** Code 40 — Other taxable allowances and benefits (employer RRSP contributions). */
  otherTaxableBenefitsCents: number;
  /** Box 20 — RPP contributions. */
  rppContributionsCents: number;
  /** Box 44 — Union dues. */
  unionDuesCents: number;
  /** Box 46 — Charitable donations. */
  charitableDonationsCents: number;
}

export interface T4SummaryResult {
  taxYear: number;
  employeeCount: number;
  employmentIncomeCents: number;
  cpp1Cents: number;
  cpp2Cents: number;
  eiPremiumsCents: number;
  incomeTaxDeductedCents: number;
  cppEmployerCents: number;
  eiEmployerCents: number;
}

function runsForEmployeeInYear(runs: PayrollRun[], employeeId: number, taxYear: number): PayrollRun[] {
  return runs.filter((r) => r.status === 'posted' && r.employeeId === employeeId && r.payDate.slice(0, 4) === String(taxYear));
}

export function computeT4Slip(runs: PayrollRun[], employee: Employee, taxYear: number): T4SlipResult {
  const included = runsForEmployeeInYear(runs, employee.id, taxYear);
  const totals = included.reduce(
    (acc, r) => {
      const items = summarizePayRunItems(r.items ?? []);
      return {
      // Gross already includes cash item earnings; non-cash taxable benefits are added here.
      employmentIncomeCents: acc.employmentIncomeCents + r.grossPayCents + r.vacationPayCents + r.rrspEmployerMatchCents + items.taxableBenefitsCents,
      otherTaxableBenefitsCents: acc.otherTaxableBenefitsCents + r.rrspEmployerMatchCents + items.taxableBenefitsCents,
      rppContributionsCents: acc.rppContributionsCents + items.rppContributionsCents,
      unionDuesCents: acc.unionDuesCents + items.unionDuesCents,
      charitableDonationsCents: acc.charitableDonationsCents + items.charitableDonationsCents,
      cpp1Cents: acc.cpp1Cents + r.cpp1EmployeeCents,
      cpp2Cents: acc.cpp2Cents + r.cpp2EmployeeCents,
      eiPremiumsCents: acc.eiPremiumsCents + r.eiEmployeeCents,
      incomeTaxDeductedCents: acc.incomeTaxDeductedCents + r.incomeTaxCents,
      };
    },
    { employmentIncomeCents: 0, otherTaxableBenefitsCents: 0, rppContributionsCents: 0, unionDuesCents: 0, charitableDonationsCents: 0, cpp1Cents: 0, cpp2Cents: 0, eiPremiumsCents: 0, incomeTaxDeductedCents: 0 },
  );

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    addressLines: employeeAddressLines(employee),
    sin: employee.sin,
    province: employee.province,
    ...totals,
    eiInsurableEarningsCents: Math.min(totals.employmentIncomeCents, CRA_PAYROLL_RATES_2026.ei.maxInsurableEarningsCents),
    cppPensionableEarningsCents: Math.min(totals.employmentIncomeCents, CRA_PAYROLL_RATES_2026.cpp1.ympeCents),
  };
}

/** One slip per employee with at least one posted pay run in the tax year — employees with no
 * posted runs that year are omitted rather than producing an all-zero slip. */
export function computeT4SlipsForYear(runs: PayrollRun[], employees: Employee[], taxYear: number): T4SlipResult[] {
  return employees
    .filter((e) => runsForEmployeeInYear(runs, e.id, taxYear).length > 0)
    .map((e) => computeT4Slip(runs, e, taxYear))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

/** Employer's aggregate totals across every T4 slip for the year — the figures a T4 Summary is
 * built from. Employer CPP/EI portions are included even though they're not on the individual
 * slips, since the Summary reconciles total remitted (employee + employer) against total
 * reported. */
export function computeT4SummaryForYear(runs: PayrollRun[], employees: Employee[], taxYear: number): T4SummaryResult {
  const included = runs.filter((r) => r.status === 'posted' && r.payDate.slice(0, 4) === String(taxYear));
  const slips = computeT4SlipsForYear(runs, employees, taxYear);
  const totals = included.reduce(
    (acc, r) => ({
      cppEmployerCents: acc.cppEmployerCents + r.cpp1EmployerCents + r.cpp2EmployerCents,
      eiEmployerCents: acc.eiEmployerCents + r.eiEmployerCents,
    }),
    { cppEmployerCents: 0, eiEmployerCents: 0 },
  );

  return {
    taxYear,
    employeeCount: slips.length,
    employmentIncomeCents: slips.reduce((sum, s) => sum + s.employmentIncomeCents, 0),
    cpp1Cents: slips.reduce((sum, s) => sum + s.cpp1Cents, 0),
    cpp2Cents: slips.reduce((sum, s) => sum + s.cpp2Cents, 0),
    eiPremiumsCents: slips.reduce((sum, s) => sum + s.eiPremiumsCents, 0),
    incomeTaxDeductedCents: slips.reduce((sum, s) => sum + s.incomeTaxDeductedCents, 0),
    ...totals,
  };
}
