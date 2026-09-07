import { describe, expect, it } from 'vitest';
import { calculateIncomeTaxForSupportedProvince, type IncomeTaxCalculationInput } from './calculateIncomeTax';

function input(overrides: Partial<IncomeTaxCalculationInput> = {}): IncomeTaxCalculationInput {
  return {
    province: 'ON',
    payPeriodsPerYear: 26,
    periodGrossPayCents: 70000,
    cpp1EmployeeCentsThisPeriod: 0,
    cpp2EmployeeCentsThisPeriod: 0,
    eiEmployeeCentsThisPeriod: 0,
    federalTotalClaimCents: null,
    provincialTotalClaimCents: null,
    additionalTaxCents: null,
    ...overrides,
  };
}

describe('calculateIncomeTaxForSupportedProvince — Ontario', () => {
  it('returns null for any unsupported province', () => {
    expect(calculateIncomeTaxForSupportedProvince(input({ province: 'PE' }))).toBeNull();
    expect(calculateIncomeTaxForSupportedProvince(input({ province: 'NL' }))).toBeNull();
    expect(calculateIncomeTaxForSupportedProvince(input({ province: 'QC' }))).toBeNull();
  });

  it('computes near-zero tax for a low-income employee at the default basic personal amount', () => {
    // Biweekly $700/period, no CPP/EI. A = 26 x 70000 = $18,200 annualized.
    const result = calculateIncomeTaxForSupportedProvince(input());
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(1_820_000);
    expect(result!.annualFederalTaxCents).toBe(3458); // $34.58
    expect(result!.annualProvincialTaxCents).toBe(0);
    expect(result!.totalTaxCentsThisPeriod).toBe(133); // $1.33/period
  });

  it('computes tax across the Ontario surtax and health premium bands for a higher-income employee', () => {
    // Monthly $10,000/period, no CPP/EI. A = 12 x 1,000,000 = $120,000 annualized.
    const result = calculateIncomeTaxForSupportedProvince(input({ payPeriodsPerYear: 12, periodGrossPayCents: 1_000_000 }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(12_000_000);
    expect(result!.annualFederalTaxCents).toBe(1_844_558); // $18,445.58
    expect(result!.annualProvincialTaxCents).toBe(994_753); // $9,947.53 (includes surtax + capped health premium)
    expect(result!.totalTaxCentsThisPeriod).toBe(236_609); // $2,366.09/period
  });

  it('credits CPP and EI contributions against federal and Ontario tax, capped at the annual maximums', () => {
    // Weekly $2,000/period, CPP1 $119.00/period (base-rate portion annualizes over the $3,519.45
    // cap), EI $20.00/period. A = 52 x (200000 - F5A) = $102,960 annualized.
    const result = calculateIncomeTaxForSupportedProvince(
      input({ payPeriodsPerYear: 52, periodGrossPayCents: 200_000, cpp1EmployeeCentsThisPeriod: 11_900, eiEmployeeCentsThisPeriod: 2_000 }),
    );
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(10_296_000);
    expect(result!.annualFederalTaxCents).toBe(1_415_106); // $14,151.06
    expect(result!.annualProvincialTaxCents).toBe(717_598); // $7,175.98
    expect(result!.totalTaxCentsThisPeriod).toBe(41_014); // $410.14/period
  });

  it('reduces tax when a larger TD1 claim amount is provided than the default basic personal amount', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ federalTotalClaimCents: 2_000_000, provincialTotalClaimCents: 1_500_000 }));
    expect(result).not.toBeNull();
    expect(result!.annualFederalTaxCents).toBe(0);
    expect(result!.annualProvincialTaxCents).toBe(0);
    expect(result!.totalTaxCentsThisPeriod).toBe(0);
  });

  it('applies the additional tax deduction (factor L) on top of the calculated amount', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ additionalTaxCents: 5000 }));
    expect(result).not.toBeNull();
    expect(result!.totalTaxCentsThisPeriod).toBe(133 + 5000);
  });
});

