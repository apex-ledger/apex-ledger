import { describe, expect, it } from 'vitest';
import { parseTransactions, parseWithMapping, splitIntoTable, suggestColumnMapping } from './parseTransactions';

describe('parseTransactions', () => {
  it('parses comma-separated date,description,amount rows with a header', () => {
    const text = 'Date,Description,Amount\n2026-01-05,TORONTO HYDRO,-120.50\n2026-01-06,CLIENT PAYMENT,500.00';
    const { rows, skipped } = parseTransactions(text);
    expect(rows).toHaveLength(2);
    expect(skipped).toBe(0);
    expect(rows[0]).toMatchObject({ date: '2026-01-05', description: 'TORONTO HYDRO', amountCents: -12050 });
    expect(rows[1]).toMatchObject({ date: '2026-01-06', description: 'CLIENT PAYMENT', amountCents: 50000 });
  });

  it('parses MM/DD/YYYY dates', () => {
    const { rows } = parseTransactions('01/15/2026,BELL CANADA,-85.00');
    expect(rows[0].date).toBe('2026-01-15');
  });

  it('handles separate debit/credit columns', () => {
    const text = '2026-02-01,RENT PAYMENT,1500.00,\n2026-02-02,DEPOSIT,,750.00';
    const { rows } = parseTransactions(text);
    expect(rows[0].amountCents).toBe(-150000);
    expect(rows[1].amountCents).toBe(75000);
  });

  it('parses tab-separated paste from a spreadsheet', () => {
    const { rows } = parseTransactions('2026-03-01\tSTAPLES\t-42.99');
    expect(rows[0]).toMatchObject({ description: 'STAPLES', amountCents: -4299 });
  });

  it('skips rows with an unparseable amount', () => {
    const { rows, skipped } = parseTransactions('2026-03-01,SOMETHING,not-a-number');
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('handles parenthesized negative amounts', () => {
    const { rows } = parseTransactions('2026-03-05,BANK FEE,($12.00)');
    expect(rows[0].amountCents).toBe(-1200);
  });

  it('reads columns by header name regardless of order, ignoring a running Balance column', () => {
    const text = [
      'Description,Date,Debit,Credit,Balance',
      'TORONTO HYDRO,2026-01-05,120.50,,4879.50',
      'CLIENT PAYMENT,2026-01-06,,500.00,5379.50',
    ].join('\n');
    const { rows, skipped } = parseTransactions(text);
    expect(skipped).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: '2026-01-05', description: 'TORONTO HYDRO', amountCents: -12050 });
    expect(rows[1]).toMatchObject({ date: '2026-01-06', description: 'CLIENT PAYMENT', amountCents: 50000 });
  });

  it('does not report an "Opening Balance" CSV row (Balance filled, Debit/Credit blank) as a skipped/unparseable row', () => {
    const text = [
      'Description,Date,Debit,Credit,Balance',
      'Opening Balance,2026-01-01,,,4879.50',
      'TORONTO HYDRO,2026-01-05,120.50,,4759.00',
    ].join('\n');
    const { rows, skipped, skippedRows } = parseTransactions(text);
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(0);
    expect(skippedRows).toHaveLength(0);
  });

  it('reads a single signed Amount column identified by header, description before date', () => {
    const text = 'Details,Transaction Date,Amount\nSTAPLES,2026-03-01,-42.99';
    const { rows } = parseTransactions(text);
    expect(rows[0]).toMatchObject({ date: '2026-03-01', description: 'STAPLES', amountCents: -4299 });
  });

  it('recognizes Money In / Money Out style headers', () => {
    const text = 'Date,Description,Money Out,Money In\n2026-04-01,OFFICE SUPPLIES,55.00,';
    const { rows } = parseTransactions(text);
    expect(rows[0].amountCents).toBe(-5500);
  });

  it('strips a leading UTF-8 BOM (as produced by Excel "CSV UTF-8" export)', () => {
    const bom = String.fromCharCode(0xfeff);
    const text = `${bom}Date,Description,Amount\n2026-05-01,TEST,-10.00`;
    const { rows, skipped } = parseTransactions(text);
    expect(skipped).toBe(0);
    expect(rows[0]).toMatchObject({ date: '2026-05-01', description: 'TEST', amountCents: -1000 });
  });

  it('parses a real RBC-style export: two description columns, "CAD$" amount, date not in column 1', () => {
    const header = 'Source Account,Account Type,Account Number,Transaction Date,Cheque Number,Description 1,Description 2,CAD$,USD$';
    const row1 = '00667-1040542,Chequing,00667-1040542,10/1/2024,,Online Banking payment - 1599,ABELL PEST CTRL,-57.63,';
    const row2 = '00667-1040542,Chequing,00667-1040542,10/1/2024,,Online Banking transfer - 5600,,5000,';
    const { rows, skipped } = parseTransactions([header, row1, row2].join('\n'));
    expect(skipped).toBe(0);
    expect(rows[0]).toMatchObject({
      date: '2024-10-01',
      description: 'Online Banking payment - 1599 ABELL PEST CTRL',
      amountCents: -5763,
    });
    expect(rows[1]).toMatchObject({ date: '2024-10-01', description: 'Online Banking transfer - 5600', amountCents: 500000 });
  });
});

