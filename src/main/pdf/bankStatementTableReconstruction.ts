export interface PositionedItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

// Two items are considered to be on the same visual row if their baselines are within this many
// points of each other — accounts for the small sub-pixel jitter real PDF generators produce
// even for text that's visually on one line.
const ROW_Y_TOLERANCE = 2.5;

// Header words that mark a column as right-aligned numeric (amounts) rather than left-aligned
// text (Date/Description) — real Canadian bank statements (RBC, TD, Scotiabank, BMO) all use one
// of these per amount column, confirmed against an actual RBC statement while building this.
const AMOUNT_HEADER_KEYWORDS = ['debit', 'credit', 'withdrawal', 'deposit', 'balance', 'amount', 'cheques', '$'];
const HEADER_KEYWORDS = ['date', 'description', 'transaction', 'details', ...AMOUNT_HEADER_KEYWORDS];

const NUMERIC_TOKEN = /^-?\$?\(?[\d,]+\.\d{2}\)?$/;

export function isHeaderRow(row: PositionedItem[]): boolean {
  const hasDate = row.some((i) => i.str.trim().toLowerCase() === 'date');
  const hasOther = row.some((i) => {
    const s = i.str.trim().toLowerCase();
    return HEADER_KEYWORDS.some((k) => s.includes(k)) && s !== 'date';
  });
  return hasDate && hasOther;
}

/** Same test as isHeaderRow, applied to an already-reconstructed tab-delimited text line rather
 * than raw positioned items — used to find the transaction table's header line within the final
 * page-joined text, after row/column reconstruction has already happened. */
function isHeaderLine(line: string): boolean {
  const cells = line.split('\t').map((c) => c.trim().toLowerCase());
  const hasDate = cells.some((c) => c === 'date');
  const hasOther = cells.some((c) => c !== 'date' && HEADER_KEYWORDS.some((k) => c.includes(k)));
  return hasDate && hasOther;
}

function isAmountHeaderCell(str: string): boolean {
  const s = str.trim().toLowerCase();
  return AMOUNT_HEADER_KEYWORDS.some((k) => s.includes(k));
}

interface ColumnAnchor {
  /** Right edge (x + width) for a right-aligned amount column, left edge (x) for a left-aligned
   * text column — matches how real statements actually lay out each column type, confirmed
   * against a real statement: amounts of different digit-lengths only share a consistent x on
   * their right edge, never their left. */
  anchorX: number;
}

export interface ColumnLayout {
  anchors: ColumnAnchor[];
  boundaries: number[];
  /** The header row's own cell text, in the same left-to-right column order as `anchors` —
   * printed directly for the header line itself rather than re-run through columnIndexFor(),
   * since a header label is wide left-aligned text sitting inside a column whose boundary was
   * computed from its data's right-aligned numbers, and re-bucketing it by its own left edge can
   * land it one column over from the RIGHT-edge-derived boundary its neighbor's header used
   * (confirmed against a real statement: "Deposits & Credits ($)"'s left edge starts before the
   * Debit/Credit boundary that the two headers' own right edges define). */
  headerCells: string[];
}

/** Builds column boundaries from a detected header row: one anchor per header cell (right edge
 * for an amount-like header, left edge otherwise), sorted left to right, with the midpoint
 * between each consecutive pair as that boundary. Returns null if the row doesn't look like a
 * real header (needs at least 2 cells to define a boundary). */
export function buildColumnAnchors(headerRow: PositionedItem[]): ColumnLayout | null {
  if (headerRow.length < 2) return null;
  const sorted = [...headerRow].sort((a, b) => {
    const ax = isAmountHeaderCell(a.str) ? a.x + a.width : a.x;
    const bx = isAmountHeaderCell(b.str) ? b.x + b.width : b.x;
    return ax - bx;
  });
  const anchors = sorted.map((item) => ({ anchorX: isAmountHeaderCell(item.str) ? item.x + item.width : item.x }));
  const boundaries = anchors.slice(0, -1).map((a, i) => (a.anchorX + anchors[i + 1].anchorX) / 2);
  const headerCells = sorted.map((item) => item.str.trim());
  return { anchors, boundaries, headerCells };
}

