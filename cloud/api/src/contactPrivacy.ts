import { createHmac } from 'node:crypto';

export class ContactPrivacyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContactPrivacyError';
  }
}

export function normalizeCanadianSin(value: string): string {
  const digits = value.replace(/[ -]/g, '');
  if (!/^\d{9}$/.test(digits) || !passesLuhn(digits)) {
    throw new ContactPrivacyError('SIN must be a valid nine-digit Canadian SIN');
  }
  return digits;
}

export function hashCanadianSin(secret: string, value: string): { lookupHash: string; lastFour: string } {
  if (secret.length < 32) throw new ContactPrivacyError('SIN lookup secret is not configured securely');
  const normalized = normalizeCanadianSin(value);
  return {
    lookupHash: createHmac('sha256', secret).update(`northledger-contact-sin:v1:${normalized}`).digest('hex'),
    lastFour: normalized.slice(-4),
  };
}

export function looksLikeSinSearch(value: string): boolean {
  return /^\s*\d{3}[ -]?\d{3}[ -]?\d{3}\s*$/.test(value);
}

function passesLuhn(value: string): boolean {
  let total = 0;
  for (const [index, character] of [...value].entries()) {
    let digit = Number(character);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    total += digit;
  }
  return total % 10 === 0;
}
