import { describe, expect, it } from 'vitest';
import { computeEmployeeEarnings, type EarningsRun } from './employeeEarnings';

const run = (partial: Partial<EarningsRun> & Pick<EarningsRun, 'id' | 'employeeId' | 'payDate'>): EarningsRun => ({
  payPeriodStart: partial.payDate, payPeriodEnd: partial.payDate, status: 'posted', regularHours: 80, overtimeHours: 0, regularPayCents: 200_000, overtimePayCents: 0, grossPayCents: 200_000, vacationPayCents: 8_000,
  cpp1EmployeeCents: 10_000, cpp2EmployeeCents: 0, eiEmployeeCents: 3_000, incomeTaxCents: 40_000, cpp1EmployerCents: 10_000, cpp2EmployerCents: 0, eiEmployerCents: 4_200, wsibEmployerCents: 500, rrspEmployerMatchCents: 0, healthBenefitCents: 0, netPayCents: 155_000, isVacationPayout: false, ...partial,
});

describe('employee earnings record', () => {
  it('splits period from year-to-date, counts only posted runs, and folds payroll items in', () => {
    const employees = [
      { id: 1, name: 'Sam', province: 'ON', payType: 'Hourly', sinLastFour: '1234', vacationPayAccrued: true, isActive: true },
      { id: 2, name: 'Kim', province: 'ON', payType: 'Salary', sinLastFour: null, vacationPayAccrued: false, isActive: false },
    ];
    const runs = [
      run({ id: 1, employeeId: 1, payDate: '2026-01-16' }),
      run({ id: 2, employeeId: 1, payDate: '2026-02-13' }),
      run({ id: 3, employeeId: 1, payDate: '2026-03-13', items: [
        { itemId: 1, name: 'Bonus', kind: 'earning', cppApplies: true, eiApplies: true, taxApplies: true, t4Box: null, amountCents: 50_000, accountId: null },
        { itemId: 2, name: 'Union dues', kind: 'deduction', cppApplies: false, eiApplies: false, taxApplies: false, t4Box: 'unionDues44', amountCents: 2_500, accountId: null },
      ], grossPayCents: 250_000, netPayCents: 190_000 }),
      run({ id: 4, employeeId: 1, payDate: '2026-03-27', status: 'draft' }),
      run({ id: 5, employeeId: 2, payDate: '2025-12-19' }),
    ];
    const report = computeEmployeeEarnings(employees, runs, '2026-03-01', '2026-03-31');
    expect(report.employees.map((e) => e.employeeName)).toEqual(['Sam']);
    const sam = report.employees[0];
    expect(sam.runs).toHaveLength(1);
    expect(sam.period).toMatchObject({ runs: 1, otherEarningsCents: 50_000, otherDeductionsCents: 2_500, grossCents: 258_000 });
    expect(sam.runs[0].itemNames).toBe('Bonus, Union dues');
    expect(sam.yearToDate).toMatchObject({ runs: 3, grossCents: 208_000 * 2 + 258_000, cppCents: 30_000, incomeTaxCents: 120_000 });
    // Three accrual runs at 8,000 each through March, nothing paid out yet.
    expect(sam.vacationOwingCents).toBe(24_000);
    expect(sam.yearToDate.employerCostCents).toBe(3 * (208_000 + 10_000 + 4_200 + 500) + 50_000);
    expect(report.grand.grossCents).toBe(258_000);
  });
});
