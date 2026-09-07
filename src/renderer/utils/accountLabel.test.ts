import { describe, expect, it } from 'vitest';
import type { Account } from '@shared/domain/types';
import { accountPickerOptions, accountSublabel } from './accountLabel';

function account(overrides: Partial<Account> & { id: number; name: string }): Account {
  return {
    code: String(overrides.id),
    accountType: 'Asset',
    accountSubtype: null,
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

describe('accountSublabel', () => {
  it('shows the account number when set', () => {
    expect(accountSublabel(account({ id: 1, name: 'Chequing', accountNumber: '1060' }))).toBe('Asset · #1060');
  });

  it('appends "Sub-account of X" when a parent is found in allAccounts', () => {
    const parent = account({ id: 1, name: 'Chequing' });
    const child = account({ id: 2, name: 'Chequing - USD', parentId: 1 });
    expect(accountSublabel(child, [parent, child])).toBe('Asset · Sub-account of Chequing');
  });

  it('warns that a master picker option includes direct and sub-account activity', () => {
    const master = account({ id: 1, name: 'Master Chequing', isMaster: true });
    const child = account({ id: 2, name: 'Operating', parentId: master.id });
    expect(accountSublabel(master, [master, child])).toBe(
      'Asset · Master: total includes direct and sub-account activity',
    );
  });

  it('marks a master account for bold emphasis once it has a sub-account', () => {
    const master = account({ id: 1, name: 'Master Chequing', isMaster: true });
    const child = account({ id: 2, name: 'Operating Chequing', parentId: master.id });
    const regular = account({ id: 3, name: 'Regular Chequing' });
    const options = accountPickerOptions([master, child, regular]);
    expect(options.find((option) => option.value === '1')?.emphasized).toBe(true);
    expect(options.find((option) => option.value === '3')?.emphasized).toBeUndefined();
  });

  it('does not bold a flagged master before its first sub-account is created', () => {
    const unusedMaster = account({ id: 1, name: 'Future Master', isMaster: true });
    expect(accountPickerOptions([unusedMaster])[0]?.emphasized).toBeUndefined();
  });
});

describe('accountPickerOptions', () => {
  it('places a sub-account immediately after its parent, ahead of an unrelated account that would otherwise sort between them', () => {
    const parent = account({ id: 1, name: 'Chequing' });
    const unrelated = account({ id: 2, name: 'Credit Card' }); // sorts between "Chequing" and "Chequing - USD" alphabetically
    const child = account({ id: 3, name: 'Chequing - USD', parentId: 1 });
    const options = accountPickerOptions([parent, unrelated, child]);
    expect(options.map((o) => o.value)).toEqual(['1', '3', '2']);
  });

  it('indents a sub-account label with an arrow marker', () => {
    const parent = account({ id: 1, name: 'Chequing' });
    const child = account({ id: 2, name: 'Chequing - USD', parentId: 1 });
    const options = accountPickerOptions([parent, child]);
    expect(options.find((o) => o.value === '1')?.label).toBe('Chequing');
    expect(options.find((o) => o.value === '2')?.label).toBe('↳ Chequing - USD');
  });

  it('falls back to a flat (unindented) entry when the parent is not in the passed-in list', () => {
    // e.g. a caller pre-filters by account type and the parent didn't make the cut.
    const orphan = account({ id: 2, name: 'Chequing - USD', parentId: 1 });
    const options = accountPickerOptions([orphan]);
    expect(options).toEqual([{ value: '2', label: 'Chequing - USD', sublabel: 'Asset', group: 'Asset' }]);
  });

  it('supports multiple children under one parent, each nested directly after it', () => {
    const parent = account({ id: 1, name: 'Chequing' });
    const childA = account({ id: 2, name: 'Chequing - USD', parentId: 1 });
    const childB = account({ id: 3, name: 'Chequing - Savings', parentId: 1 });
    const options = accountPickerOptions([parent, childA, childB]);
    expect(options.map((o) => o.value)).toEqual(['1', '2', '3']);
  });
});

describe('grouping the picker by account type', () => {
  it('gives every option its type as a heading', () => {
    const options = accountPickerOptions([
      account({ id: 1, name: 'Chequing' }),
      account({ id: 2, code: '5000', name: 'Advertising', accountType: 'Expense', normalBalance: 'Debit' }),
    ]);
    expect(options.map((o) => o.group)).toEqual(['Asset', 'Expense']);
  });

  it('keeps each type in one contiguous run, so a heading never repeats', () => {
    // Headings are drawn whenever the group changes from the previous row. Interleaved types would
    // print "Expense" three times down one list.
    const options = accountPickerOptions([
      account({ id: 1, code: '5000', name: 'Advertising', accountType: 'Expense', normalBalance: 'Debit' }),
      account({ id: 2, code: '1000', name: 'Chequing' }),
      account({ id: 3, code: '5010', name: 'Bank Charges', accountType: 'Expense', normalBalance: 'Debit' }),
      account({ id: 4, code: '2100', name: 'Payables', accountType: 'Liability', normalBalance: 'Credit' }),
    ]);

    const groups = options.map((o) => o.group);
    const runs = groups.filter((g, i) => g !== groups[i - 1]);
    expect(runs).toEqual([...new Set(runs)]);
  });

  it('orders the balance sheet before the profit and loss', () => {
    const options = accountPickerOptions([
      account({ id: 1, code: '5000', name: 'Advertising', accountType: 'Expense', normalBalance: 'Debit' }),
      account({ id: 2, code: '4000', name: 'Sales', accountType: 'Revenue', normalBalance: 'Credit' }),
      account({ id: 3, code: '1000', name: 'Chequing' }),
    ]);
    expect(options.map((o) => o.group)).toEqual(['Asset', 'Revenue', 'Expense']);
  });

  it('leaves a sub-account under its parent rather than starting a heading of its own', () => {
    const parent = account({ id: 1, code: '1000', name: 'Chequing' });
    const child = account({ id: 2, code: '1001', name: 'Operating', parentId: 1 });
    const options = accountPickerOptions([parent, child]);
    expect(options.map((o) => o.group)).toEqual(['Asset', 'Asset']);
  });
});
