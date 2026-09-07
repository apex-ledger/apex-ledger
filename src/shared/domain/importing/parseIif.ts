import type { AccountType } from '../types';

/** QuickBooks Desktop's IIF account-type codes mapped onto this app's Asset/Liability/Equity/
 * Revenue/Expense model. Unrecognized codes fall back to 'Expense' (the safest default — an
 * unmapped account is far more likely to be some flavour of expense than equity or revenue). */
const IIF_ACCOUNT_TYPE_MAP: Record<string, { accountType: AccountType; accountSubtype: string }> = {
  BANK: { accountType: 'Asset', accountSubtype: 'Cash and Bank' },
  AR: { accountType: 'Asset', accountSubtype: 'Current Asset' },
  OCASSET: { accountType: 'Asset', accountSubtype: 'Current Asset' },
  FIXASSET: { accountType: 'Asset', accountSubtype: 'Capital Asset' },
  OASSET: { accountType: 'Asset', accountSubtype: 'Current Asset' },
  CCARD: { accountType: 'Liability', accountSubtype: 'Credit Card' },
  AP: { accountType: 'Liability', accountSubtype: 'Current Liability' },
  CLIAB: { accountType: 'Liability', accountSubtype: 'Current Liability' },
  LTLIAB: { accountType: 'Liability', accountSubtype: 'Long-Term Liability' },
  EQUITY: { accountType: 'Equity', accountSubtype: 'Equity' },
  INC: { accountType: 'Revenue', accountSubtype: 'Revenue' },
  COGS: { accountType: 'Expense', accountSubtype: 'Cost of Sales' },
  EXP: { accountType: 'Expense', accountSubtype: 'Operating Expense' },
  EXINC: { accountType: 'Revenue', accountSubtype: 'Revenue' },
  EXEXP: { accountType: 'Expense', accountSubtype: 'Operating Expense' },
};

export interface IifAccount {
  name: string;
  accountType: AccountType;
  accountSubtype: string;
  description: string | null;
}

export interface IifTransactionLine {
  accountName: string;
  debitCents: number;
  creditCents: number;
  memo: string | null;
}

export interface IifTransaction {
  date: string;
  memo: string | null;
  docNumber: string | null;
  lines: IifTransactionLine[];
  /** True when the lines' debits and credits actually balance — unbalanced transactions (rare,
   * usually a sign of a malformed export) are surfaced so the caller can skip them safely rather
   * than silently posting bad data. */
  balanced: boolean;
}

export interface ParseIifResult {
  accounts: IifAccount[];
  transactions: IifTransaction[];
  /** Non-fatal problems worth showing the user — e.g. a transaction with no lines. */
  warnings: string[];
}

function splitTabLine(line: string): string[] {
  return line.split('\t').map((cell) => cell.trim());
}

function parseIifDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // QuickBooks IIF dates are almost always M/D/YYYY (or M/D/YY).
  const parts = trimmed.split('/');
  if (parts.length === 3) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) year = (Number(year) < 50 ? '20' : '19') + year;
    const monthNum = Number(month);
    const dayNum = Number(day);
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && year.length === 4) {
      return `${year}-${month}-${day}`;
    }
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseIifAmountCents(raw: string): number {
  const cleaned = raw.trim().replace(/[",]/g, '');
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** Parses QuickBooks Desktop's IIF export format: tab-delimited, with `!TYPE` header rows
 * defining field order for the data rows of that type that follow. Chart-of-accounts (`ACCNT`)
 * and transactions (`TRNS`/`SPL`/`ENDTRNS`) are the only record types this extracts — customer/
 * vendor/class lists and anything else in the file are ignored. */
export function parseIif(content: string): ParseIifResult {
  const headers = new Map<string, string[]>();
  const accounts: IifAccount[] = [];
  const transactions: IifTransaction[] = [];
  const warnings: string[] = [];

  let current: { fields: Record<string, string>; lines: IifTransactionLine[] } | null = null;

  function fieldRow(type: string, cells: string[]): Record<string, string> {
    const fields = headers.get(type) ?? [];
    const row: Record<string, string> = {};
    fields.forEach((name, i) => {
      row[name] = cells[i] ?? '';
    });
    return row;
  }

  function lineFromRow(row: Record<string, string>): IifTransactionLine {
    const amountCents = parseIifAmountCents(row.AMOUNT ?? '0');
    return {
      accountName: row.ACCNT ?? '',
      debitCents: amountCents > 0 ? amountCents : 0,
      creditCents: amountCents < 0 ? -amountCents : 0,
      memo: row.MEMO?.trim() || null,
    };
  }

  const rawLines = content.split(/\r\n|\r|\n/);
  for (const rawLine of rawLines) {
    if (!rawLine.trim()) continue;
    const cells = splitTabLine(rawLine);
    const first = cells[0] ?? '';

    if (first.startsWith('!')) {
      headers.set(first.slice(1).toUpperCase(), cells.slice(1));
      continue;
    }

    const type = first.toUpperCase();
    if (type === 'ACCNT') {
      const row = fieldRow('ACCNT', cells.slice(1));
      const name = row.NAME?.trim();
      if (!name) continue;
      const mapped = IIF_ACCOUNT_TYPE_MAP[row.ACCNTTYPE?.trim().toUpperCase()] ?? { accountType: 'Expense' as AccountType, accountSubtype: 'Operating Expense' };
      accounts.push({ name, accountType: mapped.accountType, accountSubtype: mapped.accountSubtype, description: row.DESC?.trim() || null });
    } else if (type === 'TRNS') {
      const row = fieldRow('TRNS', cells.slice(1));
      current = { fields: row, lines: [lineFromRow(row)] };
    } else if (type === 'SPL') {
      const row = fieldRow('SPL', cells.slice(1));
      if (!current) {
        warnings.push('Found a split (SPL) line with no preceding transaction — skipped.');
        continue;
      }
      current.lines.push(lineFromRow(row));
    } else if (type === 'ENDTRNS') {
      if (!current) continue;
      const date = parseIifDate(current.fields.DATE ?? '');
      if (!date) {
        warnings.push(`Skipped a transaction with an unparseable date ("${current.fields.DATE ?? ''}").`);
        current = null;
        continue;
      }
      const totalDebits = current.lines.reduce((s, l) => s + l.debitCents, 0);
      const totalCredits = current.lines.reduce((s, l) => s + l.creditCents, 0);
      transactions.push({
        date,
        memo: current.fields.MEMO?.trim() || null,
        docNumber: current.fields.DOCNUM?.trim() || null,
        lines: current.lines,
        balanced: current.lines.length >= 2 && totalDebits === totalCredits,
      });
      current = null;
    }
  }

  return { accounts, transactions, warnings };
}
