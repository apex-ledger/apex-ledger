import type { Account } from '../types';
import { isGstHstControlAccount } from '../ledger/gstHstAccounts';

/**
 * Which accounts a purchase document line (bill, purchase order, vendor credit) may post to.
 * The line is debited, so the question is "what can buying something legitimately debit?":
 *
 *   Expense      the ordinary case — operating costs, and cost of sales
 *   Asset        something the company keeps: prepaid expenses, equipment, a vehicle, stock
 *                (stock through an inventory item, so quantities move too)
 *   Liability    paying down what is owed through a bill from the lender — a loan instalment,
 *                a lease principal
 *
 * and what it never should: the control accounts the document itself posts to (Accounts
 * Payable, GST/HST), Accounts Receivable, bank and cash accounts (a bill does not debit a bank
 * account — paying it does), Undeposited Funds, credit cards (a card statement is paid by
 * transfer, not entered as a bill to itself), revenue, and equity.
 */
export type PurchaseLineAccountGroup = 'Expenses' | 'Cost of sales' | 'Assets — prepaids, equipment, stock' | 'Liabilities — loan and lease repayments';

const GROUP_ORDER: PurchaseLineAccountGroup[] = ['Expenses', 'Cost of sales', 'Assets — prepaids, equipment, stock', 'Liabilities — loan and lease repayments'];

const CONTROL_ACCOUNT_NAMES = ['accounts payable', 'accounts receivable', 'undeposited funds'];

type AccountFacts = Pick<Account, 'name' | 'accountType' | 'accountSubtype' | 'isActive'>;

/** Why this account cannot sit on a purchase line, or null when it can. */
export function purchaseLineAccountRefusalReason(account: AccountFacts): string | null {
  if (!account.isActive) return `"${account.name}" is inactive.`;
  const name = account.name.trim().toLowerCase();
  const subtype = (account.accountSubtype ?? '').toLowerCase();
  if (CONTROL_ACCOUNT_NAMES.some((control) => name === control || name.startsWith(`${control} `) || name.startsWith(`${control}-`)) || isGstHstControlAccount(account)) {
    return `"${account.name}" is a control account the document itself posts to — it cannot also be a line item.`;
  }
  if (subtype.includes('cash') || subtype.includes('bank')) {
    return `"${account.name}" is a bank account. A bill is charged to an expense or asset; the money leaves when the bill is paid.`;
  }
  if (subtype.includes('credit card')) return `"${account.name}" is a credit card. Pay a card statement with a transfer, not a bill to the card.`;
  if (account.accountType === 'Revenue') return `"${account.name}" is a revenue account; a purchase is not income.`;
  if (account.accountType === 'Equity') return `"${account.name}" is an equity account; a purchase is not an owner transaction.`;
  return null;
}

/** The heading an allowed account appears under in a purchase-line picker. */
export function purchaseLineAccountGroup(account: AccountFacts): PurchaseLineAccountGroup | null {
  if (purchaseLineAccountRefusalReason(account)) return null;
  const subtype = (account.accountSubtype ?? '').toLowerCase();
  switch (account.accountType) {
    case 'Expense':
      return subtype.includes('cost of sales') || subtype.includes('cost of goods') ? 'Cost of sales' : 'Expenses';
    case 'Asset':
      return 'Assets — prepaids, equipment, stock';
    case 'Liability':
      return 'Liabilities — loan and lease repayments';
    default:
      return null;
  }
}

/** The accounts a purchase-line picker offers, expenses first, each with its heading. */
export function purchaseLineAccounts<T extends AccountFacts>(accounts: T[]): { account: T; group: PurchaseLineAccountGroup }[] {
  const allowed: { account: T; group: PurchaseLineAccountGroup }[] = [];
  for (const account of accounts) {
    const group = purchaseLineAccountGroup(account);
    if (group) allowed.push({ account, group });
  }
  return allowed.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
}

export const PURCHASE_LINE_GROUP_ORDER = GROUP_ORDER;
