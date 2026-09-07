/** Loan amortization: splitting each payment into interest and principal.
 *
 * The books need this split and the bank statement does not give it — a mortgage or equipment loan
 * shows one payment leaving the account, of which only the interest is an expense and the rest
 * reduces the liability. Posting the whole payment to interest overstates expenses and leaves the
 * loan on the balance sheet forever; posting it all to principal does the reverse.
 *
 * Canadian mortgages compound SEMI-ANNUALLY regardless of how often they are paid, which is a
 * genuine difference from the US convention and the usual reason a hand-built schedule disagrees
 * with the lender's. Other loans generally compound at the payment frequency. Both are supported
 * and the choice is explicit rather than assumed.
 */

export type PaymentFrequency = 'monthly' | 'semiMonthly' | 'biweekly' | 'weekly' | 'quarterly' | 'annually';

export const PAYMENTS_PER_YEAR: Record<PaymentFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semiMonthly: 24,
  monthly: 12,
  quarterly: 4,
  annually: 1,
};

export interface LoanTerms {
  principalCents: number;
  /** Nominal annual rate, e.g. 0.0649 for 6.49%. */
  annualRate: number;
  frequency: PaymentFrequency;
  /** Total number of payments over the full amortization. */
  numberOfPayments: number;
  /** Canadian mortgages compound semi-annually whatever the payment frequency; most other loans
   * compound each payment period. */
  compounding: 'semiAnnual' | 'perPayment';
}

export interface AmortizationRow {
  paymentNumber: number;
  openingBalanceCents: number;
  paymentCents: number;
  interestCents: number;
  principalCents: number;
  closingBalanceCents: number;
}

export interface AmortizationResult {
  paymentCents: number;
  rows: AmortizationRow[];
  totalInterestCents: number;
  totalPrincipalCents: number;
  totalPaidCents: number;
}

function roundCents(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** The rate actually applied to the balance each payment period.
 *
 * For a Canadian mortgage the posted rate is a nominal annual rate compounded semi-annually, so the
 * per-period rate is the sixth root business: convert to an effective annual rate first, then take
 * the root for the payment frequency. Skipping that step is what makes a spreadsheet disagree with
 * the bank by a few dollars a month. */
export function periodicRate(terms: Pick<LoanTerms, 'annualRate' | 'frequency' | 'compounding'>): number {
  const periods = PAYMENTS_PER_YEAR[terms.frequency];
  if (terms.compounding === 'perPayment') return terms.annualRate / periods;
  const effectiveAnnual = (1 + terms.annualRate / 2) ** 2 - 1;
  return (1 + effectiveAnnual) ** (1 / periods) - 1;
}

/** The level payment that clears the loan over its term. */
export function paymentAmountCents(terms: LoanTerms): number {
  const rate = periodicRate(terms);
  if (terms.numberOfPayments <= 0) return 0;
  // A zero-interest loan is just the principal split evenly; the annuity formula divides by zero.
  if (rate === 0) return roundCents(terms.principalCents / terms.numberOfPayments);
  const factor = (1 + rate) ** terms.numberOfPayments;
  return roundCents((terms.principalCents * rate * factor) / (factor - 1));
}

export function amortizationSchedule(terms: LoanTerms, overridePaymentCents?: number): AmortizationResult {
  const rate = periodicRate(terms);
  const paymentCents = overridePaymentCents ?? paymentAmountCents(terms);

  const rows: AmortizationRow[] = [];
  let balance = terms.principalCents;

  for (let n = 1; n <= terms.numberOfPayments && balance > 0; n += 1) {
    const interestCents = roundCents(balance * rate);
    let principalCents = paymentCents - interestCents;

    // The final payment rarely equals the level payment: rounding leaves a few cents either way,
    // and the schedule has to finish at exactly zero rather than a stray balance that never clears.
    if (principalCents >= balance || n === terms.numberOfPayments) {
      principalCents = balance;
    }

    // A payment too small to cover the interest would grow the debt forever. Reported honestly by
    // stopping rather than by printing a schedule that never ends.
    if (principalCents <= 0 && n < terms.numberOfPayments) {
      rows.push({
        paymentNumber: n,
        openingBalanceCents: balance,
        paymentCents,
        interestCents,
        principalCents: 0,
        closingBalanceCents: balance,
      });
      break;
    }

    const closing = balance - principalCents;
    rows.push({
      paymentNumber: n,
      openingBalanceCents: balance,
      paymentCents: interestCents + principalCents,
      interestCents,
      principalCents,
      closingBalanceCents: closing,
    });
    balance = closing;
  }

  return {
    paymentCents,
    rows,
    totalInterestCents: rows.reduce((sum, r) => sum + r.interestCents, 0),
    totalPrincipalCents: rows.reduce((sum, r) => sum + r.principalCents, 0),
    totalPaidCents: rows.reduce((sum, r) => sum + r.paymentCents, 0),
  };
}

/** Interest and principal falling in one fiscal year — the two figures the books need.
 *
 * Payments are counted by number rather than by date because a schedule has no calendar attached:
 * the caller knows which payment number the year starts and ends on. */
export function yearSplit(result: AmortizationResult, fromPayment: number, toPayment: number) {
  const rows = result.rows.filter((r) => r.paymentNumber >= fromPayment && r.paymentNumber <= toPayment);
  return {
    interestCents: rows.reduce((sum, r) => sum + r.interestCents, 0),
    principalCents: rows.reduce((sum, r) => sum + r.principalCents, 0),
    closingBalanceCents: rows.length > 0 ? rows[rows.length - 1].closingBalanceCents : 0,
  };
}
