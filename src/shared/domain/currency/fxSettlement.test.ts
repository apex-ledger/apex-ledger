import { describe, expect, it } from 'vitest';
import { foreignOutstandingCents, settleForeignPayment } from './fxSettlement';

describe('settling a foreign-currency document', () => {
  it('books a realized gain when a receivable converts at a better rate than it was invoiced', () => {
    const s = settleForeignPayment({ foreignPaidCents: 100_000, foreignOutstandingCents: 100_000, cadOutstandingCents: 135_000, documentRate: 1.35, paymentRate: 1.38, side: 'receivable' });
    expect(s).toEqual({ cadRelievedCents: 135_000, cadCashCents: 138_000, gainLossCents: 3_000, clearsDocument: true });
  });

  it('books a loss on a payable when more CAD leaves than was booked', () => {
    const s = settleForeignPayment({ foreignPaidCents: 50_000, foreignOutstandingCents: 50_000, cadOutstandingCents: 67_500, documentRate: 1.35, paymentRate: 1.40, side: 'payable' });
    expect(s.cadCashCents).toBe(70_000);
    expect(s.gainLossCents).toBe(-2_500);
  });

  it('relieves a partial payment in proportion at the booked rate', () => {
    const s = settleForeignPayment({ foreignPaidCents: 40_000, foreignOutstandingCents: 100_000, cadOutstandingCents: 135_000, documentRate: 1.35, paymentRate: 1.35, side: 'receivable' });
    expect(s).toEqual({ cadRelievedCents: 54_000, cadCashCents: 54_000, gainLossCents: 0, clearsDocument: false });
  });

  it('lets the final payment take exactly what is left, so rounding never strands a cent', () => {
    // USD 333.33 at 1.2345 = CAD 411.50; two thirds paid earlier left an awkward remainder.
    const s = settleForeignPayment({ foreignPaidCents: 11_111, foreignOutstandingCents: 11_111, cadOutstandingCents: 13_717, documentRate: 1.2345, paymentRate: 1.2345, side: 'receivable' });
    expect(s.cadRelievedCents).toBe(13_717);
    expect(s.clearsDocument).toBe(true);
  });

  it('refuses paying more than is outstanding, or nothing at all', () => {
    expect(() => settleForeignPayment({ foreignPaidCents: 0, foreignOutstandingCents: 100, cadOutstandingCents: 135, documentRate: 1.35, paymentRate: 1.35, side: 'receivable' })).toThrow();
    expect(() => settleForeignPayment({ foreignPaidCents: 101, foreignOutstandingCents: 100, cadOutstandingCents: 135, documentRate: 1.35, paymentRate: 1.35, side: 'payable' })).toThrow();
  });

  it('derives the foreign remainder from the CAD remainder', () => {
    expect(foreignOutstandingCents(100_000, 135_000, 135_000)).toBe(100_000);
    expect(foreignOutstandingCents(100_000, 135_000, 81_000)).toBe(60_000);
    expect(foreignOutstandingCents(100_000, 135_000, 0)).toBe(0);
  });
});
