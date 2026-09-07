import type { TaxCode } from '../types';
import { isNoTaxCode, provincialShareOfTax, provincialTaxAccount, taxCodeDefinition } from './taxCodes';

/**
 * Splits a tax amount that's already been entered (typed by the accountant, or accepted from the
 * rate-based suggestion below) into the GL pieces needed to post GST/HST as its own line instead
 * of leaving it embedded in the category account — the fix for the Income Statement previously
 * including tax in Revenue/Expense totals (see incomeStatement.ts / computeAccountBalances.ts,
 * which have zero tax-awareness and simply sum whatever landed in each account).
 *
 * The actual tax figure always comes from the UI (editable for every code, not just 'Manual') —
 * this function only decides, per CRA treatment, how much of that figure is a claimable/recordable
 * GST/HST amount vs. a real non-recoverable cost that belongs back in the category account:
 * - GST / HST (any province): fully claimable/recordable.
 * - GST+PST (BC, SK) and GST+RST (MB): only the federal GST share is claimable; the provincial
 *   sales tax is not recoverable and stays folded into the category account as a real cost.
 * - GST+QST (QC): both are claimable if registered for QST; the non-registered code claims only
 *   the federal 5%.
 * - USTax: US sales tax is not a Canadian ITC, so none of it is claimable — it stays folded into
 *   the category account as a real cost.
 * - MealsHST: CRA restricts meals & entertainment to a 50% ITC — only half is claimable, the other
 *   half is a real non-recoverable cost added back into the expense account.
 * - NonHST / null: no tax.
 *
 * Each code's claimable share lives in taxCodes.ts, so adding a province is a data change here.
 */


export interface TaxSplitResult {
  /** Posted to the dedicated GST/HST Payable (revenue) or GST/HST Recoverable (expense) account. */
  claimableTaxCents: number;
  /** Folded into the category account's own line — not a separate recoverable/payable tax amount. */
  nonClaimableTaxCents: number;
  /** claimableTaxCents + nonClaimableTaxCents (equal to the taxCents passed in, split apart). */
  totalTaxCents: number;
  /** The part of claimableTaxCents that is PROVINCIAL (PST/RST collected on a sale; QST either
   * way) and so posts to the province's own payable/recoverable account rather than GST/HST. */
  provincialClaimableCents: number;
}

export function computeTaxSplit(taxCode: TaxCode | null, taxCents: number, direction: 'purchase' | 'sale' = 'purchase'): TaxSplitResult {
  if (!Number.isInteger(taxCents) || taxCents < 0) {
    throw new Error('taxCents must be a non-negative integer.');
  }

  // "No tax" is not the same as "tax that happens to be non-recoverable": these codes mean nothing
  // was charged, so any figure passed alongside them is discarded rather than booked as a cost.
  if (isNoTaxCode(taxCode)) {
    return { claimableTaxCents: 0, nonClaimableTaxCents: 0, totalTaxCents: 0, provincialClaimableCents: 0 };
  }

  const definition = taxCodeDefinition(taxCode);
  // An unrecognised code is treated as fully non-recoverable rather than silently claimed — over-
  // claiming an input tax credit is the costlier mistake of the two.
  const claimableFraction = definition?.claimableFraction ?? 0;
  // On a sale every dollar charged is remitted to someone, so the whole figure is "claimable"
  // (recordable) even for a PST code; the provincial slice then goes to the province's payable.
  const claimableTaxCents = direction === 'sale' && provincialTaxAccount(taxCode) ? taxCents : Math.round(taxCents * claimableFraction);
  const provincialShare = provincialShareOfTax(taxCode, taxCents);
  const provincialAccount = provincialTaxAccount(taxCode);
  const provincialClaimableCents = !provincialAccount ? 0 : direction === 'sale' ? provincialShare : provincialAccount.recoverableName ? provincialShare : 0;
  return {
    claimableTaxCents,
    nonClaimableTaxCents: taxCents - claimableTaxCents,
    totalTaxCents: taxCents,
    provincialClaimableCents,
  };
}

/** UI convenience only — a starting-point tax figure to prefill the (always-editable) Tax Amount
 * box from the pre-tax base, at the flat rates already used elsewhere in this app (13% HST/Meals,
 * the Ontario/most-common HST rate; 8% US sales tax). Never used for actual posting — see
 * computeTaxSplit above, which always works from the real entered/accepted amount. */
export function suggestTaxCents(taxCode: TaxCode | null, baseCents: number): number {
  return Math.round(baseCents * (taxCodeDefinition(taxCode)?.rate ?? 0));
}

/** The category-account line amount: the base cost plus any non-recoverable tax portion (Meals'
 * other 50%, or all of USTax) — this is the real economic cost that belongs in Revenue/Expense. */
export function categoryLineAmountCents(baseCents: number, split: TaxSplitResult): number {
  return baseCents + split.nonClaimableTaxCents;
}

/** The full amount that moves through the money/AR/AP account: base + all tax, claimable or not. */
export function totalLineAmountCents(baseCents: number, split: TaxSplitResult): number {
  return baseCents + split.totalTaxCents;
}