describe('calculateIncomeTaxForSupportedProvince — Nova Scotia', () => {
  // Nova Scotia has no surtax, health premium, or tax reduction (T4127's Table 3.1 glossary marks
  // those as Ontario-only or Ontario-and-BC-only) — its provincial tax is just brackets + BPA +
  // the CPP/EI credit, so these figures are hand-computed directly from the T4127 formula rather
  // than compared against a second implementation.

  it('computes tax for a low-income employee at the default basic personal amount', () => {
    // Biweekly $700/period, no CPP/EI. A = $18,200 annualized (first NS bracket, 8.79%).
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'NS' }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(1_820_000);
    expect(result!.annualFederalTaxCents).toBe(3458); // unchanged from Ontario — federal calc doesn't depend on province
    expect(result!.annualProvincialTaxCents).toBe(55_096); // $550.96
    expect(result!.totalTaxCentsThisPeriod).toBe(2252); // $22.52/period
  });

  it('computes tax in the fourth NS bracket for a higher-income employee', () => {
    // Monthly $10,000/period, no CPP/EI. A = $120,000 annualized (falls in the 17.50% NS bracket).
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'NS', payPeriodsPerYear: 12, periodGrossPayCents: 1_000_000 }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(12_000_000);
    expect(result!.annualFederalTaxCents).toBe(1_844_558);
    expect(result!.annualProvincialTaxCents).toBe(1_616_718); // $16,167.18 — no surtax/health premium on top
    expect(result!.totalTaxCentsThisPeriod).toBe(288_440); // $2,884.40/period
  });

  it('credits CPP and EI contributions against NS tax, capped at the annual maximums', () => {
    // Same CPP/EI scenario as the Ontario credit test, for direct comparison.
    const result = calculateIncomeTaxForSupportedProvince(
      input({ province: 'NS', payPeriodsPerYear: 52, periodGrossPayCents: 200_000, cpp1EmployeeCentsThisPeriod: 11_900, eiEmployeeCentsThisPeriod: 2_000 }),
    );
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(10_296_000);
    expect(result!.annualFederalTaxCents).toBe(1_415_106);
    expect(result!.annualProvincialTaxCents).toBe(1_278_440); // $12,784.40
    expect(result!.totalTaxCentsThisPeriod).toBe(51_799); // $517.99/period
  });

  it('zeroes out provincial tax when the TD1NS claim amount exceeds the basic tax payable', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'NS', federalTotalClaimCents: 2_000_000, provincialTotalClaimCents: 2_000_000 }));
    expect(result).not.toBeNull();
    expect(result!.annualFederalTaxCents).toBe(0);
    expect(result!.annualProvincialTaxCents).toBe(0);
    expect(result!.totalTaxCentsThisPeriod).toBe(0);
  });

  it('applies the additional tax deduction (factor L) on top of the calculated amount', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'NS', additionalTaxCents: 5000 }));
    expect(result).not.toBeNull();
    expect(result!.totalTaxCentsThisPeriod).toBe(2252 + 5000);
  });
});

