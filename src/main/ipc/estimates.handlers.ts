import { getCurrentDb } from '../companyFile';
import { nextDocumentNumber, resolveNewDocumentNumber } from '@shared/domain/documents/documentNumbering';
import {
  canTransitionEstimate,
  documentTotalCents,
  estimateConversionBlock,
  isSalesOrder,
  lineAmountCents,
  type EstimateStatus,
  type FulfillmentStatus,
} from '@shared/domain/sales/commitmentDocuments';
import { invoicesCreate, invoicesNextNumber } from './invoices.handlers';
import { purchaseOrdersCreate, purchaseOrdersNextNumber } from './purchaseOrders.handlers';
import { dueDateFor, type PaymentTerm } from '@shared/domain/contacts/paymentTerms';
import { inactiveContactRefusalReason } from '@shared/domain/contacts/contactRules';
import { dateOrderRefusalReason } from '@shared/domain/documents/paymentTiming';
import type { AppDb } from '../db/schema';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Estimates — what has been offered to a customer, before any of it is owed.
 *
 * Nothing here touches the ledger. An estimate is a document, not a transaction: no money has
 * moved and nothing is receivable, so posting one would overstate what the business is owed by
 * exactly the amount least likely to arrive. The ledger only sees it if it becomes an invoice.
 */

export interface EstimateLineInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
  revenueAccountId: number;
  taxCode: string | null;
  manualHstCents: number | null;
  productId: number | null;
}

export interface EstimateInput {
  customerId: number;
  estimateNumber: string;
  estimateDate: string;
  expiryDate: string | null;
  memo: string | null;
  requiredByDate?: string | null;
  lines: EstimateLineInput[];
}

export async function estimatesNextNumber(input?: unknown): Promise<string> {
  const { estimateDate } = (input ?? {}) as { estimateDate?: string };
  const db = getCurrentDb();
  const rows = await db.selectFrom('estimates').select('estimateNumber').execute();
  return nextDocumentNumber(
    'EST',
    rows.map((r) => r.estimateNumber),
    estimateDate ?? localIsoDate(),
  );
}

export async function estimatesList() {
  const db = getCurrentDb();
  const rows = await db.selectFrom('estimates').selectAll().orderBy('estimateDate', 'desc').orderBy('id', 'desc').execute();
  return rows.map((r) => ({ ...r, status: r.status as EstimateStatus }));
}

export async function estimatesGet(id: number) {
  const db = getCurrentDb();
  const estimate = await db.selectFrom('estimates').selectAll().where('id', '=', id).executeTakeFirst();
  if (!estimate) throw new Error(`Estimate ${id} not found.`);
  const lines = await db.selectFrom('estimateLines').selectAll().where('estimateId', '=', id).orderBy('lineOrder').execute();
  return { ...estimate, status: estimate.status as EstimateStatus, lines };
}

function validate(payload: EstimateInput): void {
  if (!payload.customerId) throw new Error('An estimate needs a customer.');
  if (!payload.estimateNumber?.trim()) throw new Error('An estimate needs a number.');
  if (!payload.lines?.length) throw new Error('An estimate needs at least one line.');
  for (const line of payload.lines) {
    if (!line.description?.trim()) throw new Error('Every line needs a description.');
    if (!line.revenueAccountId) throw new Error(`"${line.description}" needs a revenue account.`);
  }
  // Checked here rather than left to the reader: an expiry before the estimate date makes a quote
  // that was never valid, and the only sign of it would be a status that reads "expired" on the day
  // it was written.
  if (payload.expiryDate && payload.expiryDate < payload.estimateDate) {
    throw new Error('The expiry date cannot be before the estimate date.');
  }
}

async function assertCustomerActive(db: AppDb, customerId: number): Promise<void> {
  const customer = await db.selectFrom('customers').select(['name', 'isActive']).where('id', '=', customerId).executeTakeFirst();
  const refusal = inactiveContactRefusalReason('customer', customer && { name: customer.name, isActive: Boolean(customer.isActive) }, 'estimate');
  if (refusal) throw new Error(refusal);
}

