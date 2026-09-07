import type { Account, JournalEntry } from '../types';

export interface AccountBalance {
  accountId: number;
  debitCents: number;
  creditCents: number;
  /** Signed so that a positive value always means "in the account's normal balance direction". */
  balanceCents: number;
}

/** Restricts entries to those whose entryDate falls within [dateFrom, dateTo] (inclusive, either bound optional). */
export function filterEntriesByDateRange(
  entries: JournalEntry[],
  dateFrom?: string,
  dateTo?: string,
): JournalEntry[] {
  return entries.filter((e) => {
    if (dateFrom && e.entryDate < dateFrom) return false;
    if (dateTo && e.entryDate > dateTo) return false;
    return true;
  });
}

/**
 * Sums posted journal lines per account. Unposted (draft/void) entries never affect balances —
 * this is what keeps drafts free-form while the ledger itself stays trustworthy.
 */
export function computeAccountBalances(
  accounts: Account[],
  entries: JournalEntry[],
): Map<number, AccountBalance> {
  const balances = new Map<number, AccountBalance>();
  for (const account of accounts) {
    balances.set(account.id, { accountId: account.id, debitCents: 0, creditCents: 0, balanceCents: 0 });
  }
  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    for (const line of entry.lines) {
      const bal = balances.get(line.accountId);
      if (!bal) continue;
      bal.debitCents += line.debitCents;
      bal.creditCents += line.creditCents;
    }
  }
  for (const account of accounts) {
    const bal = balances.get(account.id)!;
    const net = bal.debitCents - bal.creditCents;
    bal.balanceCents = account.normalBalance === 'Debit' ? net : -net;
  }
  return balances;
}
