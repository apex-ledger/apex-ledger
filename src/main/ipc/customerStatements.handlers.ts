import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { dialog, shell, type BrowserWindow } from 'electron';
import { z } from 'zod';
import { getCurrentDb } from '../companyFile';
import { getAllInvoices } from '../db/queries';
import { sendEmailWithAttachment } from '../email/sendEmail';
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

/** One PDF per customer into a folder the user picks. Opens the folder when done. */
export async function customerStatementsSaveAll(window: BrowserWindow, input: unknown) {
  const { customerIds } = idsSchema.parse(input);
  const picked = await dialog.showOpenDialog(window, { title: 'Choose a folder for the statements', properties: ['openDirectory', 'createDirectory'] });
  if (picked.canceled || picked.filePaths.length === 0) return { saved: false as const };
  const folder = picked.filePaths[0];
  const stamp = new Date().toISOString().slice(0, 10);
  let count = 0;
  for (const customerId of customerIds) {
    const preview = await paymentRemindersPreview({ customerId });
    if (!preview) continue;
    const bytes = await statementPdfFor(preview);
    fs.writeFileSync(path.join(folder, `Statement ${stamp} - ${safeName(preview.customerName)}.pdf`), bytes);
    count += 1;
  }
  await recordUserActivity('customerStatements', { name: `${count} statements saved` });
  await shell.openPath(folder);
  return { saved: true as const, folder, count };
}

function statementEmail(preview: ReminderPreview, companyName: string): { subject: string; body: string } {
  const overdue = preview.overdueCents > 0 ? ` Of that, ${formatDollars(preview.overdueCents)} is past its due date.` : '';
  return {
    subject: `Statement of account — ${companyName}`,
    body: `Hi ${preview.customerName},\n\nAttached is your statement of account as at ${new Date().toISOString().slice(0, 10)}. The balance outstanding is ${formatDollars(preview.totalCents)}.${overdue}\n\nIf you have already sent payment, thank you — please disregard this note. Otherwise, please quote the invoice number with your payment.\n\nRegards,\n${companyName}`,
  };
}

/** Opens Outlook with the statement attached, addressed and written; the person presses Send. */
export async function customerStatementsEmail(input: unknown) {
  const { customerId } = z.object({ customerId: z.number().int().positive() }).parse(input);
  const preview = await paymentRemindersPreview({ customerId });
  if (!preview) throw new Error('This customer has nothing outstanding.');
  if (!preview.customerEmail) throw new Error('This customer has no email address on file — add one on the customer record first.');
  const company = await companyGet();
  const { subject, body } = statementEmail(preview, company.displayName || company.legalName);
  const bytes = await statementPdfFor(preview);
  const tempPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-Statement-${safeName(preview.customerName)}.pdf`);
  fs.writeFileSync(tempPath, bytes);
  try {
    await sendEmailWithAttachment(tempPath, preview.customerEmail, subject, body);
  } catch (err) {
    throw new Error(`Email could not be sent (${err instanceof Error ? err.message : String(err)}).`);
  }
  await recordUserActivity('customerStatements', { name: preview.customerName });
  return { opened: true as const, totalCents: preview.totalCents };
}
