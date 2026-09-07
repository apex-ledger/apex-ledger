import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { FormTemplate } from '@shared/domain/forms/formTemplates';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const HEADER_HEIGHT = 70;

// PJ InsureTax brand palette (matches tailwind.config.js brand/gold scales) — kept here rather
// than shared, since pdf-lib needs plain 0–1 rgb() values, not Tailwind's hex tokens.
const BRAND_900 = rgb(0.0824, 0.2588, 0.1686); // #15422b
const BRAND_700 = rgb(0.1098, 0.3882, 0.2353); // #1c633c
const BRAND_50 = rgb(0.9412, 0.9804, 0.9529); // #f0faf3
const GOLD_400 = rgb(0.8745, 0.6627, 0.1922); // #dfa931
const GOLD_50 = rgb(0.9922, 0.9725, 0.9255); // #fdf8ec
const GOLD_700 = rgb(0.5294, 0.3294, 0.0902); // #875417
const WHITE = rgb(1, 1, 1);
const TEXT_DARK = rgb(0.15, 0.15, 0.15);
const TEXT_MUTED = rgb(0.4, 0.4, 0.4);
const BORDER = rgb(0.75, 0.78, 0.75);

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Lays out a FormTemplate as a genuinely fillable PDF (real AcroForm text fields and checkboxes,
 * not just a printable worksheet) — every field/table cell is a live form field the client can
 * type into in any PDF reader. Styled with the app's own brand colors (green header band, gold
 * section accents, a warm tinted page background) rather than plain black-on-white.
 */