describe('calculateIncomeTaxForSupportedProvince — Alberta', () => {
  // Alberta has no surtax, health premium, or tax reduction either — same shape as Nova Scotia,
  // just with Alberta's own brackets and a much larger flat BPA ($22,769).

  it('zeroes out provincial tax for a low-income employee (BPA exceeds basic tax at this income)', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'AB' }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(1_820_000);
    expect(result!.annualFederalTaxCents).toBe(3458);
    expect(result!.annualProvincialTaxCents).toBe(0);
    expect(result!.totalTaxCentsThisPeriod).toBe(133); // $1.33/period
  });

  it('computes tax in the second AB bracket for a higher-income employee', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'AB', payPeriodsPerYear: 12, periodGrossPayCents: 1_000_000 }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(12_000_000);
    expect(result!.annualFederalTaxCents).toBe(1_844_558);
    expect(result!.annualProvincialTaxCents).toBe(895_448); // $8,954.48
    expect(result!.totalTaxCentsThisPeriod).toBe(228_334); // $2,283.34/period
  });

  it('credits CPP and EI contributions against AB tax, capped at the annual maximums', () => {
    const result = calculateIncomeTaxForSupportedProvince(
      input({ province: 'AB', payPeriodsPerYear: 52, periodGrossPayCents: 200_000, cpp1EmployeeCentsThisPeriod: 11_900, eiEmployeeCentsThisPeriod: 2_000 }),
    );
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(10_296_000);
    expect(result!.annualFederalTaxCents).toBe(1_415_106);
    expect(result!.annualProvincialTaxCents).toBe(688_572); // $6,885.72
    expect(result!.totalTaxCentsThisPeriod).toBe(40_455); // $404.55/period
  });

  it('zeroes out provincial tax when the TD1AB claim amount exceeds the basic tax payable', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'AB', federalTotalClaimCents: 2_000_000, provincialTotalClaimCents: 2_300_000 }));
    expect(result).not.toBeNull();
    expect(result!.annualFederalTaxCents).toBe(0);
    expect(result!.annualProvincialTaxCents).toBe(0);
    expect(result!.totalTaxCentsThisPeriod).toBe(0);
  });

  it('applies the additional tax deduction (factor L) on top of the calculated amount', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'AB', additionalTaxCents: 5000 }));
    expect(result).not.toBeNull();
    expect(result!.totalTaxCentsThisPeriod).toBe(133 + 5000);
  });
});

describe('calculateIncomeTaxForSupportedProvince — British Columbia', () => {
  // BC has no surtax or health premium (Ontario-only), but does have its own tax reduction (S) —
  // unlike Ontario's "twice the basic amount" tent shape, BC's is a linear phase-out: full $805
  // credit (capped at T4) up to $25,570 of taxable income, reduced 3.56% per dollar above that
  // down to $0 at $44,952. These figures are the July 2026 mid-year-prorated values.

  it('fully absorbs basic tax via the tax reduction for a low-income employee', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'BC' }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(1_820_000);
    expect(result!.annualFederalTaxCents).toBe(3458);
    expect(result!.annualProvincialTaxCents).toBe(0); // T4 ($306.02) is fully absorbed by the reduction
    expect(result!.totalTaxCentsThisPeriod).toBe(133); // $1.33/period
  });

  it('computes tax in the fourth BC bracket, above the reduction cutoff, for a higher-income employee', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'BC', payPeriodsPerYear: 12, periodGrossPayCents: 1_000_000 }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(12_000_000);
    expect(result!.annualFederalTaxCents).toBe(1_844_558);
    expect(result!.annualProvincialTaxCents).toBe(826_054); // $8,260.54 — no reduction, income exceeds $44,952
    expect(result!.totalTaxCentsThisPeriod).toBe(222_551); // $2,225.51/period
  });

  it('credits CPP and EI contributions against BC tax, capped at the annual maximums', () => {
    const result = calculateIncomeTaxForSupportedProvince(
      input({ province: 'BC', payPeriodsPerYear: 52, periodGrossPayCents: 200_000, cpp1EmployeeCentsThisPeriod: 11_900, eiEmployeeCentsThisPeriod: 2_000 }),
    );
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(10_296_000);
    expect(result!.annualFederalTaxCents).toBe(1_415_106);
    expect(result!.annualProvincialTaxCents).toBe(611_339); // $6,113.39
    expect(result!.totalTaxCentsThisPeriod).toBe(38_970); // $389.70/period
  });

  it('applies a partial tax reduction inside the $25,570–$44,952 phase-out band', () => {
    // Monthly $3,000/period => $36,000 annualized, squarely inside the phase-out band.
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'BC', payPeriodsPerYear: 12, periodGrossPayCents: 300_000 }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(3_600_000);
    expect(result!.annualFederalTaxCents).toBe(252_658);
    expect(result!.annualProvincialTaxCents).toBe(96_525); // $965.25 — T4 minus a partially phased-out reduction
    expect(result!.totalTaxCentsThisPeriod).toBe(29_099); // $290.99/period
  });

  it('applies no tax reduction once income exceeds the $44,952 phase-out cutoff', () => {
    // Monthly $4,200/period => $50,400 annualized, just above the cutoff.
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'BC', payPeriodsPerYear: 12, periodGrossPayCents: 420_000 }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(5_040_000);
    expect(result!.annualProvincialTaxCents).toBe(228_334); // $2,283.34 — full T4, no reduction applied
    expect(result!.totalTaxCentsThisPeriod).toBe(56_883); // $568.83/period
  });

  it('zeroes out provincial tax when the TD1BC claim amount exceeds the basic tax payable', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'BC', federalTotalClaimCents: 2_000_000, provincialTotalClaimCents: 2_000_000 }));
    expect(result).not.toBeNull();
    expect(result!.annualFederalTaxCents).toBe(0);
    expect(result!.annualProvincialTaxCents).toBe(0);
    expect(result!.totalTaxCentsThisPeriod).toBe(0);
  });

  it('applies the additional tax deduction (factor L) on top of the calculated amount', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'BC', additionalTaxCents: 5000 }));
    expect(result).not.toBeNull();
    expect(result!.totalTaxCentsThisPeriod).toBe(133 + 5000);
  });
});

