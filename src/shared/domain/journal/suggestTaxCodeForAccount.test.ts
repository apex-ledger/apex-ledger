import { describe, expect, it } from 'vitest';
import type { JournalEntry, TaxCode } from '../types';
import { mostCommonTaxCodeForAccount } from './suggestTaxCodeForAccount';

function entry(id: number, status: JournalEntry['status'], lines: { accountId: number; taxCode?: TaxCode | null }[]): JournalEntry {
  return {
    id,
    entryDate: '2026-07-04',
    memo: null,
    reference: null,
    status,
    createdAt: '2026-07-04',
    postedAt: status === 'posted' ? '2026-07-04' : null,
    lines: lines.map((l, i) => ({
      id: id * 100 + i,
      journalEntryId: id,
      accountId: l.accountId,
      debitCents: 0,
      creditCents: 0,
      description: null,
      lineOrder: i,
      taxCode: l.taxCode ?? null,
      manualHstCents: null,
      baseCents: null,
      clearedAt: null,
      reconciliationId: null,
      vendorId: null,
      customerId: null,
      foreignCurrency: null,
      foreignAmountCents: null,
      exchangeRate: null,
    })),
    periodFrom: null,
    periodTo: null,
    isAdjustingEntry: false,
    source: 'manual',
    sourceReference: null,
  };
}

const MEALS = 1;

describe('mostCommonTaxCodeForAccount', () => {
  it('returns the most frequently used tax code for that account', () => {
    const entries = [
      entry(1, 'posted', [{ accountId: MEALS, taxCode: 'MealsHST' }]),
      entry(2, 'posted', [{ accountId: MEALS, taxCode: 'MealsHST' }]),
      entry(3, 'posted', [{ accountId: MEALS, taxCode: 'NonHST' }]),
    ];
    expect(mostCommonTaxCodeForAccount(entries, MEALS)).toBe('MealsHST');
  });

  it('ignores unposted (draft/void) entries', () => {
    const entries = [entry(1, 'draft', [{ accountId: MEALS, taxCode: 'MealsHST' }]), entry(2, 'void', [{ accountId: MEALS, taxCode: 'MealsHST' }])];
    expect(mostCommonTaxCodeForAccount(entries, MEALS)).toBeNull();
  });

  it('ignores lines with no tax code and lines on a different account', () => {
    const entries = [entry(1, 'posted', [{ accountId: MEALS, taxCode: null }, { accountId: 99, taxCode: 'HST' }])];
    expect(mostCommonTaxCodeForAccount(entries, MEALS)).toBeNull();
  });

  it('returns null when the account has no posting history', () => {
    expect(mostCommonTaxCodeForAccount([], MEALS)).toBeNull();
  });
});
