/**
 * Report-shaped spreadsheets — what QuickBooks Online, Xero and most bookkeeping tools actually
 * export — don't start with the header row. QuickBooks Online's Excel/CSV exports carry the company
 * name, the report name and the period on the first rows, then a blank row, then the header (and the
 * General Ledger's header even starts with an empty cell, because that column holds the account
 * section names). These helpers find the real header and read the dates such files contain.
 */

function isBlank(cell: string | undefined): boolean {
  return cell === undefined || cell.trim() === '';
}

function looksNumeric(cell: string): boolean {
  return /^[-$(]*[\d,]+(\.\d+)?\)?$/.test(cell.trim());
}

/** Index of the header row: the first row with at least three filled cells that are all text —
 * title rows have one filled cell, blank spacer rows none, data rows carry numbers. Falls back to
 * row 0 so a plain CSV that starts with its header behaves exactly as before. */
export function findHeaderRowIndex(rows: string[][]): number {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const filled = rows[r].filter((cell) => !isBlank(cell));
    if (filled.length >= 3 && filled.every((cell) => !looksNumeric(cell))) return r;
  }
  return 0;
}

/** Rows below the header, with the header itself. */
export function splitHeaderAndRows(rows: string[][]): { header: string[]; headerIndex: number; body: string[][] } {
  const headerIndex = findHeaderRowIndex(rows);
  return { header: rows[headerIndex] ?? [], headerIndex, body: rows.slice(headerIndex + 1) };
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function ymd(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Excel stores dates as days since 1899-12-30 (the 1900 date system); a spreadsheet read without
 * its number formats hands those serials over as plain numbers. */
export function excelSerialToIsoDate(serial: number, date1904 = false): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.floor(serial) * 86_400_000);
  return ymd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * Reads the date formats bookkeeping exports use into YYYY-MM-DD:
 *   2025-10-03, 2025-10-03 00:00:00, 2025-10-03T00:00:00
 *   10/03/2025, 10-03-2025, 10.03.2025 (month first; day first when the first number can't be a month)
 *   Oct 3, 2025 / October 3, 2025 / 3 Oct 2025 / 03-Oct-2025
 *   45933 (an Excel serial)
 * Returns null for anything else — the caller decides whether that's a skipped row or a warning.
 */
export function parseImportDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(trimmed);
  if (iso) return ymd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(trimmed);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const y = numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    return a > 12 ? ymd(y, b, a) : ymd(y, a, b);
  }
  const monthFirst = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(trimmed);
  if (monthFirst) {
    const m = MONTHS[monthFirst[1].slice(0, 3).toLowerCase()];
    return m ? ymd(Number(monthFirst[3]), m, Number(monthFirst[2])) : null;
  }
  const dayFirst = /^(\d{1,2})[\s-]([A-Za-z]{3,9})\.?[\s,-]+(\d{4})$/.exec(trimmed);
  if (dayFirst) {
    const m = MONTHS[dayFirst[2].slice(0, 3).toLowerCase()];
    return m ? ymd(Number(dayFirst[3]), m, Number(dayFirst[1])) : null;
  }
  if (/^\d{5}(\.\d+)?$/.test(trimmed)) return excelSerialToIsoDate(Number(trimmed));
  return null;
}

/** "1,130.00", "$1,130.00", "(113.00)", "-$117.00" → cents. Blank or unreadable → 0. */
export function parseImportMoney(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const parenthesised = /^\((.*)\)$/.exec(trimmed);
  const cleaned = (parenthesised ? `-${parenthesised[1]}` : trimmed).replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
