import { tagLinesWithContact } from '@shared/domain/ledger/tagLinesWithContact';
import { getCurrentDb } from '../companyFile';
import type { AppDb } from '../db/schema';
import { nextDocumentNumber, resolveNewDocumentNumber } from '@shared/domain/documents/documentNumbering';
import {
  canTransitionPurchaseOrder,
  lineAmountCents,
  purchaseOrderConversionBlock,
  type PurchaseOrderStatus,
} from '@shared/domain/sales/commitmentDocuments';
import { billsCreate } from './bills.handlers';
import { mapBillRow } from '../db/mappers';
import { ensureGstHstAccountId } from '../db/buildTaxSplitLines';
import { computeTaxSplit } from '@shared/domain/ledger/computeTaxSplit';
import { ensureAccountByName } from '../db/ensureAccount';
import { ACCOUNTS_PAYABLE_ARGS } from '../db/controlAccounts';
import { inactiveContactRefusalReason } from '@shared/domain/contacts/contactRules';
import { dateOrderRefusalReason } from '@shared/domain/documents/paymentTiming';
import { journalCreate, journalPost, journalVoid } from './journal.handlers';
import { dueDateFor, type PaymentTerm } from '@shared/domain/contacts/paymentTerms';
import { suggestTaxCents } from '@shared/domain/ledger/computeTaxSplit';
import type { TaxCode } from '@shared/domain/types';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { approvalBlockReason, canApprove, canTransitionApproval, initialApprovalStatus, type ApprovalStatus } from '@shared/domain/workflow/approvals';
import { getAccessIdentity, getAccessRole } from '../accessSession';

/** Purchase orders — what has been committed to a vendor, before anything is owed.
 *
 * The mirror of an estimate. Ordering goods creates an obligation in the commercial sense but not
 * an accounting one: nothing has been delivered and no invoice has arrived, so nothing belongs in
 * accounts payable. Recording it there would overstate what the business owes and would double up
 * the moment the vendor's invoice actually turns up.
 */

export interface PurchaseOrderLineInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
  categoryAccountId: number;
  taxCode: string | null;
  manualHstCents: number | null;
  productId: number | null;
}

function purchaseOrderTotalCents(lines: PurchaseOrderLineInput[]): number {
  return lines.reduce((sum, line) => {
    const base = lineAmountCents(line);
    const code = (line.taxCode as TaxCode | null) ?? null;
    const tax = code === 'Manual' ? Math.max(0, line.manualHstCents ?? 0) : suggestTaxCents(code, base);
    return sum + base + tax;
  }, 0);
}

export interface PurchaseOrderInput {
  vendorId: number;
  poNumber: string;
  orderDate: string;
  expectedDate: string | null;
  memo: string | null;
  lines: PurchaseOrderLineInput[];
}

export async function purchaseOrdersNextNumber(input?: unknown): Promise<string> {
  const { orderDate } = (input ?? {}) as { orderDate?: string };
  const db = getCurrentDb();
  const rows = await db.selectFrom('purchaseOrders').select('poNumber').execute();
  return nextDocumentNumber(
    'PO',
    rows.map((r) => r.poNumber),
    orderDate ?? localIsoDate(),
  );
}

export async function purchaseOrdersList() {
  const db = getCurrentDb();
  const rows = await db.selectFrom('purchaseOrders').selectAll().orderBy('orderDate', 'desc').orderBy('id', 'desc').execute();
  return rows.map((r) => ({ ...r, status: r.status as PurchaseOrderStatus }));
}

export async function purchaseOrdersGet(id: number) {
  const db = getCurrentDb();
  const po = await db.selectFrom('purchaseOrders').selectAll().where('id', '=', id).executeTakeFirst();
  if (!po) throw new Error(`Purchase order ${id} not found.`);
  const lines = await db
    .selectFrom('purchaseOrderLines')
    .selectAll()
    .where('purchaseOrderId', '=', id)
    .orderBy('lineOrder')
    .execute();
  return { ...po, status: po.status as PurchaseOrderStatus, lines };
}

