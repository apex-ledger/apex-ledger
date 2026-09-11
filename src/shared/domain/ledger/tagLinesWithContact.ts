/** Stamps the customer or vendor onto every journal line of a document.
 *
 * Customer statements, receivables by customer, P&L by customer and expenses by vendor all read
 * the contact from the journal lines, not from the document tables, so a payment, credit note or
 * refund whose lines carry no contact simply disappears from those reports: a statement then shows
 * the invoice but not the money received against it, and the customer disputes the balance. Every
 * document handler tags its lines here so the ledger itself knows whose money each line is. A line
 * that already names a contact keeps it. */
export function tagLinesWithContact<T extends { accountId: number; customerId?: number | null; vendorId?: number | null }>(
  lines: T[],
  contact: { customerId?: number | null; vendorId?: number | null },
): T[] {
  return lines.map((line) => ({
    ...line,
    customerId: (line as { customerId?: number | null }).customerId ?? contact.customerId ?? null,
    vendorId: (line as { vendorId?: number | null }).vendorId ?? contact.vendorId ?? null,
  }));
}
