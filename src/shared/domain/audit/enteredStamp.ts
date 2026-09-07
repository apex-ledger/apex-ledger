/**
 * The "Entered" stamp every sheet shows beside its Date column: when the record was keyed into
 * the books. The transaction date says when something happened; the Entered time says when it
 * was put in, so a September entry keyed in October is visible as such on every list and report,
 * not only in the audit trail. Deliberately the time only — no person's name — because sheets are
 * exported to Excel and handed to clients, and who keyed what is a firm-internal matter kept to
 * the General Ledger's User column and the audit trail.
 *
 * Timestamps in the company file are SQLite's CURRENT_TIMESTAMP ("YYYY-MM-DD HH:MM:SS", UTC).
 * They are shown in the reader's local time.
 */

/** Reads a stored timestamp — SQLite UTC ("2026-09-03 21:18:05") or ISO — as a Date, or null. */
export function parseStoredTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const sqlite = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(trimmed);
  if (sqlite) {
    const [, y, mo, d, h, mi, s] = sqlite;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? '0')));
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "2026-09-03 9:18 p.m." in the given (or the reader's) time zone; blank when nothing stored. */
export function formatEnteredAt(value: string | null | undefined, timeZone?: string): string {
  const date = parseStoredTimestamp(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const dayPeriod = get('dayPeriod').toLowerCase().replace(/\./g, '');
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} ${dayPeriod === 'am' ? 'a.m.' : 'p.m.'}`;
}

/** The column heading used on every sheet, so the rule reads the same everywhere. */
export const ENTERED_COLUMN_LABEL = 'Entered';
