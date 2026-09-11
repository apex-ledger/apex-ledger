import type { AppDb } from '../schema';
import type { TaxCode } from '@shared/domain/types';

/**
 * A STARTER set of common bank-statement keyword -> category rules, matched against transaction
 * descriptions during CSV/paste import (see shared/domain/categorization/matchCategory.ts).
 * Resolved by account NAME (not code) so the same rule list works across chart-of-account
 * templates that use different account codes for the same category. Not exhaustive — accountants
 * should review suggested categories and add their own rules (Chart of Accounts / Category Rules).
 */
export interface CategoryRuleSeedRow {
  pattern: string;
  accountName: string;
  taxCode: TaxCode | null;
  priority: number;
}

export const CATEGORY_RULES_SEED: CategoryRuleSeedRow[] = [
  { pattern: 'HYDRO', accountName: 'Utilities', taxCode: 'NonHST', priority: 0 },
  { pattern: 'ENBRIDGE', accountName: 'Utilities', taxCode: 'NonHST', priority: 0 },
  { pattern: 'WATER', accountName: 'Utilities', taxCode: 'NonHST', priority: 0 },
  { pattern: 'BELL CANADA', accountName: 'Telephone', taxCode: 'HST', priority: 5 },
  { pattern: 'ROGERS', accountName: 'Telephone', taxCode: 'HST', priority: 0 },
  { pattern: 'TELUS', accountName: 'Telephone', taxCode: 'HST', priority: 0 },
  { pattern: 'FREEDOM MOBILE', accountName: 'Telephone', taxCode: 'HST', priority: 0 },
  { pattern: 'RENT', accountName: 'Rent / Lease', taxCode: 'HST', priority: 0 },
  { pattern: 'LEASE', accountName: 'Rent / Lease', taxCode: 'HST', priority: 0 },
  { pattern: 'INTEREST', accountName: 'Bank Charges', taxCode: 'NonHST', priority: 0 },
  { pattern: 'SERVICE CHARGE', accountName: 'Bank Charges', taxCode: 'NonHST', priority: 0 },
  { pattern: 'MONTHLY FEE', accountName: 'Bank Charges', taxCode: 'NonHST', priority: 0 },
  { pattern: 'NSF', accountName: 'Bank Charges', taxCode: 'NonHST', priority: 0 },
  { pattern: 'OVERDRAFT', accountName: 'Bank Charges', taxCode: 'NonHST', priority: 0 },
  { pattern: 'MONERIS', accountName: 'Merchant / Credit Card Processing Fees', taxCode: 'NonHST', priority: 0 },
  { pattern: 'SQUARE', accountName: 'Merchant / Credit Card Processing Fees', taxCode: 'NonHST', priority: 0 },
  { pattern: 'STRIPE', accountName: 'Merchant / Credit Card Processing Fees', taxCode: 'NonHST', priority: 0 },
  { pattern: 'MERCHANT FEE', accountName: 'Merchant / Credit Card Processing Fees', taxCode: 'NonHST', priority: 0 },
  // Generic catch-all for any other "...fee" description — ranked below the specific fee rules
  // above via the pattern-length tie-break in suggestCategory, so those still win when present.
  { pattern: 'FEE', accountName: 'Bank Charges', taxCode: 'NonHST', priority: 0 },
  { pattern: 'INSURANCE', accountName: 'Insurance', taxCode: 'NonHST', priority: 0 },
  // Cheque/card-settlement deposits are money in — Sales Revenue (or Service Revenue, depending
  // on which chart-of-accounts template is in use). Card-network settlement deposits (Visa/
  // Mastercard) are just cash clearing for sales already taxed at the point of sale, so they're
  // tagged NonHST here; a cheque deposit's tax treatment is less certain, so it's Manual instead.
  { pattern: 'CHEQUE DEPOSIT', accountName: 'Sales Revenue', taxCode: 'Manual', priority: 0 },
  { pattern: 'CHEQUE DEPOSIT', accountName: 'Service Revenue', taxCode: 'Manual', priority: 0 },
  { pattern: 'VSA DEP', accountName: 'Sales Revenue', taxCode: 'NonHST', priority: 0 },
  { pattern: 'VSA DEP', accountName: 'Service Revenue', taxCode: 'NonHST', priority: 0 },
  { pattern: 'MC DEP', accountName: 'Sales Revenue', taxCode: 'NonHST', priority: 0 },
  { pattern: 'MC DEP', accountName: 'Service Revenue', taxCode: 'NonHST', priority: 0 },
  { pattern: 'PAYROLL', accountName: 'Salaries, Wages & Benefits', taxCode: 'NonHST', priority: 0 },
  { pattern: 'STAPLES', accountName: 'Office Supplies', taxCode: 'HST', priority: 0 },
  { pattern: 'OFFICE DEPOT', accountName: 'Office Supplies', taxCode: 'HST', priority: 0 },
  { pattern: 'SHELL', accountName: 'Motor Vehicle Expenses', taxCode: 'HST', priority: 0 },
  { pattern: 'ESSO', accountName: 'Motor Vehicle Expenses', taxCode: 'HST', priority: 0 },
  { pattern: 'PETRO-CANADA', accountName: 'Motor Vehicle Expenses', taxCode: 'HST', priority: 0 },
  { pattern: 'HUSKY', accountName: 'Motor Vehicle Expenses', taxCode: 'HST', priority: 0 },
  { pattern: 'CIRCLE K', accountName: 'Motor Vehicle Expenses', taxCode: 'HST', priority: 0 },
  { pattern: 'FUEL', accountName: 'Motor Vehicle Expenses', taxCode: 'HST', priority: 0 },
  { pattern: 'DIESEL', accountName: 'Motor Vehicle Expenses', taxCode: 'HST', priority: 0 },
  { pattern: 'UBER', accountName: 'Motor Vehicle Expenses', taxCode: 'HST', priority: 0 },
  // Longer, more specific patterns than the generic 'LEASE' rule above (which stays mapped to
  // Rent / Lease for premises) — the pattern-length tie-break in suggestCategory means these win
  // whenever they match, without having to touch the generic rule.
  { pattern: 'VEHICLE LEASE', accountName: 'Vehicle Lease', taxCode: 'HST', priority: 0 },
  { pattern: 'CAR LEASE', accountName: 'Vehicle Lease', taxCode: 'HST', priority: 0 },
  { pattern: 'TRUCK LEASE', accountName: 'Vehicle Lease', taxCode: 'HST', priority: 0 },
  { pattern: 'AUTO LEASE', accountName: 'Vehicle Lease', taxCode: 'HST', priority: 0 },
  { pattern: 'TOYOTA FINANCIAL', accountName: 'Vehicle Lease', taxCode: 'HST', priority: 0 },
  { pattern: 'HONDA FINANCIAL', accountName: 'Vehicle Lease', taxCode: 'HST', priority: 0 },
  { pattern: 'FORD CREDIT', accountName: 'Vehicle Lease', taxCode: 'HST', priority: 0 },
  { pattern: 'GM FINANCIAL', accountName: 'Vehicle Lease', taxCode: 'HST', priority: 0 },
  { pattern: 'NISSAN FINANCE', accountName: 'Vehicle Lease', taxCode: 'HST', priority: 0 },
  { pattern: 'ALLY FINANCIAL', accountName: 'Vehicle Lease', taxCode: 'HST', priority: 0 },
  { pattern: 'SCOTIA DEALER', accountName: 'Vehicle Lease', taxCode: 'HST', priority: 0 },
  { pattern: 'PROPERTY TAX', accountName: 'Property Tax', taxCode: 'NonHST', priority: 0 },
  // Wholesale/resale-inventory vendors are frequently a mix of HST and zero-rated/exempt goods
  // (e.g. groceries) on one invoice — 'Manual' flags these for the accountant to split by hand,
  // matching how most bookkeepers already treat cash-and-carry type purchases.
  { pattern: 'COSTCO', accountName: 'Purchases', taxCode: 'Manual', priority: 0 },
  { pattern: 'CASH AND CARRY', accountName: 'Purchases', taxCode: 'Manual', priority: 0 },
  { pattern: 'CASH & CARRY', accountName: 'Purchases', taxCode: 'Manual', priority: 0 },
  { pattern: 'WHOLESALE', accountName: 'Purchases', taxCode: 'Manual', priority: 0 },
  { pattern: 'LEGAL', accountName: 'Legal & Accounting Fees', taxCode: 'HST', priority: 0 },
  { pattern: 'ACCOUNTANT', accountName: 'Legal & Accounting Fees', taxCode: 'HST', priority: 0 },
  { pattern: 'BOOKKEEPING', accountName: 'Legal & Accounting Fees', taxCode: 'HST', priority: 0 },
  { pattern: 'FACEBOOK ADS', accountName: 'Advertising & Promotion', taxCode: 'HST', priority: 0 },
  { pattern: 'GOOGLE ADS', accountName: 'Advertising & Promotion', taxCode: 'HST', priority: 0 },
  { pattern: 'ADOBE', accountName: 'Software & Subscriptions', taxCode: 'HST', priority: 0 },
  { pattern: 'MICROSOFT', accountName: 'Software & Subscriptions', taxCode: 'HST', priority: 0 },
];

export async function seedCategoryRules(db: AppDb): Promise<void> {
  const accounts = await db.selectFrom('accounts').select(['id', 'name']).execute();
  const idByName = new Map(accounts.map((a) => [a.name, a.id]));

  const existing = await db.selectFrom('categoryRules').select(['pattern', 'accountId']).execute();
  const existingKeys = new Set(existing.map((r) => `${r.pattern}::${r.accountId}`));

  for (const rule of CATEGORY_RULES_SEED) {
    const accountId = idByName.get(rule.accountName);
    if (!accountId) continue; // this chart of accounts doesn't have that category — skip
    if (existingKeys.has(`${rule.pattern}::${accountId}`)) continue; // already seeded — safe to call more than once
    await db
      .insertInto('categoryRules')
      .values({
        pattern: rule.pattern,
        accountId,
        taxCode: rule.taxCode,
        priority: rule.priority,
        isActive: 1,
      })
      .execute();
  }
}
