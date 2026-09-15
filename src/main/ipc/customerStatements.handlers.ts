import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { app } from 'electron';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';
import { getCurrentDb } from '../companyFile';
import { getAllInvoices } from '../db/queries';
import { sendPlatformEmailWithAttachment } from '../email/sendEmail';
import { companyGet } from './company.handlers';
import { paymentRemindersPreview, statementPdfFor, type ReminderPreview } from './paymentReminders.handlers';
import { recordUserActivity } from '../userActivity';
import { formatDollars } from '@shared/domain/sales/paymentReminders';

/**
 * Month-end statements for every customer with a balance, in one go.
 *
 * The statement itself is the one the payment reminder attaches — every open invoice, days
 * overdue, total — so a customer who gets a reminder and a statement sees the same figures. What
 * differs is the covering note: a statement is routine, a reminder is a nudge.
 */
export interface StatementRow {
  customerId: number;
  customerName: string;
  customerEmail: string | null;
  openInvoices: number;
  totalCents: number;
  overdueCents: number;
}

export async function customerStatementsList(): Promise<StatementRow[]> {
  const db = getCurrentDb();
  const [customers, invoices] = await Promise.all([db.selectFrom('customers').selectAll().where('isActive', '=', 1).execute(), getAllInvoices(db)]);
  const rows: StatementRow[] = [];
  for (const customer of customers) {
    const open = invoices.filter((inv) => inv.customerId === customer.id && inv.balanceDueCents > 0);
    if (open.length === 0) continue;
    const preview = await paymentRemindersPreview({ customerId: customer.id });
    rows.push({ customerId: customer.id, customerName: customer.name, customerEmail: customer.email, openInvoices: open.length, totalCents: open.reduce((s, i) => s + i.balanceDueCents, 0), overdueCents: preview?.overdueCents ?? 0 });
  }
  return rows.sort((a, b) => a.customerName.localeCompare(b.customerName));
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const idsSchema = z.object({ customerIds: z.array(z.number().int().positive()).min(1) });

function statementEmail(preview: ReminderPreview, companyName: string): { subject: string; body: string } {
  const overdue = preview.overdueCents > 0 ? ` Of that, ${formatDollars(preview.overdueCents)} is past its due date.` : '';
  return {
    subject: `Statement of account — ${companyName}`,
    body: `Hi ${preview.customerName},\n\nAttached is your statement of account as at ${new Date().toISOString().slice(0, 10)}. The balance outstanding is ${formatDollars(preview.totalCents)}.${overdue}\n\nIf you have already sent payment, thank you — please disregard this note. Otherwise, please quote the invoice number with your payment.\n\nRegards,\n${companyName}`,
  };
}

/** The covering note and addressee for one customer's statement, for the send box to start from. */
export async function customerStatementsEmailDefaults(input: unknown) {
  const { customerId } = z.object({ customerId: z.number().int().positive() }).parse(input);
  const preview = await paymentRemindersPreview({ customerId });
  if (!preview) throw new Error('This customer has nothing outstanding.');
  const company = await companyGet();
  return { to: preview.customerEmail, ...statementEmail(preview, company.displayName || company.legalName) };
}

const sendSchema = z.object({
  customerId: z.number().int().positive(),
  to: z.string().trim().min(1, 'Enter an email address to send to.'),
  subject: z.string().max(300),
  body: z.string().max(20_000),
  replyTo: z.string().trim().optional(),
});

async function sendStatement(customerId: number, to: string, subject: string, body: string, replyTo?: string) {
  const preview = await paymentRemindersPreview({ customerId });
  if (!preview) throw new Error('This customer has nothing outstanding.');
  const bytes = await statementPdfFor(preview);
  const tempPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-Statement-${safeName(preview.customerName)}.pdf`);
  fs.writeFileSync(tempPath, bytes);
  await sendPlatformEmailWithAttachment(tempPath, to, subject, body, replyTo);
  await recordUserActivity('customerStatements', { name: preview.customerName });
  return preview;
}

/** Sends one customer's statement through the platform's mail relay — works in the web app, where
 * there is no Outlook — with whatever wording was settled in the send box. */
export async function customerStatementsSendDirect(input: unknown) {
  const { customerId, to, subject, body, replyTo } = sendSchema.parse(input);
  const preview = await sendStatement(customerId, to, subject, body, replyTo);
  return { sent: true as const, totalCents: preview.totalCents };
}

/** Month-end in one go: every selected customer with an email address gets their statement with the
 * standard covering note. Each is sent on its own, so one bad address does not stop the rest, and the
 * result says exactly who was sent, who was skipped for having no address, and who failed and why. */
export async function customerStatementsSendAll(input: unknown) {
  const { customerIds, replyTo } = idsSchema.extend({ replyTo: z.string().trim().optional() }).parse(input);
  const company = await companyGet();
  const companyName = company.displayName || company.legalName;
  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ customerName: string; error: string }> = [];
  for (const customerId of customerIds) {
    const preview = await paymentRemindersPreview({ customerId });
    if (!preview) continue;
    if (!preview.customerEmail) { skipped.push(preview.customerName); continue; }
    const { subject, body } = statementEmail(preview, companyName);
    try {
      await sendStatement(customerId, preview.customerEmail, subject, body, replyTo);
      sent.push(preview.customerName);
    } catch (err) {
      failed.push({ customerName: preview.customerName, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { sent, skipped, failed };
}

/** Every selected statement in one PDF, a page (or more) per customer, saved to Downloads. One file
 * prints as one job, and — unlike saving into a chosen folder — it reaches the browser as a
 * download in the web app, where a folder cannot be picked. */
export async function customerStatementsSaveCombined(input: unknown) {
  const { customerIds } = idsSchema.parse(input);
  const combined = await PDFDocument.create();
  let count = 0;
  for (const customerId of customerIds) {
    const preview = await paymentRemindersPreview({ customerId });
    if (!preview) continue;
    const single = await PDFDocument.load(await statementPdfFor(preview));
    const pages = await combined.copyPages(single, single.getPageIndices());
    for (const page of pages) combined.addPage(page);
    count += 1;
  }
  if (count === 0) throw new Error('None of the selected customers has anything outstanding.');
  const filePath = path.join(app.getPath('downloads'), `Statements ${new Date().toISOString().slice(0, 10)} (${count}).pdf`);
  fs.writeFileSync(filePath, await combined.save());
  await recordUserActivity('customerStatements', { name: `${count} statements saved as one PDF` });
  return { filePath, count };
}
