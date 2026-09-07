import { describe, expect, it } from 'vitest';
import { depreciationSchedule, disposalFigures, lastDayOfMonth, missingMonths, monthlyDepreciationCents, nextMonth } from './fixedAssets';

const laptop = { costCents: 240_000, salvageCents: 0, inServiceDate: '2026-01-15', method: 'straightLine' as const, usefulLifeMonths: 24, decliningRate: 0 };
const van = { costCents: 3_600_000, salvageCents: 600_000, inServiceDate: '2026-03-01', method: 'decliningBalance' as const, usefulLifeMonths: 60, decliningRate: 0.3 };

describe('fixed assets', () => {
  it('walks months and month ends', () => {
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28');
  });

  it('straight-line spreads cost evenly and lands exactly on salvage', () => {
    expect(monthlyDepreciationCents(laptop, 0, 0)).toBe(10_000);
    const rows = depreciationSchedule(laptop, '2027-12');
    expect(rows).toHaveLength(24);
    expect(rows.at(-1)).toMatchObject({ month: '2027-12', accumulatedCents: 240_000, bookValueCents: 0 });
    expect(depreciationSchedule(laptop, '2028-03').at(-1)?.amountCents).toBe(0);
  });

  it('declining balance takes rate/12 of book value and never goes below salvage', () => {
    expect(monthlyDepreciationCents(van, 0, 0)).toBe(90_000);
    const rows = depreciationSchedule(van, '2031-02');
    expect(rows).toHaveLength(60);
    expect(rows.at(-1)?.bookValueCents).toBe(600_000);
    expect(rows.every((r) => r.bookValueCents >= 600_000)).toBe(true);
  });

  it('respects amounts already posted and lists only the missing months', () => {
    const taken = [{ month: '2026-01', amountCents: 10_000 }, { month: '2026-02', amountCents: 10_000 }];
    expect(missingMonths(laptop, '2026-04', taken)).toEqual(['2026-03', '2026-04']);
    const rows = depreciationSchedule(laptop, '2026-03', [{ month: '2026-01', amountCents: 12_000 }]);
    expect(rows[0].amountCents).toBe(12_000);
    expect(rows[1].amountCents).toBe(Math.round(228_000 / 23));
  });

  it('computes gain or loss on disposal', () => {
    expect(disposalFigures(240_000, 200_000, 50_000)).toMatchObject({ bookValueCents: 40_000, gainLossCents: 10_000 });
    expect(disposalFigures(240_000, 100_000, 100_000).gainLossCents).toBe(-40_000);
  });
});
