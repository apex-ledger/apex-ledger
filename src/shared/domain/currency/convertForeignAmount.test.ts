import { describe, expect, it } from 'vitest';
import { convertForeignAmountToCadCents } from './convertForeignAmount';

describe('convertForeignAmountToCadCents', () => {
  it('converts a USD amount to CAD at a given rate', () => {
    expect(convertForeignAmountToCadCents(10000, 1.35)).toBe(13500);
  });

  it('rounds to the nearest cent instead of truncating', () => {
    expect(convertForeignAmountToCadCents(3536, 1.4083)).toBe(4980); // 3536 * 1.4083 = 4979.7488 -> 4980
  });

  it('rounds a fractional cent up or down based on which side of .5 it falls on', () => {
    expect(convertForeignAmountToCadCents(1000, 1.006)).toBe(1006); // 1006.0 exactly
    expect(convertForeignAmountToCadCents(333, 1.01)).toBe(336); // 336.33 -> 336
    expect(convertForeignAmountToCadCents(777, 1.01)).toBe(785); // 784.77 -> 785
  });

  it('is zero when the foreign amount is zero', () => {
    expect(convertForeignAmountToCadCents(0, 1.35)).toBe(0);
  });

  it('is zero when the rate is zero (degenerate but should not throw)', () => {
    expect(convertForeignAmountToCadCents(10000, 0)).toBe(0);
  });
});
