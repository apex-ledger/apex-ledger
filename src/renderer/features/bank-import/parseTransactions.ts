export interface ParsedTransaction {
  key: string;
  date: string;
  description: string;
  amountCents: number;
  /** Set when amountCents came from scanning the whole line for any dollar figure rather than
   * from the recognized Amount/Debit/Credit column — a real number, but its direction (money
   * in/out) is a guess, not read from a column that says which side it's on. The reviewer should
   * confirm both the amount and the category before including it in the import. */
  needsVerification?: boolean;
}

/** A row the parser couldn't turn into a transaction (bad/missing date, or no usable amount) —
 * carries whatever it WAS able to read plus the original line text, so the reviewer can see
 * exactly which transaction is missing and finish entering it by hand instead of it silently
 * vanishing into a bare "N rows skipped" count. */
export interface SkippedRow {
  sourceIndex: number;
  /** The row's original text, for context when neither guess below could be made. */
  raw: string;
  descriptionGuess: string;
  /** Normalized ISO date if the date cell parsed, null if it didn't (and needs to be typed in by hand). */
  dateGuess: string | null;
  /** Absolute-value amount guess (sign/direction still needs the reviewer's own Debit/Credit choice) if any amount-bearing cell parsed to a nonzero number, null otherwise. */
  amountGuessCents: number | null;
}

export interface ParseResult {
  rows: ParsedTransaction[];
  skipped: number;
  skippedRows: SkippedRow[];
}

// A statement's own printed "Opening balance" / "Closing balance" line has a Balance figure but no
// Debit/Credit/Amount, since it isn't a transaction — without this check that row falls through to
// the "no usable amount" branch below and gets miscounted as a parse failure instead of being
// recognized as the (correctly excluded) summary line it actually is.
const BALANCE_LINE_KEYWORDS = [
  'opening balance',
  'closing balance',
  'balance forward',
  'previous balance',
  'balance brought forward',
  'new balance',
  'ending balance',
  'balance carried forward',
];

export function isBalanceSummaryLine(text: string): boolean {
  const lower = text.toLowerCase();
  return BALANCE_LINE_KEYWORDS.some((k) => lower.includes(k));
}

function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  return line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
}

function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parts = trimmed.split(/[/-]/);
  if (parts.length === 3 && parts[2].trim().length === 4) {
    const month = parts[0].trim().padStart(2, '0');
    const day = parts[1].trim().padStart(2, '0');
    const year = parts[2].trim();
    const monthNum = Number(month);
    const dayNum = Number(day);
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
      return `${year}-${month}-${day}`;
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function parseAmountCents(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,]/g, '').trim();
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  const num = Number(s);
  if (Number.isNaN(num)) return null;
  const cents = Math.round(num * 100);
  return negative ? -cents : cents;
}

// Matches a dollar-amount-looking token anywhere in a string, not just a specific column — used
// as a fallback guess for a skipped row's amount when the recognized Amount/Debit/Credit column
// came up empty. This is exactly the case confirmed against a real RBC statement where a wrapped
// column shifted the true amount into the Description text instead of its own column: the number
// itself is still right there on the line, just not where the parser expected it.
const AMOUNT_TOKEN_ANYWHERE = /-?\$?\(?[\d,]+\.\d{2}\)?/;

function extractAnyAmountGuessCents(text: string): number | null {
  const match = text.match(AMOUNT_TOKEN_ANYWHERE);
  if (!match) return null;
  const cents = parseAmountCents(match[0]);
  return cents !== null ? Math.abs(cents) : null;
}

type SingleColumnKey = 'date' | 'amount' | 'debit' | 'credit' | 'balance';

// Checked in this order per header cell — more specific/exclusive columns first. A cell that
// matches one of these is never also treated as a description column.
const SINGLE_COLUMN_ALIASES: [SingleColumnKey, string[]][] = [
  ['balance', ['balance', 'running balance', 'ending balance']],
  ['debit', ['debit', 'withdrawal', 'money out', 'out']],
  ['credit', ['credit', 'deposit', 'money in']],
  ['date', ['date']],
  // 'cad$'/'cad' covers real Canadian bank exports (e.g. RBC) whose single signed-amount column
  // is literally headed "CAD$" rather than "Amount" — a bare "amount" alias alone misses it.
  ['amount', ['amount', 'cad$', 'cad amount', ' cad ']],
];

