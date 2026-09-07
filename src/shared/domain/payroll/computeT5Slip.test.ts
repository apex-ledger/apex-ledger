import { describe, expect, it } from 'vitest';
import { computeT5Slip, computeT5SlipsForYear } from './computeT5Slip';
import type { Shareholder, T5Payment } from '../types';

let nextId = 1;
function makePayment(overrides: Partial<T5Payment>): T5Payment {
  nextId += 1;
  return {
    id: nextId,
    shareholderId: 1,
    paymentDate: '2026-06-15',
    paymentType: 'eligible_dividend',
    amountCents: 100000,
    bankAccountId: 1,
    memo: null,
    journalEntryId: 1,
    ...overrides,
  };
}

function makeShareholder(overrides: Partial<Shareholder>): Shareholder {
  return {
    id: 1,
    name: 'Jane Shareholder',
    email: null,
    phone: null,
    address: null,
    notes: null,
    sin: '123456789',
    businessNumber: null,
    loanAccountId: null,
    isActive: true,
    ...overrides,
  };
}

describe('computeT5Slip', () => {
  it('computes box 24/25/26 for an eligible dividend', () => {
    const shareholder = makeShareholder({ id: 1 });
    const payments = [makePayment({ shareholderId: 1, paymentType: 'eligible_dividend', amountCents: 1_000_000, paymentDate: '2026-03-01' })];
    const slip = computeT5Slip(payments, shareholder, 2026);
    expect(slip.eligibleDividendsCents).toBe(1_000_000); // box 24
    expect(slip.eligibleTaxableCents).toBe(1_380_000); // box 25 = box24 x 1.38
    expect(slip.eligibleDtcCents).toBe(207_273); // box 26 = box25 x 0.150198
    expect(slip.nonEligibleDividendsCents).toBe(0);
    expect(slip.interestCents).toBe(0);
  });

  it('computes box 10/11/12 for a non-eligible dividend', () => {
    const shareholder = makeShareholder({ id: 1 });
    const payments = [makePayment({ shareholderId: 1, paymentType: 'non_eligible_dividend', amountCents: 500_000, paymentDate: '2026-05-01' })];
    const slip = computeT5Slip(payments, shareholder, 2026);
    expect(slip.nonEligibleDividendsCents).toBe(500_000); // box 10
    expect(slip.nonEligibleTaxableCents).toBe(575_000); // box 11 = box10 x 1.15
    expect(slip.nonEligibleDtcCents).toBe(51_923); // box 12 = box11 x 0.090301
  });

  it('reports interest at face value with no gross-up or credit (box 13)', () => {
    const shareholder = makeShareholder({ id: 1 });
    const payments = [makePayment({ shareholderId: 1, paymentType: 'interest', amountCents: 200_000, paymentDate: '2026-12-31' })];
    const slip = computeT5Slip(payments, shareholder, 2026);
    expect(slip.interestCents).toBe(200_000);
    expect(slip.eligibleDividendsCents).toBe(0);
    expect(slip.nonEligibleDividendsCents).toBe(0);
  });

  it('sums multiple payments of the same type and keeps types separate', () => {
    const shareholder = makeShareholder({ id: 1 });
    const payments = [
      makePayment({ shareholderId: 1, paymentType: 'eligible_dividend', amountCents: 100_000, paymentDate: '2026-01-01' }),
      makePayment({ shareholderId: 1, paymentType: 'eligible_dividend', amountCents: 200_000, paymentDate: '2026-06-01' }),
      makePayment({ shareholderId: 1, paymentType: 'non_eligible_dividend', amountCents: 50_000, paymentDate: '2026-09-01' }),
      makePayment({ shareholderId: 1, paymentType: 'interest', amountCents: 10_000, paymentDate: '2026-12-01' }),
    ];
    const slip = computeT5Slip(payments, shareholder, 2026);
    expect(slip.eligibleDividendsCents).toBe(300_000);
    expect(slip.nonEligibleDividendsCents).toBe(50_000);
    expect(slip.interestCents).toBe(10_000);
  });

  it('excludes payments from other years or other shareholders', () => {
    const shareholder = makeShareholder({ id: 1 });
    const payments = [
      makePayment({ shareholderId: 1, paymentDate: '2025-12-31', amountCents: 999_999 }),
      makePayment({ shareholderId: 2, paymentDate: '2026-06-01', amountCents: 999_999 }),
    ];
    const slip = computeT5Slip(payments, shareholder, 2026);
    expect(slip.eligibleDividendsCents).toBe(0);
  });
});

describe('computeT5SlipsForYear', () => {
  it('produces one slip per shareholder with payments that year, sorted by name, omitting those with none', () => {
    const shareholders = [makeShareholder({ id: 1, name: 'Zed' }), makeShareholder({ id: 2, name: 'Amy' }), makeShareholder({ id: 3, name: 'No Payments' })];
    const payments = [makePayment({ shareholderId: 1, paymentDate: '2026-01-01' }), makePayment({ shareholderId: 2, paymentDate: '2026-06-01' })];
    const slips = computeT5SlipsForYear(payments, shareholders, 2026);
    expect(slips.map((s) => s.shareholderName)).toEqual(['Amy', 'Zed']);
  });
});
