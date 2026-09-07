import { categoryLineAmountCents, computeTaxSplit } from '@shared/domain/ledger/computeTaxSplit';
import { provincialTaxAccount } from '@shared/domain/ledger/taxCodes';
import type { NewJournalEntryLineInput, TaxCode } from '@shared/domain/types';
import type { AppDb } from './schema';
import { ensureAccountByName } from './ensureAccount';

// GIFI 2680 ("taxes payable") is CRA's combined income-tax + GST/HST payable line (secondary
// source — see gifi_codes.seed.ts). GIFI 1066 ("Taxes receivable") is CRA's own confirmed code
// covering GST/HST, income tax refunds, and tax credits receivable (RC4088 GIFI guide).
const GST_HST_PAYABLE_ARGS = ['GST/HST Payable', 'Liability', '2280', '2680', 'Current Liability'] as const;
const GST_HST_RECOVERABLE_ARGS = ['GST/HST Recoverable', 'Asset', '1250', '1066', 'Current Asset'] as const;

export async function ensureGstHstAccountId(db: AppDb, direction: 'payable' | 'recoverable'): Promise<number> {
  return direction === 'payable' ? ensureAccountByName(db, ...GST_HST_PAYABLE_ARGS) : ensureAccountByName(db, ...GST_HST_RECOVERABLE_ARGS);
}

/** The province's own payable (sales) or recoverable (Quebec purchases) account for a provincial
 * tax code — created on first use, like the GST/HST accounts. Null when the code has no
 * provincial slice to post separately. */
export async function ensureProvincialTaxAccountId(db: AppDb, taxCode: TaxCode | null, direction: 'payable' | 'recoverable'): Promise<number | null> {
  const meta = provincialTaxAccount(taxCode);
  if (!meta) return null;
  if (direction === 'payable') return ensureAccountByName(db, meta.payableName, 'Liability', meta.payableCode, '2680', 'Current Liability');
  if (!meta.recoverableName || !meta.recoverableCode) return null;
  return ensureAccountByName(db, meta.recoverableName, 'Asset', meta.recoverableCode, '1066', 'Current Asset');
}

export interface TaxSplitLinesInput {
  categoryAccountId: number;
  moneyAccountId: number;
  baseCents: number;
  taxCode: TaxCode | null;
  /** The real tax amount to post — always the UI's (editable) figure, never recomputed from a
   * flat rate here. See computeTaxSplit.ts / suggestTaxCents for how the UI prefills it. */
  taxCents: number;
  /** 'expense': category is Debited, money is Credited. 'income': money is Debited, category is Credited. */
  direction: 'expense' | 'income';
  description: string | null;
  foreignFields?: Partial<Pick<NewJournalEntryLineInput, 'foreignCurrency' | 'foreignAmountCents' | 'exchangeRate'>>;
}

/**
 * Builds the 2-3 GL lines for a category/money transaction with its tax posted to a dedicated
 * GST/HST Payable (income) or GST/HST Recoverable (expense) account instead of being embedded in
 * the category account — the fix that keeps the Income Statement from including tax in Revenue/
 * Expense totals (see incomeStatement.ts / computeAccountBalances.ts, which have no tax-awareness
 * and simply sum whatever lands in each account). The category line still gets any non-claimable
 * tax folded in (USTax in full, or Meals & Entertainment's non-recoverable 50%) since that portion
 * really is part of the cost, not a recoverable/collectable tax amount.
 */
export async function buildTaxSplitJournalLines(
  db: AppDb,
  input: TaxSplitLinesInput,
): Promise<{ lines: NewJournalEntryLineInput[]; totalCents: number }> {
  const split = computeTaxSplit(input.taxCode, input.taxCents, input.direction === 'expense' ? 'purchase' : 'sale');
  const categoryCents = categoryLineAmountCents(input.baseCents, split);
  const totalCents = input.baseCents + split.totalTaxCents;
  const isExpense = input.direction === 'expense';

  const categoryLine: NewJournalEntryLineInput = {
    accountId: input.categoryAccountId,
    debitCents: isExpense ? categoryCents : 0,
    creditCents: isExpense ? 0 : categoryCents,
    description: input.description,
    taxCode: input.taxCode,
    manualHstCents: input.taxCode === 'Manual' ? input.taxCents : null,
    baseCents: input.baseCents,
    ...input.foreignFields,
  };
  const moneyLine: NewJournalEntryLineInput = {
    accountId: input.moneyAccountId,
    debitCents: isExpense ? 0 : totalCents,
    creditCents: isExpense ? totalCents : 0,
    description: input.description,
  };

  const lines: NewJournalEntryLineInput[] = isExpense ? [categoryLine, moneyLine] : [moneyLine, categoryLine];

  // The federal share goes to GST/HST; a provincial share (PST/RST collected, QST either way)
  // goes to the province's own account so each return reads from its own balance.
  const federalCents = split.claimableTaxCents - split.provincialClaimableCents;
  const insertAt = isExpense ? 1 : 2;
  if (split.provincialClaimableCents > 0) {
    const provincialId = await ensureProvincialTaxAccountId(db, input.taxCode, isExpense ? 'recoverable' : 'payable');
    if (provincialId !== null) {
      const meta = provincialTaxAccount(input.taxCode)!;
      lines.splice(insertAt, 0, { accountId: provincialId, debitCents: isExpense ? split.provincialClaimableCents : 0, creditCents: isExpense ? 0 : split.provincialClaimableCents, description: `${meta.taxName} (${meta.province})` });
    }
  }
  if (federalCents > 0) {
    const gstAccountId = await ensureGstHstAccountId(db, isExpense ? 'recoverable' : 'payable');
    lines.splice(insertAt, 0, { accountId: gstAccountId, debitCents: isExpense ? federalCents : 0, creditCents: isExpense ? 0 : federalCents, description: 'GST/HST' });
  }

  return { lines, totalCents };
}
