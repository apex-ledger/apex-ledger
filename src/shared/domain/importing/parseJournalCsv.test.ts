import { describe, expect, it } from 'vitest';
import { getCsvHeaders, parseJournalCsv } from './parseJournalCsv';

const MAPPING = {
  transactionKeyColumn: 'Trans #',
  dateColumn: 'Date',
  accountColumn: 'Account',
  debitColumn: 'Debit',
  creditColumn: 'Credit',
  descriptionColumn: 'Memo/Description',
};

const SAMPLE_CSV = [
  'Trans #,Date,Transaction Type,Account,Memo/Description,Debit,Credit',
  '1,01/15/2026,Expense,Office Supplies,Staples run,45.99,',
  '1,01/15/2026,Expense,Chequing Account,Staples run,,45.99',
  '2,01/16/2026,Deposit,Chequing Account,Client payment,1000.00,',
  '2,01/16/2026,Deposit,Sales,Client payment,,1000.00',
].join('\n');

describe('getCsvHeaders', () => {
  it('returns the header row', () => {
    expect(getCsvHeaders(SAMPLE_CSV)).toEqual(['Trans #', 'Date', 'Transaction Type', 'Account', 'Memo/Description', 'Debit', 'Credit']);
  });
});

describe('parseJournalCsv', () => {
  it('groups consecutive rows sharing a transaction key into one balanced transaction', () => {
    const result = parseJournalCsv(SAMPLE_CSV, MAPPING);
    expect(result.transactions).toHaveLength(2);

    const first = result.transactions[0];
    expect(first.date).toBe('2026-01-15');
    expect(first.docNumber).toBe('1');
    expect(first.lines).toHaveLength(2);
    expect(first.lines[0]).toEqual({ accountName: 'Office Supplies', debitCents: 4599, creditCents: 0, memo: 'Staples run' });
    expect(first.lines[1]).toEqual({ accountName: 'Chequing Account', debitCents: 0, creditCents: 4599, memo: 'Staples run' });
    expect(first.balanced).toBe(true);

    const second = result.transactions[1];
    expect(second.date).toBe('2026-01-16');
    expect(second.lines.reduce((s, l) => s + l.debitCents, 0)).toBe(100000);
  });

  it('collects every distinct account name referenced, sorted', () => {
    const result = parseJournalCsv(SAMPLE_CSV, MAPPING);
    expect(result.accountNamesReferenced).toEqual(['Chequing Account', 'Office Supplies', 'Sales']);
  });

  it('flags an unbalanced transaction rather than silently accepting it', () => {
    const csv = ['Trans #,Date,Account,Debit,Credit', '1,01/01/2026,A,100.00,', '1,01/01/2026,B,,90.00'].join('\n');
    const result = parseJournalCsv(csv, { transactionKeyColumn: 'Trans #', dateColumn: 'Date', accountColumn: 'Account', debitColumn: 'Debit', creditColumn: 'Credit', descriptionColumn: null });
    expect(result.transactions[0].balanced).toBe(false);
  });

  it('skips a transaction with no parseable date and warns', () => {
    const csv = ['Trans #,Date,Account,Debit,Credit', '1,not-a-date,A,100.00,', '1,not-a-date,B,,100.00'].join('\n');
    const result = parseJournalCsv(csv, { transactionKeyColumn: 'Trans #', dateColumn: 'Date', accountColumn: 'Account', debitColumn: 'Debit', creditColumn: 'Credit', descriptionColumn: null });
    expect(result.transactions).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/couldn't parse a date/i);
  });

  it('parses parenthesized negative amounts', () => {
    const csv = ['Trans #,Date,Account,Debit,Credit', '1,2026-01-01,A,"(50.00)",', '1,2026-01-01,B,,50.00'].join('\n');
    const result = parseJournalCsv(csv, { transactionKeyColumn: 'Trans #', dateColumn: 'Date', accountColumn: 'Account', debitColumn: 'Debit', creditColumn: 'Credit', descriptionColumn: null });
    // A parenthesized debit of (50.00) becomes -50.00 -> -5000 cents; not equal to credit 5000, so unbalanced.
    expect(result.transactions[0].lines[0].debitCents).toBe(-5000);
  });

  it('ignores rows missing a transaction key or account name', () => {
    const csv = ['Trans #,Date,Account,Debit,Credit', ',2026-01-01,A,100.00,', '1,2026-01-01,,100.00,'].join('\n');
    const result = parseJournalCsv(csv, { transactionKeyColumn: 'Trans #', dateColumn: 'Date', accountColumn: 'Account', debitColumn: 'Debit', creditColumn: 'Credit', descriptionColumn: null });
    expect(result.transactions).toHaveLength(0);
  });

  it('returns an empty result for an empty file', () => {
    const result = parseJournalCsv('', MAPPING);
    expect(result.transactions).toEqual([]);
    expect(result.warnings[0]).toMatch(/empty/i);
  });
});
