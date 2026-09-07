import { describe, expect, it } from 'vitest';
import { suggestGifiCode } from './suggestGifiCode';
import type { GifiCode } from '../types';

const GIFI_CODES: GifiCode[] = [
  { code: '1001', description: 'Cash (bank drafts, cheques, coins, currency)', statementType: 'BalanceSheet', category: 'Current Asset', isCustom: false },
  { code: '1060', description: 'Accounts receivable', statementType: 'BalanceSheet', category: 'Current Asset', isCustom: false },
  { code: '2621', description: 'Accounts payable', statementType: 'BalanceSheet', category: 'Current Liability', isCustom: false },
  { code: '8089', description: 'Total sales of goods and services', statementType: 'IncomeStatement', category: 'Revenue', isCustom: false },
  { code: '8811', description: 'Office supplies', statementType: 'IncomeStatement', category: 'Expense', isCustom: false },
  { code: '8910', description: 'Rental', statementType: 'IncomeStatement', category: 'Expense', isCustom: false },
  { code: '9999', description: 'Custom Rental Code', statementType: 'IncomeStatement', category: 'Expense', isCustom: true },
];

describe('suggestGifiCode', () => {
  it('finds a strong single match on shared words', () => {
    const result = suggestGifiCode('Office Supplies', 'Expense', GIFI_CODES);
    expect(result?.code).toBe('8811');
  });

  it('matches "Rent Expense" against the GIFI "Rental" line', () => {
    const result = suggestGifiCode('Rent Expense', 'Expense', GIFI_CODES);
    expect(result?.code).toBe('8910');
  });

  it('never crosses statement types — an Asset name does not match an IncomeStatement GIFI line', () => {
    const result = suggestGifiCode('Rent Expense', 'Asset', GIFI_CODES);
    expect(result).toBeNull();
  });

  it('ignores custom GIFI codes as suggestion candidates', () => {
    // "Custom Rental Code" would otherwise out-score "Rental" on raw word overlap.
    const result = suggestGifiCode('Rental', 'Expense', GIFI_CODES);
    expect(result?.code).toBe('8910');
  });

  it('returns null when nothing shares a meaningful word', () => {
    const result = suggestGifiCode('Loan to Shareholder', 'Asset', GIFI_CODES);
    expect(result).toBeNull();
  });

  it('returns null on an empty account name', () => {
    expect(suggestGifiCode('', 'Expense', GIFI_CODES)).toBeNull();
  });

  it('matches Accounts Receivable/Payable to their respective GIFI lines without crossing them', () => {
    expect(suggestGifiCode('Accounts Receivable', 'Asset', GIFI_CODES)?.code).toBe('1060');
    expect(suggestGifiCode('Accounts Payable', 'Liability', GIFI_CODES)?.code).toBe('2621');
  });
});

describe('credit cards', () => {
  const codes = [
    { code: '2620', description: 'Amounts payable and accrued liabilities', statementType: 'BalanceSheet', category: 'Current Liability', isCustom: false },
    { code: '2707', description: 'Credit card loans', statementType: 'BalanceSheet', category: 'Current Liability', isCustom: false },
  ] as unknown as Parameters<typeof suggestGifiCode>[2];
  it('files a brand-named card under credit card loans, never under payables', () => {
    expect(suggestGifiCode('RBC Visa', 'Liability', codes)?.code).toBe('2707');
    expect(suggestGifiCode('BMO Mastercard', 'Liability', codes)?.code).toBe('2707');
  });
});

describe('bank and cash accounts', () => {
  const codes = [
    { code: '1001', description: 'Cash (bank drafts, cheques, coins, currency)', statementType: 'BalanceSheet', category: 'Current Asset', isCustom: false },
    { code: '1002', description: 'Deposits in Canadian banks — Canadian currency', statementType: 'BalanceSheet', category: 'Current Asset', isCustom: false },
    { code: '1003', description: 'Deposits in Canadian banks and institutions — Foreign currency', statementType: 'BalanceSheet', category: 'Current Asset', isCustom: false },
  ] as unknown as Parameters<typeof suggestGifiCode>[2];
  it('files bank accounts under deposits and cash boxes under cash', () => {
    expect(suggestGifiCode('TD Chequing', 'Asset', codes)?.code).toBe('1002');
    expect(suggestGifiCode('Scotiabank Savings', 'Asset', codes)?.code).toBe('1002');
    expect(suggestGifiCode('USD Chequing', 'Asset', codes)?.code).toBe('1003');
    expect(suggestGifiCode('Petty Cash — Office', 'Asset', codes)?.code).toBe('1001');
    expect(suggestGifiCode('Cash Register Float', 'Asset', codes)?.code).toBe('1001');
  });
});
