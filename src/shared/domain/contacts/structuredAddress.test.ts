import { describe, expect, it } from 'vitest';
import { formatStructuredAddress, parseStructuredAddress } from './structuredAddress';

describe('structured addresses', () => {
  it('formats a Canadian mailing address with street number, province and country', () => {
    expect(
      formatStructuredAddress({
        streetAddress: '123 King Street West',
        unit: 'Suite 400',
        city: 'Toronto',
        province: 'on',
        postalCode: 'm5v 1j2',
        country: 'Canada',
      }),
    ).toBe('123 King Street West\nSuite 400\nToronto, ON M5V 1J2\nCanada');
  });

  it('round-trips an address saved by the structured editor', () => {
    const saved = '123 King Street West\nSuite 400\nToronto, ON M5V 1J2\nCanada';
    expect(formatStructuredAddress(parseStructuredAddress(saved))).toBe(saved);
  });

  it('preserves an older free-form address rather than guessing and dropping parts', () => {
    const legacy = '88 Main Street, Ottawa, Ontario K1A 0B1';
    const parsed = parseStructuredAddress(legacy);
    expect(parsed.streetAddress).toBe(legacy);
    expect(formatStructuredAddress(parsed)).toBe(`${legacy}\nCanada`);
  });

  it('does not save Country by itself as an address', () => {
    expect(formatStructuredAddress(parseStructuredAddress(null))).toBe('');
  });
});

describe('parseStructuredAddress keeps the city and province in every shape the app writes', () => {
  it('reads an address that has no postal code yet', () => {
    const parsed = parseStructuredAddress('123 King Street West\nToronto, ON\nCanada');
    expect(parsed).toMatchObject({ streetAddress: '123 King Street West', city: 'Toronto', province: 'ON', postalCode: '', country: 'Canada' });
  });

  it('reads an address with no street line', () => {
    const parsed = parseStructuredAddress('Mississauga, ON L5B 2C9\nCanada');
    expect(parsed).toMatchObject({ streetAddress: '', city: 'Mississauga', province: 'ON', postalCode: 'L5B 2C9' });
  });

  it('reads a province and postal code with no city', () => {
    const parsed = parseStructuredAddress('10 Main St\nON M5V 1J2');
    expect(parsed).toMatchObject({ streetAddress: '10 Main St', city: '', province: 'ON', postalCode: 'M5V 1J2' });
  });

  it('splits an older one-line address at its commas when it ends the usual way', () => {
    const parsed = parseStructuredAddress('123 King St W, Suite 4, Toronto, ON M5V 1J2, Canada');
    expect(parsed).toEqual({ streetAddress: '123 King St W', unit: 'Suite 4', city: 'Toronto', province: 'ON', postalCode: 'M5V 1J2', country: 'Canada' });
  });

  it('keeps a one-line address whole when it has no recognisable locality', () => {
    expect(parseStructuredAddress('Behind the mall, ask for Sam').streetAddress).toBe('Behind the mall, ask for Sam');
  });

  it('does not mistake a street line for the locality', () => {
    const parsed = parseStructuredAddress('Unit 2, ON Street\nOttawa, ON K1A 0B1');
    expect(parsed).toMatchObject({ streetAddress: 'Unit 2, ON Street', city: 'Ottawa', province: 'ON', postalCode: 'K1A 0B1' });
  });

  it('round-trips what the editor writes, with or without a postal code', () => {
    for (const address of [
      { streetAddress: '5 Elm Ave', unit: '', city: 'Barrie', province: 'ON', postalCode: '', country: 'Canada' },
      { streetAddress: '', unit: '', city: 'Calgary', province: 'AB', postalCode: 'T2P 1J9', country: 'Canada' },
      { streetAddress: '9 Rue Ste-Catherine', unit: 'Bureau 12', city: 'Montréal', province: 'QC', postalCode: 'H2Y 1C6', country: 'Canada' },
    ]) {
      expect(parseStructuredAddress(formatStructuredAddress(address))).toEqual(address);
    }
  });
});
