import { depositRefusalReason, isAwaitingDeposit } from '@shared/domain/sales/undepositedFunds';
import { currencyMatchRefusalReason, moneyAccountRefusalReason } from '@shared/domain/banking/bankAccountRules';
import { depositDateRefusalReason, paymentDateRefusalReason } from '@shared/domain/documents/paymentTiming';
import { inactiveContactRefusalReason } from '@shared/domain/contacts/contactRules';
import { nextDocumentNumber, resolveNewDocumentNumber } from '@shared/domain/documents/documentNumbering';
import { assertSaleLineAccounts } from './saleLineAccounts';
import { makeDepositSchema, newInvoiceSchema, receiveInvoicePaymentSchema } from '@shared/validation/schemas';
import { buildInvoiceJournalLines, computeInvoiceLineAmountCents } from '@shared/domain/ledger/buildInvoiceJournalLines';
import type { InvoiceLine, UndepositedItem } from '@shared/domain/types';
import { getCurrentDb } from '../companyFile';
import { getAllDeposits, getAllInvoices, getAllSalesReceipts, getInvoiceById } from '../db/queries';
import { mapDepositRow, mapInvoiceLineRow, mapInvoiceRow } from '../db/mappers';
import { ensureAccountByName } from '../db/ensureAccount';
import { ensureGstHstAccountId, ensureProvincialTaxAccountId } from '../db/buildTaxSplitLines';
import { journalCreate, journalPost, journalVoid } from './journal.handlers';
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
import { tagDocumentLines } from '@shared/domain/ledger/tagDocumentLines';

const CUSTOMER_DISCOUNT_ACCOUNT_ARGS = ['Customer Discounts', 'Expense', '5900', '9270', 'Other Expense'] as const;
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
  const journalLines = buildInvoiceJournalLines(
    accountsReceivableId,
    gstHstPayableId,
    payload.lines,
    lineAmounts,
    discountAccountId === null ? undefined : { accountId: discountAccountId, amountCents: payload.discountCents, customerId: payload.customerId },
  
    provincialPayableIds,
  );
  // AR debit (the journal's first line) is the true invoice total: base + tax across every line.
  const totalCents = journalLines[0].debitCents;

  const create = async (trx: AppDb) => {
    const existingNumbers = await trx.selectFrom('invoices').select('invoiceNumber').execute();
    const invoiceNumber = resolveNewDocumentNumber('INV', payload.invoiceNumber, existingNumbers.map((row) => row.invoiceNumber), payload.invoiceDate, 'Invoice number');
    // Posted inside the transaction so a failure inserting the invoice or its lines rolls the GL
    // entry back with it, instead of stranding a posted entry with no invoice.
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
    // Class / location: each document line's tags land on the journal line that carries it.
    {
      const tagPairs = tagDocumentLines(posted.lines.map((l) => ({ id: l.id, accountId: l.accountId, debitCents: l.debitCents, creditCents: l.creditCents })), payload.lines.map((line, i) => ({ accountId: line.revenueAccountId, baseCents: lineAmounts[i], tagIds: line.tagIds ?? [] })));
      if (tagPairs.length > 0) await trx.insertInto('journalEntryLineTags').values(tagPairs).execute();
    }

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

    const lines: InvoiceLine[] = [];
    for (const [i, line] of payload.lines.entries()) {
      const insertedLine = await trx
        .insertInto('invoiceLines')
        .values({
          invoiceId: insertedInvoice.id,
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

    // Revenue/A/R and stock/COGS are one accounting event. Every tracked product line is validated
    // and posted inside this same transaction, so a stock setup or quantity error rolls back the
    // invoice too instead of leaving the subledger and GL out of sync.
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
        sourceDocumentId: insertedInvoice.id,
        sourceLineId: line.id,
      }).execute();
    }

    return mapInvoiceRow(insertedInvoice, lines);
  };
  return executor ? create(db) : db.transaction().execute(create);
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
        lines,
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
