import { z } from 'zod';
import { entryAmountCents, invoiceLinesFromTime, roundHours, unbilledByCustomer, type TimeEntryLike, type UnbilledSummary } from '@shared/domain/sales/timeTracking';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { DEFAULT_PAYMENT_TERM, dueDateFor } from '@shared/domain/contacts/paymentTerms';
import { getCurrentDb } from '../companyFile';
import { getAccessIdentity } from '../accessSession';
import { ensureAccountByName } from '../db/ensureAccount';
import { invoicesCreate, invoicesNextNumber } from './invoices.handlers';

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const entrySchema = z.object({
  customerId: z.number().int().positive(),
  employeeId: z.number().int().positive().nullable().optional().default(null),
  staffName: z.string().trim().max(200).nullable().optional().default(null),
  workDate: ISO_DATE,
  hours: z.number().positive().max(24),
  rateCents: z.number().int().min(0),
  description: z.string().trim().max(500).nullable().optional().default(null),
  billable: z.boolean().optional().default(true),
});
const updateSchema = z.object({ id: z.number().int().positive(), patch: entrySchema.partial() });
const listSchema = z.object({ customerId: z.number().int().positive().optional(), unbilledOnly: z.boolean().optional(), from: ISO_DATE.optional(), to: ISO_DATE.optional() }).optional();
const invoiceSchema = z.object({ customerId: z.number().int().positive(), entryIds: z.array(z.number().int().positive()).optional(), invoiceDate: ISO_DATE.optional(), revenueAccountId: z.number().int().positive().optional(), taxCode: z.string().nullable().optional() });

export interface TimeEntryRow extends TimeEntryLike {
  employeeId: number | null;
  staffName: string | null;
  amountCents: number;
  createdBy: string | null;
  createdAt: string;
}

function mapRow(row: { id: number; customerId: number; employeeId: number | null; staffName: string | null; workDate: string; hours: number; rateCents: number; description: string | null; billable: number; invoiceId: number | null; createdBy: string | null; createdAt: string }): TimeEntryRow {
  return { ...row, billable: Boolean(row.billable), amountCents: entryAmountCents(row) };
}

export async function timeEntriesList(input?: unknown): Promise<TimeEntryRow[]> {
  const filter = listSchema.parse(input) ?? {};
  let q = getCurrentDb().selectFrom('timeEntries').selectAll();
  if (filter.customerId) q = q.where('customerId', '=', filter.customerId);
  if (filter.unbilledOnly) q = q.where('invoiceId', 'is', null).where('billable', '=', 1);
  if (filter.from) q = q.where('workDate', '>=', filter.from);
  if (filter.to) q = q.where('workDate', '<=', filter.to);
  const rows = await q.orderBy('workDate', 'desc').orderBy('id', 'desc').execute();
  return rows.map(mapRow);
}

export async function timeEntriesCreate(input: unknown): Promise<TimeEntryRow> {
  const p = entrySchema.parse(input);
  const identity = getAccessIdentity();
  const row = await getCurrentDb().insertInto('timeEntries').values({
    customerId: p.customerId, employeeId: p.employeeId, staffName: p.staffName ?? identity.name ?? null, workDate: p.workDate, hours: roundHours(p.hours), rateCents: p.rateCents,
    description: p.description, billable: p.billable ? 1 : 0, invoiceId: null, createdBy: identity.name || null,
  }).returningAll().executeTakeFirstOrThrow();
  return mapRow(row);
}

export async function timeEntriesUpdate(input: unknown): Promise<TimeEntryRow> {
  const { id, patch } = updateSchema.parse(input);
  const db = getCurrentDb();
  const existing = await db.selectFrom('timeEntries').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  if (existing.invoiceId !== null) throw new Error('This time has already been invoiced. Reverse the invoice first, or add a new entry.');
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) { if (v === undefined) continue; set[k] = k === 'billable' ? (v ? 1 : 0) : k === 'hours' ? roundHours(v as number) : v; }
  if (Object.keys(set).length > 0) await db.updateTable('timeEntries').set(set).where('id', '=', id).execute();
  return mapRow(await db.selectFrom('timeEntries').selectAll().where('id', '=', id).executeTakeFirstOrThrow());
}

export async function timeEntriesDelete(id: number): Promise<{ deleted: true }> {
  const db = getCurrentDb();
  const existing = await db.selectFrom('timeEntries').selectAll().where('id', '=', z.number().int().positive().parse(id)).executeTakeFirst();
  if (existing?.invoiceId) throw new Error('This time has already been invoiced and cannot be deleted.');
  await db.deleteFrom('timeEntries').where('id', '=', id).execute();
  return { deleted: true };
}

export async function timeEntriesUnbilled(): Promise<UnbilledSummary[]> {
  return unbilledByCustomer(await timeEntriesList({ unbilledOnly: true }));
}

/** Turns a customer's unbilled time (or the chosen entries) into one posted invoice and stamps
 * each entry with the invoice, so it can never be billed twice. Lines group by description and
 * rate with the hours as quantity. */
export async function timeEntriesInvoice(input: unknown): Promise<{ invoiceId: number; invoiceNumber: string; totalCents: number; entries: number }> {
  const p = invoiceSchema.parse(input);
  const db = getCurrentDb();
  let entries = await timeEntriesList({ customerId: p.customerId, unbilledOnly: true });
  if (p.entryIds) entries = entries.filter((e) => p.entryIds!.includes(e.id));
  if (entries.length === 0) throw new Error('No unbilled time for this customer.');
  const lines = invoiceLinesFromTime(entries);
  const revenueAccountId = p.revenueAccountId ?? (await ensureAccountByName(db, 'Service Revenue', 'Revenue', '4000', '8000', 'Revenue'));
  const invoiceDate = p.invoiceDate ?? localIsoDate();
  const customer = await db.selectFrom('customers').selectAll().where('id', '=', p.customerId).executeTakeFirstOrThrow();
  const terms = (customer as { paymentTerms?: string | null }).paymentTerms ?? DEFAULT_PAYMENT_TERM;
  const invoiceNumber = await invoicesNextNumber({ invoiceDate });
  const invoice = await invoicesCreate({
    customerId: p.customerId,
    invoiceNumber,
    invoiceDate,
    dueDate: dueDateFor(invoiceDate, terms as never) ?? invoiceDate,
    memo: `Professional services — ${entries.length} time ${entries.length === 1 ? 'entry' : 'entries'}`,
    paymentTerms: terms as never,
    lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, revenueAccountId, productId: null, taxCode: p.taxCode === undefined ? 'HST' : p.taxCode })),
  });
  await db.updateTable('timeEntries').set({ invoiceId: invoice.id }).where('id', 'in', entries.map((e) => e.id)).execute();
  return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, totalCents: invoice.totalCents, entries: entries.length };
}
