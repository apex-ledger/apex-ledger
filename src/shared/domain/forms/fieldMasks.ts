/**
 * What a field may contain, applied as the person types — so a year can never become 20226, a
 * postal code never grows past A1A 1A1, and a SIN is nine digits before anything checks its
 * checksum. Each mask returns the text the box should show after the keystroke: digits and
 * letters kept, everything else dropped, capped at the field's true length, and spaced the way
 * the document prints it.
 */

export const YEAR_MIN = 1900;
export const YEAR_MAX = 2100;
export const DATE_MIN = `${YEAR_MIN}-01-01`;
export const DATE_MAX = `${YEAR_MAX}-12-31`;

/** Four digits at most. */
export function maskYear(text: string): string {
  return text.replace(/\D/g, '').slice(0, 4);
}

/** A typed year as a number within the range the app keeps books for, or null while incomplete. */
export function parseYear(text: string): number | null {
  const digits = maskYear(text);
  if (digits.length !== 4) return null;
  const year = Number(digits);
  return year >= YEAR_MIN && year <= YEAR_MAX ? year : null;
}

/** Canadian postal code, upper-case, "A1A 1A1": six characters with the space put in for you. */
export function maskCanadianPostalCode(text: string): string {
  const raw = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return raw.length > 3 ? `${raw.slice(0, 3)} ${raw.slice(3)}` : raw;
}

/** Nine digits shown as 123 456 789. */
export function maskSin(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 9);
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

/** CRA business number: nine digits, then the program identifier and reference, "123456789 RT0001". */
export function maskBusinessNumber(text: string): string {
  const raw = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digits = raw.slice(0, 9).replace(/\D/g, '');
  if (digits.length < 9) return digits;
  const program = raw.slice(9, 11).replace(/[^A-Z]/g, '');
  const reference = raw.slice(11, 15).replace(/\D/g, '');
  return `${digits}${program || reference ? ' ' : ''}${program}${reference}`;
}

/** North American phone number, ten digits shown as (416) 555-0199; a leading 1 is dropped. */
export function maskPhone(text: string): string {
  let digits = text.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** An ISO date with its year forced to four digits inside the range — the native date control
 * happily accepts a five-digit year, which is how 20226 gets into a ledger. */
export function clampIsoDate(iso: string): string {
  const match = /^(\d+)-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso;
  let year = Number(match[1].slice(0, 4));
  if (Number.isNaN(year)) return iso;
  year = Math.min(YEAR_MAX, Math.max(YEAR_MIN, year));
  return `${String(year).padStart(4, '0')}-${match[2]}-${match[3]}`;
}

/** Same for a "YYYY-MM" month value. */
export function clampIsoMonth(value: string): string {
  const match = /^(\d+)-(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const year = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Number(match[1].slice(0, 4))));
  return `${String(year).padStart(4, '0')}-${match[2]}`;
}
