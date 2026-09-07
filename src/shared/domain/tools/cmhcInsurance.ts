/** CMHC mortgage loan insurance premium estimator. Rate table, minimum down payment tiers,
 * $1.5M insured-mortgage price ceiling, and the 30-year amortization surcharge are sourced from
 * CMHC's own published consumer pages (cmhc-schl.gc.ca) — verified via WebSearch/WebFetch, not
 * recalled from memory, per this app's standing rule on CRA/government-sourced constants.
 * Source: https://www.cmhc-schl.gc.ca/consumers/home-buying/mortgage-loan-insurance-for-consumers/cmhc-mortgage-loan-insurance-cost
 *         https://www.canada.ca/en/department-finance/corporate/contact-us/frequently-asked-questions/higher-down-payments.html */

export type CmhcDownPaymentType = 'traditional' | 'nonTraditional';

const MAX_INSURED_PURCHASE_PRICE_CENTS = 150_000_000; // $1,500,000.00
const TIER_1_CEILING_CENTS = 50_000_000; // $500,000.00

export interface CmhcPremiumInput {
  purchasePriceCents: number;
  downPaymentCents: number;
  downPaymentType: CmhcDownPaymentType;
  amortizationYears: 25 | 30;
  isFirstTimeBuyerOrNewBuild: boolean;
}

export interface CmhcPremiumResult {
  loanAmountCents: number;
  loanToValuePercent: number;
  minimumDownPaymentCents: number;
  meetsMinimumDownPayment: boolean;
  eligibleForInsurance: boolean;
  ineligibleReason: string | null;
  baseRatePercent: number;
  surchargeApplied: boolean;
  surchargePercent: number;
  totalRatePercent: number;
  premiumCents: number;
  totalMortgageCents: number;
}

/** 5% on the portion of the price up to $500,000, plus 10% on the portion from $500,000 to $1,500,000. */
export function computeMinimumDownPaymentCents(purchasePriceCents: number): number {
  const tier1 = Math.min(purchasePriceCents, TIER_1_CEILING_CENTS);
  const tier2 = Math.max(0, Math.min(purchasePriceCents, MAX_INSURED_PURCHASE_PRICE_CENTS) - TIER_1_CEILING_CENTS);
  return Math.round(tier1 * 0.05 + tier2 * 0.1);
}

function baseRateForLtv(ltvPercent: number, downPaymentType: CmhcDownPaymentType): number | null {
  if (ltvPercent <= 65) return 0.6;
  if (ltvPercent <= 75) return 1.7;
  if (ltvPercent <= 80) return 2.4;
  if (ltvPercent <= 85) return 2.8;
  if (ltvPercent <= 90) return 3.1;
  if (ltvPercent <= 95) return downPaymentType === 'nonTraditional' ? 4.5 : 4.0;
  return null;
}

export function computeCmhcPremium(input: CmhcPremiumInput): CmhcPremiumResult {
  const { purchasePriceCents, downPaymentCents, downPaymentType, amortizationYears, isFirstTimeBuyerOrNewBuild } = input;
  const loanAmountCents = Math.max(0, purchasePriceCents - downPaymentCents);
  const loanToValuePercent = purchasePriceCents > 0 ? (loanAmountCents / purchasePriceCents) * 100 : 0;
  const minimumDownPaymentCents = computeMinimumDownPaymentCents(purchasePriceCents);
  const meetsMinimumDownPayment = downPaymentCents >= minimumDownPaymentCents;

  let ineligibleReason: string | null = null;
  if (purchasePriceCents > MAX_INSURED_PURCHASE_PRICE_CENTS) {
    ineligibleReason = 'Homes priced at $1.5 million or more are not eligible for mortgage loan insurance.';
  } else if (!meetsMinimumDownPayment) {
    ineligibleReason = 'Down payment is below the required minimum for this purchase price.';
  } else if (loanToValuePercent > 95) {
    ineligibleReason = 'Maximum insured loan-to-value is 95% (minimum 5% down).';
  }

  const baseRatePercent = ineligibleReason ? 0 : (baseRateForLtv(loanToValuePercent, downPaymentType) ?? 0);
  const surchargeApplied = !ineligibleReason && amortizationYears === 30 && isFirstTimeBuyerOrNewBuild && loanToValuePercent > 80;
  const surchargePercent = surchargeApplied ? 0.2 : 0;
  const totalRatePercent = baseRatePercent + surchargePercent;
  const premiumCents = ineligibleReason ? 0 : Math.round(loanAmountCents * (totalRatePercent / 100));

  return {
    loanAmountCents,
    loanToValuePercent,
    minimumDownPaymentCents,
    meetsMinimumDownPayment,
    eligibleForInsurance: !ineligibleReason,
    ineligibleReason,
    baseRatePercent,
    surchargeApplied,
    surchargePercent,
    totalRatePercent,
    premiumCents,
    totalMortgageCents: loanAmountCents + premiumCents,
  };
}