describe('calculateIncomeTaxForSupportedProvince — New Brunswick', () => {
  // New Brunswick has no surtax, health premium, or tax reduction — same shape as Nova Scotia and
  // Alberta, just with New Brunswick's own brackets and BPA ($13,664).

  it('computes tax for a low-income employee at the default basic personal amount', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'NB' }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(1_820_000);
    expect(result!.annualFederalTaxCents).toBe(3458);
    expect(result!.annualProvincialTaxCents).toBe(42_638); // $426.38
    expect(result!.totalTaxCentsThisPeriod).toBe(1773); // $17.73/period
  });

  it('computes tax in the third NB bracket for a higher-income employee', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'NB', payPeriodsPerYear: 12, periodGrossPayCents: 1_000_000 }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(12_000_000);
    expect(result!.annualFederalTaxCents).toBe(1_844_558);
    expect(result!.annualProvincialTaxCents).toBe(1_341_458); // $13,414.58
    expect(result!.totalTaxCentsThisPeriod).toBe(265_501); // $2,655.01/period
  });

  it('credits CPP and EI contributions against NB tax, capped at the annual maximums', () => {
    const result = calculateIncomeTaxForSupportedProvince(
      input({ province: 'NB', payPeriodsPerYear: 52, periodGrossPayCents: 200_000, cpp1EmployeeCentsThisPeriod: 11_900, eiEmployeeCentsThisPeriod: 2_000 }),
    );
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(10_296_000);
    expect(result!.annualFederalTaxCents).toBe(1_415_106);
    expect(result!.annualProvincialTaxCents).toBe(1_029_439); // $10,294.39
    expect(result!.totalTaxCentsThisPeriod).toBe(47_010); // $470.10/period
  });

  it('zeroes out provincial tax when the TD1NB claim amount exceeds the basic tax payable', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'NB', federalTotalClaimCents: 2_000_000, provincialTotalClaimCents: 2_000_000 }));
    expect(result).not.toBeNull();
    expect(result!.annualFederalTaxCents).toBe(0);
    expect(result!.annualProvincialTaxCents).toBe(0);
    expect(result!.totalTaxCentsThisPeriod).toBe(0);
  });

  it('applies the additional tax deduction (factor L) on top of the calculated amount', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'NB', additionalTaxCents: 5000 }));
    expect(result).not.toBeNull();
    expect(result!.totalTaxCentsThisPeriod).toBe(1773 + 5000);
  });
});

