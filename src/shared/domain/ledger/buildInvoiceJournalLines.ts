import type { NewInvoiceLineInput, NewJournalEntryLineInput, NewSalesReceiptLineInput, TaxCode } from '../types';
import { categoryLineAmountCents, computeTaxSplit, suggestTaxCents, totalLineAmountCents } from './computeTaxSplit';
import { provincialTaxAccount } from './taxCodes';

/** Province payable account ids keyed by tax code, for codes with a provincial slice. Resolved by
 * the handler (accounts are created on first use); a missing entry keeps the whole tax in GST/HST. */
export type ProvincialPayableIds = Partial<Record<string, number>>;

/** Shared by Invoices (money account = Accounts Receivable) and Sales Receipts (money account =
 * whichever bank/Undeposited Funds account was chosen) — builds one revenue Credit line per item
 * plus the combined GST/HST Payable Credit, and returns the money-side Debit total. See
 * buildInvoiceJournalLines/buildSalesReceiptJournalLines for the two thin wrappers that attach the
 * Debit line with the right account id. */
function buildRevenueAndTaxLines(
  lines: { description: string; revenueAccountId: number; taxCode?: TaxCode | null; manualHstCents?: number | null }[],
  lineBaseAmountCents: number[],
  gstHstPayableId: number, provincialPayableIds?: ProvincialPayableIds): { revenueLines: NewJournalEntryLineInput[]; moneyTotalCents: number } {
  let moneyTotalCents = 0;
  let claimableTaxTotalCents = 0;
  const provincialTotals = new Map<string, number>();
  const revenueLines: NewJournalEntryLineInput[] = lines.map((line, i) => {
    const baseCents = lineBaseAmountCents[i];
    const taxCode = line.taxCode ?? null;
    // CRA's 50% meals & entertainment restriction is an INPUT tax credit rule — it limits what you
    // can claim back on a meal you bought. Tax you charge a customer is remitted in full, so
    // running a sale through computeTaxSplit's MealsHST branch would credit only half the HST to
    // GST/HST Payable and bury the rest in revenue, under-remitting on every such invoice. No
    // sales-side editor offers this code today; this makes sure adding one can't quietly do that.
    if (taxCode === 'MealsHST') {
      throw new Error("The Meals & Entertainment tax code applies to purchases only — use 'HST' on a sale.");
    }
    const manualHstCents = taxCode === 'Manual' ? line.manualHstCents ?? null : null;
    const taxCents = taxCode === 'Manual' ? manualHstCents ?? 0 : suggestTaxCents(taxCode, baseCents);
    const split = computeTaxSplit(taxCode, taxCents, 'sale');
    moneyTotalCents += totalLineAmountCents(baseCents, split);
    const provincialId = taxCode ? provincialPayableIds?.[taxCode] : undefined;
    const provincialCents = provincialId !== undefined ? split.provincialClaimableCents : 0;
    claimableTaxTotalCents += split.claimableTaxCents - provincialCents;
    if (provincialCents > 0 && taxCode) provincialTotals.set(taxCode, (provincialTotals.get(taxCode) ?? 0) + provincialCents);

    return {
      accountId: line.revenueAccountId,
      debitCents: 0,
      creditCents: categoryLineAmountCents(baseCents, split),
      description: line.description,
      taxCode,
      manualHstCents,
      baseCents,
    };
  });

  if (claimableTaxTotalCents > 0) {
    revenueLines.push({
      accountId: gstHstPayableId,
      debitCents: 0,
      creditCents: claimableTaxTotalCents,
      description: 'GST/HST collected',
    });
  }
  for (const [code, cents] of provincialTotals) {
    const meta = provincialTaxAccount(code as never)!;
    revenueLines.push({ accountId: provincialPayableIds![code]!, debitCents: 0, creditCents: cents, description: `${meta.taxName} collected (${meta.province})` });
  }

  return { revenueLines, moneyTotalCents };
}

