import { z } from 'zod';
import { FOREIGN_CURRENCY_CODES } from '@shared/domain/types';
import { computeForeignBalances, type ForeignBalance } from '@shared/domain/currency/foreignBalances';
import { dayAfter, planRevaluation, reversedJournalLines, revaluationJournalLines, type RevaluationPlan } from '@shared/domain/currency/revaluation';
import { getCurrentDb } from '../companyFile';
import { getAllAccounts, getAllBills, getAllInvoices, getAllJournalEntriesWithLines } from '../db/queries';
import { ensureAccountByName } from '../db/ensureAccount';
import { ACCOUNTS_PAYABLE_ARGS, ACCOUNTS_RECEIVABLE_ARGS, EXCHANGE_GAIN_LOSS_ACCOUNT_ARGS } from '../db/controlAccounts';
import { journalCreate, journalPost } from './journal.handlers';

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const revaluationInputSchema = z.object({
  asOfDate: ISO_DATE,
  rates: z.record(z.enum(FOREIGN_CURRENCY_CODES), z.number().positive()),
});

/** Foreign balance of every account held in a foreign currency, as at today or a given date. */
export async function fxForeignBalances(input?: unknown): Promise<ForeignBalance[]> {
  const { asOfDate } = z.object({ asOfDate: ISO_DATE.optional() }).parse(input ?? {});
  const db = getCurrentDb();
  const [accounts, entries] = await Promise.all([getAllAccounts(db), getAllJournalEntriesWithLines(db)]);
  return computeForeignBalances(accounts, entries, asOfDate);
}

export interface RevaluationPreview extends RevaluationPlan {
  /** Names for the plan's account ids, for the screen. */
  accountNames: Record<number, string>;
  /** Currencies that have anything to revalue — so the screen knows which rates to ask for. */
  currencies: string[];
  /** An existing revaluation already posted for this date, if any. */
  alreadyPosted: { journalEntryId: number; reversalEntryId: number | null } | null;
}

async function buildPreview(asOfDate: string, rates: Record<string, number>): Promise<RevaluationPreview> {
  const db = getCurrentDb();
  const [accounts, entries, invoices, bills] = await Promise.all([getAllAccounts(db), getAllJournalEntriesWithLines(db), getAllInvoices(db), getAllBills(db)]);
  const accountsReceivableId = await ensureAccountByName(db, ...ACCOUNTS_RECEIVABLE_ARGS);
  const accountsPayableId = await ensureAccountByName(db, ...ACCOUNTS_PAYABLE_ARGS);
  const foreignBalances = computeForeignBalances(accounts, entries, asOfDate);
  const openInvoices = invoices.filter((row) => row.balanceDueCents > 0 && row.foreignCurrency);
  const openBills = bills.filter((row) => row.balanceDueCents > 0 && row.foreignCurrency);
  const currencies = [...new Set([...foreignBalances.map((b) => b.currency), ...openInvoices.map((i) => i.foreignCurrency!), ...openBills.map((b) => b.foreignCurrency!)])].sort();
  const plan = planRevaluation({ asOfDate, rates, foreignBalances, openInvoices, openBills, accountsReceivableId, accountsPayableId });
  const accountNames: Record<number, string> = {};
  for (const account of accounts) accountNames[account.id] = account.name;
  for (const line of plan.lines) if (line.kind === 'bank') line.label = accountNames[line.accountId] ?? line.label;
  const existing = entries.find((entry) => entry.status === 'posted' && entry.reference === `FX-REVAL-${asOfDate}`);
  const reversal = existing ? entries.find((entry) => entry.status === 'posted' && entry.reference === `FX-REVAL-${asOfDate}-REV`) : undefined;
  return { ...plan, accountNames, currencies, alreadyPosted: existing ? { journalEntryId: existing.id, reversalEntryId: reversal?.id ?? null } : null };
}

/** What the revaluation would post, for the given closing rates. Rates may be partial: currencies
 * without one are listed in `missingRates` and left out of the figures. */
export async function fxRevaluationPreview(input: unknown): Promise<RevaluationPreview> {
  const { asOfDate, rates } = revaluationInputSchema.parse(input);
  return buildPreview(asOfDate, rates);
}

/** Posts the period-end adjustment and its reversal on the following day. Refuses to post twice
 * for the same date — void the earlier pair first if the rates were wrong. */
export async function fxRevaluationPost(input: unknown): Promise<{ journalEntryId: number; reversalEntryId: number; totalGainLossCents: number }> {
  const { asOfDate, rates } = revaluationInputSchema.parse(input);
  const preview = await buildPreview(asOfDate, rates);
  if (preview.alreadyPosted) throw new Error(`A revaluation for ${asOfDate} is already posted (journal ${preview.alreadyPosted.journalEntryId}). Void it and its reversal first to post again.`);
  if (preview.missingRates.length > 0) throw new Error(`No closing rate given for ${preview.missingRates.join(', ')}.`);
  const db = getCurrentDb();
  const exchangeAccountId = await ensureAccountByName(db, ...EXCHANGE_GAIN_LOSS_ACCOUNT_ARGS);
  const lines = revaluationJournalLines(preview, exchangeAccountId);
  if (lines.length === 0) throw new Error('Nothing to revalue: every foreign balance is already at the closing rate.');
  const rateNote = Object.entries(rates).map(([code, rate]) => `${code} ${rate}`).join(', ');
  return db.transaction().execute(async (trx) => {
    const adjustment = await journalCreate({ entryDate: asOfDate, memo: `Foreign currency revaluation at ${rateNote}`, reference: `FX-REVAL-${asOfDate}`, isAdjustingEntry: true, lines }, trx);
    const posted = await journalPost(adjustment.id, trx);
    const reversal = await journalCreate({ entryDate: dayAfter(asOfDate), memo: `Reversal of foreign currency revaluation as at ${asOfDate}`, reference: `FX-REVAL-${asOfDate}-REV`, isAdjustingEntry: true, lines: reversedJournalLines(lines) }, trx);
    const postedReversal = await journalPost(reversal.id, trx);
    return { journalEntryId: posted.id, reversalEntryId: postedReversal.id, totalGainLossCents: preview.totalGainLossCents };
  });
}
