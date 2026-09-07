import { describe, expect, it } from 'vitest';
import { computeMileageClaim, FIRST_TIER_KM, isTerritory, MILEAGE_RATES, rateForYear, type Trip } from './mileage';

function trip(overrides: Partial<Trip> = {}): Trip {
  return { id: 1, tripDate: '2026-03-01', kilometres: 100, purpose: 'Client visit', vehicle: null, ...overrides };
}

describe('the published rates', () => {
  it('has 2026 at 73¢ then 67¢', () => {
    // Verified against Finance Canada's January 2026 announcement rather than from memory. Without
    // the 2026 entry every claim this year quietly fell back to 2025 and understated by a cent a km.
    const { rate, fellBack } = rateForYear(2026);
    expect(fellBack).toBe(false);
    expect(rate.firstTierCentsPerKm).toBe(73);
    expect(rate.afterFirstTierCentsPerKm).toBe(67);
  });

  it('has 2025 at 72¢ then 66¢', () => {
    const { rate } = rateForYear(2025);
    expect(rate.firstTierCentsPerKm).toBe(72);
    expect(rate.afterFirstTierCentsPerKm).toBe(66);
  });

  it('always drops after the first tier, never rises', () => {
    for (const rate of MILEAGE_RATES) {
      expect(rate.afterFirstTierCentsPerKm, String(rate.year)).toBeLessThan(rate.firstTierCentsPerKm);
    }
  });

  it('is listed newest first, which the fallback depends on', () => {
    const years = MILEAGE_RATES.map((r) => r.year);
    expect([...years].sort((a, b) => b - a)).toEqual(years);
  });
});

describe('a year with no published rate', () => {
  it('uses the newest known one rather than refusing', () => {
    // A claim a cent out is obviously fixable; a blank screen at year end is not.
    const { rate, fellBack } = rateForYear(2099);
    expect(fellBack).toBe(true);
    expect(rate.year).toBe(MILEAGE_RATES[0].year);
  });

  it('says that it fell back, so nobody files it believing otherwise', () => {
    expect(computeMileageClaim([], 2099, 'ON').rateFellBack).toBe(true);
    expect(computeMileageClaim([], 2026, 'ON').rateFellBack).toBe(false);
  });
});

describe('the 5,000 km step', () => {
  it('charges the first tier rate below it', () => {
    const result = computeMileageClaim([trip({ kilometres: 100 })], 2026, 'ON');
    expect(result.totalCents).toBe(100 * 73);
  });

  it('charges the lower rate above it', () => {
    const trips = [trip({ id: 1, tripDate: '2026-01-01', kilometres: 5000 }), trip({ id: 2, tripDate: '2026-06-01', kilometres: 100 })];
    const result = computeMileageClaim(trips, 2026, 'ON');
    expect(result.totalCents).toBe(5000 * 73 + 100 * 67);
  });

  it('splits a single trip that straddles it', () => {
    // Charging the whole trip at one rate is the obvious shortcut and it is wrong in both
    // directions depending on which rate you pick.
    const result = computeMileageClaim([trip({ kilometres: 6000 })], 2026, 'ON');
    expect(result.trips[0].firstTierKm).toBe(5000);
    expect(result.trips[0].afterFirstTierKm).toBe(1000);
    expect(result.totalCents).toBe(5000 * 73 + 1000 * 67);
  });

  it('resets each January', () => {
    // The step is per calendar year. Carrying it over would put every January trip on the low rate.
    const trips = [
      trip({ id: 1, tripDate: '2025-06-01', kilometres: 6000 }),
      trip({ id: 2, tripDate: '2026-01-05', kilometres: 100 }),
    ];
    expect(computeMileageClaim(trips, 2026, 'ON').totalCents).toBe(100 * 73);
  });

  it('reports how far past the step the year went', () => {
    const result = computeMileageClaim([trip({ kilometres: 6000 })], 2026, 'ON');
    expect(result.kmAtLowerRate).toBe(1000);
  });

  it('steps at exactly 5,000, not one km either side', () => {
    const result = computeMileageClaim([trip({ kilometres: FIRST_TIER_KM })], 2026, 'ON');
    expect(result.trips[0].afterFirstTierKm).toBe(0);
    expect(result.totalCents).toBe(FIRST_TIER_KM * 73);
  });
});

describe('order of travel', () => {
  it('takes trips in date order, not the order they were entered', () => {
    // The same trip is worth more in March than in November, so entry order must not change the
    // total.
    const entered = [
      trip({ id: 2, tripDate: '2026-11-01', kilometres: 3000 }),
      trip({ id: 1, tripDate: '2026-03-01', kilometres: 3000 }),
    ];
    const reversed = [...entered].reverse();
    expect(computeMileageClaim(entered, 2026, 'ON').totalCents).toBe(computeMileageClaim(reversed, 2026, 'ON').totalCents);
  });

  it('runs the cumulative total in date order', () => {
    const trips = [
      trip({ id: 2, tripDate: '2026-11-01', kilometres: 100 }),
      trip({ id: 1, tripDate: '2026-03-01', kilometres: 200 }),
    ];
    const result = computeMileageClaim(trips, 2026, 'ON');
    expect(result.trips.map((t) => t.cumulativeKm)).toEqual([200, 300]);
  });
});

describe('the territories', () => {
  it('adds 4¢ a kilometre', () => {
    // 77¢ then 71¢ in 2026, which is the published territorial figure.
    const result = computeMileageClaim([trip({ kilometres: 100 })], 2026, 'NT');
    expect(result.totalCents).toBe(100 * 77);
  });

  it('applies the supplement above the step too', () => {
    const result = computeMileageClaim([trip({ kilometres: 6000 })], 2026, 'YT');
    expect(result.totalCents).toBe(5000 * 77 + 1000 * 71);
  });

  it('recognises them by code or by name', () => {
    expect(isTerritory('NU')).toBe(true);
    expect(isTerritory('Nunavut')).toBe(true);
    expect(isTerritory('ON')).toBe(false);
    expect(isTerritory(null)).toBe(false);
  });
});

describe('which trips count', () => {
  it('ignores trips from another year', () => {
    const trips = [trip({ id: 1, tripDate: '2025-06-01' }), trip({ id: 2, tripDate: '2026-06-01' })];
    expect(computeMileageClaim(trips, 2026, 'ON').trips).toHaveLength(1);
  });

  it('handles a year with no travel', () => {
    const result = computeMileageClaim([], 2026, 'ON');
    expect(result.totalKm).toBe(0);
    expect(result.totalCents).toBe(0);
  });

  it('refuses to let a negative distance reduce the claim', () => {
    const result = computeMileageClaim([trip({ kilometres: -100 })], 2026, 'ON');
    expect(result.totalCents).toBe(0);
  });
});
