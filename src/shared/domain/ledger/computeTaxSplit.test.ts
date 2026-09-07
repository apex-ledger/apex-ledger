import { describe, expect, it } from 'vitest';
import { categoryLineAmountCents, computeTaxSplit, suggestTaxCents, totalLineAmountCents } from './computeTaxSplit';
import { TAX_CODE_DEFINITIONS } from './taxCodes';

describe('computeTaxSplit', () => {
  it('treats HST as fully claimable', () => {
    expect(computeTaxSplit('HST', 1300)).toEqual({ claimableTaxCents: 1300, nonClaimableTaxCents: 0, totalTaxCents: 1300, provincialClaimableCents: 0 });
  });

  it('treats Manual as fully claimable, same as HST', () => {
    expect(computeTaxSplit('Manual', 875)).toEqual({ claimableTaxCents: 875, nonClaimableTaxCents: 0, totalTaxCents: 875, provincialClaimableCents: 0 });
  });

  it('treats USTax as fully non-claimable — not a Canadian ITC', () => {
    expect(computeTaxSplit('USTax', 800)).toEqual({ claimableTaxCents: 0, nonClaimableTaxCents: 800, totalTaxCents: 800, provincialClaimableCents: 0 });
  });

  it('splits Meals & Entertainment HST 50/50 claimable vs non-claimable', () => {
    expect(computeTaxSplit('MealsHST', 1300)).toEqual({ claimableTaxCents: 650, nonClaimableTaxCents: 650, totalTaxCents: 1300, provincialClaimableCents: 0 });
  });

  it('rounds the claimable half of an odd Meals tax amount, giving the remainder to non-claimable', () => {
    // 101 cents split: round(50.5) = 50 (banker's rounding away, Math.round rounds .5 up) -> 51/50
    expect(computeTaxSplit('MealsHST', 101)).toEqual({ claimableTaxCents: 51, nonClaimableTaxCents: 50, totalTaxCents: 101, provincialClaimableCents: 0 });
  });

  it('produces no tax for NonHST or null', () => {
    expect(computeTaxSplit('NonHST', 0)).toEqual({ claimableTaxCents: 0, nonClaimableTaxCents: 0, totalTaxCents: 0, provincialClaimableCents: 0 });
    expect(computeTaxSplit(null, 0)).toEqual({ claimableTaxCents: 0, nonClaimableTaxCents: 0, totalTaxCents: 0, provincialClaimableCents: 0 });
  });

  it('sends the provincial slice to the province: PST on a sale, QST both ways, PST on a purchase stays a cost', () => {
    // BC sale: 12% on $100 = $12; $5 GST to CRA, $7 PST to BC — all of it remitted.
    expect(computeTaxSplit('GST_PST_BC', 1200, 'sale')).toEqual({ claimableTaxCents: 1200, nonClaimableTaxCents: 0, totalTaxCents: 1200, provincialClaimableCents: 700 });
    // BC purchase: only the $5 GST is an ITC; the PST is a cost folded into the expense.
    expect(computeTaxSplit('GST_PST_BC', 1200)).toEqual({ claimableTaxCents: 500, nonClaimableTaxCents: 700, totalTaxCents: 1200, provincialClaimableCents: 0 });
    // QC purchase, registered: both halves come back; the QST half in its own recoverable account.
    expect(computeTaxSplit('GST_QST_QC', 1498)).toEqual({ claimableTaxCents: 1498, nonClaimableTaxCents: 0, totalTaxCents: 1498, provincialClaimableCents: 998 });
  });

  it('rejects a negative or non-integer tax amount', () => {
    expect(() => computeTaxSplit('HST', -1)).toThrow('non-negative integer');
    expect(() => computeTaxSplit('HST', 1.5)).toThrow('non-negative integer');
  });
});

describe('suggestTaxCents', () => {
  it('suggests 13% for HST and MealsHST', () => {
    expect(suggestTaxCents('HST', 10000)).toBe(1300);
    expect(suggestTaxCents('MealsHST', 10000)).toBe(1300);
  });

  it('suggests 8% for USTax', () => {
    expect(suggestTaxCents('USTax', 10000)).toBe(800);
  });

  it('suggests 0 for NonHST, Manual, and null', () => {
    expect(suggestTaxCents('NonHST', 10000)).toBe(0);
    expect(suggestTaxCents('Manual', 10000)).toBe(0);
    expect(suggestTaxCents(null, 10000)).toBe(0);
  });
});

