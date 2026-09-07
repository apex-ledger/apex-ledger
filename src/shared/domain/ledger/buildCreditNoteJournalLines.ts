import type { NewCreditNoteLineInput, NewJournalEntryLineInput, TaxCode } from '../types';
import { categoryLineAmountCents, computeTaxSplit, suggestTaxCents, totalLineAmountCents } from './computeTaxSplit';

/**
 * Credit notes are the reversal side of the sales and purchase ledgers — the documents that were
 * missing entirely before this. A customer credit note (a return, an overcharge, a goodwill
 * credit) undoes revenue and the GST/HST charged on it; a vendor credit does the same on the
 * purchase side, giving back the expense and the input tax credit claimed.
 *
 * Both are the exact mirror of their originating document, so they reuse the same tax-splitting
 * rules (see computeTaxSplit) — including the parts that aren't symmetric: non-recoverable tax
 * (USTax, and the restricted half of MealsHST) stays folded into the category account on the way
 * out just as it was on the way in, which is what keeps a credit note for the full amount of a
 * bill leave both accounts at zero.
 */

export interface CreditNoteLineTotals {
  lines: NewJournalEntryLineInput[];
  /** Base + all tax across every line — the amount that moves through AR or AP. */
  totalCents: number;
}

function buildCategoryLines(
  lines: NewCreditNoteLineInput[],
  lineBaseAmountCents: number[],
  taxAccountId: number,
  direction: 'customer' | 'vendor',
): CreditNoteLineTotals {
  if (lines.length === 0) throw new Error('A credit note needs at least one line item.');
  if (lines.length !== lineBaseAmountCents.length) {
    throw new Error('Credit note lines and computed amounts must be the same length.');
  }
  for (const baseCents of lineBaseAmountCents) {
    if (!Number.isInteger(baseCents) || baseCents <= 0) {
      throw new Error('Each credit note line must have a positive amount.');
    }
  }

  // A customer credit reverses revenue, so the category lines are DEBITS and the tax comes back out
  // of GST/HST Payable (also a debit). A vendor credit reverses an expense, so both are CREDITS.
  const categoryIsDebit = direction === 'customer';

  let totalCents = 0;
  let claimableTaxTotalCents = 0;
  const journalLines: NewJournalEntryLineInput[] = lines.map((line, i) => {
    const baseCents = lineBaseAmountCents[i];
    const taxCode: TaxCode | null = line.taxCode ?? null;
    if (direction === 'customer' && taxCode === 'MealsHST') {
      throw new Error("The Meals & Entertainment tax code applies to purchases only — use 'HST' on a customer credit note.");
    }
    const manualHstCents = taxCode === 'Manual' ? (line.manualHstCents ?? null) : null;
    const taxCents = taxCode === 'Manual' ? (manualHstCents ?? 0) : suggestTaxCents(taxCode, baseCents);
    const split = computeTaxSplit(taxCode, taxCents);
    totalCents += totalLineAmountCents(baseCents, split);
    claimableTaxTotalCents += split.claimableTaxCents;

    const amountCents = categoryLineAmountCents(baseCents, split);
    return {
      accountId: line.categoryAccountId,
      debitCents: categoryIsDebit ? amountCents : 0,
      creditCents: categoryIsDebit ? 0 : amountCents,
      description: line.description,
      taxCode,
      manualHstCents,
      baseCents,
    };
  });

  if (claimableTaxTotalCents > 0) {
    journalLines.push({
      accountId: taxAccountId,
      debitCents: categoryIsDebit ? claimableTaxTotalCents : 0,
      creditCents: categoryIsDebit ? 0 : claimableTaxTotalCents,
      description: direction === 'customer' ? 'GST/HST on customer credit note' : 'GST/HST on vendor credit',
    });
  }

  return { lines: journalLines, totalCents };
}

/**
 * Customer credit note:
 *   Debit  Revenue              (per line, reversing the sale)
 *   Debit  GST/HST Payable      (reversing the tax charged)
 *   Credit Accounts Receivable  (the credit now owed back to the customer)
 *
 * The AR credit is what makes the balance available to either settle an open invoice or be paid
 * out as a refund; neither of those re-touches revenue.
 */
export function buildCustomerCreditNoteJournalLines(
  accountsReceivableId: number,
  gstHstPayableId: number,
  lines: NewCreditNoteLineInput[],
  lineBaseAmountCents: number[],
): { lines: NewJournalEntryLineInput[]; totalCents: number } {
  const { lines: categoryLines, totalCents } = buildCategoryLines(lines, lineBaseAmountCents, gstHstPayableId, 'customer');
  return {
    lines: [...categoryLines, { accountId: accountsReceivableId, debitCents: 0, creditCents: totalCents, description: null }],
    totalCents,
  };
}

/**
 * Vendor credit:
 *   Credit Expense/Asset         (per line, reversing the purchase)
 *   Credit GST/HST Recoverable   (giving back the input tax credit claimed)
 *   Debit  Accounts Payable      (the vendor now owes you, so you owe them less)
 */
export function buildVendorCreditJournalLines(
  accountsPayableId: number,
  gstHstRecoverableId: number,
  lines: NewCreditNoteLineInput[],
  lineBaseAmountCents: number[],
): { lines: NewJournalEntryLineInput[]; totalCents: number } {
  const { lines: categoryLines, totalCents } = buildCategoryLines(lines, lineBaseAmountCents, gstHstRecoverableId, 'vendor');
  return {
    lines: [{ accountId: accountsPayableId, debitCents: totalCents, creditCents: 0, description: null }, ...categoryLines],
    totalCents,
  };
}

/**
 * Refunding an open customer credit in cash:
 *   Debit  Accounts Receivable  (clearing the credit balance)
 *   Credit bank
 *
 * Revenue and GST/HST were already reversed when the credit note was issued, so a refund only
 * moves money — touching them again would double-count the reversal.
 */
export function buildCustomerRefundJournalLines(accountsReceivableId: number, bankAccountId: number, amountCents: number, label: string): NewJournalEntryLineInput[] {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('A refund needs a positive amount.');
  return [
    { accountId: accountsReceivableId, debitCents: amountCents, creditCents: 0, description: label },
    { accountId: bankAccountId, debitCents: 0, creditCents: amountCents, description: label },
  ];
}

/** Receiving cash back from a vendor for an open vendor credit — the mirror of the above. */
export function buildVendorRefundJournalLines(accountsPayableId: number, bankAccountId: number, amountCents: number, label: string): NewJournalEntryLineInput[] {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('A refund needs a positive amount.');
  return [
    { accountId: bankAccountId, debitCents: amountCents, creditCents: 0, description: label },
    { accountId: accountsPayableId, debitCents: 0, creditCents: amountCents, description: label },
  ];
}
