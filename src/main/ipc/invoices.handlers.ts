import { tagLinesWithContact } from '@shared/domain/ledger/tagLinesWithContact';
import { depositRefusalReason, isAwaitingDeposit } from '@shared/domain/sales/undepositedFunds';
import { currencyMatchRefusalReason, moneyAccountRefusalReason } from '@shared/domain/banking/bankAccountRules';
import { depositDateRefusalReason, paymentDateRefusalReason } from '@shared/domain/documents/paymentTiming';
import { inactiveContactRefusalReason } from '@shared/domain/contacts/contactRules';
import { nextDocumentNumber, resolveNewDocumentNumber } from '@shared/domain/documents/documentNumbering';
import { assertSaleLineAccounts } from './saleLineAccounts';
import { changeInvoiceDateSchema, makeDepositSchema, newInvoiceSchema, receiveInvoicePaymentSchema, updateInvoiceSchema, writeOffInvoiceSchema } from '@shared/validation/schemas';
import { invoiceEditRefusalReason } from '@shared/domain/sales/invoiceEditing';
import { buildInvoiceJournalLines, computeInvoiceLineAmountCents } from '@shared/domain/ledger/buildInvoiceJournalLines';
import type { InvoiceLine, UndepositedItem } from '@shared/domain/types';
import { getCurrentDb } from '../companyFile';
import { getAllDeposits, getAllInvoices, getAllSalesReceipts, getInvoiceById } from '../db/queries';
import { mapDepositRow, mapInvoiceLineRow, mapInvoiceRow } from '../db/mappers';
import { ensureAccountByName } from '../db/ensureAccount';
import { ensureGstHstAccountId, ensureProvincialTaxAccountId } from '../db/buildTaxSplitLines';
import { journalCreate, journalGet, journalPost, journalUpdateDate, journalVoid, recordRevisions } from './journal.handlers';
import { buildSaleStockMovements } from '@shared/domain/inventory/buildSaleStockMovements';
import { movementsCreate } from './inventory.handlers';
import { buildInventoryJournalLines, inventoryPostingMemo } from '@shared/domain/inventory/buildInventoryJournalLines';
import { valueProduct, type InventoryMovement } from '@shared/domain/inventory/inventoryValuation';
import { salesReceiptsGet } from './salesReceipts.handlers';
import type { AppDb } from '../db/schema';

import { ACCOUNTS_RECEIVABLE_ARGS as AR_ACCOUNT_ARGS, UNDEPOSITED_FUNDS_ACCOUNT_ARGS, EXCHANGE_GAIN_LOSS_ACCOUNT_ARGS } from '../db/controlAccounts';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { computeLateInterest } from '@shared/domain/sales/lateInterest';
import { foreignOutstandingCents, settleForeignPayment } from '@shared/domain/currency/fxSettlement';
import { documentLineTags, tagDocumentLines } from '@shared/domain/ledger/tagDocumentLines';

const CUSTOMER_DISCOUNT_ACCOUNT_ARGS = ['Customer Discounts', 'Expense', '5900', '9270', 'Other Expense'] as const;
const BAD_DEBT_ACCOUNT_ARGS = ['Bad Debt Expense', 'Expense', '5180', '8590', 'Operating Expense'] as const;
/** Re-exported for the sales-receipt handler, which resolves to this exact same account. */
export { UNDEPOSITED_FUNDS_ACCOUNT_ARGS };

export async function invoicesList() {
  const db = getCurrentDb();
  return getAllInvoices(db);
}

export async function invoicesGet(id: number) {
  const db = getCurrentDb();
  const invoice = await getInvoiceById(db, id);
  if (!invoice) throw new Error(`Invoice ${id} not found.`);
  return invoice;
}

/** One invoice's payments, or every payment in the company when no invoice is given — the
 * customer view needs all of them at once rather than one round trip per invoice. */
export async function invoicesPayments(invoiceId?: number) {
  const db = getCurrentDb();
  let query = db.selectFrom('invoicePayments').select(['id', 'invoiceId', 'paymentDate', 'amountCents', 'moneyAccountId', 'journalEntryId', 'depositId', 'memo', 'createdAt', 'foreignAmountCents', 'exchangeRate', 'fxGainLossCents']).orderBy('paymentDate', 'desc').orderBy('id', 'desc');
  if (invoiceId !== undefined && invoiceId !== null) query = query.where('invoiceId', '=', invoiceId);
  return query.execute();
}

/** Scans existing invoice numbers for the highest "INV-<n>" suffix and returns the next one,
 * seeding at INV-1001 for a brand-new company. Purely a UI convenience default — the number is
 * still editable and enforced unique by the DB, so a manual collision surfaces as a save error
 * rather than being silently resolved. */
export async function invoicesNextNumber(input?: unknown): Promise<string> {
  const { invoiceDate } = (input ?? {}) as { invoiceDate?: string };
  const db = getCurrentDb();
  const rows = await db.selectFrom('invoices').select('invoiceNumber').execute();
  return nextDocumentNumber(
    'INV',
    rows.map((r) => r.invoiceNumber),
    invoiceDate ?? localIsoDate(),
  );
}

/** Recording an invoice posts it to the ledger immediately (Debit Accounts Receivable for the
 * total, Credit each line's revenue account) — matching how a real invoice increases what a
 * customer owes the moment it's issued, whether or not it's been paid yet. */
