import { z } from 'zod';
import { DEFAULT_PAYMENT_TERM, dueDateFor } from '@shared/domain/contacts/paymentTerms';

/** Mirrors the private list in shared/validation/schemas.ts. */
const TAX_CODES = ['HST',
  'NonHST',
  'Manual',
  'USTax',
  'MealsHST',
  'GST',
  'HST_NS',
  'HST_15',
  'GST_PST_BC',
  'GST_PST_SK',
  'GST_RST_MB',
  'GST_QST_QC',
  'GST_QST_QC_NR',] as const;
const PAYMENT_TERM_VALUES = ['dueOnReceipt', 'net7', 'net15', 'net30', 'net45', 'net60', 'net90', 'custom'] as const;
import { advanceDate, dueTemplates, invoicePayloadFromTemplate, type RecurringFrequency, type RecurringInvoiceLine, type RecurringInvoiceTemplate } from '@shared/domain/sales/recurringInvoices';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { getCurrentDb } from '../companyFile';
import { getAccessIdentity } from '../accessSession';
import { invoicesCreate, invoicesNextNumber } from './invoices.handlers';
import { invoicePdfEmailViaOutlook } from './invoicePdf.handlers';

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannually', 'annually'] as const;
const lineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().min(0),
  revenueAccountId: z.number().int().positive(),
  productId: z.number().int().positive().nullable().optional().default(null),
  taxCode: z.enum(TAX_CODES).nullable().optional().default(null),
});
const templateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  customerId: z.number().int().positive(),
  frequency: z.enum(FREQUENCIES),
  nextDate: ISO_DATE,
  endDate: ISO_DATE.nullable().optional().default(null),
  paymentTerms: z.enum(PAYMENT_TERM_VALUES).nullable().optional().default(null),
  memo: z.string().trim().max(500).nullable().optional().default(null),
  customerPoNumber: z.string().trim().max(100).nullable().optional().default(null),
  autoEmail: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  lines: z.array(lineSchema).min(1),
});
const updateSchema = z.object({ id: z.number().int().positive(), patch: templateSchema.partial() });

function mapRow(row: { id: number; name: string; customerId: number; frequency: string; nextDate: string; endDate: string | null; paymentTerms: string | null; memo: string | null; customerPoNumber: string | null; autoEmail: number; isActive: number; linesJson: string; lastGeneratedDate: string | null }): RecurringInvoiceTemplate {
  return {
    id: row.id,
    name: row.name,
    customerId: row.customerId,
    frequency: row.frequency as RecurringFrequency,
    nextDate: row.nextDate,
    endDate: row.endDate,
    paymentTerms: (row.paymentTerms ?? null) as RecurringInvoiceTemplate['paymentTerms'],
    memo: row.memo,
    customerPoNumber: row.customerPoNumber,
    autoEmail: Boolean(row.autoEmail),
    isActive: Boolean(row.isActive),
    lines: JSON.parse(row.linesJson) as RecurringInvoiceLine[],
    lastGeneratedDate: row.lastGeneratedDate,
  };
}

export async function recurringInvoicesList(): Promise<RecurringInvoiceTemplate[]> {
  const rows = await getCurrentDb().selectFrom('recurringInvoices').selectAll().orderBy('nextDate').orderBy('id').execute();
  return rows.map(mapRow);
}

export async function recurringInvoicesCreate(input: unknown): Promise<RecurringInvoiceTemplate> {
  const payload = templateSchema.parse(input);
  const row = await getCurrentDb().insertInto('recurringInvoices').values({
    name: payload.name, customerId: payload.customerId, frequency: payload.frequency, nextDate: payload.nextDate, endDate: payload.endDate,
    paymentTerms: payload.paymentTerms, memo: payload.memo, customerPoNumber: payload.customerPoNumber, autoEmail: payload.autoEmail ? 1 : 0,
    isActive: payload.isActive ? 1 : 0, linesJson: JSON.stringify(payload.lines), lastGeneratedDate: null, createdBy: getAccessIdentity().name || null,
  }).returningAll().executeTakeFirstOrThrow();
  return mapRow(row);
}

export async function recurringInvoicesUpdate(input: unknown): Promise<RecurringInvoiceTemplate> {
  const { id, patch } = updateSchema.parse(input);
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === 'lines') set.linesJson = JSON.stringify(value);
    else if (key === 'autoEmail' || key === 'isActive') set[key] = value ? 1 : 0;
    else set[key] = value;
  }
  const db = getCurrentDb();
  if (Object.keys(set).length > 0) await db.updateTable('recurringInvoices').set(set).where('id', '=', id).execute();
  const row = await db.selectFrom('recurringInvoices').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  return mapRow(row);
}

export async function recurringInvoicesDelete(id: number): Promise<{ deleted: true }> {
  await getCurrentDb().deleteFrom('recurringInvoices').where('id', '=', z.number().int().positive().parse(id)).execute();
  return { deleted: true };
}

/** Templates due today or earlier — what the dashboard counts and Generate acts on. */
export async function recurringInvoicesDue(): Promise<RecurringInvoiceTemplate[]> {
  return dueTemplates(await recurringInvoicesList(), localIsoDate());
}

export interface GeneratedRecurringInvoice { templateId: number; templateName: string; invoiceId: number; invoiceNumber: string; totalCents: number; emailed: boolean; emailError: string | null }

/** Creates one real invoice per due template, dated the template's next date, and moves that
 * date forward. A template that is several periods behind catches up one period per run — so
 * a missed month produces one invoice, not a pile, and the reviewer sees each. Templates with
 * auto-email open Outlook with the invoice attached; a failure there never undoes the invoice. */
export async function recurringInvoicesGenerateDue(input?: unknown): Promise<GeneratedRecurringInvoice[]> {
  const { templateIds } = z.object({ templateIds: z.array(z.number().int().positive()).optional() }).parse(input ?? {});
  const db = getCurrentDb();
  const today = localIsoDate();
  let due = await recurringInvoicesDue();
  if (templateIds) due = due.filter((t) => templateIds.includes(t.id));
  const results: GeneratedRecurringInvoice[] = [];
  for (const template of due) {
    const invoiceDate = template.nextDate;
    const invoiceNumber = await invoicesNextNumber({ invoiceDate });
    const dueDate = dueDateFor(invoiceDate, template.paymentTerms ?? DEFAULT_PAYMENT_TERM) ?? invoiceDate;
    const invoice = await invoicesCreate(invoicePayloadFromTemplate(template, invoiceDate, invoiceNumber, dueDate));
    const anchorDay = Number(template.nextDate.slice(8, 10));
    await db.updateTable('recurringInvoices').set({ nextDate: advanceDate(template.nextDate, template.frequency, anchorDay), lastGeneratedDate: today }).where('id', '=', template.id).execute();
    let emailed = false; let emailError: string | null = null;
    if (template.autoEmail) {
      try { await invoicePdfEmailViaOutlook({ invoiceId: invoice.id }); emailed = true; } catch (err) { emailError = err instanceof Error ? err.message : String(err); }
    }
    results.push({ templateId: template.id, templateName: template.name, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, totalCents: invoice.totalCents, emailed, emailError });
  }
  return results;
}
