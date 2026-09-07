import { describe, expect, it } from 'vitest';
import { OPENING_BALANCE_ACCOUNTS_SEED, nextAvailableNumericCode } from './openingBalanceAccounts.seed';

describe('opening-balance contact-account seed', () => {
  it('defines Miscellaneous A/R and A/P as children of their control accounts', () => {
    expect(OPENING_BALANCE_ACCOUNTS_SEED.find((account) => account.name === 'Accounts Receivable')).toMatchObject({
      isMaster: true,
      findAlternateCode: true,
    });
    expect(OPENING_BALANCE_ACCOUNTS_SEED.find((account) => account.name === 'Accounts Payable')).toMatchObject({
      isMaster: true,
      findAlternateCode: true,
    });
    expect(OPENING_BALANCE_ACCOUNTS_SEED.find((account) => account.name === 'Miscellaneous Accounts Receivable')).toMatchObject({
      code: '1201',
      parentName: 'Accounts Receivable',
      accountType: 'Asset',
      gifiCode: '1060',
      findAlternateCode: true,
    });
    expect(OPENING_BALANCE_ACCOUNTS_SEED.find((account) => account.name === 'Miscellaneous Accounts Payable')).toMatchObject({
      code: '2101',
      parentName: 'Accounts Payable',
      accountType: 'Liability',
      gifiCode: '2621',
      findAlternateCode: true,
    });
  });

  it('moves to the next free code when an imported chart already uses the preferred number', () => {
    expect(nextAvailableNumericCode('1201', new Set(['1201', '1202', '1203']))).toBe('1204');
    expect(nextAvailableNumericCode('2101', new Set(['2101']))).toBe('2102');
  });
});
