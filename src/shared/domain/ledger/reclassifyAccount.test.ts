import { describe, expect, it } from 'vitest';
import { planReclassification } from './reclassifyAccount';
import type { Account } from '../types';

function account(overrides: Partial<Account>): Account {
  return {
    id: 1,
    code: '5218',
    name: 'Other Income',
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

describe('correcting a misfiled account', () => {
  it('moves it to the right type', () => {
    // The case this exists for: "Other Income" created as an Expense understates income and
    // overstates costs on every statement, and was previously impossible to correct.
    const plan = planReclassification([account({})], 1, 'Revenue', 0);

    expect(plan.blockedBy).toBeNull();
    expect(plan.changes).toEqual([{ accountId: 1, from: 'Expense', to: 'Revenue', normalBalance: 'Credit' }]);
  });

  it('recomputes the normal balance rather than leaving the old one', () => {
    const plan = planReclassification([account({})], 1, 'Revenue', 0);
    expect(plan.changes[0].normalBalance).toBe('Credit');
  });

  it('does nothing when the type is already right', () => {
    const plan = planReclassification([account({ accountType: 'Revenue', normalBalance: 'Credit' })], 1, 'Revenue', 0);
    expect(plan.changes).toEqual([]);
    expect(plan.blockedBy).toBeNull();
  });
});

describe('what the person is told first', () => {
  it('says how many postings will be reinterpreted', () => {
    const plan = planReclassification([account({})], 1, 'Revenue', 12);
    expect(plan.warnings.join(' ')).toMatch(/12 posted lines use this account/i);
  });

  it('says the normal balance flips', () => {
    const plan = planReclassification([account({})], 1, 'Revenue', 0);
    expect(plan.warnings.join(' ')).toMatch(/normal balance changes from Debit to Credit/i);
  });

  it('warns about nothing when an unused account moves within the same side', () => {
    // Expense → Asset are both Debit-normal, and with no postings there is nothing at stake.
    const plan = planReclassification([account({})], 1, 'Asset', 0);
    expect(plan.warnings).toEqual([]);
  });
});

describe('sub-accounts', () => {
  it('move with their parent', () => {
    // An Expense sitting beneath an Asset is a state no report can render sensibly, and leaving
    // children behind is exactly how that gets created.
    const accounts = [
      account({ id: 1, name: 'Equipment', accountType: 'Expense' }),
      account({ id: 2, name: 'Laptops', parentId: 1 }),
      account({ id: 3, name: 'Monitors', parentId: 2 }),
    ];
    const plan = planReclassification(accounts, 1, 'Asset', 0);

    expect(plan.changes.map((c) => c.accountId).sort()).toEqual([1, 2, 3]);
  });

  it('says how many are coming along', () => {
    const accounts = [account({ id: 1 }), account({ id: 2, parentId: 1 })];
    const plan = planReclassification(accounts, 1, 'Revenue', 0);
    expect(plan.warnings.join(' ')).toMatch(/1 sub-account moves with it/i);
  });

  it('refuses to strand a child under a parent of another type', () => {
    const accounts = [
      account({ id: 1, name: 'Equipment', accountType: 'Asset', normalBalance: 'Debit' }),
      account({ id: 2, name: 'Laptops', accountType: 'Asset', parentId: 1, normalBalance: 'Debit' }),
    ];
    const plan = planReclassification(accounts, 2, 'Expense', 0);

    expect(plan.blockedBy).toBe('parentMismatch');
    expect(plan.blockedMessage).toMatch(/sits under "Equipment"/);
    expect(plan.changes).toEqual([]);
  });
});

describe('built-in accounts', () => {
  it('cannot be moved', () => {
    // Accounts Payable is resolved by name and type when a bill posts. Changed to an asset, bills
    // would post into something that is no longer a liability.
    const plan = planReclassification(
      [account({ id: 1, name: 'Accounts Payable', accountType: 'Liability', normalBalance: 'Credit', isSystem: true })],
      1,
      'Asset',
      0,
    );

    expect(plan.blockedBy).toBe('system');
    expect(plan.blockedMessage).toMatch(/built-in account/i);
    expect(plan.changes).toEqual([]);
  });
});

describe('an account that is not there', () => {
  it('is refused rather than silently doing nothing', () => {
    const plan = planReclassification([], 99, 'Revenue', 0);
    expect(plan.blockedBy).toBe('system');
    expect(plan.changes).toEqual([]);
  });
});

describe('a deep tree', () => {
  it('does not loop forever on a cycle', () => {
    // Defensive: a parent pointing at its own descendant should not hang the app.
    const accounts = [account({ id: 1, parentId: 2 }), account({ id: 2, parentId: 1 })];
    const plan = planReclassification(accounts, 1, 'Revenue', 0);
    expect(plan.blockedBy).toBe('parentMismatch');
  });
});
