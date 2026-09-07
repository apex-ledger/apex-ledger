/** Estimates and purchase orders — documents that commit to something without posting anything.
 *
 * An estimate is what you have offered a customer; a purchase order is what you have committed to a
 * vendor. Neither is a transaction. No money has moved and nothing is owed, so neither belongs in
 * the ledger — an unaccepted quote sitting in accounts receivable would overstate what the business
 * is owed, and by exactly the amount least likely to arrive.
 *
 * Both become real the same way: converting into an invoice or a bill, which is the moment the
 * posting happens. The rules here exist to stop that conversion happening twice, or happening to a
 * document that was declined.
 */

export type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'converted' | 'closed';
/** A sales order's fulfilment — whether the goods or work have gone out. Independent of invoicing. */
export type FulfillmentStatus = 'pending' | 'shipped';
export const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = { pending: 'Pending fulfillment', shipped: 'Shipped' };
export type PurchaseOrderStatus = 'draft' | 'sent' | 'received' | 'cancelled' | 'converted';

export const ESTIMATE_LABELS: Record<EstimateStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  converted: 'Invoiced',
  closed: 'Closed',
};

export const PURCHASE_ORDER_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  received: 'Received',
  cancelled: 'Cancelled',
  converted: 'Billed',
};

/** Where each status can go next.
 *
 * `converted` is the one dead end, and deliberately so: the document has become an invoice or a
 * bill that is now posted to the ledger. Moving it back would leave a posted transaction with
 * nothing explaining where it came from. Undoing a conversion means voiding the invoice, which is
 * a decision about the ledger rather than about the quote.
 */
const ESTIMATE_TRANSITIONS: Record<EstimateStatus, EstimateStatus[]> = {
  draft: ['sent', 'accepted', 'declined'],
  sent: ['accepted', 'declined', 'expired', 'draft'],
  accepted: ['declined', 'sent', 'closed'],
  declined: ['sent', 'accepted'],
  expired: ['sent', 'accepted', 'declined'],
  converted: [],
  // A closed order was accepted and then abandoned without invoicing; it can be reopened.
  closed: ['accepted'],
};

const PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['received', 'cancelled', 'draft'],
  received: ['sent', 'cancelled'],
  cancelled: ['draft', 'sent'],
  converted: [],
};

export function canTransitionEstimate(from: EstimateStatus, to: EstimateStatus): boolean {
  if (from === to) return false;
  return ESTIMATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionPurchaseOrder(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  if (from === to) return false;
  return PO_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Why this estimate cannot become an invoice, or null if it can.
 *
 * Declined is refused rather than allowed-with-a-warning: invoicing something the customer turned
 * down is not a judgement call, and the fix is to mark it accepted first, which leaves a record of
 * the change of mind.
 */
export function estimateConversionBlock(status: EstimateStatus, alreadyConvertedTo: number | null): string | null {
  if (alreadyConvertedTo !== null) return `This estimate has already been invoiced (invoice #${alreadyConvertedTo}).`;
  if (status === 'converted') return 'This estimate has already been invoiced.';
  if (status === 'declined') return 'This estimate was declined. Mark it accepted first if the customer has changed their mind.';
  if (status === 'closed') return 'This sales order was closed. Reopen it first if it is going ahead after all.';
  return null;
}

/** An estimate the customer has accepted is a sales order — and stays one through invoicing or closing. */
export function isSalesOrder(status: EstimateStatus): boolean {
  return status === 'accepted' || status === 'converted' || status === 'closed';
}

export function orderStatusLabel(status: EstimateStatus): string {
  return status === 'accepted' ? 'Open' : status === 'closed' ? 'Closed' : status === 'converted' ? 'Closed (invoiced)' : ESTIMATE_LABELS[status];
}

export function orderInvoiceStatus(status: EstimateStatus, convertedInvoiceId: number | null): string {
  return convertedInvoiceId !== null || status === 'converted' ? 'Invoiced' : 'Not invoiced';
}

export function purchaseOrderConversionBlock(status: PurchaseOrderStatus, alreadyConvertedTo: number | null): string | null {
  if (alreadyConvertedTo !== null) return 'This purchase order has already been billed.';
  if (status === 'converted') return 'This purchase order has already been billed.';
  if (status === 'cancelled') return 'This purchase order was cancelled. Reopen it before entering the vendor invoice.';
  return null;
}

/** Whether an estimate has lapsed, given today.
 *
 * Worked out rather than stored, because a stored "expired" flag is only correct until the next
 * day and there is nothing running overnight to update it. */
export function isExpired(expiryDate: string | null, status: EstimateStatus, asOfDate: string): boolean {
  if (!expiryDate) return false;
  // A quote already acted on cannot lapse — the outcome is settled either way.
  if (status === 'accepted' || status === 'declined' || status === 'converted' || status === 'closed') return false;
  return expiryDate < asOfDate;
}

/** The status to SHOW, which is not always the status stored. */
export function displayEstimateStatus(status: EstimateStatus, expiryDate: string | null, asOfDate: string): EstimateStatus {
  return isExpired(expiryDate, status, asOfDate) ? 'expired' : status;
}

export interface CommitmentLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

/** Line total, rounded once at the end.
 *
 * Quantities can be fractional (hours, kilograms), so the product is rarely a whole number of
 * cents. Rounding per line and summing is what every invoice does, and matching it exactly is what
 * keeps a converted estimate's total equal to the invoice it becomes. */
export function lineAmountCents(line: CommitmentLine): number {
  return Math.round(line.quantity * line.unitPriceCents);
}

export function documentTotalCents(lines: CommitmentLine[]): number {
  return lines.reduce((sum, line) => sum + lineAmountCents(line), 0);
}
