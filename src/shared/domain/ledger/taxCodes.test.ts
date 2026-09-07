import { describe, expect, it } from 'vitest';
import { TAX_CODE_DEFINITIONS, defaultTaxCodeForProvince, gstHstPortionOfInclusive, taxCodeOptions, taxPortionOfInclusive } from './taxCodes';

describe('defaultTaxCodeForProvince', () => {
  it('picks the right code for every province and territory', () => {
    expect(defaultTaxCodeForProvince('ON')).toBe('HST');
    expect(defaultTaxCodeForProvince('NS')).toBe('HST_NS');
    expect(defaultTaxCodeForProvince('NB')).toBe('HST_NB');
    expect(defaultTaxCodeForProvince('NL')).toBe('HST_NL');
    expect(defaultTaxCodeForProvince('PE')).toBe('HST_PE');
    expect(defaultTaxCodeForProvince('BC')).toBe('GST_PST_BC');
    expect(defaultTaxCodeForProvince('SK')).toBe('GST_PST_SK');
    expect(defaultTaxCodeForProvince('MB')).toBe('GST_RST_MB');
    expect(defaultTaxCodeForProvince('QC')).toBe('GST_QST_QC');
    expect(defaultTaxCodeForProvince('AB')).toBe('GST_AB');
    expect(defaultTaxCodeForProvince('NT')).toBe('GST_NT');
    expect(defaultTaxCodeForProvince('NU')).toBe('GST_NU');
    expect(defaultTaxCodeForProvince('YT')).toBe('GST_YT');
  });

  it('accepts the ways a person actually types an address field', () => {
    // It is free text, so it has to cope with full names, casing, spaces, and punctuation.
    expect(defaultTaxCodeForProvince('Ontario')).toBe('HST');
    expect(defaultTaxCodeForProvince('  british columbia ')).toBe('GST_PST_BC');
    expect(defaultTaxCodeForProvince('Nova Scotia')).toBe('HST_NS');
    expect(defaultTaxCodeForProvince('P.E.I.')).toBe('HST_PE');
    expect(defaultTaxCodeForProvince('Newfoundland and Labrador')).toBe('HST_NL');
    expect(defaultTaxCodeForProvince('québec')).toBe('GST_QST_QC');
  });

  it('returns nothing rather than guessing when the province is blank or unrecognised', () => {
    // Quietly defaulting to Ontario's 13% would put a wrong tax on every entry of a company that
    // simply had not filled in its address.
    expect(defaultTaxCodeForProvince(null)).toBeNull();
    expect(defaultTaxCodeForProvince('')).toBeNull();
    expect(defaultTaxCodeForProvince('   ')).toBeNull();
    expect(defaultTaxCodeForProvince('Ontarioo')).toBeNull();
    expect(defaultTaxCodeForProvince('California')).toBeNull();
  });
});

describe('taxCodeOptions', () => {
  it('shows company tax, the requested 5% and 8% rates, no tax, and a custom rate', () => {
    const options = taxCodeOptions('all', 'BC');
    expect(options.map((o) => o.value)).toEqual(['GST_PST_BC', 'GST', 'USTax', 'NonHST', 'Manual']);
    expect(options[0].label).toContain('BC');
    expect(options.slice(1).map((o) => o.label)).toEqual(['GST 5%', 'US Tax 8% (not an ITC)', 'HST Exempt', 'Custom rate']);
  });

  it('uses clear everyday wording for an Ontario company', () => {
    expect(taxCodeOptions('all', 'ON').map((option) => option.label)).toEqual(['HST 13%', 'GST 5%', 'US Tax 8% (not an ITC)', 'HST Exempt', 'Custom rate']);
  });

  it('uses the correct company-address rate rather than assuming Ontario', () => {
    expect(taxCodeOptions('all', 'ON')[0].value).toBe('HST');
    expect(taxCodeOptions('all', 'NS')[0].value).toBe('HST_NS');
    expect(taxCodeOptions('all', 'AB')[0].value).toBe('GST_AB');
    expect(taxCodeOptions('all', 'QC')[0].value).toBe('GST_QST_QC');
  });

  it('keeps the requested Ontario HST choices available for an older company with no saved province', () => {
    const options = taxCodeOptions('all', null);
    expect(options.map((o) => o.value)).toEqual(['HST', 'GST', 'USTax', 'NonHST', 'Manual']);
    expect(options.map((o) => o.label)).toEqual(['HST 13%', 'GST 5%', 'US Tax 8% (not an ITC)', 'HST Exempt', 'Custom rate']);
    expect(options[0].title).toContain('Ontario HST fallback');
  });

  it('adds a real blank placeholder only where null is a meaningful stored value', () => {
    const options = taxCodeOptions('all', 'ON', { includeBlank: true });
    expect(options.map((option) => option.value)).toEqual(['', 'HST', 'GST', 'USTax', 'NonHST', 'Manual']);
    expect(options[0].label).toBe('— choose tax —');
  });

  it('keeps the full detailed list available only when explicitly requested', () => {
    const codes = taxCodeOptions('all', 'ON', { allProvinces: true }).map((o) => o.value);
    expect(codes).toContain('HST');
    expect(codes).toContain('GST_PST_BC');
    expect(codes).toContain('HST_15');
    expect(codes).toContain('MealsHST');
    expect(codes).toContain('USTax');
  });
});

