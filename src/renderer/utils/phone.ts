function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Assumes a bare 10-digit number is North American (no country code entered) — true for the
 * vast majority of Canadian small-business/client phone numbers in this app. */
function withCountryCode(digits: string): string {
  return digits.length === 10 ? `1${digits}` : digits;
}

export function toTelUrl(phone: string): string {
  return `tel:+${withCountryCode(digitsOnly(phone))}`;
}

export function toWhatsAppUrl(phone: string, message?: string): string {
  const base = `https://wa.me/${withCountryCode(digitsOnly(phone))}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
