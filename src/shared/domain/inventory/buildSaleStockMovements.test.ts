import { describe, expect, it } from 'vitest';
import { buildSaleReversalMovements, buildSaleStockMovements } from './buildSaleStockMovements';

describe('buildSaleStockMovements', () => {
  it('takes stock out for every line that names a product', () => {
    const r = buildSaleStockMovements(
      [
        { productId: 1, quantity: 5, description: 'Glass' },
        { productId: 2, quantity: 3, description: 'Gloves' },
      ],
      '2025-03-10',
      'INV-1001',
    );

    expect(r.movements).toHaveLength(2);
    expect(r.movements[0]).toMatchObject({ productId: 1, quantityDelta: -5, kind: 'sale' });
    expect(r.movements[1]).toMatchObject({ productId: 2, quantityDelta: -3 });
  });

  it('always moves stock out, whatever sign the quantity arrived with', () => {
    const r = buildSaleStockMovements([{ productId: 1, quantity: 5, description: null }], '2025-03-10', null);
    expect(r.movements[0].quantityDelta).toBeLessThan(0);
  });

  it('leaves a service line alone but counts it', () => {
    // A delivery charge or an hour of labour has no stock behind it. Someone expecting their stock
    // to fall needs to know why it did not.
    const r = buildSaleStockMovements(
      [
        { productId: 1, quantity: 2, description: 'Glass' },
        { productId: null, quantity: 1, description: 'Delivery' },
      ],
      '2025-03-10',
      'INV-1001',
    );

    expect(r.movements).toHaveLength(1);
    expect(r.linesWithoutProduct).toBe(1);
  });

  it('ignores a zero or negative quantity rather than putting stock back', () => {
    // A negative on a sale line belongs on a credit note. Treating it as a return here would
    // quietly restock something at a cost nobody paid.
    const r = buildSaleStockMovements(
      [
        { productId: 1, quantity: 0, description: 'placeholder row' },
        { productId: 2, quantity: -4, description: 'should have been a credit note' },
      ],
      '2025-03-10',
      null,
    );
    expect(r.movements).toEqual([]);
  });

  it('keeps two lines of the same product separate', () => {
    // The stock history should read back the way the invoice does, so a later correction to one
    // line can be traced to one movement.
    const r = buildSaleStockMovements(
      [
        { productId: 1, quantity: 2, description: 'first box' },
        { productId: 1, quantity: 3, description: 'second box' },
      ],
      '2025-03-10',
      'INV-1001',
    );

    expect(r.movements).toHaveLength(2);
    expect(r.movements.map((m) => m.quantityDelta)).toEqual([-2, -3]);
  });

  it('notes which document the movement came from', () => {
    const r = buildSaleStockMovements([{ productId: 1, quantity: 1, description: 'Glass' }], '2025-03-10', 'INV-1001');
    expect(r.movements[0].note).toBe('INV-1001 — Glass');
  });

  it('dates the movement to the document, not to today', () => {
    // An invoice raised in March takes the stock out in March, whenever it is entered.
    const r = buildSaleStockMovements([{ productId: 1, quantity: 1, description: null }], '2025-03-10', null);
    expect(r.movements[0].movementDate).toBe('2025-03-10');
  });

  it('does nothing for a document with no stock lines at all', () => {
    const r = buildSaleStockMovements([{ productId: null, quantity: 5, description: 'Consulting' }], '2025-03-10', null);
    expect(r.movements).toEqual([]);
    expect(r.linesWithoutProduct).toBe(1);
  });
});

describe('buildSaleReversalMovements', () => {
  it('puts the quantity back when a sale is undone', () => {
    const { movements } = buildSaleStockMovements([{ productId: 1, quantity: 5, description: 'Glass' }], '2025-03-10', 'INV-1001');
    const reversal = buildSaleReversalMovements(movements, '2025-04-01');

    expect(reversal[0].quantityDelta).toBe(5);
    expect(reversal[0].productId).toBe(1);
  });

  it('calls it an adjustment, not a purchase', () => {
    // A purchase needs a cost, and using one would re-average the pool at a price nobody paid.
    const { movements } = buildSaleStockMovements([{ productId: 1, quantity: 5, description: null }], '2025-03-10', null);
    expect(buildSaleReversalMovements(movements, '2025-04-01')[0].kind).toBe('adjustment');
  });

  it('dates the reversal to when it happened, not to the original sale', () => {
    const { movements } = buildSaleStockMovements([{ productId: 1, quantity: 5, description: null }], '2025-03-10', null);
    expect(buildSaleReversalMovements(movements, '2025-04-01')[0].movementDate).toBe('2025-04-01');
  });

  it('says what it is reversing', () => {
    const { movements } = buildSaleStockMovements([{ productId: 1, quantity: 1, description: 'Glass' }], '2025-03-10', 'INV-1001');
    expect(buildSaleReversalMovements(movements, '2025-04-01')[0].note).toContain('INV-1001');
  });
});
