/**
 * Turns the rows already on a report into something chartable.
 *
 * Pure, and separate from the drawing, because everything that can quietly go wrong here is
 * arithmetic rather than pixels: a total row counted as though it were a category (which on a pie
 * makes every real slice half its true size), an accounting negative written (123.45) read as
 * positive, a currency column read as text because of its dollar sign.
 */

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartSeries {
  /** The column the values came from, so the chart can say what it is showing. */
  valueColumnLabel: string;
  points: ChartPoint[];
  /** Points beyond the cut, folded into one — a pie of sixty accounts is unreadable. */
  otherCount: number;
}

/** A row that summarises the rows above it rather than standing beside them. Charting these
 * alongside their own components double-counts: a pie whose "Total" slice equals everything else
 * put together shows every real slice at half its share. */
const SUMMARY_ROW = /^(total|totals|subtotal|sub-total|closing balance|opening balance|net|grand total|balance)\b/i;

/** Accounting numbers as they appear on screen: $1,234.56 · (500.00) for a credit · 12.5% · −40.
 * Returns null for anything that is not a figure, which is how a label column is recognised. */
export function parseReportNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const parenthesised = /^\(.+\)$/.test(trimmed);
  let core = parenthesised ? trimmed.slice(1, -1).trim() : trimmed;
  let negative = parenthesised;
  if (/^[-−]/.test(core)) {
    negative = true;
    core = core.slice(1).trim();
  }
  // Only a LEADING currency symbol and a TRAILING percent are stripped, and only thousands commas
  // come out of the middle. Stripping hyphens wherever they fell turned 2026-01-01 into 20260101,
  // which made a date column look numeric and charted it as if the dates were money.
  core = core.replace(/^\$/, '').replace(/%$/, '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(core)) return null;

  const value = Number(core);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** Which columns hold figures, judged over the body rows rather than the header — a column is
 * numeric when most of its filled cells parse as numbers, so one stray "n/a" does not disqualify it. */
export function numericColumns(rows: string[][]): number[] {
  const [header, ...body] = rows;
  if (!header || body.length === 0) return [];
  const columnCount = Math.max(...rows.map((row) => row.length));
  const numeric: number[] = [];
  for (let column = 0; column < columnCount; column += 1) {
    const filled = body.map((row) => row[column] ?? '').filter((cell) => cell.trim() !== '');
    if (filled.length === 0) continue;
    const parsed = filled.filter((cell) => parseReportNumber(cell) !== null).length;
    if (parsed / filled.length >= 0.6) numeric.push(column);
  }
  return numeric;
}

/** The column to label slices and bars by: the first column that is not one of the figure columns
 * and actually has text — usually the account or customer name. */
export function labelColumn(rows: string[][], numeric: number[]): number {
  const [, ...body] = rows;
  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  for (let column = 0; column < columnCount; column += 1) {
    if (numeric.includes(column)) continue;
    if (body.some((row) => (row[column] ?? '').trim() !== '')) return column;
  }
  return 0;
}

export function buildChartSeries(rows: string[][], valueColumn: number, { limit = 12 }: { limit?: number } = {}): ChartSeries | null {
  const [header, ...body] = rows;
  if (!header || body.length === 0) return null;
  const numeric = numericColumns(rows);
  if (numeric.length === 0) return null;
  const column = numeric.includes(valueColumn) ? valueColumn : numeric[0];
  const labels = labelColumn(rows, numeric);

  const points: ChartPoint[] = [];
  for (const row of body) {
    const label = (row[labels] ?? '').trim();
    if (!label || SUMMARY_ROW.test(label)) continue;
    const value = parseReportNumber(row[column] ?? '');
    if (value === null || value === 0) continue;
    points.push({ label, value });
  }
  if (points.length === 0) return null;

  // Biggest first: a chart is read for what dominates, and the tail is what gets folded away.
  const sorted = [...points].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const kept = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  if (rest.length > 0) kept.push({ label: `Other (${rest.length})`, value: rest.reduce((sum, p) => sum + p.value, 0) });

  return { valueColumnLabel: (header[column] ?? `Column ${column + 1}`).trim() || `Column ${column + 1}`, points: kept, otherCount: rest.length };
}
