/** Standard compound-interest math for the Retirement / Future Value calculator — no CRA-sourced
 * constants involved, so unlike the tax/payroll formulas elsewhere this needs no yearly re-verification.
 * Contributions are modeled as an ordinary annuity (added at the end of each month), the common
 * convention for "how much will my monthly savings be worth" calculators. */

export interface FutureValueInput {
  startingAmountCents: number;
  monthlyContributionCents: number;
  annualRatePercent: number;
  years: number;
}

export interface FutureValueResult {
  futureValueCents: number;
  totalContributedCents: number;
  totalGrowthCents: number;
}

function monthlyRateFromAnnualPercent(annualRatePercent: number): number {
  return annualRatePercent / 100 / 12;
}

export function computeFutureValue(input: FutureValueInput): FutureValueResult {
  const { startingAmountCents, monthlyContributionCents, annualRatePercent, years } = input;
  const months = Math.round(years * 12);
  const r = monthlyRateFromAnnualPercent(annualRatePercent);

  const principalGrowth = r === 0 ? startingAmountCents : startingAmountCents * Math.pow(1 + r, months);
  const contributionGrowth = r === 0 ? monthlyContributionCents * months : monthlyContributionCents * ((Math.pow(1 + r, months) - 1) / r);

  const futureValueCents = Math.round(principalGrowth + contributionGrowth);
  const totalContributedCents = startingAmountCents + monthlyContributionCents * months;
  return {
    futureValueCents,
    totalContributedCents,
    totalGrowthCents: futureValueCents - totalContributedCents,
  };
}

export interface RequiredContributionInput {
  targetAmountCents: number;
  startingAmountCents: number;
  annualRatePercent: number;
  years: number;
}

/** Solves for the monthly contribution needed to reach `targetAmountCents` — the inverse of
 * computeFutureValue. Clamped to 0 (never negative) when the starting amount alone, left to grow,
 * would already clear the target. */
export function computeRequiredMonthlyContribution(input: RequiredContributionInput): number {
  const { targetAmountCents, startingAmountCents, annualRatePercent, years } = input;
  const months = Math.round(years * 12);
  const r = monthlyRateFromAnnualPercent(annualRatePercent);

  const principalGrowth = r === 0 ? startingAmountCents : startingAmountCents * Math.pow(1 + r, months);
  const remaining = targetAmountCents - principalGrowth;
  if (remaining <= 0) return 0;

  const annuityFactor = r === 0 ? months : (Math.pow(1 + r, months) - 1) / r;
  if (annuityFactor === 0) return 0;
  return Math.round(remaining / annuityFactor);
}