describe('extracting tax from a tax-inclusive amount', () => {
  it('pulls 13/113 out of an Ontario total, as it always did', () => {
    expect(taxPortionOfInclusive('HST', 113_00)).toBe(13_00);
    expect(gstHstPortionOfInclusive('HST', 113_00)).toBe(13_00);
  });

  it('counts only the federal slice of a BC total towards the GST/HST return', () => {
    // $112.00 paid in BC is $100 + $5 GST + $7 PST. The return should see the $5, not the $12.
    expect(taxPortionOfInclusive('GST_PST_BC', 112_00)).toBe(12_00);
    expect(gstHstPortionOfInclusive('GST_PST_BC', 112_00)).toBe(5_00);
  });

  it('counts only the GST out of a Quebec total, since QST is filed with the province', () => {
    expect(gstHstPortionOfInclusive('GST_QST_QC', 114_98)).toBe(5_00);
  });

  it('finds no tax in the codes that carry none', () => {
    expect(taxPortionOfInclusive('NonHST', 100_00)).toBe(0);
    expect(taxPortionOfInclusive('Manual', 100_00)).toBe(0);
    expect(taxPortionOfInclusive(null, 100_00)).toBe(0);
    expect(gstHstPortionOfInclusive('USTax', 108_00)).toBe(0); // real tax, but not Canadian
  });
});

describe('the tax code table itself', () => {
  it('never claims more federal tax than the code charges in total', () => {
    for (const d of TAX_CODE_DEFINITIONS) {
      expect(d.gstHstRate).toBeLessThanOrEqual(d.rate);
      expect(d.claimableFraction).toBeGreaterThanOrEqual(0);
      expect(d.claimableFraction).toBeLessThanOrEqual(1);
    }
  });

  it('has no duplicate codes', () => {
    const codes = TAX_CODE_DEFINITIONS.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('the meals and entertainment code on purchase screens', () => {
  it('is offered on a purchase in a 13% HST province, not on a sale', () => {
    expect(taxCodeOptions('expense', 'ON').map((option) => option.value)).toContain('MealsHST');
    expect(taxCodeOptions('income', 'ON').map((option) => option.value)).not.toContain('MealsHST');
    expect(taxCodeOptions('expense', null).map((option) => option.value)).toContain('MealsHST');
  });
  it('is not offered where the rate would be wrong', () => {
    expect(taxCodeOptions('expense', 'AB').map((option) => option.value)).not.toContain('MealsHST');
  });
});

describe('taxPortionOfInclusive on a till total', () => {
  it('finds the tax inside a tax-inclusive total', () => {
    expect(taxPortionOfInclusive('HST', 11300)).toBe(1300);
    expect(taxPortionOfInclusive('HST', 13750)).toBe(1582);
    expect(taxPortionOfInclusive('NonHST', 13750)).toBe(0);
    expect(taxPortionOfInclusive(null, 13750)).toBe(0);
  });
});
