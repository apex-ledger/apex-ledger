import { describe, expect, it } from 'vitest';
import { computePd7aSummary, computePd7aMonthlyBreakdown } from './computePd7aSummary';
import type { PayrollRun } from '../types';

let nextId = 1;
function makeRun(overrides: Partial<PayrollRun>): PayrollRun {
  nextId += 1;
  return {
    id: nextId,
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

describe('computePd7aSummary', () => {
  it('sums CPP/EI/tax across posted runs in the pay-date range', () => {
    const runs = [makeRun({ payDate: '2026-01-16', employeeId: 1 }), makeRun({ payDate: '2026-01-30', employeeId: 2 })];
    const result = computePd7aSummary(runs, '2026-01-01', '2026-01-31');
    expect(result.payRunCount).toBe(2);
    expect(result.employeeCount).toBe(2);
    expect(result.cppEmployeeCents).toBe(20000);
    expect(result.cppEmployerCents).toBe(20000);
    expect(result.eiEmployeeCents).toBe(6000);
    expect(result.eiEmployerCents).toBe(8400);
    expect(result.incomeTaxCents).toBe(50000);
    expect(result.totalRemittanceCents).toBe(20000 + 20000 + 6000 + 8400 + 50000);
    expect(result.grossPayrollCents).toBe((200000 + 8000) * 2);
  });

  it('excludes draft runs', () => {
    const runs = [makeRun({ payDate: '2026-01-16', status: 'draft' })];
    const result = computePd7aSummary(runs, '2026-01-01', '2026-01-31');
    expect(result.payRunCount).toBe(0);
    expect(result.totalRemittanceCents).toBe(0);
  });

  it('excludes runs outside the pay-date range', () => {
    const runs = [makeRun({ payDate: '2026-02-01' })];
    const result = computePd7aSummary(runs, '2026-01-01', '2026-01-31');
    expect(result.payRunCount).toBe(0);
  });

  it('counts distinct employees, not runs', () => {
    const runs = [makeRun({ employeeId: 1, payDate: '2026-01-16' }), makeRun({ employeeId: 1, payDate: '2026-01-30' })];
    const result = computePd7aSummary(runs, '2026-01-01', '2026-01-31');
    expect(result.payRunCount).toBe(2);
    expect(result.employeeCount).toBe(1);
  });
});

describe('computePd7aMonthlyBreakdown', () => {
  it('produces one row per month that has posted runs, sorted', () => {
    const runs = [
      makeRun({ payDate: '2026-02-13' }),
      makeRun({ payDate: '2026-01-16' }),
      makeRun({ payDate: '2026-01-30' }),
      makeRun({ payDate: '2026-03-13', status: 'draft' }), // excluded — draft
    ];
    const rows = computePd7aMonthlyBreakdown(runs);
    expect(rows.map((r) => r.payDateFrom)).toEqual(['2026-01-01', '2026-02-01']);
    expect(rows[0].payRunCount).toBe(2);
    expect(rows[1].payRunCount).toBe(1);
  });

  it('returns an empty array when there are no posted runs', () => {
    expect(computePd7aMonthlyBreakdown([makeRun({ status: 'draft' })])).toEqual([]);
  });
});
