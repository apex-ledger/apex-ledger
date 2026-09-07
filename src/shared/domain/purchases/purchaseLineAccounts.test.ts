import { describe, expect, it } from 'vitest';
import { purchaseLineAccountRefusalReason, purchaseLineAccounts } from './purchaseLineAccounts';

const account = (name: string, accountType: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense', accountSubtype: string | null = null, isActive = true) => ({ name, accountType, accountSubtype, isActive });

describe('purchaseLineAccountRefusalReason', () => {
  it('allows expenses, cost of sales, ordinary assets and loans', () => {
    expect(purchaseLineAccountRefusalReason(account('Office Supplies', 'Expense', 'Operating Expense'))).toBeNull();
    expect(purchaseLineAccountRefusalReason(account('Cost of Goods Sold', 'Expense', 'Cost of Sales'))).toBeNull();
    expect(purchaseLineAccountRefusalReason(account('Prepaid Insurance', 'Asset', 'Current Asset'))).toBeNull();
    expect(purchaseLineAccountRefusalReason(account('Inventory', 'Asset', 'Inventory'))).toBeNull();
    expect(purchaseLineAccountRefusalReason(account('Bank Loan', 'Liability', 'Long-Term Liability'))).toBeNull();
  });

  it('refuses control, bank, card, revenue, equity and inactive accounts', () => {
    expect(purchaseLineAccountRefusalReason(account('Accounts Payable', 'Liability', 'Current Liability'))).toMatch(/control account/);
    expect(purchaseLineAccountRefusalReason(account('Accounts Receivable', 'Asset', 'Current Asset'))).toMatch(/control account/);
    expect(purchaseLineAccountRefusalReason(account('GST/HST Recoverable', 'Asset', 'Current Asset'))).toMatch(/control account/);
    expect(purchaseLineAccountRefusalReason(account('Undeposited Funds', 'Asset', 'Current Asset'))).toMatch(/control account/);
    expect(purchaseLineAccountRefusalReason(account('Chequing Account', 'Asset', 'Cash and Bank'))).toMatch(/bank account/);
    expect(purchaseLineAccountRefusalReason(account('Visa', 'Liability', 'Credit Card'))).toMatch(/credit card/);
    expect(purchaseLineAccountRefusalReason(account('Sales Revenue', 'Revenue', 'Revenue'))).toMatch(/revenue/);
    expect(purchaseLineAccountRefusalReason(account("Owner's Equity", 'Equity', 'Equity'))).toMatch(/equity/);
    expect(purchaseLineAccountRefusalReason(account('Old Rent', 'Expense', 'Operating Expense', false))).toMatch(/inactive/);
  });
});

describe('purchaseLineAccounts', () => {
  it('offers expenses first, then cost of sales, assets and loans, and nothing else', () => {
    const offered = purchaseLineAccounts([
      account('Chequing Account', 'Asset', 'Cash and Bank'),
      account('Bank Loan', 'Liability', 'Long-Term Liability'),
      account('Prepaid Insurance', 'Asset', 'Current Asset'),
      account('Cost of Goods Sold', 'Expense', 'Cost of Sales'),
      account('Accounts Payable', 'Liability', 'Current Liability'),
      account('Rent', 'Expense', 'Operating Expense'),
      account('Sales Revenue', 'Revenue', 'Revenue'),
    ]);
    expect(offered.map((entry) => [entry.account.name, entry.group])).toEqual([
      ['Rent', 'Expenses'],
      ['Cost of Goods Sold', 'Cost of sales'],
      ['Prepaid Insurance', 'Assets — prepaids, equipment, stock'],
      ['Bank Loan', 'Liabilities — loan and lease repayments'],
    ]);
  });
});
