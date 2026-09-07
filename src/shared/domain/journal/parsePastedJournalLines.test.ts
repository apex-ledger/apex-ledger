import { describe, expect, it } from 'vitest';
import { normalBalanceForType, type Account } from '../types';
import { parsePastedJournalLines } from './parsePastedJournalLines';

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

const ACCOUNTS: Account[] = [account(1, '5010', 'Bank Charges'), account(2, '5040', 'Office Supplies & Expenses'), account(3, '1000', 'Cash')];

describe('parsePastedJournalLines', () => {
  it('parses tab-separated rows into lines with matched accounts', () => {
    const text = ['Office Supplies & Expenses\tStaples run\t45.00\t', 'Cash\t\t\t45.00'].join('\n');
    const result = parsePastedJournalLines(text, ACCOUNTS);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({ accountId: 2, description: 'Staples run', debitCents: 4500, creditCents: 0 });
    expect(result.lines[1]).toMatchObject({ accountId: 3, description: '', debitCents: 0, creditCents: 4500 });
    expect(result.matchedCount).toBe(2);
    expect(result.unmatchedCount).toBe(0);
  });

  it('skips a header row', () => {
    const text = ['Account\tDescription\tDebit\tCredit', 'Bank Charges\tMonthly fee\t5.00\t'].join('\n');
    const result = parsePastedJournalLines(text, ACCOUNTS);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].accountId).toBe(1);
  });

  it('leaves accountId null when nothing matches, for manual review', () => {
    const text = 'Some Unknown Vendor Fee\tmystery\t10.00\t';
    const result = parsePastedJournalLines(text, ACCOUNTS);
    expect(result.lines[0].accountId).toBeNull();
    expect(result.unmatchedCount).toBe(1);
    expect(result.matchedCount).toBe(0);
  });

  it('ignores blank lines and $/comma formatting in amounts', () => {
    const text = ['', 'Cash\t\t"1,234.56"\t', ''].join('\n');
    const result = parsePastedJournalLines(text, ACCOUNTS);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].debitCents).toBe(123456);
  });

  it('returns an empty result for blank clipboard content', () => {
    const result = parsePastedJournalLines('', ACCOUNTS);
    expect(result.lines).toHaveLength(0);
    expect(result.matchedCount).toBe(0);
    expect(result.unmatchedCount).toBe(0);
  });
});
