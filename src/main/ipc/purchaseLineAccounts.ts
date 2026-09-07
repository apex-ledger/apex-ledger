import type { AppDb } from '../db/schema';
import { purchaseLineAccountRefusalReason } from '@shared/domain/purchases/purchaseLineAccounts';

/** Refuses a purchase document whose lines post to an account a purchase cannot debit (the A/P or
 * GST/HST control accounts, a bank or card account, revenue, equity, an inactive account) — the
 * same rule the pickers apply, enforced where it matters. */
export async function assertPurchaseLineAccounts(db: AppDb, accountIds: number[], documentLabel: string): Promise<void> {
  const ids = Array.from(new Set(accountIds));
  if (ids.length === 0) return;
  const accounts = await db.selectFrom('accounts').select(['id', 'name', 'accountType', 'accountSubtype', 'isActive']).where('id', 'in', ids).execute();
  for (const id of ids) {
    const account = accounts.find((row) => row.id === id);
    if (!account) throw new Error(`A line on this ${documentLabel} refers to an account that does not exist.`);
    const refusal = purchaseLineAccountRefusalReason({ ...account, isActive: Boolean(account.isActive) });
    if (refusal) throw new Error(`${refusal} Choose an expense, cost of sales, an asset, or a loan being repaid.`);
  }
}
