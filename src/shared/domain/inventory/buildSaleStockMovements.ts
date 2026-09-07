/** What an invoice or sales receipt does to stock.
 *
 * Selling used to take two actions — raise the invoice, then go and record the movement — and the
 * second one gets forgotten. Once a line names a product, posting the document can do both, so the
 * quantity and the cost of goods sold follow from the sale itself rather than from somebody
 * remembering.
 *
 * Deliberately produces MOVEMENTS rather than journal lines. The movement path already knows how to
 * value stock leaving at the running weighted average and how to post it; going straight to journal
 * lines here would be a second implementation of that, and the two would eventually disagree about
 * what a sale cost.
 */

export interface SaleLineInput {
  /** Null for a service, a delivery charge, or anything not held as stock. */
  productId: number | null;
  quantity: number;
  description: string | null;
}

export interface StockMovementRequest {
  productId: number;
  movementDate: string;
  /** Always negative: this is stock leaving. */
  quantityDelta: number;
  kind: 'sale';
  note: string | null;
}

export interface SaleStockResult {
  movements: StockMovementRequest[];
  /** Lines that named no product, and so move no stock. Counted rather than hidden, because a
   * seller who expected their stock to fall needs to know why it did not. */
  linesWithoutProduct: number;
}

/**
 * One movement per line that names a product and sells a positive quantity.
 *
 * Lines are NOT merged by product even when the same item appears twice on one invoice. Each line
 * is its own movement, so the stock history reads back the way the invoice does and a later
 * correction to one line can be traced to one movement.
 */
export function buildSaleStockMovements(
  lines: SaleLineInput[],
  documentDate: string,
  documentReference: string | null,
): SaleStockResult {
  const movements: StockMovementRequest[] = [];
  let linesWithoutProduct = 0;

  for (const line of lines) {
    if (line.productId === null) {
      linesWithoutProduct += 1;
      continue;
    }
    // A zero or negative quantity on a sale line is either a placeholder row or a correction that
    // belongs on a credit note; either way it must not quietly put stock back on the shelf here.
    if (line.quantity <= 0) continue;

    movements.push({
      productId: line.productId,
      movementDate: documentDate,
      quantityDelta: -Math.abs(line.quantity),
      kind: 'sale',
      note: documentReference ? `${documentReference}${line.description ? ` — ${line.description}` : ''}` : line.description,
    });
  }

  return { movements, linesWithoutProduct };
}

/** Reverses the stock a document took out — used when an invoice is voided or a credit note issued.
 *
 * Puts the quantity back as an adjustment rather than a purchase: it was never bought, and calling
 * it a purchase would need a cost, which would then re-average the pool at a price nobody paid. */
export function buildSaleReversalMovements(
  movements: StockMovementRequest[],
  reversalDate: string,
): (Omit<StockMovementRequest, 'kind'> & { kind: 'adjustment' })[] {
  return movements.map((m) => ({
    productId: m.productId,
    movementDate: reversalDate,
    quantityDelta: Math.abs(m.quantityDelta),
    kind: 'adjustment' as const,
    note: m.note ? `Reversed — ${m.note}` : 'Reversed sale',
  }));
}
