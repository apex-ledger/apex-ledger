import { quickEntrySchema } from '@shared/validation/schemas';
import { getCurrentDb } from '../companyFile';
import { buildTaxSplitJournalLines } from '../db/buildTaxSplitLines';
import { journalCreate, journalGet, journalPost, journalVoid } from './journal.handlers';
import type { AppDb } from '../db/schema';

/** Posts a Quick Entry expense/sale with tax split onto its own GST/HST Payable/Recoverable line
 * (see buildTaxSplitLines.ts) instead of leaving it embedded in the category account. */
export async function quickEntryCreate(input: unknown, executor?: AppDb) {
  const payload = quickEntrySchema.parse(input);
  const db = executor ?? getCurrentDb();

  // Defense in depth: the renderer's category dropdown is already restricted to the right account
  // type for the current tab, but this is the one place that actually determines the debit/credit
  // direction of real money — worth re-checking server-side rather than trusting the client never
  // sends a mismatched id (a future UI bug, a stale cache, or a hand-crafted IPC call could all
  // otherwise post an Expense entry against a Revenue account or vice versa).
  const categoryAccount = await db.selectFrom('accounts').selectAll().where('id', '=', payload.categoryAccountId).executeTakeFirstOrThrow();
  const expectedType = payload.type === 'expense' ? 'Expense' : 'Revenue';
  if (categoryAccount.accountType !== expectedType) {
    const entryKind = payload.type === 'expense' ? 'an Expense' : 'a Sale/Income';
    throw new Error(
      `"${categoryAccount.name}" is a ${categoryAccount.accountType} account, but this is ${entryKind} entry — its category must be a ${expectedType} account.`,
    );
  }

  const foreignFields =
    payload.foreignCurrency && payload.foreignAmountCents !== null && payload.exchangeRate !== null
      ? { foreignCurrency: payload.foreignCurrency, foreignAmountCents: payload.foreignAmountCents, exchangeRate: payload.exchangeRate }
      : {};

  const { lines } = await buildTaxSplitJournalLines(db, {
    categoryAccountId: payload.categoryAccountId,
    moneyAccountId: payload.moneyAccountId,
    baseCents: payload.baseCents,
    taxCode: payload.taxCode,
    taxCents: payload.taxCode ? payload.taxCents : 0,
    direction: payload.type,
    description: payload.description,
    foreignFields,
  });

  // Create-then-post as one unit, so a failed post doesn't leave a stray draft behind.
  return db
    .transaction()
    .execute(async (trx) => {
      const entry = await journalCreate(
        {
          entryDate: payload.entryDate,
          memo: payload.description,
          reference: null,
          lines,
          periodFrom: payload.periodFrom,
          periodTo: payload.periodTo,
          source: 'quickEntry',
          sourceReference: null,
        },
        trx,
      );
      return journalPost(entry.id, trx);
    });
}

/** Atomically replaces a posted Quick Entry while preserving its voided original. The renderer
 * sends only the corrected date/base/tax; account, direction, memo, period and tax code are read
 * from the original entry so a stale or manipulated UI cannot silently redirect the correction. */
export async function quickEntryCorrect(input: unknown, executor?: AppDb) {
  const payload = input as { originalEntryId: number; entryDate: string; baseCents: number; taxCents: number };
  if (!Number.isInteger(payload.originalEntryId) || payload.originalEntryId <= 0) throw new Error('Original entry is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.entryDate)) throw new Error('A valid correction date is required.');
  if (!Number.isInteger(payload.baseCents) || payload.baseCents <= 0) throw new Error('Correction amount must be greater than zero.');
  if (!Number.isInteger(payload.taxCents) || payload.taxCents < 0) throw new Error('Correction tax cannot be negative.');
  const db = executor ?? getCurrentDb();
  return db.transaction().execute(async (trx) => {
    const original = await journalGet(payload.originalEntryId, trx);
    if (original.status !== 'posted') throw new Error('Only a posted Quick Entry can be corrected.');
    if (original.source !== 'quickEntry' && !(original.source === 'manual' && original.sourceReference == null)) {
      throw new Error('This entry belongs to another business document. Correct it from its original page.');
    }
    const accountRows = await trx.selectFrom('accounts').select(['id', 'accountType']).execute();
    const accountTypes = new Map(accountRows.map((account) => [account.id, account.accountType]));
    const categoryLine = original.lines.find((line) => accountTypes.get(line.accountId) === 'Expense' || accountTypes.get(line.accountId) === 'Revenue');
    const gstLine = original.lines.find((line) => line.description === 'GST/HST');
    let corrected;
    if (categoryLine) {
      const direction = accountTypes.get(categoryLine.accountId) === 'Revenue' ? 'income' : 'expense';
      const moneyLine = original.lines.find((line) => line.id !== categoryLine.id && line.id !== gstLine?.id);
      if (!moneyLine) throw new Error('The original money-account line could not be identified.');
      const { lines } = await buildTaxSplitJournalLines(trx, {
        categoryAccountId: categoryLine.accountId,
        moneyAccountId: moneyLine.accountId,
        baseCents: payload.baseCents,
        taxCode: categoryLine.taxCode,
        taxCents: categoryLine.taxCode ? payload.taxCents : 0,
        direction,
        description: original.memo,
        foreignFields: categoryLine.foreignCurrency && categoryLine.foreignAmountCents != null && categoryLine.exchangeRate != null
          ? { foreignCurrency: categoryLine.foreignCurrency, foreignAmountCents: categoryLine.foreignAmountCents, exchangeRate: payload.baseCents === categoryLine.baseCents ? categoryLine.exchangeRate : payload.baseCents / categoryLine.foreignAmountCents }
          : {},
      });
      const draft = await journalCreate({ entryDate: payload.entryDate, memo: original.memo, reference: original.reference, lines, periodFrom: original.periodFrom, periodTo: original.periodTo, source: 'quickEntry', sourceReference: `Correction of Quick Entry ${original.id}` }, trx);
      corrected = await journalPost(draft.id, trx);
    } else {
      if (original.lines.length !== 2) throw new Error('Only a two-account transfer can be corrected here.');
      const lines = original.lines.map((line) => ({ accountId: line.accountId, debitCents: line.debitCents > 0 ? payload.baseCents : 0, creditCents: line.creditCents > 0 ? payload.baseCents : 0, description: line.description }));
      const draft = await journalCreate({ entryDate: payload.entryDate, memo: original.memo, reference: original.reference, lines, periodFrom: original.periodFrom, periodTo: original.periodTo, source: 'quickEntry', sourceReference: `Correction of Quick Entry ${original.id}` }, trx);
      corrected = await journalPost(draft.id, trx);
    }
    const voided = await journalVoid(original.id, false, trx);
    return { original: voided, corrected };
  });
}