describe('calculateIncomeTaxForSupportedProvince — Manitoba', () => {
  // Manitoba has no surtax, health premium, or tax reduction, but its Basic Personal Amount
  // (BPAMB) phases down linearly from $15,780 to $0 between $200,000 and $400,000 of net income —
  // see the caveat in craIncomeTax2026.ts: this phase-out *shape* is inferred by analogy to the
  // federal BPA formula, not read verbatim from a T4127 formula (canada.ca was unreachable from
  // this environment). The BPAMB amount and threshold range themselves are confirmed against
  // Manitoba's own Ministry of Finance page.

  it('computes tax for a low-income employee at the default (unreduced) basic personal amount', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'MB' }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(1_820_000);
    expect(result!.annualFederalTaxCents).toBe(3458);
    expect(result!.annualProvincialTaxCents).toBe(26_136); // $261.36
    expect(result!.totalTaxCentsThisPeriod).toBe(1138); // $11.38/period
  });

  it('computes tax in the third MB bracket for a higher-income employee, still below the BPA phase-out', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'MB', payPeriodsPerYear: 12, periodGrossPayCents: 1_000_000 }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(12_000_000);
    expect(result!.annualFederalTaxCents).toBe(1_844_558);
    expect(result!.annualProvincialTaxCents).toBe(1_360_876); // $13,608.76
    expect(result!.totalTaxCentsThisPeriod).toBe(267_120); // $2,671.20/period
  });

  it('credits CPP and EI contributions against MB tax, capped at the annual maximums', () => {
    const result = calculateIncomeTaxForSupportedProvince(
      input({ province: 'MB', payPeriodsPerYear: 52, periodGrossPayCents: 200_000, cpp1EmployeeCentsThisPeriod: 11_900, eiEmployeeCentsThisPeriod: 2_000 }),
    );
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(10_296_000);
    expect(result!.annualFederalTaxCents).toBe(1_415_106);
    expect(result!.annualProvincialTaxCents).toBe(1_015_138); // $10,151.38
    expect(result!.totalTaxCentsThisPeriod).toBe(46_735); // $467.35/period
  });

  it('phases down the BPAMB for an employee inside the $200,000–$400,000 net income band', () => {
    // Monthly $25,000/period => $300,000 annualized — the midpoint of the phase-out band, where
    // BPAMB should be exactly half its max ($7,890 instead of $15,780).
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'MB', payPeriodsPerYear: 12, periodGrossPayCents: 2_500_000 }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(30_000_000);
    expect(result!.annualFederalTaxCents).toBe(7_068_980);
    expect(result!.annualProvincialTaxCents).toBe(4_578_088); // $45,780.88
    expect(result!.totalTaxCentsThisPeriod).toBe(970_589); // $9,705.89/period
  });

  it('zeroes out provincial tax when the TD1MB claim amount exceeds the basic tax payable', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'MB', federalTotalClaimCents: 2_000_000, provincialTotalClaimCents: 2_000_000 }));
    expect(result).not.toBeNull();
    expect(result!.annualFederalTaxCents).toBe(0);
    expect(result!.annualProvincialTaxCents).toBe(0);
    expect(result!.totalTaxCentsThisPeriod).toBe(0);
  });

  it('applies the additional tax deduction (factor L) on top of the calculated amount', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'MB', additionalTaxCents: 5000 }));
    expect(result).not.toBeNull();
    expect(result!.totalTaxCentsThisPeriod).toBe(1138 + 5000);
  });
});

