import type { AppDb } from '../schema';
import { isAccountingFirm, missingFirmServices } from '@shared/domain/sales/firmServices';

/** Gives an accounting or bookkeeping firm its services as items in Items & Prices.
 *
 * Runs when the company is created as a firm, and again if the business type is later changed to
 * one. Idempotent: only names the firm does not already have are added, so re-running never
 * duplicates and never touches a price the firm has set. Prices start at zero — the firm's own
 * fee is the firm's to enter, on the item, once, and it is then what every invoice uses.
 *
 * A service is a non-stock item: it takes no quantity on hand and posts no cost of sales. Its
 * revenue account is left for the firm to choose unless the chart has exactly one obvious sales
 * account, in which case that is used so the first invoice needs no setup at all. */
export async function seedFirmServices(db: AppDb, businessType: string | null | undefined): Promise<number> {
  if (!isAccountingFirm(businessType)) return 0;
  const existing = await db.selectFrom('products').select('name').execute();
  const names = missingFirmServices(existing.map((row) => row.name));
  if (names.length === 0) return 0;

  const revenueAccounts = await db.selectFrom('accounts').select(['id', 'name']).where('accountType', '=', 'Revenue').where('isActive', '=', 1).execute();
  const preferred = revenueAccounts.find((account) => /fee|service|sales|revenue/i.test(account.name)) ?? (revenueAccounts.length === 1 ? revenueAccounts[0] : undefined);

  await db.insertInto('products').values(names.map((name) => ({
    sku: null,
    barcode: null,
    name,
    description: null,
    unit: 'service',
    salePriceCents: 0,
    purchasePriceCents: 0,
    incomeAccountId: preferred?.id ?? null,
    cogsAccountId: null,
    assetAccountId: null,
    trackQuantity: 0,
    defaultTaxCode: null,
    reorderPoint: 0,
    isActive: 1,
  }))).execute();
  return names.length;
}