const DESCRIPTION_ALIASES = ['description', 'details', 'memo', 'narration', 'payee', 'transaction'];

interface HeaderMap {
  date?: number;
  amount?: number;
  debit?: number;
  credit?: number;
  balance?: number;
  /** Some bank exports split the description across two+ columns (e.g. "Description 1" /
   * "Description 2", where the second one is the actual payee name) — all matches are
   * concatenated rather than only keeping the first. */
  descriptionColumns: number[];
}

/** Reads a candidate header row and maps recognized column names to their index — in any order.
 * Returns null if it doesn't look like a header we can use (no recognizable date + amount/debit/
 * credit column). "Balance" (or similar running-balance columns) is recognized and then ignored. */
function detectHeader(cells: string[]): HeaderMap | null {
  const map: HeaderMap = { descriptionColumns: [] };
  cells.forEach((cell, i) => {
    const normalized = cell.trim().toLowerCase();
    if (!normalized) return;
    for (const [key, aliases] of SINGLE_COLUMN_ALIASES) {
      if (map[key] !== undefined) continue;
      if (aliases.some((alias) => normalized.includes(alias))) {
        map[key] = i;
        return;
      }
    }
    if (DESCRIPTION_ALIASES.some((alias) => normalized.includes(alias))) {
      map.descriptionColumns.push(i);
    }
  });
  const hasDate = map.date !== undefined;
  const hasAmountish = map.amount !== undefined || map.debit !== undefined || map.credit !== undefined;
  return hasDate && hasAmountish ? map : null;
}

function amountFromColumns(cells: string[], map: HeaderMap): number | null {
  if (map.amount !== undefined) {
    return parseAmountCents(cells[map.amount] ?? '');
  }
  const debit = map.debit !== undefined ? parseAmountCents(cells[map.debit] ?? '') ?? 0 : 0;
  const credit = map.credit !== undefined ? parseAmountCents(cells[map.credit] ?? '') ?? 0 : 0;
  if (credit !== 0) return Math.abs(credit);
  if (debit !== 0) return -Math.abs(debit);
  return null;
}

function descriptionFromColumns(cells: string[], map: HeaderMap): string {
  return map.descriptionColumns
    .map((i) => cells[i]?.trim())
    .filter((v): v is string => !!v)
    .join(' ');
}

// --- Explicit column-mapping mode (the "which column is Date/Description/Debit/Credit"
// screen shown before import, for files the auto-detector guesses wrong on) ---

export type ColumnRole = 'date' | 'description' | 'debit' | 'credit' | 'amount' | 'balance' | 'ignore';
export type DateFormat = 'auto' | 'MDY' | 'DMY' | 'YMD';

export interface RawTable {
  /** Every non-blank line, split into cells — callers decide whether row 0 is a header. */
  allRows: string[][];
  columnCount: number;
}

export function splitIntoTable(text: string): RawTable {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  // Deliberately NOT a plain .trim() per line — a tab is whitespace as far as .trim() is
  // concerned, so trimming the whole line would eat a leading/trailing tab that actually marks a
  // genuinely empty first/last cell (e.g. a PDF-reconstructed row with a blank Date column: "\tFEE
  // 1.50"), silently shifting every later cell one column to the left. The emptiness check for
  // filtering blank lines can still use .trim() since it's read-only there.
  const allRows = withoutBom
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map(splitLine);
  const columnCount = allRows.reduce((max, row) => Math.max(max, row.length), 0);
  return { allRows, columnCount };
}

/** Best-guess role per column plus whether row 0 looks like a header — the mapping screen's
 * starting point, so in the common case the user can just click "Continue" unchanged. */
