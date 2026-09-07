/** The formats a Canadian contact record carries, checked and tidied once, here.
 *
 * Every form used to accept these as free text and save whatever was typed. A SIN with a digit
 * wrong is worse than no SIN — it goes on a T4A and comes back from the CRA. A postal code typed
 * "m5v1j2" prints that way on every invoice. Tidy on the way in, refuse what cannot be right, and
 * say what was expected.
 */

const digits = (value: string) => value.replace(/\D/g, '');

/** Social Insurance Number: nine digits that pass the Luhn check the CRA applies. */
export function isValidSin(value: string): boolean {
  const number = digits(value);
  if (number.length !== 9 || number === '000000000') return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    let digit = Number(number[i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** "123 456 789" — the way it appears on the card and on the slips. */
export function formatSin(value: string): string {
  const number = digits(value);
  return number.length === 9 ? `${number.slice(0, 3)} ${number.slice(3, 6)} ${number.slice(6)}` : value.trim();
}

/** A CRA Business Number: the nine-digit registration, with or without a program account
 * (RT0001, RP0001…) after it. */
export function isValidBusinessNumber(value: string): boolean {
  return /^\d{9}(\s?[A-Z]{2}\s?\d{4})?$/i.test(value.trim().replace(/\s+/g, ' '));
}

export function formatBusinessNumber(value: string): string {
  const compact = value.trim().toUpperCase().replace(/\s+/g, '');
  const match = /^(\d{9})([A-Z]{2}\d{4})?$/.exec(compact);
  if (!match) return value.trim();
  return match[2] ? `${match[1]} ${match[2]}` : match[1];
}

/** "M5V 1J2" — letter-digit-letter, space, digit-letter-digit; D, F, I, O, Q and U never appear. */
export function isValidCanadianPostalCode(value: string): boolean {
  return /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i.test(value.trim());
}

export function formatCanadianPostalCode(value: string): string {
  const compact = value.toUpperCase().replace(/\s+/g, '');
  return compact.length === 6 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : value.trim().toUpperCase();
}

/** A ten-digit North American number becomes "(416) 555-0100"; anything else — an extension, an
 * overseas number — is left exactly as typed, because guessing at it would be wrong. */
export function formatPhone(value: string): string {
  const number = digits(value);
  const national = number.length === 11 && number.startsWith('1') ? number.slice(1) : number;
  if (national.length !== 10 || /\D/.test(national) || /(ext|x)\s*\d/i.test(value)) return value.trim();
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

/** Enough of an email check to catch a typo, not a standards audit: one @, something either
 * side, a dot in the domain. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
