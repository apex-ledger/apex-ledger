import { describe, expect, it } from 'vitest';
import { inventoryStatus, valueProduct, type InventoryMovement } from './inventoryValuation';

let nextId = 1;
function mv(
  productId: number,
  movementDate: string,
  quantityDelta: number,
  unitCostCents: number | null,
  kind: InventoryMovement['kind'] = quantityDelta >= 0 ? 'purchase' : 'sale',
): InventoryMovement {
  return {
    id: nextId++,
    productId,
    movementDate,
    quantityDelta,
    unitCostCents,
    kind,
    journalEntryId: null,
    note: null,
  };
}

describe('valueProduct — moving weighted average', () => {
  it('values a single purchase at what was paid', () => {
    const v = valueProduct(1, [mv(1, '2025-01-05', 10, 2_00)]);
    expect(v.quantityOnHand).toBe(10);
    expect(v.averageCostCents).toBe(2_00);
    expect(v.totalValueCents).toBe(20_00);
  });

  it('re-averages when a second purchase comes in at a different price', () => {
    // 10 @ 2.00 = 20.00, then 10 @ 4.00 = 40.00. 20 units worth 60.00, so 3.00 each.
    const v = valueProduct(1, [mv(1, '2025-01-05', 10, 2_00), mv(1, '2025-02-05', 10, 4_00)]);
    expect(v.quantityOnHand).toBe(20);
    expect(v.averageCostCents).toBe(3_00);
    expect(v.totalValueCents).toBe(60_00);
  });

  it('issues stock at the average in force at that moment, not at the latest price', () => {
    // This is the whole point of weighted average: the sale between the two purchases must cost
    // 2.00, not 3.00, because the 4.00 stock had not arrived yet.
    const v = valueProduct(1, [
      mv(1, '2025-01-05', 10, 2_00),
      mv(1, '2025-01-20', -5, null),
      mv(1, '2025-02-05', 10, 4_00),
    ]);
    expect(v.costOfGoodsSoldCents).toBe(10_00); // 5 × 2.00
    expect(v.quantityOnHand).toBe(15);
    // 5 left at 2.00 (10.00) plus 10 at 4.00 (40.00) = 50.00 over 15 units.
    expect(v.totalValueCents).toBe(50_00);
  });

  it('leaves nothing behind when everything is sold', () => {
    const v = valueProduct(1, [mv(1, '2025-01-05', 10, 2_00), mv(1, '2025-01-20', -10, null)]);
    expect(v.quantityOnHand).toBe(0);
    expect(v.totalValueCents).toBe(0);
    expect(v.averageCostCents).toBe(0);
    expect(v.costOfGoodsSoldCents).toBe(20_00);
  });

  it('does not let rounding leave a phantom balance on an empty shelf', () => {
    // Three units at a price that does not divide evenly, then all three sold.
    const v = valueProduct(1, [mv(1, '2025-01-05', 3, 3_33), mv(1, '2025-01-20', -3, null)]);
    expect(v.quantityOnHand).toBe(0);
    expect(v.totalValueCents).toBe(0);
  });

  it('flags stock going negative rather than inventing a negative value', () => {
    // Sold more than was ever received — the count is behind reality. The valuation is a guess
    // from here, and saying so is better than reporting negative stock worth negative money.
    const v = valueProduct(1, [mv(1, '2025-01-05', 5, 2_00), mv(1, '2025-01-20', -8, null)]);
    expect(v.wentNegative).toBe(true);
    expect(v.quantityOnHand).toBe(-3);
    expect(v.totalValueCents).toBeLessThanOrEqual(0);
  });

  it('keeps historic negative stock at zero value and does not overvalue the next receipt', () => {
    const v = valueProduct(1, [
      mv(1, '2025-01-05', -5, null),
      mv(1, '2025-01-10', 10, 2_00),
    ]);
    expect(v.wentNegative).toBe(true);
    expect(v.quantityOnHand).toBe(5);
    expect(v.totalValueCents).toBe(10_00);
    expect(v.averageCostCents).toBe(2_00);
  });

  it('processes movements in date order however they arrive', () => {
    const outOfOrder = [
      mv(1, '2025-02-05', 10, 4_00),
      mv(1, '2025-01-05', 10, 2_00),
      mv(1, '2025-01-20', -5, null),
    ];
    const v = valueProduct(1, outOfOrder);
    expect(v.costOfGoodsSoldCents).toBe(10_00); // still 5 × 2.00, not 5 × 3.00
  });

  it('ignores movements belonging to other products', () => {
    const v = valueProduct(1, [mv(1, '2025-01-05', 10, 2_00), mv(2, '2025-01-06', 99, 9_99)]);
    expect(v.quantityOnHand).toBe(10);
  });

  it('records the running position after each movement', () => {
    const v = valueProduct(1, [
      mv(1, '2025-01-05', 10, 2_00),
      mv(1, '2025-02-05', 10, 4_00),
      mv(1, '2025-03-05', -4, null),
    ]);
    expect(v.steps.map((s) => s.quantityOnHand)).toEqual([10, 20, 16]);
    expect(v.steps[2].costOfGoodsSoldCents).toBe(12_00); // 4 × 3.00
    expect(v.steps[2].averageCostCents).toBe(3_00); // unchanged by an issue
  });

  it('treats an opening count like any other receipt', () => {
    const v = valueProduct(1, [mv(1, '2024-10-01', 100, 1_50, 'opening'), mv(1, '2024-11-01', -10, null)]);
    expect(v.quantityOnHand).toBe(90);
    expect(v.costOfGoodsSoldCents).toBe(15_00);
  });

  it('handles a write-down adjustment that removes stock without a sale', () => {
    const v = valueProduct(1, [mv(1, '2025-01-05', 10, 2_00), mv(1, '2025-06-05', -2, null, 'adjustment')]);
    expect(v.quantityOnHand).toBe(8);
    expect(v.totalValueCents).toBe(16_00);
  });
});

describe('inventoryStatus', () => {
  it('values every product as of a date, ignoring anything later', () => {
    const movements = [
      mv(1, '2025-01-05', 10, 2_00),
      mv(2, '2025-01-05', 5, 10_00),
      mv(1, '2025-06-05', 10, 4_00), // after the as-of date
    ];
    const r = inventoryStatus([1, 2], movements, '2025-03-31');

    expect(r.rows.find((x) => x.productId === 1)?.quantityOnHand).toBe(10);
    expect(r.totalValueCents).toBe(20_00 + 50_00);
  });

  it('gives a past year end the figure that belonged on that balance sheet', () => {
    const movements = [mv(1, '2024-09-01', 100, 1_00), mv(1, '2024-10-15', 50, 2_00)];
    expect(inventoryStatus([1], movements, '2024-09-30').totalValueCents).toBe(100_00);
  });

  it('counts the products whose stock has gone negative', () => {
    const movements = [mv(1, '2025-01-05', 1, 2_00), mv(1, '2025-01-06', -5, null)];
    const r = inventoryStatus([1], movements, '2025-12-31');
    expect(r.negativeStockCount).toBe(1);
  });

  it('reports a product with no movements as empty rather than omitting it', () => {
    const r = inventoryStatus([1, 2], [mv(1, '2025-01-05', 3, 1_00)], '2025-12-31');
    expect(r.rows).toHaveLength(2);
    expect(r.rows.find((x) => x.productId === 2)?.quantityOnHand).toBe(0);
  });
});
