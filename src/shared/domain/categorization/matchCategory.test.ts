import { describe, expect, it } from 'vitest';
import type { CategoryRule } from '../types';
import { suggestCategory } from './matchCategory';

const RULES: CategoryRule[] = [
  { id: 1, pattern: 'HYDRO', accountId: 100, taxCode: 'NonHST', priority: 0, isActive: true },
  { id: 2, pattern: 'RENT', accountId: 101, taxCode: 'HST', priority: 0, isActive: true },
  { id: 3, pattern: 'BELL CANADA RENTAL', accountId: 102, taxCode: 'HST', priority: 5, isActive: true },
  { id: 4, pattern: 'INTEREST', accountId: 103, taxCode: 'NonHST', priority: 0, isActive: false },
];

describe('suggestCategory', () => {
  it('matches a substring case-insensitively', () => {
    const result = suggestCategory('TORONTO HYDRO PAYMENT', RULES);
    expect(result?.accountId).toBe(100);
  });

  it('returns null when nothing matches', () => {
    expect(suggestCategory('RANDOM PAYEE XYZ', RULES)).toBeNull();
  });

  it('ignores inactive rules', () => {
    expect(suggestCategory('MONTHLY INTEREST CHARGE', RULES)).toBeNull();
  });

  it('prefers higher priority over a shorter generic match', () => {
    // "BELL CANADA RENTAL" contains both "RENT" (priority 0) and the specific rule (priority 5)
    const result = suggestCategory('BELL CANADA RENTAL FEE', RULES);
    expect(result?.accountId).toBe(102);
  });

  it('matches every pattern word regardless of order or adjacency, not one exact phrase', () => {
    const rules: CategoryRule[] = [{ id: 5, pattern: 'ONLINE TRANSFER', accountId: 200, taxCode: null, priority: 0, isActive: true }];
    expect(suggestCategory('Transfer - Online Banking to Savings', rules)?.accountId).toBe(200);
    expect(suggestCategory('Online Banking Transfer to Savings', rules)?.accountId).toBe(200);
    expect(suggestCategory('Online Bill Payment', rules)).toBeNull();
  });
});