function validate(payload: PurchaseOrderInput): void {
  if (!payload.vendorId) throw new Error('A purchase order needs a vendor.');
  if (!payload.poNumber?.trim()) throw new Error('A purchase order needs a number.');
  if (!payload.lines?.length) throw new Error('A purchase order needs at least one line.');
  for (const line of payload.lines) {
    if (!line.description?.trim()) throw new Error('Every line needs a description.');
    if (!line.categoryAccountId) throw new Error(`"${line.description}" needs a category account.`);
  }
  if (payload.expectedDate && payload.expectedDate < payload.orderDate) {
    throw new Error('The expected date cannot be before the order date.');
  }
}

async function writeLines(trx: AppDb, purchaseOrderId: number, lines: PurchaseOrderLineInput[]): Promise<void> {
  for (const [i, line] of lines.entries()) {
    await trx
      .insertInto('purchaseOrderLines')
      .values({
        purchaseOrderId,
        lineOrder: i,
        description: line.description.trim(),
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        amountCents: lineAmountCents(line),
        categoryAccountId: line.categoryAccountId,
        taxCode: line.taxCode,
        manualHstCents: line.manualHstCents,
        productId: line.productId,
      })
      .execute();
  }
}

async function assertVendorActive(db: AppDb, vendorId: number, documentWord: string): Promise<void> {
  const vendor = await db.selectFrom('vendors').select(['name', 'isActive']).where('id', '=', vendorId).executeTakeFirst();
  const refusal = inactiveContactRefusalReason('vendor', vendor && { name: vendor.name, isActive: Boolean(vendor.isActive) }, documentWord);
  if (refusal) throw new Error(refusal);
}

export async function purchaseOrdersCreate(input: unknown) {
  const payload = input as PurchaseOrderInput;
  validate(payload);

  const db = getCurrentDb();
  await assertVendorActive(db, payload.vendorId, 'purchase order');
  const totalCents = purchaseOrderTotalCents(payload.lines);
  const poThreshold = (await getCurrentDb().selectFrom('companyInfo').select('approvalPoThresholdCents').where('id', '=', 1).executeTakeFirst())?.approvalPoThresholdCents ?? null;

  return db.transaction().execute(async (trx) => {
    const taken = (await trx.selectFrom('purchaseOrders').select('poNumber').execute()).map((row) => row.poNumber);
    const po = await trx
      .insertInto('purchaseOrders')
      .values({
        vendorId: payload.vendorId,
        poNumber: resolveNewDocumentNumber('PO', payload.poNumber, taken, payload.orderDate, 'Purchase order number'),
        orderDate: payload.orderDate,
        expectedDate: payload.expectedDate,
        memo: payload.memo,
        totalCents,
        approvalStatus: initialApprovalStatus(totalCents, poThreshold),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await writeLines(trx, po.id, payload.lines);
    return { ...po, status: po.status as PurchaseOrderStatus };
  });
}

export async function purchaseOrdersUpdate(input: unknown) {
  const { id, patch } = input as { id: number; patch: PurchaseOrderInput };
  const existing = await purchaseOrdersGet(id);

  if (existing.convertedBillId !== null) {
    throw new Error('This purchase order has been billed and can no longer be changed.');
  }
  if (existing.lines.some((line) => line.receivedQuantity > 0)) {
    throw new Error('This purchase order has received inventory and can no longer be edited. Reverse the receipt first if it was entered in error.');
  }

  validate(patch);
  const db = getCurrentDb();
  await assertVendorActive(db, patch.vendorId, 'purchase order');
  const totalCents = purchaseOrderTotalCents(patch.lines);
  const poThreshold = (await getCurrentDb().selectFrom('companyInfo').select('approvalPoThresholdCents').where('id', '=', 1).executeTakeFirst())?.approvalPoThresholdCents ?? null;

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('purchaseOrders')
      .set({
        vendorId: patch.vendorId,
        poNumber: patch.poNumber.trim(),
        orderDate: patch.orderDate,
        expectedDate: patch.expectedDate,
        memo: patch.memo,
        totalCents,
        approvalStatus: initialApprovalStatus(totalCents, poThreshold),
      })
      .where('id', '=', id)
      .execute();

    await trx.deleteFrom('purchaseOrderLines').where('purchaseOrderId', '=', id).execute();
    await writeLines(trx, id, patch.lines);
  });

  return purchaseOrdersGet(id);
}

