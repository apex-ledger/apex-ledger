import type { Account, ForeignCurrencyCode, JournalEntry, JournalEntryLine, JournalEntrySource } from '../types';
import { computeAccountBalances, filterEntriesByDateRange } from './computeAccountBalances';
import { suggestTaxCents } from './computeTaxSplit';

export interface GeneralLedgerContext {
  allAccounts?: Account[];
  customerNames?: Map<number, string>;
  vendorNames?: Map<number, string>;
  transactionTypes?: Map<number, string>;
}

export interface GeneralLedgerLine {
  entryId: number;
  createdBy: string | null;
  entryDate: string;
  /** When the entry was keyed in (stored UTC) — the Entered column beside Date. */
  createdAt: string;
  memo: string | null;
  reference: string | null;
  description: string | null;
  transactionType: string;
  isAdjustment: boolean;
  name: string | null;
  split: string;
  debitCents: number;
  creditCents: number;
  runningBalanceCents: number;
  taxAmountCents: number;
  currency: 'CAD' | ForeignCurrencyCode;
  exchangeRate: number | null;
  foreignAmountCents: number | null;
}

export interface GeneralLedgerResult {
  account: Account;
  openingBalanceCents: number;
  lines: GeneralLedgerLine[];
  closingBalanceCents: number;
}

function dayBefore(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function fallbackTransactionType(source: JournalEntrySource): string {
  if (source === 'quickEntry') return 'Quick Entry';
  if (source === 'bankImport') return 'Bank Import';
  if (source === 'clientImport') return 'Client Import';
  return 'Journal Entry';
}

function lineTaxAmountCents(line: JournalEntryLine): number {
  if (!line.taxCode) return 0;
  if (line.taxCode === 'Manual') return Math.max(0, line.manualHstCents ?? 0);
  return line.baseCents === null ? 0 : suggestTaxCents(line.taxCode, Math.abs(line.baseCents));
}

export function generalLedger(
  account: Account,
  entries: JournalEntry[],
  dateFrom: string,
  dateTo: string,
  context: GeneralLedgerContext = {},
): GeneralLedgerResult {
  const priorEntries = filterEntriesByDateRange(entries, undefined, dayBefore(dateFrom));
  const openingBalanceCents = computeAccountBalances([account], priorEntries).get(account.id)!.balanceCents;

  const periodEntries = filterEntriesByDateRange(entries, dateFrom, dateTo)
    .filter((e) => e.status === 'posted')
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.id - b.id);

  let running = openingBalanceCents;
  const lines: GeneralLedgerLine[] = [];
  const accountNames = new Map((context.allAccounts ?? [account]).map((row) => [row.id, row.name]));

  for (const entry of periodEntries) {
    for (const line of entry.lines) {
      if (line.accountId !== account.id) continue;
      const signedDelta =
        account.normalBalance === 'Debit'
          ? line.debitCents - line.creditCents
          : line.creditCents - line.debitCents;
      running += signedDelta;
      const counterpartNames = [...new Set(entry.lines.filter((other) => other.id !== line.id).map((other) => accountNames.get(other.accountId) ?? 'Unknown account'))];
      const split = counterpartNames.length === 1 ? counterpartNames[0] : counterpartNames.length > 1 ? 'Split' : '—';
      lines.push({
        entryId: entry.id,
        createdBy: entry.createdBy ?? null,
        entryDate: entry.entryDate,
        createdAt: entry.createdAt,
        memo: entry.memo,
        reference: entry.reference,
        description: line.description,
        transactionType: context.transactionTypes?.get(entry.id) ?? fallbackTransactionType(entry.source),
        isAdjustment: entry.isAdjustingEntry,
        name: line.customerId !== null
          ? context.customerNames?.get(line.customerId) ?? null
          : line.vendorId !== null
            ? context.vendorNames?.get(line.vendorId) ?? null
            : null,
        split,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        runningBalanceCents: running,
        taxAmountCents: lineTaxAmountCents(line),
        currency: line.foreignCurrency ?? 'CAD',
        exchangeRate: line.exchangeRate,
        foreignAmountCents: line.foreignAmountCents,
      });
    }
  }

  return { account, openingBalanceCents, lines, closingBalanceCents: running };
}
