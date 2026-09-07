import { dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { appSettingsForRenderer, readAppSettings, storeSmtpPassword, writeAppSettings, type EmailSettings } from '../appSettings';
import { sendEmailWithAttachment } from '../email/sendEmail';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const emailSchema = z.object({
  mode: z.enum(['outlook', 'smtp']),
  host: z.string().trim().max(200),
  port: z.number().int().min(1).max(65535),
  security: z.enum(['starttls', 'tls']),
  user: z.string().trim().max(200),
  fromName: z.string().trim().max(120),
  fromAddress: z.string().trim().max(200),
});
const saveSchema = z.object({
  secondaryBackupFolder: z.string().nullable(),
  email: emailSchema,
  smtpPassword: z.string().max(500).optional(),
});

export async function appSettingsGet() {
  return appSettingsForRenderer();
}

export async function appSettingsSave(input: unknown) {
  const payload = saveSchema.parse(input);
  if (payload.secondaryBackupFolder && !fs.existsSync(payload.secondaryBackupFolder)) throw new Error(`The folder ${payload.secondaryBackupFolder} does not exist.`);
  const current = readAppSettings();
  writeAppSettings({ ...current, secondaryBackupFolder: payload.secondaryBackupFolder, email: payload.email as EmailSettings });
  if (payload.smtpPassword !== undefined && payload.smtpPassword !== '') storeSmtpPassword(payload.smtpPassword);
  return appSettingsForRenderer();
}

export async function appSettingsPickBackupFolder(window: BrowserWindow): Promise<{ picked: false } | { picked: true; folder: string }> {
  const result = await dialog.showOpenDialog(window, { title: 'Folder for the second copy of every backup', properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return { picked: false };
  return { picked: true, folder: result.filePaths[0] };
}

/** A one-page PDF so the test proves attachments arrive, not only text. */
export async function appSettingsSendTestEmail(input: unknown) {
  const { to } = z.object({ to: z.string().trim().email() }).parse(input);
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Apex Ledger test message — attachments work.', { x: 50, y: 720, size: 14, font });
  const tempPath = path.join(os.tmpdir(), `apex-ledger-test-${Date.now()}.pdf`);
  fs.writeFileSync(tempPath, await doc.save());
  return sendEmailWithAttachment(tempPath, to, 'Apex Ledger — test message', 'This is a test from Apex Ledger. If you can read this and open the attachment, email is set up correctly.');
}
