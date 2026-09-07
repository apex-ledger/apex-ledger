import { describe, expect, it } from 'vitest';
import {
  formatBusinessNumber, formatCanadianPostalCode, formatPhone, formatSin, isValidBusinessNumber, isValidCanadianPostalCode, isValidEmail, isValidSin,
} from './identifiers';

describe('SIN', () => {
  it('accepts a number that passes the Luhn check, however it is spaced', () => {
    expect(isValidSin('046 454 286')).toBe(true);
    expect(isValidSin('046454286')).toBe(true);
    expect(isValidSin('046-454-286')).toBe(true);
  });

  it('refuses a digit transposition, a wrong length, and the all-zero number', () => {
    expect(isValidSin('046 454 268')).toBe(false);
    expect(isValidSin('04645428')).toBe(false);
    expect(isValidSin('000 000 000')).toBe(false);
  });

  it('formats in threes', () => {
    expect(formatSin('046454286')).toBe('046 454 286');
    expect(formatSin('12')).toBe('12');
  });
});

describe('business number', () => {
  it('accepts nine digits with or without a program account', () => {
    expect(isValidBusinessNumber('123456789')).toBe(true);
    expect(isValidBusinessNumber('123456789 RT0001')).toBe(true);
    expect(isValidBusinessNumber('123456789rt0001')).toBe(true);
    expect(isValidBusinessNumber('12345678')).toBe(false);
  });

  it('formats the program account with one space', () => {
    expect(formatBusinessNumber('123456789rt0001')).toBe('123456789 RT0001');
    expect(formatBusinessNumber('123456789')).toBe('123456789');
  });
});

describe('postal code', () => {
  it('accepts the Canadian pattern and inserts the space', () => {
    expect(isValidCanadianPostalCode('m5v1j2')).toBe(true);
    expect(formatCanadianPostalCode('m5v1j2')).toBe('M5V 1J2');
  });

  it('refuses a letter that never appears, and the wrong shape', () => {
    expect(isValidCanadianPostalCode('D5V 1J2')).toBe(false);
    expect(isValidCanadianPostalCode('12345')).toBe(false);
  });
});

describe('phone', () => {
  it('formats a ten-digit number, with or without a leading 1', () => {
    expect(formatPhone('4165550100')).toBe('(416) 555-0100');
    expect(formatPhone('1-416-555-0100')).toBe('(416) 555-0100');
  });

  it('leaves an extension or a foreign number exactly as typed', () => {
    expect(formatPhone('416 555 0100 ext 22')).toBe('416 555 0100 ext 22');
    expect(formatPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
  });
});

describe('email', () => {
  it('catches the common typos', () => {
    expect(isValidEmail('ap@acme.ca')).toBe(true);
    expect(isValidEmail('ap@acme')).toBe(false);
    expect(isValidEmail('ap acme.ca')).toBe(false);
    expect(isValidEmail('@acme.ca')).toBe(false);
  });
});
