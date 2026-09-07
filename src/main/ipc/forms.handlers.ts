import { app, dialog, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { getFormTemplate, type FormTemplate } from '@shared/domain/forms/formTemplates';
import { generateFormPdf } from '../forms/generateFormPdf';
import { sendEmailWithAttachment } from '../email/sendEmail';

function safeFileNamePart(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').trim();
}

function suggestedFileName(template: FormTemplate, clientName?: string | null): string {
  return clientName ? `${safeFileNamePart(template.title)} - ${safeFileNamePart(clientName)}.pdf` : `${safeFileNamePart(template.title)}.pdf`;
}

async function resolveTemplateAndBytes(formId: string, clientName?: string | null) {
  const template = getFormTemplate(formId);
  if (!template) throw new Error(`Unknown form: ${formId}`);
  const bytes = await generateFormPdf(template, clientName ?? undefined);
  return { template, bytes };
}

/** Generates a fillable PDF for the given form template, lets the accountant pick where to save
 * it, then opens it in the OS's default PDF viewer so it's immediately ready to fill or forward. */
export async function formsGeneratePdf(window: BrowserWindow, input: unknown) {
  const { formId, clientName } = input as { formId: string; clientName?: string | null };
  const { template, bytes } = await resolveTemplateAndBytes(formId, clientName);

  const saveResult = await dialog.showSaveDialog(window, {
    title: 'Save Fillable Form',
    defaultPath: suggestedFileName(template, clientName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return { saved: false as const };

  fs.writeFileSync(saveResult.filePath, bytes);
  await shell.openPath(saveResult.filePath);
  return { saved: true as const, filePath: saveResult.filePath };
}

/** Composes a real Outlook draft with the PDF already attached (Outlook desktop only — the user
 * still clicks Send themselves). This is the one email path that can genuinely auto-attach the
 * file, since Outlook exposes COM automation; web clients like Gmail have no equivalent. */
export async function formsEmailViaOutlook(input: unknown) {
  const { formId, clientName, clientEmail } = input as { formId: string; clientName: string; clientEmail: string };
  const { template, bytes } = await resolveTemplateAndBytes(formId, clientName);

  const tempPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-${safeFileNamePart(suggestedFileName(template, clientName))}`);
  fs.writeFileSync(tempPath, bytes);

  const subject = `${template.title} — please complete`;
  const body = `Hi ${clientName},\n\nAttached is the "${template.title}" — please fill it out and send it back when you have a chance.\n\nThanks!`;

  try {
    await sendEmailWithAttachment(tempPath, clientEmail, subject, body);
    return { sent: true as const };
  } catch (err) {
    throw new Error(
      `Couldn't open Outlook (${err instanceof Error ? err.message : String(err)}). This only works if Outlook desktop is installed — try "Download PDF" and attach it manually instead.`,
    );
  }
}

/** Saves the PDF straight to the Downloads folder (no dialog) and returns its path — used for the
 * Gmail flow, where the compose window opens pre-filled in the browser and the user drags this
 * file in themselves, since no web email client can be auto-attached to from outside the browser. */
export async function formsSaveToDownloads(input: unknown) {
  const { formId, clientName } = input as { formId: string; clientName?: string | null };
  const { template, bytes } = await resolveTemplateAndBytes(formId, clientName);

  const downloadsDir = app.getPath('downloads');
  const filePath = path.join(downloadsDir, suggestedFileName(template, clientName));
  fs.writeFileSync(filePath, bytes);
  return { filePath };
}
