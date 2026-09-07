/**
 * The calendar date where the person is sitting, as YYYY-MM-DD. Every "today" default in the
 * app — bill date, invoice date, payment date, report "as of" — comes through here.
 *
 * Why not `new Date().toISOString().slice(0, 10)`: that is the UTC date. In Toronto after 8 p.m.
 * (7 p.m. in winter) UTC has already rolled over, so a bill keyed in the evening was dated
 * tomorrow. Using the local calendar fields avoids that.
 */
export function localIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
