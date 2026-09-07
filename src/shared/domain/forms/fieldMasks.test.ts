import { describe, expect, it } from 'vitest';
import { clampIsoDate, clampIsoMonth, maskBusinessNumber, maskCanadianPostalCode, maskPhone, maskSin, maskYear, parseYear } from './fieldMasks';

describe('year', () => {
  it('never grows past four digits', () => {
    expect(maskYear('20226')).toBe('2022');
    expect(maskYear('2 0 2 6')).toBe('2026');
    expect(parseYear('2026')).toBe(2026);
    expect(parseYear('202')).toBeNull();
    expect(parseYear('1800')).toBeNull();
  });
});

describe('postal code', () => {
  it('formats as A1A 1A1 and stops there', () => {
    expect(maskCanadianPostalCode('m5v1j2')).toBe('M5V 1J2');
    expect(maskCanadianPostalCode('M5V 1J2XYZ')).toBe('M5V 1J2');
    expect(maskCanadianPostalCode('M5')).toBe('M5');
    expect(maskCanadianPostalCode('m5v-1')).toBe('M5V 1');
  });
});

describe('SIN and business number', () => {
  it('keeps nine digits, spaced', () => {
    expect(maskSin('046454286')).toBe('046 454 286');
    expect(maskSin('046 454 2861234')).toBe('046 454 286');
    expect(maskSin('04')).toBe('04');
  });
  it('shapes a business number as 123456789 RT0001', () => {
    expect(maskBusinessNumber('123456789rt0001')).toBe('123456789 RT0001');
    expect(maskBusinessNumber('123456789 RT00019')).toBe('123456789 RT0001');
    expect(maskBusinessNumber('12345')).toBe('12345');
    expect(maskBusinessNumber('123456789')).toBe('123456789');
  });
});

describe('phone', () => {
  it('formats ten digits and drops a leading 1', () => {
    expect(maskPhone('4165550199')).toBe('(416) 555-0199');
    expect(maskPhone('14165550199')).toBe('(416) 555-0199');
    expect(maskPhone('416555')).toBe('(416) 555');
    expect(maskPhone('41655501999999')).toBe('(416) 555-0199');
  });
});

describe('dates', () => {
  it('forces a four-digit year inside the range', () => {
    expect(clampIsoDate('20226-01-15')).toBe('2022-01-15');
    expect(clampIsoDate('0202-01-15')).toBe('1900-01-15');
    expect(clampIsoDate('2026-01-15')).toBe('2026-01-15');
    expect(clampIsoDate('')).toBe('');
    expect(clampIsoMonth('20260-03')).toBe('2026-03');
  });
});
