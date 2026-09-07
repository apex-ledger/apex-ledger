import { describe, expect, it } from 'vitest';
import { normalBalanceForType, type Account } from '../types';
import { matchAccountByName } from './matchAccountName';

function account(id: number, code: string, name: string): Account {
  return {
    id,
    code,
    name,
    accountType: 'Expense',
    accountSubtype: null,
    normalBalance: normalBalanceForType('Expense'),
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
  };
}

const ACCOUNTS: Account[] = [
  account(1, '5010', 'Bank Charges'),
  account(2, '5040', 'Office Supplies & Expenses'),
  account(3, '5070', 'Motor Vehicle Expenses'),
  account(4, '5135', 'Meals & Entertainment'),
  account(5, '5130', 'Travel'),
];

describe('matchAccountByName', () => {
  it('matches an exact name, case-insensitively', () => {
    expect(matchAccountByName('bank charges', ACCOUNTS)?.id).toBe(1);
    expect(matchAccountByName('BANK CHARGES', ACCOUNTS)?.id).toBe(1);
  });

  it('matches by account code', () => {
    expect(matchAccountByName('5135', ACCOUNTS)?.id).toBe(4);
  });

  it('matches when the pasted name is a substring of the real name', () => {
    expect(matchAccountByName('Office Supplies', ACCOUNTS)?.id).toBe(2);
  });

  it('matches when the pasted name is a superset of the real name (extra punctuation/words)', () => {
    expect(matchAccountByName('Motor Vehicle Expenses - Fuel', ACCOUNTS)?.id).toBe(3);
  });

  it('ignores punctuation differences', () => {
    expect(matchAccountByName('Meals and Entertainment', ACCOUNTS)).toBeNull(); // "and" vs "&" isn't a pure punctuation diff
    expect(matchAccountByName('Meals & Entertainment.', ACCOUNTS)?.id).toBe(4);
  });

  it('returns null for no match', () => {
    expect(matchAccountByName('Zebra Consulting Fees', ACCOUNTS)).toBeNull();
  });

  it('returns null when a pasted name could plausibly mean more than one account', () => {
    // Both "Office Supplies & Expenses" and "Motor Vehicle Expenses" contain "Expenses" — ambiguous, don't guess.
    expect(matchAccountByName('Expenses', ACCOUNTS)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(matchAccountByName('', ACCOUNTS)).toBeNull();
    expect(matchAccountByName('   ', ACCOUNTS)).toBeNull();
  });
});