export async function estimatesCreate(input: unknown) {
  const payload = input as EstimateInput;
  validate(payload);

  const db = getCurrentDb();
  await assertCustomerActive(db, payload.customerId);
  const totalCents = documentTotalCents(payload.lines);

  return db.transaction().execute(async (trx) => {
    const taken = (await trx.selectFrom('estimates').select('estimateNumber').execute()).map((row) => row.estimateNumber);
    const estimate = await trx
      .insertInto('estimates')
      .values({
        customerId: payload.customerId,
        estimateNumber: resolveNewDocumentNumber('EST', payload.estimateNumber, taken, payload.estimateDate, 'Estimate number'),
        estimateDate: payload.estimateDate,
        expiryDate: payload.expiryDate,
        memo: payload.memo,
        requiredByDate: payload.requiredByDate ?? null,
        totalCents,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    for (const [i, line] of payload.lines.entries()) {
      await trx
        .insertInto('estimateLines')
        .values({
          estimateId: estimate.id,
          lineOrder: i,
          description: line.description.trim(),
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          amountCents: lineAmountCents(line),
          revenueAccountId: line.revenueAccountId,
          taxCode: line.taxCode,
          manualHstCents: line.manualHstCents,
          productId: line.productId,
        })
        .execute();
    }

    return { ...estimate, status: estimate.status as EstimateStatus };
  });
}

export async function estimatesUpdate(input: unknown) {
  const { id, patch } = input as { id: number; patch: EstimateInput };
  const existing = await estimatesGet(id);

  // A converted estimate is the record of what the invoice was raised from. Editing it after the
  // fact would leave the two disagreeing with nothing to say which is right.
  if (existing.convertedInvoiceId !== null) {
    throw new Error('This estimate has been invoiced and can no longer be changed.');
  }

  validate(patch);
  const db = getCurrentDb();
  await assertCustomerActive(db, patch.customerId);
  const totalCents = documentTotalCents(patch.lines);

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('estimates')
      .set({
        customerId: patch.customerId,
        estimateNumber: patch.estimateNumber.trim(),
        estimateDate: patch.estimateDate,
        expiryDate: patch.expiryDate,
        memo: patch.memo,
        totalCents,
      })
      .where('id', '=', id)
      .execute();

    await trx.deleteFrom('estimateLines').where('estimateId', '=', id).execute();
    for (const [i, line] of patch.lines.entries()) {
      await trx
        .insertInto('estimateLines')
        .values({
          estimateId: id,
          lineOrder: i,
          description: line.description.trim(),
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          amountCents: lineAmountCents(line),
          revenueAccountId: line.revenueAccountId,
          taxCode: line.taxCode,
          manualHstCents: line.manualHstCents,
          productId: line.productId,
        })
        .execute();
    }
  });

  return estimatesGet(id);
}

export async function estimatesSetStatus(input: unknown) {
  const { id, status } = input as { id: number; status: EstimateStatus };
  const existing = await estimatesGet(id);

  if (!canTransitionEstimate(existing.status, status)) {
    throw new Error(`An estimate that is ${existing.status} cannot be marked ${status}.`);
  }

  const db = getCurrentDb();
  await db.updateTable('estimates').set({ status, closedAt: status === 'closed' ? new Date().toISOString() : null }).where('id', '=', id).execute();
  return estimatesGet(id);
}

/** Shipped or not. Independent of invoicing: goods often go out before the invoice, and sometimes after. */
export async function estimatesSetFulfillment(input: unknown) {
  const { id, fulfillmentStatus, shipDate } = input as { id: number; fulfillmentStatus: FulfillmentStatus; shipDate?: string | null };
  const existing = await estimatesGet(id);
  if (!isSalesOrder(existing.status)) throw new Error('Only an accepted estimate (a sales order) can be marked shipped.');
  if (fulfillmentStatus !== 'pending' && fulfillmentStatus !== 'shipped') throw new Error('Fulfilment is either pending or shipped.');
  const db = getCurrentDb();
  await db.updateTable('estimates').set({ fulfillmentStatus, shipDate: fulfillmentStatus === 'shipped' ? (shipDate ?? localIsoDate()) : null }).where('id', '=', id).execute();
  return estimatesGet(id);
}

export async function estimatesSetRequiredBy(input: unknown) {
  const { id, requiredByDate } = input as { id: number; requiredByDate: string | null };
  const existing = await estimatesGet(id);
  if (requiredByDate && requiredByDate < existing.estimateDate) throw new Error('The required-by date cannot be before the order date.');
  const db = getCurrentDb();
  await db.updateTable('estimates').set({ requiredByDate: requiredByDate || null }).where('id', '=', id).execute();
  return estimatesGet(id);
}

/**
 * Raises a purchase order to source what a sales order promises — the same lines, priced at each
 * product's purchase price where there is one (otherwise zero, to be filled in on the order), each
 * charged to the product's stock or cost account, or the vendor's default expense account.
 * Nothing posts: a purchase order is a commitment, not a bill.
 */