export async function purchaseOrdersSetStatus(input: unknown) {
  const { id, status } = input as { id: number; status: PurchaseOrderStatus };
  const existing = await purchaseOrdersGet(id);

  if (!canTransitionPurchaseOrder(existing.status, status)) {
    throw new Error(`A purchase order that is ${existing.status} cannot be marked ${status}.`);
  }
  if (status === 'sent') {
    const block = approvalBlockReason(((existing as { approvalStatus?: string }).approvalStatus ?? 'notRequired') as ApprovalStatus, 'purchase order');
    if (block) throw new Error(block);
  }
  if (status === 'cancelled' && existing.lines.some((line) => line.receivedQuantity > 0)) {
    throw new Error('A purchase order with received inventory cannot be cancelled. Reverse the goods receipt first.');
  }

  const db = getCurrentDb();
  await db.updateTable('purchaseOrders').set({ status }).where('id', '=', id).execute();
  return purchaseOrdersGet(id);
}

/** Receive all inventory products on a purchase order before the vendor invoice arrives.
 * Posts Dr Inventory Asset / Cr Goods Received Not Invoiced (GRNI), and records the stock movement
 * in the same database transaction. Service/expense-only PO lines are not stock and are ignored.
 */
export async function purchaseOrdersReceive(input: unknown) {
  const payload = input as { id: number; receivedDate?: string; lines?: Array<{ lineId: number; quantity: number }> };
  const po = await purchaseOrdersGet(payload.id);
  if (po.convertedBillId !== null || po.status === 'converted' || po.matchedBillId !== null) throw new Error('A billed purchase order cannot be received again.');
  if (po.status === 'cancelled') throw new Error('A cancelled purchase order cannot be received. Reopen it first.');

  const stockLines = po.lines.filter((line) => line.productId !== null && line.quantity > 0);
  if (stockLines.length === 0) throw new Error('This purchase order has no inventory products to receive.');
  const requested = new Map((payload.lines ?? []).map((x) => [x.lineId, x.quantity]));
  const db = getCurrentDb();
  const date = payload.receivedDate ?? localIsoDate();
  const receiptTiming = dateOrderRefusalReason(`purchase order ${po.poNumber}`, po.orderDate, 'goods receipt', date);
  if (receiptTiming) throw new Error(receiptTiming);
  const grniId = await ensureAccountByName(db, 'Goods Received Not Invoiced', 'Liability', 'GRNI-DEFAULT', '2620', 'Current Liability');

  const prepared: Array<{ line: (typeof stockLines)[number]; product: any; quantity: number; receiptCostCents: number }> = [];
  for (const line of stockLines) {
    const remaining = Math.max(0, line.quantity - line.receivedQuantity);
    const quantity = payload.lines ? (requested.get(line.id) ?? 0) : remaining;
    if (quantity <= 0) continue;
    if (quantity > remaining + 1e-9) throw new Error(`Cannot receive more than ${remaining} remaining on line "${line.description}".`);
    const product = await db.selectFrom('products').selectAll().where('id', '=', line.productId!).executeTakeFirst();
    if (!product || !product.isActive) throw new Error(`Product on line "${line.description}" is missing or inactive.`);
    if (!product.trackQuantity) throw new Error(`Product "${product.name}" is not set to track quantity.`);
    if (product.assetAccountId === null) throw new Error(`Set an Inventory Asset account on ${product.name} before receiving it.`);
    const baseCents = Math.round(quantity * line.unitPriceCents);
    const fullLineBase = Math.round(line.quantity * line.unitPriceCents);
    const fullTax = (line.taxCode as TaxCode | null) === 'Manual'
      ? Math.max(0, line.manualHstCents ?? 0)
      : suggestTaxCents((line.taxCode as TaxCode | null) ?? null, fullLineBase);
    const proportionalTax = fullLineBase > 0 ? Math.round(fullTax * (baseCents / fullLineBase)) : 0;
    const split = computeTaxSplit((line.taxCode as TaxCode | null) ?? null, proportionalTax);
    // Non-recoverable sales tax is part of inventory cost. Recoverable GST/HST is not recognized
    // until the vendor invoice arrives and provides the ITC support.
    const receiptCostCents = baseCents + split.nonClaimableTaxCents;
    prepared.push({ line, product, quantity, receiptCostCents });
  }
  if (prepared.length === 0) throw new Error('There is no remaining inventory quantity to receive.');

  await db.transaction().execute(async (trx) => {
    const journalLines: Array<{ accountId: number; debitCents: number; creditCents: number; description: string }> = [];
    for (const item of prepared) {
      if (item.receiptCostCents > 0) {
        journalLines.push({ accountId: item.product.assetAccountId, debitCents: item.receiptCostCents, creditCents: 0, description: `${item.product.name} — ${item.quantity} received on PO ${po.poNumber}` });
        journalLines.push({ accountId: grniId, debitCents: 0, creditCents: item.receiptCostCents, description: `${item.product.name} — received, vendor invoice pending` });
      }
    }

    let journalEntryId: number | null = null;
    if (journalLines.length > 0) {
      const entry = await journalCreate({ entryDate: date, memo: `Goods received — PO ${po.poNumber}`, reference: po.poNumber, lines: journalLines }, trx);
      journalEntryId = (await journalPost(entry.id, trx)).id;
    }
    const receipt = await trx.insertInto('purchaseOrderReceipts').values({ purchaseOrderId: po.id, receiptDate: date, journalEntryId }).returningAll().executeTakeFirstOrThrow();

    for (const item of prepared) {
      const receiptLine = await trx.insertInto('purchaseOrderReceiptLines').values({ receiptId: receipt.id, purchaseOrderLineId: item.line.id, quantity: item.quantity, unitCostCents: item.line.unitPriceCents, accruedCostCents: item.receiptCostCents }).returning('id').executeTakeFirstOrThrow();
      await trx.insertInto('inventoryMovements').values({
        productId: item.product.id,
        movementDate: date,
        quantityDelta: item.quantity,
        unitCostCents: item.receiptCostCents === 0 ? item.line.unitPriceCents : Math.round(item.receiptCostCents / item.quantity),
        kind: 'purchase',
        journalEntryId,
        note: `Received from PO ${po.poNumber}`,
        sourceDocumentType: 'purchaseOrderReceipt',
        sourceDocumentId: receipt.id,
        sourceLineId: receiptLine.id,
      }).execute();
      await trx.updateTable('purchaseOrderLines').set({ receivedQuantity: item.line.receivedQuantity + item.quantity }).where('id', '=', item.line.id).execute();
    }

    const refreshed = await trx.selectFrom('purchaseOrderLines').select(['quantity', 'receivedQuantity', 'productId']).where('purchaseOrderId', '=', po.id).execute();
    const stock = refreshed.filter((x) => x.productId !== null && x.quantity > 0);
    const fullyReceived = stock.every((x) => x.receivedQuantity + 1e-9 >= x.quantity);
    await trx.updateTable('purchaseOrders').set({
      status: fullyReceived ? 'received' : 'sent',
      receivedAt: fullyReceived ? date : null,
      receiptJournalEntryId: journalEntryId,
    }).where('id', '=', po.id).execute();
  });
  return purchaseOrdersGet(po.id);
}

