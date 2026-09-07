import { describe, expect, it } from 'vitest';
import { calculatePay, ZERO_YTD_TOTALS, type EmployeePayProfile } from './calculatePay';

const biweeklyHourlyProfile: EmployeePayProfile = {
  payType: 'Hourly',
  hourlyRateCents: 1725,
  annualSalaryCents: null,
  payPeriodsPerYear: 26,
  vacationPayRate: 0.04,
  province: 'ON',
  federalTotalClaimCents: null,
  provincialTotalClaimCents: null,
  additionalTaxCents: null,
};

describe('calculatePay — golden fixture (matches real CRA PDOC output from source spreadsheet)', () => {
  it('reproduces the exact CPP/EI figures CRA PDOC computed for $17.25/hr x 88hrs biweekly', () => {
    const result = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 88,
      overtimeHours: 0,
      ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
    });

    expect(result.grossPayCents).toBe(151_800); // $1,518.00
    expect(result.vacationPayCents).toBe(6_072); // $60.72
    expect(result.cpp1EmployeeCents).toBe(8_592); // $85.92 — matches PDOC
    expect(result.cpp2EmployeeCents).toBe(0);
    expect(result.eiEmployeeCents).toBe(2_573); // $25.73 — matches PDOC
    expect(result.cpp1EmployerCents).toBe(8_592);
    expect(result.eiEmployerCents).toBe(3_602); // $36.02 — matches PDOC employer EI
  });

  it('net pay matches PDOC when the same income tax figure is entered', () => {
    const result = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 88,
      overtimeHours: 0,
      incomeTaxCents: 22_027, // $220.27, PDOC's figure for this example
      ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
    });
    // PDOC's "Employee deductions" total was $331.92, and net = gross+vacation - deductions.
    expect(result.totalEmployeeDeductionsCents).toBe(8_592 + 0 + 2_573 + 22_027);
    expect(result.netPayCents).toBe(151_800 + 6_072 - (8_592 + 2_573 + 22_027));
  });
});

describe('calculatePay — overtime', () => {
  it('pays overtime hours at 1.5x the hourly rate by default', () => {
    const result = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 80,
      overtimeHours: 10,
      ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
    });
    expect(result.regularPayCents).toBe(Math.round(1725 * 80));
    expect(result.overtimePayCents).toBe(Math.round(1725 * 1.5 * 10));
    expect(result.grossPayCents).toBe(result.regularPayCents + result.overtimePayCents);
  });

  it('supports a custom overtime multiplier', () => {
    const result = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 80,
      overtimeHours: 10,
      overtimeMultiplier: 2,
      ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
    });
    expect(result.overtimePayCents).toBe(Math.round(1725 * 2 * 10));
  });
});

describe('calculatePay — salary', () => {
  it('divides annual salary by pay periods per year, with no overtime', () => {
    const result = calculatePay({
      profile: {
        payType: 'Salary',
        hourlyRateCents: null,
        annualSalaryCents: 6_000_000,
        payPeriodsPerYear: 24,
        vacationPayRate: 0.04,
        province: 'ON',
        federalTotalClaimCents: null,
        provincialTotalClaimCents: null,
        additionalTaxCents: null,
      },
      overtimeHours: 5, // ignored for salaried employees
      ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
    });
    expect(result.regularPayCents).toBe(250_000);
    expect(result.overtimePayCents).toBe(0);
  });
});

describe('calculatePay — CPP1 annual maximum', () => {
  it('stops deducting CPP1 once the employee has already hit the annual max YTD', () => {
    const result = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 88,
      ytdBeforeThisPeriod: { ...ZERO_YTD_TOTALS, cpp1EmployeeCents: 423_045 },
    });
    expect(result.cpp1EmployeeCents).toBe(0);
    expect(result.cpp1EmployerCents).toBe(0);
  });

  it('caps a partial period so YTD never exceeds the annual max', () => {
    const result = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 88,
      ytdBeforeThisPeriod: { ...ZERO_YTD_TOTALS, cpp1EmployeeCents: 423_045 - 100 },
    });
    expect(result.cpp1EmployeeCents).toBe(100);
    expect(result.ytdAfterThisPeriod.cpp1EmployeeCents).toBe(423_045);
  });
});

describe('calculatePay — CPP2 kicks in once YMPE is crossed', () => {
  it('splits a period straddling the YMPE boundary between CPP1 and CPP2', () => {
    // YMPE is $74,600. Put YTD pensionable earnings at $74,000 (7,400,000 cents) so this
    // period's ~$1,578.72 pushes past the boundary into CPP2 territory.
    const result = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 88,
      ytdBeforeThisPeriod: { ...ZERO_YTD_TOTALS, pensionableInsurableEarningsCents: 74_000_00 },
    });
    // Band above YMPE this period: (74,000+1,578.72) - 74,600 = 978.72 -> at 4% = ~39.15
    expect(result.cpp2EmployeeCents).toBeGreaterThan(0);
    expect(result.cpp1EmployeeCents).toBeGreaterThan(0);
  });

  it('charges pure CPP2 once fully past YMPE', () => {
    const result = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 88,
      ytdBeforeThisPeriod: { ...ZERO_YTD_TOTALS, pensionableInsurableEarningsCents: 75_000_00 },
    });
    expect(result.cpp1EmployeeCents).toBe(0);
    expect(result.cpp2EmployeeCents).toBeGreaterThan(0);
  });
});

