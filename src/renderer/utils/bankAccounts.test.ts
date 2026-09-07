import { describe, expect, it } from 'vitest';
import { allDepositTargets, depositableAccounts, isUndepositedFundsAccount, paymentSourceAccounts } from './bankAccounts';
import type { Account } from '@shared/domain/types';

function account(overrides: Partial<Account>): Account {
  return {
    id: 1,
    code: '1000',
    name: 'Chequing Account',
    accountType: 'Asset',
    accountSubtype: 'Cash and Bank',
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

const CHEQUING = account({ id: 1, name: 'Chequing Account' });
const CASH = account({ id: 2, code: '1010', name: 'Cash Account' });
const UNDEPOSITED = account({ id: 3, code: '1001', name: 'Undeposited Funds', accountSubtype: 'Current Asset' });
const RECEIVABLE = account({ id: 4, code: '1200', name: 'Accounts Receivable', accountSubtype: 'Current Asset' });

describe('paying money out', () => {
  it('never offers Undeposited Funds as a source', () => {
    // It holds customer money taken but not yet banked. Paying a supplier from it credits an
    // account that only ever legitimately holds incoming money, driving it negative and breaking
    // the deposit workflow, whose balance is supposed to be exactly what is waiting to be banked.
    const sources = paymentSourceAccounts([CHEQUING, CASH, UNDEPOSITED]);
    expect(sources.map((a) => a.name)).not.toContain('Undeposited Funds');
  });

  it('still offers the real bank and cash accounts', () => {
    const sources = paymentSourceAccounts([CHEQUING, CASH, UNDEPOSITED]);
    expect(sources.map((a) => a.name)).toEqual(['Chequing Account', 'Cash Account']);
  });

  it('is not left empty by a file whose only money account is Undeposited Funds', () => {
    // Degenerate, but returning nothing would leave a picker with no options and no explanation.
    // The fallback in depositableAccounts widens to every asset, so something remains.
    const sources = paymentSourceAccounts([UNDEPOSITED, RECEIVABLE]);
    expect(sources.map((a) => a.name)).toContain('Accounts Receivable');
    expect(sources.map((a) => a.name)).not.toContain('Undeposited Funds');
  });
});

describe('taking money in', () => {
  it('does offer Undeposited Funds, which is where a deposit comes FROM', () => {
    // The asymmetry is the point: it is a valid place for money to sit on the way in, and never a
    // place to pay out of.
    expect(depositableAccounts([CHEQUING, UNDEPOSITED]).map((a) => a.name)).toContain('Undeposited Funds');
  });

  it('offers every asset account as somewhere a deposit can land', () => {
    // Takings go to a card processor's holding account or a cash float, not only to a chequing
    // account, and a picker listing only banks forces the entry somewhere it does not belong.
    const targets = allDepositTargets([CHEQUING, RECEIVABLE]);
    expect(targets.map((a) => a.name)).toContain('Accounts Receivable');
  });

  it('puts the bank-like accounts first, since those are the common case', () => {
    const targets = allDepositTargets([RECEIVABLE, CHEQUING]);
    expect(targets[0].name).toBe('Chequing Account');
  });
});

describe('recognising the holding account', () => {
  it('matches it by name, since it is created on demand with no marker of its own', () => {
    expect(isUndepositedFundsAccount(UNDEPOSITED)).toBe(true);
    expect(isUndepositedFundsAccount(CHEQUING)).toBe(false);
  });

  it('is not fooled by a liability that happens to mention it', () => {
    expect(
      isUndepositedFundsAccount(account({ name: 'Undeposited Funds Clearing', accountType: 'Liability', normalBalance: 'Credit' })),
    ).toBe(false);
  });
});
