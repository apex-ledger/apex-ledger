import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import type { CompanyInfo, Contact, TaxCode } from '@shared/domain/types';
import { suggestTaxCents } from '@shared/domain/ledger/computeTaxSplit';
import { drawCompanyLogo, wrapText, CONTENT_WIDTH, HEADER_HEIGHT, MARGIN, PAGE_HEIGHT, PAGE_WIDTH } from './pdfStyle';

// Black and white, like the invoice: these go to printers, faxes and photocopiers.
const BLACK = rgb(0, 0, 0);
const TEXT_DARK = rgb(0.15, 0.15, 0.15);
const TEXT_MUTED = rgb(0.4, 0.4, 0.4);
const HEADER_FILL = rgb(0.9, 0.9, 0.9);
const STRIPE = rgb(0.96, 0.96, 0.96);

export interface PrintableLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  /** Pre-tax amount for the line. */
  amountCents: number;
  taxCode: TaxCode | null;
  manualHstCents: number | null;
}

/** Any document that goes out to a customer or vendor as a list of lines with a party and a few
 * header fields — an estimate, a purchase order, a credit note. The invoice and sales receipt keep
 * their own generators; this is the same layout for the rest, so a new document type needs a
 * mapping, not another 250-line copy. */
export interface PrintableDocument {
  /** The heading printed large at the top, e.g. "ESTIMATE". */
  title: string;
  /** The label above the party's name, e.g. "Prepared For", "Vendor". */
  partyHeading: string;
  party: Contact;
  /** Number, dates and references, stacked on the right. */
  fields: Array<{ label: string; value: string }>;
  lines: PrintableLine[];
  memo: string | null;
  /** The closing line under the totals. */
  footer: string;
}

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Tax on a line: the figure typed for a Manual line, otherwise the rate applied to its pre-tax
 * amount — the same rule the invoice PDF and the posting code use. */
export function printableLineTaxCents(line: PrintableLine): number {
  if (line.taxCode === 'Manual') return line.manualHstCents ?? 0;
  return suggestTaxCents(line.taxCode, line.amountCents);
}

/** Subtotal, tax and total worked out from the lines themselves. Stored document totals are not
 * used: an estimate stores its total before tax and a credit note after it, and a PDF that printed
 * whichever one happened to be stored would show a different kind of "total" on each document. */
