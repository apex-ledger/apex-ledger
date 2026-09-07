import { describe, expect, it } from 'vitest';
import { buildInventoryJournalLines, inventoryPostingMemo } from './buildInventoryJournalLines';
import type { InventoryMovement } from './inventoryValuation';

const INVENTORY = 10;
const COGS = 20;
const BANK = 30;

let nextId = 1;
function mv(movementDate: string, quantityDelta: number, unitCostCents: number | null): InventoryMovement {
  return {
    id: nextId++,
    productId: 1,
    movementDate,
    quantityDelta,
    unitCostCents,
    kind: quantityDelta >= 0 ? 'purchase' : 'sale',
    journalEntryId: null,
    note: null,
  };
}

const BASE = {
  productId: 1,
  productName: 'Basmati 20kg',
  movementDate: '2025-03-10',
  assetAccountId: INVENTORY,
  cogsAccountId: COGS,
  counterAccountId: BANK,
  priorMovements: [] as InventoryMovement[],
};

describe('receiving stock', () => {
  it('debits inventory and credits what paid for it', () => {
    const r = buildInventoryJournalLines({ ...BASE, kind: 'purchase', quantityDelta: 10, unitCostCents: 25_00 });

    expect(r.amountCents).toBe(250_00);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ accountId: INVENTORY, debitCents: 250_00, creditCents: 0 });
    expect(r.lines[1]).toMatchObject({ accountId: BANK, debitCents: 0, creditCents: 250_00 });
  });

  it('balances', () => {
    const r = buildInventoryJournalLines({ ...BASE, kind: 'purchase', quantityDelta: 7, unitCostCents: 33_33 });
    const debits = r.lines.reduce((sum, l) => sum + l.debitCents, 0);
    const credits = r.lines.reduce((sum, l) => sum + l.creditCents, 0);
    expect(debits).toBe(credits);
  });

  it('posts nothing, and says why, when no paying account was chosen', () => {
    const r = buildInventoryJournalLines({ ...BASE, kind: 'purchase', quantityDelta: 10, unitCostCents: 25_00, counterAccountId: null });
    expect(r.lines).toEqual([]);
    expect(r.skippedReason).toContain('what paid for this stock');
  });

  it('posts nothing for stock received at no cost', () => {
    const r = buildInventoryJournalLines({ ...BASE, kind: 'purchase', quantityDelta: 10, unitCostCents: 0 });
    expect(r.lines).toEqual([]);
    expect(r.skippedReason).toContain('nothing to post');
  });
});

describe('stock going out', () => {
  it('charges cost of goods sold at the running average, not the latest price', () => {
    // 10 at 2.00 then 10 at 4.00 leaves an average of 3.00. Selling 5 costs 15.00.
    const prior = [mv('2025-01-05', 10, 2_00), mv('2025-02-05', 10, 4_00)];
    const r = buildInventoryJournalLines({ ...BASE, kind: 'sale', quantityDelta: -5, unitCostCents: null, priorMovements: prior });

    expect(r.amountCents).toBe(15_00);
    expect(r.lines[0]).toMatchObject({ accountId: COGS, debitCents: 15_00 });
    expect(r.lines[1]).toMatchObject({ accountId: INVENTORY, creditCents: 15_00 });
  });

  it('posts no revenue — the invoice does that', () => {
    // Posting revenue here as well would count every sale twice.
    const prior = [mv('2025-01-05', 10, 2_00)];
    const r = buildInventoryJournalLines({ ...BASE, kind: 'sale', quantityDelta: -1, unitCostCents: null, priorMovements: prior });
    expect(r.lines.map((l) => l.accountId).sort()).toEqual([COGS, INVENTORY].sort());
  });

  it('ignores a cost typed on the way out', () => {
    // Stock leaves at the average in force, whatever anyone types.
    const prior = [mv('2025-01-05', 10, 2_00)];
    const r = buildInventoryJournalLines({ ...BASE, kind: 'sale', quantityDelta: -5, unitCostCents: 99_00, priorMovements: prior });
    expect(r.amountCents).toBe(10_00);
  });

  it('charges nothing when the stock was never recorded as received', () => {
    // Inventing a cost would be worse than posting none.
    const r = buildInventoryJournalLines({ ...BASE, kind: 'sale', quantityDelta: -5, unitCostCents: null, priorMovements: [] });
    expect(r.lines).toEqual([]);
    expect(r.skippedReason).toContain('no cost on hand');
  });

  it('treats a write-off the same way as a sale', () => {
    const prior = [mv('2025-01-05', 10, 3_00)];
    const r = buildInventoryJournalLines({ ...BASE, kind: 'adjustment', quantityDelta: -2, unitCostCents: null, priorMovements: prior });
    expect(r.amountCents).toBe(6_00);
    expect(r.lines[0].accountId).toBe(COGS);
    expect(r.lines[0].description).toContain('written off');
  });
});

describe('when a product is not ready to post', () => {
  it('posts nothing without an inventory account', () => {
    const r = buildInventoryJournalLines({ ...BASE, kind: 'purchase', quantityDelta: 5, unitCostCents: 10_00, assetAccountId: null });
    expect(r.lines).toEqual([]);
    expect(r.skippedReason).toContain('inventory asset account');
  });

  it('posts nothing on the way out without a cost-of-goods-sold account', () => {
    const prior = [mv('2025-01-05', 10, 2_00)];
    const r = buildInventoryJournalLines({
      ...BASE,
      kind: 'sale',
      quantityDelta: -1,
      unitCostCents: null,
      cogsAccountId: null,
      priorMovements: prior,
    });
    expect(r.lines).toEqual([]);
    expect(r.skippedReason).toContain('cost-of-goods-sold');
  });
});

describe('inventoryPostingMemo', () => {
  it('says what the entry is, so it is recognisable in the ledger later', () => {
    expect(inventoryPostingMemo({ kind: 'sale', productName: 'Basmati 20kg' })).toBe('Cost of goods sold — Basmati 20kg');
    expect(inventoryPostingMemo({ kind: 'opening', productName: 'Basmati 20kg' })).toBe('Opening stock count — Basmati 20kg');
    expect(inventoryPostingMemo({ kind: 'purchase', productName: 'Basmati 20kg' })).toBe('Stock received — Basmati 20kg');
  });
});
