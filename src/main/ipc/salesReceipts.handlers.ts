import { currencyMatchRefusalReason, moneyAccountRefusalReason } from '@shared/domain/banking/bankAccountRules';
import { assertSaleLineAccounts } from './saleLineAccounts';
import { inactiveContactRefusalReason } from '@shared/domain/contacts/contactRules';
import { nextDocumentNumber, resolveNewDocumentNumber } from '@shared/domain/documents/documentNumbering';
import { newSalesReceiptSchema } from '@shared/validation/schemas';
import { buildSalesReceiptJournalLines, computeInvoiceLineAmountCents } from '@shared/domain/ledger/buildInvoiceJournalLines';
import type { SalesReceiptLine } from '@shared/domain/types';
import { getCurrentDb } from '../companyFile';
import { getAllSalesReceipts, getSalesReceiptById } from '../db/queries';
import { mapSalesReceiptLineRow, mapSalesReceiptRow } from '../db/mappers';
import { ensureAccountByName } from '../db/ensureAccount';
import { ensureGstHstAccountId, ensureProvincialTaxAccountId } from '../db/buildTaxSplitLines';
import { journalCreate, journalPost, journalVoid } from './journal.handlers';
import { UNDEPOSITED_FUNDS_ACCOUNT_ARGS } from './invoices.handlers';
import { buildInventoryJournalLines, inventoryPostingMemo } from '@shared/domain/inventory/buildInventoryJournalLines';
import { valueProduct, type InventoryMovement } from '@shared/domain/inventory/inventoryValuation';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { tagDocumentLines } from '@shared/domain/ledger/tagDocumentLines';

export async function salesReceiptsList() {
  const db = getCurrentDb();
  return getAllSalesReceipts(db);
}

export async function salesReceiptsGet(id: number) {
  const db = getCurrentDb();
  const receipt = await getSalesReceiptById(db, id);
  if (!receipt) throw new Error(`Sales receipt ${id} not found.`);
  return receipt;
}

/** Scans existing receipt numbers for the highest "SR-<n>" suffix and returns the next one,
 * seeding at SR-1001 for a brand-new company — same convenience pattern as invoicesNextNumber. */
export async function salesReceiptsNextNumber(input?: unknown): Promise<string> {
  const { receiptDate } = (input ?? {}) as { receiptDate?: string };
  const db = getCurrentDb();
  const rows = await db.selectFrom('salesReceipts').select('receiptNumber').execute();
  return nextDocumentNumber(
    'SR',
    rows.map((r) => r.receiptNumber),
    receiptDate ?? localIsoDate(),
  );
}

/** The Undeposited Funds account id, auto-created if this is the first sales receipt or invoice
 * payment this company has ever recorded. Fetched by the editor so its "Deposit To" picker can
 * offer Undeposited Funds as a real, selectable option alongside actual bank accounts. */
export async function salesReceiptsUndepositedFundsAccountId(): Promise<number> {
  const db = getCurrentDb();
  return ensureAccountByName(db, ...UNDEPOSITED_FUNDS_ACCOUNT_ARGS);
}

/** Recording a sales receipt posts it to the ledger immediately and in full — a sales receipt has
 * no unpaid state and never touches Accounts Receivable, unlike an Invoice. It Debits whichever
 * account was chosen as the deposit target (a real bank account, or Undeposited Funds pending a
 * later Make Deposit) and Credits each line's revenue account. */