/** Reverses the newest goods receipt: GRNI, stock movement, receipt rows, and PO quantities move together. */
export async function purchaseOrdersReverseLatestReceipt(id: number) {
  const db = getCurrentDb();
  const po = await purchaseOrdersGet(id);
  if (po.convertedBillId !== null || po.matchedBillId !== null) throw new Error('This receipt has already been matched to a vendor bill. Reverse/delete that bill flow first.');
  const receipt = await db.selectFrom('purchaseOrderReceipts').selectAll().where('purchaseOrderId', '=', id).orderBy('receiptDate', 'desc').orderBy('id', 'desc').executeTakeFirst();
  if (!receipt) throw new Error('This purchase order has no goods receipt to reverse.');
  const lines = await db.selectFrom('purchaseOrderReceiptLines').selectAll().where('receiptId', '=', receipt.id).execute();
  await db.transaction().execute(async (trx) => {
    if (receipt.journalEntryId !== null) await journalVoid(receipt.journalEntryId, false, trx, true);
    await trx.deleteFrom('inventoryMovements').where((eb) => eb.or([eb.and([eb('sourceDocumentType', '=', 'purchaseOrderReceipt'), eb('sourceDocumentId', '=', receipt.id)]), ...(receipt.journalEntryId !== null ? [eb('journalEntryId', '=', receipt.journalEntryId)] : [])])).execute();
    for (const line of lines) {
      const poLine = await trx.selectFrom('purchaseOrderLines').select('receivedQuantity').where('id', '=', line.purchaseOrderLineId).executeTakeFirstOrThrow();
      await trx.updateTable('purchaseOrderLines').set({ receivedQuantity: Math.max(0, poLine.receivedQuantity - line.quantity) }).where('id', '=', line.purchaseOrderLineId).execute();
    }
    await trx.deleteFrom('purchaseOrderReceiptLines').where('receiptId', '=', receipt.id).execute();
    await trx.deleteFrom('purchaseOrderReceipts').where('id', '=', receipt.id).execute();
    const prior = await trx.selectFrom('purchaseOrderReceipts').select('journalEntryId').where('purchaseOrderId', '=', id).orderBy('receiptDate', 'desc').orderBy('id', 'desc').executeTakeFirst();
    await trx.updateTable('purchaseOrders').set({ status: 'sent', receivedAt: null, receiptJournalEntryId: prior?.journalEntryId ?? null }).where('id', '=', id).execute();
  });
  return purchaseOrdersGet(id);
}