export function suggestColumnMapping(table: RawTable): { roles: ColumnRole[]; hasHeader: boolean } {
  const firstRow = table.allRows[0] ?? [];
  const headerMap = detectHeader(firstRow);
  const roles: ColumnRole[] = new Array(table.columnCount).fill('ignore');

  if (headerMap) {
    if (headerMap.date !== undefined) roles[headerMap.date] = 'date';
    if (headerMap.amount !== undefined) roles[headerMap.amount] = 'amount';
    if (headerMap.debit !== undefined) roles[headerMap.debit] = 'debit';
    if (headerMap.credit !== undefined) roles[headerMap.credit] = 'credit';
    if (headerMap.balance !== undefined) roles[headerMap.balance] = 'balance';
    for (const i of headerMap.descriptionColumns) roles[i] = 'description';
    return { roles, hasHeader: true };
  }

  // No recognizable header — fall back to the same positional guesses parseTransactions() uses:
  // [date, description, amount] or [date, description, debit, credit] or [date, ...desc, amount].
  if (table.columnCount >= 3) {
    roles[0] = 'date';
    if (table.columnCount === 3) {
      roles[1] = 'description';
      roles[2] = 'amount';
    } else if (table.columnCount === 4) {
      roles[1] = 'description';
      roles[2] = 'debit';
      roles[3] = 'credit';
    } else {
      for (let i = 1; i < table.columnCount - 1; i++) roles[i] = 'description';
      roles[table.columnCount - 1] = 'amount';
    }
  }
  return { roles, hasHeader: false };
}

function normalizeDateWithFormat(raw: string, format: DateFormat): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (format === 'auto') return normalizeDate(trimmed);

  const parts = trimmed.split(/[/-]/).map((p) => p.trim());
  if (parts.length !== 3) return normalizeDate(trimmed);

  let year: string, month: string, day: string;
  if (format === 'YMD') {
    [year, month, day] = parts;
  } else if (format === 'DMY') {
    [day, month, year] = parts;
  } else {
    [month, day, year] = parts;
  }
  if (year.length !== 4) return normalizeDate(trimmed);
  month = month.padStart(2, '0');
  day = day.padStart(2, '0');
  const monthNum = Number(month);
  const dayNum = Number(day);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;
  return `${year}-${month}-${day}`;
}

// Matches a bare page-footer page number ("1 of 5") that can land in an amount column purely by
// x-position during PDF reconstruction — real amount text, so it isn't blank, but it also isn't a
// real number, so it must not be mistaken for "this row carries an amount" nor swept up as a
// description continuation.
const PAGE_FOOTER_PATTERN = /^\d+\s+of\s+\d+$/i;

/** Parses a table using an EXPLICIT column-role mapping and date format chosen on the mapping
 * screen, instead of auto-detecting — for files the auto-detector guessed wrong on.
 *
 * Before the per-row parse, two PDF-statement-specific normalizations run over the raw cells (both
 * harmless no-ops for a well-formed CSV export, where every row already carries its own date and
 * amount): a printed bank statement shows the date only on the FIRST transaction of each day,
 * leaving it blank on every later transaction that same day — so a blank date cell inherits the
 * last non-blank date seen. And a long description sometimes wraps onto a second physical line
 * that carries no amount of its own at all — so a row with text in its description column(s) but
 * nothing in ANY amount-bearing column (debit/credit/amount/balance) is folded into the very next
 * row's description rather than being parsed (and discarded) as its own transaction. */
