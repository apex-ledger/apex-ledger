import { FOREIGN_CURRENCY_CODES, type Account, type ForeignCurrencyCode, type TaxCode } from '../types';
import { matchAccountByName } from './matchAccountName';
import type { ColumnRole } from './bulkExpenseColumns';

export interface BulkExpenseRow {
  rowIndex: number;
  entryDate: string | null;
  vendor: string;
  categoryName: string;
  categoryAccountId: number | null;
  paymentMethodName: string;
  moneyAccountId: number | null;
  foreignCurrency: ForeignCurrencyCode | null;
  foreignAmountCents: number | null;
  exchangeRate: number | null;
  cadTotalCents: number;
  isRefund: boolean;
  taxCode: TaxCode | null;
  manualHstCents: number;
  skipped: boolean;
  skipReason: string | null;
}

export interface BulkExpenseImportResult {
  rows: BulkExpenseRow[];
  validCount: number;
  skippedCount: number;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** Handles $, commas, and accounting-style negatives — either a leading "-" or parenthesized,
 * e.g. "($9.92)". A bare "-" (used for "no tax" cells) is treated as zero, not garbage. */
function parseSignedAmountCents(raw: string | undefined): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-') return 0;
  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith('-');
  const cleaned = trimmed.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return 0;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/** "7/4/2026", "2026-07-04", or "19-Jul" (no year — falls back to assumedYear, since a lot of
 * expense-tracker exports drop the year once it's implied by the sheet/tab). Returns null for
 * anything else rather than guessing, since a wrong date on a real ledger entry is a real
 * problem. */
function parseRowDate(raw: string, assumedYear: number): string | null {
  const trimmed = raw.trim();
  let m = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return normalizeDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return normalizeDate(Number(m[3]), Number(m[1]), Number(m[2]));

  m = trimmed.match(/^(\d{1,2})-([A-Za-z]{3,})$/);
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (month) return normalizeDate(assumedYear, Number(month), Number(m[1]));
  }
  return null;
}

function normalizeDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/** "Cash" and "Credit"/"Visa" are common shorthand for a specific bank/card account, not literal
 * account names — prefer an exact-name match for the obvious candidate before falling back to a
 * looser search, so "Cash" doesn't ambiguously match both "Petty Cash" and "Cash - Operating
 * Account" and give up. */
function matchPaymentAccount(method: string, accounts: Account[]): Account | null {
  const m = method.trim().toLowerCase();
  if (!m) return null;
  const byExactName = (name: string) => accounts.find((a) => a.name.toLowerCase() === name);

  if (m === 'cash') {
    return byExactName('petty cash') ?? accounts.find((a) => a.accountType === 'Asset' && a.name.toLowerCase().includes('cash')) ?? null;
  }
  if (m === 'visa' || m === 'credit' || m === 'credit card') {
    return (
      byExactName('visa') ??
      accounts.find((a) => a.accountType === 'Liability' && (a.name.toLowerCase().includes('visa') || a.name.toLowerCase().includes('mastercard') || a.name.toLowerCase().includes('credit')))
      ?? null
    );
  }
  return matchAccountByName(method, accounts);
}

const TAX_CODE_ALIASES: Record<string, TaxCode> = { hst: 'HST', nonhst: 'NonHST', manual: 'Manual', ustax: 'USTax' };

function resolveTaxCode(taxCodeCell: string, taxLabelCell: string): TaxCode | null {
  const literal = TAX_CODE_ALIASES[taxCodeCell.trim().toLowerCase()];
  if (literal) return literal;

  const label = taxLabelCell.trim().toLowerCase();
  if (!label) return null;
  if (/no ?tax|exempt|^0%$|^none$/.test(label)) return null;
  if (label.includes('manual')) return 'Manual';
  if (label.includes('13%')) return 'HST';
  if (label.includes('8%')) return 'USTax';
  return null;
}

function columnIndex(mapping: ColumnRole[], role: ColumnRole): number {
  return mapping.indexOf(role);
}
function cell(cells: string[], index: number): string {
  return index === -1 ? '' : (cells[index] ?? '').trim();
}

/**
 * Parses pasted spreadsheet rows into journal-postable expense entries, using a caller-supplied
 * column mapping (see bulkExpenseColumns.ts) rather than assuming a fixed layout — different
 * clients' exports put columns in different orders, use different headers, or skip the foreign-
 * currency columns entirely for a purely domestic expense sheet. Every dollar figure in the sheet
 * is trusted as given (not recomputed from a live rate), since the sheet's own exchange rate for
 * a receipt from weeks ago is more accurate than re-fetching today's rate. Rows are flagged
 * skipped (with a reason) rather than guessed when a category, payment method, date, or amount
 * can't be resolved confidently.
 */
