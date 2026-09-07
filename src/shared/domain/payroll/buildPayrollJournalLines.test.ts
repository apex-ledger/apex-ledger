import { describe, expect, it } from 'vitest';
import { calculatePay, ZERO_YTD_TOTALS, type EmployeePayProfile } from './calculatePay';
import { buildPayrollJournalLines, hasPostablePayrollAmount, payrollPostingTotalCents } from './buildPayrollJournalLines';

const profile: EmployeePayProfile = {
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

describe('buildPayrollJournalLines', () => {
  it('identifies an empty payroll draft before it reaches journal validation', () => {
    const empty = calculatePay({ profile, regularHours: 0, overtimeHours: 0, incomeTaxCents: 0, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });
    expect(payrollPostingTotalCents(empty)).toBe(0);
    expect(hasPostablePayrollAmount(empty)).toBe(false);
    expect(buildPayrollJournalLines(empty, { wagesExpenseAccountId: 1, remittancesPayableAccountId: 2, bankAccountId: 3 }, 'Test Employee')).toEqual([]);
  });

  it('allows an employer-benefit-only payroll run to post', () => {
    const benefitOnly = calculatePay({
      profile: { ...profile, healthBenefitCents: 5_000 },
      regularHours: 0,
      overtimeHours: 0,
      incomeTaxCents: 0,
      ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
    });
    expect(payrollPostingTotalCents(benefitOnly)).toBe(5_000);
    expect(hasPostablePayrollAmount(benefitOnly)).toBe(true);
  });

  it('always balances (debits equal credits) regardless of income tax entered', () => {
    for (const incomeTaxCents of [0, 22_027, 50_000]) {
      const pay = calculatePay({ profile, regularHours: 88, overtimeHours: 6, incomeTaxCents, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });
      const lines = buildPayrollJournalLines(pay, { wagesExpenseAccountId: 1, remittancesPayableAccountId: 2, bankAccountId: 3 }, 'Test Employee');
      const totalDebits = lines.reduce((sum, l) => sum + l.debitCents, 0);
      const totalCredits = lines.reduce((sum, l) => sum + l.creditCents, 0);
      expect(totalDebits).toBe(totalCredits);
    }
  });

  it('omits the net pay line entirely when net pay is exactly zero', () => {
    const pay = calculatePay({ profile, regularHours: 88, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });
    const zeroNetPay = { ...pay, incomeTaxCents: pay.grossPayCents + pay.vacationPayCents - pay.totalEmployeeDeductionsCents + pay.incomeTaxCents, netPayCents: 0 };
    const lines = buildPayrollJournalLines(zeroNetPay, { wagesExpenseAccountId: 1, remittancesPayableAccountId: 2, bankAccountId: 3 }, 'Test Employee');
    expect(lines.some((l) => l.accountId === 3)).toBe(false);
  });

  it('credits a separate WSIB payable account (not remittancesPayableAccountId) and still balances', () => {
    const pay = calculatePay({ profile, regularHours: 88, wsibRate: 2.18, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });
    const lines = buildPayrollJournalLines(pay, { wagesExpenseAccountId: 1, remittancesPayableAccountId: 2, bankAccountId: 3, wsibPayableAccountId: 4 }, 'Test Employee');

    const wsibLine = lines.find((l) => l.accountId === 4);
    expect(wsibLine?.creditCents).toBe(pay.wsibEmployerCents);
    const remittancesLine = lines.find((l) => l.accountId === 2);
    expect(remittancesLine?.creditCents).toBe(pay.cpp1EmployeeCents + pay.cpp2EmployeeCents + pay.eiEmployeeCents + pay.incomeTaxCents + pay.cpp1EmployerCents + pay.cpp2EmployerCents + pay.eiEmployerCents);

    const totalDebits = lines.reduce((sum, l) => sum + l.debitCents, 0);
    const totalCredits = lines.reduce((sum, l) => sum + l.creditCents, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  it('omits the WSIB line entirely when no rate is configured', () => {
    const pay = calculatePay({ profile, regularHours: 88, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });
    const lines = buildPayrollJournalLines(pay, { wagesExpenseAccountId: 1, remittancesPayableAccountId: 2, bankAccountId: 3, wsibPayableAccountId: 4 }, 'Test Employee');
    expect(lines.some((l) => l.accountId === 4)).toBe(false);
  });

  it('credits separate RRSP and benefits payable accounts and still balances', () => {
    const pay = calculatePay({
      profile: { ...profile, rrspEmployerMatchCents: 5_000, healthBenefitCents: 3_000 },
      regularHours: 88,
      ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
    });
    const lines = buildPayrollJournalLines(
      pay,
      { wagesExpenseAccountId: 1, remittancesPayableAccountId: 2, bankAccountId: 3, rrspPayableAccountId: 5, benefitsPayableAccountId: 6 },
      'Test Employee',
    );

    expect(lines.find((l) => l.accountId === 5)?.creditCents).toBe(5_000);
    expect(lines.find((l) => l.accountId === 6)?.creditCents).toBe(3_000);
    const totalDebits = lines.reduce((sum, l) => sum + l.debitCents, 0);
    const totalCredits = lines.reduce((sum, l) => sum + l.creditCents, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  it('omits RRSP/benefits lines entirely when the employee has neither configured', () => {
    const pay = calculatePay({ profile, regularHours: 88, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });
    const lines = buildPayrollJournalLines(
      pay,
      { wagesExpenseAccountId: 1, remittancesPayableAccountId: 2, bankAccountId: 3, rrspPayableAccountId: 5, benefitsPayableAccountId: 6 },
      'Test Employee',
    );
    expect(lines.some((l) => l.accountId === 5 || l.accountId === 6)).toBe(false);
  });
});

describe('buildPayrollJournalLines — vacation accrual', () => {
  const ACCOUNTS = { wagesExpenseAccountId: 1, remittancesPayableAccountId: 2, bankAccountId: 3, vacationPayableAccountId: 77 };

  it('credits Vacation Pay Payable for the held-back vacation and still balances', () => {
    const pay = calculatePay({ profile: { ...profile, vacationPayAccrued: true }, regularHours: 88, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });
    const lines = buildPayrollJournalLines(pay, ACCOUNTS, 'Jane Doe');

    const vacationLine = lines.find((l) => l.accountId === 77)!;
    expect(vacationLine.creditCents).toBe(pay.vacationPayCents);
    expect(pay.vacationPayCents).toBeGreaterThan(0);
    const debits = lines.reduce((sum, l) => sum + l.debitCents, 0);
    const credits = lines.reduce((sum, l) => sum + l.creditCents, 0);
    expect(debits).toBe(credits);
  });

  it('posts no Vacation Pay Payable line at all for an employee who is paid vacation each period', () => {
    const pay = calculatePay({ profile, regularHours: 88, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });
    const lines = buildPayrollJournalLines(pay, ACCOUNTS, 'Jane Doe');
    expect(lines.find((l) => l.accountId === 77)).toBeUndefined();
  });

  it('on a payout run, draws the gross from Vacation Pay Payable and only the employer share from wages', () => {
    const pay = calculatePay({ profile: { ...profile, vacationPayRate: 0 }, regularHours: 88, ytdBeforeThisPeriod: ZERO_YTD_TOTALS });
    const lines = buildPayrollJournalLines(pay, ACCOUNTS, 'Jane Doe', { isVacationPayout: true });

    const liabilityDraw = lines.find((l) => l.accountId === 77)!;
    const wageLine = lines.find((l) => l.accountId === 1)!;
    expect(liabilityDraw.debitCents).toBe(pay.grossPayCents);
    // Employer CPP/EI on the payout is a new cost, so it hits wages rather than the liability.
    expect(wageLine.debitCents).toBe(pay.totalEmployerCostCents - pay.grossPayCents);
    const debits = lines.reduce((sum, l) => sum + l.debitCents, 0);
    const credits = lines.reduce((sum, l) => sum + l.creditCents, 0);
    expect(debits).toBe(credits);
  });
});

describe('buildPayrollJournalLines — payroll items', () => {
  const item = (partial: Record<string, unknown>) => ({ itemId: null, cppApplies: false, eiApplies: false, taxApplies: false, t4Box: null, accountId: null, ...partial }) as never;

  it('balances with a bonus, taxable benefit, deduction, reimbursement and employer contribution, crediting a payable per item', () => {
    const pay = calculatePay({
      profile,
      regularHours: 80,
      incomeTaxCents: 30_000,
      ytdBeforeThisPeriod: ZERO_YTD_TOTALS,
      items: [
        item({ name: 'Bonus', kind: 'earning', amountCents: 100_000, cppApplies: true, eiApplies: true, taxApplies: true }),
        item({ name: 'Group life', kind: 'taxableBenefit', amountCents: 1_500, cppApplies: true, taxApplies: true }),
        item({ name: 'Union dues', kind: 'deduction', amountCents: 2_500, t4Box: 'unionDues44' }),
        item({ name: 'Mileage', kind: 'reimbursement', amountCents: 4_000 }),
        item({ name: 'Employer pension', kind: 'employerContribution', amountCents: 5_000, accountId: 9 }),
      ],
    });
    const lines = buildPayrollJournalLines(pay, { wagesExpenseAccountId: 1, remittancesPayableAccountId: 2, bankAccountId: 3, benefitsPayableAccountId: 7, deductionsPayableAccountId: 8, reimbursementsExpenseAccountId: 10 }, 'Test Employee');
    const debits = lines.reduce((s, l) => s + l.debitCents, 0);
    const credits = lines.reduce((s, l) => s + l.creditCents, 0);
    expect(debits).toBe(credits);
    expect(lines.find((l) => l.accountId === 3)?.creditCents).toBe(pay.netPayCents);
    expect(lines.find((l) => l.accountId === 8)?.creditCents).toBe(2_500);
    expect(lines.find((l) => l.accountId === 7)?.creditCents).toBe(1_500);
    expect(lines.find((l) => l.accountId === 9)?.creditCents).toBe(5_000);
    expect(lines.find((l) => l.accountId === 10)?.debitCents).toBe(4_000);
    // The bonus has no account of its own, so it stays inside the wages debit — no extra line.
    expect(lines.filter((l) => /Bonus/.test(l.description))).toHaveLength(0);
  });
});
