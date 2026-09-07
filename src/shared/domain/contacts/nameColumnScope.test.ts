import { describe, expect, it } from 'vitest';
import { nameScopeForAccount, nameScopeHint, nameStillValid } from './nameColumnScope';
import type { Account } from '../types';

function account(overrides: Partial<Account>): Account {
  return {
    id: 1,
    code: '2100',
    name: 'Accounts Payable',
    accountType: 'Liability',
    accountSubtype: 'Current Liability',
    normalBalance: 'Credit',
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

describe('the two control accounts', () => {
  it('offers only suppliers against Accounts Payable', () => {
    expect(nameScopeForAccount(account({}))).toBe('vendor');
  });

  it('offers only customers against Accounts Receivable', () => {
    expect(
      nameScopeForAccount(account({ name: 'Accounts Receivable', accountType: 'Asset', normalBalance: 'Debit' })),
    ).toBe('customer');
  });

  it('matches the singular spelling too', () => {
    expect(nameScopeForAccount(account({ name: 'Account Payable' }))).toBe('vendor');
  });

  it('is not confused by case or extra words', () => {
    expect(nameScopeForAccount(account({ name: 'Trade Accounts Payable — CAD' }))).toBe('vendor');
  });
});

describe('every other account', () => {
  it('still takes either kind of name', () => {
    // A bank line, an expense line or a revenue line can carry a supplier or a customer. Guessing
    // beyond the control accounts would start refusing entries that are perfectly correct.
    expect(nameScopeForAccount(account({ name: 'Chequing Account', accountType: 'Asset', normalBalance: 'Debit' }))).toBe('both');
    expect(nameScopeForAccount(account({ name: 'Rent', accountType: 'Expense', normalBalance: 'Debit' }))).toBe('both');
    expect(nameScopeForAccount(account({ name: 'Sales', accountType: 'Revenue' }))).toBe('both');
  });

  it('does not restrict a payable-sounding account of the wrong type', () => {
    // "Accounts Payable Clearing" booked as an asset is somebody's own arrangement, not the control
    // account, and refusing customers on it would be guessing.
    expect(nameScopeForAccount(account({ name: 'Accounts Payable Clearing', accountType: 'Asset', normalBalance: 'Debit' }))).toBe(
      'both',
    );
  });

  it('takes either when no account has been chosen yet', () => {
    expect(nameScopeForAccount(null)).toBe('both');
  });
});

describe('a name already on the line', () => {
  it('drops a customer once the line becomes Accounts Payable', () => {
    expect(nameStillValid('vendor', null, 7)).toBe(false);
  });

  it('keeps a supplier on an Accounts Payable line', () => {
    expect(nameStillValid('vendor', 7, null)).toBe(true);
  });

  it('keeps either on an ordinary account', () => {
    expect(nameStillValid('both', 7, null)).toBe(true);
    expect(nameStillValid('both', null, 7)).toBe(true);
  });

  it('treats an empty name as fine anywhere', () => {
    expect(nameStillValid('vendor', null, null)).toBe(true);
  });
});

describe('the explanation', () => {
  it('says why the list is short', () => {
    expect(nameScopeHint('vendor')).toMatch(/owe vendors/i);
    expect(nameScopeHint('customer')).toMatch(/customers owe you/i);
  });

  it('says nothing when nothing is restricted', () => {
    expect(nameScopeHint('both')).toBeNull();
  });
});
