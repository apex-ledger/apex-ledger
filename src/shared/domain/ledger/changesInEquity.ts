import type { Account, JournalEntry } from '../types';
import { computeAccountBalances, filterEntriesByDateRange } from './computeAccountBalances';

/** Statement of Changes in Equity: how each equity account got from its opening balance to its
 * closing one over a period.
 *
 * The wrinkle is retained earnings. This ledger posts no year-end closing entry, so profit sits in
 * revenue and expense accounts rather than having been rolled into an equity account — the balance
 * sheet handles that by folding cumulative net income into equity as a synthetic line. The same
 * applies here: the period's profit is shown as its own movement row, because otherwise the
 * statement would report that equity barely changed in a year the business earned a fortune.
 */

export interface EquityMovementRow {
  label: string;
  accountId: number | null;
  openingCents: number;
  movementCents: number;
  closingCents: number;
  /** Set on the synthetic profit row, which has no account of its own behind it. */
  isDerived?: boolean;
}

export interface ChangesInEquityResult {
  periodStart: string;
  periodEnd: string;
  rows: EquityMovementRow[];
  totalOpeningCents: number;
  totalMovementCents: number;
  totalClosingCents: number;
  /** The period's own profit, shown as a movement row rather than buried in an account. */
  netIncomeCents: number;
}

/** Cumulative revenue less expenses over whatever entries are passed in. */
function netIncomeOf(accounts: Account[], entries: JournalEntry[]): number {
  const revenueAndExpense = accounts.filter((a) => a.accountType === 'Revenue' || a.accountType === 'Expense');
  const balances = computeAccountBalances(revenueAndExpense, entries);
  let net = 0;
  for (const account of revenueAndExpense) {
    const bal = balances.get(account.id)?.balanceCents ?? 0;
    net += account.accountType === 'Revenue' ? bal : -bal;
  }
  return net;
}

export function changesInEquity(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart: string,
  periodEnd: string,
): ChangesInEquityResult {
  const equityAccounts = accounts.filter((a) => a.accountType === 'Equity');

  const priorEntries = entries.filter((e) => e.entryDate < periodStart);
  const throughEntries = filterEntriesByDateRange(entries, undefined, periodEnd);
  const periodEntries = filterEntriesByDateRange(entries, periodStart, periodEnd);

  const opening = computeAccountBalances(accounts, priorEntries);
  const closing = computeAccountBalances(accounts, throughEntries);

  const rows: EquityMovementRow[] = [];
  for (const account of equityAccounts) {
    const openingCents = opening.get(account.id)?.balanceCents ?? 0;
    const closingCents = closing.get(account.id)?.balanceCents ?? 0;
    // An account that was nil throughout adds nothing but noise.
    if (openingCents === 0 && closingCents === 0) continue;
    rows.push({
      label: account.name,
      accountId: account.id,
      openingCents,
      movementCents: closingCents - openingCents,
      closingCents,
    });
  }

  // Profit earned before this period opened is part of opening equity; profit earned during it is
  // the movement. Splitting it this way is what makes the row's arithmetic hold.
  const priorNetIncomeCents = netIncomeOf(accounts, priorEntries);
  const netIncomeCents = netIncomeOf(accounts, periodEntries);
  if (priorNetIncomeCents !== 0 || netIncomeCents !== 0) {
    rows.push({
      label: 'Retained earnings (undistributed profit)',
      accountId: null,
      openingCents: priorNetIncomeCents,
      movementCents: netIncomeCents,
      closingCents: priorNetIncomeCents + netIncomeCents,
      isDerived: true,
    });
  }

  const totalOpeningCents = rows.reduce((sum, r) => sum + r.openingCents, 0);
  const totalMovementCents = rows.reduce((sum, r) => sum + r.movementCents, 0);
  const totalClosingCents = rows.reduce((sum, r) => sum + r.closingCents, 0);

  return {
    periodStart,
    periodEnd,
    rows,
    totalOpeningCents,
    totalMovementCents,
    totalClosingCents,
    netIncomeCents,
  };
}
