import { saveContactSchema } from '@shared/validation/schemas';
import { getCurrentDb } from '../companyFile';
import { getAllBills, getAllCustomers, getAllInvoices, getAllVendors } from '../db/queries';
import { mapContactRow } from '../db/mappers';
import { deactivationRefusalReason, duplicateNameRefusalReason } from '@shared/domain/contacts/contactRules';

export async function customersList() {
  const db = getCurrentDb();
  return getAllCustomers(db);
}

export async function customersSave(input: unknown) {
  const payload = saveContactSchema.parse(input);
  const db = getCurrentDb();
  const fields = {
    name: payload.name,
    companyName: payload.companyName,
    contactName: payload.contactName,
    website: payload.website,
    shippingAddress: payload.shippingAddress,
    email: payload.email,
    phone: payload.phone,
    address: payload.address,
    notes: payload.notes,
    isT4aContractor: payload.isT4aContractor ? 1 : 0,
    t4aSin: payload.t4aSin,
    t4aBusinessNumber: payload.t4aBusinessNumber,
    isT5018Contractor: payload.isT5018Contractor ? 1 : 0,
    defaultExpenseAccountId: payload.defaultExpenseAccountId,
    paymentTerms: payload.paymentTerms,
    lateInterestRatePercent: payload.lateInterestRatePercent,
  };
  const duplicate = duplicateNameRefusalReason('customer', payload.name, await db.selectFrom('customers').select(['id', 'name']).execute(), payload.id ?? null);
  if (duplicate) throw new Error(duplicate);
  if (payload.id) {
    await db.updateTable('customers').set(fields).where('id', '=', payload.id).execute();
    const row = await db.selectFrom('customers').selectAll().where('id', '=', payload.id).executeTakeFirstOrThrow();
    return mapContactRow(row);
  }
  const inserted = await db
    .insertInto('customers')
    .values({ ...fields, isActive: 1 })
    .returningAll()
    .executeTakeFirstOrThrow();
  return mapContactRow(inserted);
}

export async function customersDeactivate(id: number) {
  const db = getCurrentDb();
  const customer = await db.selectFrom('customers').select('name').where('id', '=', id).executeTakeFirstOrThrow();
  const openInvoices = (await getAllInvoices(db)).filter((invoice) => invoice.customerId === id && invoice.balanceDueCents > 0).length;
  const openCredits = await db.selectFrom('creditNotes').select('id').where('kind', '=', 'customer').where('contactId', '=', id).where('status', '=', 'open').execute();
  const refusal = deactivationRefusalReason('customer', customer.name, { openDocumentCount: openInvoices, openCreditCount: openCredits.length });
  if (refusal) throw new Error(refusal);
  await db.updateTable('customers').set({ isActive: 0 }).where('id', '=', id).execute();
  const row = await db.selectFrom('customers').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  return mapContactRow(row);
}

export async function vendorsList() {
  const db = getCurrentDb();
  return getAllVendors(db);
}

export async function vendorsSave(input: unknown) {
  const payload = saveContactSchema.parse(input);
  const db = getCurrentDb();
  const fields = {
    name: payload.name,
    companyName: payload.companyName,
    contactName: payload.contactName,
    website: payload.website,
    shippingAddress: payload.shippingAddress,
    email: payload.email,
    phone: payload.phone,
    address: payload.address,
    notes: payload.notes,
    isT4aContractor: payload.isT4aContractor ? 1 : 0,
    t4aSin: payload.t4aSin,
    t4aBusinessNumber: payload.t4aBusinessNumber,
    isT5018Contractor: payload.isT5018Contractor ? 1 : 0,
    defaultExpenseAccountId: payload.defaultExpenseAccountId,
    paymentTerms: payload.paymentTerms,
  };
  const duplicate = duplicateNameRefusalReason('vendor', payload.name, await db.selectFrom('vendors').select(['id', 'name']).execute(), payload.id ?? null);
  if (duplicate) throw new Error(duplicate);
  if (payload.id) {
    await db.updateTable('vendors').set(fields).where('id', '=', payload.id).execute();
    const row = await db.selectFrom('vendors').selectAll().where('id', '=', payload.id).executeTakeFirstOrThrow();
    return mapContactRow(row);
  }
  const inserted = await db
    .insertInto('vendors')
    .values({ ...fields, isActive: 1 })
    .returningAll()
    .executeTakeFirstOrThrow();
  return mapContactRow(inserted);
}

