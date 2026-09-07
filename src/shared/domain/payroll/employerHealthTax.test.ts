import { describe, expect, it } from 'vitest';
import type { Employee, PayrollRun } from '../types';
import { computeEht, ehtByMonth, ehtGraduatedRate, ontarioRemunerationCents } from './employerHealthTax';

describe('Ontario Employer Health Tax', () => {
  it('charges nothing to an eligible employer under the exemption', () => {
    expect(computeEht({ remunerationCents: 80_000_000, exemptionEligible: true, exemptionCents: 100_000_000 }).taxCents).toBe(0);
  });

  it('charges 1.95% on remuneration above the exemption', () => {
    const r = computeEht({ remunerationCents: 150_000_000, exemptionEligible: true, exemptionCents: 100_000_000 });
    expect(r.taxableCents).toBe(50_000_000);
    expect(r.taxCents).toBe(975_000);
    expect(r.instalmentsRequired).toBe(true);
  });

  it('uses the graduated rate on the whole amount when there is no exemption', () => {
    expect(ehtGraduatedRate(15_000_000)).toBe(0.0098);
    expect(ehtGraduatedRate(35_000_000)).toBe(0.0195);
    expect(ehtGraduatedRate(90_000_000)).toBe(0.0195);
    const r = computeEht({ remunerationCents: 25_000_000, exemptionEligible: false, exemptionCents: 100_000_000 });
    expect(r.exemptionAppliedCents).toBe(0);
    expect(r.taxCents).toBe(Math.round(25_000_000 * 0.01223));
  });

  it('withdraws the exemption above five million', () => {
    const r = computeEht({ remunerationCents: 600_000_000, exemptionEligible: true, exemptionCents: 100_000_000 });
    expect(r.exemptionAppliedCents).toBe(0);
    expect(r.taxCents).toBe(Math.round(600_000_000 * 0.0195));
  });

  const employees = [
    { id: 1, province: 'ON' },
    { id: 2, province: 'BC' },
  ] as unknown as Employee[];
  const run = (employeeId: number, payDate: string, gross: number, status: 'posted' | 'draft' = 'posted') =>
    ({ id: Math.random(), employeeId, payDate, grossPayCents: gross, vacationPayCents: 0, status }) as unknown as PayrollRun;

  it('counts only posted Ontario pay in the range', () => {
    const runs = [run(1, '2026-01-15', 100_000), run(1, '2026-02-15', 100_000, 'draft'), run(2, '2026-01-15', 100_000), run(1, '2025-12-31', 100_000)];
    expect(ontarioRemunerationCents(runs, employees, '2026-01-01', '2026-12-31')).toBe(100_000);
  });

  it('spreads the year\'s tax across the months after the exemption is used up', () => {
    // $150,000 a month to one Ontario employee: the $1M exemption is exhausted in month 7.
    const runs = Array.from({ length: 12 }, (_, i) => run(1, `2026-${String(i + 1).padStart(2, '0')}-15`, 15_000_000));
    const months = ehtByMonth(runs, employees, 2026, true, 100_000_000);
    expect(months.slice(0, 6).every((m) => m.taxCents === 0)).toBe(true);
    expect(months[6].taxCents).toBe(Math.round(5_000_000 * 0.0195));
    expect(months.reduce((s, m) => s + m.taxCents, 0)).toBe(Math.round(80_000_000 * 0.0195));
  });
});
