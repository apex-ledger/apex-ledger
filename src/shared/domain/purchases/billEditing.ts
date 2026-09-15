import type { ApprovalStatus } from './billApproval';

/**
 * When a vendor bill already in the books may still be changed, and what changing it does to its
 * approval.
 *
 * A bill is a source document from the vendor, so correcting one that was keyed wrongly is normal —
 * the wrong amount, a missed line, the wrong category. It stays correctable until another record
 * has been measured against its figures:
 *
 *   - a payment was made against it (the payment would no longer match what was owed);
 *   - a vendor credit was applied to it (same);
 *   - it is matched to a purchase order receipt (the three-way match of order, receipt and invoice
 *     was checked against these quantities and prices);
 *   - the stock it brought in has since been costed into a later transaction (the moving-average
 *     cost of a later sale was worked out from this bill's price).
 *
 * After that, the correction that keeps the trail intact is a reversal or a vendor credit, never a
 * rewrite. Locked periods and filed GST/HST returns are enforced by voiding the old journal.
 */
export interface BillEditState {
  paymentCount: number;
  creditAppliedCents: number;
  matchedPurchaseOrderNumber: string | null;
  /** The name of a product whose stock from this bill was used by a later transaction, if any. */
  stockUsedLaterFor: string | null;
  foreignCurrency: string | null;
}

export function billEditRefusalReason(state: BillEditState): string | null {
  if (state.paymentCount > 0) {
    return 'A payment has been made on this bill, so it can no longer be edited. If the bill itself was wrong, reverse the payment first, edit, then pay it again.';
  }
  if (state.creditAppliedCents > 0) return 'A vendor credit has been applied to this bill. Unapply the credit first, then edit it.';
  if (state.matchedPurchaseOrderNumber) {
    return `This bill is matched to received purchase order ${state.matchedPurchaseOrderNumber}. Unmatch it first — the order, the receipt and the bill were checked against each other as they are.`;
  }
  if (state.stockUsedLaterFor) {
    return `Stock of ${state.stockUsedLaterFor} from this bill has already been used in a later transaction, whose cost was worked out from this bill's price. Correct it with a vendor credit or an inventory adjustment instead.`;
  }
  if (state.foreignCurrency) return 'Foreign-currency bills cannot be edited yet — delete this one and enter it again.';
  return null;
}

export interface ApprovalFields {
  approvalStatus: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
}

const money = (cents: number) => (cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * What an edit does to the bill's approval — segregation of duties, so that the person who approved
 * a figure never ends up standing behind a different one.
 *
 * - Approved by a person, and the total changed: back to awaiting approval, with the change noted,
 *   so it cannot be paid on the strength of an approval given to another amount.
 * - Approved by a person, total unchanged (a description or category corrected): stays approved.
 * - Approved only by default (no one ever approved it — approval is not in use): left alone.
 * - Rejected: correcting it is exactly what a rejection asks for, so it is resubmitted for approval.
 * - Awaiting approval or on hold: left as it is.
 *
 * Returns null when the approval does not change.
 */
export function approvalAfterBillEdit(
  bill: { approvalStatus: ApprovalStatus; approvedAt: string | null; amountCents: number },
  newTotalCents: number,
): ApprovalFields | null {
  if (bill.approvalStatus === 'approved' && bill.approvedAt && newTotalCents !== bill.amountCents) {
    return {
      approvalStatus: 'pending',
      approvedBy: null,
      approvedAt: null,
      approvalNote: `Changed after approval: ${money(bill.amountCents)} → ${money(newTotalCents)}. Approve again before paying.`,
    };
  }
  if (bill.approvalStatus === 'rejected') {
    return {
      approvalStatus: 'pending',
      approvedBy: null,
      approvedAt: null,
      approvalNote: `Corrected after rejection: ${money(bill.amountCents)} → ${money(newTotalCents)}.`,
    };
  }
  return null;
}