describe('categoryLineAmountCents / totalLineAmountCents', () => {
  it('folds non-claimable tax into the category line but not into a fully-claimable one', () => {
    const meals = computeTaxSplit('MealsHST', 1300);
    expect(categoryLineAmountCents(10000, meals)).toBe(10650); // base + non-recoverable half
    expect(totalLineAmountCents(10000, meals)).toBe(11300); // base + full tax paid

    const hst = computeTaxSplit('HST', 1300);
    expect(categoryLineAmountCents(10000, hst)).toBe(10000); // fully claimable, nothing folded in
    expect(totalLineAmountCents(10000, hst)).toBe(11300);
  });
});

describe('provincial tax codes', () => {
  it('suggests the right tax on $100 for each province', () => {
    // $100.00 pre-tax, so the cents figure reads as the rate itself.
    expect(suggestTaxCents('GST', 100_00)).toBe(5_00);
    expect(suggestTaxCents('HST', 100_00)).toBe(13_00); // ON
    expect(suggestTaxCents('HST_NS', 100_00)).toBe(14_00); // cut from 15% in April 2025
    expect(suggestTaxCents('HST_15', 100_00)).toBe(15_00); // NB, NL, PE
    expect(suggestTaxCents('GST_PST_BC', 100_00)).toBe(12_00);
    expect(suggestTaxCents('GST_PST_SK', 100_00)).toBe(11_00);
    expect(suggestTaxCents('GST_RST_MB', 100_00)).toBe(12_00);
    expect(suggestTaxCents('GST_QST_QC', 100_00)).toBe(14_98); // 14.975% of $100 is $14.975, rounds up
  });

  it('claims only the federal share where the province charges its own sales tax', () => {
    // BC: $12.00 of tax on $100 is 5% GST + 7% PST. Only the $5.00 is recoverable; the $7.00 PST
    // is a real cost and must land back in the expense account.
    const bc = computeTaxSplit('GST_PST_BC', 12_00);
    expect(bc.claimableTaxCents).toBe(5_00);
    expect(bc.nonClaimableTaxCents).toBe(7_00);

    const sk = computeTaxSplit('GST_PST_SK', 11_00);
    expect(sk.claimableTaxCents).toBe(5_00);
    expect(sk.nonClaimableTaxCents).toBe(6_00);

    const mb = computeTaxSplit('GST_RST_MB', 12_00);
    expect(mb.claimableTaxCents).toBe(5_00);
    expect(mb.nonClaimableTaxCents).toBe(7_00);
  });

  it('claims the QST only when the business is registered for it', () => {
    // Same 14.975% either way; what differs is how much of it comes back.
    const registered = computeTaxSplit('GST_QST_QC', 14_98);
    expect(registered.claimableTaxCents).toBe(14_98);
    expect(registered.nonClaimableTaxCents).toBe(0);

    const notRegistered = computeTaxSplit('GST_QST_QC_NR', 14_98);
    expect(notRegistered.claimableTaxCents).toBe(5_00); // the federal 5% on a $100 purchase
    expect(notRegistered.nonClaimableTaxCents).toBe(9_98); // the QST is a real cost
  });

  it('claims all of GST and HST', () => {
    expect(computeTaxSplit('GST', 5_00).claimableTaxCents).toBe(5_00);
    expect(computeTaxSplit('HST_NS', 14_00).claimableTaxCents).toBe(14_00);
    expect(computeTaxSplit('HST_15', 15_00).claimableTaxCents).toBe(15_00);
  });

  it('always splits into two halves that add back to what was entered', () => {
    for (const code of TAX_CODE_DEFINITIONS.map((d) => d.code)) {
      const split = computeTaxSplit(code, 999_99);
      if (code === 'NonHST') continue; // means no tax at all, not tax of zero recoverability
      expect(split.claimableTaxCents + split.nonClaimableTaxCents).toBe(split.totalTaxCents);
      expect(split.totalTaxCents).toBe(999_99);
    }
  });
});
