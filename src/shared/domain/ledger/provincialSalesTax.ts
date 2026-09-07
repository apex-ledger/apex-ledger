import type { JournalEntry } from '../types';
import { provincialTaxAccount, provincialShareOfTax, taxCodeDefinition } from './taxCodes';
import { filterEntriesByDateRange } from './computeAccountBalances';

/**
 * The provincial sales tax return — what is owed to BC, Saskatchewan, Manitoba or Revenu Quebec
 * for a period, from the tax code on each posted line.
 *
 * PST and RST are collected on sales and remitted in full; nothing is claimed back on purchases.
 * QST is collected on sales and, for a registrant, refunded on purchases (an input tax refund),
 * so Quebec's return nets the two. The federal 5% on the same lines belongs to the GST/HST return
 * and is deliberately not here — the two returns must never double-count a dollar.
 */
export interface ProvincialTaxRow {
  province: 'BC' | 'SK' | 'MB' | 'QC';
  taxName: 'PST' | 'RST' | 'QST';
  taxableSalesCents: number;
  collectedCents: number;
  taxablePurchasesCents: number;
  /** Input tax refunds — QST only. */
  refundableCents: number;
  netCents: number;
  /** Lines for the transaction-level listing. */
  lines: ProvincialTaxLine[];
}

export interface ProvincialTaxLine {
  entryId: number;
  entryDate: string;
  createdAt: string;
  memo: string | null;
  reference: string | null;
  direction: 'sale' | 'purchase';
  baseCents: number;
  provincialTaxCents: number;
}

export interface ProvincialSalesTaxResult {
  periodStart: string;
  periodEnd: string;
  rows: ProvincialTaxRow[];
}

export function computeProvincialSalesTax(entries: JournalEntry[], periodStart: string, periodEnd: string): ProvincialSalesTaxResult {
  const rows = new Map<string, ProvincialTaxRow>();
  for (const entry of filterEntriesByDateRange(entries, periodStart, periodEnd)) {
    if (entry.status !== 'posted') continue;
    for (const line of entry.lines) {
      const meta = provincialTaxAccount(line.taxCode);
      const definition = taxCodeDefinition(line.taxCode);
      if (!meta || !definition || line.baseCents === null || line.baseCents === undefined) continue;
      const base = Math.abs(line.baseCents);
      if (base === 0) continue;
      // A category line on a sale is a credit to revenue; on a purchase a debit to an expense.
      const direction: 'sale' | 'purchase' = line.creditCents > 0 ? 'sale' : 'purchase';
      const taxCents = line.taxCode === 'Manual' ? 0 : Math.round(base * definition.rate);
      const provincialCents = provincialShareOfTax(line.taxCode, taxCents);
      if (direction === 'purchase' && !meta.recoverableName) continue; // PST/RST paid is a cost, not a return item
      const key = meta.province;
      const row = rows.get(key) ?? { province: meta.province, taxName: meta.taxName, taxableSalesCents: 0, collectedCents: 0, taxablePurchasesCents: 0, refundableCents: 0, netCents: 0, lines: [] };
      if (direction === 'sale') { row.taxableSalesCents += base; row.collectedCents += provincialCents; }
      else { row.taxablePurchasesCents += base; row.refundableCents += provincialCents; }
      row.lines.push({ entryId: entry.id, entryDate: entry.entryDate, createdAt: entry.createdAt, memo: entry.memo, reference: entry.reference, direction, baseCents: base, provincialTaxCents: provincialCents });
      rows.set(key, row);
    }
  }
  for (const row of rows.values()) {
    row.netCents = row.collectedCents - row.refundableCents;
    row.lines.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.entryId - b.entryId);
  }
  return { periodStart, periodEnd, rows: [...rows.values()].sort((a, b) => a.province.localeCompare(b.province)) };
}