/** Places a data-row item into the column whose anchor it's closest to — using the item's own
 * right edge if it looks like a number (so "1.50" and "8,663.33" both land in the same amount
 * column despite their very different left edges) or its left edge otherwise (so Description text
 * of any length still starts reading from the same column). */
export function columnIndexFor(item: PositionedItem, boundaries: number[]): number {
  const numeric = NUMERIC_TOKEN.test(item.str.trim());
  const point = numeric ? item.x + item.width : item.x;
  for (let i = 0; i < boundaries.length; i++) {
    if (point < boundaries[i]) return i;
  }
  return boundaries.length;
}

export function groupIntoRows(items: PositionedItem[]): PositionedItem[][] {
  // pdfjs y-coordinates increase upward (PDF's native coordinate space) — sort tallest (topmost)
  // first so rows come out in normal reading order, top to bottom.
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PositionedItem[][] = [];
  let current: PositionedItem[] = [];
  let currentY: number | null = null;
  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) <= ROW_Y_TOLERANCE) {
      current.push(item);
      currentY = currentY ?? item.y;
    } else {
      rows.push(current);
      current = [item];
      currentY = item.y;
    }
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

/** Sequential gap-based fallback for a page with no recognizable table header (a cover page, an
 * account summary) — good enough since those lines aren't transaction data anyway and just need
 * to not crash or corrupt the pages that do have a real table. */
const COLUMN_GAP_THRESHOLD = 12;
function rowToTabbedLine(row: PositionedItem[]): string {
  const sorted = [...row].sort((a, b) => a.x - b.x);
  let line = '';
  let prevEndX: number | null = null;
  for (const item of sorted) {
    if (prevEndX !== null) line += item.x - prevEndX > COLUMN_GAP_THRESHOLD ? '\t' : ' ';
    line += item.str.trim();
    prevEndX = item.x + item.width;
  }
  return line.trim();
}

/**
 * Reconstructs one page's table structure from its text layer's character positions — pdfjs-
 * dist's getTextContent() returns every text run with its own x/y position but no notion of "row"
 * or "column". A naive left-to-right join breaks the moment any row has an empty cell (no credit
 * that day, a running balance only printed once per group of same-day transactions — both are the
 * normal case on a real statement, confirmed against an actual RBC one while building this),
 * since the next populated cell silently shifts into the missing one's position. The page's header
 * row (Date/Description/Debit/Credit/Balance or equivalent) is used instead to fix real column
 * boundaries — amount columns anchored on their right edge (numbers of different lengths are
 * right-aligned, never left-aligned, within a column), text columns on their left — and every data
 * item on the page is bucketed into its actual column by position, leaving any column with nothing
 * in it as a genuinely empty cell rather than shifting its neighbor over. Falls back to sequential
 * gap-based joining when no header is found on the page (a cover/summary page). Returns one
 * tab-delimited line per row, the same shape as a pasted spreadsheet row.
 */
export function reconstructPageLines(items: PositionedItem[]): string[] {
  const pageRows = groupIntoRows(items);
  const headerRow = pageRows.find(isHeaderRow);
  const columns = headerRow ? buildColumnAnchors(headerRow) : null;

  const lines: string[] = [];
  for (const row of pageRows) {
    if (columns) {
      if (row === headerRow) {
        lines.push(columns.headerCells.join('\t'));
        continue;
      }
      const cells = new Array(columns.anchors.length).fill('');
      for (const item of row) {
        const col = columnIndexFor(item, columns.boundaries);
        const text = item.str.trim();
        // Some statements (confirmed on a real RBC one, on the Date cell of a page-continuation
        // row) fake bold by drawing the exact same text twice at the exact same position rather
        // than using a bold font — appending it a second time turned "08 Jul" into "08 Jul 08
        // Jul", which then fails the day+month date regex below and falls through to JS's generic
        // Date parser, which misreads the second "08" as a 2-digit year (2008 instead of 2024).
        // Verbatim-identical text landing in a cell that already holds exactly that text is never
        // genuine additional content, so the repeat is dropped rather than concatenated.
        if (cells[col] === text) continue;
        cells[col] = cells[col] ? `${cells[col]} ${text}` : text;
      }
      const line = cells.join('\t').replace(/\t+$/, '');
      if (line.trim()) lines.push(line);
    } else {
      const line = rowToTabbedLine(row);
      if (line) lines.push(line);
    }
  }
  return lines;
}

