/**
 * The SIN as it appears on a slip that leaves by email: only the last three digits.
 *
 * Email is not a secure channel, and a full SIN is the one number an identity thief needs most.
 * The employee already knows their own SIN; what they need from the emailed copy is the boxes.
 * The slip filed with the CRA keeps the full number. Anything that is not a nine-digit SIN (blank,
 * or a business number used instead) is left as it was.
 */
export function maskSinForEmail(sin: string | null): string | null {
  if (!sin) return sin;
  const digits = sin.replace(/\D/g, '');
  if (digits.length !== 9) return sin;
  return `*** *** ${digits.slice(6)}`;
}
