import { app, dialog, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { getCurrentDb } from '../companyFile';
import { getInvoiceById } from '../db/queries';
import { mapContactRow } from '../db/mappers';
import { generateInvoicePdf } from '../forms/generateInvoicePdf';
import { sendEmailWithAttachment } from '../email/sendEmail';
import { companyGet } from './company.handlers';

function safeFileNamePart(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').trim();
}

function suggestedFileName(invoiceNumber: string): string {
  return `Invoice ${safeFileNamePart(invoiceNumber)}.pdf`;
}

async function resolveInvoicePdfBytes(invoiceId: number) {
  const db = getCurrentDb();
  const invoice = await getInvoiceById(db, invoiceId);
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found.`);
  const customerRow = await db.selectFrom('customers').selectAll().where('id', '=', invoice.customerId).executeTakeFirst();
  if (!customerRow) throw new Error(`Customer ${invoice.customerId} not found.`);
  const customer = mapContactRow(customerRow);
  const company = await companyGet();
  const bytes = await generateInvoicePdf(invoice, customer, company);
  return { invoice, customer, bytes };
}

/** Generates the invoice PDF, lets the accountant pick where to save it, then opens it in the
 * OS's default PDF viewer — mirrors formsGeneratePdf's save-dialog-then-open pattern. */
export async function invoicePdfGenerate(window: BrowserWindow, input: unknown) {
  const { invoiceId } = input as { invoiceId: number };
  const { invoice, bytes } = await resolveInvoicePdfBytes(invoiceId);

  const saveResult = await dialog.showSaveDialog(window, {
    title: 'Save Invoice PDF',
    defaultPath: suggestedFileName(invoice.invoiceNumber),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return { saved: false as const };

  fs.writeFileSync(saveResult.filePath, bytes);
  await shell.openPath(saveResult.filePath);
  return { saved: true as const, filePath: saveResult.filePath };
}

/** Composes a real Outlook draft with the invoice PDF already attached (Outlook desktop only —
 * mirrors formsEmailViaOutlook). */
export async function invoicePdfEmailViaOutlook(input: unknown) {
  const { invoiceId } = input as { invoiceId: number };
  const { invoice, customer, bytes } = await resolveInvoicePdfBytes(invoiceId);
  if (!customer.email) throw new Error('This customer has no email address on file — add one in Customers first.');

  const tempPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-${safeFileNamePart(suggestedFileName(invoice.invoiceNumber))}`);
  fs.writeFileSync(tempPath, bytes);

  const subject = `Invoice ${invoice.invoiceNumber}`;
  const body = `Hi ${customer.name},\n\nPlease find attached invoice ${invoice.invoiceNumber}, due ${invoice.dueDate}.\n\nThanks!`;

  try {
    await sendEmailWithAttachment(tempPath, customer.email, subject, body);
    return { sent: true as const };
  } catch (err) {
    throw new Error(
      `Couldn't open Outlook (${err instanceof Error ? err.message : String(err)}). This only works if Outlook desktop is installed — try "Download PDF" and attach it manually instead.`,
    );
  }
}

/** Saves the invoice PDF straight to Downloads (no dialog) — used for the Gmail flow, mirrors
 * formsSaveToDownloads. */
export async function invoicePdfSaveToDownloads(input: unknown) {
  const { invoiceId } = input as { invoiceId: number };
  const { invoice, bytes } = await resolveInvoicePdfBytes(invoiceId);

  const downloadsDir = app.getPath('downloads');
  const filePath = path.join(downloadsDir, suggestedFileName(invoice.invoiceNumber));
  fs.writeFileSync(filePath, bytes);
  return { filePath };
}
