import { describe, expect, it } from 'vitest';
import { taxCentsForCustomRate } from './customTaxRate';

describe('taxCentsForCustomRate', () => {
  it('calculates common and fractional custom rates to the nearest cent', () => {
    expect(taxCentsForCustomRate(10_000, 8)).toBe(800);
    expect(taxCentsForCustomRate(10_000, 5)).toBe(500);
    expect(taxCentsForCustomRate(12_345, 7.25)).toBe(895);
  });

  it('rejects negative and invalid rates', () => {
    expect(taxCentsForCustomRate(10_000, -1)).toBe(0);
    expect(taxCentsForCustomRate(10_000, Number.NaN)).toBe(0);
  });
});
