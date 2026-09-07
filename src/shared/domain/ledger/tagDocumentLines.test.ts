import { describe, expect, it } from 'vitest';
import { tagDocumentLines } from './tagDocumentLines';

describe('tagging document lines onto journal lines', () => {
  const journal = [
    { id: 10, accountId: 1200, debitCents: 113_000, creditCents: 0 }, // AR
    { id: 11, accountId: 4000, debitCents: 0, creditCents: 50_000 }, // revenue line 1
    { id: 12, accountId: 2280, debitCents: 0, creditCents: 6_500 }, // HST on line 1
    { id: 13, accountId: 4000, debitCents: 0, creditCents: 50_000 }, // revenue line 2 (same account+amount)
    { id: 14, accountId: 2280, debitCents: 0, creditCents: 6_500 },
  ];

  it('walks document lines onto the next unclaimed journal line with the same account and amount', () => {
    const pairs = tagDocumentLines(journal, [
      { accountId: 4000, baseCents: 50_000, tagIds: [7] },
      { accountId: 4000, baseCents: 50_000, tagIds: [8, 9] },
    ]);
    expect(pairs).toEqual([{ journalEntryLineId: 11, tagId: 7 }, { journalEntryLineId: 13, tagId: 8 }, { journalEntryLineId: 13, tagId: 9 }]);
  });

  it('never tags the control or tax lines, and leaves an unmatched line untagged', () => {
    expect(tagDocumentLines(journal, [{ accountId: 4000, baseCents: 49_999, tagIds: [7] }])).toEqual([]);
    expect(tagDocumentLines(journal, [{ accountId: 4000, baseCents: 50_000, tagIds: [] }])).toEqual([]);
  });
});
