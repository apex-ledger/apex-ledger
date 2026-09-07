/**
 * CRA's Quick Method of Accounting for GST/HST: instead of tracking input tax credits on every
 * purchase, the business still charges customers the full HST rate but remits a flat percentage
 * of tax-included sales to CRA and keeps the rest. This is an ESTIMATION TOOL — the exact
 * remittance rate depends on province and business category (and there's a 1% credit on the
 * first $30,000 of eligible sales in the business's first year, not modelled here), so the
 * accountant must confirm the applicable rate with CRA before relying on this for a real filing.
 */
export interface QuickMethodResult {
  /** Taxable sales revenue (before tax) plus the HST charged on top of it. */
  taxIncludedSalesCents: number;
  /** HST actually charged to customers in the period (from the normal HST summary). */
  hstCollectedCents: number;
  /** taxIncludedSalesCents × rate — what actually gets remitted to CRA under the Quick Method. */
  remittanceCents: number;
  /** hstCollectedCents − remittanceCents — the business keeps this instead of claiming ITCs. */
  keptCents: number;
}

export function computeQuickMethodRemittance(taxableSalesBaseCents: number, hstCollectedCents: number, ratePercent: number): QuickMethodResult {
  const taxIncludedSalesCents = taxableSalesBaseCents + hstCollectedCents;
  const remittanceCents = Math.round(taxIncludedSalesCents * (ratePercent / 100));
  return {
    taxIncludedSalesCents,
    hstCollectedCents,
    remittanceCents,
    keptCents: hstCollectedCents - remittanceCents,
  };
}
