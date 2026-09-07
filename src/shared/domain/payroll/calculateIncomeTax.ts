import { CRA_PAYROLL_RATES_2026 } from './craRates2026';
import {
  ALBERTA_BPA_2026_CENTS,
  ALBERTA_BRACKETS_2026,
  BASE_CPP_2026,
  BRITISH_COLUMBIA_BPA_2026_CENTS,
  BRITISH_COLUMBIA_BRACKETS_2026,
  BRITISH_COLUMBIA_TAX_REDUCTION_2026,
  EI_2026,
  FEDERAL_BPAF_2026,
  FEDERAL_BRACKETS_2026,
  FEDERAL_CEA_2026_CENTS,
  MANITOBA_BPA_2026,
  MANITOBA_BRACKETS_2026,
  NEW_BRUNSWICK_BPA_2026_CENTS,
  NEW_BRUNSWICK_BRACKETS_2026,
  NOVA_SCOTIA_BPA_2026_CENTS,
  NOVA_SCOTIA_BRACKETS_2026,
  ONTARIO_BPA_2026_CENTS,
  ONTARIO_BRACKETS_2026,
  ONTARIO_HEALTH_PREMIUM_BANDS_2026,
  ONTARIO_SURTAX_2026,
  ONTARIO_TAX_REDUCTION_BASIC_2026_CENTS,
  SASKATCHEWAN_BPA_2026_CENTS,
  SASKATCHEWAN_BRACKETS_2026,
  type TaxBracket,
} from './craIncomeTax2026';

/** Provinces this app can auto-calculate income tax for. Every other province still needs a
 * manual PDOC entry (see calculateIncomeTaxForSupportedProvince). Manitoba's Basic Personal Amount
 * phase-out shape is inferred rather than read verbatim from T4127 — see the note in
 * craIncomeTax2026.ts. */
export const SUPPORTED_AUTO_TAX_PROVINCES = ['ON', 'NS', 'AB', 'BC', 'NB', 'MB', 'SK'] as const;
export type SupportedAutoTaxProvince = (typeof SUPPORTED_AUTO_TAX_PROVINCES)[number];

export function isSupportedAutoTaxProvince(province: string): province is SupportedAutoTaxProvince {
  return (SUPPORTED_AUTO_TAX_PROVINCES as readonly string[]).includes(province);
}

/** Full display names for the supported provinces, for UI copy that needs to name which province
 * is being auto-calculated. */
export const SUPPORTED_AUTO_TAX_PROVINCE_NAMES: Record<SupportedAutoTaxProvince, string> = {
  ON: 'Ontario',
  NS: 'Nova Scotia',
  AB: 'Alberta',
  BC: 'British Columbia',
  NB: 'New Brunswick',
  MB: 'Manitoba',
  SK: 'Saskatchewan',
};

export interface IncomeTaxCalculationInput {
  province: string;
  payPeriodsPerYear: number;
  /** Gross remuneration for the pay period (regular + overtime + vacation pay paid out this
   * period) — CRA's factor I. Does not include bonuses/non-periodic payments (not supported). */
  periodGrossPayCents: number;
  /** This period's CPP1 (base + first-additional, at the full 5.95% rate) and CPP2 employee
   * contributions and EI employee premium — the same figures calculatePay already computes. */
  cpp1EmployeeCentsThisPeriod: number;
  cpp2EmployeeCentsThisPeriod: number;
  eiEmployeeCentsThisPeriod: number;
  /** TD1 federal/provincial "Total Claim Amount" — null means "use the current year's basic
   * personal amount" (the correct default when no TD1 was filed). */
  federalTotalClaimCents: number | null;
  provincialTotalClaimCents: number | null;
  /** TD1 "Additional tax deductions requested for this pay period" (factor L). */
  additionalTaxCents: number | null;
  /** Factor F1 — annual deductions authorized to reduce taxable income, subtracted once from the
   * annualized figure rather than per pay period. RRSP and FHSA contributions belong here: both are
   * deductions from net income (T1 lines 20800 and 20805), so they cut taxable income without
   * touching CPP/EI, which are levied on pensionable/insurable earnings regardless. Omit or pass
   * null for none. Note that CRA requires a letter of authority before an employer may reduce tax
   * AT SOURCE for these — the payroll flow leaves this unset; it's the personal-estimate tool that
   * uses it. */
  annualDeductionsCents?: number | null;
}

export interface IncomeTaxCalculationResult {
  /** Factor A — the annualized taxable income implied by this pay period. */
  taxableIncomeCents: number;
  /** Factor T1 — annual federal tax payable. */
  annualFederalTaxCents: number;
  /** Factor T2 — annual provincial tax deduction. */
  annualProvincialTaxCents: number;
  /** Factor T — the amount to withhold this pay period (federal + provincial, plus any requested
   * additional withholding). */
  totalTaxCentsThisPeriod: number;
}

