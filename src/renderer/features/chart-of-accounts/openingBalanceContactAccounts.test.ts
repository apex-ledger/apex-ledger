import { describe, expect, it } from 'vitest';
import type { Account } from '@shared/domain/types';
import {
  accountFamilyIds,
  contactOpeningSubaccountName,
  nextContactSubaccountCode,
} from './openingBalanceContactAccounts';

function account(id: number, code: string, name: string, parentId: number | null): Account {
  return {
    id,
    code,
    name,
    accountType: 'Asset',
    accountSubtype: 'Current Asset',
    normalBalance: 'Debit',
    parentId,
    gifiCode: '1060',
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
    isMaster: parentId === null,
  };
}

describe('opening-balance A/R and A/P account helpers', () => {
  it('removes the entire control-account family from the generic opening-balance grid', () => {
    const accounts = [
      account(1, '1200', 'Accounts Receivable', null),
      account(2, '1201', 'Miscellaneous Accounts Receivable', 1),
      account(3, '1202', 'Acme — Accounts Receivable', 1),
      account(4, '1203', 'Acme division', 3),
      account(5, '1000', 'Chequing', null),
    ];
    expect([...accountFamilyIds(accounts, 1)]).toEqual([1, 2, 3, 4]);
  });

  it('chooses the next unused code in the appropriate control-account range', () => {
    const accounts = [
      account(1, '1202', 'First customer', null),
      account(2, '1203', 'Second customer', null),
      account(3, '2102', 'First vendor', null),
    ];
    expect(nextContactSubaccountCode(accounts, 'receivable')).toBe('1204');
    expect(nextContactSubaccountCode(accounts, 'payable')).toBe('2103');
  });

  it('uses explicit receivable/payable wording so contact reports recognize the sub-account', () => {
    expect(contactOpeningSubaccountName('Acme Ltd.', 'receivable')).toBe('Acme Ltd. — Accounts Receivable');
    expect(contactOpeningSubaccountName('Staples', 'payable')).toBe('Staples — Accounts Payable');
  });
});
