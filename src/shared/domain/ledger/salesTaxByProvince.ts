import type { JournalEntry } from '../types';
import { JURISDICTIONS, jurisdictionOfTaxCode, provincialShareOfTax, taxCodeDefinition, type JurisdictionInfo } from './taxCodes';
import { filterEntriesByDateRange } from './computeAccountBalances';

/**
 * Sales tax across the whole country: every province and territory on one sheet, with the
 * federal part (GST or HST, filed with the CRA) and the provincial part (PST, RST or QST, filed
 * with the province) shown separately, from the tax code on each posted line.
 *
 * A jurisdiction with no activity still appears, with its rate and where its return goes, so the
 * sheet reads as the map of Canada it is, not as a list of whatever happened to be used. Lines
 * carrying the older nationwide codes (HST_15, GST) land under "Not assigned to a province".
 */
export interface ProvinceTaxSummary {
  jurisdiction: JurisdictionInfo | null;
  label: string;
  taxableSalesCents: number;
  taxablePurchasesCents: number;
  federalCollectedCents: number;
  federalItcCents: number;
  provincialCollectedCents: number;
  /** Provincial tax refundable on purchases — QST only. */
  provincialItrCents: number;
  federalNetCents: number;
  provincialNetCents: number;
  lineCount: number;
}

export interface SalesTaxByProvinceResult {
  periodStart: string;
  periodEnd: string;
  rows: ProvinceTaxSummary[];
  totals: Omit<ProvinceTaxSummary, 'jurisdiction' | 'label'>;
}

function blank(jurisdiction: JurisdictionInfo | null, label: string): ProvinceTaxSummary {
  return { jurisdiction, label, taxableSalesCents: 0, taxablePurchasesCents: 0, federalCollectedCents: 0, federalItcCents: 0, provincialCollectedCents: 0, provincialItrCents: 0, federalNetCents: 0, provincialNetCents: 0, lineCount: 0 };
}

export function computeSalesTaxByProvince(entries: JournalEntry[], periodStart: string, periodEnd: string): SalesTaxByProvinceResult {
  const rows = new Map<string, ProvinceTaxSummary>();
  for (const j of JURISDICTIONS) rows.set(j.code, blank(j, `${j.name} (${j.code})`));
  const other = blank(null, 'Not assigned to a province');

  for (const entry of filterEntriesByDateRange(entries, periodStart, periodEnd)) {
    if (entry.status !== 'posted') continue;
    for (const line of entry.lines) {
      const definition = taxCodeDefinition(line.taxCode);
      if (!definition || definition.rate <= 0 || line.baseCents === null || line.baseCents === undefined) continue;
      const base = Math.abs(line.baseCents);
      if (base === 0) continue;
      const jurisdiction = jurisdictionOfTaxCode(line.taxCode);
      const row = jurisdiction ? rows.get(jurisdiction.code)! : other;
      const direction: 'sale' | 'purchase' = line.creditCents > 0 ? 'sale' : 'purchase';
      const taxCents = line.taxCode === 'Manual' ? line.manualHstCents ?? 0 : Math.round(base * definition.rate);
      const provincial = provincialShareOfTax(line.taxCode, taxCents);
      const federal = taxCents - provincial;
      row.lineCount += 1;
      if (direction === 'sale') {
        row.taxableSalesCents += base;
        row.federalCollectedCents += federal;
        row.provincialCollectedCents += provincial;
      } else {
        row.taxablePurchasesCents += base;
        row.federalItcCents += Math.round(federal * definition.claimableFraction);
        // Only Quebec's QST comes back on a purchase; PST/RST paid is a cost.
        if (line.taxCode === 'GST_QST_QC') row.provincialItrCents += provincial;
      }
    }
  }

  const list = [...rows.values(), other];
  for (const row of list) {
    row.federalNetCents = row.federalCollectedCents - row.federalItcCents;
    row.provincialNetCents = row.provincialCollectedCents - row.provincialItrCents;
  }
  const totals = list.reduce((t, r) => ({
    taxableSalesCents: t.taxableSalesCents + r.taxableSalesCents,
    taxablePurchasesCents: t.taxablePurchasesCents + r.taxablePurchasesCents,
    federalCollectedCents: t.federalCollectedCents + r.federalCollectedCents,
    federalItcCents: t.federalItcCents + r.federalItcCents,
    provincialCollectedCents: t.provincialCollectedCents + r.provincialCollectedCents,
    provincialItrCents: t.provincialItrCents + r.provincialItrCents,
    federalNetCents: t.federalNetCents + r.federalNetCents,
    provincialNetCents: t.provincialNetCents + r.provincialNetCents,
    lineCount: t.lineCount + r.lineCount,
  }), { taxableSalesCents: 0, taxablePurchasesCents: 0, federalCollectedCents: 0, federalItcCents: 0, provincialCollectedCents: 0, provincialItrCents: 0, federalNetCents: 0, provincialNetCents: 0, lineCount: 0 });
  return { periodStart, periodEnd, rows: other.lineCount > 0 ? list : list.slice(0, -1), totals };
}
