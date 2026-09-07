import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../types';
import { findPossibleDuplicates, findEntryByReference, findMostRecentEntryByMemo } from './findPossibleDuplicates';

function entry(
  id: number,
  entryDate: string,
  status: JournalEntry['status'],
  lines: { accountId: number; debitCents?: number; creditCents?: number }[],
  memo: string | null = null,
  reference: string | null = null,
): JournalEntry {
  return {
    id,
    entryDate,
    memo,
    reference,
    status,
    createdAt: entryDate,
    postedAt: status === 'posted' ? entryDate : null,
    lines: lines.map((l, i) => ({
      id: id * 100 + i,
      journalEntryId: id,
      accountId: l.accountId,
      debitCents: l.debitCents ?? 0,
      creditCents: l.creditCents ?? 0,
      description: null,
      lineOrder: i,
      taxCode: null,
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

const BANK = 1;
const FUEL = 2;

describe('findPossibleDuplicates', () => {
  it('flags an entry with the same account and amount within the date window', () => {
    const entries = [entry(1, '2026-07-04', 'posted', [{ accountId: FUEL, debitCents: 5000 }, { accountId: BANK, creditCents: 5000 }], 'Shell')];
    const matches = findPossibleDuplicates(entries, { entryDate: '2026-07-05', accountId: BANK, amountCents: 5000 });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ entryId: 1, memo: 'Shell' });
  });

  it('does not flag a different amount', () => {
    const entries = [entry(1, '2026-07-04', 'posted', [{ accountId: BANK, creditCents: 5000 }])];
    const matches = findPossibleDuplicates(entries, { entryDate: '2026-07-04', accountId: BANK, amountCents: 5001 });
    expect(matches).toHaveLength(0);
  });

  it('does not flag a different account', () => {
    const entries = [entry(1, '2026-07-04', 'posted', [{ accountId: FUEL, debitCents: 5000 }])];
    const matches = findPossibleDuplicates(entries, { entryDate: '2026-07-04', accountId: BANK, amountCents: 5000 });
    expect(matches).toHaveLength(0);
  });

  it('does not flag a match outside the date window', () => {
    const entries = [entry(1, '2026-07-01', 'posted', [{ accountId: BANK, creditCents: 5000 }])];
    const matches = findPossibleDuplicates(entries, { entryDate: '2026-07-10', accountId: BANK, amountCents: 5000 }, 3);
    expect(matches).toHaveLength(0);
  });

  it('ignores voided entries', () => {
    const entries = [entry(1, '2026-07-04', 'void', [{ accountId: BANK, creditCents: 5000 }])];
    const matches = findPossibleDuplicates(entries, { entryDate: '2026-07-04', accountId: BANK, amountCents: 5000 });
    expect(matches).toHaveLength(0);
  });

  it('excludes the entry currently being edited', () => {
    const entries = [entry(1, '2026-07-04', 'draft', [{ accountId: BANK, creditCents: 5000 }])];
    const matches = findPossibleDuplicates(entries, { entryDate: '2026-07-04', accountId: BANK, amountCents: 5000, excludeEntryId: 1 });
    expect(matches).toHaveLength(0);
  });

  it('matches on either the debit or the credit side', () => {
    const entries = [entry(1, '2026-07-04', 'posted', [{ accountId: BANK, debitCents: 5000 }])];
    const matches = findPossibleDuplicates(entries, { entryDate: '2026-07-04', accountId: BANK, amountCents: 5000 });
    expect(matches).toHaveLength(1);
  });

  it('returns nothing for a zero or negative candidate amount', () => {
    const entries = [entry(1, '2026-07-04', 'posted', [{ accountId: BANK, creditCents: 5000 }])];
    expect(findPossibleDuplicates(entries, { entryDate: '2026-07-04', accountId: BANK, amountCents: 0 })).toHaveLength(0);
  });
});

describe('findEntryByReference', () => {
  it('finds a posted entry with the exact reference tag', () => {
    const entries = [entry(1, '2026-07-04', 'posted', [{ accountId: BANK, creditCents: 5000 }], 'CC payment', 'CC-PMT-20260704-5000-1-2')];
    const match = findEntryByReference(entries, 'CC-PMT-20260704-5000-1-2');
    expect(match).toMatchObject({ entryId: 1, entryDate: '2026-07-04', memo: 'CC payment' });
  });

  it('returns null when no entry carries that reference', () => {
    const entries = [entry(1, '2026-07-04', 'posted', [{ accountId: BANK, creditCents: 5000 }], null, 'CC-PMT-20260704-5000-1-2')];
    expect(findEntryByReference(entries, 'CC-PMT-20260705-5000-1-2')).toBeNull();
  });

  it('ignores a voided entry even with a matching reference', () => {
    const entries = [entry(1, '2026-07-04', 'void', [{ accountId: BANK, creditCents: 5000 }], null, 'CC-PMT-20260704-5000-1-2')];
    expect(findEntryByReference(entries, 'CC-PMT-20260704-5000-1-2')).toBeNull();
  });
});

describe('findMostRecentEntryByMemo', () => {
  it('finds a posted entry with the exact same memo, case-insensitively and trimmed', () => {
    const entries = [entry(1, '2026-07-04', 'posted', [{ accountId: BANK, creditCents: 5000 }], 'Rent')];
    expect(findMostRecentEntryByMemo(entries, '  rent  ')).toMatchObject({ entryId: 1, memo: 'Rent' });
  });

  it('returns the most recent match when several posted entries share the same memo', () => {
    const entries = [
      entry(1, '2026-05-01', 'posted', [{ accountId: BANK, creditCents: 5000 }], 'Rent'),
      entry(2, '2026-07-01', 'posted', [{ accountId: BANK, creditCents: 5000 }], 'Rent'),
      entry(3, '2026-06-01', 'posted', [{ accountId: BANK, creditCents: 5000 }], 'Rent'),
    ];
    expect(findMostRecentEntryByMemo(entries, 'Rent')?.entryId).toBe(2);
  });

  it('carries the matched entry\'s lines through for copying', () => {
    const entries = [entry(1, '2026-07-04', 'posted', [{ accountId: FUEL, debitCents: 5000 }, { accountId: BANK, creditCents: 5000 }], 'Fuel')];
    const match = findMostRecentEntryByMemo(entries, 'Fuel');
    expect(match?.lines).toEqual([
      { accountId: FUEL, debitCents: 5000, creditCents: 0, description: null, taxCode: null, manualHstCents: null },
      { accountId: BANK, debitCents: 0, creditCents: 5000, description: null, taxCode: null, manualHstCents: null },
    ]);
  });

  it('ignores draft and void entries — only a posted entry is a real repeat to copy from', () => {
    const entries = [
      entry(1, '2026-07-04', 'draft', [{ accountId: BANK, creditCents: 5000 }], 'Rent'),
      entry(2, '2026-07-04', 'void', [{ accountId: BANK, creditCents: 5000 }], 'Rent'),
    ];
    expect(findMostRecentEntryByMemo(entries, 'Rent')).toBeNull();
  });

  it('excludes the entry currently being edited', () => {
    const entries = [entry(1, '2026-07-04', 'posted', [{ accountId: BANK, creditCents: 5000 }], 'Rent')];
    expect(findMostRecentEntryByMemo(entries, 'Rent', 1)).toBeNull();
  });

  it('does not fuzzy-match a different memo', () => {
    const entries = [entry(1, '2026-07-04', 'posted', [{ accountId: BANK, creditCents: 5000 }], 'Office Rent')];
    expect(findMostRecentEntryByMemo(entries, 'Rent')).toBeNull();
  });

  it('returns null for a blank memo', () => {
    const entries = [entry(1, '2026-07-04', 'posted', [{ accountId: BANK, creditCents: 5000 }], 'Rent')];
    expect(findMostRecentEntryByMemo(entries, '   ')).toBeNull();
  });
});
