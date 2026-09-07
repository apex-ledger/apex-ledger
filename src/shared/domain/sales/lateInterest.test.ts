import { describe, expect, it } from 'vitest';
import { computeLateInterest } from './lateInterest';

describe('late-payment interest', () => {
  it('charges simple interest from the day after the due date', () => {
    // $1,000 at 18% a year, due June 30, charged to July 30: 30 days.
    const r = computeLateInterest({ balanceDueCents: 100000, dueDate: '2026-06-30', chargedThrough: null, asOf: '2026-07-30', annualRatePercent: 18 });
    expect(r).toEqual({ fromDate: '2026-07-01', toDate: '2026-07-30', days: 30, interestCents: 1479 });
  });

  it('continues from the last charge rather than starting over', () => {
    const r = computeLateInterest({ balanceDueCents: 100000, dueDate: '2026-06-30', chargedThrough: '2026-07-30', asOf: '2026-08-31', annualRatePercent: 18 });
    expect(r?.fromDate).toBe('2026-07-31');
    expect(r?.days).toBe(32);
  });

  it('charges nothing before the due date, on a paid invoice, or without a rate', () => {
    expect(computeLateInterest({ balanceDueCents: 100000, dueDate: '2026-06-30', chargedThrough: null, asOf: '2026-06-30', annualRatePercent: 18 })).toBeNull();
    expect(computeLateInterest({ balanceDueCents: 0, dueDate: '2026-06-30', chargedThrough: null, asOf: '2026-08-30', annualRatePercent: 18 })).toBeNull();
    expect(computeLateInterest({ balanceDueCents: 100000, dueDate: '2026-06-30', chargedThrough: null, asOf: '2026-08-30', annualRatePercent: 0 })).toBeNull();
  });

  it('does not double-charge a period already billed', () => {
    expect(computeLateInterest({ balanceDueCents: 100000, dueDate: '2026-06-30', chargedThrough: '2026-08-30', asOf: '2026-08-30', annualRatePercent: 18 })).toBeNull();
  });
});
