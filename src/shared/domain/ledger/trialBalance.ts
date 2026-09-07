import type { Account, JournalEntry } from '../types';
import { computeAccountBalances, filterEntriesByDateRange } from './computeAccountBalances';

export interface TrialBalanceRow {
  account: Account;
  debitCents: number;
  creditCents: number;
}

export interface TrialBalanceResult {
  asOfDate: string;
  rows: TrialBalanceRow[];
  totalDebitCents: number;
  totalCreditCents: number;
  isBalanced: boolean;
}

export function trialBalance(
  accounts: Account[],
  entries: JournalEntry[],
  asOfDate: string,
): TrialBalanceResult {
  const filtered = filterEntriesByDateRange(entries, undefined, asOfDate);
  const balances = computeAccountBalances(accounts, filtered);

  const rows: TrialBalanceRow[] = [];
  let totalDebitCents = 0;
  let totalCreditCents = 0;

  for (const account of accounts) {
    const bal = balances.get(account.id)!.balanceCents;
    if (bal === 0) continue;
    const debitCents = account.normalBalance === 'Debit' ? Math.max(bal, 0) : Math.max(-bal, 0);
    const creditCents = account.normalBalance === 'Credit' ? Math.max(bal, 0) : Math.max(-bal, 0);
    rows.push({ account, debitCents, creditCents });
    totalDebitCents += debitCents;
    totalCreditCents += creditCents;
  }

  rows.sort((a, b) => a.account.code.localeCompare(b.account.code));

  return {
    asOfDate,
    rows,
    totalDebitCents,
    totalCreditCents,
    isBalanced: totalDebitCents === totalCreditCents,
  };
}
