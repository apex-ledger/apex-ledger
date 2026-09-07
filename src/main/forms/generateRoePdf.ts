import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { PAY_PERIOD_TYPE_LABELS, ROE_REASON_CODES, type RoeInput, type RoeResult } from '@shared/domain/payroll/recordOfEmployment';
import { BORDER, MARGIN, PAGE_HEIGHT, PAGE_WIDTH, TEXT_DARK, TEXT_MUTED, formatMoney } from './pdfStyle';

/**
 * The Record of Employment worksheet: every block the firm keys (or uploads) into ROE Web, laid
 * out in block order with the block 15 period table. It is the firm's file copy and the review
 * sheet before submission — not the ROE itself, which Service Canada issues on receipt.
 */
export async function generateRoePdf(input: RoeInput, roe: RoeResult, issuedOn: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const text = (s: string, x: number, size = 9, f: PDFFont = font, color = TEXT_DARK) => page.drawText(s, { x, y, size, font: f, color });
  const rule = () => page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 4 }, thickness: 0.5, color: BORDER });
  const ensure = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      text('Record of Employment worksheet (continued)', MARGIN, 9, bold, TEXT_MUTED);
      y -= 18;
    }
  };
  const block = (no: string, label: string, value: string) => {
    ensure(16);
    text(`${no}`, MARGIN, 8, bold, TEXT_MUTED);
    text(label, MARGIN + 28, 8, font, TEXT_MUTED);
    text(value, MARGIN + 210, 9, font);
    y -= 14;
  };

  text('RECORD OF EMPLOYMENT — WORKSHEET', MARGIN, 15, bold);
  y -= 16;
  text(`Prepared ${issuedOn} · for entry or upload to ROE Web. Not the ROE itself.`, MARGIN, 8, font, TEXT_MUTED);
  y -= 10;
  rule();
  y -= 16;

  const e = input.employee;
  const r = input.employer;
  const reason = ROE_REASON_CODES.find((c) => c.code === input.reasonCode);
  const recall = input.expectedRecall === 'unknown' ? 'Unknown' : input.expectedRecall === 'notReturning' ? 'Not returning' : `Yes — ${input.expectedRecall.date}`;

  text('EMPLOYER', MARGIN, 7, bold, TEXT_MUTED);
  y -= 12;
  block('4', 'Employer name', r.legalName);
  r.addressLines.forEach((l, i) => block('', i === 0 ? 'Address' : '', l));
  block('3', 'CRA payroll account number', r.payrollNumber ?? '—');
  block('16', 'Contact', [r.contactName, r.contactPhone].filter(Boolean).join(' · ') || '—');
  y -= 6;

  text('EMPLOYEE', MARGIN, 7, bold, TEXT_MUTED);
  y -= 12;
  block('9', 'Employee name', e.name);
  e.addressLines.forEach((l, i) => block('', i === 0 ? 'Address' : '', l));
  block('8', 'Social insurance number', e.sin ? e.sin.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : 'MISSING');
  block('6', 'Pay period type', `${PAY_PERIOD_TYPE_LABELS[roe.payPeriodType]} (${roe.payPeriodType})`);
  block('10', 'First day worked', roe.firstDayWorked);
  block('11', 'Last day for which paid', roe.lastDayPaid);
  block('12', 'Final pay period ending date', roe.finalPayPeriodEnd);
  block('14', 'Expected date of recall', recall);
  block('16', 'Reason for issuing', reason ? `${reason.code} — ${reason.label}` : input.reasonCode);
  if (roe.vacationPayOnSeparationCents > 0) block('17A', 'Vacation pay on separation', formatMoney(roe.vacationPayOnSeparationCents));
  if (input.comments?.trim()) block('18', 'Comments', input.comments.trim().slice(0, 160));
  y -= 6;

  text('BLOCK 15 — INSURABLE HOURS AND EARNINGS', MARGIN, 7, bold, TEXT_MUTED);
  y -= 12;
  block('15A', `Total insurable hours (last ${roe.periodsRequired15C} periods)`, roe.totalInsurableHours.toFixed(0));
  block('15B', `Total insurable earnings (last ${roe.periodsRequired15B} periods)`, formatMoney(roe.totalInsurableEarningsCents));
  y -= 4;
  ensure(30);
  text('15C', MARGIN, 8, bold, TEXT_MUTED);
  text('P.P.', MARGIN + 40, 7, bold, TEXT_MUTED);
  text('Period', MARGIN + 80, 7, bold, TEXT_MUTED);
  text('Insurable earnings', MARGIN + 260, 7, bold, TEXT_MUTED);
  text('Hours', MARGIN + 380, 7, bold, TEXT_MUTED);
  y -= 4;
  rule();
  y -= 12;
  for (const p of roe.periods) {
    ensure(13);
    text(String(p.index), MARGIN + 40, 8, font);
    text(`${p.payPeriodStart} to ${p.payPeriodEnd}`, MARGIN + 80, 8, font);
    text(formatMoney(p.insurableEarningsCents), MARGIN + 260, 8, font);
    text(p.insurableHours.toFixed(2), MARGIN + 380, 8, font);
    y -= 12;
  }
  if (roe.periods.length === 0) {
    text('No pay periods on file.', MARGIN + 40, 8, font, TEXT_MUTED);
    y -= 12;
  }

  if (roe.warnings.length > 0) {
    y -= 8;
    ensure(20 + roe.warnings.length * 12);
    text('CHECK BEFORE SUBMITTING', MARGIN, 7, bold, TEXT_MUTED);
    y -= 12;
    for (const w of roe.warnings) {
      text(`• ${w}`.slice(0, 150), MARGIN, 8, font);
      y -= 12;
    }
  }

  y -= 20;
  ensure(30);
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 220, y }, thickness: 0.5, color: TEXT_DARK });
  y -= 10;
  text('Reviewed by (issuer)', MARGIN, 7, font, TEXT_MUTED);
  text('Date', MARGIN + 260, 7, font, TEXT_MUTED);
  page.drawLine({ start: { x: MARGIN + 260, y: y + 10 }, end: { x: MARGIN + 400, y: y + 10 }, thickness: 0.5, color: TEXT_DARK });

  return pdfDoc.save();
}