/** Match the vendor invoice to goods already received. Inventory is NOT debited again.
 * Expected receipt cost clears GRNI; recoverable GST/HST is recognized from the vendor invoice;
 * any difference between the vendor invoice and the receipt accrual posts to Purchase Price Variance.
 */
export async function purchaseOrdersMatchSupplierBill(input: unknown) {
  const payload = input as {
    id: number;
    billDate?: string;
    dueDate?: string;
    paymentTerms?: PaymentTerm | null;
    invoiceBaseCents?: number;
    taxCode?: TaxCode | null;
    taxCents?: number;
    memo?: string | null;
    billNumber?: string;
  };
  const po = await purchaseOrdersGet(payload.id);
  if (po.matchedBillId !== null || po.convertedBillId !== null || po.status === 'converted') throw new Error('This purchase order has already been billed.');
  const stockLines = po.lines.filter((l) => l.productId !== null && l.quantity > 0);
  if (stockLines.length === 0 || stockLines.some((l) => l.receivedQuantity <= 0)) throw new Error('Receive the inventory before matching the vendor invoice.');
  if (stockLines.some((l) => l.receivedQuantity + 1e-9 < l.quantity)) throw new Error('This purchase order is only partially received. Finish receiving it before matching one vendor invoice.');

  const db = getCurrentDb();
  const billNumber = payload.billNumber?.trim();
  if (!billNumber) throw new Error('Vendor invoice number is required for matching.');
  const duplicate = await db.selectFrom('bills').select('id').where('vendorId', '=', po.vendorId).where((eb) => eb.fn('lower', ['billNumber']), '=', billNumber.toLowerCase()).executeTakeFirst();
  if (duplicate) throw new Error(`Vendor invoice ${billNumber} is already recorded on an existing bill. Open that bill instead of matching it again.`);
  const date = payload.billDate ?? localIsoDate();
  const billTiming = dateOrderRefusalReason(`purchase order ${po.poNumber}`, po.orderDate, 'vendor invoice', date);
  if (billTiming) throw new Error(billTiming);
  const terms = payload.paymentTerms ?? 'net30';
  const dueDate = payload.dueDate ?? dueDateFor(date, terms) ?? date;
  const grniId = await ensureAccountByName(db, 'Goods Received Not Invoiced', 'Liability', 'GRNI-DEFAULT', '2620', 'Current Liability');
  const apId = await ensureAccountByName(db, ...ACCOUNTS_PAYABLE_ARGS);
  const ppvId = await ensureAccountByName(db, 'Purchase Price Variance', 'Expense', 'PPV-DEFAULT', '8320', 'Cost of Goods Sold');

  const receiptRows = await db
    .selectFrom('purchaseOrderReceipts')
    .innerJoin('purchaseOrderReceiptLines', 'purchaseOrderReceiptLines.receiptId', 'purchaseOrderReceipts.id')
    .select(['purchaseOrderReceiptLines.accruedCostCents'])
    .where('purchaseOrderReceipts.purchaseOrderId', '=', po.id)
    .execute();
  const expectedReceiptCostCents = receiptRows.reduce((sum, row) => sum + row.accruedCostCents, 0);
  if (expectedReceiptCostCents <= 0) throw new Error('No posted GRNI receipt accrual was found for this purchase order.');

  let expectedBaseCents = 0;
  let expectedTaxCents = 0;
  const nonStockLines = po.lines.filter((l) => l.productId === null);
  for (const line of stockLines) {
    const base = Math.round(line.quantity * line.unitPriceCents);
    const code = (line.taxCode as TaxCode | null) ?? null;
    const tax = code === 'Manual' ? Math.max(0, line.manualHstCents ?? 0) : suggestTaxCents(code, base);
    const split = computeTaxSplit(code, tax);
    expectedBaseCents += base;
    expectedTaxCents += tax;
  }
  for (const line of nonStockLines) {
    expectedBaseCents += line.amountCents;
    const code = (line.taxCode as TaxCode | null) ?? null;
    expectedTaxCents += code === 'Manual' ? Math.max(0, line.manualHstCents ?? 0) : suggestTaxCents(code, line.amountCents);
  }

  const taxCodes = new Set(po.lines.map((l) => (l.taxCode as TaxCode | null) ?? null));
  const taxCode = payload.taxCode !== undefined ? payload.taxCode : (taxCodes.size === 1 ? ((po.lines[0].taxCode as TaxCode | null) ?? null) : 'Manual');
  const invoiceBaseCents = payload.invoiceBaseCents ?? expectedBaseCents;
  const taxCents = payload.taxCents ?? expectedTaxCents;
  if (!Number.isInteger(invoiceBaseCents) || invoiceBaseCents <= 0) throw new Error('Vendor invoice base amount must be positive.');
  if (!Number.isInteger(taxCents) || taxCents < 0) throw new Error('Vendor invoice tax amount cannot be negative.');
  const split = computeTaxSplit(taxCode, taxCents);
  const invoiceTotalCents = invoiceBaseCents + split.totalTaxCents;

  // Expense/service PO lines were not part of the goods receipt, so recognize them now.
  const result = await db.transaction().execute(async (trx) => {
    const lines: Array<{ accountId: number; debitCents: number; creditCents: number; description: string }> = [];
    if (expectedReceiptCostCents > 0) lines.push({ accountId: grniId, debitCents: expectedReceiptCostCents, creditCents: 0, description: `Clear GRNI — PO ${po.poNumber}` });
    for (const line of nonStockLines) {
      if (line.amountCents <= 0) continue;
      const code = (line.taxCode as TaxCode | null) ?? null;
      const lineTax = code === 'Manual' ? Math.max(0, line.manualHstCents ?? 0) : suggestTaxCents(code, line.amountCents);
      const lineSplit = computeTaxSplit(code, lineTax);
      const expenseCost = line.amountCents + lineSplit.nonClaimableTaxCents;
      lines.push({ accountId: line.categoryAccountId, debitCents: expenseCost, creditCents: 0, description: line.description });
    }
    if (split.claimableTaxCents > 0) {
      const taxId = await ensureGstHstAccountId(trx, 'recoverable');
      lines.push({ accountId: taxId, debitCents: split.claimableTaxCents, creditCents: 0, description: 'GST/HST ITC — vendor invoice' });
    }
    // Balance whatever changed since the PO/receipt estimate to PPV rather than inventory, avoiding a second stock receipt.
    const debitsBeforeVariance = lines.reduce((n, l) => n + l.debitCents - l.creditCents, 0);
    const variance = invoiceTotalCents - debitsBeforeVariance;
    if (variance > 0) lines.push({ accountId: ppvId, debitCents: variance, creditCents: 0, description: `PO price/tax variance — ${po.poNumber}` });
    if (variance < 0) lines.push({ accountId: ppvId, debitCents: 0, creditCents: -variance, description: `PO price/tax variance — ${po.poNumber}` });
    lines.push({ accountId: apId, debitCents: 0, creditCents: invoiceTotalCents, description: `Vendor invoice — PO ${po.poNumber}` });

    const entry = await journalCreate({ entryDate: date, memo: payload.memo ?? `Vendor invoice ${billNumber} matched to PO ${po.poNumber}`, reference: billNumber, lines: tagLinesWithContact(lines, { vendorId: po.vendorId }) }, trx);
    const posted = await journalPost(entry.id, trx);
    const billRow = await trx.insertInto('bills').values({
      vendorId: po.vendorId,
      billNumber,
      billDate: date,
      dueDate,
      categoryAccountId: po.lines[0].categoryAccountId,
      amountCents: invoiceTotalCents,
      taxCode,
      manualHstCents: taxCents,
      memo: payload.memo ?? `Vendor invoice ${billNumber} matched to PO ${po.poNumber}`,
      status: 'unpaid',
      billJournalEntryId: posted.id,
      paymentJournalEntryId: null,
      foreignCurrency: null,
      foreignAmountCents: null,
      exchangeRate: null,
      receiptFilePath: null,
      paymentTerms: terms,
    }).returningAll().executeTakeFirstOrThrow();
    const claimed = await trx.updateTable('purchaseOrders')
      .set({ status: 'converted', convertedBillId: billRow.id, convertedAt: new Date().toISOString(), matchedBillId: billRow.id, matchedAt: new Date().toISOString() })
      .where('id', '=', po.id)
      .where('convertedBillId', 'is', null)
      .where('matchedBillId', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!claimed) throw new Error('This purchase order was matched by another request. Open its existing vendor bill instead.');
    return { bill: mapBillRow(billRow), varianceCents: variance };
  });
  return { purchaseOrder: await purchaseOrdersGet(po.id), bill: result.bill, baseVarianceCents: result.varianceCents };
}

