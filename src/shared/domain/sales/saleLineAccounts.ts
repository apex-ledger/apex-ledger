import type { Account } from '../types';
import { isGstHstControlAccount } from '../ledger/gstHstAccounts';

/**
 * Which accounts a sales document line (invoice, sales receipt, estimate, customer credit) may
 * post to. The line is credited, so the question is "what can a sale legitimately credit?":
 *
 *   Revenue      the ordinary case — sales, fees, interest, other income
 *   Liability    customer deposits and retainers, deferred revenue, gift cards
 *   Expense      a cost rebilled to the customer (a recovery credits the expense it recovers)
 *   Asset        selling an asset the company owns (equipment, a vehicle)
 *
 * and what it never should: the control accounts the document itself posts to (Accounts
 * Receivable, GST/HST), Accounts Payable, bank and cash accounts (a sale does not credit a bank
 * account — receiving the payment does), Undeposited Funds, stock (the product's cost of sale
 * handles stock), and equity.
 *
 * Offering only Revenue, as the pickers once did, left no way to invoice a deposit or a rebilled
 * cost without a journal entry afterwards — that is where "the dropdown only has a few items"
 * comes from.
 */
export type SaleLineAccountGroup = 'Revenue' | 'Liabilities — deposits, deferred revenue' | 'Expenses — costs rebilled to the customer' | 'Assets — sale of an asset';

const GROUP_ORDER: SaleLineAccountGroup[] = ['Revenue', 'Liabilities — deposits, deferred revenue', 'Expenses — costs rebilled to the customer', 'Assets — sale of an asset'];

const CONTROL_ACCOUNT_NAMES = ['accounts receivable', 'accounts payable', 'undeposited funds'];

type AccountFacts = Pick<Account, 'name' | 'accountType' | 'accountSubtype' | 'isActive'>;

/** Why this account cannot sit on a sales line, or null when it can. */
export function saleLineAccountRefusalReason(account: AccountFacts): string | null {
  if (!account.isActive) return `"${account.name}" is inactive.`;
  const name = account.name.trim().toLowerCase();
  const subtype = (account.accountSubtype ?? '').toLowerCase();
  if (CONTROL_ACCOUNT_NAMES.some((control) => name === control || name.startsWith(`${control} `) || name.startsWith(`${control}-`)) || isGstHstControlAccount(account)) {
    return `"${account.name}" is a control account the document itself posts to — it cannot also be a line item.`;
  }
  if (subtype.includes('cash') || subtype.includes('bank') || subtype.includes('credit card')) {
    return `"${account.name}" is a bank or card account. A sale is credited to revenue; the money arrives when the payment is received.`;
  }
  if (subtype.includes('inventory')) return `"${account.name}" is stock. Sell stock through an inventory item, which records the cost of sale.`;
  if (account.accountType === 'Equity') return `"${account.name}" is an equity account; a sale is not an owner transaction.`;
  return null;
}

/** The heading an allowed account appears under in a sales-line picker. */
export function saleLineAccountGroup(account: AccountFacts): SaleLineAccountGroup | null {
  if (saleLineAccountRefusalReason(account)) return null;
  switch (account.accountType) {
    case 'Revenue':
      return 'Revenue';
    case 'Liability':
      return 'Liabilities — deposits, deferred revenue';
    case 'Expense':
      return 'Expenses — costs rebilled to the customer';
    case 'Asset':
      return 'Assets — sale of an asset';
    default:
      return null;
  }
}

/** The accounts a sales-line picker offers, revenue first, each with its heading. */
export function saleLineAccounts<T extends AccountFacts>(accounts: T[]): { account: T; group: SaleLineAccountGroup }[] {
  const allowed: { account: T; group: SaleLineAccountGroup }[] = [];
  for (const account of accounts) {
    const group = saleLineAccountGroup(account);
    if (group) allowed.push({ account, group });
  }
  return allowed.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
}

export const SALE_LINE_GROUP_ORDER = GROUP_ORDER;
