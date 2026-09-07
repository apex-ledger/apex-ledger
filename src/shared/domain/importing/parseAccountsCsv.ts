import type { AccountType } from '../types';
import { parseCsvRows } from './parseCsv';
import { splitHeaderAndRows } from './reportLayout';

export interface AccountsCsvColumnMapping {
  nameColumn: string;
  typeColumn: string;
  descriptionColumn: string | null;
}

export interface ParsedCsvAccount {
  name: string;
  rawType: string;
  description: string | null;
}

export interface ParseAccountsCsvResult {
  headers: string[];
  /** Every distinct value seen in the mapped type column — the caller builds a one-time mapping
   * from each of these to an app AccountType + subtype (pre-filled via guessAccountTypeMapping,
   * always user-reviewable) rather than this parser guessing silently per row. */
  distinctTypes: string[];
  accounts: ParsedCsvAccount[];
  warnings: string[];
}

/** The header row — found past any report title rows (QuickBooks Online's Account List export
 * starts with the company name and report title; see reportLayout.ts). */
export function getCsvHeaders(csvText: string): string[] {
  return splitHeaderAndRows(parseCsvRows(csvText)).header;
}

/** Reads the raw account name/type/description columns — does not resolve `rawType` to an app
 * AccountType yet; see applyAccountTypeMapping for that step. */
export function parseAccountsCsvPreview(csvText: string, mapping: AccountsCsvColumnMapping): ParseAccountsCsvResult {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) return { headers: [], distinctTypes: [], accounts: [], warnings: ['The file is empty.'] };
  const { header, headerIndex, body } = splitHeaderAndRows(rows);
  const nameIdx = header.indexOf(mapping.nameColumn);
  const typeIdx = header.indexOf(mapping.typeColumn);
  const descIdx = mapping.descriptionColumn ? header.indexOf(mapping.descriptionColumn) : -1;

  const warnings: string[] = [];
  const accounts: ParsedCsvAccount[] = [];
  const typesSeen = new Set<string>();

  for (const [offset, row] of body.entries()) {
    if (row.every((c) => c.trim() === '')) continue;
    const name = row[nameIdx]?.trim();
    if (!name) {
      warnings.push(`Row ${headerIndex + offset + 2}: missing account name — skipped.`);
      continue;
    }
    // A report's closing TOTAL row is not an account.
    if (/^total$/i.test(name) && row.filter((c) => c.trim() !== '').length <= 2) continue;
    const rawType = row[typeIdx]?.trim() ?? '';
    accounts.push({ name, rawType, description: descIdx >= 0 ? row[descIdx]?.trim() || null : null });
    if (rawType) typesSeen.add(rawType);
  }

  return { headers: header, distinctTypes: Array.from(typesSeen).sort(), accounts, warnings };
}

/**
 * Best-effort keyword guess for a QuickBooks Online account "Type"/"Detail Type" value's app
 * AccountType + subtype — used only to pre-fill a mapping the user reviews and can override
 * before anything is created, never applied silently. QBO's exact wording varies by report/
 * locale/version and hasn't been verified against a primary sample, so this is deliberately
 * keyword-based (same posture as the "safest default" fallback already used for QuickBooks
 * Desktop IIF imports in parseIif.ts).
 */
export function guessAccountTypeMapping(rawType: string): { accountType: AccountType; accountSubtype: string } {
  const t = rawType.toLowerCase();
  if (/credit card/.test(t)) return { accountType: 'Liability', accountSubtype: 'Credit Card' };
  if (/bank/.test(t)) return { accountType: 'Asset', accountSubtype: 'Cash and Bank' };
  if (/accounts receivable|a\/r/.test(t)) return { accountType: 'Asset', accountSubtype: 'Current Asset' };
  if (/fixed asset/.test(t)) return { accountType: 'Asset', accountSubtype: 'Capital Asset' };
  if (/asset/.test(t)) return { accountType: 'Asset', accountSubtype: 'Current Asset' };
  if (/accounts payable|a\/p/.test(t)) return { accountType: 'Liability', accountSubtype: 'Current Liability' };
  if (/long.?term liabilit/.test(t)) return { accountType: 'Liability', accountSubtype: 'Long-Term Liability' };
  if (/liabilit/.test(t)) return { accountType: 'Liability', accountSubtype: 'Current Liability' };
  if (/equity/.test(t)) return { accountType: 'Equity', accountSubtype: 'Equity' };
  if (/cost of goods sold|cogs/.test(t)) return { accountType: 'Expense', accountSubtype: 'Cost of Sales' };
  if (/income|revenue|sales/.test(t)) return { accountType: 'Revenue', accountSubtype: 'Revenue' };
  return { accountType: 'Expense', accountSubtype: 'Operating Expense' };
}

export interface ResolvedCsvAccount {
  name: string;
  accountType: AccountType;
  accountSubtype: string;
  description: string | null;
}

/** Applies the user-confirmed type mapping (built from ParseAccountsCsvResult.distinctTypes) to
 * every parsed row, falling back to the same safe Expense/Operating Expense default as the IIF
 * importer for a raw type the mapping doesn't cover. */
export function applyAccountTypeMapping(
  accounts: ParsedCsvAccount[],
  typeMapping: Record<string, { accountType: AccountType; accountSubtype: string }>,
): ResolvedCsvAccount[] {
  return accounts.map((a) => {
    const mapped = typeMapping[a.rawType] ?? { accountType: 'Expense' as AccountType, accountSubtype: 'Operating Expense' };
    return { name: a.name, accountType: mapped.accountType, accountSubtype: mapped.accountSubtype, description: a.description };
  });
}