describe('calculatePay — EI annual maximum', () => {
  it('stops deducting EI once YTD has hit the annual max employee premium', () => {
    const result = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 88,
      ytdBeforeThisPeriod: { ...ZERO_YTD_TOTALS, eiEmployeeCents: 112_307 },
    });
    expect(result.eiEmployeeCents).toBe(0);
    expect(result.eiEmployerCents).toBe(0);
  });
});

describe('calculatePay — WSIB (Ontario, employer-only)', () => {
  it('is zero when the company has no WSIB rate configured', () => {
    const result = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 88,
      ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
    });
    expect(result.wsibEmployerCents).toBe(0);
  });

  it('charges rate per $100 of insurable earnings (gross + vacation), with no employee-side deduction', () => {
    const result = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 88,
      wsibRate: 2.18, // Residential Building Construction (class G1)
      ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
    });
    const insurableEarnings = result.grossPayCents + result.vacationPayCents; // 151,800 + 6,072
    expect(result.wsibEmployerCents).toBe(Math.round((insurableEarnings * 2.18) / 100));
    expect(result.totalEmployerCostCents).toBe(
      result.grossPayCents + result.vacationPayCents + result.cpp1EmployerCents + result.cpp2EmployerCents + result.eiEmployerCents + result.wsibEmployerCents,
    );
  });

  it('stops charging WSIB once YTD insurable earnings pass the annual maximum ceiling', () => {
    const result = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 88,
      wsibRate: 2.18,
      ytdBeforeThisPeriod: { ...ZERO_YTD_TOTALS, pensionableInsurableEarningsCents: 121_700_00 },
    });
    expect(result.wsibEmployerCents).toBe(0);
  });

  it('caps a partial period so YTD insurable earnings never exceed the WSIB maximum', () => {
    const result = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 88,
      wsibRate: 2.18,
      ytdBeforeThisPeriod: { ...ZERO_YTD_TOTALS, pensionableInsurableEarningsCents: 121_700_00 - 100 },
    });
    expect(result.wsibEmployerCents).toBe(Math.round((100 * 2.18) / 100));
  });
});

describe('calculatePay — employer benefits', () => {
  it('are zero when the employee has neither configured', () => {
    const result = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 88,
      ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
    });
    expect(result.rrspEmployerMatchCents).toBe(0);
    expect(result.healthBenefitCents).toBe(0);
  });

  it('treats employer RRSP as pensionable/insurable while health benefits remain employer-cost only', () => {
    const withoutBenefits = calculatePay({ profile: biweeklyHourlyProfile, regularHours: 88, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });
    const withBenefits = calculatePay({
      profile: { ...biweeklyHourlyProfile, rrspEmployerMatchCents: 5_000, healthBenefitCents: 3_000 },
      regularHours: 88,
      ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
    });

    expect(withBenefits.rrspEmployerMatchCents).toBe(5_000);
    expect(withBenefits.healthBenefitCents).toBe(3_000);
    expect(withBenefits.cpp1EmployeeCents).toBeGreaterThan(withoutBenefits.cpp1EmployeeCents);
    expect(withBenefits.eiEmployeeCents).toBeGreaterThan(withoutBenefits.eiEmployeeCents);
    expect(withBenefits.totalEmployeeDeductionsCents).toBeGreaterThan(withoutBenefits.totalEmployeeDeductionsCents);
    expect(withBenefits.netPayCents).toBeLessThan(withoutBenefits.netPayCents);
    expect(withBenefits.ytdAfterThisPeriod.pensionableInsurableEarningsCents).toBe(
      withoutBenefits.ytdAfterThisPeriod.pensionableInsurableEarningsCents + 5_000,
    );
    expect(withBenefits.totalEmployerCostCents).toBeGreaterThan(withoutBenefits.totalEmployerCostCents + 5_000 + 3_000);
    // CRA allows no income-tax withholding on the employer RRSP contribution where there are
    // reasonable grounds that it is deductible. The extra CPP/EI deductions still feed the
    // T4127 tax credits, so withholding may be slightly lower than without the contribution.
    expect(withBenefits.incomeTaxCents).toBeLessThan(withoutBenefits.incomeTaxCents);
  });
});

