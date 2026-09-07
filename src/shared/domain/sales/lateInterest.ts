/**
 * Late-payment interest on overdue invoices.
 *
 * Simple interest on the unpaid balance, from the day after the due date (or the day after the
 * last date interest was charged to) up to the charge date, at the customer's annual rate:
 * balance × rate ÷ 365 × days. That is how a professional firm's engagement letter usually
 * words it, and it is what a customer can check on a calculator. Nothing compounds.
 */
export interface LateInterestInput {
  balanceDueCents: number;
  dueDate: string;
  /** The last day interest has already been charged for, or null if never charged. */
  chargedThrough: string | null;
  /** The day interest is being charged up to, inclusive. */
  asOf: string;
  annualRatePercent: number;
}

export interface LateInterestResult {
  /** First day interest accrues in this charge. */
  fromDate: string;
  toDate: string;
  days: number;
  interestCents: number;
}

function dayAfter(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function daysBetweenInclusive(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.floor((b - a) / 86_400_000) + 1;
}

/** Null when there is nothing to charge: not yet overdue, already charged to this date, no
 * balance, or no rate. */
export function computeLateInterest(input: LateInterestInput): LateInterestResult | null {
  if (input.balanceDueCents <= 0 || input.annualRatePercent <= 0) return null;
  const fromDate = dayAfter(input.chargedThrough && input.chargedThrough > input.dueDate ? input.chargedThrough : input.dueDate);
  if (fromDate > input.asOf) return null;
  const days = daysBetweenInclusive(fromDate, input.asOf);
  const interestCents = Math.round((input.balanceDueCents * (input.annualRatePercent / 100) * days) / 365);
  if (interestCents <= 0) return null;
  return { fromDate, toDate: input.asOf, days, interestCents };
}
