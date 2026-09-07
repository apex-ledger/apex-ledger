import { describe, expect, it } from 'vitest';
import { duplicatePayrollPeriodRefusalReason, payrollDatesRefusalReason, type ExistingPayrollRun } from './payrollRunRules';

const existing: ExistingPayrollRun[] = [
  { id: 1, employeeId: 7, payPeriodStart: '2026-03-01', payPeriodEnd: '2026-03-15', isVacationPayout: false },
  { id: 2, employeeId: 7, payPeriodStart: '2026-03-01', payPeriodEnd: '2026-03-15', isVacationPayout: true },
  { id: 3, employeeId: 9, payPeriodStart: '2026-03-01', payPeriodEnd: '2026-03-15', isVacationPayout: false },
];

describe('pay period dates', () => {
  it('accepts a period that runs forward and is paid after it starts', () => {
    expect(payrollDatesRefusalReason({ payPeriodStart: '2026-03-01', payPeriodEnd: '2026-03-15', payDate: '2026-03-20' })).toBeNull();
  });

  it('accepts being paid mid-period', () => {
    expect(payrollDatesRefusalReason({ payPeriodStart: '2026-03-01', payPeriodEnd: '2026-03-15', payDate: '2026-03-10' })).toBeNull();
  });

  it('refuses a period that ends before it starts', () => {
    expect(payrollDatesRefusalReason({ payPeriodStart: '2026-03-15', payPeriodEnd: '2026-03-01', payDate: '2026-03-20' })).toMatch(/ends on 2026-03-01, before it starts/);
  });

  it('refuses a pay date before the period starts', () => {
    expect(payrollDatesRefusalReason({ payPeriodStart: '2026-03-01', payPeriodEnd: '2026-03-15', payDate: '2026-02-20' })).toMatch(/pay date 2026-02-20 is before/);
  });
});

describe('duplicate pay periods', () => {
  const period = { employeeId: 7, payPeriodStart: '2026-03-01', payPeriodEnd: '2026-03-15', payDate: '2026-03-20' };

  it('refuses the same period for the same employee', () => {
    expect(duplicatePayrollPeriodRefusalReason(period, existing, 'Sam')).toMatch(/Sam already has a pay run covering 2026-03-01 to 2026-03-15/);
  });

  it('refuses any overlap, not only an exact match', () => {
    expect(duplicatePayrollPeriodRefusalReason({ ...period, payPeriodStart: '2026-03-10', payPeriodEnd: '2026-03-24' }, existing, 'Sam')).not.toBeNull();
  });

  it('allows the next period', () => {
    expect(duplicatePayrollPeriodRefusalReason({ ...period, payPeriodStart: '2026-03-16', payPeriodEnd: '2026-03-31' }, existing, 'Sam')).toBeNull();
  });

  it('allows the same period for a different employee', () => {
    expect(duplicatePayrollPeriodRefusalReason({ ...period, employeeId: 11 }, existing, 'Kim')).toBeNull();
  });

  it('never treats a vacation payout as a duplicate, in either direction', () => {
    expect(duplicatePayrollPeriodRefusalReason({ ...period, isVacationPayout: true }, existing, 'Sam')).toBeNull();
    const onlyPayout = existing.filter((run) => run.isVacationPayout);
    expect(duplicatePayrollPeriodRefusalReason(period, onlyPayout, 'Sam')).toBeNull();
  });

  it('lets a run being edited overlap itself', () => {
    expect(duplicatePayrollPeriodRefusalReason(period, existing, 'Sam', 1)).toBeNull();
  });
});

describe('duplicatePayrollPeriodRefusalReason — posted runs are locked', () => {
  it('says a posted period is locked and must be reversed, while a draft is only a duplicate', () => {
    const period = { employeeId: 1, payPeriodStart: '2026-03-26', payPeriodEnd: '2026-04-08', payDate: '2026-04-10' };
    const posted = [{ id: 5, employeeId: 1, payPeriodStart: '2026-03-26', payPeriodEnd: '2026-04-08', isVacationPayout: false, status: 'posted', payDate: '2026-04-10' }];
    const draft = [{ ...posted[0], status: 'draft' }];
    expect(duplicatePayrollPeriodRefusalReason(period, posted, 'Sam Patel')).toMatch(/posted on 2026-04-10 and locked/);
    expect(duplicatePayrollPeriodRefusalReason(period, posted, 'Sam Patel')).toMatch(/cannot be run again/);
    expect(duplicatePayrollPeriodRefusalReason(period, draft, 'Sam Patel')).not.toMatch(/locked/);
    expect(duplicatePayrollPeriodRefusalReason({ ...period, payPeriodStart: '2026-04-09', payPeriodEnd: '2026-04-22' }, posted, 'Sam Patel')).toBeNull();
  });
});