export async function vendorsDeactivate(id: number) {
  const db = getCurrentDb();
  const vendor = await db.selectFrom('vendors').select('name').where('id', '=', id).executeTakeFirstOrThrow();
  const openBills = (await getAllBills(db)).filter((bill) => bill.vendorId === id && bill.balanceDueCents > 0).length;
  const openCredits = await db.selectFrom('creditNotes').select('id').where('kind', '=', 'vendor').where('contactId', '=', id).where('status', '=', 'open').execute();
  const refusal = deactivationRefusalReason('vendor', vendor.name, { openDocumentCount: openBills, openCreditCount: openCredits.length });
  if (refusal) throw new Error(refusal);
  await db.updateTable('vendors').set({ isActive: 0 }).where('id', '=', id).execute();
  const row = await db.selectFrom('vendors').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  return mapContactRow(row);
}


/** Folds one contact into another. Every table that points at the duplicate is re-pointed at the
 * kept record inside one transaction, then the duplicate is made inactive and renamed so it
 * cannot be picked again by mistake. Nothing is deleted: the merged record's own history is now
 * the kept record's history. */
export async function contactsMerge(kind: 'customer' | 'vendor', input: unknown) {
  const { keepId, mergeId } = input as { keepId: number; mergeId: number };
  if (!Number.isInteger(keepId) || !Number.isInteger(mergeId) || keepId === mergeId) throw new Error('Choose two different records.');
  const db = getCurrentDb();
  const table = kind === 'customer' ? 'customers' : 'vendors';
  const [keep, merge] = await Promise.all([
    db.selectFrom(table).select(['id', 'name']).where('id', '=', keepId).executeTakeFirst(),
    db.selectFrom(table).select(['id', 'name']).where('id', '=', mergeId).executeTakeFirst(),
  ]);
  if (!keep || !merge) throw new Error(`${kind === 'customer' ? 'Customer' : 'Vendor'} not found.`);
  const mergedName = `${merge.name} (merged into ${keep.name})`.slice(0, 200);
  await db.transaction().execute(async (trx) => {
    if (kind === 'customer') {
      await trx.updateTable('invoices').set({ customerId: keepId }).where('customerId', '=', mergeId).execute();
      await trx.updateTable('salesReceipts').set({ customerId: keepId }).where('customerId', '=', mergeId).execute();
      await trx.updateTable('estimates').set({ customerId: keepId }).where('customerId', '=', mergeId).execute();
      await trx.updateTable('timeEntries').set({ customerId: keepId }).where('customerId', '=', mergeId).execute();
      await trx.updateTable('recurringInvoices').set({ customerId: keepId }).where('customerId', '=', mergeId).execute();
      await trx.updateTable('journalEntryLines').set({ customerId: keepId }).where('customerId', '=', mergeId).execute();
      await trx.updateTable('bankImportRowProgress').set({ customerId: keepId }).where('customerId', '=', mergeId).execute();
      await trx.updateTable('creditNotes').set({ contactId: keepId }).where('contactId', '=', mergeId).where('kind', '=', 'customer').execute();
      await trx.updateTable('customers').set({ isActive: 0, name: mergedName }).where('id', '=', mergeId).execute();
    } else {
      await trx.updateTable('bills').set({ vendorId: keepId }).where('vendorId', '=', mergeId).execute();
      await trx.updateTable('purchaseOrders').set({ vendorId: keepId }).where('vendorId', '=', mergeId).execute();
      await trx.updateTable('journalEntryLines').set({ vendorId: keepId }).where('vendorId', '=', mergeId).execute();
      await trx.updateTable('bankImportRowProgress').set({ vendorId: keepId }).where('vendorId', '=', mergeId).execute();
      await trx.updateTable('products').set({ preferredVendorId: keepId }).where('preferredVendorId', '=', mergeId).execute();
      await trx.updateTable('recurringTemplates').set({ billVendorId: keepId }).where('billVendorId', '=', mergeId).execute();
      await trx.updateTable('creditNotes').set({ contactId: keepId }).where('contactId', '=', mergeId).where('kind', '=', 'vendor').execute();
      await trx.updateTable('vendors').set({ isActive: 0, name: mergedName }).where('id', '=', mergeId).execute();
    }
  });
  return { merged: true as const, keepId, mergeId, keepName: keep.name, mergedName: merge.name };
}
