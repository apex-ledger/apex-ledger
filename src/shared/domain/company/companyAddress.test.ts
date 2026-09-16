import { describe, expect, it } from 'vitest';
import { companyAddressLines } from './companyAddress';

const empty = { businessAddressLine1: null, businessAddressLine2: null, businessCity: null, businessProvince: null, businessPostalCode: null };

describe('the company address on pay stubs and slips', () => {
  it('prints the business address', () => {
    expect(companyAddressLines({ ...empty, businessAddressLine1: '141 Calderstone Rd', businessCity: 'Brampton', businessProvince: 'ON', businessPostalCode: 'L6P 2M3' })).toEqual(['141 Calderstone Rd', 'Brampton, ON L6P 2M3']);
  });

  it('falls back to the mailing address when no business address is saved', () => {
    expect(companyAddressLines({ ...empty, mailingAddressLine1: 'PO Box 12', mailingCity: 'Mississauga', mailingProvince: 'ON', mailingPostalCode: 'L5B 1M2' })).toEqual(['PO Box 12', 'Mississauga, ON L5B 1M2']);
  });

  it('is empty when the company has no address at all', () => {
    expect(companyAddressLines(empty)).toEqual([]);
  });
});
