import type { AppDb } from '../db/schema';
import { saleLineAccountRefusalReason } from '@shared/domain/sales/saleLineAccounts';

/** Refuses a sales document whose lines post to an account a sale cannot credit (the A/R or
 * GST/HST control accounts, a bank account, stock, equity, an inactive account) — the same rule
 * the pickers apply, enforced where it matters. */
export async function assertSaleLineAccounts(db: AppDb, accountIds: number[], documentLabel: string): Promise<void> {
  const ids = Array.from(new Set(accountIds));
  if (ids.length === 0) return;
  const accounts = await db.selectFrom('accounts').select(['id', 'name', 'accountType', 'accountSubtype', 'isActive']).where('id', 'in', ids).execute();
  for (const id of ids) {
    const account = accounts.find((row) => row.id === id);
    if (!account) throw new Error(`A line on this ${documentLabel} refers to an account that does not exist.`);
    const refusal = saleLineAccountRefusalReason({ ...account, isActive: Boolean(account.isActive) });
    if (refusal) throw new Error(`${refusal} Choose a revenue account, a customer-deposit liability, a rebilled expense, or an asset being sold.`);
  }
}
