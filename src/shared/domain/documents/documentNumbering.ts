/** The next number for an invoice, sales receipt, bill or estimate.
 *
 * Two shapes are understood:
 *   PREFIX-1001        the plain running number this app started with
 *   PREFIX-2026-0001   year-first, restarting each year
 *
 * The year-first shape is what new files get, because it sorts in date order: INV-2026-0007 comes
 * after INV-2025-0900 in any list sorted by number, where a plain running number tells you nothing
 * about when the document was raised.
 *
 * A file that already uses the plain shape KEEPS it. Switching format mid-file would leave a
 * company with two numbering schemes and no explanation, and invoice numbers are quoted on real
 * paperwork that has already gone out.
 *
 * The same goes for a file numbered some other way entirely — INV0025, 2026-017, A-100: the next
 * number continues whatever pattern the file is using (trailing digits +1, zero padding kept),
 * because a person who has been numbering by hand expects the app to carry on from where they
 * are, not to restart them somewhere else.
 */

export type NumberingScheme = 'running' | 'yearly';

export interface ParsedNumber {
  scheme: NumberingScheme;
  year: number | null;
  sequence: number;
  /** How many digits the sequence was written with (INV-0025 → 4), so padding is kept. */
  width: number;
}

/** Where a brand-new file starts. 1001 rather than 1 because a first invoice numbered INV-1 tells
 * every customer they are the first, which few businesses want to advertise. */
const FIRST_SEQUENCE = 1001;
const FIRST_YEARLY_SEQUENCE = 1;
const YEARLY_PAD = 4;

export function parseDocumentNumber(prefix: string, value: string): ParsedNumber | null {
  const trimmed = value.trim();
  const yearly = new RegExp(`^${prefix}-(\\d{4})-(\\d+)$`, 'i').exec(trimmed);
  if (yearly) return { scheme: 'yearly', year: Number(yearly[1]), sequence: Number(yearly[2]), width: yearly[2].length };

  const running = new RegExp(`^${prefix}-(\\d+)$`, 'i').exec(trimmed);
  if (running) return { scheme: 'running', year: null, sequence: Number(running[1]), width: running[1].length };

  return null;
}

export function formatDocumentNumber(prefix: string, parsed: ParsedNumber): string {
  if (parsed.scheme === 'yearly' && parsed.year !== null) {
    return `${prefix}-${parsed.year}-${String(parsed.sequence).padStart(Math.max(YEARLY_PAD, parsed.width), '0')}`;
  }
  return `${prefix}-${String(parsed.sequence).padStart(parsed.width, '0')}`;
}

/** Which scheme a file is already using.
 *
 * Decided by what is most common among the numbers already there, not by the first one found: a
 * single hand-typed oddity should not switch the whole file over. */
export function schemeInUse(prefix: string, existing: string[]): NumberingScheme {
  let running = 0;
  let yearly = 0;
  for (const value of existing) {
    const parsed = parseDocumentNumber(prefix, value);
    if (parsed?.scheme === 'running') running += 1;
    if (parsed?.scheme === 'yearly') yearly += 1;
  }
  if (running === 0 && yearly === 0) return 'yearly'; // a new file
  return yearly >= running ? 'yearly' : 'running';
}

/**
 * The next number to offer, given every number already used and the date of the document.
 *
 * Never reuses a number, including one freed by a deletion. Gaps in a numbering sequence are
 * awkward to explain to an auditor; the same number appearing on two different documents is far
 * worse, and reusing is how that happens.
 */
