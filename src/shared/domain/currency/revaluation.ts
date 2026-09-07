import type { Bill, Invoice } from '../types';
import type { ForeignBalance } from './foreignBalances';
import { convertForeignAmountToCadCents } from './convertForeignAmount';
import { foreignOutstandingCents } from './fxSettlement';

/**
 * Period-end revaluation of foreign-currency balances — QuickBooks' "home currency adjustment".
 *
 * At a period end the books must show foreign balances at that day's rate: a USD bank account,
 * the USD still owed by customers, the USD still owed to vendors. The difference between what
 * the ledger carries in CAD (the rates each transaction was booked at) and the balance at the
 * closing rate is an UNREALIZED exchange gain or loss. It is posted as an adjusting entry dated
 * the period end and reversed on the first day of the next period, so the next settlement still
 * measures its realized gain against the rate the document was booked at, exactly as before.
 * One adjusting entry, one reversal, nothing left behind — the way a CPA would post it by hand.
 */
export interface RevaluationRates {
  /** CAD per 1 unit of each foreign currency at the closing date. */
  [currency: string]: number;
}

export interface RevaluationLine {
  kind: 'bank' | 'receivable' | 'payable';
  currency: string;
  /** For a bank/card account: the account itself. For AR/AP: the control account. */
  accountId: number;
  label: string;
  foreignCents: number;
  bookedCadCents: number;
  revaluedCadCents: number;
  /** Positive = unrealized gain, negative = unrealized loss, CAD cents. */
  gainLossCents: number;
}

export interface RevaluationPlan {
  asOfDate: string;
  lines: RevaluationLine[];
  totalGainLossCents: number;
  /** Currencies present in the books with no closing rate supplied — nothing is posted for them. */
  missingRates: string[];
}

export interface RevaluationInputs {
  asOfDate: string;
  rates: RevaluationRates;
  foreignBalances: ForeignBalance[];
  /** Open (unpaid) foreign invoices as at the date, with the control account they sit in. */
  openInvoices: Invoice[];
  openBills: Bill[];
  accountsReceivableId: number;
  accountsPayableId: number;
}

export function planRevaluation(input: RevaluationInputs): RevaluationPlan {
  const { asOfDate, rates, foreignBalances, openInvoices, openBills, accountsReceivableId, accountsPayableId } = input;
  const lines: RevaluationLine[] = [];
  const missing = new Set<string>();
  const rateFor = (currency: string): number | null => {
    const rate = rates[currency];
    if (!rate || !Number.isFinite(rate) || rate <= 0) { missing.add(currency); return null; }
    return rate;
  };

  for (const balance of foreignBalances) {
    if (balance.foreignCents === 0 && balance.cadCents === 0) continue;
    const rate = rateFor(balance.currency);
    if (rate === null) continue;
    const revalued = convertForeignAmountToCadCents(balance.foreignCents, rate);
    lines.push({ kind: 'bank', currency: balance.currency, accountId: balance.accountId, label: `Account ${balance.accountId}`, foreignCents: balance.foreignCents, bookedCadCents: balance.cadCents, revaluedCadCents: revalued, gainLossCents: revalued - balance.cadCents });
  }

  const receivableByCurrency = new Map<string, { foreignCents: number; cadCents: number }>();
  for (const invoice of openInvoices) {
    if (!invoice.foreignCurrency || invoice.foreignAmountCents === null || invoice.exchangeRate === null || invoice.balanceDueCents <= 0) continue;
    if (invoice.invoiceDate > asOfDate) continue;
    const slot = receivableByCurrency.get(invoice.foreignCurrency) ?? { foreignCents: 0, cadCents: 0 };
    slot.foreignCents += foreignOutstandingCents(invoice.foreignAmountCents, invoice.totalCents, invoice.balanceDueCents);
    slot.cadCents += invoice.balanceDueCents;
    receivableByCurrency.set(invoice.foreignCurrency, slot);
  }
  for (const [currency, slot] of receivableByCurrency) {
    const rate = rateFor(currency);
    if (rate === null) continue;
    const revalued = convertForeignAmountToCadCents(slot.foreignCents, rate);
    lines.push({ kind: 'receivable', currency, accountId: accountsReceivableId, label: `Accounts Receivable — ${currency}`, foreignCents: slot.foreignCents, bookedCadCents: slot.cadCents, revaluedCadCents: revalued, gainLossCents: revalued - slot.cadCents });
  }

  const payableByCurrency = new Map<string, { foreignCents: number; cadCents: number }>();
  for (const bill of openBills) {
    if (!bill.foreignCurrency || bill.foreignAmountCents === null || bill.exchangeRate === null || bill.balanceDueCents <= 0) continue;
    if (bill.billDate > asOfDate) continue;
    const slot = payableByCurrency.get(bill.foreignCurrency) ?? { foreignCents: 0, cadCents: 0 };
    slot.foreignCents += foreignOutstandingCents(bill.foreignAmountCents, bill.amountCents, bill.balanceDueCents);
    slot.cadCents += bill.balanceDueCents;
    payableByCurrency.set(bill.foreignCurrency, slot);
  }
  for (const [currency, slot] of payableByCurrency) {
    const rate = rateFor(currency);
    if (rate === null) continue;
    const revalued = convertForeignAmountToCadCents(slot.foreignCents, rate);
    // Owing more CAD than was booked is a loss.
    lines.push({ kind: 'payable', currency, accountId: accountsPayableId, label: `Accounts Payable — ${currency}`, foreignCents: slot.foreignCents, bookedCadCents: slot.cadCents, revaluedCadCents: revalued, gainLossCents: slot.cadCents - revalued });
  }

  const totalGainLossCents = lines.reduce((sum, line) => sum + line.gainLossCents, 0);
  return { asOfDate, lines, totalGainLossCents, missingRates: [...missing].sort() };
}

export interface RevaluationJournalLine {
  accountId: number;
  debitCents: number;
  creditCents: number;
  description: string;
}

/** The adjusting entry's lines: each revalued account moves by its difference, and the Exchange
 * Gain/Loss account takes the other side. Lines with no difference are left out; an empty result
 * means there is nothing to post. */
export function revaluationJournalLines(plan: RevaluationPlan, exchangeGainLossAccountId: number): RevaluationJournalLine[] {
  const lines: RevaluationJournalLine[] = [];
  let net = 0;
  for (const line of plan.lines) {
    if (line.gainLossCents === 0) continue;
    // Bank and receivable: a gain means the asset is worth more (debit). Payable: a gain means the
    // liability is smaller (debit the liability) — so the direction is the same for all three.
    const debit = line.gainLossCents > 0 ? line.gainLossCents : 0;
    const credit = line.gainLossCents < 0 ? -line.gainLossCents : 0;
    lines.push({ accountId: line.accountId, debitCents: debit, creditCents: credit, description: `Revalue ${line.label} (${line.currency} ${(line.foreignCents / 100).toFixed(2)}) at closing rate` });
    net += line.gainLossCents;
  }
  if (lines.length === 0) return [];
  lines.push({ accountId: exchangeGainLossAccountId, debitCents: net < 0 ? -net : 0, creditCents: net > 0 ? net : 0, description: `Unrealized exchange ${net >= 0 ? 'gain' : 'loss'} as at ${plan.asOfDate}` });
  return lines;
}

/** The reversing entry: every line flipped, dated the day after the period end. */
export function reversedJournalLines(lines: RevaluationJournalLine[]): RevaluationJournalLine[] {
  return lines.map((line) => ({ ...line, debitCents: line.creditCents, creditCents: line.debitCents, description: `Reverse: ${line.description}` }));
}

export function dayAfter(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
