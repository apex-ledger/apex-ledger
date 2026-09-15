import { app, dialog, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { getCurrentDb } from '../companyFile';
import { getSalesReceiptById } from '../db/queries';
import { mapContactRow } from '../db/mappers';
import { generateSalesReceiptPdf } from '../forms/generateSalesReceiptPdf';
import { sendEmailWithAttachment, sendPlatformEmailWithAttachment } from '../email/sendEmail';
import { companyGet } from './company.handlers';

function safeFileNamePart(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').trim();
}

function suggestedFileName(receiptNumber: string): string {
  return `Sales Receipt ${safeFileNamePart(receiptNumber)}.pdf`;
}

async function resolveSalesReceiptPdfBytes(salesReceiptId: number) {
  const db = getCurrentDb();
  const receipt = await getSalesReceiptById(db, salesReceiptId);
  if (!receipt) throw new Error(`Sales receipt ${salesReceiptId} not found.`);
  const customerRow = await db.selectFrom('customers').selectAll().where('id', '=', receipt.customerId).executeTakeFirst();
  if (!customerRow) throw new Error(`Customer ${receipt.customerId} not found.`);
  const customer = mapContactRow(customerRow);
  const depositAccount = await db.selectFrom('accounts').select('name').where('id', '=', receipt.depositToAccountId).executeTakeFirst();
  const company = await companyGet();
  const bytes = await generateSalesReceiptPdf(receipt, customer, company, depositAccount?.name ?? 'Undeposited Funds');
  return { receipt, customer, bytes };
}

/** The receipt PDF itself, base64 over the wire, so the renderer can put it straight into a print
 * dialog without a download-and-find-it step. Mirrors invoicePdfBytes. */
export async function salesReceiptPdfBytes(input: unknown) {
  const { salesReceiptId } = input as { salesReceiptId: number };
  const { receipt, bytes } = await resolveSalesReceiptPdfBytes(salesReceiptId);
  return { fileName: suggestedFileName(receipt.receiptNumber), base64: Buffer.from(bytes).toString('base64') };
}

/** Sends the receipt out through the platform's own mail relay — no Outlook required, so it works
 * the same in the web app as on desktop. Mirrors invoicePdfSendDirect. */
export async function salesReceiptPdfSendDirect(input: unknown) {
  const { salesReceiptId, to, subject, body, replyTo } = input as { salesReceiptId: number; to: string; subject: string; body: string; replyTo?: string };
  if (!to || !to.trim()) throw new Error('Enter an email address to send to.');
  const { receipt, bytes } = await resolveSalesReceiptPdfBytes(salesReceiptId);

  const tempPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-${safeFileNamePart(suggestedFileName(receipt.receiptNumber))}`);
  fs.writeFileSync(tempPath, bytes);
  await sendPlatformEmailWithAttachment(tempPath, to.trim(), subject, body, replyTo);
  return { sent: true as const };
}

/** Generates the sales receipt PDF, lets the accountant pick where to save it, then opens it in the
 * OS's default PDF viewer — mirrors invoicePdfGenerate's save-dialog-then-open pattern. */
export async function salesReceiptPdfGenerate(window: BrowserWindow, input: unknown) {
  const { salesReceiptId } = input as { salesReceiptId: number };
  const { receipt, bytes } = await resolveSalesReceiptPdfBytes(salesReceiptId);

  const saveResult = await dialog.showSaveDialog(window, {
    title: 'Save Sales Receipt PDF',
    defaultPath: suggestedFileName(receipt.receiptNumber),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return { saved: false as const };

  fs.writeFileSync(saveResult.filePath, bytes);
  await shell.openPath(saveResult.filePath);
  return { saved: true as const, filePath: saveResult.filePath };
}

/** Composes a real Outlook draft with the sales receipt PDF already attached (Outlook desktop
 * only — mirrors invoicePdfEmailViaOutlook). */
export async function salesReceiptPdfEmailViaOutlook(input: unknown) {
  const { salesReceiptId } = input as { salesReceiptId: number };
  const { receipt, customer, bytes } = await resolveSalesReceiptPdfBytes(salesReceiptId);
  if (!customer.email) throw new Error('This customer has no email address on file — add one in Customers first.');

  const tempPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-${safeFileNamePart(suggestedFileName(receipt.receiptNumber))}`);
  fs.writeFileSync(tempPath, bytes);

  const subject = `Sales Receipt ${receipt.receiptNumber}`;
  const body = `Hi ${customer.name},\n\nPlease find attached sales receipt ${receipt.receiptNumber} — payment received in full.\n\nThanks!`;

  try {
    await sendEmailWithAttachment(tempPath, customer.email, subject, body);
    return { sent: true as const };
  } catch (err) {
    throw new Error(
      `Couldn't open Outlook (${err instanceof Error ? err.message : String(err)}). This only works if Outlook desktop is installed — try "Download PDF" and attach it manually instead.`,
    );
  }
}

/** Saves the sales receipt PDF straight to Downloads (no dialog) — used for the Gmail/WhatsApp
 * flows, mirrors invoicePdfSaveToDownloads. */
export async function salesReceiptPdfSaveToDownloads(input: unknown) {
  const { salesReceiptId } = input as { salesReceiptId: number };
  const { receipt, bytes } = await resolveSalesReceiptPdfBytes(salesReceiptId);

  const downloadsDir = app.getPath('downloads');
  const filePath = path.join(downloadsDir, suggestedFileName(receipt.receiptNumber));
  fs.writeFileSync(filePath, bytes);
  return { filePath };
}
