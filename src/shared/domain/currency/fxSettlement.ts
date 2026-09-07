import { convertForeignAmountToCadCents } from './convertForeignAmount';

/**
 * Settling a foreign-currency invoice or bill — the realized exchange gain or loss.
 *
 * A USD 1,000 invoice booked at 1.35 sits in Accounts Receivable at CAD 1,350. When the customer
 * pays USD 1,000 and the bank converts at 1.38, CAD 1,380 arrives. Receivable is relieved at the
 * rate it was booked (1,350, so the customer's balance goes to zero), cash is recorded at the rate
 * it actually converted (1,380), and the CAD 30 difference is a realized exchange gain. The same
 * arithmetic runs the other way on a vendor's bill: paying more CAD than was booked is a loss.
 *
 * Partial payments relieve the receivable in proportion to the foreign amount paid, at the
 * document rate. The last payment — the one that clears the remaining foreign balance — takes
 * whatever CAD is still outstanding, so cent rounding can never leave a stray CAD 0.01 open.
 */
export interface ForeignSettlementInput {
  /** Foreign cents being paid or received now. */
  foreignPaidCents: number;
  /** Foreign cents still outstanding on the document before this payment. */
  foreignOutstandingCents: number;
  /** CAD cents still outstanding on the document before this payment (at the booked rate). */
  cadOutstandingCents: number;
  /** Rate the document was booked at (CAD per 1 unit of foreign currency). */
  documentRate: number;
  /** Rate the money actually converted at on the payment date. */
  paymentRate: number;
  side: 'receivable' | 'payable';
}

export interface ForeignSettlement {
  /** CAD taken off Accounts Receivable / Payable — at the booked rate. */
  cadRelievedCents: number;
  /** CAD that actually moved through the bank — at the payment rate. */
  cadCashCents: number;
  /** Positive = exchange gain, negative = exchange loss, in CAD cents. */
  gainLossCents: number;
  /** True when this payment clears the document's foreign balance. */
  clearsDocument: boolean;
}

export function settleForeignPayment(input: ForeignSettlementInput): ForeignSettlement {
  const { foreignPaidCents, foreignOutstandingCents, cadOutstandingCents, documentRate, paymentRate, side } = input;
  if (foreignPaidCents <= 0) throw new Error('The amount paid must be more than zero.');
  if (foreignPaidCents > foreignOutstandingCents) throw new Error('The amount paid is more than is outstanding on this document.');
  const clearsDocument = foreignPaidCents === foreignOutstandingCents;
  const cadRelievedCents = clearsDocument ? cadOutstandingCents : Math.min(cadOutstandingCents, convertForeignAmountToCadCents(foreignPaidCents, documentRate));
  const cadCashCents = convertForeignAmountToCadCents(foreignPaidCents, paymentRate);
  // Receivable: more cash than was booked is a gain. Payable: more cash out than was booked is a loss.
  const gainLossCents = side === 'receivable' ? cadCashCents - cadRelievedCents : cadRelievedCents - cadCashCents;
  return { cadRelievedCents, cadCashCents, gainLossCents, clearsDocument };
}

/** Foreign cents still owed on a document, derived from what is left in CAD at the booked rate.
 * The document stores its original foreign total; payments so far relieve CAD, so the foreign
 * remainder is the CAD remainder converted back — rounded to the cent, and never below zero. */
export function foreignOutstandingCents(foreignTotalCents: number, cadTotalCents: number, cadOutstandingCents: number): number {
  if (cadTotalCents <= 0) return 0;
  if (cadOutstandingCents >= cadTotalCents) return foreignTotalCents;
  if (cadOutstandingCents <= 0) return 0;
  return Math.max(0, Math.round((foreignTotalCents * cadOutstandingCents) / cadTotalCents));
}