export function parseWithMapping(table: RawTable, roles: ColumnRole[], hasHeader: boolean, dateFormat: DateFormat): ParseResult {
  const rows: ParsedTransaction[] = [];
  const skippedRows: SkippedRow[] = [];
  let skipped = 0;
  const dateCol = roles.indexOf('date');
  const amountCol = roles.indexOf('amount');
  const debitCol = roles.indexOf('debit');
  const creditCol = roles.indexOf('credit');
  const balanceCol = roles.indexOf('balance');
  const descriptionCols = roles.reduce<number[]>((acc, r, i) => (r === 'description' ? [...acc, i] : acc), []);

  function cellText(cells: string[], col: number): string {
    return col >= 0 ? (cells[col] ?? '').trim() : '';
  }
  function isRealAmountText(text: string): boolean {
    return text.length > 0 && !PAGE_FOOTER_PATTERN.test(text);
  }
  // Any amount-bearing column (including Balance, even though it's never posted) having real
  // content is enough to mark this a genuine data row rather than a bare description continuation
  // — an "Opening balance" summary line, for instance, has nothing in Debit/Credit but does have a
  // Balance, and must not get glued onto the next real transaction's description.
  function rowHasAnyAmountText(cells: string[]): boolean {
    return [amountCol, debitCol, creditCol, balanceCol].some((col) => isRealAmountText(cellText(cells, col)));
  }

  const startIndex = hasHeader ? 1 : 0;
  const rawRows = table.allRows.slice(startIndex).map((cells, i) => ({ cells, sourceIndex: startIndex + i }));

  let lastDate = '';
  let pendingDescription = '';
  const normalizedRows: { cells: string[]; sourceIndex: number }[] = [];
  for (const { cells, sourceIndex } of rawRows) {
    const ownDate = cellText(cells, dateCol);
    // Captured even for a continuation-only row below — the date is printed on the FIRST physical
    // line of a transaction, which for a wrapped description is often the amount-less fragment
    // that's about to be buffered rather than the row that ends up carrying the amount.
    if (ownDate) lastDate = ownDate;
    if (!rowHasAnyAmountText(cells)) {
      // A bare continuation fragment (wrapped description text, no amount anywhere on the line) —
      // buffer it forward onto the next row that does carry an amount, instead of parsing (and
      // losing) it as its own dateless, amountless "transaction".
      const text = descriptionCols
        .map((c) => cellText(cells, c))
        .filter(Boolean)
        .join(' ');
      if (text) pendingDescription = pendingDescription ? `${pendingDescription} ${text}` : text;
      continue;
    }
    const mergedCells = [...cells];
    if (pendingDescription && descriptionCols.length > 0) {
      const firstDescCol = descriptionCols[0];
      const existing = cellText(cells, firstDescCol);
      mergedCells[firstDescCol] = existing ? `${pendingDescription} ${existing}` : pendingDescription;
    }
    if (dateCol >= 0 && !ownDate && lastDate) mergedCells[dateCol] = lastDate;
    pendingDescription = '';
    normalizedRows.push({ cells: mergedCells, sourceIndex });
  }

  for (const { cells, sourceIndex } of normalizedRows) {
    const dateRaw = dateCol >= 0 ? cells[dateCol] ?? '' : '';
    const date = normalizeDateWithFormat(dateRaw, dateFormat);

    const description = descriptionCols
      .map((c) => cells[c]?.trim())
      .filter((v): v is string => !!v)
      .join(' ');

    let amountCents: number | null;
    if (amountCol >= 0) {
      amountCents = parseAmountCents(cells[amountCol] ?? '');
    } else {
      const debit = debitCol >= 0 ? parseAmountCents(cells[debitCol] ?? '') ?? 0 : 0;
      const credit = creditCol >= 0 ? parseAmountCents(cells[creditCol] ?? '') ?? 0 : 0;
      amountCents = credit !== 0 ? Math.abs(credit) : debit !== 0 ? -Math.abs(debit) : null;
    }

    if (!date || amountCents === null || amountCents === 0) {
      // A statement's own "Opening balance" / "Closing balance" line has nothing in Debit/Credit —
      // that's expected (it isn't a transaction), so it must not be reported as an unparseable row.
      if (isBalanceSummaryLine(description)) continue;
      skipped++;
      const amountRaw =
        amountCol >= 0
          ? cellText(cells, amountCol)
          : [cellText(cells, debitCol), cellText(cells, creditCol)].filter(Boolean).join(' / ');
      // The recognized amount-bearing column(s) came up empty/zero — before giving up, check
      // whether a dollar figure is sitting anywhere else on the line (most often the Description,
      // when a misaligned column shifted the real amount out of its own column but left the text
      // otherwise intact).
      const amountGuessCents =
        amountCents !== null && amountCents !== 0 ? Math.abs(amountCents) : extractAnyAmountGuessCents(cells.join(' '));
      skippedRows.push({
        sourceIndex,
        raw: [dateRaw, description, amountRaw].filter(Boolean).join('  |  '),
        descriptionGuess: description,
        dateGuess: date,
        amountGuessCents,
      });
      continue;
    }
    rows.push({ key: `row-${sourceIndex}`, date, description, amountCents });
  }

  return { rows, skipped, skippedRows };
}

