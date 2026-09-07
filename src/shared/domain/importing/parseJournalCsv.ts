import { parseCsvRows } from './parseCsv';
import type { IifTransaction, IifTransactionLine } from './parseIif';
import { parseImportDate, parseImportMoney, splitHeaderAndRows } from './reportLayout';

export interface JournalCsvColumnMapping {
  /** Ties multiple CSV rows together into one journal entry — e.g. QuickBooks Online's "Trans #"
   * or "Num" column on its Journal report export. Required: without an explicit grouping column,
   * guessing which rows belong together (by date, by description) risks silently merging separate
   * transactions or splitting one apart. */
  transactionKeyColumn: string;
  dateColumn: string;
  accountColumn: string;
  debitColumn: string;
  creditColumn: string;
  descriptionColumn: string | null;
}

export interface ParseJournalCsvResult {
  transactions: IifTransaction[];
  /** Every distinct account name referenced by the file, sorted — the caller checks these against
   * the Chart of Accounts before import (see the module doc comment below). */
  accountNamesReferenced: string[];
  warnings: string[];
}

/** The header row — found past any report title rows (see reportLayout.ts). */
export function getCsvHeaders(csvText: string): string[] {
  return splitHeaderAndRows(parseCsvRows(csvText)).header;
}

const parseFlexibleDate = parseImportDate;
const parseMoneyToCents = parseImportMoney;

/**
 * Parses a generic multi-line "Journal"-style CSV export — the shape QuickBooks Online's own
 * Journal report produces (one row per debit/credit line; several consecutive rows sharing a
 * transaction number make up one journal entry). Column names are whatever the user mapped them
 * to, since QBO's exact header wording varies by report type/locale and hasn't been verified
 * against a primary sample in this codebase.
 *
 * Deliberately does NOT create accounts: a journal export doesn't carry reliable account-type
 * information the way QuickBooks Desktop's IIF does, so guessing here would risk silently
 * mis-classifying a bank or equity account as an expense. Import the Chart of Accounts CSV first
 * (see parseAccountsCsv.ts) so every account name this file references already exists — anything
 * that doesn't resolve is reported in accountNamesReferenced/warnings, never auto-created.
 */
export function parseJournalCsv(csvText: string, mapping: JournalCsvColumnMapping): ParseJournalCsvResult {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) return { transactions: [], accountNamesReferenced: [], warnings: ['The file is empty.'] };
  const { header, body } = splitHeaderAndRows(rows);
  const keyIdx = header.indexOf(mapping.transactionKeyColumn);
  const dateIdx = header.indexOf(mapping.dateColumn);
  const accountIdx = header.indexOf(mapping.accountColumn);
  const debitIdx = header.indexOf(mapping.debitColumn);
  const creditIdx = header.indexOf(mapping.creditColumn);
  const descIdx = mapping.descriptionColumn ? header.indexOf(mapping.descriptionColumn) : -1;

  const warnings: string[] = [];
  const order: string[] = [];
  const groups = new Map<string, { date: string | null; memo: string | null; lines: IifTransactionLine[] }>();
  const accountNames = new Set<string>();

  for (const row of body) {
    if (row.every((c) => c.trim() === '')) continue;
    const key = row[keyIdx]?.trim();
    const accountName = row[accountIdx]?.trim();
    if (!key || !accountName) continue;

    const date = parseFlexibleDate(row[dateIdx] ?? '');
    const description = descIdx >= 0 ? row[descIdx]?.trim() || null : null;
    const debitCents = parseMoneyToCents(row[debitIdx] ?? '');
    const creditCents = parseMoneyToCents(row[creditIdx] ?? '');
    accountNames.add(accountName);

    if (!groups.has(key)) {
      groups.set(key, { date, memo: description, lines: [] });
      order.push(key);
    }
    const group = groups.get(key)!;
    if (!group.date && date) group.date = date;
    group.lines.push({ accountName, debitCents, creditCents, memo: description });
  }

  const transactions: IifTransaction[] = [];
  for (const key of order) {
    const g = groups.get(key)!;
    if (!g.date) {
      warnings.push(`Transaction "${key}": couldn't parse a date on any of its lines — skipped.`);
      continue;
    }
    const totalDebit = g.lines.reduce((s, l) => s + l.debitCents, 0);
    const totalCredit = g.lines.reduce((s, l) => s + l.creditCents, 0);
    transactions.push({
      date: g.date,
      memo: g.memo,
      docNumber: key,
      lines: g.lines,
      balanced: g.lines.length >= 2 && totalDebit === totalCredit,
    });
  }

  return { transactions, accountNamesReferenced: Array.from(accountNames).sort(), warnings };
}