describe('column-mapping mode', () => {
  it('suggests roles matching a recognized header, and matches parseTransactions output when applied', () => {
    const text = 'Date,Description,Debit,Credit\n2026-01-05,TORONTO HYDRO,120.50,\n2026-01-06,CLIENT PAYMENT,,500.00';
    const table = splitIntoTable(text);
    const { roles, hasHeader } = suggestColumnMapping(table);
    expect(hasHeader).toBe(true);
    expect(roles).toEqual(['date', 'description', 'debit', 'credit']);

    const mapped = parseWithMapping(table, roles, hasHeader, 'auto');
    const auto = parseTransactions(text);
    expect(mapped).toEqual(auto);
  });

  it('suggests positional roles when there is no recognizable header', () => {
    const table = splitIntoTable('2026-01-05,TORONTO HYDRO,-120.50\n2026-01-06,CLIENT PAYMENT,500.00');
    const { roles, hasHeader } = suggestColumnMapping(table);
    expect(hasHeader).toBe(false);
    expect(roles).toEqual(['date', 'description', 'amount']);
  });

  it('lets the user override a wrong auto-guess (e.g. swap debit/credit)', () => {
    const table = splitIntoTable('Date,Description,ColA,ColB\n2026-01-05,RENT,,900.00\n2026-01-06,SALE,300.00,');
    // Force ColA=credit, ColB=debit (opposite of a natural debit/credit reading) to prove the
    // explicit mapping — not the auto-guess — is what actually gets applied.
    const roles: import('./parseTransactions').ColumnRole[] = ['date', 'description', 'credit', 'debit'];
    const result = parseWithMapping(table, roles, true, 'auto');
    expect(result.rows[0]).toMatchObject({ date: '2026-01-05', amountCents: -900_00 }); // ColB=debit=900 -> negative
    expect(result.rows[1]).toMatchObject({ date: '2026-01-06', amountCents: 300_00 }); // ColA=credit=300 -> positive
  });

  it('respects an explicit DMY date format', () => {
    const table = splitIntoTable('05/01/2026,SALE,100.00');
    const { roles } = suggestColumnMapping(table);
    const result = parseWithMapping(table, roles, false, 'DMY');
    expect(result.rows[0].date).toBe('2026-01-05'); // 05/01 read as DD/MM -> Jan 5th
  });

  it('respects an explicit MDY date format for the same ambiguous input', () => {
    const table = splitIntoTable('05/01/2026,SALE,100.00');
    const { roles } = suggestColumnMapping(table);
    const result = parseWithMapping(table, roles, false, 'MDY');
    expect(result.rows[0].date).toBe('2026-05-01'); // 05/01 read as MM/DD -> May 1st
  });

  it('skips a row whose mapped date column fails to parse', () => {
    const table = splitIntoTable('Date,Description,Amount\nnot-a-date,SALE,100.00\n2026-01-06,SALE2,50.00');
    const { roles, hasHeader } = suggestColumnMapping(table);
    const result = parseWithMapping(table, roles, hasHeader, 'auto');
    expect(result.rows).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it('guesses a skipped row\'s amount from anywhere on the line when the mapped Amount column is empty', () => {
    // Mirrors a real misaligned-column PDF row: the Amount cell is blank, but the true figure is
    // still sitting in the Description text (a wrapped/shifted column, not a missing amount).
    // Tab-delimited (like real PDF-reconstructed text) so the comma inside "1,570.47" can't get
    // mistaken for a CSV column separator.
    const table = splitIntoTable('Date\tDescription\tAmount\n2026-01-05\tCheque - 900 1,570.47\tn/a');
    const { roles, hasHeader } = suggestColumnMapping(table);
    const result = parseWithMapping(table, roles, hasHeader, 'auto');
    expect(result.rows).toHaveLength(0);
    expect(result.skipped).toBe(1);
    expect(result.skippedRows[0].amountGuessCents).toBe(157047);
    expect(result.skippedRows[0].dateGuess).toBe('2026-01-05');
  });

  it('leaves the amount guess null when no dollar-looking number appears anywhere on the line', () => {
    // The Amount cell has to be non-blank text ("n/a") rather than truly empty — a row with
    // nothing in any amount-bearing column is treated as a wrapped-description continuation
    // fragment (see parseWithMapping's own doc comment) and buffered onto the next real row
    // rather than reaching the skip site at all.
    const table = splitIntoTable('Date\tDescription\tAmount\n2026-01-05\tMonthly statement fee note\tn/a');
    const { roles, hasHeader } = suggestColumnMapping(table);
    const result = parseWithMapping(table, roles, hasHeader, 'auto');
    expect(result.skippedRows[0].amountGuessCents).toBeNull();
  });

  it('honours an "ignore" role, excluding that column from the description', () => {
    const table = splitIntoTable('2026-01-05,SALE,INTERNAL-CODE-999,100.00');
    const roles: import('./parseTransactions').ColumnRole[] = ['date', 'description', 'ignore', 'amount'];
    const result = parseWithMapping(table, roles, false, 'auto');
    expect(result.rows[0].description).toBe('SALE');
  });
});

describe('splitIntoTable preserves leading/trailing empty cells', () => {
  it('does not eat a leading tab (an empty Date cell) when splitting a PDF-reconstructed row', () => {
    // Real bank statements print the Date column only on the first transaction of a day, leaving
    // it blank on later transactions that same day — a plain per-line .trim() treats a tab as
    // whitespace and would strip that leading empty cell, shifting every later column left by one.
    const table = splitIntoTable('Date\tDescription\tDebit\tCredit\n15 Oct\tFEE A\t\t1.50\n\tFEE B\t\t2.00');
    expect(table.allRows[1]).toEqual(['15 Oct', 'FEE A', '', '1.50']);
    expect(table.allRows[2]).toEqual(['', 'FEE B', '', '2.00']);
  });
});

describe('parseWithMapping: PDF statement row normalization', () => {
  const roles: import('./parseTransactions').ColumnRole[] = ['date', 'description', 'debit', 'credit', 'balance'];

  it('carries the last seen date forward onto later same-day rows that print a blank Date cell', () => {
    // Dates already carry a year here — extractBankStatementTable fills that in (see
    // fillInTransactionYears) before this text ever reaches parseWithMapping.
    const table = splitIntoTable(
      [
        'Date\tDescription\tDebit\tCredit\tBalance',
        '15 Oct 2025\tVSA DEP\t\t68.34',
        '\tEF1015\t\t89.79',
        '16 Oct 2025\tMobile deposit\t\t1320.14',
      ].join('\n'),
    );
    const result = parseWithMapping(table, roles, true, 'auto');
    expect(result.rows.map((r) => r.date)).toEqual(['2025-10-15', '2025-10-15', '2025-10-16']);
  });

  it('folds an amount-less description-only continuation row into the NEXT row that carries an amount', () => {
    const table = splitIntoTable(
      [
        'Date\tDescription\tDebit\tCredit\tBalance',
        '15 Oct 2025\tContactless Interac purchase - 5451 B002\t\t\t',
        '\tESSO CIRCLE K\t105.36\t\t7413.93',
      ].join('\n'),
    );
    const result = parseWithMapping(table, roles, true, 'auto');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      date: '2025-10-15',
      description: 'Contactless Interac purchase - 5451 B002 ESSO CIRCLE K',
      amountCents: -10536,
    });
  });

  it('does NOT sweep an "Opening balance" pseudo-row (has a Balance but no Debit/Credit) into the next row\'s description', () => {
    const table = splitIntoTable(
      ['Date\tDescription\tDebit\tCredit\tBalance', '\tOpening balance\t\t\t14523.43', '04 Mar 2025\tCheque - 1042\t8663.33\t\t5829.60'].join('\n'),
    );
    const result = parseWithMapping(table, roles, true, 'auto');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].description).toBe('Cheque - 1042');
  });

  it('does not report an Opening/Closing balance line as a skipped/unparseable row', () => {
    // These lines never carry a Debit/Credit — that's expected, not a parsing failure, so they
    // must not inflate the "N row(s) could not be parsed" count shown to the user.
    const table = splitIntoTable(
      [
        'Date\tDescription\tDebit\tCredit\tBalance',
        '01 Mar 2025\tOpening balance\t\t\t14523.43',
        '04 Mar 2025\tCheque - 1042\t8663.33\t\t5829.60',
        '31 Mar 2025\tClosing balance\t\t\t5829.60',
      ].join('\n'),
    );
    const result = parseWithMapping(table, roles, true, 'auto');
    expect(result.rows).toHaveLength(1);
    expect(result.skipped).toBe(0);
    expect(result.skippedRows).toHaveLength(0);
  });

  it('drops a bare page-footer fragment ("1 of 5") without merging it into a neighboring description', () => {
    const table = splitIntoTable(
      ['Date\tDescription\tDebit\tCredit\tBalance', '\t\t\t\t1 of 5', '16 Oct 2025\tMobile deposit\t\t1320.14\t'].join('\n'),
    );
    const result = parseWithMapping(table, roles, true, 'auto');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].description).toBe('Mobile deposit');
  });
});