/**
 * Parses pasted or loaded bank-statement text into signed-amount transactions: negative =
 * money out (expense), positive = money in (income/deposit). If the first row looks like a
 * header (recognizes column names such as Date/Description/Debit/Credit/Amount/CAD$/Balance, in
 * any order, and any number of extra unrecognized columns in between — "Balance" is read and
 * then ignored), columns are read by name; otherwise falls back to positional
 * [date, description, amount] or [date, description, debit, credit].
 */
export function parseTransactions(text: string): ParseResult {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = withoutBom
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rows: ParsedTransaction[] = [];
  const skippedRows: SkippedRow[] = [];
  let skipped = 0;
  if (lines.length === 0) return { rows, skipped, skippedRows };

  const headerMap = detectHeader(splitLine(lines[0]));
  const startIndex = headerMap ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    if (cells.length < 2) {
      skipped++;
      skippedRows.push({ sourceIndex: i, raw: lines[i], descriptionGuess: '', dateGuess: null, amountGuessCents: extractAnyAmountGuessCents(lines[i]) });
      continue;
    }

    let dateRaw: string;
    let description: string;
    let amountCents: number | null;

    if (headerMap) {
      dateRaw = headerMap.date !== undefined ? cells[headerMap.date] ?? '' : '';
      description = descriptionFromColumns(cells, headerMap);
      amountCents = amountFromColumns(cells, headerMap);
    } else if (cells.length < 3) {
      skipped++;
      skippedRows.push({ sourceIndex: i, raw: lines[i], descriptionGuess: '', dateGuess: null, amountGuessCents: extractAnyAmountGuessCents(lines[i]) });
      continue;
    } else {
      dateRaw = cells[0];
      if (cells.length === 3) {
        description = cells[1];
        amountCents = parseAmountCents(cells[2]);
      } else if (cells.length === 4) {
        description = cells[1];
        const debit = parseAmountCents(cells[2]) ?? 0;
        const credit = parseAmountCents(cells[3]) ?? 0;
        amountCents = credit !== 0 ? Math.abs(credit) : -Math.abs(debit);
      } else {
        description = cells.slice(1, -1).join(' ');
        amountCents = parseAmountCents(cells[cells.length - 1]);
      }
    }

    const date = normalizeDate(dateRaw);
    if (!date) {
      // Without a recognized header, an unparseable date on the very first row is likely a
      // header we just don't recognize — skip it silently rather than counting it as an error.
      if (!headerMap && i === 0) continue;
      skipped++;
      skippedRows.push({
        sourceIndex: i,
        raw: lines[i],
        descriptionGuess: description,
        dateGuess: null,
        amountGuessCents: amountCents !== null && amountCents !== 0 ? Math.abs(amountCents) : extractAnyAmountGuessCents(lines[i]),
      });
      continue;
    }
    if (amountCents === null || amountCents === 0) {
      // A statement's own "Opening balance" / "Closing balance" line has nothing in Debit/Credit —
      // that's expected (it isn't a transaction), so it must not be reported as an unparseable row.
      if (isBalanceSummaryLine(description)) continue;
      skipped++;
      skippedRows.push({ sourceIndex: i, raw: lines[i], descriptionGuess: description, dateGuess: date, amountGuessCents: extractAnyAmountGuessCents(lines[i]) });
      continue;
    }

    rows.push({ key: `row-${i}`, date, description, amountCents });
  }

  return { rows, skipped, skippedRows };
}