describe('calculatePay — vacation pay accrual', () => {
  const accruingProfile: EmployeePayProfile = { ...biweeklyHourlyProfile, vacationPayAccrued: true };

  it('still earns the same vacation entitlement, but holds it back out of net pay', () => {
    const paidOut = calculatePay({ profile: biweeklyHourlyProfile, regularHours: 88, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });
    const accrued = calculatePay({ profile: accruingProfile, regularHours: 88, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });

    expect(accrued.vacationPayCents).toBe(paidOut.vacationPayCents);
    expect(accrued.vacationAccruedCents).toBe(paidOut.vacationPayCents);
    expect(paidOut.vacationAccruedCents).toBe(0);
    // Net pay is lower by exactly the vacation held back, less the deductions no longer taken on it.
    expect(accrued.netPayCents).toBeLessThan(paidOut.netPayCents);
  });

  it('defers CPP/EI/tax on the accrued portion — deductions come off gross alone', () => {
    const accrued = calculatePay({ profile: accruingProfile, regularHours: 88, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });
    const noVacationAtAll = calculatePay({
      profile: { ...biweeklyHourlyProfile, vacationPayRate: 0 },
      regularHours: 88,
      ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
    });

    // Accruing means this period's deduction base is gross only, exactly as if no vacation existed.
    expect(accrued.cpp1EmployeeCents).toBe(noVacationAtAll.cpp1EmployeeCents);
    expect(accrued.eiEmployeeCents).toBe(noVacationAtAll.eiEmployeeCents);
    expect(accrued.incomeTaxCents).toBe(noVacationAtAll.incomeTaxCents);
    expect(accrued.ytdAfterThisPeriod.pensionableInsurableEarningsCents).toBe(noVacationAtAll.grossPayCents);
  });

  it('keeps vacation in the employer cost either way — accruing defers it, it does not remove it', () => {
    const paidOut = calculatePay({ profile: biweeklyHourlyProfile, regularHours: 88, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });
    const accrued = calculatePay({ profile: accruingProfile, regularHours: 88, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });

    // Employer cost differs only by the employer-side CPP/EI no longer charged on the vacation.
    expect(accrued.totalEmployerCostCents).toBeLessThanOrEqual(paidOut.totalEmployerCostCents);
    expect(accrued.totalEmployerCostCents).toBeGreaterThanOrEqual(accrued.grossPayCents + accrued.vacationPayCents);
  });
});

describe('calculatePay — payroll items', () => {
  const item = (partial: Record<string, unknown>) => ({ itemId: null, cppApplies: false, eiApplies: false, taxApplies: false, t4Box: null, accountId: null, ...partial }) as never;

  it('adds a bonus to gross and the CPP/EI base, deducts union dues after tax, adds a reimbursement to net', () => {
    const base = calculatePay({ profile: biweeklyHourlyProfile, regularHours: 80, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });
    const withItems = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 80,
      ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
      items: [
        item({ name: 'Bonus', kind: 'earning', amountCents: 100_000, cppApplies: true, eiApplies: true, taxApplies: true }),
        item({ name: 'Union dues', kind: 'deduction', amountCents: 2_500, t4Box: 'unionDues44' }),
        item({ name: 'Mileage', kind: 'reimbursement', amountCents: 4_000 }),
        item({ name: 'Employer pension', kind: 'employerContribution', amountCents: 5_000 }),
      ],
    });
    expect(withItems.grossPayCents).toBe(base.grossPayCents + 100_000);
    // Vacation accrues on wages only, not on the bonus.
    expect(withItems.vacationPayCents).toBe(base.vacationPayCents);
    expect(withItems.cpp1EmployeeCents).toBeGreaterThan(base.cpp1EmployeeCents);
    expect(withItems.eiEmployeeCents).toBeGreaterThan(base.eiEmployeeCents);
    expect(withItems.totalEmployeeDeductionsCents).toBe(withItems.cpp1EmployeeCents + withItems.cpp2EmployeeCents + withItems.eiEmployeeCents + withItems.incomeTaxCents + 2_500);
    expect(withItems.netPayCents).toBe(withItems.grossPayCents + withItems.vacationPayCents - withItems.totalEmployeeDeductionsCents + 4_000);
    expect(withItems.itemsSummary.unionDuesCents).toBe(2_500);
    expect(withItems.totalEmployerCostCents - base.totalEmployerCostCents).toBe(100_000 + (withItems.cpp1EmployerCents - base.cpp1EmployerCents) + (withItems.eiEmployerCents - base.eiEmployerCents) + 4_000 + 5_000);
  });

  it('taxes a non-cash benefit without paying it', () => {
    const base = calculatePay({ profile: biweeklyHourlyProfile, regularHours: 80, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });
    const withBenefit = calculatePay({
      profile: biweeklyHourlyProfile,
      regularHours: 80,
      ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
      items: [item({ name: 'Group life', kind: 'taxableBenefit', amountCents: 5_000, cppApplies: true, eiApplies: false, taxApplies: true })],
    });
    expect(withBenefit.grossPayCents).toBe(base.grossPayCents);
    expect(withBenefit.cpp1EmployeeCents).toBeGreaterThan(base.cpp1EmployeeCents);
    expect(withBenefit.eiEmployeeCents).toBe(base.eiEmployeeCents);
    expect(withBenefit.netPayCents).toBeLessThan(base.netPayCents);
    expect(withBenefit.itemsSummary.taxableBenefitsCents).toBe(5_000);
  });
});
