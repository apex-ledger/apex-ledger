import { describe, expect, it } from 'vitest';
import { documentLineTags, tagDocumentLines } from './tagDocumentLines';

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

describe('reading tags back off a posted document, so an edit keeps them', () => {
  const journal = [
    { id: 10, accountId: 1200, debitCents: 113_000, creditCents: 0, tagIds: [] },
    { id: 11, accountId: 4000, debitCents: 0, creditCents: 50_000, tagIds: [7] },
    { id: 12, accountId: 2280, debitCents: 0, creditCents: 6_500, tagIds: [] },
    { id: 13, accountId: 4100, debitCents: 0, creditCents: 30_000, tagIds: [8, 9, 8] },
  ];

  it('gives each document line the tags on the journal line that carries it', () => {
    expect(documentLineTags(journal, [{ accountId: 4000, baseCents: 50_000 }, { accountId: 4100, baseCents: 30_000 }])).toEqual([[7], [8, 9]]);
  });

  it('round-trips: tags written by tagDocumentLines read back onto the same lines', () => {
    const doc = [{ accountId: 4000, baseCents: 50_000, tagIds: [3] }, { accountId: 4100, baseCents: 30_000, tagIds: [4, 5] }];
    const written = tagDocumentLines(journal, doc);
    const withTags = journal.map((l) => ({ ...l, tagIds: written.filter((w) => w.journalEntryLineId === l.id).map((w) => w.tagId) }));
    expect(documentLineTags(withTags, doc)).toEqual([[3], [4, 5]]);
  });

  it('leaves a line with no matching journal line untagged rather than guessing', () => {
    expect(documentLineTags(journal, [{ accountId: 4000, baseCents: 1 }])).toEqual([[]]);
  });
});
