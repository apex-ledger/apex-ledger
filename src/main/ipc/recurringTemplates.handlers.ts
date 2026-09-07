import { getCurrentDb } from '../companyFile';
import { billsCreate } from './bills.handlers';
import { suggestTaxCents } from '@shared/domain/ledger/computeTaxSplit';
import { advanceDate } from '@shared/domain/sales/recurringInvoices';
import { localIsoDate } from '@shared/domain/dates/localDate';
import type { TaxCode } from '@shared/domain/types';
import { TAX_CODES } from '@shared/validation/schemas';

export interface RecurringTemplateInput {
  name: string;
  type: 'expense' | 'income';
  moneyAccountId: number;
  categoryAccountId: number;
  amountCents: number;
  taxCode: string | null;
  manualHstCents: number | null;
  description: string | null;
  scheduleFrequency?: 'weekly' | 'monthly' | 'quarterly' | 'annually' | null;
  nextDueDate?: string | null;
  lastUsedDate?: string | null;
  /** Set to post the template as an unpaid vendor bill (Accounts Payable) instead of a paid expense. */
  billVendorId?: number | null;
  /** Days from the bill date to its due date; 30 when not set. */
  billDueDays?: number | null;
}

export async function recurringTemplatesList(type?: 'expense' | 'income') {
  const db = getCurrentDb();
  let query = db.selectFrom('recurringTemplates').selectAll();
  if (type) query = query.where('type', '=', type);
  const rows = await query.orderBy('name').execute();
  return rows.map((r) => ({ ...r, taxCode: r.taxCode as RecurringTemplateInput['taxCode'] }));
}

export async function recurringTemplatesCreate(input: unknown) {
  const payload = input as RecurringTemplateInput;
  if (!payload.name?.trim()) throw new Error('Template name is required.');
  const db = getCurrentDb();
  const inserted = await db
    .insertInto('recurringTemplates')
    .values({
      name: payload.name.trim(),
      type: payload.type,
      moneyAccountId: payload.moneyAccountId,
      categoryAccountId: payload.categoryAccountId,
      amountCents: payload.amountCents,
      taxCode: payload.taxCode,
      manualHstCents: payload.manualHstCents,
      description: payload.description,
      scheduleFrequency: payload.scheduleFrequency ?? null,
      nextDueDate: payload.nextDueDate ?? null,
      lastUsedDate: payload.lastUsedDate ?? null,
      billVendorId: payload.billVendorId ?? null,
      billDueDays: payload.billDueDays ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return inserted;
}

/** Edits a saved template in place. Without this a template with the wrong category or a stale
 * amount could only be deleted and retyped from scratch, losing nothing but wasting the work —
 * and the Transactions > Recurring tab edits them inline, so it needs a real update path. */
export async function recurringTemplatesUpdate(input: unknown) {
  const { id, patch } = input as { id: number; patch: Partial<RecurringTemplateInput> };
  if (patch.name !== undefined && !patch.name.trim()) throw new Error('Template name is required.');
  const db = getCurrentDb();
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values.name = patch.name.trim();
  if (patch.type !== undefined) values.type = patch.type;
  if (patch.moneyAccountId !== undefined) values.moneyAccountId = patch.moneyAccountId;
  if (patch.categoryAccountId !== undefined) values.categoryAccountId = patch.categoryAccountId;
  if (patch.amountCents !== undefined) values.amountCents = patch.amountCents;
  if (patch.taxCode !== undefined) values.taxCode = patch.taxCode;
  if (patch.manualHstCents !== undefined) values.manualHstCents = patch.manualHstCents;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.scheduleFrequency !== undefined) values.scheduleFrequency = patch.scheduleFrequency;
  if (patch.nextDueDate !== undefined) values.nextDueDate = patch.nextDueDate;
  if (patch.lastUsedDate !== undefined) values.lastUsedDate = patch.lastUsedDate;
  if (patch.billVendorId !== undefined) values.billVendorId = patch.billVendorId;
  if (patch.billDueDays !== undefined) values.billDueDays = patch.billDueDays;
  if (Object.keys(values).length === 0) {
    const current = await db.selectFrom('recurringTemplates').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    return current;
  }
  const updated = await db
    .updateTable('recurringTemplates')
    .set(values)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return updated;
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Posts a recurring template as a vendor bill: the expense is booked and Accounts Payable goes
 * up today; the money leaves when the bill is paid. The template's next due date moves on one
 * period so the reminder does not fire twice for the same month. */
export async function recurringTemplatesPostBill(input: unknown) {
  const { id, billDate } = input as { id: number; billDate?: string };
  const db = getCurrentDb();
  const template = await db.selectFrom('recurringTemplates').selectAll().where('id', '=', id).executeTakeFirst();
  if (!template) throw new Error('Recurring template not found.');
  if (!template.billVendorId) throw new Error('This template is set to post as a paid expense, not a vendor bill. Change "Post as" to Vendor bill and choose the vendor first.');
  const date = billDate ?? localIsoDate();
  if (template.taxCode && !TAX_CODES.includes(template.taxCode as TaxCode)) {
    throw new Error(`The template's tax code "${template.taxCode}" is not one the company uses any more. Pick a tax code on the template, then create the bill.`);
  }
  const taxCode = (template.taxCode ?? null) as TaxCode | null;
  const taxCents = taxCode === 'Manual' ? template.manualHstCents ?? 0 : suggestTaxCents(taxCode, template.amountCents);
  const bill = await billsCreate({
    vendorId: template.billVendorId,
    billNumber: `${template.name} ${date.slice(0, 7)}`,
    billDate: date,
    dueDate: addDays(date, template.billDueDays ?? 30),
    memo: template.description ?? template.name,
    lines: [{ categoryAccountId: template.categoryAccountId, description: template.description ?? template.name, baseCents: template.amountCents, taxCode, taxCents, productId: null, quantity: null, tagIds: [] }],
  });
  // The reminder moves on only when this bill covers it: posting September's bill with a
  // reminder already set for October leaves October alone; posting it late, after the reminder
  // date, pushes the reminder one period past the bill.
  const patch: { lastUsedDate: string; nextDueDate?: string } = { lastUsedDate: date };
  if (template.scheduleFrequency) {
    patch.nextDueDate = template.nextDueDate && template.nextDueDate > date ? template.nextDueDate : advanceDate(date, template.scheduleFrequency);
  }
  await db.updateTable('recurringTemplates').set(patch).where('id', '=', id).execute();
  return bill;
}

export async function recurringTemplatesDelete(id: number) {
  const db = getCurrentDb();
  await db.deleteFrom('recurringTemplates').where('id', '=', id).execute();
  return { deleted: true as const };
}
