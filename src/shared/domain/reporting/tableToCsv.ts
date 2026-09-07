/** Turning a report's table into something that opens in Excel.
 *
 * An accountant's whole job is handing reports to somebody — the client, the CRA, the bank. A
 * report that can only be looked at on screen is not finished, and the workaround people reach for
 * is a screenshot, which cannot be checked, totalled, or filed.
 *
 * Kept pure and free of DOM types so the quoting rules can be tested on their own. Getting quoting
 * wrong is not a cosmetic problem: one unescaped comma silently shifts every column after it, and
 * the person reading the file has no way to tell.
 */

/** Escapes one cell for CSV.
 *
 * A field is quoted when it contains a comma, a quote, or a line break — and quotes inside are
 * doubled, which is the escape CSV actually specifies rather than a backslash. A leading zero is
 * preserved by quoting too: postal codes and account codes lose their leading digits otherwise,
 * because a spreadsheet reads them as numbers. */
export function escapeCsvCell(value: string): string {
  const needsQuoting = /[",\n\r]/.test(value) || /^0\d/.test(value);
  if (!needsQuoting) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function rowsToCsv(rows: string[][]): string {
  // CRLF, because that is what Excel expects on Windows and what the CSV specification says.
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

/** Tab-separated instead, for pasting straight into a spreadsheet cell.
 *
 * Pasting CSV into Excel puts the whole row in one cell; pasting TSV spreads it across columns.
 * Since "copy" almost always means "paste into a spreadsheet", the clipboard gets tabs. */
export function rowsToTsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => cell.replace(/[\t\r\n]+/g, ' ')).join('\t'))
    .join('\r\n');
}

/** Strips the formatting a screen adds but a spreadsheet should not receive.
 *
 * A money cell reads "$1,234.56" on screen. Left as-is it arrives in Excel as text, cannot be
 * summed, and quietly breaks any check the reader tries to run on it. The currency symbol and
 * thousands separators come off; a bracketed negative becomes a real one. */
export function normalizeCellForExport(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  // Accounting convention writes a negative in brackets. A spreadsheet wants a minus sign.
  const bracketed = /^\((.*)\)$/.exec(trimmed);
  const unwrapped = bracketed ? `-${bracketed[1]}` : trimmed;

  // Only touch things that are unambiguously money: a currency symbol, or digits with grouping.
  if (!/^-?\$?[\d,]+(\.\d+)?$/.test(unwrapped)) return trimmed;
  return unwrapped.replace(/[$,]/g, '');
}
