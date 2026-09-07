/**
 * CRA Payroll Deductions Formulas (T4127) constants for 2026 — federal, Ontario, Nova Scotia,
 * Alberta, British Columbia, New Brunswick, Manitoba, and Saskatchewan, "Option 1 – Indexing"
 * method. Federal/Ontario sourced from the T4127-JAN, 122nd Edition, effective January 1, 2026.
 * Nova Scotia, Alberta, British Columbia, New Brunswick, and Saskatchewan (and the confirmation
 * that ON's figures carried forward unchanged) sourced from the T4127-JUL, 123rd Edition,
 * effective July 1, 2026
 * (canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas.html),
 * Table 8.1 and Table 8.2 — read directly from the published PDF, not recalled from memory. Per
 * the 123rd edition's glossary (Table 3.1), the V1 surtax and V2 health premium are Ontario-only,
 * and the S tax reduction is Ontario-and-BC-only — Nova Scotia, Alberta, New Brunswick, and
 * Saskatchewan have none of those, so their provincial tax is just brackets + BPA + the standard
 * CPP/EI credit, structurally like the federal calculation. British Columbia's tax reduction has
 * its own formula
 * (Chapter 5's British Columbia section, Table 8.2's S2 column) — a linear phase-out between two
 * income thresholds, not Ontario's "twice the basic amount" shape, so it's implemented separately.
 * Manitoba's brackets are from the same T4127-JUL Table 8.1 as the others, but its Basic Personal
 * Amount (BPAMB) formula could NOT be verified against T4127 directly — canada.ca is unreachable
 * from this environment (both WebFetch and direct network access return errors/403s). The BPAMB
 * max ($15,780) and phase-out range (net income $200,000–$400,000, to $0) are sourced from
 * Manitoba's own Ministry of Finance page (gov.mb.ca/finance/personal/pcredits.html), a legitimate
 * primary source for the province's own numbers — but the *shape* of the phase-out (linear
 * interpolation between the two thresholds) is inferred by analogy to the federal BPAF formula
 * below, not read verbatim from CRA's T4127 formula text like every other constant in this file.
 * Re-verify against an actual T4127 edition (which reproduces the exact formula) when one becomes
 * available. These change twice a year (January and July editions); re-verify against the current
 * T4127 edition before relying on them for a new half-year, same posture as craRates2026.ts for
 * CPP/EI.
 */

/** One bracket boundary: at annual taxable income >= `threshold`, this marginal rate and
 * subtraction constant apply. Sorted ascending by threshold. */
export interface TaxBracket {
  thresholdCents: number;
  rate: number;
  constantCents: number;
}

export const FEDERAL_BRACKETS_2026: TaxBracket[] = [
  { thresholdCents: 0, rate: 0.14, constantCents: 0 },
  { thresholdCents: 58_523_00, rate: 0.205, constantCents: 3_804_00 },
  { thresholdCents: 117_045_00, rate: 0.26, constantCents: 10_241_00 },
  { thresholdCents: 181_440_00, rate: 0.29, constantCents: 15_685_00 },
  { thresholdCents: 258_482_00, rate: 0.33, constantCents: 26_024_00 },
];

export const ONTARIO_BRACKETS_2026: TaxBracket[] = [
  { thresholdCents: 0, rate: 0.0505, constantCents: 0 },
  { thresholdCents: 53_891_00, rate: 0.0915, constantCents: 2_210_00 },
  { thresholdCents: 107_785_00, rate: 0.1116, constantCents: 4_376_00 },
  { thresholdCents: 150_000_00, rate: 0.1216, constantCents: 5_876_00 },
  { thresholdCents: 220_000_00, rate: 0.1316, constantCents: 8_076_00 },
];

/** Federal Basic Personal Amount (BPAF) — the TD1 default federal claim when no TD1 is filed or
 * the employee only claims the basic amount. Phases down between the two net-income thresholds. */
export const FEDERAL_BPAF_2026 = {
  maxCents: 16_452_00,
  minCents: 14_829_00,
  phaseOutStartCents: 181_440_00,
  phaseOutEndCents: 258_482_00,
} as const;

/** Ontario Basic Personal Amount — flat, no phase-out. */
export const ONTARIO_BPA_2026_CENTS = 12_989_00;

/** Nova Scotia provincial tax brackets — T4127 Table 8.1, effective July 1, 2026 (unchanged from
 * the January 1, 2026 edition). */