/** Reverses an unpaid vendor-invoice match while retaining the real goods receipt and stock.
 * The AP/GRNI/variance journal, bill, and PO links change together. */
export async function purchaseOrdersUnmatchSupplierBill(id: number) {
  const db = getCurrentDb();
  const po = await purchaseOrdersGet(id);
  if (po.matchedBillId === null) throw new Error('This purchase order has no matched vendor bill to reverse.');
  const bill = await db.selectFrom('bills').selectAll().where('id', '=', po.matchedBillId).executeTakeFirst();
  if (!bill) throw new Error('The matched vendor bill is missing. Restore it before changing the purchase-order link.');
  if (bill.paidCents > 0) throw new Error('Reverse the vendor bill payments before unmatching it from received goods.');

  await db.transaction().execute(async (trx) => {
    await trx.updateTable('purchaseOrders').set({ status: 'received', convertedBillId: null, convertedAt: null, matchedBillId: null, matchedAt: null }).where('id', '=', id).execute();
    if (bill.billJournalEntryId !== null) await journalVoid(bill.billJournalEntryId, false, trx, true);
    await trx.deleteFrom('bills').where('id', '=', bill.id).execute();
  });
  return purchaseOrdersGet(id);
}

export async function purchaseOrdersDelete(id: number) {
  const existing = await purchaseOrdersGet(id);
  if (existing.convertedBillId !== null) {
    throw new Error('This purchase order has been billed. Delete the bill first if it was entered in error.');
  }
  if (existing.lines.some((line) => line.receivedQuantity > 0)) {
    throw new Error('This purchase order has posted goods receipts and cannot be deleted. Reverse the receipt instead so the audit trail remains intact.');
  }
  const db = getCurrentDb();
  await db.deleteFrom('purchaseOrders').where('id', '=', id).execute();
  return { deleted: true } as const;
}

