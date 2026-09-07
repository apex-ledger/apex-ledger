import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { CompanyInfo } from '@shared/domain/types';
import type { Pd7aSummaryResult } from '@shared/domain/payroll/computePd7aSummary';
import { BORDER, CONTENT_WIDTH, MARGIN, PAGE_HEIGHT, PAGE_WIDTH, TEXT_DARK, TEXT_MUTED, companyAddressLines, formatMoney } from './pdfStyle';

/**
 * Lays out a printable PD7A remittance summary — the employer's own working copy of what a
 * period's source-deduction remittance should total, computed from posted pay runs. Not the
 * official CRA PD7A statement (which only CRA can issue); this exists so an employer/accountant
 * has a documented, dated figure to remit against and file for their records. Plain black-on-white
 * with no colour coding, matching a formal remittance/payroll record rather than the app's own
 * branding, and ends with an employer signature line instead of a compliance disclaimer.
 */
export async function generatePd7aPdf(company: CompanyInfo, summary: Pd7aSummaryResult, monthly: Pd7aSummaryResult[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page!: PDFPage;
  let y!: number;
  let pageNumber = 0;

  function newPage() {
    pageNumber += 1;
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    if (pageNumber === 1) {
      page.drawText('PD7A REMITTANCE SUMMARY', { x: MARGIN, y: PAGE_HEIGHT - MARGIN, size: 18, font: boldFont, color: TEXT_DARK });
      page.drawText(company.legalName, { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 20, size: 10, font, color: TEXT_MUTED });
      page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 30 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - MARGIN - 30 }, thickness: 1, color: BORDER });
      y = PAGE_HEIGHT - MARGIN - 50;
    } else {
      page.drawText('PD7A Remittance Summary (continued)', { x: MARGIN, y: PAGE_HEIGHT - 26, size: 10, font: boldFont, color: TEXT_DARK });
      page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 36 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 36 }, thickness: 0.5, color: BORDER });
      y = PAGE_HEIGHT - 56;
    }
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 40) newPage();
  }

  newPage();

  for (const line of companyAddressLines(company)) {
    page.drawText(line, { x: MARGIN, y, size: 9, font, color: TEXT_MUTED });
    y -= 13;
  }
  if (company.businessNumber) {
    page.drawText(`Business #: ${company.businessNumber}`, { x: MARGIN, y, size: 9, font, color: TEXT_MUTED });
    y -= 13;
  }
  if (company.payrollNumber) {
    page.drawText(`Payroll Account #: ${company.payrollNumber}`, { x: MARGIN, y, size: 9, font, color: TEXT_MUTED });
    y -= 13;
  }
  y -= 8;

  page.drawText(`Remittance Period: ${summary.payDateFrom} to ${summary.payDateTo}`, { x: MARGIN, y, size: 11, font: boldFont, color: TEXT_DARK });
  y -= 26;

  function drawStat(label: string, cents: number) {
    ensureSpace(30);
    page.drawText(label, { x: MARGIN, y, size: 9, font, color: TEXT_MUTED });
    const amountText = `$${formatMoney(cents)}`;
    page.drawText(amountText, { x: PAGE_WIDTH - MARGIN - boldFont.widthOfTextAtSize(amountText, 11), y: y - 1, size: 11, font: boldFont, color: TEXT_DARK });
    y -= 20;
  }

  drawStat('Gross Payroll', summary.grossPayrollCents);
  drawStat('CPP Remittance', summary.cppEmployeeCents + summary.cppEmployerCents);
  drawStat('EI Remittance', summary.eiEmployeeCents + summary.eiEmployerCents);
  drawStat('Income Tax Withheld', summary.incomeTaxCents);

  y -= 4;
  ensureSpace(40);
  page.drawRectangle({ x: MARGIN, y: y - 24, width: CONTENT_WIDTH, height: 28, borderColor: TEXT_DARK, borderWidth: 1 });
  page.drawText('Total Remittance Due', { x: MARGIN + 10, y: y - 16, size: 12, font: boldFont, color: TEXT_DARK });
  const totalText = `$${formatMoney(summary.totalRemittanceCents)}`;
  page.drawText(totalText, { x: PAGE_WIDTH - MARGIN - 10 - boldFont.widthOfTextAtSize(totalText, 13), y: y - 16, size: 13, font: boldFont, color: TEXT_DARK });
  y -= 40;

  if (monthly.length > 1) {
    ensureSpace(24);
    page.drawText('Monthly Breakdown', { x: MARGIN, y, size: 10, font: boldFont, color: TEXT_DARK });
    y -= 18;

    const cols = [
      { label: 'Month', x: MARGIN, width: 80 },
      { label: 'Gross', x: MARGIN + 80, width: 90, align: 'right' as const },
      { label: 'CPP', x: MARGIN + 170, width: 80, align: 'right' as const },
      { label: 'EI', x: MARGIN + 250, width: 80, align: 'right' as const },
      { label: 'Income Tax', x: MARGIN + 330, width: 90, align: 'right' as const },
      { label: 'Total', x: MARGIN + 420, width: 92, align: 'right' as const },
    ];
    ensureSpace(20);
    page.drawLine({ start: { x: MARGIN, y: y - 4 }, end: { x: PAGE_WIDTH - MARGIN, y: y - 4 }, thickness: 1, color: TEXT_DARK });
    for (const col of cols) {
      const textX = col.align === 'right' ? col.x + col.width - boldFont.widthOfTextAtSize(col.label, 8) - 4 : col.x + 4;
      page.drawText(col.label, { x: textX, y, size: 8, font: boldFont, color: TEXT_DARK });
    }
    y -= 16;
    page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 2 }, thickness: 0.5, color: BORDER });

    monthly.forEach((m) => {
      ensureSpace(16);
      const values = [
        m.payDateFrom.slice(0, 7),
        formatMoney(m.grossPayrollCents),
        formatMoney(m.cppEmployeeCents + m.cppEmployerCents),
        formatMoney(m.eiEmployeeCents + m.eiEmployerCents),
        formatMoney(m.incomeTaxCents),
        formatMoney(m.totalRemittanceCents),
      ];
      values.forEach((v, ci) => {
        const col = cols[ci];
        const textX = col.align === 'right' ? col.x + col.width - font.widthOfTextAtSize(v, 8) - 4 : col.x + 4;
        page.drawText(v, { x: textX, y, size: 8, font, color: TEXT_DARK });
      });
      y -= 14;
    });
    y -= 10;
  }

  ensureSpace(60);
  y -= 20;
  const sigLineWidth = 220;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + sigLineWidth, y }, thickness: 0.75, color: TEXT_DARK });
  page.drawText('Employer Signature', { x: MARGIN, y: y - 12, size: 8, font, color: TEXT_MUTED });
  const dateLineX = MARGIN + sigLineWidth + 40;
  page.drawLine({ start: { x: dateLineX, y }, end: { x: dateLineX + 140, y }, thickness: 0.75, color: TEXT_DARK });
  page.drawText('Date', { x: dateLineX, y: y - 12, size: 8, font, color: TEXT_MUTED });

  return pdfDoc.save();
}
