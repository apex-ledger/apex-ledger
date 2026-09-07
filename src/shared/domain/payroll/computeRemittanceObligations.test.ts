import { describe, expect, it } from 'vitest';
import type { PayrollRun } from '../types';
import { computeRemittanceObligations } from './computeRemittanceObligations';

function run(payDate: string, amount = 52_200): PayrollRun {
  return {
    id: Number(payDate.replaceAll('-', '')),
    employeeId: 1,
    payPeriodStart: payDate,
    payPeriodEnd: payDate,
    payDate,
    regularHours: 8,
    overtimeHours: null,
    regularPayCents: 100_000,
    overtimePayCents: 0,
    grossPayCents: 100_000,
    vacationPayCents: 0,
    cpp1EmployeeCents: 10_000,
    cpp1EmployerCents: 10_000,
    cpp2EmployeeCents: 0,
    cpp2EmployerCents: 0,
    eiEmployeeCents: 3_000,
    eiEmployerCents: 4_200,
    wsibEmployerCents: 0,
    rrspEmployerMatchCents: 0,
    healthBenefitCents: 0,
    incomeTaxCents: amount - 27_200,
    netPayCents: 77_000,
    status: 'posted',
    journalEntryId: 1,
    isVacationPayout: false,
  };
}

describe('computeRemittanceObligations', () => {
  it('groups regular remitters by pay month and uses the next-month 15th', () => {
    const rows = computeRemittanceObligations([run('2026-01-09'), run('2026-01-23')], '2026-01-01', '2026-01-31', 'regular');
    expect(rows).toHaveLength(1);
    expect(rows[0].dueDate).toBe('2026-02-15');
    expect(rows[0].totalRemittanceCents).toBe(104_400);
  });

  it('uses quarter-end due dates only for eligible quarterly remitters', () => {
    const rows = computeRemittanceObligations([run('2026-02-06')], '2026-01-01', '2026-03-31', 'quarterly');
    expect(rows[0]).toMatchObject({ periodStart: '2026-01-01', periodEnd: '2026-03-31', dueDate: '2026-04-15' });
  });

  it('splits threshold 1 into the two CRA remitting periods', () => {
    const rows = computeRemittanceObligations([run('2026-01-09'), run('2026-01-23')], '2026-01-01', '2026-01-31', 'accelerated1');
    expect(rows.map((row) => row.dueDate)).toEqual(['2026-01-25', '2026-02-10']);
  });

  it('marks threshold 2 dates as estimates because public holidays require CRA confirmation', () => {
    const rows = computeRemittanceObligations([run('2026-01-09')], '2026-01-01', '2026-01-31', 'accelerated2');
    expect(rows[0]).toMatchObject({ periodStart: '2026-01-08', periodEnd: '2026-01-14', dueDate: '2026-01-19', dueDateEstimate: true });
  });
});
