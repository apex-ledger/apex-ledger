import type { Account, JournalEntry } from '../types';

/**
 * The foreign balance of an account held in a foreign currency — a USD chequing account's USD
 * balance. The ledger only ever holds CAD; the foreign figure is rebuilt from the foreign amounts
 * carried on each posted line in the account's currency (a deposit of USD 1,000 booked at 1.35
 * carries USD 1,000 on its bank line). Lines with no foreign amount — an opening balance keyed
 * in CAD, a bank charge — count as zero foreign, which is why a foreign account should always be
 * posted to with its foreign amount.
 */
export interface ForeignBalance {
  accountId: number;
  currency: string;
  foreignCents: number;
  cadCents: number;
}

export function computeForeignBalances(accounts: Account[], entries: JournalEntry[], asOfDate?: string): ForeignBalance[] {
  const foreignAccounts = accounts.filter((account) => account.currency && account.currency !== 'CAD');
  if (foreignAccounts.length === 0) return [];
  const byId = new Map(foreignAccounts.map((account) => [account.id, { account, foreignCents: 0, cadCents: 0 }]));
  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    if (asOfDate && entry.entryDate > asOfDate) continue;
    for (const line of entry.lines) {
      const slot = byId.get(line.accountId);
      if (!slot) continue;
      const sign = slot.account.normalBalance === 'Debit' ? 1 : -1;
      slot.cadCents += sign * (line.debitCents - line.creditCents);
      if (line.foreignCurrency === slot.account.currency && line.foreignAmountCents !== null && line.foreignAmountCents !== undefined) {
        const direction = line.debitCents > 0 ? 1 : line.creditCents > 0 ? -1 : 0;
        slot.foreignCents += sign * direction * line.foreignAmountCents;
      }
    }
  }
  return [...byId.values()].map(({ account, foreignCents, cadCents }) => ({ accountId: account.id, currency: account.currency as string, foreignCents, cadCents }));
}