function bracketTaxCents(annualIncomeCents: number, brackets: TaxBracket[]): number {
  let selected = brackets[0];
  for (const bracket of brackets) {
    if (annualIncomeCents >= bracket.thresholdCents) selected = bracket;
    else break;
  }
  return Math.round(selected.rate * annualIncomeCents) - selected.constantCents;
}

interface LinearBpaPhaseOut {
  maxCents: number;
  minCents: number;
  phaseOutStartCents: number;
  phaseOutEndCents: number;
}

/** A Basic Personal Amount phased down linearly between two net-income thresholds — CRA T4127
 * Chapter 2 "Federal Basic Personal Amount (BPAF) Formula" (and, by the same shape, Manitoba's
 * BPAMB — see the caveat in craIncomeTax2026.ts). HD (northern residents deduction) is not tracked
 * by this app, so NI = A. */
function linearBpaCents(netIncomeCents: number, phaseOut: LinearBpaPhaseOut): number {
  const { maxCents, minCents, phaseOutStartCents, phaseOutEndCents } = phaseOut;
  if (netIncomeCents <= phaseOutStartCents) return maxCents;
  if (netIncomeCents >= phaseOutEndCents) return minCents;
  const reduction = (netIncomeCents - phaseOutStartCents) * ((maxCents - minCents) / (phaseOutEndCents - phaseOutStartCents));
  return Math.round(maxCents - reduction);
}

/** K2 / K2P — the federal or provincial tax credit for this year's CPP base contributions and EI
 * premiums, annualized from the current pay period and capped at the annual maximums. `rate` is
 * the lowest federal (0.14) or provincial (e.g. Ontario 0.0505, Nova Scotia 0.0879) tax rate, per
 * which credit is being computed. */
function cppEiCreditCents(payPeriodsPerYear: number, cpp1EmployeeCentsThisPeriod: number, eiEmployeeCentsThisPeriod: number, rate: number): number {
  const baseCppRatio = BASE_CPP_2026.rate / CRA_PAYROLL_RATES_2026.cpp1.rate;
  const baseCppAnnualizedCents = payPeriodsPerYear * cpp1EmployeeCentsThisPeriod * baseCppRatio;
  const baseCppCappedCents = Math.min(baseCppAnnualizedCents, BASE_CPP_2026.maxContributionCents);
  const eiAnnualizedCents = payPeriodsPerYear * eiEmployeeCentsThisPeriod;
  const eiCappedCents = Math.min(eiAnnualizedCents, EI_2026.maxEmployeeContributionCents);
  return Math.round(rate * (baseCppCappedCents + eiCappedCents));
}

/** V1 — Ontario surtax, applied to the basic Ontario tax T4. Per T4127's glossary (Table 3.1),
 * this mechanism is explicitly Ontario-only. */
function ontarioSurtaxCents(t4Cents: number): number {
  const { firstThresholdCents, firstRate, secondThresholdCents, secondRate } = ONTARIO_SURTAX_2026;
  if (t4Cents <= firstThresholdCents) return 0;
  if (t4Cents <= secondThresholdCents) return Math.round(firstRate * (t4Cents - firstThresholdCents));
  return Math.round(firstRate * (t4Cents - firstThresholdCents) + secondRate * (t4Cents - secondThresholdCents));
}

/** V2 — Ontario Health Premium, banded on annual taxable income A. Bands are ordered descending
 * by threshold so the first (highest) matching band is the correct one. Per T4127's glossary,
 * this mechanism is explicitly Ontario-only. */
function ontarioHealthPremiumCents(annualIncomeCents: number): number {
  if (annualIncomeCents <= 20_000_00) return 0;
  for (const band of ONTARIO_HEALTH_PREMIUM_BANDS_2026) {
    if (annualIncomeCents > band.aboveCents) {
      return Math.min(band.capCents, band.baseCents + Math.round(band.rate * (annualIncomeCents - band.bandFloorCents)));
    }
  }
  return 0;
}

/** S — Ontario tax reduction. The dependant add-on (factor Y) is not tracked by this app and is
 * treated as $0. Per T4127's glossary, this mechanism only applies to Ontario and British
 * Columbia (only Ontario is implemented here). */
function ontarioTaxReductionCents(t4PlusV1Cents: number): number {
  const twiceBasicCents = 2 * ONTARIO_TAX_REDUCTION_BASIC_2026_CENTS;
  return Math.max(0, Math.min(t4PlusV1Cents, twiceBasicCents - t4PlusV1Cents));
}

