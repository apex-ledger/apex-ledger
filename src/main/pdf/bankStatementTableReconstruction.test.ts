import { describe, expect, it } from 'vitest';
import {
  buildColumnAnchors,
  columnIndexFor,
  fillInTransactionYears,
  findStatementBalances,
  findStatementYear,
  groupIntoRows,
  isHeaderRow,
  reconstructPageLines,
  stripLeadingHeaderLine,
  truncateAfterClosingBalance,
  truncateBeforeHeader,
  type PositionedItem,
} from './bankStatementTableReconstruction';

function item(str: string, x: number, y: number, width: number): PositionedItem {
  return { str, x, y, width };
}

// Real x/y/width positions captured from an actual RBC Business Account Statement PDF's text
// layer (getTextContent()) while building this — not invented numbers. The header row and two
// representative data rows: one where every column has a value, and one (the case that broke the
// original sequential-gap-based approach) where Debit is empty and only Credit + Balance appear.
const HEADER_ROW: PositionedItem[] = [
  item('Date', 45.0, 400, 15.8),
  item('Description', 89.7, 400, 39.4),
  item('Cheques & Debits ($)', 316.2, 400, 72.5),
  item('Deposits & Credits ($)', 417.9, 400, 75.5),
  item('Balance ($)', 554.7, 400, 38.7),
];

// "04 Mar   Cheque - 1042   8,663.33   [no credit]   5,829.60"
const ROW_WITH_DEBIT_NO_CREDIT: PositionedItem[] = [
  item('04 Mar', 45.0, 300, 27.0),
  item('Cheque - 1042', 90.0, 300, 56.1),
  item('8,663.33', 353.1, 300, 35.4),
  item('5,829.60', 557.4, 300, 35.4),
];

// "05 Mar   Online Banking transfer - 8505   [no debit]   4,000.00   9,829.60"
const ROW_WITH_CREDIT_NO_DEBIT: PositionedItem[] = [
  item('05 Mar', 45.0, 290, 27.0),
  item('Online Banking transfer - 8505', 90.0, 290, 130.0),
  item('4,000.00', 461.6, 290, 31.8),
  item('9,829.60', 557.4, 290, 35.4),
];

// A short amount ("1.50") sits far to the LEFT of a long amount ("8,663.33") in the same Debit
// column, since both are right-aligned — this is the exact case that broke naive left-edge
// bucketing (1.50's left edge of 370.8 falls past the left-edge midpoint into the Credit column).
const SHORT_DEBIT_ROW: PositionedItem[] = [item('INTERAC e-Transfer fee', 90.0, 280, 86.5), item('1.50', 370.8, 280, 17.7), item('8,724.65', 557.4, 280, 35.4)];

describe('isHeaderRow', () => {
  it('recognizes a real Date/Description/Debit/Credit/Balance header row', () => {
    expect(isHeaderRow(HEADER_ROW)).toBe(true);
  });

  it('rejects a data row that merely mentions a dollar amount', () => {
    expect(isHeaderRow(ROW_WITH_DEBIT_NO_CREDIT)).toBe(false);
  });

  it('rejects a row with "Date" but nothing else recognizable', () => {
    expect(isHeaderRow([item('Date', 0, 0, 10)])).toBe(false);
  });
});

describe('buildColumnAnchors', () => {
  it('anchors amount columns on their right edge and text columns on their left edge', () => {
    const layout = buildColumnAnchors(HEADER_ROW)!;
    // Sorted ascending: Date(left=45), Description(left=89.7), Debit(right=388.7),
    // Credit(right=493.4), Balance(right=593.4).
    expect(layout.anchors.map((a) => Math.round(a.anchorX))).toEqual([45, 90, 389, 493, 593]);
    expect(layout.boundaries).toHaveLength(4);
  });

  it('returns null for a row with fewer than 2 cells', () => {
    expect(buildColumnAnchors([item('Date', 0, 0, 10)])).toBeNull();
  });
});