export async function invoicesCreate(input: unknown, executor?: AppDb) {
  const payload = newInvoiceSchema.parse(input);
  const db = executor ?? getCurrentDb();
  const { journalLines, lineAmounts, totalCents } = await prepareInvoicePosting(db, payload);

  const create = async (trx: AppDb) => {
    const existingNumbers = await trx.selectFrom('invoices').select('invoiceNumber').execute();
    const invoiceNumber = resolveNewDocumentNumber('INV', payload.invoiceNumber, existingNumbers.map((row) => row.invoiceNumber), payload.invoiceDate, 'Invoice number');
    // Posted inside the transaction so a failure inserting the invoice or its lines rolls the GL
    // entry back with it, instead of stranding a posted entry with no invoice.
    const posted = await postInvoiceJournal(trx, payload, invoiceNumber, journalLines, lineAmounts);

    const insertedInvoice = await trx
      .insertInto('invoices')
      .values({
        customerId: payload.customerId,
        invoiceNumber: invoiceNumber,
        customerPoNumber: payload.customerPoNumber,
        shippingAddress: payload.shippingAddress,
        paymentTerms: payload.paymentTerms ?? null,
        invoiceDate: payload.invoiceDate,
        dueDate: payload.dueDate,
        memo: payload.memo,
        totalCents,
        discountCents: payload.discountCents,
        status: 'unpaid',
        invoiceJournalEntryId: posted.id,
        paymentJournalEntryId: null,
        foreignCurrency: payload.foreignCurrency,
        foreignAmountCents: payload.foreignAmountCents,
        exchangeRate: payload.exchangeRate,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const lines = await writeInvoiceLinesAndStock(trx, insertedInvoice.id, invoiceNumber, payload, lineAmounts);
    return mapInvoiceRow(insertedInvoice, lines);
  };
  return executor ? create(db) : db.transaction().execute(create);
}

/** Changes a saved invoice — customer, dates, terms, memo, discount, and adding or removing lines —
 * for as long as nothing else in the books depends on its figures (see invoiceEditRefusalReason).
 *
 * The invoice keeps its row, its number and its history. Its old journal is voided and a new one
 * posted in the same transaction, so the ledger never shows both or neither, and the void leaves the
 * superseded figures on the adjustments trail. Voiding refuses a locked period, a filed GST/HST
 * return and a reconciled line, which means an edit is stopped by exactly the rules that stop a
 * delete — and the whole edit rolls back rather than half-applying. */
export async function invoicesUpdate(input: unknown) {
  const { id, ...fields } = updateInvoiceSchema.parse(input);
  const payload = newInvoiceSchema.parse(fields);
  const db = getCurrentDb();
  const existing = await invoicesGet(id);

  const [paymentRow, creditRow, stockRow] = await Promise.all([
    db.selectFrom('invoicePayments').select((eb) => eb.fn.countAll<number>().as('n')).where('invoiceId', '=', id).executeTakeFirst(),
    db.selectFrom('creditNoteApplications')
      .innerJoin('creditNotes', 'creditNotes.id', 'creditNoteApplications.creditNoteId')
      .select((eb) => eb.fn.coalesce(eb.fn.sum<number>('creditNoteApplications.amountCents'), eb.val(0)).as('cents'))
      .where('creditNotes.kind', '=', 'customer')
      .where('creditNoteApplications.targetId', '=', id)
      .executeTakeFirst(),
    db.selectFrom('inventoryMovements').select('id').where('sourceDocumentType', '=', 'invoice').where('sourceDocumentId', '=', id).executeTakeFirst(),
  ]);
  const refusal = invoiceEditRefusalReason({
    paymentCount: Number(paymentRow?.n ?? 0) + (existing.paidCents > 0 ? 1 : 0),
    writtenOffCents: existing.writtenOffCents ?? 0,
    creditAppliedCents: Number(creditRow?.cents ?? 0),
    postedStock: Boolean(stockRow),
    foreignCurrency: existing.foreignCurrency ?? payload.foreignCurrency ?? null,
  });
  if (refusal) throw new Error(refusal);

  const { journalLines, lineAmounts, totalCents } = await prepareInvoicePosting(db, payload);

  return db.transaction().execute(async (trx) => {
    let invoiceNumber = existing.invoiceNumber;
    if (payload.invoiceNumber.trim() !== existing.invoiceNumber) {
      const taken = await trx.selectFrom('invoices').select('id').where('invoiceNumber', '=', payload.invoiceNumber.trim()).where('id', '!=', id).executeTakeFirst();
      if (taken) throw new Error(`Invoice number ${payload.invoiceNumber.trim()} is already used by another invoice.`);
      invoiceNumber = payload.invoiceNumber.trim();
    }

    if (existing.invoiceJournalEntryId !== null) await journalVoid(existing.invoiceJournalEntryId, false, trx, true);
    const posted = await postInvoiceJournal(trx, payload, invoiceNumber, journalLines, lineAmounts);

    const updated = await trx
      .updateTable('invoices')
      .set({
        customerId: payload.customerId,
        invoiceNumber,
        customerPoNumber: payload.customerPoNumber,
        shippingAddress: payload.shippingAddress,
        paymentTerms: payload.paymentTerms ?? null,
        invoiceDate: payload.invoiceDate,
        dueDate: payload.dueDate,
        memo: payload.memo,
        totalCents,
        discountCents: payload.discountCents,
        status: 'unpaid',
        invoiceJournalEntryId: posted.id,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    await trx.deleteFrom('invoiceLines').where('invoiceId', '=', id).execute();
    const lines = await writeInvoiceLinesAndStock(trx, id, invoiceNumber, payload, lineAmounts);

    const describe = (total: number, count: number) => `${(total / 100).toFixed(2)} — ${count} line${count === 1 ? '' : 's'}`;
    await recordRevisions(trx, posted.id, [{
      field: 'invoice',
      label: `Invoice ${invoiceNumber} edited`,
      kind: 'changed',
      oldValue: describe(existing.totalCents, existing.lines.length),
      newValue: describe(totalCents, lines.length),
    }]);
    return mapInvoiceRow(updated, lines);
  });
}

/** Each line's class/location tags, in line order — read back from the invoice's journal so the
 * edit form can show and keep them. */
export async function invoicesLineTags(id: number): Promise<number[][]> {
  const db = getCurrentDb();
  const invoice = await invoicesGet(id);
  if (invoice.invoiceJournalEntryId === null) return invoice.lines.map(() => []);
  const journalLines = await db.selectFrom('journalEntryLines').select(['id', 'accountId', 'debitCents', 'creditCents']).where('journalEntryId', '=', invoice.invoiceJournalEntryId).orderBy('lineOrder').execute();
  const tagRows = await db
    .selectFrom('journalEntryLineTags')
    .innerJoin('journalEntryLines', 'journalEntryLines.id', 'journalEntryLineTags.journalEntryLineId')
    .select(['journalEntryLineTags.journalEntryLineId as lineId', 'journalEntryLineTags.tagId as tagId'])
    .where('journalEntryLines.journalEntryId', '=', invoice.invoiceJournalEntryId)
    .execute();
  const tagsByLine = new Map<number, number[]>();
  for (const row of tagRows) tagsByLine.set(row.lineId, [...(tagsByLine.get(row.lineId) ?? []), row.tagId]);
  return documentLineTags(
    journalLines.map((line) => ({ ...line, tagIds: tagsByLine.get(line.id) ?? [] })),
    invoice.lines.map((line) => ({ accountId: line.revenueAccountId, baseCents: line.amountCents })),
  );
}

type InvoicePayload = ReturnType<typeof newInvoiceSchema.parse>;

/** Everything about an invoice's posting that can be settled before a transaction opens: the
 * customer and line accounts are checked, control accounts are created on first use, and the
 * journal lines and total are built. Reads the outer connection, so it must run before
 * db.transaction() — querying it from inside a transaction deadlocks on the single connection. */
async function prepareInvoicePosting(db: AppDb, payload: InvoicePayload) {
  const customer = await db.selectFrom('customers').select(['name', 'isActive']).where('id', '=', payload.customerId).executeTakeFirst();
  const customerRefusal = inactiveContactRefusalReason('customer', customer && { name: customer.name, isActive: Boolean(customer.isActive) });
  if (customerRefusal) throw new Error(customerRefusal);
  await assertSaleLineAccounts(db, payload.lines.map((line) => line.revenueAccountId), 'invoice');

  const accountsReceivableId = await ensureAccountByName(db, ...AR_ACCOUNT_ARGS);
  const gstHstPayableId = await ensureGstHstAccountId(db, 'payable');
  // Provincial payable accounts for any BC/SK/MB/QC codes on the lines, created on first use.
  const provincialPayableIds: Record<string, number> = {};
  for (const code of new Set(payload.lines.map((line) => line.taxCode).filter((c): c is NonNullable<typeof c> => Boolean(c)))) {
    const id = await ensureProvincialTaxAccountId(db, code, 'payable');
    if (id !== null) provincialPayableIds[code] = id;
  }
  const discountAccountId = payload.discountCents > 0 ? await ensureAccountByName(db, ...CUSTOMER_DISCOUNT_ACCOUNT_ARGS) : null;

  const lineAmounts = payload.lines.map((line) => computeInvoiceLineAmountCents(line));
  const journalLines = tagLinesWithContact(buildInvoiceJournalLines(
    accountsReceivableId,
    gstHstPayableId,
    payload.lines,
    lineAmounts,
    discountAccountId === null ? undefined : { accountId: discountAccountId, amountCents: payload.discountCents, customerId: payload.customerId },
  
    provincialPayableIds,
  ), { customerId: payload.customerId });
  // AR debit (the journal's first line) is the true invoice total: base + tax across every line.
  const totalCents = journalLines[0].debitCents;
  return { journalLines, lineAmounts, totalCents };
}

/** Posts the invoice's journal and attaches each document line's class/location tags to the
 * journal line that carries it. Runs inside the caller's transaction. */
async function postInvoiceJournal(trx: AppDb, payload: InvoicePayload, invoiceNumber: string, journalLines: Awaited<ReturnType<typeof prepareInvoicePosting>>['journalLines'], lineAmounts: number[]) {
  const entry = await journalCreate(
    {
      entryDate: payload.invoiceDate,
      memo: payload.memo ?? `Invoice ${invoiceNumber}`,
      reference: invoiceNumber,
      lines: journalLines,
    },
    trx,
  );
  const posted = await journalPost(entry.id, trx);
  const tagPairs = tagDocumentLines(posted.lines.map((l) => ({ id: l.id, accountId: l.accountId, debitCents: l.debitCents, creditCents: l.creditCents })), payload.lines.map((line, i) => ({ accountId: line.revenueAccountId, baseCents: lineAmounts[i], tagIds: line.tagIds ?? [] })));
  if (tagPairs.length > 0) await trx.insertInto('journalEntryLineTags').values(tagPairs).execute();
  return posted;
}

/** Writes the invoice's lines and, for tracked products, takes the stock and posts its cost.
 * Revenue/A/R and stock/COGS are one accounting event, so a stock setup or quantity error here rolls
 * back the whole invoice instead of leaving the subledger and GL out of sync. */
async function writeInvoiceLinesAndStock(trx: AppDb, invoiceId: number, invoiceNumber: string, payload: InvoicePayload, lineAmounts: number[]) {
  const lines: InvoiceLine[] = [];
  for (const [i, line] of payload.lines.entries()) {
    const insertedLine = await trx
      .insertInto('invoiceLines')
      .values({
        invoiceId,
        lineOrder: i,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        amountCents: lineAmounts[i],
        revenueAccountId: line.revenueAccountId,
        productId: line.productId ?? null,
        taxCode: line.taxCode ?? null,
        manualHstCents: line.taxCode === 'Manual' ? (line.manualHstCents ?? null) : null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    lines.push(mapInvoiceLineRow(insertedLine));
  }

  for (const line of lines) {
    if (line.productId === null || line.quantity <= 0) continue;
    const product = await trx.selectFrom('products').selectAll().where('id', '=', line.productId).executeTakeFirst();
    if (!product) throw new Error(`Product on invoice line "${line.description}" no longer exists.`);
    if (!product.trackQuantity) continue;
    if (product.assetAccountId === null) throw new Error(`Set an Inventory Asset account on ${product.name} before selling it.`);
    if (product.cogsAccountId === null) throw new Error(`Set a Cost of Goods Sold account on ${product.name} before selling it.`);

    const priorRows = await trx.selectFrom('inventoryMovements').selectAll().where('productId', '=', product.id).execute();
    const prior: InventoryMovement[] = priorRows.map((r) => ({
      id: r.id, productId: r.productId, movementDate: r.movementDate, quantityDelta: r.quantityDelta,
      unitCostCents: r.unitCostCents, kind: r.kind as InventoryMovement['kind'], journalEntryId: r.journalEntryId, note: r.note,
    }));
    const before = valueProduct(product.id, prior);
    if (line.quantity > before.quantityOnHand + 1e-9) {
      throw new Error(`Not enough stock for ${product.name}. On hand: ${before.quantityOnHand}; invoice quantity: ${line.quantity}. Record the receipt/adjustment first.`);
    }

    const posting = buildInventoryJournalLines({
      productId: product.id,
      productName: product.name,
      kind: 'sale',
      movementDate: payload.invoiceDate,
      quantityDelta: -Math.abs(line.quantity),
      unitCostCents: null,
      assetAccountId: product.assetAccountId,
      cogsAccountId: product.cogsAccountId,
      counterAccountId: null,
      priorMovements: prior,
    });

    let stockJournalEntryId: number | null = null;
    if (posting.lines.length > 0) {
      const stockEntry = await journalCreate({
        entryDate: payload.invoiceDate,
        memo: inventoryPostingMemo({ kind: 'sale', productName: product.name }),
        reference: invoiceNumber,
        lines: posting.lines,
      }, trx);
      stockJournalEntryId = (await journalPost(stockEntry.id, trx)).id;
    }

    await trx.insertInto('inventoryMovements').values({
      productId: product.id,
      movementDate: payload.invoiceDate,
      quantityDelta: -Math.abs(line.quantity),
      unitCostCents: null,
      kind: 'sale',
      journalEntryId: stockJournalEntryId,
      note: `${invoiceNumber} — ${line.description}`,
      sourceDocumentType: 'invoice',
      sourceDocumentId: invoiceId,
      sourceLineId: line.id,
    }).execute();
  }
  return lines;
}

/** Takes the stock an invoice sold, and posts its cost.
 *
 * Runs AFTER the invoice transaction rather than inside it, deliberately. The two are separate
 * facts: the invoice is a promise to be paid and stands on its own, while the stock movement is
 * about what left the shelf. Folding them into one transaction would mean a product with no
 * inventory account configured could roll back a perfectly good invoice — punishing the sale for a
 * setup problem. Anything that could not be moved is reported instead, so it is visible rather than
 * silent.
 */
export async function invoicesRecordStock(input: unknown) {
  const { invoiceId } = input as { invoiceId: number };
  const db = getCurrentDb();
  const invoice = await db.selectFrom('invoices').selectAll().where('id', '=', invoiceId).executeTakeFirstOrThrow();
  const lineRows = await db.selectFrom('invoiceLines').selectAll().where('invoiceId', '=', invoiceId).orderBy('lineOrder').execute();
  const alreadyPosted = await db.selectFrom('inventoryMovements').select('id').where('sourceDocumentType', '=', 'invoice').where('sourceDocumentId', '=', invoiceId).executeTakeFirst();
  if (alreadyPosted) {
    return { recorded: 0, linesWithoutProduct: lineRows.filter((l) => l.productId === null).length, problems: [] };
  }

  const { movements, linesWithoutProduct } = buildSaleStockMovements(
    lineRows.map((l) => ({ productId: l.productId ?? null, quantity: l.quantity, description: l.description })),
    invoice.invoiceDate,
    invoice.invoiceNumber,
  );

  const problems: string[] = [];
  let recorded = 0;
  for (const movement of movements) {
    try {
      const result = await movementsCreate({ ...movement, unitCostCents: null, counterAccountId: null });
      recorded += 1;
      if (result.notPostedReason) problems.push(result.notPostedReason);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  return { recorded, linesWithoutProduct, problems };
}

/** Receiving payment posts a second entry (Debit the money account, Credit Accounts Receivable),
 * settling the receivable without touching the original revenue recognition. By default that money
 * account is Undeposited Funds — matching QuickBooks Desktop's Receive Payment step, which never
 * touches the real bank account directly, leaving the payment there until a Deposit (see
 * depositsCreate) batches it into a bank account the same way a bookkeeper deposits several
 * customer cheques together as one bank-statement line. Passing bankAccountId instead posts
 * straight to that account — the path Bank Import matching uses, since a statement line already
 * tells you exactly which account and which day the money landed in; forcing it through
 * Undeposited Funds first would just make it invisible to that account's own reconciliation.
 * Full payment only — no partial/split payments, matching how Bills works today. */
export async function invoicesReceivePayment(input: unknown) {
  const parsed = receiveInvoicePaymentSchema.parse(input);
  const { id, paymentDate, bankAccountId, memo } = parsed;
  const db = getCurrentDb();
  const invoice = await invoicesGet(id);
  if (invoice.balanceDueCents <= 0) throw new Error('This invoice has already been paid in full.');
  // A foreign-currency invoice settles in its own currency: the CAD applied to the invoice is
  // the foreign amount at the invoiced rate, the cash is at the rate it actually converted,
  // and the difference is a realized exchange gain or loss posted with the payment.
  const settlement = invoice.foreignCurrency && invoice.foreignAmountCents !== null && invoice.exchangeRate !== null && parsed.foreignAmountCents !== null && parsed.exchangeRate !== null
    ? settleForeignPayment({
        foreignPaidCents: parsed.foreignAmountCents,
        foreignOutstandingCents: foreignOutstandingCents(invoice.foreignAmountCents, invoice.totalCents, invoice.balanceDueCents),
        cadOutstandingCents: invoice.balanceDueCents,
        documentRate: invoice.exchangeRate,
        paymentRate: parsed.exchangeRate,
        side: 'receivable',
      })
    : null;
  const amountCents = settlement ? settlement.cadRelievedCents : parsed.amountCents;
  const cashCents = settlement ? settlement.cadCashCents : amountCents;
  if (amountCents > invoice.balanceDueCents) {
    throw new Error(`Payment cannot exceed the outstanding balance of $${(invoice.balanceDueCents / 100).toFixed(2)}.`);
  }
  const timingRefusal = paymentDateRefusalReason(invoice.invoiceDate, paymentDate, `invoice ${invoice.invoiceNumber}`);
  if (timingRefusal) throw new Error(timingRefusal);

  const accountsReceivableId = await ensureAccountByName(db, ...AR_ACCOUNT_ARGS);
  const undepositedFundsId = await ensureAccountByName(db, ...UNDEPOSITED_FUNDS_ACCOUNT_ARGS);
  const moneyAccountId = bankAccountId ?? undepositedFundsId;

  if (bankAccountId !== null) {
    const account = await db.selectFrom('accounts').select(['id', 'name', 'accountSubtype', 'isActive', 'currency']).where('id', '=', bankAccountId).executeTakeFirst();
    const refusal = moneyAccountRefusalReason(account && { ...account, isActive: Boolean(account.isActive) }, 'receive this payment', { undepositedFundsAccountId: undepositedFundsId });
    if (refusal) throw new Error(refusal);
    const currencyRefusal = account ? currencyMatchRefusalReason(account, invoice.foreignCurrency, `invoice ${invoice.invoiceNumber}`) : null;
    if (currencyRefusal) throw new Error(currencyRefusal);
  }

  const paymentMemo = memo?.trim() || `Payment received — invoice ${invoice.invoiceNumber}`;
  const exchangeAccountId = settlement && settlement.gainLossCents !== 0 ? await ensureAccountByName(db, ...EXCHANGE_GAIN_LOSS_ACCOUNT_ARGS) : null;
  const updated = await db.transaction().execute(async (trx) => {
    const foreign = settlement && invoice.foreignCurrency ? { foreignCurrency: invoice.foreignCurrency, foreignAmountCents: parsed.foreignAmountCents, exchangeRate: parsed.exchangeRate } : {};
    const lines = [
      { accountId: moneyAccountId, debitCents: cashCents, creditCents: 0, description: paymentMemo, ...foreign },
      { accountId: accountsReceivableId, debitCents: 0, creditCents: amountCents, description: paymentMemo },
    ];
    if (settlement && exchangeAccountId !== null && settlement.gainLossCents !== 0) {
      const gain = settlement.gainLossCents;
      lines.push({ accountId: exchangeAccountId, debitCents: gain < 0 ? -gain : 0, creditCents: gain > 0 ? gain : 0, description: `Exchange ${gain > 0 ? 'gain' : 'loss'} — ${invoice.foreignCurrency} at ${parsed.exchangeRate} vs ${invoice.exchangeRate} invoiced` });
    }
    const entry = await journalCreate(
      {
        entryDate: paymentDate,
        memo: paymentMemo,
        reference: `INVOICE-${invoice.id}`,
        lines: tagLinesWithContact(lines, { customerId: invoice.customerId }),
      },
      trx,
    );
    const posted = await journalPost(entry.id, trx);

    await trx.insertInto('invoicePayments').values({
      invoiceId: id,
      paymentDate,
      amountCents,
      moneyAccountId,
      journalEntryId: posted.id,
      depositId: null,
      memo: memo?.trim() || null,
      foreignAmountCents: settlement ? parsed.foreignAmountCents : null,
      exchangeRate: settlement ? parsed.exchangeRate : null,
      fxGainLossCents: settlement ? settlement.gainLossCents : 0,
    }).execute();

    const newPaidCents = invoice.paidCents + amountCents;
    return trx
      .updateTable('invoices')
      .set({
        paidCents: newPaidCents,
        status: newPaidCents >= invoice.totalCents ? 'paid' : 'unpaid',
        // Kept for compatibility with older screens/files; the payment table is now authoritative.
        paymentJournalEntryId: posted.id,
        paymentAccountId: moneyAccountId,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  });

  return mapInvoiceRow(updated, invoice.lines);
}

/** Reverses the newest customer payment and reopens the invoice without touching the sale. */
/** Moves a posted invoice to another date, the way a bookkeeper corrects "I dated it December 31
 * and it belongs in January". The invoice's own journal moves with it (journalUpdateDate: refused
 * inside a locked period or once a line is reconciled, and recorded on the adjustments report).
 * A payment received on the old invoice date moves to the new date too, since it was booked on the
 * same day and cannot stay earlier than the invoice; a payment on any other date stays where it is
 * and must not end up before the new invoice date. The due date keeps its distance unless given. */
export async function invoicesChangeDate(input: unknown) {
  const { id, invoiceDate, dueDate } = changeInvoiceDateSchema.parse(input);
  const db = getCurrentDb();
  const invoice = await invoicesGet(id);
  const oldDate = invoice.invoiceDate;
  const shiftDays = Math.round((Date.parse(`${invoiceDate}T00:00:00Z`) - Date.parse(`${oldDate}T00:00:00Z`)) / 86_400_000);
  const newDue = dueDate ?? (() => { const d = new Date(`${invoice.dueDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + shiftDays); return d.toISOString().slice(0, 10); })();
  if (newDue < invoiceDate) throw new Error('The due date cannot be before the invoice date.');

  const payments = await db.selectFrom('invoicePayments').selectAll().where('invoiceId', '=', id).execute();
  const moving = payments.filter((p) => p.paymentDate === oldDate);
  const staying = payments.filter((p) => p.paymentDate !== oldDate);
  const early = staying.find((p) => p.paymentDate < invoiceDate);
  if (early) throw new Error(`A payment of $${(early.amountCents / 100).toFixed(2)} was received on ${early.paymentDate}, which would be before the new invoice date. Move or reverse that payment first.`);
  const banked = moving.find((p) => p.depositId !== null);
  if (banked) throw new Error(`The payment received on ${oldDate} is already in a bank deposit. Delete that deposit first, change the date, then deposit it again.`);

  // The journals first: each one refuses a locked period or a reconciled line before anything is written.
  if (invoice.invoiceJournalEntryId !== null && oldDate !== invoiceDate) await journalUpdateDate({ id: invoice.invoiceJournalEntryId, entryDate: invoiceDate });
  for (const p of moving) await journalUpdateDate({ id: p.journalEntryId, entryDate: invoiceDate });

  await db.transaction().execute(async (trx) => {
    await trx.updateTable('invoices').set({ invoiceDate, dueDate: newDue }).where('id', '=', id).execute();
    for (const p of moving) await trx.updateTable('invoicePayments').set({ paymentDate: invoiceDate }).where('id', '=', p.id).execute();
  });
  return { invoice: await invoicesGet(id), paymentsMoved: moving.length };
}

/** Writes what is still owed on an invoice off to bad debt, the way a bookkeeper closes an invoice
 * that will never be paid: Bad Debt Expense is debited, Accounts Receivable is credited, and the
 * GST/HST that was collected on the unpaid part is taken back out of GST/HST Payable, since the
 * CRA allows the tax on a bad debt to be recovered (an adjustment on the return). The invoice keeps
 * its number and lines; its balance falls to nil and the customer statement shows the write-off. */
export async function invoicesWriteOff(input: unknown) {
  const { id, writeOffDate, memo } = writeOffInvoiceSchema.parse(input);
  const db = getCurrentDb();
  const invoice = await invoicesGet(id);
  const balance = invoice.balanceDueCents;
  if (balance <= 0) throw new Error('This invoice has nothing outstanding to write off.');
  if ((invoice.writtenOffCents ?? 0) > 0) throw new Error('This invoice is already written off. Undo that write-off first if it needs to change.');
  const timing = paymentDateRefusalReason(invoice.invoiceDate, writeOffDate, `invoice ${invoice.invoiceNumber}`);
  if (timing) throw new Error(timing.replace(/payment/gi, 'write-off'));

  // The tax collected on the unpaid part, in proportion, from the invoice's own journal.
  let taxCents = 0;
  let gstHstPayableId: number | null = null;
  if (invoice.invoiceJournalEntryId !== null) {
    const journal = await journalGet(invoice.invoiceJournalEntryId);
    gstHstPayableId = await ensureGstHstAccountId(db, 'payable');
    const taxOnInvoice = journal.lines.filter((l) => l.accountId === gstHstPayableId).reduce((sum, l) => sum + l.creditCents - l.debitCents, 0);
    taxCents = Math.round((taxOnInvoice * balance) / invoice.totalCents);
  }
  const badDebtCents = balance - taxCents;
  const arId = await ensureAccountByName(db, ...AR_ACCOUNT_ARGS);
  const badDebtId = await ensureAccountByName(db, ...BAD_DEBT_ACCOUNT_ARGS);
  const label = memo?.trim() || `Bad debt written off — invoice ${invoice.invoiceNumber}`;
  const lines = tagLinesWithContact([
    { accountId: badDebtId, debitCents: badDebtCents, creditCents: 0, description: label },
    ...(taxCents > 0 && gstHstPayableId !== null ? [{ accountId: gstHstPayableId, debitCents: taxCents, creditCents: 0, description: 'GST/HST recovered on bad debt' }] : []),
    { accountId: arId, debitCents: 0, creditCents: balance, description: label },
  ], { customerId: invoice.customerId });

  const updated = await db.transaction().execute(async (trx) => {
    const entry = await journalCreate({ entryDate: writeOffDate, memo: label, reference: `INVOICE-${invoice.id}`, lines }, trx);
    const posted = await journalPost(entry.id, trx);
    return trx.updateTable('invoices').set({ writtenOffCents: balance, writeOffJournalEntryId: posted.id, status: 'paid' }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  });
  return mapInvoiceRow(updated, invoice.lines);
}

/** Puts a written-off invoice back on the books: the write-off journal is voided and the balance is owed again. */
/** Deletes a posted invoice that has payments on it, the way a bookkeeper removes a sale entered
 * twice: each payment is reversed (its journal voided) and then the invoice and its journal go.
 * A payment already banked in a deposit stops it; delete the deposit first. */
export async function invoicesDeleteWithPayments(id: number) {
  const db = getCurrentDb();
  const invoice = await invoicesGet(id);
  if ((invoice.writtenOffCents ?? 0) > 0) await invoicesUndoWriteOff(id);
  const payments = await db.selectFrom('invoicePayments').select(['id', 'depositId', 'paymentDate', 'amountCents']).where('invoiceId', '=', id).execute();
  const banked = payments.find((p) => p.depositId !== null);
  if (banked) throw new Error(`The payment of $${(banked.amountCents / 100).toFixed(2)} received on ${banked.paymentDate} is already in a bank deposit. Delete that deposit first, then delete the invoice.`);
  let reversed = 0;
  for (let i = 0; i < payments.length; i++) { await invoicesReverseLastPayment(id); reversed += 1; }
  await invoicesDelete(id);
  return { deleted: true as const, paymentsReversed: reversed };
}

export async function invoicesUndoWriteOff(id: number) {
  const db = getCurrentDb();
  const invoice = await invoicesGet(id);
  if (!(invoice.writtenOffCents ?? 0) || invoice.writeOffJournalEntryId == null) throw new Error('This invoice has no write-off to undo.');
  const updated = await db.transaction().execute(async (trx) => {
    await journalVoid(invoice.writeOffJournalEntryId!, false, trx, true);
    return trx.updateTable('invoices').set({ writtenOffCents: 0, writeOffJournalEntryId: null, status: invoice.paidCents >= invoice.totalCents ? 'paid' : 'unpaid' }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  });
  return mapInvoiceRow(updated, invoice.lines);
}

export async function invoicesReverseLastPayment(id: number) {
  const db = getCurrentDb();
  const invoice = await invoicesGet(id);
  const payment = await db.selectFrom('invoicePayments').selectAll().where('invoiceId', '=', id).orderBy('paymentDate', 'desc').orderBy('id', 'desc').executeTakeFirst();
  if (!payment) throw new Error('No reversible payment record exists for this invoice. Older imported/legacy paid invoices must be corrected with an adjusting entry.');
  if (payment.depositId !== null) throw new Error('This payment is already included in a bank deposit. Delete that deposit first, then reverse the payment.');
  const updated = await db.transaction().execute(async (trx) => {
    await journalVoid(payment.journalEntryId, false, trx, true);
    await trx.deleteFrom('invoicePayments').where('id', '=', payment.id).execute();
    const prior = await trx.selectFrom('invoicePayments').select(['journalEntryId', 'moneyAccountId']).where('invoiceId', '=', id).orderBy('paymentDate', 'desc').orderBy('id', 'desc').executeTakeFirst();
    const paidCents = Math.max(0, invoice.paidCents - payment.amountCents);
    return trx.updateTable('invoices').set({ paidCents, status: paidCents >= invoice.totalCents ? 'paid' : 'unpaid', paymentJournalEntryId: prior?.journalEntryId ?? null, paymentAccountId: prior?.moneyAccountId ?? null }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  });
  return mapInvoiceRow(updated, invoice.lines);
}

export async function depositsList() {
  const db = getCurrentDb();
  return getAllDeposits(db);
}

/** Everything still sitting in Undeposited Funds and not yet batched into a real bank deposit:
 * paid invoices (payment received via invoicesReceivePayment) and sales receipts that chose
 * Undeposited Funds as their deposit target — the same pool a real "Make Deposits" screen sweeps
 * together, since both represent money the business has already received in hand. */
export async function depositsGetUndeposited(): Promise<UndepositedItem[]> {
  const db = getCurrentDb();
  const [invoices, salesReceipts, invoicePayments] = await Promise.all([
    getAllInvoices(db),
    getAllSalesReceipts(db),
    db.selectFrom('invoicePayments').selectAll().execute(),
  ]);
  const undepositedFundsId = await ensureAccountByName(db, ...UNDEPOSITED_FUNDS_ACCOUNT_ARGS);
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const invoicesWithModernPayments = new Set(invoicePayments.map((p) => p.invoiceId));
  const settledByCredit = await invoicesSettledByCreditNote(db);

  // Legacy paid invoices (from before payment-history tables existed) still use the invoice header.
  const legacyInvoiceItems: UndepositedItem[] = invoices
    .filter((inv) => !invoicesWithModernPayments.has(inv.id) && isAwaitingDeposit({ ...inv, settledByCreditNote: settledByCredit.has(inv.id) }, undepositedFundsId))
    .map((inv) => ({ kind: 'invoice', id: inv.id, number: inv.invoiceNumber, date: inv.invoiceDate, customerId: inv.customerId, totalCents: inv.totalCents }));

  const paymentItems: UndepositedItem[] = invoicePayments
    .filter((p) => p.depositId === null && p.moneyAccountId === undepositedFundsId)
    .flatMap((p) => {
      const inv = invoiceById.get(p.invoiceId);
      return inv
        ? [{ kind: 'invoicePayment' as const, id: p.id, number: inv.invoiceNumber, date: p.paymentDate, customerId: inv.customerId, totalCents: receiptCashCents(p) }]
        : [];
    });

  const salesReceiptItems: UndepositedItem[] = salesReceipts
    .filter((sr) => sr.depositId === null && sr.depositToAccountId === undepositedFundsId)
    .map((sr) => ({ kind: 'salesReceipt', id: sr.id, number: sr.receiptNumber, date: sr.receiptDate, customerId: sr.customerId, totalCents: sr.totalCents }));

  return [...legacyInvoiceItems, ...paymentItems, ...salesReceiptItems];
}

/** The cash a receipt actually put into Undeposited Funds. For a Canadian-dollar invoice that is
 * the amount applied. A foreign receipt is applied to the invoice at the rate it was issued but
 * the cash arrived at the rate it converted, and the difference was posted as an exchange gain or
 * loss (see invoicesReceivePayment) — so what sits in Undeposited Funds, and what the bank will
 * show when it is deposited, is the applied amount plus that gain (or less that loss). Banking the
 * applied amount instead would leave the exchange difference stranded in Undeposited Funds. */
function receiptCashCents(payment: { amountCents: number; fxGainLossCents: number | null }): number {
  return payment.amountCents + (payment.fxGainLossCents ?? 0);
}

/** Invoices whose balance was cleared by applying a customer credit note. They are marked paid with
 * no payment account — indistinguishable, on the row itself, from a legacy cash payment — yet no
 * money arrived, so there is nothing in Undeposited Funds to bank for them. Offering one for deposit
 * posts Debit Bank / Credit Undeposited Funds for cash that does not exist. */
async function invoicesSettledByCreditNote(db: AppDb): Promise<Set<number>> {
  const rows = await db
    .selectFrom('creditNoteApplications')
    .innerJoin('creditNotes', 'creditNotes.id', 'creditNoteApplications.creditNoteId')
    .select('creditNoteApplications.targetId')
    .where('creditNotes.kind', '=', 'customer')
    .execute();
  return new Set(rows.map((row) => row.targetId));
}

/** Batches one or more undeposited invoice payments and/or sales receipts into a single bank
 * deposit (Debit the chosen bank account, Credit Undeposited Funds, for the combined total) —
 * matching QuickBooks Desktop's "Make Deposits" screen, and matching how the money actually lands
 * on the bank statement as one line even though it came from several customer payments. */
export async function depositsCreate(input: unknown) {
  const payload = makeDepositSchema.parse(input);
  const db = getCurrentDb();

  const undepositedFundsId = await ensureAccountByName(db, ...UNDEPOSITED_FUNDS_ACCOUNT_ARGS);

  const bankAccount = await db.selectFrom('accounts').select(['id', 'name', 'accountSubtype', 'isActive', 'currency']).where('id', '=', payload.bankAccountId).executeTakeFirst();
  const bankRefusal = moneyAccountRefusalReason(bankAccount && { ...bankAccount, isActive: Boolean(bankAccount.isActive) }, 'make this deposit');
  if (bankRefusal || !bankAccount) throw new Error(bankRefusal ?? 'Choose an account to make this deposit.');

  const settledByCredit = await invoicesSettledByCreditNote(db);
  const invoices = await Promise.all(payload.invoiceIds.map((id) => invoicesGet(id)));
  for (const invoice of invoices) {
    const refusal = depositRefusalReason({ ...invoice, settledByCreditNote: settledByCredit.has(invoice.id) }, undepositedFundsId, `Invoice ${invoice.invoiceNumber}`);
    if (refusal) throw new Error(refusal);
  }

  const invoicePayments = payload.invoicePaymentIds.length
    ? await db.selectFrom('invoicePayments').selectAll().where('id', 'in', payload.invoicePaymentIds).execute()
    : [];
  if (invoicePayments.length !== payload.invoicePaymentIds.length) throw new Error('One or more invoice payments no longer exist.');
  for (const payment of invoicePayments) {
    if (payment.depositId !== null || payment.moneyAccountId !== undepositedFundsId) {
      throw new Error('This invoice payment is not waiting in Undeposited Funds.');
    }
  }

  const salesReceipts = await Promise.all(payload.salesReceiptIds.map((id) => salesReceiptsGet(id)));
  for (const receipt of salesReceipts) {
    if (receipt.depositId !== null || receipt.depositToAccountId !== undepositedFundsId) {
      throw new Error(`Sales receipt ${receipt.receiptNumber} isn't an undeposited payment.`);
    }
  }

  // A legacy invoice carries no payment date of its own; its invoice date is the earliest the money
  // could have arrived, so it is the floor the deposit date is checked against.
  const dateRefusal = depositDateRefusalReason(payload.depositDate, [
    ...invoices.map((i) => i.invoiceDate),
    ...invoicePayments.map((p) => p.paymentDate),
    ...salesReceipts.map((r) => r.receiptDate),
  ]);
  if (dateRefusal) throw new Error(dateRefusal);

  const paymentInvoiceIds = [...new Set(invoicePayments.map((p) => p.invoiceId))];
  const paymentInvoices = paymentInvoiceIds.length
    ? await db.selectFrom('invoices').select(['id', 'invoiceNumber', 'foreignCurrency']).where('id', 'in', paymentInvoiceIds).execute()
    : [];
  const numberByInvoiceId = new Map(paymentInvoices.map((i) => [i.id, i.invoiceNumber]));
  const currencyByInvoiceId = new Map(paymentInvoices.map((i) => [i.id, i.foreignCurrency]));

  // Every item being banked, with the currency it was received in and the cash it put into
  // Undeposited Funds. A foreign-currency bank account may only take its own currency (see
  // currencyMatchRefusalReason), and then its line must carry the foreign total so the account's
  // foreign balance keeps pace with the bank's.
  const items = [
    ...invoices.map((i) => ({ label: `Invoice ${i.invoiceNumber}`, currency: i.foreignCurrency, cashCents: i.totalCents, foreignCents: i.foreignAmountCents })),
    ...invoicePayments.map((p) => ({ label: `Invoice ${numberByInvoiceId.get(p.invoiceId) ?? p.invoiceId} payment`, currency: currencyByInvoiceId.get(p.invoiceId) ?? null, cashCents: receiptCashCents(p), foreignCents: p.foreignAmountCents })),
    ...salesReceipts.map((r) => ({ label: `Sales receipt ${r.receiptNumber}`, currency: r.foreignCurrency, cashCents: r.totalCents, foreignCents: r.foreignAmountCents })),
  ];
  for (const item of items) {
    const currencyRefusal = currencyMatchRefusalReason(bankAccount, item.currency, item.label);
    if (currencyRefusal) throw new Error(currencyRefusal);
  }

  const totalCents = items.reduce((sum, item) => sum + item.cashCents, 0);
  const bankCurrency = bankAccount.currency ?? 'CAD';
  const foreignTotalCents = bankCurrency === 'CAD' ? null : items.reduce((sum, item) => sum + (item.foreignCents ?? 0), 0);
  const bankLineForeign =
    foreignTotalCents !== null && foreignTotalCents > 0
      ? { foreignCurrency: bankCurrency, foreignAmountCents: foreignTotalCents, exchangeRate: totalCents / foreignTotalCents }
      : {};
  const refs = [
    ...invoices.map((i) => i.invoiceNumber),
    ...invoicePayments.map((p) => `${numberByInvoiceId.get(p.invoiceId) ?? `Invoice ${p.invoiceId}`} payment`),
    ...salesReceipts.map((r) => r.receiptNumber),
  ];
  const memo = `Deposit — ${refs.length} payment${refs.length === 1 ? '' : 's'} (${refs.join(', ')})`;

  const inserted = await db.transaction().execute(async (trx) => {
    const entry = await journalCreate(
      {
        entryDate: payload.depositDate,
        memo,
        reference: null,
        lines: [
          { accountId: payload.bankAccountId, debitCents: totalCents, creditCents: 0, description: memo, ...bankLineForeign },
          { accountId: undepositedFundsId, debitCents: 0, creditCents: totalCents, description: memo },
        ],
      },
      trx,
    );
    const posted = await journalPost(entry.id, trx);

    const depositRow = await trx
      .insertInto('deposits')
      .values({ depositDate: payload.depositDate, bankAccountId: payload.bankAccountId, journalEntryId: posted.id })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (payload.invoiceIds.length > 0) {
      await trx.updateTable('invoices').set({ depositId: depositRow.id }).where('id', 'in', payload.invoiceIds).execute();
    }
    if (payload.invoicePaymentIds.length > 0) {
      await trx.updateTable('invoicePayments').set({ depositId: depositRow.id }).where('id', 'in', payload.invoicePaymentIds).execute();
    }
    if (payload.salesReceiptIds.length > 0) {
      await trx.updateTable('salesReceipts').set({ depositId: depositRow.id }).where('id', 'in', payload.salesReceiptIds).execute();
    }

    return depositRow;
  });

  return mapDepositRow(inserted);
}

/** Voids the deposit's GL entry and frees its invoices/sales receipts back to Undeposited Funds —
 * same undo pattern as deleting an unpaid bill. */
export async function depositsDelete(id: number) {
  const db = getCurrentDb();
  const row = await db.selectFrom('deposits').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  await db.transaction().execute(async (trx) => {
    if (row.journalEntryId) await journalVoid(row.journalEntryId, false, trx, true);
    await trx.updateTable('invoices').set({ depositId: null }).where('depositId', '=', id).execute();
    await trx.updateTable('invoicePayments').set({ depositId: null }).where('depositId', '=', id).execute();
    await trx.updateTable('salesReceipts').set({ depositId: null }).where('depositId', '=', id).execute();
    await trx.deleteFrom('deposits').where('id', '=', id).execute();
  });
  return { deleted: true } as const;
}

/** Voids the invoice's original GL entry (rather than leaving a posted, orphaned journal entry
 * behind) and removes the invoice's own tracking row; its lines cascade-delete via FK. */
export async function invoicesDelete(id: number) {
  const db = getCurrentDb();
  const invoice = await invoicesGet(id);
  if ((invoice.writtenOffCents ?? 0) > 0) throw new Error('This invoice was written off to bad debt. Undo the write-off first.');
  if (invoice.paidCents > 0) throw new Error('An invoice with payments cannot be deleted. Void/reverse its payments first.');
  const stockMovement = await db.selectFrom('inventoryMovements').select('id').where('sourceDocumentType', '=', 'invoice').where('sourceDocumentId', '=', id).executeTakeFirst();
  if (stockMovement) {
    throw new Error('This invoice posted inventory and COGS. Use a credit note/stock reversal instead of deleting it so the inventory audit trail stays intact.');
  }
  await db.transaction().execute(async (trx) => {
    if (invoice.invoiceJournalEntryId) await journalVoid(invoice.invoiceJournalEntryId, false, trx, true);
    await trx.updateTable('estimates').set({ status: 'accepted', convertedInvoiceId: null, convertedAt: null }).where('convertedInvoiceId', '=', id).execute();
    await trx.deleteFrom('invoices').where('id', '=', id).execute();
  });
  return { deleted: true } as const;
}


/** Deposits with the figure each one actually banked.
 *
 * The deposit row itself carries no total — the amount lives on its journal entry, where the bank
 * account is debited for the combined sum. Read from there rather than stored twice, so the list
 * and the ledger cannot drift apart.
 */
export async function depositsListDetailed() {
  const db = getCurrentDb();
  const deposits = await getAllDeposits(db);
  if (deposits.length === 0) return [];

  const entryIds = deposits.map((d) => d.journalEntryId).filter((id): id is number => id !== null);
  const lines = entryIds.length
    ? await db
        .selectFrom('journalEntryLines')
        .select(['journalEntryId', 'accountId', 'debitCents'])
        .where('journalEntryId', 'in', entryIds)
        .execute()
    : [];

  const [invoices, salesReceipts, invoicePayments] = await Promise.all([getAllInvoices(db), getAllSalesReceipts(db), db.selectFrom('invoicePayments').selectAll().execute()]);

  return deposits.map((deposit) => {
    // The bank side of the entry is the deposit's own account, so its debit is the banked figure.
    const bankedCents = lines
      .filter((l) => l.journalEntryId === deposit.journalEntryId && l.accountId === deposit.bankAccountId)
      .reduce((sum, l) => sum + (l.debitCents ?? 0), 0);

    const itemCount =
      invoices.filter((i) => i.depositId === deposit.id).length + invoicePayments.filter((p) => p.depositId === deposit.id).length + salesReceipts.filter((r) => r.depositId === deposit.id).length;

    return { ...deposit, totalCents: bankedCents, itemCount };
  });
}


/** What a late-interest charge would bill this customer today — the confirmation before posting. */
export async function invoicesLateInterestPreview(input: unknown) {
  const { customerId, asOf } = input as { customerId: number; asOf?: string };
  const db = getCurrentDb();
  const customer = await db.selectFrom('customers').selectAll().where('id', '=', customerId).executeTakeFirst();
  if (!customer) throw new Error('Customer not found.');
  const rate = (customer as { lateInterestRatePercent?: number | null }).lateInterestRatePercent ?? null;
  if (!rate || rate <= 0) throw new Error(`${customer.name} has no late-payment interest rate. Set one on the customer record first (Edit customer → Late-payment interest).`);
  const date = asOf ?? localIsoDate();
  const open = (await getAllInvoices(db)).filter((inv) => inv.customerId === customerId && inv.balanceDueCents > 0 && !/^Late-payment interest/i.test(inv.memo ?? ''));
  const lines = open
    .map((inv) => ({ invoice: inv, charge: computeLateInterest({ balanceDueCents: inv.balanceDueCents, dueDate: inv.dueDate, chargedThrough: inv.lateInterestChargedThrough ?? null, asOf: date, annualRatePercent: rate }) }))
    .filter((row): row is { invoice: (typeof open)[number]; charge: NonNullable<ReturnType<typeof computeLateInterest>> } => row.charge !== null)
    .map(({ invoice, charge }) => ({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, balanceDueCents: invoice.balanceDueCents, fromDate: charge.fromDate, toDate: charge.toDate, days: charge.days, interestCents: charge.interestCents }));
  return { customerId, customerName: customer.name, ratePercent: rate, asOf: date, lines, totalCents: lines.reduce((s, l) => s + l.interestCents, 0) };
}

/** Bills the interest as one new invoice to the customer (Interest Income, no HST), and marks
 * each overdue invoice with the date charged to so the same days are never billed twice. */
export async function invoicesChargeLateInterest(input: unknown) {
  const preview = await invoicesLateInterestPreview(input);
  if (preview.lines.length === 0) throw new Error('Nothing to charge: no overdue balance beyond the last interest date.');
  const db = getCurrentDb();
  const interestAccountId = await ensureAccountByName(db, 'Interest Income', 'Revenue', '4900', '8090', 'Revenue');
  const invoiceNumber = await invoicesNextNumber({ invoiceDate: preview.asOf });
  const invoice = await invoicesCreate({
    customerId: preview.customerId,
    invoiceNumber,
    invoiceDate: preview.asOf,
    dueDate: preview.asOf,
    memo: `Late-payment interest at ${preview.ratePercent}% per year to ${preview.asOf}`,
    paymentTerms: 'dueOnReceipt',
    lines: preview.lines.map((l) => ({ description: `Interest on ${l.invoiceNumber}: ${formatMoney(l.balanceDueCents)} × ${preview.ratePercent}% × ${l.days} day${l.days === 1 ? '' : 's'} (${l.fromDate} to ${l.toDate})`, quantity: 1, unitPriceCents: l.interestCents, revenueAccountId: interestAccountId, productId: null, taxCode: 'NonHST', tagIds: [] })),
  });
  for (const l of preview.lines) {
    await db.updateTable('invoices').set({ lateInterestChargedThrough: l.toDate }).where('id', '=', l.invoiceId).execute();
  }
  return invoice;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