/** Steps 4-5 for Ontario: basic provincial tax, minus personal/CPP/EI credits, plus the
 * Ontario-only surtax and Health Premium, minus the Ontario-only tax reduction. */
function ontarioProvincialTaxCents(input: IncomeTaxCalculationInput, taxableIncomeCents: number): number {
  const lowestRate = ONTARIO_BRACKETS_2026[0].rate;
  const basicTaxCents = bracketTaxCents(taxableIncomeCents, ONTARIO_BRACKETS_2026);
  const tcp = input.provincialTotalClaimCents ?? ONTARIO_BPA_2026_CENTS;
  const k1pCents = Math.round(lowestRate * tcp);
  const k2pCents = cppEiCreditCents(input.payPeriodsPerYear, input.cpp1EmployeeCentsThisPeriod, input.eiEmployeeCentsThisPeriod, lowestRate);
  const t4Cents = Math.max(0, basicTaxCents - k1pCents - k2pCents);

  const v1Cents = ontarioSurtaxCents(t4Cents);
  const v2Cents = ontarioHealthPremiumCents(taxableIncomeCents);
  const sCents = ontarioTaxReductionCents(t4Cents + v1Cents);
  return Math.max(0, t4Cents + v1Cents + v2Cents - sCents);
}

/** Steps 4-5 for provinces with no special mechanism beyond brackets + BPA + the CPP/EI credit —
 * Nova Scotia, Alberta, New Brunswick, and Manitoba. Per T4127 Table 3.1's glossary, V1 (surtax)
 * and V2 (health premium) are Ontario-only, and S (tax reduction) is Ontario-and-BC-only, so this
 * is structurally the same shape as the federal calculation, just with the province's own bracket
 * table and BPA. `bpa` is either a flat amount, or (Manitoba only) a function of taxable income
 * for its phased-down BPAMB. */
function simpleProvincialTaxCents(
  brackets: TaxBracket[],
  bpa: number | ((taxableIncomeCents: number) => number),
  input: IncomeTaxCalculationInput,
  taxableIncomeCents: number,
): number {
  const lowestRate = brackets[0].rate;
  const basicTaxCents = bracketTaxCents(taxableIncomeCents, brackets);
  const bpaCents = typeof bpa === 'function' ? bpa(taxableIncomeCents) : bpa;
  const tcp = input.provincialTotalClaimCents ?? bpaCents;
  const k1pCents = Math.round(lowestRate * tcp);
  const k2pCents = cppEiCreditCents(input.payPeriodsPerYear, input.cpp1EmployeeCentsThisPeriod, input.eiEmployeeCentsThisPeriod, lowestRate);
  return Math.max(0, basicTaxCents - k1pCents - k2pCents);
}

/** S — British Columbia tax reduction, T4127 Chapter 5's British Columbia section. Unlike
 * Ontario's "twice the basic amount minus (T4+V1)" tent shape, BC's is a linear phase-out: the
 * full basic credit (capped at T4) up to phaseOutStartCents of taxable income, reduced by
 * phaseOutRate per dollar above that down to $0 at phaseOutEndCents. */
function britishColumbiaTaxReductionCents(taxableIncomeCents: number, t4Cents: number): number {
  const { basicCents, phaseOutStartCents, phaseOutEndCents, phaseOutRate } = BRITISH_COLUMBIA_TAX_REDUCTION_2026;
  if (taxableIncomeCents > phaseOutEndCents) return 0;
  const capCents = taxableIncomeCents <= phaseOutStartCents ? basicCents : Math.round(basicCents - (taxableIncomeCents - phaseOutStartCents) * phaseOutRate);
  return Math.max(0, Math.min(t4Cents, capCents));
}

/** Steps 4-5 for British Columbia: basic provincial tax, minus personal/CPP/EI credits, minus the
 * BC-only tax reduction. No surtax or health premium (those are Ontario-only). */
function britishColumbiaProvincialTaxCents(input: IncomeTaxCalculationInput, taxableIncomeCents: number): number {
  const lowestRate = BRITISH_COLUMBIA_BRACKETS_2026[0].rate;
  const basicTaxCents = bracketTaxCents(taxableIncomeCents, BRITISH_COLUMBIA_BRACKETS_2026);
  const tcp = input.provincialTotalClaimCents ?? BRITISH_COLUMBIA_BPA_2026_CENTS;
  const k1pCents = Math.round(lowestRate * tcp);
  const k2pCents = cppEiCreditCents(input.payPeriodsPerYear, input.cpp1EmployeeCentsThisPeriod, input.eiEmployeeCentsThisPeriod, lowestRate);
  const t4Cents = Math.max(0, basicTaxCents - k1pCents - k2pCents);
  const sCents = britishColumbiaTaxReductionCents(taxableIncomeCents, t4Cents);
  return Math.max(0, t4Cents - sCents);
}