export async function estimatesConvertToPurchaseOrder(input: unknown) {
  const { id, vendorId, orderDate } = input as { id: number; vendorId: number; orderDate?: string };
  const estimate = await estimatesGet(id);
  if (!isSalesOrder(estimate.status)) throw new Error('Only an accepted estimate (a sales order) can be turned into a purchase order.');
  if (estimate.convertedPurchaseOrderId !== null) throw new Error('A purchase order has already been raised for this sales order. Open it instead.');
  const db = getCurrentDb();
  const vendor = await db.selectFrom('vendors').select(['id', 'name', 'defaultExpenseAccountId']).where('id', '=', vendorId).executeTakeFirst();
  if (!vendor) throw new Error('Choose the vendor the purchase order is for.');
  const productIds = estimate.lines.map((line) => line.productId).filter((pid): pid is number => pid !== null);
  const products = productIds.length === 0 ? [] : await db.selectFrom('products').selectAll().where('id', 'in', productIds).execute();
  const date = orderDate ?? localIsoDate();
  const poNumber = await purchaseOrdersNextNumber({ orderDate: date });
  const lines = estimate.lines.map((line) => {
    const product = line.productId === null ? undefined : products.find((row) => row.id === line.productId);
    const categoryAccountId = product?.assetAccountId ?? product?.cogsAccountId ?? vendor.defaultExpenseAccountId ?? null;
    if (categoryAccountId === null) throw new Error(`"${line.description}" has no purchase account: set a default expense account on ${vendor.name}, or an inventory/cost account on the product.`);
    return {
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: product?.purchasePriceCents ?? 0,
      categoryAccountId,
      taxCode: line.taxCode,
      manualHstCents: null,
      productId: line.productId,
    };
  });
  const purchaseOrder = await purchaseOrdersCreate({
    vendorId,
    poNumber,
    orderDate: date,
    expectedDate: estimate.requiredByDate ?? null,
    memo: `For sales order ${estimate.estimateNumber}`,
    lines,
  });
  await db.updateTable('estimates').set({ convertedPurchaseOrderId: purchaseOrder.id }).where('id', '=', id).execute();
  return { estimate: await estimatesGet(id), purchaseOrder };
}

export async function estimatesDelete(id: number) {
  const existing = await estimatesGet(id);
  if (existing.convertedInvoiceId !== null) {
    throw new Error('This estimate has been invoiced. Void the invoice first if it was raised in error.');
  }
  const db = getCurrentDb();
  await db.deleteFrom('estimates').where('id', '=', id).execute();
  return { deleted: true } as const;
}

/**
 * Turns an accepted estimate into a real invoice.
 *
 * This is the moment the ledger first hears about any of it. The estimate is marked converted and
 * linked to the invoice in the same transaction as the invoice is raised, so the two can never
 * disagree about whether it happened — which is what would let the same quote be billed twice.
 */
export async function estimatesConvertToInvoice(input: unknown) {
  const { id, invoiceDate, paymentTerms } = input as {
    id: number;
    invoiceDate?: string;
    paymentTerms?: PaymentTerm | null;
  };

  const estimate = await estimatesGet(id);
  const block = estimateConversionBlock(estimate.status, estimate.convertedInvoiceId);
  if (block) throw new Error(block);

  const db = getCurrentDb();
  const date = invoiceDate ?? localIsoDate();
  const timing = dateOrderRefusalReason(`estimate ${estimate.estimateNumber}`, estimate.estimateDate, 'invoice', date);
  if (timing) throw new Error(timing);
  const terms = paymentTerms ?? 'net30';

  const invoiceNumber = await invoicesNextNumber({ invoiceDate: date });
  const invoice = await db.transaction().execute(async (trx) => {
    const created = await invoicesCreate({
      customerId: estimate.customerId,
      invoiceNumber,
      invoiceDate: date,
      dueDate: dueDateFor(date, terms) ?? date,
      paymentTerms: terms,
      memo: estimate.memo ?? `From estimate ${estimate.estimateNumber}`,
      lines: estimate.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        revenueAccountId: line.revenueAccountId,
        taxCode: line.taxCode,
        manualHstCents: line.manualHstCents,
        productId: line.productId,
      })),
    }, trx);
    const claimed = await trx.updateTable('estimates')
      .set({ status: 'converted', convertedInvoiceId: created.id, convertedAt: new Date().toISOString() })
      .where('id', '=', id)
      .where('convertedInvoiceId', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!claimed) throw new Error('This estimate was converted by another request. Open its existing invoice instead.');
    return created;
  });

  return { estimate: await estimatesGet(id), invoice };
}
