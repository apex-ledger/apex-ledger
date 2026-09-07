import { parseCsvRows } from './parseCsv';
import type { IifTransaction, IifTransactionLine } from './parseIif';
import type { ParseJournalCsvResult } from './parseJournalCsv';
import { parseImportDate, parseImportMoney, splitHeaderAndRows } from './reportLayout';

/**
 * QuickBooks Online's own report exports (Reports → Journal / General Ledger → Export to Excel or
 * CSV), recognised from their headers so nobody has to map columns:
 *
 *   Journal         Date | Transaction Type | Num | Name | Memo/Description | Account | Debit | Credit
 *                   One transaction spans several rows; only its first row carries the date, type,
 *                   number and name. A row of totals and a blank row follow each transaction.
 *
 *   General Ledger  (blank) | Date | Transaction Type | # | Adj | Name | Memo/Description | Split | Debit | Credit | Balance …
 *                   Grouped by account: the account name sits alone on a row in the first column,
 *                   then that account's lines, then "Total for <account>". Each line of a transaction
 *                   therefore appears under its own account, so the lines are gathered back into
 *                   transactions by date + type + number + name.
 *
 * Both start with title rows (company, report, period). Amount-only exports (a single signed
 * "Amount" column) are read as debit when positive and credit when negative.
 */
export type QuickBooksReportKind = 'journal' | 'generalLedger';

export interface QuickBooksReportColumns {
  kind: QuickBooksReportKind;
  date: number;
  type: number;
  num: number;
  name: number;
  memo: number;
  account: number;
  debit: number;
  credit: number;
  amount: number;
}

export interface ParseQuickBooksReportResult extends ParseJournalCsvResult {
  kind: QuickBooksReportKind;
  /** The title rows above the header — usually company name, report name, period. */
  titles: string[];
}

const HEADER_PATTERNS: Record<Exclude<keyof QuickBooksReportColumns, 'kind'>, RegExp> = {
  date: /^date$/i,
  type: /^(transaction\s*)?type$/i,
  num: /^(num|#|no\.?|number|ref(erence)?\s*(no\.?|#)?)$/i,
  name: /^name$/i,
  memo: /^(memo\/description|memo|description)$/i,
  account: /^(account|split)$/i,
  debit: /^debit$/i,
  credit: /^credit$/i,
  amount: /^amount$/i,
};

function columnIndexes(header: string[]): QuickBooksReportColumns | null {
  const find = (pattern: RegExp) => header.findIndex((cell) => pattern.test(cell.trim()));
  const columns = {
    date: find(HEADER_PATTERNS.date),
    type: find(HEADER_PATTERNS.type),
    num: find(HEADER_PATTERNS.num),
    name: find(HEADER_PATTERNS.name),
    memo: find(HEADER_PATTERNS.memo),
    account: find(HEADER_PATTERNS.account),
    debit: find(HEADER_PATTERNS.debit),
    credit: find(HEADER_PATTERNS.credit),
    amount: find(HEADER_PATTERNS.amount),
  };
  if (columns.date < 0 || columns.type < 0 || columns.account < 0) return null;
  if ((columns.debit < 0 || columns.credit < 0) && columns.amount < 0) return null;
  const kind: QuickBooksReportKind = /^split$/i.test(header[columns.account].trim()) ? 'generalLedger' : 'journal';
  return { kind, ...columns };
}

/** The report kind when the file is a QuickBooks Online Journal or General Ledger export, else null. */
export function detectQuickBooksReport(csvText: string): QuickBooksReportKind | null {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) return null;
  return columnIndexes(splitHeaderAndRows(rows).header)?.kind ?? null;
}

const SKIP_FIRST_CELL = /^(beginning balance|opening balance|total(\s+for\b.*)?|net (income|change))$/i;

function cell(row: string[], index: number): string {
  return index >= 0 ? (row[index] ?? '').trim() : '';
}

function amounts(row: string[], columns: QuickBooksReportColumns): { debitCents: number; creditCents: number } {
  if (columns.debit >= 0 && columns.credit >= 0) {
    return { debitCents: parseImportMoney(cell(row, columns.debit)), creditCents: parseImportMoney(cell(row, columns.credit)) };
  }
  const signed = parseImportMoney(cell(row, columns.amount));
  return signed >= 0 ? { debitCents: signed, creditCents: 0 } : { debitCents: 0, creditCents: -signed };
}

function hasAmount(row: string[], columns: QuickBooksReportColumns): boolean {
  const { debitCents, creditCents } = amounts(row, columns);
  return debitCents !== 0 || creditCents !== 0;
}

