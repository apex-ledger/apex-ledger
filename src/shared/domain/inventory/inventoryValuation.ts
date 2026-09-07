/** Stock on hand and what it is worth, from a product's movement history.
 *
 * Valued at moving weighted average cost, which is what a Canadian small business almost always
 * uses and what the CRA accepts without an election: each receipt re-averages the cost of
 * everything on hand, and every issue leaves at that average. The alternative, specific
 * identification, needs a lot-tracked warehouse; FIFO needs layers to be kept and unwound. Neither
 * is the right ask of a grocery counting shelves once a year.
 *
 * Everything here is pure and works from the movement list alone, so the same function values a
 * product for the stock report, for cost of goods sold at the moment of a sale, and for the year-end
 * figure that goes on the balance sheet. Those three disagreeing is the classic inventory bug.
 */

export type MovementKind = 'purchase' | 'sale' | 'adjustment' | 'opening';

export interface InventoryMovement {
  id: number;
  productId: number;
  movementDate: string;
  /** Positive brings stock in, negative takes it out. */
  quantityDelta: number;
  /** Cost per unit for an inbound movement. Ignored on the way out — an issue always leaves at the
   * running average, never at whatever was typed. Null for outbound movements. */
  unitCostCents: number | null;
  kind: MovementKind;
  journalEntryId: number | null;
  note: string | null;
}

export interface ValuationStep {
  movement: InventoryMovement;
  /** Quantity after this movement. */
  quantityOnHand: number;
  /** Weighted average unit cost after this movement, in cents. */
  averageCostCents: number;
  /** Value of the stock after this movement, in cents. */
  valueCents: number;
  /** For an outbound movement, what it cost — the figure that belongs in cost of goods sold. */
  costOfGoodsSoldCents: number;
}

export interface ProductValuation {
  productId: number;
  quantityOnHand: number;
  averageCostCents: number;
  totalValueCents: number;
  /** Cumulative cost of everything issued, over the movements considered. */
  costOfGoodsSoldCents: number;
  steps: ValuationStep[];
  /** True when stock went below zero at some point — sold more than was ever received. Not an
   * error to refuse, because the count is often behind reality, but it makes the valuation a
   * guess and the report should say so rather than presenting it as fact. */
  wentNegative: boolean;
}

/** Rounds to whole cents the way money should be: half away from zero, so 0.5 does not drift down
 * and a negative value rounds symmetrically to its positive twin. */
function roundCents(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function valueProduct(productId: number, movements: InventoryMovement[]): ProductValuation {
  const ordered = [...movements]
    .filter((m) => m.productId === productId)
    .sort((a, b) => a.movementDate.localeCompare(b.movementDate) || a.id - b.id);

  let quantity = 0;
  let valueCents = 0;
  let cogsCents = 0;
  let wentNegative = false;
  const steps: ValuationStep[] = [];

  for (const movement of ordered) {
    let stepCogs = 0;

    if (movement.quantityDelta >= 0) {
      // Inbound: add its cost to the pool, then re-average across everything on hand. Historic
      // company files may contain negative stock from older builds. In that case a receipt first
      // fills the deficit; only the quantity that becomes physically on hand carries inventory
      // value. New postings are prevented from creating negative tracked stock.
      const oldQuantity = quantity;
      const newQuantity = quantity + movement.quantityDelta;
      const unitsAddingValue = oldQuantity < 0 ? Math.max(0, newQuantity) : movement.quantityDelta;
      const addedCents = roundCents(unitsAddingValue * (movement.unitCostCents ?? 0));
      quantity = newQuantity;
      valueCents += addedCents;
      if (quantity <= 0) valueCents = 0;
    } else {
      // Outbound: leaves at the average in force right now, computed BEFORE the quantity changes.
      const averageBefore = quantity > 0 ? valueCents / quantity : 0;
      const issued = Math.abs(movement.quantityDelta);
      stepCogs = roundCents(issued * averageBefore);
      quantity -= issued;
      valueCents -= stepCogs;
      cogsCents += stepCogs;

      if (quantity < 0) {
        wentNegative = true;
        // Historic files may contain negative stock. It cannot carry a negative asset value.
        valueCents = 0;
      }
    }

    // Floating error accumulates over hundreds of movements; snapping to zero when the shelf is
    // empty stops a fraction of a cent surviving as a permanent phantom balance.
    if (quantity === 0) valueCents = 0;

    const averageCostCents = quantity > 0 ? roundCents(valueCents / quantity) : 0;
    steps.push({
      movement,
      quantityOnHand: quantity,
      averageCostCents,
      valueCents: roundCents(valueCents),
      costOfGoodsSoldCents: stepCogs,
    });
  }

  return {
    productId,
    quantityOnHand: quantity,
    averageCostCents: quantity > 0 ? roundCents(valueCents / quantity) : 0,
    totalValueCents: roundCents(valueCents),
    costOfGoodsSoldCents: cogsCents,
    steps,
    wentNegative,
  };
}

export interface InventoryStatusRow {
  productId: number;
  quantityOnHand: number;
  averageCostCents: number;
  totalValueCents: number;
  wentNegative: boolean;
}

export interface InventoryStatusResult {
  asOfDate: string;
  rows: InventoryStatusRow[];
  totalValueCents: number;
  /** Products whose history implies negative stock — worth surfacing, since the valuation of those
   * is an estimate rather than a fact. */
  negativeStockCount: number;
}

/** Stock on hand for every product as of a date. Movements after the date are excluded, so this can
 * be run for a past year end and give the figure that belonged on that balance sheet. */
export function inventoryStatus(
  productIds: number[],
  movements: InventoryMovement[],
  asOfDate: string,
): InventoryStatusResult {
  const upTo = movements.filter((m) => m.movementDate <= asOfDate);
  const rows: InventoryStatusRow[] = productIds.map((productId) => {
    const v = valueProduct(productId, upTo);
    return {
      productId,
      quantityOnHand: v.quantityOnHand,
      averageCostCents: v.averageCostCents,
      totalValueCents: v.totalValueCents,
      wentNegative: v.wentNegative,
    };
  });

  return {
    asOfDate,
    rows,
    totalValueCents: rows.reduce((sum, r) => sum + r.totalValueCents, 0),
    negativeStockCount: rows.filter((r) => r.quantityOnHand < 0).length,
  };
}
