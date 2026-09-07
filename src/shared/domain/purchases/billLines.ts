import type { TaxCode } from '../types';
import { suggestTaxCents } from '../ledger/computeTaxSplit';
import { taxPortionOfInclusive } from '../ledger/taxCodes';

/**
 * A bill is one or more lines, each to its own account with its own tax. The header of the bill
 * keeps summary figures (the first line's category and tax code, the total tax, the grand total)
 * so that every list, report and older screen that treats a bill as one row keeps working.
 */
export interface BillLineInput {
  categoryAccountId: number;
  /** Class / location tags for this line. */
  tagIds?: number[];
  description: string | null;
  /** Pre-tax amount in cents. */
  baseCents: number;
  taxCode: TaxCode | null;
  /** The real tax on this line — typed, or accepted from the rate suggestion. */
  taxCents: number;
  productId: number | null;
  quantity: number | null;
}

export interface BillHeaderFigures {
  categoryAccountId: number;
  baseCents: number;
  taxCents: number;
  /** The first line's code; 'Manual' when the lines disagree, since no single flat rate describes the bill. */
  taxCode: TaxCode | null;
  totalCents: number;
}

/** The lines a bill payload carries: its `lines`, or one line built from the single-line fields
 * older callers (receipt review, purchase-order matching, imports) still send. */
export function billLinesFromPayload(payload: {
  lines?: BillLineInput[] | null;
  categoryAccountId?: number | null;
  baseCents?: number | null;
  taxCode?: TaxCode | null;
  taxCents?: number | null;
  memo?: string | null;
  productId?: number | null;
  quantity?: number | null;
}): BillLineInput[] {
  if (payload.lines && payload.lines.length > 0) return payload.lines;
  if (!payload.categoryAccountId || !payload.baseCents) return [];
  return [{
    categoryAccountId: payload.categoryAccountId,
    description: payload.memo ?? null,
    baseCents: payload.baseCents,
    taxCode: payload.taxCode ?? null,
    taxCents: payload.taxCode ? (payload.taxCents ?? 0) : 0,
    productId: payload.productId ?? null,
    quantity: payload.productId ? (payload.quantity ?? null) : null,
  }];
}

/** Why a set of lines cannot be posted as a bill, or null. */
export function billLinesRefusalReason(lines: BillLineInput[]): string | null {
  if (lines.length === 0) return 'Add at least one line with a category and an amount.';
  const blank = lines.findIndex((line) => line.baseCents <= 0 && line.taxCents <= 0);
  if (blank >= 0) return `Line ${blank + 1} has no amount. Enter an amount or remove the line.`;
  const uncategorised = lines.findIndex((line) => !line.categoryAccountId);
  if (uncategorised >= 0) return `Line ${uncategorised + 1} needs a category (an expense or asset account).`;
  return null;
}

export function billHeaderFigures(lines: BillLineInput[]): BillHeaderFigures {
  const baseCents = lines.reduce((sum, line) => sum + line.baseCents, 0);
  const taxCents = lines.reduce((sum, line) => sum + (line.taxCode ? line.taxCents : 0), 0);
  const codes = new Set(lines.map((line) => line.taxCode ?? ''));
  const taxCode: TaxCode | null = codes.size === 1 ? (lines[0]?.taxCode ?? null) : taxCents > 0 ? 'Manual' : null;
  return { categoryAccountId: lines[0]?.categoryAccountId ?? 0, baseCents, taxCents, taxCode, totalCents: baseCents + taxCents };
}

/**
 * What a typed amount means on a line. "Exclusive of tax" (a quote, most vendor invoices): the
 * figure is the base and tax goes on top. "Inclusive of tax" (a till receipt): the figure is what
 * was paid; the tax inside it is taken out at the code's rate unless a real tax figure is given.
 */
export function lineFromEnteredAmount(amountCents: number, taxCode: TaxCode | null, mode: 'exclusive' | 'inclusive', typedTaxCents: number | null): { baseCents: number; taxCents: number } {
  if (!taxCode) return { baseCents: amountCents, taxCents: 0 };
  if (mode === 'exclusive') return { baseCents: amountCents, taxCents: typedTaxCents ?? suggestTaxCents(taxCode, amountCents) };
  const taxCents = Math.min(amountCents, typedTaxCents ?? taxPortionOfInclusive(taxCode, amountCents));
  return { baseCents: amountCents - taxCents, taxCents };
}
