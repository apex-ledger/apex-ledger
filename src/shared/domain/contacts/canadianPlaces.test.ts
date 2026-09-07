import { describe, expect, it } from 'vitest';
import { CANADIAN_CITY_NAMES, provinceForKnownCity, provinceFromPostalCode, suggestProvince } from './canadianPlaces';

describe('provinceFromPostalCode', () => {
  it('reads the province from the first letter', () => {
    expect(provinceFromPostalCode('M5V 1J2')).toBe('ON');
    expect(provinceFromPostalCode('h2y1c6')).toBe('QC');
    expect(provinceFromPostalCode('V6B')).toBe('BC');
    expect(provinceFromPostalCode('T2P 1J9')).toBe('AB');
    expect(provinceFromPostalCode('A1C 5M2')).toBe('NL');
    expect(provinceFromPostalCode('X0A 0H0')).toBe('NU');
    expect(provinceFromPostalCode('X1A 2N4')).toBe('NT');
  });
  it('returns null for anything that is not a Canadian postal code', () => {
    expect(provinceFromPostalCode('')).toBeNull();
    expect(provinceFromPostalCode('90210')).toBeNull();
    expect(provinceFromPostalCode('D1A 1A1')).toBeNull();
    expect(provinceFromPostalCode('M')).toBeNull();
  });
});

describe('provinceForKnownCity', () => {
  it('knows the larger municipalities, ignoring case and spacing', () => {
    expect(provinceForKnownCity('Toronto')).toBe('ON');
    expect(provinceForKnownCity('  calgary ')).toBe('AB');
    expect(provinceForKnownCity("St. John's")).toBe('NL');
    expect(provinceForKnownCity('Montréal')).toBe('QC');
  });
  it('is null for a town it has not heard of', () => {
    expect(provinceForKnownCity('Springfield')).toBeNull();
  });
  it('lists each city name once', () => {
    expect(new Set(CANADIAN_CITY_NAMES).size).toBe(CANADIAN_CITY_NAMES.length);
    expect(CANADIAN_CITY_NAMES).toContain('Mississauga');
  });
});

describe('suggestProvince', () => {
  const learned = (city: string) => (city.toLowerCase() === 'springfield' ? 'NS' : null);
  it('prefers what this machine learned for the city', () => {
    expect(suggestProvince('Springfield', 'M5V 1J2', learned)).toBe('NS');
  });
  it('then the built-in city list, then the postal code', () => {
    expect(suggestProvince('Ottawa', '', learned)).toBe('ON');
    expect(suggestProvince('Unknown Town', 'V6B 1A1', learned)).toBe('BC');
  });
  it('says nothing when nothing is known', () => {
    expect(suggestProvince('Unknown Town', '', learned)).toBeNull();
  });
});
