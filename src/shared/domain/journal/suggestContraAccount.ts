import type { JournalEntry } from '../types';

/** Which account usually sits on the OTHER side when this one is used.
 *
 * Double entry means every line implies a second one, and in practice the pairing is habitual:
 * Rent is nearly always paid from the chequing account, Sales nearly always lands in the bank,
 * depreciation nearly always faces accumulated depreciation. The app already learns an account's
 * usual tax code (see suggestTaxCodeForAccount) and can already put the balancing amount on an
 * empty line; what it could not do was say WHICH account that line should be.
 *
 * Learned from the file's own posted history rather than from a fixed table, so it fits how this
 * particular business actually books things instead of how a textbook would.
 *
 * Direction matters and is deliberately part of the key. Money leaving the bank to pay rent and
 * money arriving in the bank from a customer are different habits, and a suggestion that ignored
 * which side you are on would offer the wrong half of the pair about as often as the right one.
 */

export interface ContraAccountSuggestion {
  accountId: number;
  /** How many posted entries paired these two accounts this way round. */
  count: number;
  /** Share of all pairings for this account and direction, 0–1. Lets the UI stay quiet when the
   * history is genuinely mixed rather than presenting a coin-flip as a recommendation. */
  confidence: number;
}

/**
 * Ranked contra accounts for `accountId` when it is used on the given side, most common first.
 *
 * Only two-line entries are learned from. A five-line payroll entry pairs its accounts in no
 * meaningful way — every debit sits opposite every credit — and counting those would drown the
 * genuine pairings in noise from whichever entries happen to be largest.
 */
export function suggestContraAccounts(
  entries: JournalEntry[],
  accountId: number,
  side: 'debit' | 'credit',
): ContraAccountSuggestion[] {
  const counts = new Map<number, number>();
  let total = 0;

  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    if (entry.lines.length !== 2) continue;

    const [a, b] = entry.lines;
    // The line holding this account, on the side asked about; the other line is the contra.
    const isOn = (line: typeof a) =>
      line.accountId === accountId && (side === 'debit' ? line.debitCents > 0 : line.creditCents > 0);

    let contraAccountId: number | null = null;
    if (isOn(a)) contraAccountId = b.accountId;
    else if (isOn(b)) contraAccountId = a.accountId;
    if (contraAccountId === null || contraAccountId === accountId) continue;

    counts.set(contraAccountId, (counts.get(contraAccountId) ?? 0) + 1);
    total += 1;
  }

  if (total === 0) return [];

  return [...counts.entries()]
    .map(([id, count]) => ({ accountId: id, count, confidence: count / total }))
    .sort((x, y) => y.count - x.count || x.accountId - y.accountId);
}

/** The single best contra account, or null when there isn't a clear enough habit to suggest one.
 *
 * Two guards, because a wrong suggestion that gets accepted without thinking is worse than no
 * suggestion at all: it needs to have happened more than once, and it has to be the usual choice
 * rather than merely the most frequent among many. */
export function bestContraAccount(
  entries: JournalEntry[],
  accountId: number,
  side: 'debit' | 'credit',
  options: { minCount?: number; minConfidence?: number } = {},
): ContraAccountSuggestion | null {
  const minCount = options.minCount ?? 2;
  const minConfidence = options.minConfidence ?? 0.5;
  const best = suggestContraAccounts(entries, accountId, side)[0];
  if (!best) return null;
  if (best.count < minCount || best.confidence < minConfidence) return null;
  return best;
}
