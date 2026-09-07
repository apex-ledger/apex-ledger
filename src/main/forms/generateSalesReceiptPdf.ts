import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { drawCompanyLogo } from './pdfStyle';
import type { CompanyInfo, Contact, SalesReceipt } from '@shared/domain/types';
import { suggestTaxCents } from '@shared/domain/ledger/computeTaxSplit';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const HEADER_HEIGHT = 70;

// Same brand palette as generateInvoicePdf.ts / generateFormPdf.ts.
const BRAND_900 = rgb(0.0824, 0.2588, 0.1686);
const BRAND_700 = rgb(0.1098, 0.3882, 0.2353);
const BRAND_50 = rgb(0.9412, 0.9804, 0.9529);
const GOLD_400 = rgb(0.8745, 0.6627, 0.1922);
const GOLD_50 = rgb(0.9922, 0.9725, 0.9255);
const GOLD_700 = rgb(0.5294, 0.3294, 0.0902);
const WHITE = rgb(1, 1, 1);
const TEXT_DARK = rgb(0.15, 0.15, 0.15);
const TEXT_MUTED = rgb(0.4, 0.4, 0.4);

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

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function estimatedHstCents(receipt: SalesReceipt): number {
  return receipt.lines.reduce((sum, line) => {
    if (line.taxCode === 'Manual') return sum + (line.manualHstCents ?? 0);
    return sum + suggestTaxCents(line.taxCode, line.amountCents);
  }, 0);
}

/**
 * Lays out a printable sales receipt PDF — a near-mirror of generateInvoicePdf.ts's layout, but
 * "Sold To" instead of "Bill To", no Due Date (a sales receipt is paid in full at creation), and a
 * "Payment received via" line naming the deposit account instead. `depositAccountName` is resolved
 * by the caller (an account id alone means nothing on a printed page).
 */
