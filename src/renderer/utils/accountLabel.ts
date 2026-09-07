import type { Account } from '@shared/domain/types';
import { SALE_LINE_GROUP_ORDER, saleLineAccounts } from '@shared/domain/sales/saleLineAccounts';
import { PURCHASE_LINE_GROUP_ORDER, purchaseLineAccounts } from '@shared/domain/purchases/purchaseLineAccounts';

/** The sublabel shown next to an account name in every account picker — appends the account
 * number when one's set (e.g. "Asset · #123456") so two similarly-named bank accounts (a
 * business and personal chequing account, say) are still easy to tell apart at a glance.
 *
 * When `allAccounts` is passed and this account has a parent, also appends "Sub-account of X" —
 * otherwise a sub-account looks identical to any other account in a flat dropdown list, with no
 * way to tell it's nested under something. */
export function accountSublabel(account: Account, allAccounts?: Account[]): string {
  const base = account.accountNumber ? `${account.accountType} · #${account.accountNumber}` : account.accountType;
  const isMaster = Boolean(account.isMaster || allAccounts?.some((candidate) => candidate.parentId === account.id));
  const masterWarning = isMaster ? ' · Master: total includes direct and sub-account activity' : '';
  if (account.parentId == null || !allAccounts) return `${base}${masterWarning}`;
  const parent = allAccounts.find((a) => a.id === account.parentId);
  return parent ? `${base} · Sub-account of ${parent.name}${masterWarning}` : `${base}${masterWarning}`;
}

export interface AccountPickerOption {
  value: string;
  label: string;
  sublabel: string;
  /** The account's type, shown as a heading in the picker. A chart of accounts is read by kind —
   * "which expense category is this" — and a flat list of ninety names answers that badly. */
  group: string;
  emphasized?: boolean;
}

/** Builds account-picker options with sub-accounts grouped directly under their parent — instead
 * of wherever the sub-account's own account code happens to sort in a flat, code-ordered list —
 * and an "↳" indent on the label itself, so the hierarchy is visible in the picker at a glance
 * rather than relying only on the small "Sub-account of X" sublabel text (easy to miss when
 * scanning a long list quickly, e.g. in Journal Entry / Quick Entry). Falls back to a flat
 * (unindented) entry for a sub-account whose parent isn't present in the passed-in list — e.g. a
 * caller that pre-filters by account type — rather than dropping it. */
export function accountPickerOptions(accounts: Account[]): AccountPickerOption[] {
  const idsInList = new Set(accounts.map((a) => a.id));
  const childrenOf = new Map<number, Account[]>();
  const roots: Account[] = [];
  for (const a of accounts) {
    if (a.parentId != null && idsInList.has(a.parentId)) {
      const siblings = childrenOf.get(a.parentId) ?? [];
      siblings.push(a);
      childrenOf.set(a.parentId, siblings);
    } else {
      roots.push(a);
    }
  }
  const ordered: Account[] = [];
  function addWithChildren(a: Account) {
    ordered.push(a);
    for (const child of childrenOf.get(a.id) ?? []) addWithChildren(child);
  }

  // Roots sorted into balance-sheet-then-P&L order, so each type's heading appears once over a
  // contiguous run. Relying on code numbering alone would break the headings apart in any file
  // where an account was given an out-of-range code by hand.
  const TYPE_ORDER = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  const sortedRoots = [...roots].sort(
    (a, b) => TYPE_ORDER.indexOf(a.accountType) - TYPE_ORDER.indexOf(b.accountType) || a.code.localeCompare(b.code),
  );
  for (const a of sortedRoots) addWithChildren(a);
  return ordered.map((a) => ({
    value: String(a.id),
    label: a.parentId != null && idsInList.has(a.parentId) ? `↳ ${a.name}` : a.name,
    sublabel: accountSublabel(a, accounts),
    // Sub-accounts inherit their parent's heading by virtue of the ordering above, so a nested
    // account never appears under a heading of its own.
    group: a.accountType,
    ...(accounts.some((candidate) => candidate.parentId === a.id) ? { emphasized: true } : {}),
  }));
}

/** Picker options for a sales-document line: every account a sale may credit (see
 * saleLineAccounts.ts), revenue first, under headings that say why the other kinds are there —
 * "Liabilities — deposits, deferred revenue" rather than a bare "Liability". */
export function saleLineAccountPickerOptions(accounts: Account[]): AccountPickerOption[] {
  const allowed = saleLineAccounts(accounts.filter((account) => account.isActive));
  const groupById = new Map(allowed.map(({ account, group }) => [account.id, group]));
  const options = accountPickerOptions(allowed.map(({ account }) => account)).map((option) => ({ ...option, group: groupById.get(Number(option.value)) ?? option.group }));
  const rank = (group: string) => SALE_LINE_GROUP_ORDER.indexOf(group as (typeof SALE_LINE_GROUP_ORDER)[number]);
  return options.sort((a, b) => rank(a.group) - rank(b.group));
}

/** Picker options for a purchase-document line (bill, purchase order, vendor credit): every
 * account a purchase may debit (see purchaseLineAccounts.ts), expenses first, then cost of sales,
 * assets and loan repayments — never the payables, bank or card accounts the bill is settled through. */
export function purchaseLineAccountPickerOptions(accounts: Account[]): AccountPickerOption[] {
  const allowed = purchaseLineAccounts(accounts.filter((account) => account.isActive));
  const groupById = new Map(allowed.map(({ account, group }) => [account.id, group]));
  const options = accountPickerOptions(allowed.map(({ account }) => account)).map((option) => ({ ...option, group: groupById.get(Number(option.value)) ?? option.group }));
  const rank = (group: string) => PURCHASE_LINE_GROUP_ORDER.indexOf(group as (typeof PURCHASE_LINE_GROUP_ORDER)[number]);
  return options.sort((a, b) => rank(a.group) - rank(b.group));
}
