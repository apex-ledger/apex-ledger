import { describe, expect, it } from 'vitest';
import { computePeriodPresets } from './periodPresets';

function byId(id: string, today: string) {
  return computePeriodPresets(today).find((p) => p.id === id)!;
}

describe('computePeriodPresets', () => {
  it('this quarter covers the calendar quarter containing today, compared to the quarter before it', () => {
    const p = byId('thisQuarter', '2026-05-15'); // May -> Q2
    expect(p.periodStart).toBe('2026-04-01');
    expect(p.periodEnd).toBe('2026-06-30');
    expect(p.comparativeStart).toBe('2026-01-01');
    expect(p.comparativeEnd).toBe('2026-03-31');
  });

  it('this quarter wraps back across a year boundary for Q1', () => {
    const p = byId('thisQuarter', '2026-02-10'); // Feb -> Q1 2026
    expect(p.periodStart).toBe('2026-01-01');
    expect(p.periodEnd).toBe('2026-03-31');
    expect(p.comparativeStart).toBe('2025-10-01');
    expect(p.comparativeEnd).toBe('2025-12-31');
  });

  it('last quarter is one quarter behind this quarter, compared to the quarter before that', () => {
    const p = byId('lastQuarter', '2026-05-15'); // this=Q2, last=Q1
    expect(p.periodStart).toBe('2026-01-01');
    expect(p.periodEnd).toBe('2026-03-31');
    expect(p.comparativeStart).toBe('2025-10-01');
    expect(p.comparativeEnd).toBe('2025-12-31');
  });

  it('this half covers Jan-Jun or Jul-Dec, compared to the other half of the prior year boundary correctly', () => {
    const h1 = byId('thisHalf', '2026-03-01');
    expect(h1.periodStart).toBe('2026-01-01');
    expect(h1.periodEnd).toBe('2026-06-30');
    expect(h1.comparativeStart).toBe('2025-07-01');
    expect(h1.comparativeEnd).toBe('2025-12-31');

    const h2 = byId('thisHalf', '2026-09-01');
    expect(h2.periodStart).toBe('2026-07-01');
    expect(h2.periodEnd).toBe('2026-12-31');
    expect(h2.comparativeStart).toBe('2026-01-01');
    expect(h2.comparativeEnd).toBe('2026-06-30');
  });

  it('this year is the calendar year, compared to last year', () => {
    const p = byId('thisYear', '2026-08-07');
    expect(p.periodStart).toBe('2026-01-01');
    expect(p.periodEnd).toBe('2026-12-31');
    expect(p.comparativeStart).toBe('2025-01-01');
    expect(p.comparativeEnd).toBe('2025-12-31');
  });

  it('last year is the prior calendar year, compared to the year before that', () => {
    const p = byId('lastYear', '2026-08-07');
    expect(p.periodStart).toBe('2025-01-01');
    expect(p.periodEnd).toBe('2025-12-31');
    expect(p.comparativeStart).toBe('2024-01-01');
    expect(p.comparativeEnd).toBe('2024-12-31');
  });

  it('handles a leap-year February in a quarter end correctly', () => {
    const p = byId('thisQuarter', '2028-02-10');
    expect(p.periodEnd).toBe('2028-03-31');
  });
});
