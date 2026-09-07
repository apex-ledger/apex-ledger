import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildExcelWorkbook } from '../export/excelWorkbook';
import { isDateNumberFormat, readSpreadsheetAsCsv, readWorkbook, rowsToCsv } from './readSpreadsheet';
import { parseCsvRows } from '@shared/domain/importing/parseCsv';
import { detectQuickBooksReport, parseQuickBooksReport } from '@shared/domain/importing/parseQuickBooksReport';
import { getCsvHeaders, parseAccountsCsvPreview } from '@shared/domain/importing/parseAccountsCsv';

const fixture = (name: string) => path.join(__dirname, 'fixtures', name);

describe('readWorkbook', () => {
  it('round-trips a workbook written by the app', async () => {
    const buffer = await buildExcelWorkbook({ title: 'Trial Balance', rows: [['Account', 'Debit', 'Credit'], ['Chequing, main', '1130.5', ''], ['Sales "retainer"', '', '01234']] });
    const [sheet] = readWorkbook(new Uint8Array(buffer));
    expect(sheet.name).toBe('Trial Balance');
    // The app's own writer puts the report title on row 1 and leaves row 2 blank — the same
    // report-shaped layout the importers now look past.
    expect(sheet.rows).toEqual([['Trial Balance'], [], ['Account', 'Debit', 'Credit'], ['Chequing, main', '1130.5', ''], ['Sales "retainer"', '', '01234']]);
  });

  it('reads an Excel-made QuickBooks export: dates from number formats, numbers as digits, blanks kept', () => {
    const { sheetName, csv } = readSpreadsheetAsCsv(fixture('qbo-general-ledger.xlsx'));
    expect(sheetName).toBe('Sheet1');
    const rows = parseCsvRows(csv);
    expect(rows[4].slice(0, 3)).toEqual(['', 'Date', 'Transaction Type']);
    expect(rows[7].slice(0, 10)).toEqual(['', '2025-10-03', 'Expense', '', 'No', 'Bell Canada', 'Phone', 'Telephone', '', '113']);
    expect(rows[9][8]).toBe('$1,130.00');
  });

  it('feeds the QuickBooks report parser straight from Excel', () => {
    const gl = readSpreadsheetAsCsv(fixture('qbo-general-ledger.xlsx')).csv;
    expect(detectQuickBooksReport(gl)).toBe('generalLedger');
    const glResult = parseQuickBooksReport(gl);
    expect(glResult.transactions).toHaveLength(2);
    expect(glResult.transactions.every((transaction) => transaction.balanced)).toBe(true);

    const journal = readSpreadsheetAsCsv(fixture('qbo-journal.xlsx')).csv;
    expect(detectQuickBooksReport(journal)).toBe('journal');
    const journalResult = parseQuickBooksReport(journal);
    expect(journalResult.transactions.map((transaction) => [transaction.date, transaction.docNumber, transaction.balanced])).toEqual([
      ['2025-10-03', null, true],
      ['2025-10-15', '1042', true],
    ]);
  });

  it('feeds the Chart of Accounts importer from the QuickBooks Account List export', () => {
    const csv = readSpreadsheetAsCsv(fixture('qbo-account-list.xlsx')).csv;
    expect(getCsvHeaders(csv)).toEqual(['Account', 'Type', 'Detail type', 'Description', 'Balance']);
    const preview = parseAccountsCsvPreview(csv, { nameColumn: 'Account', typeColumn: 'Type', descriptionColumn: 'Description' });
    expect(preview.accounts).toHaveLength(13);
    expect(preview.accounts[0]).toEqual({ name: 'Chequing Account', rawType: 'Bank', description: 'Main operating account' });
    expect(preview.warnings).toEqual([]);
  });

  it('rejects the old binary .xls format with advice', () => {
    expect(() => readSpreadsheetAsCsv('C:\\exports\\ledger.xls')).toThrow(/save as \.xlsx or \.csv/);
  });
});

describe('isDateNumberFormat', () => {
  it('tells built-in and custom date formats from currency formats', () => {
    expect(isDateNumberFormat(14, undefined)).toBe(true);
    expect(isDateNumberFormat(164, 'yyyy-mm-dd')).toBe(true);
    expect(isDateNumberFormat(165, '[$-409]mmm d, yyyy')).toBe(true);
    expect(isDateNumberFormat(166, '"$"#,##0.00')).toBe(false);
    expect(isDateNumberFormat(167, '0.00')).toBe(false);
    expect(isDateNumberFormat(0, undefined)).toBe(false);
  });
});

describe('rowsToCsv', () => {
  it('quotes commas, quotes and newlines and pads ragged rows', () => {
    expect(rowsToCsv([['a', 'b,c'], ['say "hi"'], ['x\ny', '', 'z']])).toBe('a,"b,c",\n"say ""hi""",,\n"x\ny",,z');
  });
});
