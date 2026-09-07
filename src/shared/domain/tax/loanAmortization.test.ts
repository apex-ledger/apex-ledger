import { describe, expect, it } from 'vitest';
import { amortizationSchedule, paymentAmountCents, periodicRate, yearSplit, type LoanTerms } from './loanAmortization';

const MORTGAGE: LoanTerms = {
  principalCents: 300_000_00,
  annualRate: 0.05,
  frequency: 'monthly',
  numberOfPayments: 300, // 25 years
  compounding: 'semiAnnual',
};

const EQUIPMENT_LOAN: LoanTerms = {
  principalCents: 50_000_00,
  annualRate: 0.06,
  frequency: 'monthly',
  numberOfPayments: 60,
  compounding: 'perPayment',
};

describe('periodicRate', () => {
  it('divides the rate evenly when the loan compounds each payment', () => {
    expect(periodicRate({ annualRate: 0.06, frequency: 'monthly', compounding: 'perPayment' })).toBeCloseTo(0.005, 10);
  });

  it('converts through the effective annual rate for a Canadian mortgage', () => {
    // 5% compounded semi-annually is 5.0625% effective; the monthly rate is its twelfth root, which
    // is slightly BELOW the naive 5%/12. Getting this wrong is why hand-built schedules disagree
    // with the lender by a few dollars a month.
    const rate = periodicRate({ annualRate: 0.05, frequency: 'monthly', compounding: 'semiAnnual' });
    expect(rate).toBeCloseTo(0.004123915, 8);
    expect(rate).toBeLessThan(0.05 / 12);
  });

  it('handles a zero-rate loan without dividing by nothing', () => {
    expect(periodicRate({ annualRate: 0, frequency: 'monthly', compounding: 'perPayment' })).toBe(0);
  });
});

describe('paymentAmountCents', () => {
  it('computes the level payment for an equipment loan', () => {
    // 50,000 at 6% over 5 years monthly is the textbook 966.64.
    expect(paymentAmountCents(EQUIPMENT_LOAN)).toBe(966_64);
  });

  it('splits a zero-interest loan evenly', () => {
    const terms: LoanTerms = { ...EQUIPMENT_LOAN, annualRate: 0, numberOfPayments: 10 };
    expect(paymentAmountCents(terms)).toBe(5_000_00);
  });
});

describe('amortizationSchedule', () => {
  it('clears the loan exactly, with no cent left behind', () => {
    const r = amortizationSchedule(EQUIPMENT_LOAN);
    expect(r.rows).toHaveLength(60);
    expect(r.rows[r.rows.length - 1].closingBalanceCents).toBe(0);
    expect(r.totalPrincipalCents).toBe(EQUIPMENT_LOAN.principalCents);
  });

  it('charges more interest at the start and more principal at the end', () => {
    const r = amortizationSchedule(EQUIPMENT_LOAN);
    const first = r.rows[0];
    const last = r.rows[r.rows.length - 1];

    expect(first.interestCents).toBeGreaterThan(last.interestCents);
    expect(first.principalCents).toBeLessThan(last.principalCents);
  });

  it('charges the first month exactly one period of interest', () => {
    const r = amortizationSchedule(EQUIPMENT_LOAN);
    expect(r.rows[0].interestCents).toBe(250_00); // 50,000 × 0.5%
    expect(r.rows[0].openingBalanceCents).toBe(50_000_00);
  });

  it('adds up: every payment is its own interest plus principal', () => {
    const r = amortizationSchedule(EQUIPMENT_LOAN);
    for (const row of r.rows) {
      expect(row.interestCents + row.principalCents, `payment ${row.paymentNumber}`).toBe(row.paymentCents);
      expect(row.openingBalanceCents - row.principalCents).toBe(row.closingBalanceCents);
    }
  });

  it('costs less over a Canadian mortgage than naive monthly compounding would', () => {
    const canadian = amortizationSchedule(MORTGAGE);
    const naive = amortizationSchedule({ ...MORTGAGE, compounding: 'perPayment' });
    expect(canadian.totalInterestCents).toBeLessThan(naive.totalInterestCents);
    expect(canadian.rows[canadian.rows.length - 1].closingBalanceCents).toBe(0);
  });

  it('stops rather than printing an endless schedule when the payment cannot cover the interest', () => {
    const r = amortizationSchedule(EQUIPMENT_LOAN, 100_00); // less than the 250.00 of interest
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].principalCents).toBe(0);
    expect(r.rows[0].closingBalanceCents).toBe(EQUIPMENT_LOAN.principalCents);
  });

  it('lets a larger payment clear the loan early', () => {
    const r = amortizationSchedule(EQUIPMENT_LOAN, 2_000_00);
    expect(r.rows.length).toBeLessThan(60);
    expect(r.rows[r.rows.length - 1].closingBalanceCents).toBe(0);
  });

  it('handles a zero-interest loan as pure principal', () => {
    const r = amortizationSchedule({ ...EQUIPMENT_LOAN, annualRate: 0, numberOfPayments: 10 });
    expect(r.totalInterestCents).toBe(0);
    expect(r.totalPrincipalCents).toBe(50_000_00);
  });
});

describe('yearSplit', () => {
  it('gives the interest and principal for one fiscal year', () => {
    const r = amortizationSchedule(EQUIPMENT_LOAN);
    const year1 = yearSplit(r, 1, 12);

    expect(year1.interestCents + year1.principalCents).toBe(
      r.rows.slice(0, 12).reduce((sum, row) => sum + row.paymentCents, 0),
    );
    expect(year1.closingBalanceCents).toBe(r.rows[11].closingBalanceCents);
  });

  it('charges less interest in the second year than the first', () => {
    const r = amortizationSchedule(EQUIPMENT_LOAN);
    expect(yearSplit(r, 13, 24).interestCents).toBeLessThan(yearSplit(r, 1, 12).interestCents);
  });

  it('returns nothing for a year outside the schedule', () => {
    const r = amortizationSchedule(EQUIPMENT_LOAN);
    expect(yearSplit(r, 200, 220).interestCents).toBe(0);
  });
});
