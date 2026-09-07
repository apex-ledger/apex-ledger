import type { BrowserWindow } from 'electron';
import { z } from 'zod';
import { findLetterTemplate, LETTER_TEMPLATES, missingLetterFields, renderLetter, type LetterFieldKey } from '@shared/domain/letters/letterTemplates';
import { generateLetterPdf } from '../forms/generateLetterPdf';
import { safeFileNamePart, savePdfAndOpen } from '../forms/savePdfAndOpen';

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

export async function lettersGenerate(window: BrowserWindow, input: unknown) {
  const { templateId, values } = generateLetterSchema.parse(input);
  const template = findLetterTemplate(templateId);
  if (!template) throw new Error(`Unknown letter template: ${templateId}`);

  const typedValues = values as Partial<Record<LetterFieldKey, string>>;
  const paragraphs = renderLetter(template, typedValues);
  const blanks = missingLetterFields(template, typedValues);

  // A letter carrying professional responsibility gets a standing footer; blanks left unfilled are
  // called out there too, so an unfinished draft can't quietly pass for a final signed document.
  const footerParts: string[] = [];
  if (template.practitionerReviewRequired) footerParts.push('Draft for practitioner review — confirm wording and responsibilities before issuing.');
  if (blanks.length > 0) footerParts.push(`${blanks.length} field${blanks.length === 1 ? '' : 's'} left blank.`);

  const bytes = await generateLetterPdf(template.name, paragraphs, footerParts.length > 0 ? footerParts.join('  ') : null);
  const client = typedValues.clientName ? safeFileNamePart(typedValues.clientName) : 'Client';
  return savePdfAndOpen(window, `Save ${template.name}`, `${safeFileNamePart(template.name)}-${client}.pdf`, bytes);
}