const OPENING_BALANCE_KEYWORDS = ['opening balance', 'balance forward', 'previous balance', 'balance brought forward'];
const CLOSING_BALANCE_KEYWORDS = ['closing balance', 'new balance', 'ending balance', 'balance carried forward'];
const AMOUNT_IN_LINE = /-?\$?\(?[\d,]+\.\d{2}\)?/g;

/** Pulls the last dollar-amount-looking token out of a line — used for the Opening/Closing
 * balance labels, whose amount always comes at or near the end of the line regardless of how
 * many other numbers (a cheque number, a reference number) might precede it. */
function lastAmountInLine(line: string): number | null {
  const matches = line.match(AMOUNT_IN_LINE);
  if (!matches || matches.length === 0) return null;
  let s = matches[matches.length - 1].trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,]/g, '');
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  const num = Number(s);
  if (Number.isNaN(num)) return null;
  const cents = Math.round(num * 100);
  return negative ? -cents : cents;
}

/** Cuts off everything after the statement's own final Closing Balance line — RBC (and others)
 * append pages after the real transaction table ends: cancelled-cheque image captions ("Serial #:
 * 1042  Amount: $8,663.33"), fee summaries, page footers. None of that is transaction data, and
 * the cheque-serial lines in particular look enough like a transaction row (a number, then a
 * dollar amount) to otherwise get picked up as one. "Closing balance" is searched for its LAST
 * occurrence, not first — it also appears once earlier in the statement's own summary section
 * (e.g. "Closing balance on April 1, 2025 = $17,971.41" printed before the transaction table even
 * starts), so cutting at the first match would discard the real table entirely. Returns all lines
 * unchanged if no closing-balance line is found (nothing to safely cut). */
/** Cuts off everything BEFORE the transaction table's own header line — a real statement PDF opens
 * with a page or more of letterhead, mailing address, and an "Account Summary" section (own
 * Opening/Closing balance mentions, deposit/cheque totals) before the actual Date/Description/
 * Debit/Credit/Balance table even starts. None of that is column-aligned data — reconstructPageLines
 * still runs every item on the page through the same column-anchor bucketing once a header is found
 * anywhere on that page, so these preamble lines end up as garbled, misaligned pseudo-rows that
 * would otherwise reach the parser as garbage input. Keeps the header line itself (index included)
 * since the mapping screen's "first row is a header" assumption needs it to still be the first
 * line. Returns all lines unchanged if no header line is found (nothing safe to cut). */
export function truncateBeforeHeader(lines: string[]): string[] {
  const index = lines.findIndex(isHeaderLine);
  return index === -1 ? lines : lines.slice(index);
}

/** Drops a leading header line, if present — for combining several statements' already-truncated
 * text into one batch: truncateBeforeHeader left each file's own text starting with its own header
 * line, which is exactly right for a single file (the mapping screen's "first row is a header"
 * reads it), but every file AFTER the first would otherwise plant a second, bogus "header row" in
 * the middle of the combined table, which parseWithMapping has no way to recognize as anything but
 * a garbled data row (it can't parse a date from "Date"). Only the very first file in a batch keeps
 * its header line; every other file has it stripped before joining. */
export function stripLeadingHeaderLine(lines: string[]): string[] {
  return lines.length > 0 && isHeaderLine(lines[0]) ? lines.slice(1) : lines;
}

export function truncateAfterClosingBalance(lines: string[]): string[] {
  let lastIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (CLOSING_BALANCE_KEYWORDS.some((k) => lower.includes(k))) lastIndex = i;
  }
  return lastIndex === -1 ? lines : lines.slice(0, lastIndex + 1);
}

const MONTH_NAMES_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthIndexFromName(name: string): number | null {
  const idx = MONTH_NAMES_SHORT.indexOf(name.toLowerCase().slice(0, 3));
  return idx === -1 ? null : idx;
}

