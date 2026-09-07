import { describe, expect, it } from 'vitest';
import { saleLineAccountGroup, saleLineAccountRefusalReason, saleLineAccounts } from './saleLineAccounts';

const account = (name: string, accountType: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense', accountSubtype: string | null = null, isActive = true) => ({ name, accountType, accountSubtype, isActive });

describe('saleLineAccountRefusalReason', () => {
  it('allows revenue, liabilities, expenses and ordinary assets', () => {
    expect(saleLineAccountRefusalReason(account('Sales Revenue', 'Revenue', 'Revenue'))).toBeNull();
    expect(saleLineAccountRefusalReason(account('Customer Deposits', 'Liability', 'Current Liability'))).toBeNull();
    expect(saleLineAccountRefusalReason(account('Travel', 'Expense', 'Operating Expense'))).toBeNull();
    expect(saleLineAccountRefusalReason(account('Vehicles', 'Asset', 'Capital Asset'))).toBeNull();
  });

  it('refuses the control accounts the document itself posts to', () => {
    expect(saleLineAccountRefusalReason(account('Accounts Receivable', 'Asset', 'Current Asset'))).toMatch(/control account/);
    expect(saleLineAccountRefusalReason(account('GST/HST Payable', 'Liability', 'Current Liability'))).toMatch(/control account/);
    expect(saleLineAccountRefusalReason(account('Accounts Payable', 'Liability', 'Current Liability'))).toMatch(/control account/);
    expect(saleLineAccountRefusalReason(account('Undeposited Funds', 'Asset', 'Current Asset'))).toMatch(/control account/);
  });

  it('refuses bank, card, stock, equity and inactive accounts', () => {
    expect(saleLineAccountRefusalReason(account('Chequing Account', 'Asset', 'Cash and Bank'))).toMatch(/bank or card/);
    expect(saleLineAccountRefusalReason(account('Visa', 'Liability', 'Credit Card'))).toMatch(/bank or card/);
    expect(saleLineAccountRefusalReason(account('Inventory', 'Asset', 'Inventory'))).toMatch(/stock/);
    expect(saleLineAccountRefusalReason(account("Owner's Equity", 'Equity', 'Equity'))).toMatch(/equity/);
    expect(saleLineAccountRefusalReason(account('Old Sales', 'Revenue', 'Revenue', false))).toMatch(/inactive/);
  });
});

describe('saleLineAccounts', () => {
  it('offers revenue first, then deposits, rebilled costs and asset sales, and nothing else', () => {
    const offered = saleLineAccounts([
      account('Chequing Account', 'Asset', 'Cash and Bank'),
      account('Vehicles', 'Asset', 'Capital Asset'),
      account('Travel', 'Expense', 'Operating Expense'),
      account('Customer Deposits', 'Liability', 'Current Liability'),
      account('Accounts Receivable', 'Asset', 'Current Asset'),
      account('Consulting Fees', 'Revenue', 'Revenue'),
      account("Owner's Equity", 'Equity', 'Equity'),
    ]);
    expect(offered.map((entry) => [entry.account.name, entry.group])).toEqual([
      ['Consulting Fees', 'Revenue'],
      ['Customer Deposits', 'Liabilities — deposits, deferred revenue'],
      ['Travel', 'Expenses — costs rebilled to the customer'],
      ['Vehicles', 'Assets — sale of an asset'],
    ]);
  });

  it('keeps the order of accounts within a group', () => {
    const offered = saleLineAccounts([account('Sales', 'Revenue'), account('Interest Income', 'Revenue')]);
    expect(offered.map((entry) => entry.account.name)).toEqual(['Sales', 'Interest Income']);
    expect(saleLineAccountGroup(account('Sales', 'Revenue'))).toBe('Revenue');
  });
});
