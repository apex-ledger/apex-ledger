import { describe, expect, it } from 'vitest';
import { queryWords, rankCandidates, scoreCandidate } from './searchIndex';

const candidate = (id: string, ...fields: (string | null)[]) => ({ item: id, fields });

describe('query words', () => {
  it('splits on whitespace, lower-cases, and drops empties', () => {
    expect(queryWords('  Acme   Ltd ')).toEqual(['acme', 'ltd']);
    expect(queryWords('')).toEqual([]);
  });
});

describe('matching', () => {
  it('requires every word to appear somewhere', () => {
    expect(scoreCandidate(candidate('a', 'Acme Ltd', 'acme@example.com'), ['acme', 'ltd'])).not.toBeNull();
    expect(scoreCandidate(candidate('a', 'Acme Ltd'), ['acme', 'bell'])).toBeNull();
  });

  it('matches inside secondary fields such as an email or memo', () => {
    expect(scoreCandidate(candidate('a', 'Acme Ltd', 'billing@acme.example'), ['billing'])).not.toBeNull();
  });

  it('ignores null fields and never matches an empty query', () => {
    expect(scoreCandidate(candidate('a', null, 'x'), ['x'])).not.toBeNull();
    expect(scoreCandidate(candidate('a', 'Acme'), [])).toBeNull();
  });
});

describe('ranking', () => {
  it('puts a name that starts with the query above one that merely contains it', () => {
    const ranked = rankCandidates([candidate('contains', 'Big Bell Supplies'), candidate('starts', 'Bell Canada')], 'bell', 10);
    expect(ranked.map((match) => match.item)).toEqual(['starts', 'contains']);
  });

  it('puts a match on the primary field above a match on a memo', () => {
    const ranked = rankCandidates([candidate('memo', 'INV-2001', 'bell tower repair'), candidate('name', 'Bell Canada')], 'bell', 10);
    expect(ranked[0]?.item).toBe('name');
  });

  it('finds a document number typed without its prefix', () => {
    const ranked = rankCandidates([candidate('inv', 'INV-1042', 'Acme Ltd')], '1042', 10);
    expect(ranked).toHaveLength(1);
  });

  it('keeps the source order for equal scores and honours the limit', () => {
    const ranked = rankCandidates([candidate('first', 'Bell A'), candidate('second', 'Bell B'), candidate('third', 'Bell C')], 'bell', 2);
    expect(ranked.map((match) => match.item)).toEqual(['first', 'second']);
  });
});
