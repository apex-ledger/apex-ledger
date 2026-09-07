import type { Account } from '../types';

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Best-effort match of a free-typed account name (e.g. pasted from Excel) against the Chart of
 * Accounts. Conservative on purpose — an unmatched row just leaves the account picker empty for
 * the reviewer to fill in manually, which is far cheaper than silently posting to the wrong
 * account. Only returns a match when there's exactly one reasonable candidate; any ambiguity
 * (two accounts both starting with the same word, say) returns null rather than guessing.
 */
export function matchAccountByName(rawName: string, accounts: Account[]): Account | null {
  const trimmed = rawName.trim();
  if (!trimmed) return null;

  const byCode = accounts.find((a) => a.code.toLowerCase() === trimmed.toLowerCase());
  if (byCode) return byCode;

  const needle = normalize(trimmed);
  if (!needle) return null;

  const exact = accounts.find((a) => normalize(a.name) === needle);
  if (exact) return exact;

  const startsWith = accounts.filter((a) => normalize(a.name).startsWith(needle) || needle.startsWith(normalize(a.name)));
  if (startsWith.length === 1) return startsWith[0];

  const contains = accounts.filter((a) => normalize(a.name).includes(needle) || needle.includes(normalize(a.name)));
  if (contains.length === 1) return contains[0];

  return null;
}
