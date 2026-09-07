import { describe, expect, it } from 'vitest';
import { grossMarginPercent, isCostOfSalesAccount, splitExpenseAccounts } from './costOfSales';
import type { Account } from '../types';

function account(overrides: Partial<Account>): Account {
  return {
    id: 1,
    code: '5000',
    name: 'Advertising',
    accountType: 'Expense',
    accountSubtype: 'Operating Expense',
    normalBalance: 'Debit',
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
    ...overrides,
  };
}

describe('what counts as cost of sales', () => {
  it('takes the sub-type when the chart sets one', () => {
    // 5035 in the shipped template carries this sub-type, which is the reliable signal.
    expect(isCostOfSalesAccount(account({ name: 'Cost of Goods Sold', accountSubtype: 'Cost of Sales' }))).toBe(true);
  });

  it('falls back to the name for a hand-made account', () => {
    expect(isCostOfSalesAccount(account({ name: 'Direct Costs', accountSubtype: null }))).toBe(true);
    expect(isCostOfSalesAccount(account({ name: 'Materials', accountSubtype: '' }))).toBe(true);
  });

  it('leaves ordinary running costs as operating', () => {
    for (const name of ['Rent', 'Advertising', 'Insurance', 'Telephone', 'Office Supplies']) {
      expect(isCostOfSalesAccount(account({ name })), name).toBe(false);
    }
  });

  it('does not guess at costs merely related to what is sold', () => {
    // Delivery, packaging and commissions sit either side of the line depending on the business.
    // Guessing moves money across gross profit and silently changes the margin.
    for (const name of ['Delivery & Freight', 'Packaging', 'Sales Commissions']) {
      expect(isCostOfSalesAccount(account({ name })), name).toBe(false);
    }
  });

  it('never treats revenue or an asset as a cost of sale', () => {
    expect(isCostOfSalesAccount(account({ name: 'Sales', accountType: 'Revenue', normalBalance: 'Credit' }))).toBe(false);
    expect(isCostOfSalesAccount(account({ name: 'Inventory', accountType: 'Asset' }))).toBe(false);
  });
});

describe('splitting the expenses', () => {
  it('puts each expense on exactly one side', () => {
    // The two halves have to add back up to the whole, or gross profit and net profit stop
    // agreeing with each other.
    const accounts = [
      account({ id: 1, name: 'Cost of Goods Sold', accountSubtype: 'Cost of Sales' }),
      account({ id: 2, name: 'Rent' }),
      account({ id: 3, name: 'Advertising' }),
    ];
    const split = splitExpenseAccounts(accounts);

    expect(split.costOfSales.length + split.operating.length).toBe(3);
    expect(split.costOfSales.map((a) => a.id)).toEqual([1]);
    expect(split.operating.map((a) => a.id)).toEqual([2, 3]);
  });

  it('ignores accounts that are not expenses at all', () => {
    const accounts = [
      account({ id: 1, name: 'Sales', accountType: 'Revenue', normalBalance: 'Credit' }),
      account({ id: 2, name: 'Chequing', accountType: 'Asset' }),
      account({ id: 3, name: 'Rent' }),
    ];
    const split = splitExpenseAccounts(accounts);
    expect(split.costOfSales).toEqual([]);
    expect(split.operating.map((a) => a.id)).toEqual([3]);
  });

  it('handles a business with no cost of sales at all', () => {
    // A consultancy has none, and its gross profit is simply its revenue.
    const split = splitExpenseAccounts([account({ name: 'Rent' })]);
    expect(split.costOfSales).toEqual([]);
    expect(split.operating).toHaveLength(1);
  });
});

describe('gross margin', () => {
  it('is the share of revenue left after the cost of what was sold', () => {
    expect(grossMarginPercent(100_000, 40_000)).toBe(40);
  });

  it('is null when nothing was sold, not zero', () => {
    // 0% reads as "everything sold at cost"; nothing was sold at all.
    expect(grossMarginPercent(0, 0)).toBeNull();
  });

  it('goes negative when the sale loses money', () => {
    // The number this whole split exists to make visible.
    expect(grossMarginPercent(100_000, -20_000)).toBe(-20);
  });
});