export async function generateFormPdf(template: FormTemplate, clientName?: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const form = pdfDoc.getForm();

  let page!: PDFPage;
  let y!: number;
  let pageNumber = 0;

  function newPage() {
    pageNumber += 1;
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    // Tinted page background, drawn first so every element after it layers on top.
    page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: BRAND_50 });
    if (pageNumber === 1) {
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_HEIGHT, width: PAGE_WIDTH, height: HEADER_HEIGHT, color: BRAND_900 });
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_HEIGHT - 4, width: PAGE_WIDTH, height: 4, color: GOLD_400 });
      y = PAGE_HEIGHT - HEADER_HEIGHT + HEADER_HEIGHT - 26;
    } else {
      // Continuation pages get a slim gold rule + small title instead of the full band.
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 4, width: PAGE_WIDTH, height: 4, color: GOLD_400 });
      page.drawText(template.title, { x: MARGIN, y: PAGE_HEIGHT - 26, size: 10, font: boldFont, color: BRAND_700 });
      y = PAGE_HEIGHT - 46;
    }
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) newPage();
  }

  newPage();

  function drawTitle() {
    page.drawText(template.title, { x: MARGIN, y, size: 18, font: boldFont, color: WHITE });
    if (clientName) {
      page.drawText(`Prepared for: ${clientName}`, { x: MARGIN, y: y - 18, size: 10, font, color: rgb(0.85, 0.93, 0.87) });
    }
    y = PAGE_HEIGHT - HEADER_HEIGHT - 22;

    page.drawText('Date: _______________________', { x: MARGIN, y, size: 10, font, color: TEXT_MUTED });
    y -= 14;
    for (const line of wrapText(template.description, font, 9, CONTENT_WIDTH)) {
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: TEXT_MUTED });
      y -= 11;
    }
    y -= 12;
  }

  function drawSectionTitle(title: string) {
    ensureSpace(34);
    page.drawRectangle({ x: MARGIN, y: y - 16, width: CONTENT_WIDTH, height: 20, color: GOLD_50 });
    page.drawRectangle({ x: MARGIN, y: y - 16, width: 3, height: 20, color: BRAND_700 });
    page.drawText(title, { x: MARGIN + 10, y: y - 10, size: 10.5, font: boldFont, color: GOLD_700 });
    y -= 30;
  }

  let fieldCounter = 0;
  function uniqueName(base: string): string {
    fieldCounter += 1;
    return `${base}_${fieldCounter}`;
  }

  function drawParagraph(text: string) {
    const lines = wrapText(text, font, 10, CONTENT_WIDTH);
    ensureSpace(lines.length * 13 + 6);
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y, size: 10, font, color: TEXT_DARK });
      y -= 13;
    }
    y -= 6;
  }

  function drawField(name: string, label: string, type: 'text' | 'checkbox' | 'longtext') {
    if (type === 'checkbox') {
      ensureSpace(20);
      const cb = form.createCheckBox(uniqueName(name));
      cb.addToPage(page, { x: MARGIN, y: y - 10, width: 12, height: 12, borderColor: BRAND_700, borderWidth: 1 });
      page.drawText(label, { x: MARGIN + 18, y: y - 9, size: 10, font, color: TEXT_DARK });
      y -= 22;
      return;
    }

    const fieldHeight = type === 'longtext' ? 50 : 18;
    ensureSpace(12 + fieldHeight + 8);
    page.drawText(label, { x: MARGIN, y, size: 9, font, color: BRAND_700 });
    y -= 12;
    const tf = form.createTextField(uniqueName(name));
    // setFontSize/enableMultiline must come AFTER addToPage — they configure the field's widget
    // appearance stream, which pdf-lib only creates once the field has been placed on a page.
    tf.addToPage(page, { x: MARGIN, y: y - fieldHeight, width: CONTENT_WIDTH, height: fieldHeight, borderColor: BORDER, backgroundColor: WHITE, borderWidth: 1 });
    if (type === 'longtext') tf.enableMultiline();
    tf.setFontSize(10);
    y -= fieldHeight + 8;
  }

  function drawTable(sectionIdx: number, table: NonNullable<FormTemplate['sections'][number]['table']>) {
    const rowCount = table.rowLabels ? table.rowLabels.length : table.rows ?? 0;
    const labelColWidth = table.rowLabels ? 220 : 0;
    const fillableColumns = table.rowLabels ? table.columns.slice(1) : table.columns;
    const fillableWidth = (CONTENT_WIDTH - labelColWidth) / fillableColumns.length;

    ensureSpace(20);
    page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_WIDTH, height: 16, color: GOLD_50 });
    let x = MARGIN + 6;
    if (table.rowLabels) {
      page.drawText(table.columns[0], { x, y, size: 9, font: boldFont, color: GOLD_700 });
      x += labelColWidth;
    }
    for (const col of fillableColumns) {
      page.drawText(col, { x, y, size: 9, font: boldFont, color: GOLD_700 });
      x += fillableWidth;
    }
    y -= 18;

    const rowHeight = 18;
    for (let r = 0; r < rowCount; r++) {
      ensureSpace(rowHeight + 4);
      if (r % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - rowHeight + 2, width: CONTENT_WIDTH, height: rowHeight - 2, color: rgb(0.97, 0.99, 0.975) });
      x = MARGIN;
      if (table.rowLabels) {
        page.drawText(table.rowLabels[r], { x: x + 6, y: y - 12, size: 9, font, color: TEXT_DARK });
        x += labelColWidth;
      }
      for (let c = 0; c < fillableColumns.length; c++) {
        const tf = form.createTextField(uniqueName(`s${sectionIdx}_r${r}_c${c}`));
        tf.addToPage(page, { x: x + 3, y: y - rowHeight + 2, width: fillableWidth - 6, height: rowHeight - 4, borderColor: BORDER, backgroundColor: WHITE, borderWidth: 1 });
        tf.setFontSize(9);
        x += fillableWidth;
      }
      y -= rowHeight;
    }
    y -= 10;
  }

  drawTitle();
  template.sections.forEach((section, sectionIdx) => {
    if (section.title) drawSectionTitle(section.title);
    for (const paragraph of section.paragraphs ?? []) {
      drawParagraph(paragraph);
    }
    for (const field of section.fields ?? []) {
      drawField(`s${sectionIdx}_${field.name}`, field.label, field.type);
    }
    if (section.table) drawTable(sectionIdx, section.table);
  });

  const footerText =
    template.category === 'client_compliance'
      ? 'Professional-practice template — adapt it to the engagement, province, firm policies, client facts, and current requirements. It does not replace professional or legal judgment.'
      : 'This worksheet is for organizing your information for your accountant — it is not tax advice. Expense categories may vary based on your specific situation; confirm treatment with your accountant before filing.';

  ensureSpace(30);
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: GOLD_400 });
  y -= 12;
  for (const line of wrapText(footerText, font, 8, CONTENT_WIDTH)) {
    page.drawText(line, { x: MARGIN, y, size: 8, font, color: TEXT_MUTED });
    y -= 10;
  }

  return pdfDoc.save();
}
