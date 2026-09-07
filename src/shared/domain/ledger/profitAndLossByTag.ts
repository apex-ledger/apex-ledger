import type { Account, JournalEntry } from '../types';
import { filterEntriesByDateRange } from './computeAccountBalances';

/** Profit and loss with a tag group across the top.
 *
 * The report accounts alone cannot produce: how did each store do, which job made money, what did
 * that vehicle cost to run. Adding accounts for it does not work — a five-store grocery would need
 * five copies of every expense account, and the chart becomes unreadable long before it becomes
 * useful.
 *
 * The untagged column is not an oversight and is not hidden. Overheads usually carry no tag at all,
 * and quietly spreading them across the tagged columns would invent an allocation the books do not
 * contain — every store would show a share of head-office rent that nobody ever decided on. Shown
 * as its own column, it is visible and can be argued about.
 */

export interface TaggedLineSource {
  /** Tag ids on this line, from the group being reported on. At most one in practice. */
  tagIds: number[];
}

export interface PlByTagRow {
  account: Account;
  /** Amount per tag id, in the account's own direction. */
  byTag: Map<number, number>;
  untaggedCents: number;
  totalCents: number;
}

export interface PlByTagSection {
  label: 'Revenue' | 'Expenses';
  rows: PlByTagRow[];
  totalByTag: Map<number, number>;
  totalUntaggedCents: number;
  totalCents: number;
}

export interface ProfitAndLossByTagResult {
  periodStart: string;
  periodEnd: string;
  tagIds: number[];
  revenue: PlByTagSection;
  expenses: PlByTagSection;
  netByTag: Map<number, number>;
  netUntaggedCents: number;
  netIncomeCents: number;
}

/** Amount in the account's own direction: revenue rises on a credit, expense on a debit. Reversals
 * therefore come through negative, so a credit note reduces the column rather than inflating it. */
function signedFor(account: Account, debitCents: number, creditCents: number): number {
  return account.normalBalance === 'Credit' ? creditCents - debitCents : debitCents - creditCents;
}

export function profitAndLossByTag(
  accounts: Account[],
  entries: JournalEntry[],
  /** Tag ids belonging to the group being reported on, in the order they should appear. */
  tagIds: number[],
  /** Which tags each journal line carries. Keyed by line id. */
  tagsByLineId: Map<number, number[]>,
  periodStart: string,
  periodEnd: string,
): ProfitAndLossByTagResult {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const wanted = new Set(tagIds);
  const rows = new Map<number, PlByTagRow>();

  for (const entry of filterEntriesByDateRange(entries, periodStart, periodEnd)) {
    if (entry.status !== 'posted') continue;
    for (const line of entry.lines) {
      const account = byId.get(line.accountId);
      if (!account || (account.accountType !== 'Revenue' && account.accountType !== 'Expense')) continue;

      const amountCents = signedFor(account, line.debitCents, line.creditCents);
      if (amountCents === 0) continue;

      if (!rows.has(account.id)) {
        rows.set(account.id, { account, byTag: new Map(), untaggedCents: 0, totalCents: 0 });
      }
      const row = rows.get(account.id)!;
      row.totalCents += amountCents;

      // Only tags from the group being reported on count. A line tagged with a Store and a Job
      // appears once under its Store when the Store group is the one on screen.
      const relevant = (tagsByLineId.get(line.id) ?? []).filter((id) => wanted.has(id));
      if (relevant.length === 0) {
        row.untaggedCents += amountCents;
        continue;
      }
      // A line carrying two tags from one group should not exist — the UI allows one — but if the
      // data ever holds two, splitting evenly is the only answer that keeps the columns adding up
      // to the total. Attributing the whole amount to each would double-count it.
      const share = Math.round(amountCents / relevant.length);
      let assigned = 0;
      relevant.forEach((tagId, index) => {
        // The last tag absorbs the rounding remainder so the parts sum back to the whole.
        const value = index === relevant.length - 1 ? amountCents - assigned : share;
        assigned += value;
        row.byTag.set(tagId, (row.byTag.get(tagId) ?? 0) + value);
      });
    }
  }

  function section(label: 'Revenue' | 'Expenses'): PlByTagSection {
    const type = label === 'Revenue' ? 'Revenue' : 'Expense';
    const sectionRows = [...rows.values()]
      .filter((r) => r.account.accountType === type)
      .sort((a, b) => a.account.code.localeCompare(b.account.code));

    const totalByTag = new Map<number, number>();
    for (const row of sectionRows) {
      for (const [tagId, value] of row.byTag) totalByTag.set(tagId, (totalByTag.get(tagId) ?? 0) + value);
    }
    return {
      label,
      rows: sectionRows,
      totalByTag,
      totalUntaggedCents: sectionRows.reduce((sum, r) => sum + r.untaggedCents, 0),
      totalCents: sectionRows.reduce((sum, r) => sum + r.totalCents, 0),
    };
  }

  const revenue = section('Revenue');
  const expenses = section('Expenses');

  const netByTag = new Map<number, number>();
  for (const tagId of tagIds) {
    netByTag.set(tagId, (revenue.totalByTag.get(tagId) ?? 0) - (expenses.totalByTag.get(tagId) ?? 0));
  }

  return {
    periodStart,
    periodEnd,
    tagIds,
    revenue,
    expenses,
    netByTag,
    netUntaggedCents: revenue.totalUntaggedCents - expenses.totalUntaggedCents,
    netIncomeCents: revenue.totalCents - expenses.totalCents,
  };
}
