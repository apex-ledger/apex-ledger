/**
 * When a saved invoice may still have its lines changed.
 *
 * An invoice stays editable until something else in the books starts leaning on its figures. Once
 * money has been received against it, or a credit applied, or it has been written off, or its stock
 * has left inventory, those other records were measured against this invoice's total — changing it
 * underneath them would leave a payment larger than the invoice, or a cost of sales for goods the
 * invoice no longer lists. At that point the honest correction is the one that leaves a trail:
 * reverse the payment, unapply the credit, or issue a credit note.
 *
 * Period locks and filed GST/HST returns are not judged here; voiding the old journal refuses those
 * itself, so an edit inside a filed quarter is stopped by the same rule that stops a delete.
 */
export interface InvoiceEditState {
  paymentCount: number;
  writtenOffCents: number;
  creditAppliedCents: number;
  postedStock: boolean;
  foreignCurrency: string | null;
}

export function invoiceEditRefusalReason(state: InvoiceEditState): string | null {
  if (state.paymentCount > 0) {
    return 'A payment has been received on this invoice, so it can no longer be edited. If the invoice itself was wrong, reverse the payment first, edit, then receive it again.';
  }
  if (state.writtenOffCents > 0) return 'This invoice was written off to bad debt. Undo the write-off first, then edit it.';
  if (state.creditAppliedCents > 0) return 'A credit note has been applied to this invoice. Unapply the credit first, then edit it.';
  if (state.postedStock) {
    return 'This invoice took stock out of inventory and posted its cost. Correct it with a credit note so the inventory trail stays intact.';
  }
  if (state.foreignCurrency) {
    return 'Foreign-currency invoices cannot be edited yet — delete this one and enter it again.';
  }
  return null;
}
