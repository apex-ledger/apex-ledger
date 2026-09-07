import { describe, expect, it } from 'vitest';
import { parseCsvRows } from './parseCsv';

describe('parseCsvRows', () => {
  it('splits a simple unquoted CSV', () => {
    expect(parseCsvRows('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsvRows('Date,Memo\n2026-01-01,"Payment, thanks!"')).toEqual([
      ['Date', 'Memo'],
      ['2026-01-01', 'Payment, thanks!'],
    ]);
  });

  it('handles escaped double quotes inside a quoted field', () => {
    expect(parseCsvRows('Memo\n"She said ""hello"""')).toEqual([['Memo'], ['She said "hello"']]);
  });

  it('handles a newline embedded inside a quoted field', () => {
    expect(parseCsvRows('Memo\n"Line one\nLine two",End')).toEqual([['Memo'], ['Line one\nLine two', 'End']]);
  });

  it('strips a leading UTF-8 BOM', () => {
    expect(parseCsvRows('﻿a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsvRows('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('drops blank lines', () => {
    expect(parseCsvRows('a,b\n\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsvRows('')).toEqual([]);
  });
});
