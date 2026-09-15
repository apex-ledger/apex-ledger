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

/** Which side of the books a ledger line came from. A reviewer reading a year of someone else's
 * bookkeeping asks three different questions of one account — what did sales put here, what did
 * bills put here, and what did somebody key in by hand — and a single undifferentiated list
 * answers none of them. "Manual" means keyed rather than raised from a document, so Quick Entry
 * belongs with journal entries: neither has an invoice or a bill behind it. */
export type LedgerEntryGroup = 'sales' | 'purchases' | 'manual' | 'payrollTax' | 'banking' | 'other';

export const LEDGER_ENTRY_GROUP_LABELS: Record<LedgerEntryGroup, string> = {
  sales: 'Sales',
  purchases: 'Bills & expenses',
  manual: 'Manual entries',
  payrollTax: 'Payroll & tax',
  banking: 'Bank & imports',
  other: 'Other',
};

const GROUP_BY_TRANSACTION_TYPE: Record<string, LedgerEntryGroup> = {
  Invoice: 'sales',
  'Customer Payment': 'sales',
  'Sales Receipt': 'sales',
  Deposit: 'sales',
  'Customer Credit': 'sales',
  'Customer Refund': 'sales',
  Bill: 'purchases',
  'Bill Payment': 'purchases',
  'Vendor Credit': 'purchases',
  'Vendor Refund': 'purchases',
  'Mileage Claim': 'purchases',
  'Inventory Receipt': 'purchases',
  Payroll: 'payrollTax',
  'GST/HST Filing': 'payrollTax',
  'T5 Payment': 'payrollTax',
  'Journal Entry': 'manual',
  'Quick Entry': 'manual',
  'Bank Import': 'banking',
  'Client Import': 'banking',
  'Inventory Adjustment': 'other',
};

export function ledgerEntryGroup(transactionType: string): LedgerEntryGroup {
  return GROUP_BY_TRANSACTION_TYPE[transactionType] ?? 'other';
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
