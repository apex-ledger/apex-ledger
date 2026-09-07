/** How the quick search decides what matches, and in what order.
 *
 * Kept apart from the palette so the ranking can be tested without rendering anything, and so the
 * rule is the same for every kind of record: an invoice number and a customer name are matched by
 * the same code, and a change here changes both.
 *
 * A query is split into words and every word must appear somewhere in the record's fields. Among
 * the matches, a field that STARTS with the query outranks one that merely contains it, and a
 * match on the first field (the record's own name or number) outranks a match on a secondary one
 * (a memo, an email). Ties keep their original order, which each source supplies newest-first.
 */

export interface SearchCandidate<T> {
  item: T;
  /** The searchable text, most important first — a name or document number, then descriptions,
   * memos, contact details. Nulls are skipped. */
  fields: (string | null | undefined)[];
}

export interface SearchMatch<T> {
  item: T;
  score: number;
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/** The words of a query, lower-cased, with empties removed. */
export function queryWords(query: string): string[] {
  return normalise(query).split(/\s+/).filter((word) => word.length > 0);
}

/** A score for one candidate, or null when it does not match. Higher is better. */
export function scoreCandidate<T>(candidate: SearchCandidate<T>, words: string[]): number | null {
  if (words.length === 0) return null;
  const fields = candidate.fields.filter((field): field is string => typeof field === 'string' && field.length > 0).map(normalise);
  if (fields.length === 0) return null;
  let total = 0;
  for (const word of words) {
    let best = 0;
    fields.forEach((field, index) => {
      // Primary field beats secondary; prefix beats word-prefix beats substring.
      const weight = index === 0 ? 3 : 1;
      let strength = 0;
      if (field === word) strength = 5;
      else if (field.startsWith(word)) strength = 4;
      else if (field.split(/[\s\-_/#,.]+/).some((part) => part.startsWith(word))) strength = 3;
      else if (field.includes(word)) strength = 1;
      best = Math.max(best, strength * weight);
    });
    if (best === 0) return null;
    total += best;
  }
  return total;
}

/** The candidates that match, best first, capped at `limit`. */
export function rankCandidates<T>(candidates: SearchCandidate<T>[], query: string, limit: number): SearchMatch<T>[] {
  const words = queryWords(query);
  const matches: SearchMatch<T>[] = [];
  for (const candidate of candidates) {
    const score = scoreCandidate(candidate, words);
    if (score !== null) matches.push({ item: candidate.item, score });
  }
  // Stable: equal scores keep the order the source gave them.
  return matches
    .map((match, index) => ({ match, index }))
    .sort((a, b) => b.match.score - a.match.score || a.index - b.index)
    .slice(0, limit)
    .map(({ match }) => match);
}

export function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
