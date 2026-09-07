import { describe, expect, it } from 'vitest';
import { excelSerialToIsoDate, findHeaderRowIndex, parseImportDate, parseImportMoney } from './reportLayout';

describe('findHeaderRowIndex', () => {
  it('is row 0 for a plain CSV', () => {
    expect(findHeaderRowIndex([['Date', 'Account', 'Debit'], ['2026-01-01', 'A', '1']])).toBe(0);
  });
  it('skips QuickBooks title rows and the blank spacer', () => {
    expect(findHeaderRowIndex([['Company'], ['General Ledger'], ['October - December, 2025'], [''], ['', 'Date', 'Transaction Type', '#'], ['Chequing']])).toBe(4);
  });
  it('does not mistake a data row for the header', () => {
    expect(findHeaderRowIndex([['Company'], ['2026-01-01', 'A', '100.00', ''], ['Date', 'Account', 'Debit', 'Credit']])).toBe(2);
  });
});

describe('parseImportDate', () => {
  it('reads the formats bookkeeping exports use', () => {
    expect(parseImportDate('2025-10-03')).toBe('2025-10-03');
    expect(parseImportDate('2025-10-03 00:00:00')).toBe('2025-10-03');
    expect(parseImportDate('10/03/2025')).toBe('2025-10-03');
    expect(parseImportDate('25/10/2025')).toBe('2025-10-25');
    expect(parseImportDate('1/5/26')).toBe('2026-01-05');
    expect(parseImportDate('Oct 3, 2025')).toBe('2025-10-03');
    expect(parseImportDate('October 3, 2025')).toBe('2025-10-03');
    expect(parseImportDate('3 Oct 2025')).toBe('2025-10-03');
    expect(parseImportDate('03-Oct-2025')).toBe('2025-10-03');
    expect(parseImportDate('45933')).toBe('2025-10-03');
  });
  it('refuses what is not a date', () => {
    expect(parseImportDate('TOTAL')).toBeNull();
    expect(parseImportDate('13/13/2025')).toBeNull();
    expect(parseImportDate('')).toBeNull();
  });
});

describe('excelSerialToIsoDate', () => {
  it('converts 1900-system serials', () => {
    expect(excelSerialToIsoDate(45933)).toBe('2025-10-03');
    expect(excelSerialToIsoDate(2)).toBe('1900-01-01');
  });
  it('honours the 1904 system', () => {
    expect(excelSerialToIsoDate(44471, true)).toBe('2025-10-03');
  });
});

describe('parseImportMoney', () => {
  it('reads report-formatted amounts', () => {
    expect(parseImportMoney('$1,130.00')).toBe(113000);
    expect(parseImportMoney('(113.00)')).toBe(-11300);
    expect(parseImportMoney('-$117.00')).toBe(-11700);
    expect(parseImportMoney('')).toBe(0);
  });
});
