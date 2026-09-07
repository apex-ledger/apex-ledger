import { describe, expect, it } from 'vitest';
import type { Employee, PayrollRun } from '../types';
import { computeNextPaystubAlert } from './computeNextPaystubAlert';

const employee = (overrides: Partial<Employee> = {}): Employee => ({
  id: 1, name: 'Alex Employee', province: 'ON', payType: 'Salary', hourlyRateCents: null,
  annualSalaryCents: 60_000_00, payPeriodsPerYear: 24, vacationPayRate: 4, sinLastFour: null,
  sin: null, isActive: true, federalTotalClaimCents: null, provincialTotalClaimCents: null,
  additionalTaxCents: null, rrspEmployerMatchCents: null, healthBenefitCents: null,
  addressLine1: null, addressLine2: null, addressCity: null, addressProvince: null,
  addressPostalCode: null, vacationPayAccrued: false,
  ...overrides,
});

const run = (overrides: Partial<PayrollRun> = {}): PayrollRun => ({
  id: 10, employeeId: 1, payPeriodStart: '2026-08-01', payPeriodEnd: '2026-08-15', payDate: '2026-08-20',
  regularHours: null, overtimeHours: null, regularPayCents: 250_000, overtimePayCents: 0,
  grossPayCents: 250_000, vacationPayCents: 0, cpp1EmployeeCents: 0, cpp1EmployerCents: 0,
  cpp2EmployeeCents: 0, cpp2EmployerCents: 0, eiEmployeeCents: 0, eiEmployerCents: 0,
  wsibEmployerCents: 0, rrspEmployerMatchCents: 0, healthBenefitCents: 0, incomeTaxCents: 0,
  netPayCents: 250_000, status: 'posted', journalEntryId: 100, isVacationPayout: false,
  ...overrides,
});

describe('next paystub alert', () => {
  it('continues a semi-monthly employee to the next fixed pay date', () => {
    expect(computeNextPaystubAlert([employee()], [run()], '2026-09-02')).toMatchObject({
      payPeriodStart: '2026-08-16', payPeriodEnd: '2026-08-31', payDate: '2026-09-05', daysUntilDue: 3,
    });
  });

  it('warns on an overdue unposted draft instead of skipping to another period', () => {
    expect(computeNextPaystubAlert([employee()], [run({ status: 'draft', journalEntryId: null })], '2026-09-02')).toMatchObject({
      draftRunId: 10, payDate: '2026-08-20', daysUntilDue: -13,
    });
  });

  it('uses the earliest employee date and counts employees due together', () => {
    const second = employee({ id: 2, name: 'Blair Employee' });
    expect(computeNextPaystubAlert([employee(), second], [], '2026-09-02')).toMatchObject({
      employeeName: 'Alex Employee', payDate: '2026-09-20', employeesDueOnDate: 2,
    });
  });

  it('returns no alert when payroll has no active employees', () => {
    expect(computeNextPaystubAlert([employee({ isActive: false })], [], '2026-09-02')).toBeNull();
  });
});
