import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Account } from './api.js';
import { bankAccounts, calculateVisibleHst, categoryAccounts } from './viewModel.js';

const account = (id: string, accountType: Account['accountType'], accountKind: string, isMaster = false): Account => ({
  id, name: id, internalCode: null, accountType, accountKind, parentAccountId: null, isMaster, active: true, version: 1,
});

describe('Essentials entry view model', () => {
  const accounts = [account('bank', 'asset', 'bank'), account('card', 'liability', 'credit_card'),
    account('sales', 'revenue', 'sales'), account('expense', 'expense', 'general_expense'),
    account('master', 'expense', 'general_expense', true)];

  it('selects bank/card and correct sale or expense categories', () => {
    assert.deepEqual(bankAccounts(accounts).map((item) => item.id), ['bank', 'card']);
    assert.deepEqual(categoryAccounts(accounts, 'sale').map((item) => item.id), ['sales']);
    assert.deepEqual(categoryAccounts(accounts, 'expense').map((item) => item.id), ['expense']);
  });

  it('shows the same exact HST cents as the server contract', () => {
    assert.equal(calculateVisibleHst(22500, 'hst_13', 0), 2925);
    assert.equal(calculateVisibleHst(22500, 'hst_exempt', 0), 0);
    assert.equal(calculateVisibleHst(22500, 'manual_hst', 456), 456);
  });
});
