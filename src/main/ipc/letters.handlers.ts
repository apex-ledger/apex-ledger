import type { BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { findLetterTemplate, LETTER_TEMPLATES, missingLetterFields, renderLetter, type LetterFieldKey } from '@shared/domain/letters/letterTemplates';
import { generateLetterPdf } from '../forms/generateLetterPdf';
import { safeFileNamePart, savePdfAndOpen } from '../forms/savePdfAndOpen';
import { sendPlatformEmailWithAttachment } from '../email/sendEmail';

const generateLetterSchema = z.object({
  templateId: z.string().trim().min(1),
  values: z.record(z.string().trim().max(500)),
});

export async function lettersList() {
  // Sent to the renderer as plain data so the picker doesn't need to import the domain module.
  return LETTER_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    standard: t.standard,
    fields: t.fields,
    practitionerReviewRequired: t.practitionerReviewRequired,
  }));
}

/**
 * Lays out a letter. A saved draft carries a footer saying what is outstanding — practitioner review,
 * blanks left — so an unfinished draft can't quietly pass for a final signed document. The issued
 * letter (the one that leaves by email) has no draft footer: it is only sent once every field is
 * filled and, for a letter carrying professional responsibility, the practitioner confirms review.
 */
function buildLetter(templateId: string, values: Record<string, string>, issued: boolean) {
  const template = findLetterTemplate(templateId);
  if (!template) throw new Error(`Unknown letter template: ${templateId}`);

  const typedValues = values as Partial<Record<LetterFieldKey, string>>;
  const paragraphs = renderLetter(template, typedValues);
  const blanks = missingLetterFields(template, typedValues);

  const footerParts: string[] = [];
  if (!issued) {
    if (template.practitionerReviewRequired) footerParts.push('Draft for practitioner review — confirm wording and responsibilities before issuing.');
    if (blanks.length > 0) footerParts.push(`${blanks.length} field${blanks.length === 1 ? '' : 's'} left blank.`);
  }
  const client = typedValues.clientName ? safeFileNamePart(typedValues.clientName) : 'Client';
  return {
    template,
    paragraphs,
    blanks,
    footer: footerParts.length > 0 ? footerParts.join('  ') : null,
    fileName: `${safeFileNamePart(template.name)}-${client}.pdf`,
    clientName: typedValues.clientName,
    firmName: typedValues.firmName,
  };
}

export async function lettersGenerate(window: BrowserWindow, input: unknown) {
  const { templateId, values } = generateLetterSchema.parse(input);
  const letter = buildLetter(templateId, values, false);
  const bytes = await generateLetterPdf(letter.template.name, letter.paragraphs, letter.footer);
  return savePdfAndOpen(window, `Save ${letter.template.name}`, letter.fileName, bytes);
}

/** The covering note for a letter's send box. */
export async function lettersEmailDefaults(input: unknown) {
  const { templateId, values } = generateLetterSchema.parse(input);
  const letter = buildLetter(templateId, values, true);
  const ask = letter.template.practitionerReviewRequired ? ', and sign and return it where indicated' : '';
  return {
    subject: letter.template.name,
    body: `Hi ${letter.clientName || 'there'},\n\nAttached is the ${letter.template.name}. Please read it and reply with any questions${ask}.\n\nRegards,${letter.firmName ? `\n${letter.firmName}` : ''}`,
  };
}

const sendLetterSchema = generateLetterSchema.extend({
  to: z.string().trim().min(1, 'Enter an email address to send to.'),
  subject: z.string().max(300),
  body: z.string().max(20_000),
  replyTo: z.string().trim().optional(),
  reviewedConfirmed: z.boolean().optional(),
});

export const LETTER_REVIEW_REFUSAL = 'Confirm you have reviewed the letter and take responsibility for its wording before it is issued by email.';

/** Emails the issued letter through the platform relay. Refused while fields are still blank and —
 * for a letter carrying professional responsibility — until the practitioner confirms they reviewed
 * it. Checked here, not only on the screen. */
export async function lettersSendDirect(input: unknown) {
  const { templateId, values, to, subject, body, replyTo, reviewedConfirmed } = sendLetterSchema.parse(input);
  const letter = buildLetter(templateId, values, true);
  if (letter.blanks.length > 0) {
    throw new Error(`Fill in every field before emailing the letter — ${letter.blanks.length} still blank.`);
  }
  if (letter.template.practitionerReviewRequired && !reviewedConfirmed) throw new Error(LETTER_REVIEW_REFUSAL);
  const bytes = await generateLetterPdf(letter.template.name, letter.paragraphs, null);
  const tempPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-${letter.fileName}`);
  fs.writeFileSync(tempPath, bytes);
  try {
    await sendPlatformEmailWithAttachment(tempPath, to, subject, body, replyTo);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
  return { sent: true as const };
}
