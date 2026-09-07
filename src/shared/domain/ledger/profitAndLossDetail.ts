import type { Account, JournalEntry } from '../types';
import { filterEntriesByDateRange } from './computeAccountBalances';

/** Profit and Loss with the transactions behind every figure, and the same figures split by
 * customer.
 *
 * The income statement gives a total per account; the question that follows is always "what is in
 * that number?", and answering it meant opening the General Ledger one account at a time. Both
 * reports here are built from the same pass over posted lines so they cannot disagree with each
 * other or with the income statement.
 */

export interface PlDetailLine {
  entryId: number;
  entryDate: string;
  /** When the entry was keyed in (stored UTC) — the Entered column beside Date. */
  createdAt: string;
  memo: string | null;
  reference: string | null;
  description: string | null;
  /** Signed in the account's own direction: positive is revenue earned or expense incurred. */
  amountCents: number;
  contactName: string | null;
}

export interface PlDetailAccount {
  account: Account;
  lines: PlDetailLine[];
  totalCents: number;
}

export interface PlDetailSection {
  label: 'Revenue' | 'Expenses';
  accounts: PlDetailAccount[];
  totalCents: number;
}

export interface ProfitAndLossDetailResult {
  periodStart: string;
  periodEnd: string;
  revenue: PlDetailSection;
  expenses: PlDetailSection;
  netIncomeCents: number;
}

/** A line's contribution in its account's own direction: revenue is credit-normal, so a credit
 * increases it; an expense is debit-normal. Reversals therefore come through negative, which is
 * what makes a credit note or a refund reduce the account rather than inflate it. */
function signedFor(account: Account, debitCents: number, creditCents: number): number {
  return account.normalBalance === 'Credit' ? creditCents - debitCents : debitCents - creditCents;
}

export function profitAndLossDetail(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart: string,
  periodEnd: string,
  contactNames: Map<number, string> = new Map(),
): ProfitAndLossDetailResult {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const buckets = new Map<number, PlDetailLine[]>();

  for (const entry of filterEntriesByDateRange(entries, periodStart, periodEnd)) {
    if (entry.status !== 'posted') continue;
    for (const line of entry.lines) {
      const account = byId.get(line.accountId);
      if (!account || (account.accountType !== 'Revenue' && account.accountType !== 'Expense')) continue;
      const amountCents = signedFor(account, line.debitCents, line.creditCents);
      if (amountCents === 0) continue;
      const contactId = line.customerId ?? line.vendorId;
      if (!buckets.has(account.id)) buckets.set(account.id, []);
      buckets.get(account.id)!.push({
        entryId: entry.id,
        entryDate: entry.entryDate,
        createdAt: entry.createdAt,
        memo: entry.memo,
        reference: entry.reference,
        description: line.description,
        amountCents,
        contactName: contactId != null ? contactNames.get(contactId) ?? null : null,
      });
    }
  }

  function section(label: 'Revenue' | 'Expenses'): PlDetailSection {
    const type = label === 'Revenue' ? 'Revenue' : 'Expense';
    const withLines: PlDetailAccount[] = [];
    for (const account of accounts) {
      if (account.accountType !== type) continue;
      const lines = (buckets.get(account.id) ?? []).sort(
        (a, b) => a.entryDate.localeCompare(b.entryDate) || a.entryId - b.entryId,
      );
      // An account with no activity in the period adds a heading and nothing else.
      if (lines.length === 0) continue;
      withLines.push({ account, lines, totalCents: lines.reduce((sum, l) => sum + l.amountCents, 0) });
    }
    withLines.sort((a, b) => a.account.code.localeCompare(b.account.code));
    return { label, accounts: withLines, totalCents: withLines.reduce((sum, a) => sum + a.totalCents, 0) };
  }

  const revenue = section('Revenue');
  const expenses = section('Expenses');
  return {
    periodStart,
    periodEnd,
    revenue,
    expenses,
    netIncomeCents: revenue.totalCents - expenses.totalCents,
  };
}

export interface PlByCustomerRow {
  customerId: number | null;
  customerName: string;
  revenueCents: number;
  /** Only the costs actually tagged to this customer. Most overheads are not, which is why the
   * report reports this separately rather than pretending to a full profit figure. */
  directCostCents: number;
  marginCents: number;
}

export interface ProfitAndLossByCustomerResult {
  periodStart: string;
  periodEnd: string;
  rows: PlByCustomerRow[];
  totalRevenueCents: number;
  totalDirectCostCents: number;
  /** Revenue posted with no customer against it — a counter sale, or a line nobody tagged. Kept
   * visible as its own row rather than spread across the named customers, which would invent an
   * attribution the books do not contain. */
  untaggedRevenueCents: number;
}

export function profitAndLossByCustomer(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart: string,
  periodEnd: string,
  contactNames: Map<number, string> = new Map(),
): ProfitAndLossByCustomerResult {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const rows = new Map<number | null, PlByCustomerRow>();

  const rowFor = (customerId: number | null): PlByCustomerRow => {
    if (!rows.has(customerId)) {
      rows.set(customerId, {
        customerId,
        customerName: customerId === null ? 'No customer recorded' : contactNames.get(customerId) ?? 'Unknown customer',
        revenueCents: 0,
        directCostCents: 0,
        marginCents: 0,
      });
    }
    return rows.get(customerId)!;
  };

  for (const entry of filterEntriesByDateRange(entries, periodStart, periodEnd)) {
    if (entry.status !== 'posted') continue;
    for (const line of entry.lines) {
      const account = byId.get(line.accountId);
      if (!account) continue;
      if (account.accountType === 'Revenue') {
        rowFor(line.customerId ?? null).revenueCents += signedFor(account, line.debitCents, line.creditCents);
      } else if (account.accountType === 'Expense' && line.customerId != null) {
        // Only counted when the cost is explicitly tagged to a customer; untagged overhead belongs
        // to the business, not to whoever happens to be on the report.
        rowFor(line.customerId).directCostCents += signedFor(account, line.debitCents, line.creditCents);
      }
    }
  }

  const list = [...rows.values()];
  for (const row of list) row.marginCents = row.revenueCents - row.directCostCents;
  list.sort((a, b) => b.revenueCents - a.revenueCents || a.customerName.localeCompare(b.customerName));

  return {
    periodStart,
    periodEnd,
    rows: list,
    totalRevenueCents: list.reduce((sum, r) => sum + r.revenueCents, 0),
    totalDirectCostCents: list.reduce((sum, r) => sum + r.directCostCents, 0),
    untaggedRevenueCents: rows.get(null)?.revenueCents ?? 0,
  };
}
