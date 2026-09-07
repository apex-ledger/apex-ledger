import type { Account, JournalEntry } from '../types';
import { filterEntriesByDateRange } from './computeAccountBalances';

/** The transaction-listing reports: the Journal, a flat list by date, and the integrity check that
 * finds entries which should not exist.
 *
 * All three are the same data seen three ways, so they share one module rather than three
 * near-identical passes that could drift apart.
 */

export interface JournalReportLine {
  accountId: number;
  accountCode: string;
  accountName: string;
  description: string | null;
  debitCents: number;
  creditCents: number;
  contactName: string | null;
}

export interface JournalReportEntry {
  entryId: number;
  createdBy: string | null;
  entryDate: string;
  /** When the entry was keyed in (stored UTC) — the Entered column beside Date. */
  createdAt: string;
  memo: string | null;
  reference: string | null;
  status: JournalEntry['status'];
  isAdjustingEntry: boolean;
  source: string;
  lines: JournalReportLine[];
  totalDebitCents: number;
  totalCreditCents: number;
}

export interface JournalReportResult {
  periodStart: string;
  periodEnd: string;
  entries: JournalReportEntry[];
  totalDebitCents: number;
  totalCreditCents: number;
}

/** Every entry in the period, with both sides of each one — the classic journal. Draft and voided
 * entries are included but marked, because "what did we enter" is a different question from "what
 * affects the balances", and a listing that hid them would make an entry someone is looking for
 * simply not be there. */
export function journalReport(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart: string,
  periodEnd: string,
  contactNames: Map<number, string> = new Map(),
  options: { postedOnly?: boolean } = {},
): JournalReportResult {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const out: JournalReportEntry[] = [];

  for (const entry of filterEntriesByDateRange(entries, periodStart, periodEnd)) {
    if (options.postedOnly && entry.status !== 'posted') continue;
    const lines: JournalReportLine[] = [...entry.lines]
      .sort((a, b) => a.lineOrder - b.lineOrder)
      .map((line) => {
        const account = byId.get(line.accountId);
        const contactId = line.customerId ?? line.vendorId;
        return {
          accountId: line.accountId,
          accountCode: account?.code ?? '',
          accountName: account?.name ?? 'Unknown account',
          description: line.description,
          debitCents: line.debitCents,
          creditCents: line.creditCents,
          contactName: contactId != null ? contactNames.get(contactId) ?? null : null,
        };
      });
    out.push({
      entryId: entry.id,
      createdBy: entry.createdBy ?? null,
      entryDate: entry.entryDate,
      createdAt: entry.createdAt,
      memo: entry.memo,
      reference: entry.reference,
      status: entry.status,
      isAdjustingEntry: entry.isAdjustingEntry,
      source: entry.source ?? 'manual',
      lines,
      totalDebitCents: lines.reduce((sum, l) => sum + l.debitCents, 0),
      totalCreditCents: lines.reduce((sum, l) => sum + l.creditCents, 0),
    });
  }

  out.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.entryId - b.entryId);

  return {
    periodStart,
    periodEnd,
    entries: out,
    // Posted entries only: a draft or voided entry contributes to no balance, so including it in
    // the totals would make the report disagree with the trial balance for no good reason.
    totalDebitCents: out.filter((e) => e.status === 'posted').reduce((sum, e) => sum + e.totalDebitCents, 0),
    totalCreditCents: out.filter((e) => e.status === 'posted').reduce((sum, e) => sum + e.totalCreditCents, 0),
  };
}

export type InvalidReason =
  | 'unbalanced'
  | 'no-lines'
  | 'single-line'
  | 'zero-amount'
  | 'both-sides-on-one-line'
  | 'missing-account';

export interface InvalidTransaction {
  entryId: number;
  entryDate: string;
  /** When the entry was keyed in (stored UTC) — the Entered column beside Date. */
  createdAt: string;
  memo: string | null;
  status: JournalEntry['status'];
  reasons: InvalidReason[];
  totalDebitCents: number;
  totalCreditCents: number;
}

export const INVALID_REASON_TEXT: Record<InvalidReason, string> = {
  unbalanced: 'Debits do not equal credits',
  'no-lines': 'The entry has no lines at all',
  'single-line': 'Only one line — an entry needs at least two sides',
  'zero-amount': 'Every line is zero',
  'both-sides-on-one-line': 'A line carries both a debit and a credit',
  'missing-account': 'A line points at an account that no longer exists',
};

/** Entries that could not be right, whatever anyone intended.
 *
 * Posting validates all of this, so a POSTED entry failing here means something got in another way
 * — an interrupted write, a file edited by an older version, a bad import. Drafts are checked too
 * but are expected to be incomplete while being typed, so they are reported separately by status
 * rather than treated as corruption. */
export function invalidTransactions(accounts: Account[], entries: JournalEntry[], periodStart?: string, periodEnd?: string): InvalidTransaction[] {
  const accountIds = new Set(accounts.map((a) => a.id));
  const out: InvalidTransaction[] = [];

  const periodEntries = periodStart && periodEnd ? filterEntriesByDateRange(entries, periodStart, periodEnd) : entries;
  for (const entry of periodEntries) {
    if (entry.status === 'void') continue; // deliberately reversed, not broken
    const reasons: InvalidReason[] = [];
    const totalDebitCents = entry.lines.reduce((sum, l) => sum + l.debitCents, 0);
    const totalCreditCents = entry.lines.reduce((sum, l) => sum + l.creditCents, 0);

    if (entry.lines.length === 0) reasons.push('no-lines');
    else if (entry.lines.length === 1) reasons.push('single-line');
    if (entry.lines.length > 0 && totalDebitCents !== totalCreditCents) reasons.push('unbalanced');
    if (entry.lines.length > 0 && totalDebitCents === 0 && totalCreditCents === 0) reasons.push('zero-amount');
    if (entry.lines.some((l) => l.debitCents > 0 && l.creditCents > 0)) reasons.push('both-sides-on-one-line');
    if (entry.lines.some((l) => !accountIds.has(l.accountId))) reasons.push('missing-account');

    if (reasons.length > 0) {
      out.push({
        entryId: entry.id,
        entryDate: entry.entryDate,
        createdAt: entry.createdAt,
        memo: entry.memo,
        status: entry.status,
        reasons,
        totalDebitCents,
        totalCreditCents,
      });
    }
  }

  // Posted problems first: those are the ones affecting real balances.
  return out.sort(
    (a, b) =>
      Number(b.status === 'posted') - Number(a.status === 'posted') ||
      a.entryDate.localeCompare(b.entryDate) ||
      a.entryId - b.entryId,
  );
}