/** Finds a reference (month, year) from the statement's own printed Closing Balance line — e.g.
 * "Closing balance on November 14, 2025" — used to fill in the year on transaction dates, which
 * every major Canadian bank statement prints as day+month only ("15 Oct"), never day+month+year:
 * the year is implied by the statement period, so taken in isolation "15 Oct" is ambiguous — left
 * to JS's own Date parser it silently resolves to an arbitrary placeholder year (year 2001), not
 * today's or the statement's year, corrupting every transaction date on the statement. Uses the
 * CLOSING balance (the statement's most recent date) rather than the opening one as the reference
 * point, since fillInTransactionYears below reasons "is this transaction's month before or at the
 * reference month" relative to it. Returns null if not found — callers leave dates unmodified
 * rather than guessing wrong. */
export function findStatementYear(lines: string[]): { month: number; year: number } | null {
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!CLOSING_BALANCE_KEYWORDS.some((k) => lower.includes(k))) continue;
    const m = line.match(/([A-Za-z]{3,9})\s+\d{1,2},?\s+(\d{4})/);
    if (!m) continue;
    const month = monthIndexFromName(m[1]);
    if (month !== null) return { month, year: Number(m[2]) };
  }
  return null;
}

const DAY_MONTH_ONLY = /^(\d{1,2})\s+([A-Za-z]{3})$/;

/** Rewrites bare "15 Oct"-style date cells (day + short month name, no year) to "15 Oct 2025" using
 * a reference (month, year) recovered from the statement's own Closing Balance line — see
 * findStatementYear. A statement's activity table almost always covers parts of two calendar
 * months (e.g. "October 14 to November 14"): a transaction dated in the reference month gets the
 * reference year; a transaction dated in an earlier month gets the year before it (handles the
 * December → January statement-boundary case correctly too, where the earlier month's year is one
 * less than the reference's). Scans every cell on a line rather than assuming Date is a fixed
 * column index, since column order isn't identical across every bank template; only a cell that is
 * *exactly* a day+month token is rewritten, so this can't misfire on description text that merely
 * mentions a date in passing. No-ops (returns lines unchanged) when no reference was found. */
export function fillInTransactionYears(lines: string[], reference: { month: number; year: number } | null): string[] {
  if (!reference) return lines;
  return lines.map((line) => {
    const cells = line.split('\t');
    let changed = false;
    const filled = cells.map((cell) => {
      const m = cell.match(DAY_MONTH_ONLY);
      if (!m) return cell;
      const month = monthIndexFromName(m[2]);
      if (month === null) return cell;
      const year = month > reference.month ? reference.year - 1 : reference.year;
      changed = true;
      return `${m[1]} ${m[2]} ${year}`;
    });
    return changed ? filled.join('\t') : line;
  });
}

export interface StatementBalances {
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
}

/** Finds the statement's own printed Opening and Closing balance from the reconstructed lines —
 * every major Canadian bank (RBC, TD, Scotiabank, BMO) prints both somewhere in the statement, in
 * words very close to these (confirmed against a real RBC statement, which literally reads
 * "Opening balance on March 3, 2025" / "Closing balance on April 1, 2025"). Searches for the
 * FIRST opening-balance line and the LAST closing-balance line, so a multi-page or multi-file
 * (several months concatenated) batch still reports the earliest opening and latest closing —
 * i.e. the balances for the whole batch, not just one page or file. Used only to offer the
 * reviewer a "does this reconcile" check before posting — never posted itself. */
export function findStatementBalances(lines: string[]): StatementBalances {
  let openingBalanceCents: number | null = null;
  let closingBalanceCents: number | null = null;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (openingBalanceCents === null && OPENING_BALANCE_KEYWORDS.some((k) => lower.includes(k))) {
      const amt = lastAmountInLine(line);
      if (amt !== null) openingBalanceCents = amt;
    }
    if (CLOSING_BALANCE_KEYWORDS.some((k) => lower.includes(k))) {
      const amt = lastAmountInLine(line);
      if (amt !== null) closingBalanceCents = amt;
    }
  }
  return { openingBalanceCents, closingBalanceCents };
}
