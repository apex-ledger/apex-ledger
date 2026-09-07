import { describe, expect, it } from 'vitest';
import { computeT4Slip, computeT4SlipsForYear, computeT4SummaryForYear } from './computeT4Slip';
import type { Employee, PayrollRun } from '../types';

let nextRunId = 1;
function makeRun(overrides: Partial<PayrollRun>): PayrollRun {
  nextRunId += 1;
  return {
    id: nextRunId,
    employeeId: 1,
    payPeriodStart: '2026-01-01',
    payPeriodEnd: '2026-01-14',
    payDate: '2026-01-16',
    regularHours: 80,
    overtimeHours: null,
    regularPayCents: 200000,
    overtimePayCents: 0,
    grossPayCents: 200000,
    vacationPayCents: 8000,
    cpp1EmployeeCents: 10000,
    cpp1EmployerCents: 10000,
    cpp2EmployeeCents: 0,
    cpp2EmployerCents: 0,
    eiEmployeeCents: 3000,
    eiEmployerCents: 4200,
    wsibEmployerCents: 0,
    rrspEmployerMatchCents: 0,
    healthBenefitCents: 0,
    incomeTaxCents: 25000,
    netPayCents: 170000,
    status: 'posted',
    journalEntryId: 1,
    isVacationPayout: false,
    ...overrides,
  };
}

function makeEmployee(overrides: Partial<Employee>): Employee {
  return {
    id: 1,
    name: 'Jane Doe',
    province: 'ON',
    payType: 'Salary',
    hourlyRateCents: null,
    annualSalaryCents: 6000000,
    payPeriodsPerYear: 26,
    vacationPayRate: 0.04,
    sinLastFour: null,
    sin: null,
    isActive: true,
    federalTotalClaimCents: null,
    provincialTotalClaimCents: null,
    additionalTaxCents: null,
    rrspEmployerMatchCents: null,
    healthBenefitCents: null,
    addressLine1: null,
    addressLine2: null,
    addressCity: null,
    addressProvince: null,
    addressPostalCode: null,
    vacationPayAccrued: false,
    ...overrides,
  };
}

