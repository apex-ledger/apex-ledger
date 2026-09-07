import { describe, expect, it } from 'vitest';
import { buildRoeXml, computeRoe, payPeriodTypeFor, type RoeInput, type RoePayRun } from './recordOfEmployment';

function biweeklyRuns(count: number, endIso = '2026-08-28'): RoePayRun[] {
  const runs: RoePayRun[] = [];
  const end = new Date(`${endIso}T00:00:00`);
  for (let i = 0; i < count; i++) {
    const periodEnd = new Date(end); periodEnd.setDate(end.getDate() - i * 14);
    const periodStart = new Date(periodEnd); periodStart.setDate(periodEnd.getDate() - 13);
    const payDate = new Date(periodEnd); payDate.setDate(periodEnd.getDate() + 5);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    runs.push({ payPeriodStart: iso(periodStart), payPeriodEnd: iso(periodEnd), payDate: iso(payDate), regularHours: 80, overtimeHours: i === 0 ? 4 : 0, grossPayCents: 200_000, vacationPayCents: 8_000, isVacationPayout: false });
  }
  return runs;
}

const base: RoeInput = {
  employee: { name: 'Priya Shah', sin: '123 456 789', payPeriodsPerYear: 26, payType: 'Hourly', addressLines: ['1 Main St', 'Toronto ON'] },
  employer: { legalName: 'Northwind Ltd', payrollNumber: '123456789RP0001', addressLines: ['9 Bay St', 'Toronto ON'], contactName: 'Nisha', contactPhone: '416-555-0100' },
  runs: [],
  reasonCode: 'A',
  lastDayPaid: '2026-08-28',
  expectedRecall: 'unknown',
};

describe('record of employment', () => {
  it('maps pay frequency to the ROE pay period type', () => {
    expect(payPeriodTypeFor(52)).toBe('W');
    expect(payPeriodTypeFor(26)).toBe('B');
    expect(payPeriodTypeFor(24)).toBe('S');
    expect(payPeriodTypeFor(12)).toBe('M');
  });

  it('reports 15A hours and 15B earnings over the bi-weekly look-back, most recent first', () => {
    const roe = computeRoe({ ...base, runs: biweeklyRuns(30) });
    expect(roe.payPeriodType).toBe('B');
    expect(roe.periodsRequired15B).toBe(14);
    expect(roe.periods).toHaveLength(27);
    expect(roe.periods[0].index).toBe(1);
    expect(roe.periods[0].payPeriodEnd).toBe('2026-08-28');
    expect(roe.periods[0].insurableHours).toBe(84);
    expect(roe.totalInsurableHours).toBe(84 + 26 * 80);
    expect(roe.totalInsurableEarningsCents).toBe(14 * 208_000);
    expect(roe.finalPayPeriodEnd).toBe('2026-08-28');
    expect(roe.warnings).toEqual([]);
  });

  it('adds a vacation payout on separation to 15B and block 17A, and warns on short history', () => {
    const runs = biweeklyRuns(3);
    runs.push({ payPeriodStart: '2026-08-15', payPeriodEnd: '2026-08-28', payDate: '2026-08-28', regularHours: 0, overtimeHours: 0, grossPayCents: 0, vacationPayCents: 50_000, isVacationPayout: true });
    const roe = computeRoe({ ...base, runs, employee: { ...base.employee, sin: null } });
    expect(roe.vacationPayOnSeparationCents).toBe(50_000);
    expect(roe.totalInsurableEarningsCents).toBe(3 * 208_000 + 50_000);
    expect(roe.periods).toHaveLength(3);
    expect(roe.warnings.some((w) => w.includes('Only 3 pay periods'))).toBe(true);
    expect(roe.warnings.some((w) => w.includes('SIN'))).toBe(true);
    const xml = buildRoeXml({ ...base, runs }, roe, '2026-09-01');
    expect(xml).toContain('<B17A code="1" amt="500.00"/>');
  });

  it('counts a salaried employee at the standard week when hours are not recorded', () => {
    const runs = biweeklyRuns(2).map((r) => ({ ...r, regularHours: null, overtimeHours: null }));
    const roe = computeRoe({ ...base, runs, employee: { ...base.employee, payType: 'Salary' } });
    expect(roe.periods[0].insurableHours).toBe(80);
    expect(roe.warnings.some((w) => w.includes('40 hours per week'))).toBe(true);
  });

  it('writes ROE Web XML with the identification blocks, periods and recall code', () => {
    const roe = computeRoe({ ...base, runs: biweeklyRuns(2), expectedRecall: { date: '2026-11-02' } });
    const xml = buildRoeXml({ ...base, runs: biweeklyRuns(2), expectedRecall: { date: '2026-11-02' }, comments: 'Seasonal <layoff>' }, roe, '2026-09-01');
    expect(xml).toContain('<B4>Northwind Ltd</B4>');
    expect(xml).toContain('<B6>B</B6>');
    expect(xml).toContain('<B8>123456789</B8>');
    expect(xml).toContain('<B14>Y</B14>');
    expect(xml).toContain('<B14D>2026-11-02</B14D>');
    expect(xml).toContain('<PP nbr="1" amt="2080.00"/>');
    expect(xml).toContain('<B16>A</B16>');
    expect(xml).toContain('<B16CT>4165550100</B16CT>');
    expect(xml).toContain('<B18>Seasonal &lt;layoff&gt;</B18>');
  });
});