export const NOVA_SCOTIA_BRACKETS_2026: TaxBracket[] = [
  { thresholdCents: 0, rate: 0.0879, constantCents: 0 },
  { thresholdCents: 30_995_00, rate: 0.1495, constantCents: 1_909_00 },
  { thresholdCents: 61_991_00, rate: 0.1667, constantCents: 2_976_00 },
  { thresholdCents: 97_417_00, rate: 0.1750, constantCents: 3_784_00 },
  { thresholdCents: 157_124_00, rate: 0.2100, constantCents: 9_283_00 },
];

/** Nova Scotia Basic Personal Amount (BPANS) — flat, no phase-out (the Government of Nova Scotia
 * set it to the maximum for all income levels starting the 2025 tax year). T4127 Table 8.2. */
export const NOVA_SCOTIA_BPA_2026_CENTS = 11_932_00;

/** Alberta provincial tax brackets — T4127 Table 8.1, effective July 1, 2026 (unchanged from the
 * January 1, 2026 edition). */
export const ALBERTA_BRACKETS_2026: TaxBracket[] = [
  { thresholdCents: 0, rate: 0.08, constantCents: 0 },
  { thresholdCents: 61_200_00, rate: 0.1, constantCents: 1_224_00 },
  { thresholdCents: 154_259_00, rate: 0.12, constantCents: 4_309_00 },
  { thresholdCents: 185_111_00, rate: 0.13, constantCents: 6_160_00 },
  { thresholdCents: 246_813_00, rate: 0.14, constantCents: 8_628_00 },
  { thresholdCents: 370_220_00, rate: 0.15, constantCents: 12_331_00 },
];

/** Alberta Basic Personal Amount — flat, no phase-out. T4127 Table 8.2. */
export const ALBERTA_BPA_2026_CENTS = 22_769_00;

/** British Columbia provincial tax brackets — T4127 Table 8.1, effective July 1, 2026. The first
 * bracket's 6.14% rate is a mid-year proration of a rate change announced February 17, 2026 (lowest
 * rate rising from 5.06% to 5.60% for the full 2026 year; since employers used the lower rate for
 * H1, a prorated 6.14% applies for H2 to average out to 5.60% for the year). */
export const BRITISH_COLUMBIA_BRACKETS_2026: TaxBracket[] = [
  { thresholdCents: 0, rate: 0.0614, constantCents: 0 },
  { thresholdCents: 50_363_00, rate: 0.077, constantCents: 786_00 },
  { thresholdCents: 100_728_00, rate: 0.105, constantCents: 3_606_00 },
  { thresholdCents: 115_648_00, rate: 0.1229, constantCents: 5_676_00 },
  { thresholdCents: 140_430_00, rate: 0.147, constantCents: 9_061_00 },
  { thresholdCents: 190_405_00, rate: 0.168, constantCents: 13_059_00 },
  { thresholdCents: 265_545_00, rate: 0.205, constantCents: 22_884_00 },
];

/** British Columbia Basic Personal Amount — flat, no phase-out. T4127 Table 8.2 and confirmed via
 * Table 8.11's claim code 1 (TCP $13,216.00, K1P $811.46 = 0.0614 × 13,216.00, exact match). */
export const BRITISH_COLUMBIA_BPA_2026_CENTS = 13_216_00;

/** British Columbia tax reduction (S) — T4127 Chapter 5's British Columbia section. A prorated
 * mid-year value: full $805 credit (capped at T4) up to $25,570 of annual taxable income, linearly
 * phased out at 3.56% of income above that down to $0 at $44,952. Also announced Feb 17, 2026 (full
 * 2026 basic reduction rising from $562 to $690; H2's prorated value is $805). */
export const BRITISH_COLUMBIA_TAX_REDUCTION_2026 = {
  basicCents: 805_00,
  phaseOutStartCents: 25_570_00,
  phaseOutEndCents: 44_952_00,
  phaseOutRate: 0.0356,
};

/** New Brunswick provincial tax brackets — T4127 Table 8.1, effective July 1, 2026 (unchanged from
 * the January 1, 2026 edition). */
export const NEW_BRUNSWICK_BRACKETS_2026: TaxBracket[] = [
  { thresholdCents: 0, rate: 0.094, constantCents: 0 },
  { thresholdCents: 52_333_00, rate: 0.14, constantCents: 2_407_00 },
  { thresholdCents: 104_666_00, rate: 0.16, constantCents: 4_501_00 },
  { thresholdCents: 193_861_00, rate: 0.195, constantCents: 11_286_00 },
];

/** New Brunswick Basic Personal Amount — flat, no phase-out. T4127 Table 8.2. */
export const NEW_BRUNSWICK_BPA_2026_CENTS = 13_664_00;