describe('computeT4Slip', () => {
  it('sums boxes 14/16/16A/18/22 across posted runs in the tax year', () => {
    const employee = makeEmployee({ id: 1 });
    const runs = [
      makeRun({ employeeId: 1, payDate: '2026-01-16', grossPayCents: 200000, vacationPayCents: 8000, cpp1EmployeeCents: 10000, cpp2EmployeeCents: 500, eiEmployeeCents: 3000, incomeTaxCents: 25000 }),
      makeRun({ employeeId: 1, payDate: '2026-01-30', grossPayCents: 200000, vacationPayCents: 8000, cpp1EmployeeCents: 10000, cpp2EmployeeCents: 500, eiEmployeeCents: 3000, incomeTaxCents: 25000 }),
    ];
    const slip = computeT4Slip(runs, employee, 2026);
    expect(slip.employmentIncomeCents).toBe(416000); // (200000+8000) x 2
    expect(slip.cpp1Cents).toBe(20000);
    expect(slip.cpp2Cents).toBe(1000);
    expect(slip.eiPremiumsCents).toBe(6000);
    expect(slip.incomeTaxDeductedCents).toBe(50000);
    expect(slip.eiInsurableEarningsCents).toBe(416000); // well under the annual max
    expect(slip.cppPensionableEarningsCents).toBe(416000); // well under YMPE
    expect(slip.otherTaxableBenefitsCents).toBe(0);
  });

  it('includes employer RRSP contributions in employment income, pensionable/insurable earnings, and code 40', () => {
    const employee = makeEmployee({ id: 1 });
    const runs = [makeRun({ employeeId: 1, rrspEmployerMatchCents: 5_000 })];
    const slip = computeT4Slip(runs, employee, 2026);
    expect(slip.employmentIncomeCents).toBe(213_000);
    expect(slip.eiInsurableEarningsCents).toBe(213_000);
    expect(slip.cppPensionableEarningsCents).toBe(213_000);
    expect(slip.otherTaxableBenefitsCents).toBe(5_000);
  });

  it('carries the employee mailing address onto the slip, and leaves it empty when none is on file', () => {
    const runs = [makeRun({ employeeId: 1, payDate: '2026-01-16' })];
    const withAddress = makeEmployee({
      id: 1,
      addressLine1: '12 Bay St',
      addressLine2: 'Unit 4',
      addressCity: 'Toronto',
      addressProvince: 'ON',
      addressPostalCode: 'M5J 2R8',
    });
    expect(computeT4Slip(runs, withAddress, 2026).addressLines).toEqual(['12 Bay St, Unit 4', 'Toronto, ON M5J 2R8']);
    expect(computeT4Slip(runs, makeEmployee({ id: 1 }), 2026).addressLines).toEqual([]);
  });

  it('excludes draft runs and runs from other years or employees', () => {
    const employee = makeEmployee({ id: 1 });
    const runs = [
      makeRun({ employeeId: 1, payDate: '2026-01-16', status: 'draft' }),
      makeRun({ employeeId: 1, payDate: '2025-12-31' }),
      makeRun({ employeeId: 2, payDate: '2026-01-16' }),
    ];
    const slip = computeT4Slip(runs, employee, 2026);
    expect(slip.employmentIncomeCents).toBe(0);
  });

  it('caps EI insurable earnings and CPP pensionable earnings at the annual maximums', () => {
    const employee = makeEmployee({ id: 1 });
    // A single very large run to push both totals well past their 2026 caps
    // (EI max insurable $68,900.00, CPP YMPE $74,600.00).
    const runs = [makeRun({ employeeId: 1, payDate: '2026-06-15', grossPayCents: 10_000_000, vacationPayCents: 0 })];
    const slip = computeT4Slip(runs, employee, 2026);
    expect(slip.employmentIncomeCents).toBe(10_000_000);
    expect(slip.eiInsurableEarningsCents).toBe(68_900_00);
    expect(slip.cppPensionableEarningsCents).toBe(74_600_00);
  });
});

describe('computeT4SlipsForYear', () => {
  it('produces one slip per employee with posted runs that year, sorted by name, omitting employees with none', () => {
    const employees = [makeEmployee({ id: 1, name: 'Zed' }), makeEmployee({ id: 2, name: 'Amy' }), makeEmployee({ id: 3, name: 'No Runs' })];
    const runs = [makeRun({ employeeId: 1, payDate: '2026-01-16' }), makeRun({ employeeId: 2, payDate: '2026-02-13' })];
    const slips = computeT4SlipsForYear(runs, employees, 2026);
    expect(slips.map((s) => s.employeeName)).toEqual(['Amy', 'Zed']);
  });
});

describe('computeT4SummaryForYear', () => {
  it('aggregates employee totals plus employer CPP/EI portions across all employees', () => {
    const employees = [makeEmployee({ id: 1, name: 'A' }), makeEmployee({ id: 2, name: 'B' })];
    const runs = [
      makeRun({ employeeId: 1, payDate: '2026-01-16', cpp1EmployeeCents: 10000, cpp1EmployerCents: 10000, eiEmployeeCents: 3000, eiEmployerCents: 4200 }),
      makeRun({ employeeId: 2, payDate: '2026-01-16', cpp1EmployeeCents: 8000, cpp1EmployerCents: 8000, eiEmployeeCents: 2000, eiEmployerCents: 2800 }),
    ];
    const summary = computeT4SummaryForYear(runs, employees, 2026);
    expect(summary.employeeCount).toBe(2);
    expect(summary.cpp1Cents).toBe(18000);
    expect(summary.cppEmployerCents).toBe(18000);
    expect(summary.eiPremiumsCents).toBe(5000);
    expect(summary.eiEmployerCents).toBe(7000);
  });
});
