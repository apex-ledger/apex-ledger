export interface StructuredAddress {
  streetAddress: string;
  unit: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export const CANADIAN_PROVINCES = ['ON', 'BC', 'AB', 'SK', 'MB', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU'] as const;

/** "Toronto, ON M5V 1J2", "Toronto, ON" (no postal code yet), or "ON M5V 1J2" (no city). */
const LOCALITY_PATTERN = /^(?:(.*?),\s*)?([A-Za-z]{2})(?:\s+([A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d|[A-Za-z0-9][A-Za-z0-9 -]{2,9}))?$/;
const POSTAL_CODE_PATTERN = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

export function emptyStructuredAddress(): StructuredAddress {
  return { streetAddress: '', unit: '', city: '', province: '', postalCode: '', country: 'Canada' };
}

function isLocalityLine(line: string): boolean {
  const match = LOCALITY_PATTERN.exec(line);
  if (!match) return false;
  // "Suite 400, ON" would match the shape; insist on a real province code, and on a postal code
  // when there is no city, so a street line is never mistaken for the locality line.
  const province = match[2].toUpperCase();
  if (!PROVINCE_CODES.has(province)) return false;
  if (!match[1] && !(match[3] && POSTAL_CODE_PATTERN.test(match[3]))) return false;
  // A foreign postcode still carries digits; "ON Street" is a street, not a province and postcode.
  if (match[3] && !POSTAL_CODE_PATTERN.test(match[3]) && !/\d/.test(match[3])) return false;
  return true;
}

function readLocality(line: string, result: StructuredAddress): void {
  const locality = LOCALITY_PATTERN.exec(line);
  result.city = locality?.[1]?.trim() ?? '';
  result.province = locality?.[2]?.toUpperCase() ?? '';
  result.postalCode = locality?.[3]?.trim().toUpperCase() ?? '';
}

const PROVINCE_CODES: ReadonlySet<string> = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']);

/**
 * Converts the old free-form address into editable fields without losing it. Addresses saved by
 * this app use normal mailing-label lines and can be split reliably — including one with no
 * postal code yet ("Toronto, ON") or no street line, which an earlier version dropped into the
 * street field, so a customer's city and province looked empty every time they were reopened.
 * An older one-line address is split at its commas when it ends the usual way ("…, Toronto, ON
 * M5V 1J2"), and otherwise kept whole in Street address, so merely opening and saving an old
 * customer never drops data.
 */
export function parseStructuredAddress(value: string | null | undefined): StructuredAddress {
  const result = emptyStructuredAddress();
  const lines = (value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return result;

  if (lines.length === 1) {
    // One line: "123 King St W, Suite 4, Toronto, ON M5V 1J2, Canada".
    const parts = lines[0].split(',').map((part) => part.trim()).filter(Boolean);
    const localityIndex = parts.findIndex((part, index) => index >= 1 && /^[A-Za-z]{2}\s+\S/.test(part) && isLocalityLine(`${parts[index - 1]}, ${part}`));
    if (localityIndex >= 1) {
      readLocality(`${parts[localityIndex - 1]}, ${parts[localityIndex]}`, result);
      const before = parts.slice(0, localityIndex - 1);
      result.streetAddress = before[0] ?? '';
      result.unit = before.slice(1).join(', ');
      result.country = parts.slice(localityIndex + 1).join(', ') || 'Canada';
      return result;
    }
    result.streetAddress = lines[0];
    return result;
  }

  const localityIndex = lines.findIndex((line) => isLocalityLine(line));
  if (localityIndex < 0) {
    result.streetAddress = lines.join(', ');
    return result;
  }

  result.streetAddress = lines[0] && localityIndex > 0 ? lines[0] : '';
  result.unit = lines.slice(1, localityIndex).join(', ');
  readLocality(lines[localityIndex], result);
  result.country = lines.slice(localityIndex + 1).join(', ') || 'Canada';
  return result;
}

/** Produces a standard mailing-label address while treating Country alone as an empty address. */
export function formatStructuredAddress(address: StructuredAddress): string {
  const streetAddress = address.streetAddress.trim();
  const unit = address.unit.trim();
  const city = address.city.trim();
  const province = address.province.trim().toUpperCase();
  const postalCode = address.postalCode.trim().toUpperCase();
  const country = address.country.trim();
  if (![streetAddress, unit, city, province, postalCode].some(Boolean)) return '';

  const localityTail = [province, postalCode].filter(Boolean).join(' ');
  const locality = [city, localityTail].filter(Boolean).join(', ');
  return [streetAddress, unit, locality, country].filter(Boolean).join('\n');
}
