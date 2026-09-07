import type { JournalEntry, TaxCode } from '../types';

export interface DuplicateMatch {
  entryId: number;
  entryDate: string;
  memo: string | null;
}

function daysBetween(a: string, b: string): number {
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff / (1000 * 60 * 60 * 24);
}

/**
 * Finds existing journal entries that look like they might be the same transaction entered
 * twice: same account, same dollar amount (as either a debit or a credit), within `windowDays`
 * of the candidate date. This is a warning, not a block — legitimate same-day, same-amount
 * transactions genuinely happen (two identical coffee runs, two $50 e-transfers), so callers
 * should surface this as a heads-up the user can dismiss and save anyway, never refuse to save.
 */
export function findPossibleDuplicates(
  entries: JournalEntry[],
  candidate: { entryDate: string; accountId: number; amountCents: number; excludeEntryId?: number },
  windowDays = 3,
): DuplicateMatch[] {
  if (candidate.amountCents <= 0) return [];
  const matches: DuplicateMatch[] = [];
  for (const entry of entries) {
    if (entry.status === 'void') continue;
    if (entry.id === candidate.excludeEntryId) continue;
    if (daysBetween(entry.entryDate, candidate.entryDate) > windowDays) continue;
    const hasMatch = entry.lines.some(
      (l) => l.accountId === candidate.accountId && (l.debitCents === candidate.amountCents || l.creditCents === candidate.amountCents),
    );
    if (hasMatch) matches.push({ entryId: entry.id, entryDate: entry.entryDate, memo: entry.memo });
  }
  return matches;
}

/**
 * Finds a posted entry carrying an exact reference tag — used for the credit-card-payment
 * identifier bank import writes onto a transfer entry (see BankImportPage's cardPaymentReference):
 * the same real-world payment produces the identical reference string whether it was imported
 * from the bank side or the credit card's own statement, so an exact match here means "the other
 * side of this transfer is already recorded" with certainty, not just a same-amount coincidence
 * the way findPossibleDuplicates' fuzzy account+amount+date check is. Void entries don't count —
 * a voided import shouldn't block re-importing the same payment.
 */
export function findEntryByReference(entries: JournalEntry[], reference: string): DuplicateMatch | null {
  const entry = entries.find((e) => e.status !== 'void' && e.reference === reference);
  return entry ? { entryId: entry.id, entryDate: entry.entryDate, memo: entry.memo } : null;
}

export interface RepeatEntryLine {
  accountId: number;
  debitCents: number;
  creditCents: number;
  description: string | null;
  taxCode: TaxCode | null;
  manualHstCents: number | null;
}

export interface RepeatEntryMatch {
  entryId: number;
  entryDate: string;
  memo: string;
  lines: RepeatEntryLine[];
}

/**
 * "Repeat transaction" sensor for the Journal Entry form: as the reviewer types a Memo, this finds
 * the most recent POSTED entry with the exact same memo (trimmed, case-insensitive — a fuzzy match
 * risks confidently suggesting the wrong past entry, so this stays strict) so its lines can be
 * offered as a one-click starting point. Recurring entries (rent, a monthly service fee, the same
 * loan payment) are almost always typed with the identical memo each time, which this relies on.
 */
export function findMostRecentEntryByMemo(entries: JournalEntry[], memo: string, excludeEntryId?: number): RepeatEntryMatch | null {
  const normalized = memo.trim().toLowerCase();
  if (!normalized) return null;
  const matches = entries.filter(
    (e) => e.status === 'posted' && e.id !== excludeEntryId && (e.memo ?? '').trim().toLowerCase() === normalized,
  );
  if (matches.length === 0) return null;
  const mostRecent = matches.reduce((latest, e) => (e.entryDate > latest.entryDate ? e : latest));
  return {
    entryId: mostRecent.id,
    entryDate: mostRecent.entryDate,
    memo: mostRecent.memo ?? '',
    lines: mostRecent.lines.map((l) => ({
      accountId: l.accountId,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      description: l.description,
      taxCode: l.taxCode,
      manualHstCents: l.manualHstCents,
    })),
  };
}
