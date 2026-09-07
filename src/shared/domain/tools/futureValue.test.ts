import { describe, expect, it } from 'vitest';
import { computeFutureValue, computeRequiredMonthlyContribution } from './futureValue';

describe('computeFutureValue', () => {
  it('with zero rate, future value is exactly the sum of contributions (no growth)', () => {
    const result = computeFutureValue({ startingAmountCents: 100_000, monthlyContributionCents: 10_000, annualRatePercent: 0, years: 2 });
    expect(result.futureValueCents).toBe(100_000 + 10_000 * 24);
    expect(result.totalGrowthCents).toBe(0);
  });

  it('grows a lump sum with no contributions at compound interest', () => {
    // $10,000 at 12%/year compounded monthly (1%/month) for 12 months -> 10000 * 1.01^12
    const result = computeFutureValue({ startingAmountCents: 1_000_000, monthlyContributionCents: 0, annualRatePercent: 12, years: 1 });
    const expected = Math.round(1_000_000 * Math.pow(1.01, 12));
    expect(result.futureValueCents).toBe(expected);
    expect(result.totalContributedCents).toBe(1_000_000);
    expect(result.totalGrowthCents).toBe(expected - 1_000_000);
  });

  it('combines lump sum and contribution growth', () => {
    const result = computeFutureValue({ startingAmountCents: 500_000, monthlyContributionCents: 20_000, annualRatePercent: 6, years: 5 });
    expect(result.futureValueCents).toBeGreaterThan(result.totalContributedCents);
    expect(result.totalContributedCents).toBe(500_000 + 20_000 * 60);
  });
});

describe('computeRequiredMonthlyContribution', () => {
  it('returns 0 when the starting amount alone already reaches the target', () => {
    const monthly = computeRequiredMonthlyContribution({ targetAmountCents: 100_000, startingAmountCents: 1_000_000, annualRatePercent: 5, years: 10 });
    expect(monthly).toBe(0);
  });

  it('solves for a contribution that, fed back through computeFutureValue, reaches the target', () => {
    const input = { targetAmountCents: 10_000_000, startingAmountCents: 500_000, annualRatePercent: 7, years: 15 };
    const monthly = computeRequiredMonthlyContribution(input);
    expect(monthly).toBeGreaterThan(0);
    const result = computeFutureValue({ startingAmountCents: input.startingAmountCents, monthlyContributionCents: monthly, annualRatePercent: input.annualRatePercent, years: input.years });
    // Rounded to the nearest cent per month, so the result should land within a few cents of target.
    expect(Math.abs(result.futureValueCents - input.targetAmountCents)).toBeLessThan(500);
  });

  it('with zero rate, required contribution is the shortfall spread evenly across months', () => {
    const monthly = computeRequiredMonthlyContribution({ targetAmountCents: 240_000, startingAmountCents: 0, annualRatePercent: 0, years: 2 });
    expect(monthly).toBe(240_000 / 24);
  });
});