/**
 * Implements CRA's T4127 "Option 1 – Indexing" income tax withholding formula for federal tax
 * plus whichever supported province the employee is in (see SUPPORTED_AUTO_TAX_PROVINCES — see
 * craIncomeTax2026.ts for the source and re-verification note). Returns null for any other
 * province, meaning the caller should fall back to a manually entered PDOC figure. Only handles
 * periodic pay for a full-year employee (no bonuses, commission/TD1X, Quebec, non-resident, or
 * RRSP/union-dues/garnishment deductions) — those cases also fall back to manual entry.
 */
export function calculateIncomeTaxForSupportedProvince(input: IncomeTaxCalculationInput): IncomeTaxCalculationResult | null {
  if (!isSupportedAutoTaxProvince(input.province)) return null;

  const payPeriodsPerYear = input.payPeriodsPerYear;

  // Step 1 — annual taxable income (A = P × (I − F5A) − F1). F5A is the CPP2-related credit
  // deduction from taxable income; F1 carries annual deductions such as RRSP/FHSA contributions
  // (see annualDeductionsCents). F/F2/U1/HD (per-period RRSP at source, garnishments, union dues,
  // northern deduction) are not tracked and treated as $0.
  const f5aCents = Math.round(input.cpp1EmployeeCentsThisPeriod * (0.01 / CRA_PAYROLL_RATES_2026.cpp1.rate)) + input.cpp2EmployeeCentsThisPeriod;
  const f1Cents = input.annualDeductionsCents ?? 0;
  const taxableIncomeCents = Math.max(0, Math.round(payPeriodsPerYear * (input.periodGrossPayCents - f5aCents)) - f1Cents);

  // Steps 2-3 — federal tax (identical regardless of province)
  const federalBasicTaxCents = bracketTaxCents(taxableIncomeCents, FEDERAL_BRACKETS_2026);
  const tc = input.federalTotalClaimCents ?? linearBpaCents(taxableIncomeCents, FEDERAL_BPAF_2026);
  const k1Cents = Math.round(0.14 * tc);
  const k2Cents = cppEiCreditCents(payPeriodsPerYear, input.cpp1EmployeeCentsThisPeriod, input.eiEmployeeCentsThisPeriod, 0.14);
  const k4Cents = Math.min(Math.round(0.14 * taxableIncomeCents), Math.round(0.14 * FEDERAL_CEA_2026_CENTS));
  const annualFederalTaxCents = Math.max(0, federalBasicTaxCents - k1Cents - k2Cents - k4Cents);

  // Steps 4-5 — provincial tax
  let annualProvincialTaxCents: number;
  if (input.province === 'ON') {
    annualProvincialTaxCents = ontarioProvincialTaxCents(input, taxableIncomeCents);
  } else if (input.province === 'BC') {
    annualProvincialTaxCents = britishColumbiaProvincialTaxCents(input, taxableIncomeCents);
  } else if (input.province === 'AB') {
    annualProvincialTaxCents = simpleProvincialTaxCents(ALBERTA_BRACKETS_2026, ALBERTA_BPA_2026_CENTS, input, taxableIncomeCents);
  } else if (input.province === 'NB') {
    annualProvincialTaxCents = simpleProvincialTaxCents(NEW_BRUNSWICK_BRACKETS_2026, NEW_BRUNSWICK_BPA_2026_CENTS, input, taxableIncomeCents);
  } else if (input.province === 'MB') {
    annualProvincialTaxCents = simpleProvincialTaxCents(MANITOBA_BRACKETS_2026, (ni) => linearBpaCents(ni, MANITOBA_BPA_2026), input, taxableIncomeCents);
  } else if (input.province === 'SK') {
    annualProvincialTaxCents = simpleProvincialTaxCents(SASKATCHEWAN_BRACKETS_2026, SASKATCHEWAN_BPA_2026_CENTS, input, taxableIncomeCents);
  } else {
    annualProvincialTaxCents = simpleProvincialTaxCents(NOVA_SCOTIA_BRACKETS_2026, NOVA_SCOTIA_BPA_2026_CENTS, input, taxableIncomeCents);
  }

  // Step 6 — pay-period deduction
  const additionalTaxCents = input.additionalTaxCents ?? 0;
  const totalTaxCentsThisPeriod = Math.round((annualFederalTaxCents + annualProvincialTaxCents) / payPeriodsPerYear) + additionalTaxCents;

  return { taxableIncomeCents, annualFederalTaxCents, annualProvincialTaxCents, totalTaxCentsThisPeriod };
}