/** Manitoba provincial tax brackets — T4127 Table 8.1, effective July 1, 2026 (unchanged from the
 * January 1, 2026 edition). */
export const MANITOBA_BRACKETS_2026: TaxBracket[] = [
  { thresholdCents: 0, rate: 0.108, constantCents: 0 },
  { thresholdCents: 47_000_00, rate: 0.1275, constantCents: 917_00 },
  { thresholdCents: 100_000_00, rate: 0.174, constantCents: 5_567_00 },
];

/** Manitoba Basic Personal Amount (BPAMB) — phased down linearly between the two net-income
 * thresholds, same shape as FEDERAL_BPAF_2026. See this file's header comment: the phase-out
 * *shape* is inferred by analogy, not read verbatim from a T4127 formula. */
export const MANITOBA_BPA_2026 = {
  maxCents: 15_780_00,
  minCents: 0,
  phaseOutStartCents: 200_000_00,
  phaseOutEndCents: 400_000_00,
} as const;

/** Saskatchewan provincial tax brackets — T4127 Table 8.1, effective July 1, 2026 (unchanged from
 * the January 1, 2026 edition). */
export const SASKATCHEWAN_BRACKETS_2026: TaxBracket[] = [
  { thresholdCents: 0, rate: 0.105, constantCents: 0 },
  { thresholdCents: 54_532_00, rate: 0.125, constantCents: 1_091_00 },
  { thresholdCents: 155_805_00, rate: 0.145, constantCents: 4_207_00 },
];

/** Saskatchewan Basic Personal Amount — flat, no phase-out. T4127 Table 8.2. */
export const SASKATCHEWAN_BPA_2026_CENTS = 20_381_00;

/** Canada Employment Amount — caps the K4 federal credit. */
export const FEDERAL_CEA_2026_CENTS = 1_501_00;

export const BASE_CPP_2026 = {
  rate: 0.0495,
  maxContributionCents: 3_519_45,
};

export const EI_2026 = {
  maxEmployeeContributionCents: 1_123_07,
};

/** Ontario surtax (V1) bands, applied to the basic Ontario tax (T4). */
export const ONTARIO_SURTAX_2026 = {
  firstThresholdCents: 5_818_00,
  firstRate: 0.2,
  secondThresholdCents: 7_446_00,
  secondRate: 0.36,
};

/** Ontario Health Premium (V2) bands, applied to annual taxable income (A). */
export const ONTARIO_HEALTH_PREMIUM_BANDS_2026 = [
  { aboveCents: 200_000_00, capCents: 900_00, baseCents: 750_00, rate: 0.25, bandFloorCents: 200_000_00 },
  { aboveCents: 72_000_00, capCents: 750_00, baseCents: 600_00, rate: 0.25, bandFloorCents: 72_000_00 },
  { aboveCents: 48_000_00, capCents: 600_00, baseCents: 450_00, rate: 0.25, bandFloorCents: 48_000_00 },
  { aboveCents: 36_000_00, capCents: 450_00, baseCents: 300_00, rate: 0.06, bandFloorCents: 36_000_00 },
  { aboveCents: 20_000_00, capCents: 300_00, baseCents: 0, rate: 0.06, bandFloorCents: 20_000_00 },
] as const;

/** Ontario tax reduction (S) basic amount — doubled per T4127's `2 × ($300 + Y)`, with Y (the
 * dependant add-on) not tracked by this app and treated as $0. */
export const ONTARIO_TAX_REDUCTION_BASIC_2026_CENTS = 300_00;

/**
 * 2026 registered-plan contribution limits, used to sanity-check RRSP/FHSA amounts entered in the
 * personal income tax estimate. Both are deductions from net income (T1 lines 20800 and 20805).
 *
 * RRSP room is the LESSER of 18% of the prior year's earned income and the annual dollar limit, so
 * the dollar limit alone is only an upper bound — a person's real room comes from their CRA Notice
 * of Assessment (it also carries forward unused room from earlier years, which can put real room
 * well above the annual limit). Treat any check against these as advisory, never as a hard cap.
 *
 * FHSA is a flat $8,000 per year against a $40,000 lifetime maximum, neither indexed to inflation;
 * unused annual room carries forward one year only (max $16,000 in a single year), which this app
 * does not attempt to model.
 */
export const REGISTERED_PLAN_LIMITS_2026 = {
  rrspAnnualDollarLimitCents: 33_810_00,
  rrspEarnedIncomePercent: 0.18,
  fhsaAnnualLimitCents: 8_000_00,
  fhsaLifetimeLimitCents: 40_000_00,
} as const;