/**
 * Turns a purchase order into the vendor's bill.
 *
 * This is where accounts payable first hears about it. A bill carries one category account rather
 * than lines, so a multi-line order is summed into a single bill against the first line's category
 * — anything more would need the bill itself to grow lines, which is a bigger change than this.
 * The order keeps its own lines, so what was ordered is still on record.
 */
export async function purchaseOrdersConvertToBill(input: unknown) {
  const { id, billDate, paymentTerms, billNumber } = input as {
    id: number;
    billDate?: string;
    paymentTerms?: PaymentTerm | null;
    billNumber?: string;
  };

  const po = await purchaseOrdersGet(id);
  const block = purchaseOrderConversionBlock(po.status, po.convertedBillId);
  if (block) throw new Error(block);
  if (po.lines.length === 0) throw new Error('This purchase order has no lines to bill.');
  if (po.receivedAt || po.receiptJournalEntryId !== null || po.lines.some((line) => line.receivedQuantity > 0)) {
    throw new Error('Goods on this purchase order were already received into inventory. Use the GRNI vendor-invoice matching flow so Inventory is not debited twice.');
  }

  const db = getCurrentDb();
  const date = billDate ?? localIsoDate();
  const conversionTiming = dateOrderRefusalReason(`purchase order ${po.poNumber}`, po.orderDate, 'bill', date);
  if (conversionTiming) throw new Error(conversionTiming);
  const terms = paymentTerms ?? 'net30';
  const supplierInvoiceNumber = billNumber?.trim();
  if (!supplierInvoiceNumber) throw new Error('Vendor invoice number is required when entering a bill from a purchase order.');

  const categories = new Set(po.lines.map((l) => l.categoryAccountId));
  const taxCodes = new Set(po.lines.map((l) => l.taxCode ?? null));
  const baseCents = po.lines.reduce((sum, line) => sum + line.amountCents, 0);
  const taxCents = po.lines.reduce((sum, line) => {
    const code = (line.taxCode as TaxCode | null) ?? null;
    return sum + (code === 'Manual' ? Math.max(0, line.manualHstCents ?? 0) : suggestTaxCents(code, line.amountCents));
  }, 0);
  // The current Bill model has one tax code for the whole bill. A mixed-tax PO therefore becomes
  // Manual Tax with the exact summed amount so no tax disappears during conversion.
  const billTaxCode: TaxCode | null = taxCents === 0 ? null : taxCodes.size === 1 ? ((po.lines[0].taxCode as TaxCode | null) ?? null) : 'Manual';

  const bill = await db.transaction().execute(async (trx) => {
    const created = await billsCreate({
      vendorId: po.vendorId,
      billNumber: supplierInvoiceNumber,
      billDate: date,
      dueDate: dueDateFor(date, terms) ?? date,
      paymentTerms: terms,
      categoryAccountId: po.lines[0].categoryAccountId,
      baseCents,
      taxCode: billTaxCode,
      taxCents,
      memo:
        categories.size > 1
          ? `From purchase order ${po.poNumber} (${categories.size} categories combined)`
          : (po.memo ?? `Vendor invoice ${supplierInvoiceNumber} from purchase order ${po.poNumber}`),
    }, trx);
    const claimed = await trx.updateTable('purchaseOrders')
      .set({ status: 'converted', convertedBillId: created.id, convertedAt: new Date().toISOString() })
      .where('id', '=', id)
      .where('convertedBillId', 'is', null)
      .where('matchedBillId', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!claimed) throw new Error('This purchase order was billed by another request. Open its existing bill instead.');
    return created;
  });

  return {
    purchaseOrder: await purchaseOrdersGet(id),
    bill,
    // Said plainly rather than left to be discovered on the general ledger.
    combinedCategories: categories.size > 1 ? categories.size : null,
  };
}

export async function purchaseOrdersSetApproval(input: unknown) {
  const { id, approvalStatus, note } = input as { id: number; approvalStatus: ApprovalStatus; note?: string | null };
  if (!canApprove(getAccessRole())) throw new Error('Only an administrator or accountant can approve or reject purchase orders.');
  const existing = await purchaseOrdersGet(id);
  const current = ((existing as { approvalStatus?: string }).approvalStatus ?? 'notRequired') as ApprovalStatus;
  if (!canTransitionApproval(current, approvalStatus)) throw new Error(`This purchase order is ${current} and cannot be marked ${approvalStatus}.`);
  if (approvalStatus === 'rejected' && !note?.trim()) throw new Error('Say why the purchase order is rejected so it can be corrected.');
  const actor = getAccessIdentity().name;
  await getCurrentDb().updateTable('purchaseOrders').set({ approvalStatus, approvedBy: approvalStatus === 'approved' ? actor : null, approvedAt: approvalStatus === 'approved' ? new Date().toISOString() : null, approvalNote: note?.trim() || null }).where('id', '=', id).execute();
  return purchaseOrdersGet(id);
}