export function printableTotals(lines: PrintableLine[]): { subtotalCents: number; taxCents: number; totalCents: number } {
  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const taxCents = lines.reduce((sum, line) => sum + printableLineTaxCents(line), 0);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

export async function generateDocumentPdf(doc: PrintableDocument, company: CompanyInfo): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const reference = doc.fields[0] ? `${doc.fields[0].label} ${doc.fields[0].value}` : doc.title;

  let page!: PDFPage;
  let y!: number;
  let pageNumber = 0;
  const logoPromises: Promise<number>[] = [];

  function newPage() {
    pageNumber += 1;
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    if (pageNumber === 1) {
      page.drawText(doc.title, { x: MARGIN, y: PAGE_HEIGHT - 44, size: 22, font: boldFont, color: BLACK });
      page.drawText(company.legalName, { x: MARGIN, y: PAGE_HEIGHT - 62, size: 10, font, color: TEXT_DARK });
      logoPromises.push(drawCompanyLogo(pdfDoc, page, company.logoDataUrl, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 10, HEADER_HEIGHT - 20, 180));
      page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - HEADER_HEIGHT }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - HEADER_HEIGHT }, thickness: 1.5, color: BLACK });
      y = PAGE_HEIGHT - HEADER_HEIGHT - 22;
    } else {
      page.drawText(reference, { x: MARGIN, y: PAGE_HEIGHT - 26, size: 10, font: boldFont, color: BLACK });
      page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 34 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 34 }, thickness: 0.75, color: BLACK });
      y = PAGE_HEIGHT - 50;
    }
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 40) newPage();
  }

  newPage();

  const companyLines: string[] = [];
  if (company.businessAddressLine1) companyLines.push([company.businessAddressLine1, company.businessAddressLine2].filter(Boolean).join(', '));
  const cityLine = [company.businessCity, [company.businessProvince, company.businessPostalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (cityLine) companyLines.push(cityLine);
  if (company.businessNumber) companyLines.push(`Business #: ${company.businessNumber}`);
  if (company.hstNumber) companyLines.push(`GST/HST #: ${company.hstNumber}`);
  for (const line of companyLines) {
    page.drawText(line, { x: MARGIN, y, size: 9, font, color: TEXT_MUTED });
    y -= 13;
  }
  y -= companyLines.length > 0 ? 7 : 8;

  // Party on the left, fields on the right, each tracking its own height so a long address never
  // runs into the dates.
  const blockStartY = y;
  const rightX = MARGIN + 380;
  let rightY = blockStartY;
  for (const field of doc.fields) {
    page.drawText(field.label, { x: rightX, y: rightY, size: 9, font: boldFont, color: BLACK });
    page.drawText(field.value, { x: rightX, y: rightY - 13, size: 10, font, color: TEXT_DARK });
    rightY -= 30;
  }

  let leftY = blockStartY;
  page.drawText(doc.partyHeading, { x: MARGIN, y: leftY, size: 9, font: boldFont, color: BLACK });
  leftY -= 13;
  page.drawText(doc.party.name, { x: MARGIN, y: leftY, size: 11, font: boldFont, color: TEXT_DARK });
  leftY -= 14;
  if (doc.party.companyName && doc.party.companyName !== doc.party.name) {
    page.drawText(doc.party.companyName, { x: MARGIN, y: leftY, size: 9, font, color: TEXT_MUTED });
    leftY -= 12;
  }
  if (doc.party.contactName) {
    page.drawText(`Attention: ${doc.party.contactName}`, { x: MARGIN, y: leftY, size: 9, font, color: TEXT_MUTED });
    leftY -= 12;
  }
  if (doc.party.email) {
    page.drawText(doc.party.email, { x: MARGIN, y: leftY, size: 9, font, color: TEXT_MUTED });
    leftY -= 12;
  }
  if (doc.party.address) {
    for (const line of wrapText(doc.party.address, font, 9, 300)) {
      page.drawText(line, { x: MARGIN, y: leftY, size: 9, font, color: TEXT_MUTED });
      leftY -= 11;
    }
  }
  y = Math.min(leftY, rightY) - 10;

  const cols = [
    { label: 'Description', x: MARGIN, width: 240 },
    { label: 'Qty', x: MARGIN + 240, width: 50, align: 'right' as const },
    { label: 'Unit Price', x: MARGIN + 290, width: 90, align: 'right' as const },
    { label: 'Amount', x: MARGIN + 392, width: 90, align: 'right' as const },
  ];

  function drawTableHeader() {
    ensureSpace(24);
    page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_WIDTH, height: 18, color: HEADER_FILL });
    for (const col of cols) {
      const textX = col.align === 'right' ? col.x + col.width - boldFont.widthOfTextAtSize(col.label, 9) - 4 : col.x + 4;
      page.drawText(col.label, { x: textX, y, size: 9, font: boldFont, color: BLACK });
    }
    y -= 20;
  }

  drawTableHeader();
  doc.lines.forEach((line, i) => {
    const descLines = wrapText(line.description || '—', font, 9, cols[0].width - 8);
    const rowHeight = Math.max(16, descLines.length * 11 + 4);
    if (y - (rowHeight + 4) < MARGIN + 40) {
      newPage();
      drawTableHeader();
    }
    if (i % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - rowHeight + 4, width: CONTENT_WIDTH, height: rowHeight - 2, color: STRIPE });
    descLines.forEach((text, li) => page.drawText(text, { x: cols[0].x + 4, y: y - li * 11, size: 9, font, color: TEXT_DARK }));
    const right = (text: string, col: (typeof cols)[number], bold = false) =>
      page.drawText(text, { x: col.x + col.width - (bold ? boldFont : font).widthOfTextAtSize(text, 9) - 4, y, size: 9, font: bold ? boldFont : font, color: TEXT_DARK });
    right(String(line.quantity), cols[1]);
    right(formatMoney(line.unitPriceCents), cols[2]);
    right(formatMoney(line.amountCents), cols[3], true);
    y -= rowHeight;
  });

  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: BLACK });
  y -= 16;

  const { subtotalCents, taxCents, totalCents } = printableTotals(doc.lines);
  function drawSummaryLine(label: string, amountCents: number, bold = false) {
    ensureSpace(16);
    const f = bold ? boldFont : font;
    const size = bold ? 10.5 : 9.5;
    page.drawText(label, { x: MARGIN + 300, y, size, font: f, color: bold ? TEXT_DARK : TEXT_MUTED });
    const amountText = formatMoney(amountCents);
    page.drawText(amountText, { x: PAGE_WIDTH - MARGIN - f.widthOfTextAtSize(amountText, size), y, size, font: f, color: TEXT_DARK });
    y -= bold ? 18 : 14;
  }
  drawSummaryLine('Subtotal', subtotalCents);
  if (taxCents > 0) drawSummaryLine('GST/HST', taxCents);
  drawSummaryLine('Total', totalCents, true);

  if (doc.memo) {
    y -= 10;
    ensureSpace(20);
    page.drawText('Memo', { x: MARGIN, y, size: 9, font: boldFont, color: BLACK });
    y -= 12;
    for (const line of wrapText(doc.memo, font, 9, CONTENT_WIDTH)) {
      ensureSpace(12);
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: TEXT_MUTED });
      y -= 11;
    }
  }

  ensureSpace(24);
  y -= 10;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: BLACK });
  y -= 12;
  page.drawText(doc.footer, { x: MARGIN, y, size: 8, font, color: TEXT_MUTED });

  await Promise.all(logoPromises);
  return pdfDoc.save();
}
