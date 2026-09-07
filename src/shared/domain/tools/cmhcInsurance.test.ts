import { describe, expect, it } from 'vitest';
import { computeCmhcPremium, computeMinimumDownPaymentCents } from './cmhcInsurance';

describe('computeMinimumDownPaymentCents', () => {
  it('is 5% for a price at or under $500,000', () => {
    expect(computeMinimumDownPaymentCents(400_000_00)).toBe(20_000_00);
    expect(computeMinimumDownPaymentCents(500_000_00)).toBe(25_000_00);
  });

  it('blends 5% and 10% tiers above $500,000', () => {
    // $1,500,000 -> 5% of 500k ($25k) + 10% of remaining 1,000k ($100k) = $125k
    expect(computeMinimumDownPaymentCents(1_500_000_00)).toBe(125_000_00);
  });
});

describe('computeCmhcPremium', () => {
  it('applies the 0.60% rate at 65% LTV or lower', () => {
    const result = computeCmhcPremium({
      purchasePriceCents: 500_000_00,
      downPaymentCents: 200_000_00, // 60% LTV
      downPaymentType: 'traditional',
      amortizationYears: 25,
      isFirstTimeBuyerOrNewBuild: false,
    });
    expect(result.eligibleForInsurance).toBe(true);
    expect(result.baseRatePercent).toBe(0.6);
    expect(result.premiumCents).toBe(Math.round(300_000_00 * 0.006));
  });

  it('applies the 4.00% rate at 95% LTV with a traditional down payment, and 4.50% for non-traditional', () => {
    const base = { purchasePriceCents: 500_000_00, downPaymentCents: 25_000_00, amortizationYears: 25 as const, isFirstTimeBuyerOrNewBuild: false };
    const traditional = computeCmhcPremium({ ...base, downPaymentType: 'traditional' });
    const nonTraditional = computeCmhcPremium({ ...base, downPaymentType: 'nonTraditional' });
    expect(traditional.baseRatePercent).toBe(4.0);
    expect(nonTraditional.baseRatePercent).toBe(4.5);
  });

  it('flags a down payment below the minimum as ineligible', () => {
    const result = computeCmhcPremium({
      purchasePriceCents: 500_000_00,
      downPaymentCents: 10_000_00,
      downPaymentType: 'traditional',
      amortizationYears: 25,
      isFirstTimeBuyerOrNewBuild: false,
    });
    expect(result.eligibleForInsurance).toBe(false);
    expect(result.premiumCents).toBe(0);
  });

  it('flags homes priced at $1.5M or more as ineligible for insurance', () => {
    const result = computeCmhcPremium({
      purchasePriceCents: 160_000_000, // $1,600,000.00
      downPaymentCents: 32_000_000, // $320,000.00 (20%)
      downPaymentType: 'traditional',
      amortizationYears: 25,
      isFirstTimeBuyerOrNewBuild: false,
    });
    expect(result.eligibleForInsurance).toBe(false);
  });

  it('applies a 0.20% surcharge for a first-time buyer choosing 30-year amortization on a high-ratio loan', () => {
    const base = { purchasePriceCents: 500_000_00, downPaymentCents: 25_000_00, downPaymentType: 'traditional' as const };
    const result25 = computeCmhcPremium({ ...base, amortizationYears: 25, isFirstTimeBuyerOrNewBuild: true });
    const result30 = computeCmhcPremium({ ...base, amortizationYears: 30, isFirstTimeBuyerOrNewBuild: true });
    expect(result25.surchargeApplied).toBe(false);
    expect(result30.surchargeApplied).toBe(true);
    expect(result30.totalRatePercent).toBeCloseTo(result25.totalRatePercent + 0.2);
  });

  it('does not apply the 30-year surcharge to a buyer who is not first-time or a new build', () => {
    const result = computeCmhcPremium({
      purchasePriceCents: 500_000_00,
      downPaymentCents: 25_000_00,
      downPaymentType: 'traditional',
      amortizationYears: 30,
      isFirstTimeBuyerOrNewBuild: false,
    });
    expect(result.surchargeApplied).toBe(false);
  });
});