export function parseBulkExpenseImport(text: string, accounts: Account[], mapping: ColumnRole[], assumedYear: number, skipFirstRow: boolean): BulkExpenseImportResult {
  const expenseAccounts = accounts.filter((a) => a.accountType === 'Expense');
  const allRows = text.split(/\r\n|\r|\n/).map((row) => row.split('\t').map((c) => c.trim()));
  const dataRows = skipFirstRow ? allRows.slice(1) : allRows;

  const dateCol = columnIndex(mapping, 'date');
  const vendorCol = columnIndex(mapping, 'vendor');
  const categoryCol = columnIndex(mapping, 'category');
  const paymentCol = columnIndex(mapping, 'paymentMethod');
  const amountCol = columnIndex(mapping, 'amount');
  const currencyCol = columnIndex(mapping, 'currency');
  const foreignAmountCol = columnIndex(mapping, 'foreignAmount');
  const rateCol = columnIndex(mapping, 'exchangeRate');
  const taxCodeCol = columnIndex(mapping, 'taxCode');
  const taxLabelCol = columnIndex(mapping, 'taxLabel');
  const taxAmountCol = columnIndex(mapping, 'taxAmount');

  const rows: BulkExpenseRow[] = [];
  dataRows.forEach((cells, i) => {
    const rowIndex = i + (skipFirstRow ? 1 : 0);
    if (cells.every((c) => !c)) return; // fully blank line — not even worth reporting as skipped

    const vendor = cell(cells, vendorCol);
    const categoryName = cell(cells, categoryCol);
    const paymentMethodName = cell(cells, paymentCol);

    const foreignAmountRaw = foreignAmountCol !== -1 ? parseSignedAmountCents(cells[foreignAmountCol]) : null;
    const rateRaw = rateCol !== -1 ? Number.parseFloat(cell(cells, rateCol)) : NaN;
    const exchangeRate = Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : null;
    const currencyValue = cell(cells, currencyCol).toUpperCase();
    const requestedCurrency = currencyValue || 'USD';
    const foreignCurrency = (FOREIGN_CURRENCY_CODES as readonly string[]).includes(requestedCurrency)
      ? (requestedCurrency as ForeignCurrencyCode)
      : null;
    const hasForeignValues = foreignAmountRaw !== null && exchangeRate !== null;
    const isForeignRow = hasForeignValues && foreignCurrency !== null;

    const directAmount = amountCol !== -1 ? parseSignedAmountCents(cells[amountCol]) : null;
    const computedFromForeign = isForeignRow ? Math.round((foreignAmountRaw as number) * (exchangeRate as number)) : null;
    const signedAmount = directAmount !== null && directAmount !== 0 ? directAmount : computedFromForeign;
    const cadTotalCents = Math.abs(signedAmount ?? 0);
    const isRefund = (signedAmount ?? 0) < 0;

    if (!vendor && !categoryName && cadTotalCents === 0) return; // junk row (e.g. a stray flag column with no real data)

    const entryDate = dateCol !== -1 ? parseRowDate(cell(cells, dateCol), assumedYear) : null;
    const categoryAccountId = categoryName ? matchAccountByName(categoryName, expenseAccounts)?.id ?? null : null;
    const moneyAccountId = paymentMethodName ? matchPaymentAccount(paymentMethodName, accounts)?.id ?? null : null;

    const taxCode = resolveTaxCode(cell(cells, taxCodeCol), cell(cells, taxLabelCol));
    const manualHstCents = taxCode === 'Manual' ? Math.abs(parseSignedAmountCents(cells[taxAmountCol])) : 0;

    const reasons: string[] = [];
    if (dateCol === -1 || entryDate === null) reasons.push('unrecognized or missing date');
    if (categoryAccountId === null) reasons.push(`no account match for category "${categoryName}"`);
    if (moneyAccountId === null) reasons.push(`no account match for payment method "${paymentMethodName}"`);
    if (cadTotalCents === 0) reasons.push('no amount');
    if (hasForeignValues && foreignCurrency === null) reasons.push(`unsupported foreign currency "${requestedCurrency}"`);

    rows.push({
      rowIndex,
      entryDate,
      vendor,
      categoryName,
      categoryAccountId,
      paymentMethodName,
      moneyAccountId,
      foreignCurrency: isForeignRow ? foreignCurrency : null,
      foreignAmountCents: isForeignRow ? Math.abs(foreignAmountRaw as number) : null,
      exchangeRate: isForeignRow ? exchangeRate : null,
      cadTotalCents,
      isRefund,
      taxCode,
      manualHstCents,
      skipped: reasons.length > 0,
      skipReason: reasons.length > 0 ? reasons.join('; ') : null,
    });
  });

  return { rows, validCount: rows.filter((r) => !r.skipped).length, skippedCount: rows.filter((r) => r.skipped).length };
}