export function nextDocumentNumber(prefix: string, existing: string[], documentDate: string): string {
  const scheme = schemeInUse(prefix, existing);
  const parsedAll = existing.map((value) => parseDocumentNumber(prefix, value)).filter((p): p is ParsedNumber => p !== null);

  if (parsedAll.length === 0) {
    // Nothing in the app's own shapes — continue whatever the file is using, if it has trailing
    // digits to continue; otherwise (only free-text references) start the app's own numbering.
    const continued = continueSequence(existing);
    if (continued) return continued;
  }

  if (scheme === 'running') {
    const highest = parsedAll.filter((p) => p.scheme === 'running').reduce<ParsedNumber | null>((best, p) => (best === null || p.sequence > best.sequence ? p : best), null);
    if (highest) return formatDocumentNumber(prefix, { scheme: 'running', year: null, sequence: highest.sequence + 1, width: highest.width });
    return formatDocumentNumber(prefix, { scheme: 'running', year: null, sequence: FIRST_SEQUENCE, width: 0 });
  }

  const year = Number(documentDate.slice(0, 4));
  const safeYear = Number.isFinite(year) && year > 1900 ? year : new Date().getUTCFullYear();

  // Counted within the year, so each January starts at 0001 again — that restart is the whole
  // point of the yearly shape.
  const highestThisYear = parsedAll
    .filter((p) => p.scheme === 'yearly' && p.year === safeYear)
    .reduce((max, p) => Math.max(max, p.sequence), FIRST_YEARLY_SEQUENCE - 1);

  return formatDocumentNumber(prefix, { scheme: 'yearly', year: safeYear, sequence: highestThisYear + 1, width: YEARLY_PAD });
}

/** The number after `value` in its own pattern: the trailing run of digits plus one, zero padding
 * kept (A-0099 → A-0100, 2026-017 → 2026-018, 41 → 42). Null when there is nothing to count. */
export function continueReference(value: string): string | null {
  const match = /^(.*?)(\d+)(\s*)$/.exec(value.trim());
  if (!match) return null;
  const [, lead, digits] = match;
  return `${lead}${String(Number(digits) + 1).padStart(digits.length, '0')}`;
}

/** Continues the pattern a file is already using when its numbers are not in one of the app's own
 * shapes. The pattern is the text before the trailing digits; the most common one wins, so one
 * odd reference among many does not change the sequence; then the highest number in it + 1. */
export function continueSequence(existing: string[]): string | null {
  const groups = new Map<string, { lead: string; highest: string; count: number }>();
  for (const value of existing) {
    const match = /^(.*?)(\d+)$/.exec(value.trim());
    if (!match) continue;
    const [, lead, digits] = match;
    const key = lead.toLowerCase();
    const group = groups.get(key);
    if (!group) groups.set(key, { lead, highest: digits, count: 1 });
    else {
      group.count += 1;
      if (Number(digits) > Number(group.highest)) group.highest = digits;
    }
  }
  const best = Array.from(groups.values()).sort((a, b) => b.count - a.count || Number(b.highest) - Number(a.highest))[0];
  if (!best) return null;
  return `${best.lead}${String(Number(best.highest) + 1).padStart(best.highest.length, '0')}`;
}

/** Whether a number is already taken, compared the way the database compares it.
 *
 * Trimmed and case-folded, because "inv-2026-0001" typed by hand is the same document number as
 * "INV-2026-0001" to everyone except a byte comparison. */
export function isNumberTaken(candidate: string, existing: string[]): boolean {
  const needle = candidate.trim().toLowerCase();
  return existing.some((value) => value.trim().toLowerCase() === needle);
}

/** Sorts document numbers the way a human expects — by year, then by sequence, not as text.
 *
 * As plain text, INV-1002 sorts before INV-999, which puts a list of invoices in an order that
 * looks arbitrary. */
export function compareDocumentNumbers(prefix: string, a: string, b: string): number {
  const pa = parseDocumentNumber(prefix, a);
  const pb = parseDocumentNumber(prefix, b);
  if (!pa || !pb) return a.localeCompare(b);
  return (pa.year ?? 0) - (pb.year ?? 0) || pa.sequence - pb.sequence;
}

/**
 * The number a new document is saved under, given the one the form sent.
 *
 * The form suggests its number from the documents it saw when it opened. Another window, another
 * user or a Save & Next in between can take that number first, and the form has no way to know.
 * A clash on a number in the app's own shape is that race, so the next free number is used
 * instead. A clash on a hand-typed reference is a real duplicate and is refused, because bumping
 * it would hide the mistake.
 */
export function resolveNewDocumentNumber(prefix: string, requested: string, existing: string[], documentDate: string, label: string): string {
  const wanted = requested.trim();
  if (!isNumberTaken(wanted, existing)) return wanted;
  if (parseDocumentNumber(prefix, wanted) !== null || continueReference(wanted) !== null) return nextDocumentNumber(prefix, existing, documentDate);
  throw new Error(`${label} ${wanted} is already in use.`);
}
