import type { Account } from '../types';
import { matchAccountByName } from './matchAccountName';

export interface ParsedJournalLine {
  accountName: string;
  accountId: number | null;
  description: string;
  debitCents: number;
  creditCents: number;
}

export interface ParsePastedJournalLinesResult {
  lines: ParsedJournalLine[];
  matchedCount: number;
  unmatchedCount: number;
}

function parseAmountCents(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

function isHeaderRow(cells: string[]): boolean {
  const first = (cells[0] ?? '').trim().toLowerCase();
  return first === 'account' || first === 'account name';
}

/**
 * Parses a block of tab-separated rows copied from Excel into journal line candidates. Expected
 * column order (matching the grid's own left-to-right layout): Account, Description, Debit,
 * Credit — extra/missing trailing columns are tolerated, but the order itself is fixed rather
 * than guessed, since a wrong guess here means a wrong number lands in a real ledger entry.
 */
export function parsePastedJournalLines(text: string, accounts: Account[]): ParsePastedJournalLinesResult {
  const rows = text
    .split(/\r\n|\r|\n/)
    .map((row) => row.split('\t').map((cell) => cell.trim()))
    .filter((cells) => cells.some((c) => c.length > 0));

  const dataRows = rows.length > 0 && isHeaderRow(rows[0]) ? rows.slice(1) : rows;

  const lines: ParsedJournalLine[] = dataRows
    .filter((cells) => (cells[0] ?? '').length > 0)
    .map((cells) => {
      const accountName = cells[0] ?? '';
      const match = matchAccountByName(accountName, accounts);
      return {
        accountName,
        accountId: match?.id ?? null,
        description: cells[1] ?? '',
        debitCents: parseAmountCents(cells[2]),
        creditCents: parseAmountCents(cells[3]),
      };
    });

  const matchedCount = lines.filter((l) => l.accountId !== null).length;
  return { lines, matchedCount, unmatchedCount: lines.length - matchedCount };
}