export async function salesReceiptsCreate(input: unknown) {
  const payload = newSalesReceiptSchema.parse(input);
  const db = getCurrentDb();

  const customer = await db.selectFrom('customers').select(['name', 'isActive']).where('id', '=', payload.customerId).executeTakeFirst();
  const customerRefusal = inactiveContactRefusalReason('customer', customer && { name: customer.name, isActive: Boolean(customer.isActive) }, 'sales receipt');
  if (customerRefusal) throw new Error(customerRefusal);
  await assertSaleLineAccounts(db, payload.lines.map((line) => line.revenueAccountId), 'sales receipt');

  const undepositedFundsId = await ensureAccountByName(db, ...UNDEPOSITED_FUNDS_ACCOUNT_ARGS);
  const depositTo = await db.selectFrom('accounts').select(['id', 'name', 'accountSubtype', 'isActive', 'currency']).where('id', '=', payload.depositToAccountId).executeTakeFirst();
  const depositRefusal = moneyAccountRefusalReason(depositTo && { ...depositTo, isActive: Boolean(depositTo.isActive) }, 'record this sales receipt', { undepositedFundsAccountId: undepositedFundsId });
  if (depositRefusal) throw new Error(depositRefusal);
  const currencyRefusal = depositTo ? currencyMatchRefusalReason(depositTo, payload.foreignCurrency, 'this sales receipt') : null;
  if (currencyRefusal) throw new Error(currencyRefusal);

  const gstHstPayableId = await ensureGstHstAccountId(db, 'payable');
  // Provincial payable accounts for any BC/SK/MB/QC codes on the lines, created on first use.
  const provincialPayableIds: Record<string, number> = {};
  for (const code of new Set(payload.lines.map((line) => line.taxCode).filter((c): c is NonNullable<typeof c> => Boolean(c)))) {
    const id = await ensureProvincialTaxAccountId(db, code, 'payable');
    if (id !== null) provincialPayableIds[code] = id;
  }

  const lineAmounts = payload.lines.map((line) => computeInvoiceLineAmountCents(line));
  const journalLines = buildSalesReceiptJournalLines(payload.depositToAccountId, gstHstPayableId, payload.lines, lineAmounts, provincialPayableIds);
  const totalCents = journalLines[0].debitCents;
  const takenNumbers = (await db.selectFrom('salesReceipts').select('receiptNumber').execute()).map((row) => row.receiptNumber);
  const receiptNumber = resolveNewDocumentNumber('SR', payload.receiptNumber, takenNumbers, payload.receiptDate, 'Sales receipt number');

  return db.transaction().execute(async (trx) => {
    // Posted inside the transaction so the GL entry rolls back with the receipt if anything below
    // fails — same reasoning as invoicesCreate.
    const entry = await journalCreate(
      {
        entryDate: payload.receiptDate,
        memo: payload.memo ?? `Sales receipt ${receiptNumber}`,
        reference: receiptNumber,
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

    const insertedReceipt = await trx
      .insertInto('salesReceipts')
      .values({
        customerId: payload.customerId,
        receiptNumber,
        receiptDate: payload.receiptDate,
        memo: payload.memo,
        totalCents,
        depositToAccountId: payload.depositToAccountId,
        journalEntryId: posted.id,
        depositId: null,
        foreignCurrency: payload.foreignCurrency,
        foreignAmountCents: payload.foreignAmountCents,
        exchangeRate: payload.exchangeRate,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const lines: SalesReceiptLine[] = [];
    for (const [i, line] of payload.lines.entries()) {
      const insertedLine = await trx
        .insertInto('salesReceiptLines')
        .values({
          salesReceiptId: insertedReceipt.id,
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
      lines.push(mapSalesReceiptLineRow(insertedLine));
    }

    // A sales receipt is the POS/cash-sale path. Tracked items leave inventory and post COGS in
    // the same transaction as the receipt, exactly like an invoice sale.
    for (const line of lines) {
      if (line.productId === null || line.quantity <= 0) continue;
      const product = await trx.selectFrom('products').selectAll().where('id', '=', line.productId).executeTakeFirst();
      if (!product) throw new Error(`Product on sales receipt line "${line.description}" no longer exists.`);
      if (!product.trackQuantity) continue;
      if (product.assetAccountId === null || product.cogsAccountId === null) throw new Error(`Set Inventory Asset and Cost of Goods Sold accounts on ${product.name} before selling it.`);
      const priorRows = await trx.selectFrom('inventoryMovements').selectAll().where('productId', '=', product.id).execute();
      const prior: InventoryMovement[] = priorRows.map((row) => ({ id: row.id, productId: row.productId, movementDate: row.movementDate, quantityDelta: row.quantityDelta, unitCostCents: row.unitCostCents, kind: row.kind as InventoryMovement['kind'], journalEntryId: row.journalEntryId, note: row.note }));
      const before = valueProduct(product.id, prior);
      if (line.quantity > before.quantityOnHand + 1e-9) throw new Error(`Not enough stock for ${product.name}. On hand: ${before.quantityOnHand}; sale quantity: ${line.quantity}. Receive or adjust stock first.`);
      const posting = buildInventoryJournalLines({ productId: product.id, productName: product.name, kind: 'sale', movementDate: payload.receiptDate, quantityDelta: -Math.abs(line.quantity), unitCostCents: null, assetAccountId: product.assetAccountId, cogsAccountId: product.cogsAccountId, counterAccountId: null, priorMovements: prior });
      let stockJournalEntryId: number | null = null;
      if (posting.lines.length > 0) {
        const stockEntry = await journalCreate({ entryDate: payload.receiptDate, memo: inventoryPostingMemo({ kind: 'sale', productName: product.name }), reference: receiptNumber, lines: posting.lines }, trx);
        stockJournalEntryId = (await journalPost(stockEntry.id, trx)).id;
      }
      await trx.insertInto('inventoryMovements').values({ productId: product.id, movementDate: payload.receiptDate, quantityDelta: -Math.abs(line.quantity), unitCostCents: null, kind: 'sale', journalEntryId: stockJournalEntryId, note: `${receiptNumber} — ${line.description}`, sourceDocumentType: 'salesReceipt', sourceDocumentId: insertedReceipt.id, sourceLineId: line.id }).execute();
    }

    return mapSalesReceiptRow(insertedReceipt, lines);
  });
}

/** Voids the receipt's GL entry and removes its tracking row; lines cascade-delete via FK. Blocked
 * once it's been swept into a bank deposit — void the Deposit first, same rule as Invoices. */
export async function salesReceiptsDelete(id: number) {
  const db = getCurrentDb();
  const receipt = await salesReceiptsGet(id);
  if (receipt.depositId !== null) throw new Error('This sales receipt has been deposited — delete the deposit first.');
  await db.transaction().execute(async (trx) => {
    const stockRows = await trx.selectFrom('inventoryMovements').select(['id', 'journalEntryId']).where('sourceDocumentType', '=', 'salesReceipt').where('sourceDocumentId', '=', id).execute();
    for (const stock of stockRows) if (stock.journalEntryId) await journalVoid(stock.journalEntryId, false, trx, true);
    await trx.deleteFrom('inventoryMovements').where('sourceDocumentType', '=', 'salesReceipt').where('sourceDocumentId', '=', id).execute();
    if (receipt.journalEntryId) await journalVoid(receipt.journalEntryId, false, trx, true);
    await trx.deleteFrom('salesReceipts').where('id', '=', id).execute();
  });
  return { deleted: true } as const;
}
