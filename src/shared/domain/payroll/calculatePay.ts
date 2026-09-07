import { CRA_PAYROLL_RATES_2026 } from './craRates2026';
import { WSIB_RATES_2026 } from './wsibRates2026';
import { calculateIncomeTaxForSupportedProvince } from './calculateIncomeTax';
import { summarizePayRunItems, type PayRunItem, type PayRunItemsSummary } from './payrollItems';

export type PayType = 'Hourly' | 'Salary';

export interface EmployeePayProfile {
  payType: PayType;
  hourlyRateCents: number | null;
  annualSalaryCents: number | null;
  payPeriodsPerYear: number;
  vacationPayRate: number;
  province: string;
  federalTotalClaimCents: number | null;
  provincialTotalClaimCents: number | null;
  additionalTaxCents: number | null;
  /** Recurring per-pay-period employer benefits. An employer RRSP contribution is a taxable,
   * pensionable and (for a typical withdrawable group RRSP) insurable benefit, but it is remitted
   * to the RRSP rather than added to cash net pay. Health benefits remain employer-cost only. */
  rrspEmployerMatchCents?: number | null;
  healthBenefitCents?: number | null;
  /**
   * When true, vacation pay is ACCRUED to a liability rather than paid out with this cheque. CRA
   * only requires source deductions on vacation pay when it's actually paid, so the accrued amount
   * is excluded from this period's pensionable/insurable earnings and from net pay — it's still an
   * employer cost, and still shows in vacationPayCents, but it lands in Vacation Pay Payable (see
   * buildPayrollJournalLines) until a payout run releases it.
   *
   * Omitted/false keeps the original behaviour: vacation paid every period, deductions taken on it.
   */
  vacationPayAccrued?: boolean;
}

/** Cumulative figures for the employee for the calendar year, from every prior posted pay run —
 * never stored redundantly, always summed fresh from posted payroll_runs (same principle as
 * account balances being computed from journal_entry_lines rather than cached). */
export interface PayrollYtdTotals {
  pensionableInsurableEarningsCents: number;
  cpp1EmployeeCents: number;
  cpp2EmployeeCents: number;
  eiEmployeeCents: number;
}

export const ZERO_YTD_TOTALS: PayrollYtdTotals = {
  pensionableInsurableEarningsCents: 0,
  cpp1EmployeeCents: 0,
  cpp2EmployeeCents: 0,
  eiEmployeeCents: 0,
};

export interface PayCalculationInput {
  profile: EmployeePayProfile;
  /** Hourly pay type only. */
  regularHours?: number;
  /** Hourly pay type only. Paid at hourlyRate × overtimeMultiplier. */
  overtimeHours?: number;
  overtimeMultiplier?: number;
  /** Omit (or pass null) to auto-compute via the CRA T4127 formula (federal + supported provinces
   * only — see calculateIncomeTax.ts). For any other province, or to override the auto-computed figure (e.g.
   * a CRA letter of authority), pass the exact number from the CRA's PDOC — same manual-override
   * pattern as Manual HST amounts. */
  incomeTaxCents?: number | null;
  /** Company-level, not per-employee (see CompanyInfo.wsibRate) — omit or pass null when the
   * company hasn't configured a WSIB class, which skips the WSIB premium entirely rather than
   * defaulting to some rate. Dollars per $100 of insurable earnings, same units as WSIB's own
   * published rate tables (see wsibRates2026.ts). */
  wsibRate?: number | null;
  ytdBeforeThisPeriod: PayrollYtdTotals;
  /** Extra pay-stub lines: bonuses, benefits, deductions, reimbursements, employer contributions. */
  items?: PayRunItem[];
}

