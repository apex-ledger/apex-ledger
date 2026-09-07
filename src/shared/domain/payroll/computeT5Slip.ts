import type { Shareholder, T5Payment } from '../types';
import {
  ELIGIBLE_DIVIDEND_FEDERAL_DTC_RATE,
  ELIGIBLE_DIVIDEND_GROSSUP_RATE,
  NON_ELIGIBLE_DIVIDEND_FEDERAL_DTC_RATE,
  NON_ELIGIBLE_DIVIDEND_GROSSUP_RATE,
} from './craDividendRates2026';

/**
 * A T5 is the CRA's "Statement of Investment Income" — this app tracks dividends (eligible and
 * non-eligible) and interest paid to shareholders, grouped by PAYMENT DATE. Box numbers match the
 * T5 slip's own layout: 10-12 for dividends other than eligible, 13 for interest, 24-26 for
 * eligible dividends.
 */
export interface T5SlipResult {
  shareholderId: number;
  shareholderName: string;
  sin: string | null;
  businessNumber: string | null;
  /** Box 10 — Actual amount of dividends other than eligible dividends. */
  nonEligibleDividendsCents: number;
  /** Box 11 — Taxable amount of dividends other than eligible dividends. */
  nonEligibleTaxableCents: number;
  /** Box 12 — Dividend tax credit for dividends other than eligible dividends. */
  nonEligibleDtcCents: number;
  /** Box 13 — Interest from Canadian sources. */
  interestCents: number;
  /** Box 24 — Actual amount of eligible dividends. */
  eligibleDividendsCents: number;
  /** Box 25 — Taxable amount of eligible dividends. */
  eligibleTaxableCents: number;
  /** Box 26 — Dividend tax credit for eligible dividends. */
  eligibleDtcCents: number;
}

function paymentsForShareholderInYear(payments: T5Payment[], shareholderId: number, taxYear: number): T5Payment[] {
  return payments.filter((p) => p.shareholderId === shareholderId && p.paymentDate.slice(0, 4) === String(taxYear));
}

export function computeT5Slip(payments: T5Payment[], shareholder: Shareholder, taxYear: number): T5SlipResult {
  const included = paymentsForShareholderInYear(payments, shareholder.id, taxYear);
  const sumOf = (type: T5Payment['paymentType']) => included.filter((p) => p.paymentType === type).reduce((sum, p) => sum + p.amountCents, 0);

  const nonEligibleDividendsCents = sumOf('non_eligible_dividend');
  const eligibleDividendsCents = sumOf('eligible_dividend');
  const nonEligibleTaxableCents = Math.round(nonEligibleDividendsCents * (1 + NON_ELIGIBLE_DIVIDEND_GROSSUP_RATE));
  const eligibleTaxableCents = Math.round(eligibleDividendsCents * (1 + ELIGIBLE_DIVIDEND_GROSSUP_RATE));

  return {
    shareholderId: shareholder.id,
    shareholderName: shareholder.name,
    sin: shareholder.sin,
    businessNumber: shareholder.businessNumber,
    nonEligibleDividendsCents,
    nonEligibleTaxableCents,
    nonEligibleDtcCents: Math.round(nonEligibleTaxableCents * NON_ELIGIBLE_DIVIDEND_FEDERAL_DTC_RATE),
    interestCents: sumOf('interest'),
    eligibleDividendsCents,
    eligibleTaxableCents,
    eligibleDtcCents: Math.round(eligibleTaxableCents * ELIGIBLE_DIVIDEND_FEDERAL_DTC_RATE),
  };
}

/** One slip per shareholder with at least one payment in the tax year. */
export function computeT5SlipsForYear(payments: T5Payment[], shareholders: Shareholder[], taxYear: number): T5SlipResult[] {
  return shareholders
    .filter((s) => paymentsForShareholderInYear(payments, s.id, taxYear).length > 0)
    .map((s) => computeT5Slip(payments, s, taxYear))
    .sort((a, b) => a.shareholderName.localeCompare(b.shareholderName));
}