describe('calculateIncomeTaxForSupportedProvince — Saskatchewan', () => {
  // Saskatchewan has no surtax, health premium, or tax reduction — same shape as Nova Scotia,
  // Alberta, and New Brunswick, just with Saskatchewan's own brackets and flat BPA ($20,381).

  it('zeroes out provincial tax for a low-income employee (BPA exceeds basic tax at this income)', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'SK' }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(1_820_000);
    expect(result!.annualFederalTaxCents).toBe(3458);
    expect(result!.annualProvincialTaxCents).toBe(0);
    expect(result!.totalTaxCentsThisPeriod).toBe(133); // $1.33/period
  });

  it('computes tax in the second SK bracket for a higher-income employee', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'SK', payPeriodsPerYear: 12, periodGrossPayCents: 1_000_000 }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(12_000_000);
    expect(result!.annualFederalTaxCents).toBe(1_844_558);
    expect(result!.annualProvincialTaxCents).toBe(1_176_899); // $11,768.99
    expect(result!.totalTaxCentsThisPeriod).toBe(251_788); // $2,517.88/period
  });

  it('credits CPP and EI contributions against SK tax, capped at the annual maximums', () => {
    const result = calculateIncomeTaxForSupportedProvince(
      input({ province: 'SK', payPeriodsPerYear: 52, periodGrossPayCents: 200_000, cpp1EmployeeCentsThisPeriod: 11_900, eiEmployeeCentsThisPeriod: 2_000 }),
    );
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(10_296_000);
    expect(result!.annualFederalTaxCents).toBe(1_415_106);
    expect(result!.annualProvincialTaxCents).toBe(916_025); // $9,160.25
    expect(result!.totalTaxCentsThisPeriod).toBe(44_829); // $448.29/period
  });

  it('zeroes out provincial tax when the TD1SK claim amount exceeds the basic tax payable', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'SK', federalTotalClaimCents: 2_000_000, provincialTotalClaimCents: 2_100_000 }));
    expect(result).not.toBeNull();
    expect(result!.annualFederalTaxCents).toBe(0);
    expect(result!.annualProvincialTaxCents).toBe(0);
    expect(result!.totalTaxCentsThisPeriod).toBe(0);
  });

  it('applies the additional tax deduction (factor L) on top of the calculated amount', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ province: 'SK', additionalTaxCents: 5000 }));
    expect(result).not.toBeNull();
    expect(result!.totalTaxCentsThisPeriod).toBe(133 + 5000);
  });
});

describe('calculateIncomeTaxForSupportedProvince — annual deductions (factor F1, RRSP/FHSA)', () => {
  it('subtracts the annual deduction from taxable income once, not once per pay period', () => {
    const base = calculateIncomeTaxForSupportedProvince(input({ payPeriodsPerYear: 26, periodGrossPayCents: 400_000 }));
    const withRrsp = calculateIncomeTaxForSupportedProvince(
      input({ payPeriodsPerYear: 26, periodGrossPayCents: 400_000, annualDeductionsCents: 1_000_000 }),
    );
    expect(base).not.toBeNull();
    expect(withRrsp).not.toBeNull();
    // 26 × $4,000 = $104,000 annualized, less a single $10,000 contribution.
    expect(base!.taxableIncomeCents).toBe(10_400_000);
    expect(withRrsp!.taxableIncomeCents).toBe(9_400_000);
  });

  it('lowers tax payable, and treating it as null is the same as zero', () => {
    const withDeduction = calculateIncomeTaxForSupportedProvince(input({ annualDeductionsCents: 500_000 }));
    const withZero = calculateIncomeTaxForSupportedProvince(input({ annualDeductionsCents: 0 }));
    const withNull = calculateIncomeTaxForSupportedProvince(input({ annualDeductionsCents: null }));
    const omitted = calculateIncomeTaxForSupportedProvince(input());
    expect(withZero!.totalTaxCentsThisPeriod).toBe(omitted!.totalTaxCentsThisPeriod);
    expect(withNull!.totalTaxCentsThisPeriod).toBe(omitted!.totalTaxCentsThisPeriod);
    expect(withDeduction!.totalTaxCentsThisPeriod).toBeLessThan(omitted!.totalTaxCentsThisPeriod);
  });

  it('floors taxable income at zero when the deduction exceeds annual income', () => {
    const result = calculateIncomeTaxForSupportedProvince(input({ periodGrossPayCents: 100_000, annualDeductionsCents: 99_999_999 }));
    expect(result).not.toBeNull();
    expect(result!.taxableIncomeCents).toBe(0);
    expect(result!.totalTaxCentsThisPeriod).toBe(0);
  });
});
