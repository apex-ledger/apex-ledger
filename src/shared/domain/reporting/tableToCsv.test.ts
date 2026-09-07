import { describe, expect, it } from 'vitest';
import { escapeCsvCell, normalizeCellForExport, rowsToCsv, rowsToTsv } from './tableToCsv';

describe('escapeCsvCell', () => {
  it('leaves an ordinary value alone', () => {
    expect(escapeCsvCell('Rent')).toBe('Rent');
    expect(escapeCsvCell('1234.56')).toBe('1234.56');
  });

  it('quotes a value containing a comma', () => {
    // One unescaped comma silently shifts every column after it, and the reader cannot tell.
    expect(escapeCsvCell('Smith, John')).toBe('"Smith, John"');
  });

  it('doubles a quote rather than escaping it with a backslash', () => {
    expect(escapeCsvCell('The "Big" Store')).toBe('"The ""Big"" Store"');
  });

  it('quotes a value containing a line break', () => {
    expect(escapeCsvCell('Line one\nLine two')).toBe('"Line one\nLine two"');
  });

  it('quotes a leading zero so the spreadsheet keeps it', () => {
    // An account code of 0542 becomes 542 otherwise, because Excel reads it as a number.
    expect(escapeCsvCell('0542')).toBe('"0542"');
  });

  it('does not quote a plain zero or a decimal', () => {
    expect(escapeCsvCell('0')).toBe('0');
    expect(escapeCsvCell('0.5')).toBe('0.5');
  });
});

describe('rowsToCsv', () => {
  it('joins cells with commas and rows with CRLF', () => {
    expect(rowsToCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d');
  });

  it('escapes as it goes', () => {
    expect(rowsToCsv([['Smith, John', '100']])).toBe('"Smith, John",100');
  });

  it('handles an empty table', () => {
    expect(rowsToCsv([])).toBe('');
  });
});

describe('rowsToTsv', () => {
  it('uses tabs, so a paste spreads across columns instead of landing in one cell', () => {
    expect(rowsToTsv([['a', 'b']])).toBe('a\tb');
  });

  it('flattens anything that would break the row apart', () => {
    // A tab or newline inside a cell would split it into extra columns on paste.
    expect(rowsToTsv([['one\ttwo', 'three\nfour']])).toBe('one two\tthree four');
  });
});

describe('normalizeCellForExport', () => {
  it('strips the currency symbol and grouping so the figure can be summed', () => {
    // Left as "$1,234.56" it arrives in Excel as text and every check the reader runs fails.
    expect(normalizeCellForExport('$1,234.56')).toBe('1234.56');
    expect(normalizeCellForExport('1,234')).toBe('1234');
  });

  it('turns an accounting bracket into a real minus sign', () => {
    expect(normalizeCellForExport('(500.00)')).toBe('-500.00');
    expect(normalizeCellForExport('($1,200.00)')).toBe('-1200.00');
  });

  it('keeps a negative already written with a minus', () => {
    expect(normalizeCellForExport('-42.00')).toBe('-42.00');
  });

  it('leaves text alone, including text that merely contains digits', () => {
    // "Chequing (0542)" must not be mangled into a negative number.
    expect(normalizeCellForExport('Rent')).toBe('Rent');
    expect(normalizeCellForExport('Chequing (0542)')).toBe('Chequing (0542)');
    expect(normalizeCellForExport('Class 10.1')).toBe('Class 10.1');
  });

  it('collapses the whitespace a screen layout leaves behind', () => {
    expect(normalizeCellForExport('  Rent\n   ')).toBe('Rent');
  });

  it('leaves an em dash placeholder as it is', () => {
    expect(normalizeCellForExport('—')).toBe('—');
  });
});
