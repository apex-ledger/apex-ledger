import type { InventoryMovement, MovementKind } from './inventoryValuation';
import { valueProduct } from './inventoryValuation';

/** Turns a stock movement into the journal lines it implies.
 *
 * Without this, inventory is a tally kept beside the books rather than part of them: stock on hand
 * and cost of goods sold would be computed from movements while the balance sheet knew nothing
 * about either. Someone would trust the stock report and then find it contradicted the statements.
 *
 * The postings are the standard perpetual-inventory ones:
 *
 *   receiving stock   Dr Inventory (asset)      Cr whatever paid for it — bank, or payables
 *   an opening count  Dr Inventory (asset)      Cr Opening Balance Equity
 *   stock going out   Dr Cost of Goods Sold     Cr Inventory (asset)
 *
 * Note what a sale does NOT do here: it posts no revenue. The sale itself is recorded when the
 * invoice or receipt is raised; this is only the cost side of it. Posting revenue from both places
 * would count every sale twice.
 *
 * Stock leaves at the weighted average in force at that moment, which is why this needs the
 * movements that came before rather than just the one being posted.
 */

export interface InventoryPostingLine {
  accountId: number;
  debitCents: number;
  creditCents: number;
  description: string;
}

export interface InventoryPostingResult {
  lines: InventoryPostingLine[];
  /** What the movement was worth, for the memo and for the caller to report. */
  amountCents: number;
  /** Why nothing was posted, when nothing was. Null when lines were produced. */
  skippedReason: string | null;
}

export interface InventoryPostingInput {
  productId: string | number;
  productName: string;
  kind: MovementKind;
  movementDate: string;
  quantityDelta: number;
  unitCostCents: number | null;
  /** Where the stock sits on the balance sheet. */
  assetAccountId: number | null;
  /** Where its cost goes when it leaves. */
  cogsAccountId: number | null;
  /** What paid for it, on the way in. Not needed on the way out. */
  counterAccountId: number | null;
  /** Every movement for this product BEFORE this one, needed for the running average. */
  priorMovements: InventoryMovement[];
}

export function buildInventoryJournalLines(input: InventoryPostingInput): InventoryPostingResult {
  const productId = Number(input.productId);

  // Accounts are optional on a product so it can be set up before the chart of accounts is ready.
  // A movement on such a product still tracks quantity; it just cannot post, and says so rather
  // than posting to some account it guessed at.
  if (input.assetAccountId === null) {
    return { lines: [], amountCents: 0, skippedReason: 'no inventory asset account set on this product' };
  }

  if (input.quantityDelta > 0) {
    const amountCents = Math.round(input.quantityDelta * (input.unitCostCents ?? 0));
    if (amountCents === 0) {
      return { lines: [], amountCents: 0, skippedReason: 'received at no cost, so there is nothing to post' };
    }
    if (input.counterAccountId === null) {
      return { lines: [], amountCents, skippedReason: 'no account chosen for what paid for this stock' };
    }
    const description = `${input.productName} — ${input.quantityDelta} received`;
    return {
      amountCents,
      skippedReason: null,
      lines: [
        { accountId: input.assetAccountId, debitCents: amountCents, creditCents: 0, description },
        { accountId: input.counterAccountId, debitCents: 0, creditCents: amountCents, description },
      ],
    };
  }

  // Going out: valued at the running average, which means replaying what came before.
  if (input.cogsAccountId === null) {
    return { lines: [], amountCents: 0, skippedReason: 'no cost-of-goods-sold account set on this product' };
  }

  const before = valueProduct(productId, input.priorMovements);
  const issued = Math.abs(input.quantityDelta);
  const averageCents = before.quantityOnHand > 0 ? before.totalValueCents / before.quantityOnHand : 0;
  const amountCents = Math.round(issued * averageCents);

  if (amountCents === 0) {
    // Selling stock that was never recorded as received. The quantity still moves, but there is no
    // cost to charge — and inventing one would be worse than posting nothing.
    return { lines: [], amountCents: 0, skippedReason: 'no cost on hand for this product yet, so there is nothing to charge' };
  }

  const description = `${input.productName} — ${issued} ${input.kind === 'sale' ? 'sold' : 'written off'}`;
  return {
    amountCents,
    skippedReason: null,
    lines: [
      { accountId: input.cogsAccountId, debitCents: amountCents, creditCents: 0, description },
      { accountId: input.assetAccountId, debitCents: 0, creditCents: amountCents, description },
    ],
  };
}

/** The memo that goes on the posted entry, so it is recognisable in the ledger months later. */
export function inventoryPostingMemo(input: Pick<InventoryPostingInput, 'kind' | 'productName'>): string {
  const what: Record<MovementKind, string> = {
    opening: 'Opening stock count',
    purchase: 'Stock received',
    sale: 'Cost of goods sold',
    adjustment: 'Stock adjustment',
  };
  return `${what[input.kind]} — ${input.productName}`;
}
