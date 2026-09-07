import type { AppDb } from '../schema';
import { normalBalanceForType, type AccountType } from '@shared/domain/types';

/** Accounts added to both Chart of Accounts templates for new companies (see
 * coa_template.*.seed.ts) — kept here too so companies that already existed before this version
 * get them backfilled. Every gifiCode below is already in GIFI_CODES_SEED (see
 * gifiCodeReferences.test.ts), but a given company's own gifi_codes table only picks up newly
 * added codes via seedGifiCodes — this function MUST run after that call, not before, or the
 * accounts.gifi_code foreign key can fail for a company whose gifi_codes table hasn't been
 * refreshed yet in this same session. This bit a first attempt at this feature that used a plain
 * numbered migration instead, which ran too early in the open sequence. */
interface OpeningBalanceAccountSeed {
  code: string;
  name: string;
  accountType: AccountType;
  accountSubtype: string;
  gifiCode: string | null;
  /** Optional roll-up account. Used for the two opening-balance catch-alls so A/R and A/P
   * starting balances never have to be posted directly to their control account. */
  parentName?: string;
  isMaster?: boolean;
  /** Opening an older/imported company can find the preferred code already occupied. These two
   * workflow accounts are still required, so find the next free numeric code instead of silently
   * skipping them. Older seed rows keep their historical do-nothing-on-code-conflict behaviour. */
  findAlternateCode?: boolean;
}

export const OPENING_BALANCE_ACCOUNTS_SEED: OpeningBalanceAccountSeed[] = [
  {
    code: '1200',
    name: 'Accounts Receivable',
    accountType: 'Asset',
    accountSubtype: 'Current Asset',
    gifiCode: '1060',
    isMaster: true,
    findAlternateCode: true,
  },
  {
    code: '1201',
    name: 'Miscellaneous Accounts Receivable',
    accountType: 'Asset',
    accountSubtype: 'Current Asset',
    gifiCode: '1060',
    parentName: 'Accounts Receivable',
    findAlternateCode: true,
  },
  { code: '1180', name: 'Short-Term Investments', accountType: 'Asset', accountSubtype: 'Current Asset', gifiCode: '1180' },
  { code: '1240', name: 'Notes Receivable', accountType: 'Asset', accountSubtype: 'Current Asset', gifiCode: '1243' },
  { code: '1720', name: 'Leasehold Improvements', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1918' },
  { code: '1721', name: 'Accumulated Amortization - Leasehold Improvements', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1919' },
  { code: '1730', name: 'Vehicles', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1742' },
  { code: '1731', name: 'Accumulated Depreciation - Vehicles', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '1743' },
  { code: '1750', name: 'Long-Term Investments', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '2300' },
  { code: '1760', name: 'Mortgages Receivable', accountType: 'Asset', accountSubtype: 'Capital Asset', gifiCode: '2361' },
  {
    code: '2100',
    name: 'Accounts Payable',
    accountType: 'Liability',
    accountSubtype: 'Current Liability',
    gifiCode: '2621',
    isMaster: true,
    findAlternateCode: true,
  },
  { code: '2250', name: 'Deferred Revenue (Current)', accountType: 'Liability', accountSubtype: 'Current Liability', gifiCode: '2770' },
  {
    code: '2101',
    name: 'Miscellaneous Accounts Payable',
    accountType: 'Liability',
    accountSubtype: 'Current Liability',
    gifiCode: '2621',
    parentName: 'Accounts Payable',
    findAlternateCode: true,
  },
  { code: '2350', name: 'Customer Deposits', accountType: 'Liability', accountSubtype: 'Current Liability', gifiCode: '2961' },
  { code: '2550', name: 'Line of Credit', accountType: 'Liability', accountSubtype: 'Long-Term Liability', gifiCode: '3149' },
  { code: '2600', name: 'Mortgage Payable', accountType: 'Liability', accountSubtype: 'Long-Term Liability', gifiCode: '3141' },
  { code: '2650', name: 'Deferred Revenue (Long-Term)', accountType: 'Liability', accountSubtype: 'Long-Term Liability', gifiCode: '3220' },
  // Refund accounts, both directions — a debit to Customer Refunds & Returns nets against revenue
  // (money paid back out to a customer); a credit to Vendor Refunds & Rebates nets against
  // expenses (money paid back in by a vendor/vendor). Kept generic here (not the more specific
  // "Purchase Refunds & Rebates" Cost of Sales variant Retail's own template adds) since this
  // backfill runs for every existing company regardless of which business type it started as.
  { code: '4990', name: 'Customer Refunds & Returns', accountType: 'Revenue', accountSubtype: 'Revenue', gifiCode: '8000' },
  { code: '5990', name: 'Vendor Refunds & Rebates', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: null },
  // A temporary holding account for a bank-side mistake (e.g. an accidental double withdrawal the
  // bank reverses a day or two later) — both the erroneous withdrawal and its reversal post here
  // instead of a real expense/revenue account, netting to zero without ever touching the Income
  // Statement.
  { code: '1290', name: 'Suspense Account (Bank Errors)', accountType: 'Asset', accountSubtype: 'Current Asset', gifiCode: null },
];

export function nextAvailableNumericCode(preferred: string, usedCodes: ReadonlySet<string>): string {
  let candidate = Number(preferred);
  while (usedCodes.has(String(candidate))) candidate += 1;
  return String(candidate);
}

/** Adds each account only if this company has nothing by that exact name yet (case-insensitive)
 * — safe to re-run on every open, and never touches an account the accountant already has under
 * a different code or already renamed/removed. */
export async function seedOpeningBalanceAccounts(db: AppDb): Promise<void> {
  for (const account of OPENING_BALANCE_ACCOUNTS_SEED) {
    const existing = await db.selectFrom('accounts').select('id').where('name', 'like', account.name).executeTakeFirst();
    if (existing) continue;

    const parent = account.parentName
      ? await db.selectFrom('accounts').select('id').where('name', 'like', account.parentName).executeTakeFirst()
      : null;
    let code = account.code;
    if (account.findAlternateCode) {
      const usedCodes = new Set((await db.selectFrom('accounts').select('code').execute()).map((row) => row.code));
      code = nextAvailableNumericCode(code, usedCodes);
    }

    const inserted = await db
      .insertInto('accounts')
      .values({
        code,
        name: account.name,
        accountType: account.accountType,
        accountSubtype: account.accountSubtype,
        normalBalance: normalBalanceForType(account.accountType),
        parentId: parent?.id ?? null,
        gifiCode: account.gifiCode,
        isActive: 1,
        isSystem: 0,
        description: null,
        isTransferEligible: 0,
        isMaster: account.isMaster ? 1 : 0,
      })
      .onConflict((oc) => oc.column('code').doNothing())
      .returning('id')
      .executeTakeFirst();

    if (inserted && parent) {
      await db.updateTable('accounts').set({ isMaster: 1 }).where('id', '=', parent.id).execute();
    }
  }
}
