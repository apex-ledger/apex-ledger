import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectQuickBooksReport, parseQuickBooksReport } from './parseQuickBooksReport';

const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

describe('detectQuickBooksReport', () => {
  it('recognises the General Ledger export by its Split column and title rows', () => {
    expect(detectQuickBooksReport(fixture('qbo-general-ledger.csv'))).toBe('generalLedger');
  });
  it('recognises the Journal export', () => {
    expect(detectQuickBooksReport(fixture('qbo-journal.csv'))).toBe('journal');
  });
  it('leaves other files to the column mapper', () => {
    expect(detectQuickBooksReport('TransNo,Date,Account,Debit,Credit,Memo\nJD1,2024-10-01,Telephone,57.63,,x')).toBeNull();
    expect(detectQuickBooksReport(fixture('qbo-account-list.csv'))).toBeNull();
    expect(detectQuickBooksReport('')).toBeNull();
  });
});

describe('parseQuickBooksReport — General Ledger', () => {
  const result = parseQuickBooksReport(fixture('qbo-general-ledger.csv'));

  it('reads the title rows', () => {
    expect(result.kind).toBe('generalLedger');
    expect(result.titles).toEqual(['Northwind Bookkeeping Test Co.', 'General Ledger', 'October - December, 2025']);
  });

  it('gathers each transaction back together from the account sections', () => {
    expect(result.transactions).toHaveLength(2);
    const [expense, deposit] = result.transactions;
    expect(expense.date).toBe('2025-10-03');
    expect(expense.docNumber).toBeNull();
    expect(expense.memo).toBe('Bell Canada — Phone');
    expect(expense.lines.map((line) => [line.accountName, line.debitCents, line.creditCents])).toEqual([
      ['Chequing Account', 0, 11300],
      ['Telephone', 10000, 0],
      ['GST/HST Payable', 1300, 0],
    ]);
    expect(expense.balanced).toBe(true);
    expect(deposit.docNumber).toBe('1042');
    expect(deposit.balanced).toBe(true);
    expect(deposit.lines.reduce((sum, line) => sum + line.debitCents, 0)).toBe(113000);
  });

  it('never treats Beginning Balance, Total for … or TOTAL rows as accounts or lines', () => {
    expect(result.accountNamesReferenced).toEqual(['Chequing Account', 'GST/HST Payable', 'Sales Revenue', 'Telephone']);
    expect(result.warnings).toEqual([]);
  });

  it('warns when a filtered export only shows part of a transaction', () => {
    const partial = [
      'Company,,,,,,,,,',
      'General Ledger,,,,,,,,,',
      ',,,,,,,,,',
      ',Date,Transaction Type,#,Adj,Name,Memo/Description,Split,Debit,Credit',
      'Telephone,,,,,,,,,',
      ',2025-10-03,Expense,,No,Bell Canada,Phone,Chequing Account,100.00,',
      'Total for Telephone,,,,,,,,$100.00,$0.00',
    ].join('\n');
    const single = parseQuickBooksReport(partial);
    expect(single.transactions[0].balanced).toBe(false);
    expect(single.warnings[0]).toMatch(/does not balance/);
  });
});

describe('parseQuickBooksReport — Journal', () => {
  const result = parseQuickBooksReport(fixture('qbo-journal.csv'));

  it('carries the date, number and name down the undated continuation rows', () => {
    expect(result.kind).toBe('journal');
    expect(result.transactions).toHaveLength(2);
    const [expense, deposit] = result.transactions;
    expect(expense.date).toBe('2025-10-03');
    expect(expense.lines).toHaveLength(3);
    expect(expense.balanced).toBe(true);
    expect(deposit.date).toBe('2025-10-15');
    expect(deposit.docNumber).toBe('1042');
    expect(deposit.memo).toBe('Maple Consulting Group — October retainer');
    expect(deposit.lines.map((line) => line.accountName)).toEqual(['Chequing Account', 'Sales Revenue', 'GST/HST Payable']);
  });

  it('ignores the per-transaction totals rows and the grand TOTAL', () => {
    expect(result.accountNamesReferenced).toEqual(['Chequing Account', 'GST/HST Payable', 'Sales Revenue', 'Telephone']);
    expect(result.warnings).toEqual([]);
  });

  it('reads an Amount-only export as signed debits and credits', () => {
    const csv = ['Date,Transaction Type,Num,Name,Memo/Description,Account,Amount', '10/03/2025,Expense,,Bell,Phone,Telephone,113.00', ',,,,Phone,Chequing Account,-113.00'].join('\n');
    const single = parseQuickBooksReport(csv);
    expect(single.transactions[0].lines).toEqual([
      { accountName: 'Telephone', memo: 'Phone', debitCents: 11300, creditCents: 0 },
      { accountName: 'Chequing Account', memo: 'Phone', debitCents: 0, creditCents: 11300 },
    ]);
    expect(single.transactions[0].balanced).toBe(true);
  });

  it('reads Excel serial dates and day-first dates', () => {
    const csv = [
      'Date,Transaction Type,Num,Name,Memo/Description,Account,Debit,Credit',
      '45933,Expense,,Bell,Phone,Telephone,113.00,',
      ',,,,Phone,Chequing Account,,113.00',
      '25/10/2025,Deposit,7,Maple,Fee,Chequing Account,50.00,',
      ',,,,Fee,Sales Revenue,,50.00',
    ].join('\n');
    expect(parseQuickBooksReport(csv).transactions.map((transaction) => transaction.date)).toEqual(['2025-10-03', '2025-10-25']);
  });
});
