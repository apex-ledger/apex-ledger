import type { JournalEntry, TaxCode } from '../types';

/**
 * The most commonly used tax code on this account across every posted entry — offered as a
 * default the moment a fresh line picks that account, since most accounts get used with the same
 * tax treatment almost every time (e.g. "Meals & Entertainment" is nearly always MealsHST, a bank
 * fee account is nearly always NonHST). Never overrides a tax code the reviewer already chose —
 * see JournalEntryFormPage's updateLineAccount, which only applies this when taxCode is still
 * null. Returns null when the account has no posting history with any tax code at all.
 */
export function mostCommonTaxCodeForAccount(entries: JournalEntry[], accountId: number): TaxCode | null {
  const counts = new Map<TaxCode, number>();
  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    for (const line of entry.lines) {
      if (line.accountId !== accountId || line.taxCode === null) continue;
      counts.set(line.taxCode, (counts.get(line.taxCode) ?? 0) + 1);
    }
  }
  let best: TaxCode | null = null;
  let bestCount = 0;
  for (const [code, count] of counts) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}