interface Group {
  date: string;
  type: string;
  num: string;
  name: string;
  memo: string | null;
  lines: IifTransactionLine[];
}

function finish(group: Group): IifTransaction {
  const totalDebit = group.lines.reduce((sum, line) => sum + line.debitCents, 0);
  const totalCredit = group.lines.reduce((sum, line) => sum + line.creditCents, 0);
  const memoParts = [group.name, group.memo].filter((part, index, all): part is string => !!part && all.indexOf(part) === index);
  return {
    date: group.date,
    memo: memoParts.length > 0 ? memoParts.join(' — ') : group.type || null,
    docNumber: group.num || null,
    lines: group.lines,
    balanced: group.lines.length >= 2 && totalDebit === totalCredit,
  };
}

export function parseQuickBooksReport(csvText: string): ParseQuickBooksReportResult {
  const rows = parseCsvRows(csvText);
  const empty = (kind: QuickBooksReportKind, warning: string): ParseQuickBooksReportResult => ({ kind, titles: [], transactions: [], accountNamesReferenced: [], warnings: [warning] });
  if (rows.length === 0) return empty('journal', 'The file is empty.');
  const { header, headerIndex, body } = splitHeaderAndRows(rows);
  const columns = columnIndexes(header);
  if (!columns) return empty('journal', 'This file is not a QuickBooks Online Journal or General Ledger export — map its columns instead.');
  const titles = rows.slice(0, headerIndex).map((row) => row.find((value) => value.trim() !== '')?.trim() ?? '').filter(Boolean);

  const warnings: string[] = [];
  const accountNames = new Set<string>();
  const order: Group[] = [];
  const byKey = new Map<string, Group>();
  let current: Group | null = null;
  let section = '';
  let unreadableDates = 0;

  for (const row of body) {
    if (row.every((value) => value.trim() === '')) continue;
    const first = (row[0] ?? '').trim();
    const dateText = cell(row, columns.date);

    if (columns.kind === 'generalLedger') {
      if (!dateText) {
        // Account section header, "Beginning Balance", "Total for …", or the grand total.
        if (first && !SKIP_FIRST_CELL.test(first) && !hasAmount(row, columns)) section = first;
        continue;
      }
      const date = parseImportDate(dateText);
      if (!date) {
        unreadableDates += 1;
        continue;
      }
      if (!section) {
        warnings.push(`Row dated ${dateText} appears before any account heading — skipped.`);
        continue;
      }
      const type = cell(row, columns.type);
      const num = cell(row, columns.num);
      const name = cell(row, columns.name);
      const memo = cell(row, columns.memo) || null;
      const key = [date, type, num, name].join('|');
      let group = byKey.get(key);
      if (!group) {
        group = { date, type, num, name, memo, lines: [] };
        byKey.set(key, group);
        order.push(group);
      }
      accountNames.add(section);
      group.lines.push({ accountName: section, memo, ...amounts(row, columns) });
      continue;
    }

    // Journal: a dated row opens a transaction; the undated rows after it are its remaining lines.
    if (dateText) {
      const date = parseImportDate(dateText);
      if (!date) {
        // "TOTAL" and similar summary rows sit in the date column; anything else is unreadable.
        if (!SKIP_FIRST_CELL.test(dateText)) unreadableDates += 1;
        current = null;
        continue;
      }
      current = { date, type: cell(row, columns.type), num: cell(row, columns.num), name: cell(row, columns.name), memo: cell(row, columns.memo) || null, lines: [] };
      order.push(current);
    }
    const accountName = cell(row, columns.account);
    if (!current || !accountName) continue; // the per-transaction totals row has no account
    accountNames.add(accountName);
    current.lines.push({ accountName, memo: cell(row, columns.memo) || null, ...amounts(row, columns) });
  }

  if (unreadableDates > 0) warnings.push(`${unreadableDates} row${unreadableDates === 1 ? '' : 's'} with an unreadable date were skipped.`);
  const transactions = order.filter((group) => group.lines.length > 0).map(finish);
  const unbalanced = transactions.filter((transaction) => !transaction.balanced).length;
  if (unbalanced > 0) {
    const hint = columns.kind === 'generalLedger' ? ' — a General Ledger export filtered to some accounts only shows part of each transaction; export it for all accounts, or use the Journal report' : '';
    warnings.push(`${unbalanced} transaction${unbalanced === 1 ? ' does' : 's do'} not balance and will be skipped${hint}.`);
  }
  return { kind: columns.kind, titles, transactions, accountNamesReferenced: Array.from(accountNames).sort(), warnings };
}