describe('columnIndexFor', () => {
  const layout = buildColumnAnchors(HEADER_ROW)!;

  it('places a Debit amount in column 2 even when Credit (column 3) is empty on that row', () => {
    expect(columnIndexFor(item('8,663.33', 353.1, 300, 35.4), layout.boundaries)).toBe(2);
  });

  it('places a Credit amount in column 3 even when Debit (column 2) is empty on that row', () => {
    expect(columnIndexFor(item('4,000.00', 461.6, 290, 31.8), layout.boundaries)).toBe(3);
  });

  it('places a Balance amount in the last column regardless of digit count', () => {
    expect(columnIndexFor(item('5,829.60', 557.4, 300, 35.4), layout.boundaries)).toBe(4);
    expect(columnIndexFor(item('17,971.41', 554.7, 300, 42.0), layout.boundaries)).toBe(4);
  });

  it('places a short right-aligned amount ("1.50") in the same Debit column as a long one, not the neighboring column its short left edge would otherwise suggest', () => {
    expect(columnIndexFor(item('1.50', 370.8, 280, 17.7), layout.boundaries)).toBe(2);
  });

  it('places left-aligned Date/Description text by its left edge, unaffected by length', () => {
    expect(columnIndexFor(item('Cheque - 1042', 90.0, 300, 56.1), layout.boundaries)).toBe(1);
    expect(columnIndexFor(item('X', 90.0, 300, 3.0), layout.boundaries)).toBe(1);
  });
});

describe('groupIntoRows', () => {
  it('groups items with the same (or near-same) y into one row, ordered by x', () => {
    const shuffled = [ROW_WITH_DEBIT_NO_CREDIT[2], ROW_WITH_DEBIT_NO_CREDIT[0], ROW_WITH_DEBIT_NO_CREDIT[1]];
    const rows = groupIntoRows(shuffled);
    expect(rows).toHaveLength(1);
    expect(rows[0].map((i) => i.str)).toEqual(['04 Mar', 'Cheque - 1042', '8,663.33']);
  });

  it('splits items on different y into separate rows, topmost (largest y) first', () => {
    const rows = groupIntoRows([...ROW_WITH_DEBIT_NO_CREDIT, ...ROW_WITH_CREDIT_NO_DEBIT]);
    expect(rows).toHaveLength(2);
    expect(rows[0][0].str).toBe('04 Mar'); // y=300, printed above y=290 in PDF's bottom-up coordinate space
    expect(rows[1][0].str).toBe('05 Mar');
  });
});