function validateLines(lines: unknown[], lineBaseAmountCents: number[], noun: string): void {
  if (lines.length === 0) throw new Error(`A ${noun} needs at least one line item.`);
  if (lines.length !== lineBaseAmountCents.length) {
    throw new Error(`${noun[0].toUpperCase()}${noun.slice(1)} lines and computed amounts must be the same length.`);
  }
  for (const baseCents of lineBaseAmountCents) {
    if (!Number.isInteger(baseCents) || baseCents <= 0) {
      throw new Error(`Each ${noun} line must have a positive amount.`);
    }
  }
}

/**
 * Builds the GL lines for one invoice: a Debit to Accounts Receivable for the grand total (base +
 * tax, across every line), one Credit per invoice line to its own revenue account for that line's
 * base amount (plus any non-claimable tax portion, e.g. USTax — see computeTaxSplit), and — when
 * any line carries claimable GST/HST — a single combined Credit to the GST/HST Payable account for
 * the total tax collected. Posting tax to its own account (instead of leaving it embedded in
 * Revenue) is what keeps the Income Statement correct; see incomeStatement.ts /
 * computeAccountBalances.ts, which sum whatever lands in each account with no tax-awareness.
 *
 * `lineBaseAmountCents` are pre-tax amounts (quantity * unit price) — tax is computed and added on
 * top here, not embedded in the amount the way earlier versions of this app treated it.
 */
export function buildInvoiceJournalLines(
  accountsReceivableId: number,
  gstHstPayableId: number,
  lines: NewInvoiceLineInput[],
  lineBaseAmountCents: number[],
  discount?: { accountId: number; amountCents: number; customerId: number },
  provincialPayableIds?: ProvincialPayableIds,
): NewJournalEntryLineInput[] {
  validateLines(lines, lineBaseAmountCents, 'invoice');
  const { revenueLines, moneyTotalCents } = buildRevenueAndTaxLines(lines, lineBaseAmountCents, gstHstPayableId, provincialPayableIds);
  const discountCents = discount?.amountCents ?? 0;
  if (!Number.isInteger(discountCents) || discountCents < 0) throw new Error('Invoice discount must be a non-negative whole number of cents.');
  if (discountCents >= moneyTotalCents) throw new Error('Invoice discount must be less than the invoice total.');
  const customerId = discount?.customerId ?? null;
  const discountLine: NewJournalEntryLineInput[] = discountCents > 0 && discount
    ? [{
        accountId: discount.accountId,
        debitCents: discountCents,
        creditCents: 0,
        description: 'Customer discount',
        customerId: discount.customerId,
      }]
    : [];
  return [
    { accountId: accountsReceivableId, debitCents: moneyTotalCents - discountCents, creditCents: 0, description: null, customerId },
    ...discountLine,
    ...revenueLines,
  ];
}

/**
 * Builds the GL lines for one sales receipt — identical revenue/tax treatment to
 * buildInvoiceJournalLines, but the Debit lands on whichever account the receipt was deposited to
 * (a real bank account, or Undeposited Funds pending a later Deposit) instead of Accounts
 * Receivable, since a sales receipt is paid in full the instant it's recorded.
 */
export function buildSalesReceiptJournalLines(
  depositToAccountId: number,
  gstHstPayableId: number,
  lines: NewSalesReceiptLineInput[],
  lineBaseAmountCents: number[],
  provincialPayableIds?: ProvincialPayableIds,
): NewJournalEntryLineInput[] {
  validateLines(lines, lineBaseAmountCents, 'sales receipt');
  const { revenueLines, moneyTotalCents } = buildRevenueAndTaxLines(lines, lineBaseAmountCents, gstHstPayableId, provincialPayableIds);
  return [{ accountId: depositToAccountId, debitCents: moneyTotalCents, creditCents: 0, description: null }, ...revenueLines];
}

/** quantity * unitPriceCents, rounded to the nearest cent — the pre-tax amount stored on each
 * invoice/sales-receipt line and used as the base for its journal credit, so displayed and posted
 * amounts can never drift apart. */
export function computeInvoiceLineAmountCents(line: Pick<NewInvoiceLineInput, 'quantity' | 'unitPriceCents'>): number {
  return Math.round(line.quantity * line.unitPriceCents);
}