export interface PayCalculationResult {
  regularPayCents: number;
  overtimePayCents: number;
  grossPayCents: number;
  vacationPayCents: number;
  cpp1EmployeeCents: number;
  cpp1EmployerCents: number;
  cpp2EmployeeCents: number;
  cpp2EmployerCents: number;
  eiEmployeeCents: number;
  eiEmployerCents: number;
  /** 100% employer-paid, no employee-side counterpart (unlike CPP/EI) — zero whenever wsibRate
   * wasn't provided. */
  wsibEmployerCents: number;
  /** Employer-paid taxable RRSP benefit, remitted directly to the RRSP rather than in net pay. */
  rrspEmployerMatchCents: number;
  healthBenefitCents: number;
  /** The part of vacationPayCents held back into Vacation Pay Payable this period instead of being
   * paid out — zero unless the employee is set to accrue. */
  vacationAccruedCents: number;
  /** Totals of the run's payroll items by kind — see payrollItems.ts. */
  itemsSummary: PayRunItemsSummary;
  items: PayRunItem[];
  incomeTaxCents: number;
  /** True when incomeTaxCents was computed by the CRA T4127 formula rather than manually entered
   * (always false for unsupported provinces — see SUPPORTED_AUTO_TAX_PROVINCES). */
  incomeTaxAutoCalculated: boolean;
  totalEmployeeDeductionsCents: number;
  netPayCents: number;
  totalEmployerCostCents: number;
  ytdAfterThisPeriod: PayrollYtdTotals;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/** Portion of `earningsBase` that lands within [lo, hi] once `before` has already been counted
 * against that band this year — used to slice a single period's pay into the CPP1 / CPP2 /
 * EI bands without needing per-period lookahead. */
function bandedAmount(before: number, after: number, lo: number, hi: number): number {
  return Math.max(0, clamp(after, lo, hi) - clamp(before, lo, hi));
}

export function calculatePay(input: PayCalculationInput): PayCalculationResult {
  const { profile, ytdBeforeThisPeriod: ytd } = input;
  const overtimeMultiplier = input.overtimeMultiplier ?? 1.5;

  let regularPayCents: number;
  let overtimePayCents: number;
  if (profile.payType === 'Hourly') {
    const rate = profile.hourlyRateCents ?? 0;
    regularPayCents = Math.round(rate * (input.regularHours ?? 0));
    overtimePayCents = Math.round(rate * overtimeMultiplier * (input.overtimeHours ?? 0));
  } else {
    regularPayCents = Math.round((profile.annualSalaryCents ?? 0) / profile.payPeriodsPerYear);
    overtimePayCents = 0;
  }
  const items = input.items ?? [];
  const itemsSummary = summarizePayRunItems(items);
  // Vacation pay accrues on regular wages; a bonus or commission is added after.
  const wagesCents = regularPayCents + overtimePayCents;
  const vacationPayCents = Math.round(wagesCents * profile.vacationPayRate);
  const grossPayCents = wagesCents + itemsSummary.earningsCents;

  // Vacation pay is itself pensionable and insurable, so both CPP and EI apply to gross + vacation
  // — but only once it's actually PAID. When it's being accrued instead, this period's deduction
  // base is gross alone, and the deductions land later on the payout run that releases it.
  const vacationPaidThisPeriodCents = profile.vacationPayAccrued ? 0 : vacationPayCents;
  const vacationAccruedThisPeriodCents = profile.vacationPayAccrued ? vacationPayCents : 0;
  const rrspEmployerMatchCents = profile.rrspEmployerMatchCents ?? 0;
  const healthBenefitCents = profile.healthBenefitCents ?? 0;
  // Pensionable/insurable base: wages, vacation paid, and the items flagged for CPP/EI. A bonus
  // is pensionable and insurable; a non-cash benefit is pensionable but usually not insurable.
  const cashPeriodBase = wagesCents + vacationPaidThisPeriodCents + itemsSummary.pensionableEarningsCents + itemsSummary.pensionableBenefitsCents;
  // CRA treats an employer RRSP contribution as a taxable benefit. This implementation treats the
  // usual withdrawable group RRSP as a cash benefit, so it is CPP-pensionable and EI-insurable.
  // It is not added to net pay because the employer remits it directly to the employee's RRSP.
  const periodBase = cashPeriodBase + rrspEmployerMatchCents;
  // EI has its own base: the same wages, but only the items flagged insurable (a non-cash benefit is
  // usually pensionable and not insurable). The single YTD counter follows the CPP base.
  const eiPeriodBase = wagesCents + vacationPaidThisPeriodCents + itemsSummary.insurableEarningsCents + itemsSummary.insurableBenefitsCents + rrspEmployerMatchCents;
  const ytdBase = ytd.pensionableInsurableEarningsCents;
  const ytdBaseAfter = ytdBase + periodBase;

  const cpp1 = CRA_PAYROLL_RATES_2026.cpp1;
  const cpp2 = CRA_PAYROLL_RATES_2026.cpp2;
  const ei = CRA_PAYROLL_RATES_2026.ei;

  const periodExemptionCents = Math.round(cpp1.annualBasicExemptionCents / profile.payPeriodsPerYear);
  const cpp1EligibleBase = bandedAmount(ytdBase, ytdBaseAfter, 0, cpp1.ympeCents);
  const cpp1PensionableThisPeriod = Math.max(0, cpp1EligibleBase - periodExemptionCents);
  const cpp1Raw = Math.round(cpp1PensionableThisPeriod * cpp1.rate);
  const cpp1EmployeeCents = clamp(cpp1Raw, 0, cpp1.maxEmployeeContributionCents - ytd.cpp1EmployeeCents);

  const cpp2EligibleBase = bandedAmount(ytdBase, ytdBaseAfter, cpp1.ympeCents, cpp2.yampeCents);
  const cpp2Raw = Math.round(cpp2EligibleBase * cpp2.rate);
  const cpp2EmployeeCents = clamp(cpp2Raw, 0, cpp2.maxEmployeeContributionCents - ytd.cpp2EmployeeCents);

  const eiEligibleBase = bandedAmount(ytdBase, ytdBase + eiPeriodBase, 0, ei.maxInsurableEarningsCents);
  const eiRaw = Math.round(eiEligibleBase * ei.employeeRate);
  const eiEmployeeCents = clamp(eiRaw, 0, ei.maxEmployeeContributionCents - ytd.eiEmployeeCents);

  const cpp1EmployerCents = cpp1EmployeeCents;
  const cpp2EmployerCents = cpp2EmployeeCents;
  const eiEmployerCents = Math.round(eiEmployeeCents * ei.employerMultiplier);

  // Bands against WSIB's own maximum insurable earnings ceiling — a different figure than CPP's
  // YMPE or EI's max — but off the same cumulative gross+vacation base ytd/ytdBase already track,
  // since "insurable earnings" for WSIB is the same underlying pay, just capped differently.
  const wsibYtdAfter = ytdBase + cashPeriodBase;
  const wsibEligibleBase = input.wsibRate ? bandedAmount(ytdBase, wsibYtdAfter, 0, WSIB_RATES_2026.maxInsurableEarningsCents) : 0;
  const wsibEmployerCents = input.wsibRate ? Math.round((wsibEligibleBase * input.wsibRate) / 100) : 0;

  // Auto-compute via the CRA formula when no manual figure was entered; still falls back to $0
  // for any unsupported province, matching the existing manual-entry behavior there.
  const autoTax =
    input.incomeTaxCents == null
      ? calculateIncomeTaxForSupportedProvince({
          province: profile.province,
          payPeriodsPerYear: profile.payPeriodsPerYear,
          // When the employer has confirmed sufficient RRSP room, the direct RRSP contribution is
          // deductible in the same period and does not increase income-tax withholding.
          periodGrossPayCents: wagesCents + vacationPaidThisPeriodCents + itemsSummary.taxableEarningsCents + itemsSummary.taxableBenefitsCents,
          cpp1EmployeeCentsThisPeriod: cpp1EmployeeCents,
          cpp2EmployeeCentsThisPeriod: cpp2EmployeeCents,
          eiEmployeeCentsThisPeriod: eiEmployeeCents,
          federalTotalClaimCents: profile.federalTotalClaimCents,
          provincialTotalClaimCents: profile.provincialTotalClaimCents,
          additionalTaxCents: profile.additionalTaxCents,
        })
      : null;
  const incomeTaxCents = input.incomeTaxCents ?? autoTax?.totalTaxCentsThisPeriod ?? 0;
  const totalEmployeeDeductionsCents = cpp1EmployeeCents + cpp2EmployeeCents + eiEmployeeCents + incomeTaxCents + itemsSummary.deductionsCents;
  // Accrued vacation isn't in this cheque, so it isn't in net pay either — it's owed, not paid.
  // Reimbursements are paid with the cheque but are not earnings; benefits are never cash.
  const netPayCents = grossPayCents + vacationPaidThisPeriodCents - totalEmployeeDeductionsCents + itemsSummary.reimbursementsCents;
  const totalEmployerCostCents =
    grossPayCents + vacationPayCents + cpp1EmployerCents + cpp2EmployerCents + eiEmployerCents + wsibEmployerCents + rrspEmployerMatchCents + healthBenefitCents + itemsSummary.benefitsCents + itemsSummary.reimbursementsCents + itemsSummary.employerContributionsCents;

  return {
    regularPayCents,
    overtimePayCents,
    grossPayCents,
    vacationPayCents,
    cpp1EmployeeCents,
    cpp1EmployerCents,
    cpp2EmployeeCents,
    cpp2EmployerCents,
    eiEmployeeCents,
    eiEmployerCents,
    wsibEmployerCents,
    rrspEmployerMatchCents,
    healthBenefitCents,
    vacationAccruedCents: vacationAccruedThisPeriodCents,
    itemsSummary,
    items,
    incomeTaxCents,
    incomeTaxAutoCalculated: autoTax !== null,
    totalEmployeeDeductionsCents,
    netPayCents,
    totalEmployerCostCents,
    ytdAfterThisPeriod: {
      pensionableInsurableEarningsCents: ytdBaseAfter,
      cpp1EmployeeCents: ytd.cpp1EmployeeCents + cpp1EmployeeCents,
      cpp2EmployeeCents: ytd.cpp2EmployeeCents + cpp2EmployeeCents,
      eiEmployeeCents: ytd.eiEmployeeCents + eiEmployeeCents,
    },
  };
}