describe('reconstructPageLines', () => {
  it('reconstructs a full page into tab-delimited rows, preserving empty cells instead of shifting columns', () => {
    const lines = reconstructPageLines([...HEADER_ROW, ...ROW_WITH_DEBIT_NO_CREDIT, ...ROW_WITH_CREDIT_NO_DEBIT]);

    expect(lines[0].split('\t')).toEqual(['Date', 'Description', 'Cheques & Debits ($)', 'Deposits & Credits ($)', 'Balance ($)']);

    const debitRowCells = lines[1].split('\t');
    expect(debitRowCells[0]).toBe('04 Mar');
    expect(debitRowCells[1]).toBe('Cheque - 1042');
    expect(debitRowCells[2]).toBe('8,663.33'); // Debit
    expect(debitRowCells[3]).toBe(''); // Credit — genuinely empty, not shifted
    expect(debitRowCells[4]).toBe('5,829.60'); // Balance

    const creditRowCells = lines[2].split('\t');
    expect(creditRowCells[0]).toBe('05 Mar');
    expect(creditRowCells[2]).toBe(''); // Debit — genuinely empty
    expect(creditRowCells[3]).toBe('4,000.00'); // Credit
    expect(creditRowCells[4]).toBe('9,829.60'); // Balance
  });

  it('keeps a short right-aligned Debit amount in the Debit column, not misread into Credit', () => {
    const lines = reconstructPageLines([...HEADER_ROW, ...SHORT_DEBIT_ROW]);
    const cells = lines[1].split('\t');
    expect(cells[1]).toBe('INTERAC e-Transfer fee');
    expect(cells[2]).toBe('1.50');
    expect(cells[3]).toBe('');
    expect(cells[4]).toBe('8,724.65');
  });

  it('drops a verbatim-duplicate text run instead of concatenating it onto the same cell', () => {
    // Captured from a real RBC statement's page-continuation row: the Date cell's "08 Jul" is
    // drawn twice at the exact same x/y (a fake-bold trick — same text struck twice instead of
    // using a bold font) — naive concatenation turned this into "08 Jul 08 Jul", which fails the
    // day+month date regex downstream and gets misparsed by the generic Date fallback (reading
    // the second "08" as a 2-digit year, corrupting the transaction date to 2008).
    const DUPLICATED_DATE_ROW: PositionedItem[] = [
      item('08 Jul', 45.0, 300, 27.0),
      item('08 Jul', 45.0, 300, 27.0),
      item('Online Banking transfer - 5103', 90.0, 300, 130.0),
      item('10,000.00', 461.6, 300, 31.8),
    ];
    const lines = reconstructPageLines([...HEADER_ROW, ...DUPLICATED_DATE_ROW]);
    const cells = lines[1].split('\t');
    expect(cells[0]).toBe('08 Jul');
    expect(cells[1]).toBe('Online Banking transfer - 5103');
    expect(cells[3]).toBe('10,000.00');
  });

  it('falls back to sequential gap-joining when no header row is present on the page', () => {
    const lines = reconstructPageLines([item('Some', 45, 100, 30), item('Cover', 400, 100, 40), item('Page', 700, 100, 30)]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Some');
    expect(lines[0]).toContain('Cover');
    expect(lines[0]).toContain('Page');
  });

  it('drops a row with no positioned items', () => {
    expect(reconstructPageLines([])).toEqual([]);
  });
});

// A realistic reconstruction of the actual RBC statement's line sequence used while building this
// feature: "Closing balance" appears once early, in the summary section (before the real
// transaction table even starts), and once again at the true end of the table — followed by pages
// of cancelled-cheque image captions ("Serial #: ... Amount: ...") that must not be mistaken for
// transaction rows.
const REALISTIC_STATEMENT_LINES = [
  'Account Summary for this Period',
  'Opening balance on March 3, 2025\t\t$14,523.43',
  'Total deposits & credits (6)\t\t+ 35,000.00',
  'Total cheques & debits (31)\t\t- 31,552.02',
  'Closing balance on April 1, 2025\t\t= $17,971.41',
  'Account Activity Details',
  'Date\tDescription\tCheques & Debits ($)\tDeposits & Credits ($)\tBalance ($)',
  '\tOpening balance\t\t\t14,523.43',
  '04 Mar\tCheque - 1042\t8,663.33\t\t5,829.60',
  '01 Apr\tCheque - 1174\t1,108.53\t\t17,971.41',
  '\tClosing balance\t\t\t17,971.41',
  'Account Fees: $36.50',
  '2 of 6',
  'Serial #: 1042\tAmount: $8,663.33',
  'Serial #: 1174\tAmount: $1,108.53',
];

describe('findStatementBalances', () => {
  it('takes the FIRST opening-balance line (the summary section) and the LAST closing-balance line (the real table end, not the earlier summary mention)', () => {
    const result = findStatementBalances(REALISTIC_STATEMENT_LINES);
    expect(result.openingBalanceCents).toBe(1452343);
    expect(result.closingBalanceCents).toBe(1797141);
  });

  it('returns nulls when neither balance line is present', () => {
    expect(findStatementBalances(['some', 'unrelated', 'lines'])).toEqual({ openingBalanceCents: null, closingBalanceCents: null });
  });
});

describe('truncateAfterClosingBalance', () => {
  it('cuts everything after the real transaction table\'s closing balance line, dropping cheque-image caption pages and fee summaries', () => {
    const truncated = truncateAfterClosingBalance(REALISTIC_STATEMENT_LINES);
    expect(truncated[truncated.length - 1]).toBe('\tClosing balance\t\t\t17,971.41');
    expect(truncated.some((l) => l.includes('Serial #'))).toBe(false);
    expect(truncated.some((l) => l.includes('Account Fees'))).toBe(false);
  });

  it('does not truncate at the earlier summary-section mention of closing balance', () => {
    const truncated = truncateAfterClosingBalance(REALISTIC_STATEMENT_LINES);
    // The real transaction rows between the summary and the table's own closing line must survive.
    expect(truncated.some((l) => l.includes('Cheque - 1042'))).toBe(true);
    expect(truncated.some((l) => l.includes('Cheque - 1174'))).toBe(true);
  });

  it('returns all lines unchanged when no closing-balance line is found', () => {
    const lines = ['some', 'unrelated', 'lines'];
    expect(truncateAfterClosingBalance(lines)).toEqual(lines);
  });
});

describe('truncateBeforeHeader', () => {
  it('cuts the letterhead/mailing-address/account-summary preamble, keeping the header line itself as the new first line', () => {
    const truncated = truncateBeforeHeader(REALISTIC_STATEMENT_LINES);
    expect(truncated[0]).toBe('Date\tDescription\tCheques & Debits ($)\tDeposits & Credits ($)\tBalance ($)');
    expect(truncated.some((l) => l.includes('Account Summary for this Period'))).toBe(false);
  });

  it('returns all lines unchanged when no header line is found', () => {
    const lines = ['some', 'unrelated', 'lines'];
    expect(truncateBeforeHeader(lines)).toEqual(lines);
  });
});

describe('stripLeadingHeaderLine', () => {
  it('drops a leading header line', () => {
    const lines = ['Date\tDescription\tBalance ($)', '15 Oct\tFEE\t100.00'];
    expect(stripLeadingHeaderLine(lines)).toEqual(['15 Oct\tFEE\t100.00']);
  });

  it('leaves lines unchanged when the first line is not a header', () => {
    const lines = ['15 Oct\tFEE\t100.00'];
    expect(stripLeadingHeaderLine(lines)).toEqual(lines);
  });
});

describe('findStatementYear', () => {
  it('recovers month + year from the summary section\'s "Closing balance on <Month> <Day>, <Year>" line', () => {
    expect(findStatementYear(REALISTIC_STATEMENT_LINES)).toEqual({ month: 3, year: 2025 }); // April = index 3
  });

  it('returns null when no closing-balance line carries a full date', () => {
    expect(findStatementYear(['Closing balance', 'no date here'])).toBeNull();
  });
});

describe('fillInTransactionYears', () => {
  const reference = { month: 3, year: 2025 }; // April 2025 — statement runs March into April

  it('fills in the reference year for a transaction dated in the reference month', () => {
    const [line] = fillInTransactionYears(['01 Apr\tCheque - 1174\t1,108.53'], reference);
    expect(line).toBe('01 Apr 2025\tCheque - 1174\t1,108.53');
  });

  it('fills in the SAME reference year for a transaction dated in an earlier month within the same calendar year', () => {
    const [line] = fillInTransactionYears(['04 Mar\tCheque - 1042\t8,663.33'], reference);
    expect(line).toBe('04 Mar 2025\tCheque - 1042\t8,663.33');
  });

  it('handles a December-into-January statement boundary (earlier month is December, gets the prior year)', () => {
    const decToJan = { month: 0, year: 2026 }; // January 2026 reference — statement runs December into January
    const [line] = fillInTransactionYears(['28 Dec\tCheque - 1\t100.00'], decToJan);
    expect(line).toBe('28 Dec 2025\tCheque - 1\t100.00');
  });

  it('only rewrites a cell that is EXACTLY a day+month token, leaving description text untouched', () => {
    const [line] = fillInTransactionYears(['01 Apr\tPaid on 15 Mar for services\t100.00'], reference);
    expect(line).toBe('01 Apr 2025\tPaid on 15 Mar for services\t100.00');
  });

  it('returns lines unchanged when no reference is given', () => {
    const lines = ['04 Mar\tCheque - 1042\t8,663.33'];
    expect(fillInTransactionYears(lines, null)).toEqual(lines);
  });
});