export async function generateSalesReceiptPdf(receipt: SalesReceipt, customer: Contact, company: CompanyInfo, depositAccountName: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page!: PDFPage;
  let y!: number;
  let pageNumber = 0;
  const logoPromises: Promise<number>[] = [];

  function newPage() {
    pageNumber += 1;
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: BRAND_50 });
    if (pageNumber === 1) {
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_HEIGHT, width: PAGE_WIDTH, height: HEADER_HEIGHT, color: BRAND_900 });
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_HEIGHT - 4, width: PAGE_WIDTH, height: 4, color: GOLD_400 });
      page.drawText('SALES RECEIPT', { x: MARGIN, y: PAGE_HEIGHT - 44, size: 22, font: boldFont, color: WHITE });
      page.drawText(company.legalName, { x: MARGIN, y: PAGE_HEIGHT - 62, size: 10, font, color: rgb(0.85, 0.93, 0.87) });
      logoPromises.push(drawCompanyLogo(pdfDoc, page, company.logoDataUrl, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 10, HEADER_HEIGHT - 20, 180));
      y = PAGE_HEIGHT - HEADER_HEIGHT - 22;
    } else {
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 4, width: PAGE_WIDTH, height: 4, color: GOLD_400 });
      page.drawText(`Sales Receipt ${receipt.receiptNumber}`, { x: MARGIN, y: PAGE_HEIGHT - 26, size: 10, font: boldFont, color: BRAND_700 });
      y = PAGE_HEIGHT - 46;
    }
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 40) newPage();
  }

  newPage();

  const headerLines: string[] = [];
  if (company.businessAddressLine1) headerLines.push([company.businessAddressLine1, company.businessAddressLine2].filter(Boolean).join(', '));
  const businessCityLine = [company.businessCity, [company.businessProvince, company.businessPostalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (businessCityLine) headerLines.push(businessCityLine);
  if (company.businessNumber) headerLines.push(`Business #: ${company.businessNumber}`);
  if (company.hstNumber) headerLines.push(`GST/HST #: ${company.hstNumber}`);

  if (headerLines.length > 0) {
    for (const line of headerLines) {
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: TEXT_MUTED });
      y -= 13;
    }
    y -= 7;
  } else {
    y -= 8;
  }

  const blockStartY = y;
  const rightX = MARGIN + 380;

  function drawLabelValue(x: number, yPos: number, label: string, value: string): number {
    page.drawText(label, { x, y: yPos, size: 9, font: boldFont, color: GOLD_700 });
    page.drawText(value, { x, y: yPos - 13, size: 10, font, color: TEXT_DARK });
    return yPos - 30;
  }

  let rightY = blockStartY;
  rightY = drawLabelValue(rightX, rightY, 'Receipt #', receipt.receiptNumber);
  rightY = drawLabelValue(rightX, rightY, 'Receipt Date', receipt.receiptDate);
  rightY = drawLabelValue(rightX, rightY, 'Payment Received Via', depositAccountName);

  let leftY = blockStartY;
  page.drawText('Sold To', { x: MARGIN, y: leftY, size: 9, font: boldFont, color: GOLD_700 });
  leftY -= 13;
  page.drawText(customer.name, { x: MARGIN, y: leftY, size: 11, font: boldFont, color: TEXT_DARK });
  leftY -= 14;
  if (customer.email) {
    page.drawText(customer.email, { x: MARGIN, y: leftY, size: 9, font, color: TEXT_MUTED });
    leftY -= 12;
  }
  if (customer.address) {
    for (const line of wrapText(customer.address, font, 9, 300)) {
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
    page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_WIDTH, height: 18, color: GOLD_50 });
    for (const col of cols) {
      const textX = col.align === 'right' ? col.x + col.width - boldFont.widthOfTextAtSize(col.label, 9) - 4 : col.x + 4;
      page.drawText(col.label, { x: textX, y, size: 9, font: boldFont, color: GOLD_700 });
    }
    y -= 20;
  }

  drawTableHeader();

  receipt.lines.forEach((line, i) => {
    const descLines = wrapText(line.description, font, 9, cols[0].width - 8);
    const rowHeight = Math.max(16, descLines.length * 11 + 4);
    ensureSpace(rowHeight + 4);
    if (i % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - rowHeight + 4, width: CONTENT_WIDTH, height: rowHeight - 2, color: rgb(0.97, 0.99, 0.975) });

    descLines.forEach((dLine, li) => {
      page.drawText(dLine, { x: cols[0].x + 4, y: y - li * 11, size: 9, font, color: TEXT_DARK });
    });

    const qtyText = String(line.quantity);
    page.drawText(qtyText, { x: cols[1].x + cols[1].width - font.widthOfTextAtSize(qtyText, 9) - 4, y, size: 9, font, color: TEXT_DARK });

    const priceText = formatMoney(line.unitPriceCents);
    page.drawText(priceText, { x: cols[2].x + cols[2].width - font.widthOfTextAtSize(priceText, 9) - 4, y, size: 9, font, color: TEXT_DARK });

    const amountText = formatMoney(line.amountCents);
    page.drawText(amountText, { x: cols[3].x + cols[3].width - font.widthOfTextAtSize(amountText, 9) - 4, y, size: 9, font: boldFont, color: TEXT_DARK });

    y -= rowHeight;
  });

  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: GOLD_400 });
  y -= 16;

  const hstCents = estimatedHstCents(receipt);
  const subtotalCents = receipt.totalCents - hstCents;

  function drawSummaryLine(label: string, amountCents: number, bold = false) {
    ensureSpace(16);
    const f = bold ? boldFont : font;
    page.drawText(label, { x: MARGIN + 300, y, size: bold ? 10.5 : 9.5, font: f, color: bold ? TEXT_DARK : TEXT_MUTED });
    const amountText = formatMoney(amountCents);
    page.drawText(amountText, { x: PAGE_WIDTH - MARGIN - f.widthOfTextAtSize(amountText, bold ? 10.5 : 9.5), y, size: bold ? 10.5 : 9.5, font: f, color: TEXT_DARK });
    y -= bold ? 18 : 14;
  }

  drawSummaryLine('Subtotal', subtotalCents);
  if (hstCents > 0) drawSummaryLine('HST (estimated)', hstCents);
  drawSummaryLine('Total Paid', receipt.totalCents, true);

  if (receipt.memo) {
    y -= 10;
    ensureSpace(20);
    page.drawText('Memo', { x: MARGIN, y, size: 9, font: boldFont, color: GOLD_700 });
    y -= 12;
    for (const line of wrapText(receipt.memo, font, 9, CONTENT_WIDTH)) {
      ensureSpace(12);
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: TEXT_MUTED });
      y -= 11;
    }
  }

  ensureSpace(24);
  y -= 10;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: GOLD_400 });
  y -= 12;
  page.drawText('Thank you for your business — payment received in full.', { x: MARGIN, y, size: 8, font, color: TEXT_MUTED });
  if (hstCents > 0) {
    y -= 10;
    page.drawText('HST shown is an estimate for reference only; see your records for the exact filed amount.', { x: MARGIN, y, size: 7, font, color: TEXT_MUTED });
  }

  await Promise.all(logoPromises);
  return pdfDoc.save();
}
