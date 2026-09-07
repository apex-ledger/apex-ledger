import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { CompanyInfo, Employee, PayrollRun } from '@shared/domain/types';
import { employeeAddressLines } from '@shared/domain/payroll/employeeAddress';
import type { YtdPaystubTotals } from '../db/queries';
import { BORDER, CONTENT_WIDTH, MARGIN, PAGE_HEIGHT, PAGE_WIDTH, TEXT_DARK, TEXT_MUTED, companyAddressLines, formatMoney } from './pdfStyle';

export interface PaystubPdfInput {
  run: PayrollRun;
  employee: Employee;
  company: CompanyInfo;
  ytdThroughThisRun: YtdPaystubTotals;
  ytdItems: Record<string, number>;
}

const COL_CURRENT = PAGE_WIDTH - MARGIN - 110;
const COL_YTD = PAGE_WIDTH - MARGIN;

/**
 * The same pay statement the Pay Stub screen shows, as a one-page PDF: employer and employee
 * blocks, earnings (regular, overtime, vacation, cash items), non-cash taxable benefits, source
 * deductions and after-tax deductions, reimbursements, and net pay — each with a year-to-date
 * column. Employer costs are deliberately left off: this is the employee's copy.
 */
export async function generatePaystubPdf(input: PaystubPdfInput): Promise<Uint8Array> {
  const { run, employee, company, ytdThroughThisRun, ytdItems } = input;
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const text = (s: string, x: number, size = 9, f: PDFFont = font, color = TEXT_DARK) => page.drawText(s, { x, y, size, font: f, color });
  const right = (s: string, xRight: number, size = 9, f: PDFFont = font, color = TEXT_DARK) => page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y, size, font: f, color });
  const rule = (thickness = 0.5) => page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 4 }, thickness, color: BORDER });

  // Header: employer left, statement title right.
  text(company.legalName, MARGIN, 14, bold);
  right('PAY STATEMENT', COL_YTD, 12, bold);
  y -= 14;
  right(`Pay Date: ${run.payDate}`, COL_YTD, 9, font, TEXT_MUTED);
  for (const line of companyAddressLines(company)) {
    text(line, MARGIN, 8, font, TEXT_MUTED);
    y -= 11;
  }
  y -= 6;
  rule(1);
  y -= 16;

  // Employee block left, pay period right.
  const blockTop = y;
  text('EMPLOYEE', MARGIN, 7, bold, TEXT_MUTED);
  y -= 12;
  text(employee.name, MARGIN, 10, bold);
  y -= 12;
  const address = employeeAddressLines(employee);
  for (const line of address.length > 0 ? address : [employee.province]) {
    text(line, MARGIN, 8, font, TEXT_MUTED);
    y -= 11;
  }
  if (employee.sinLastFour) {
    text(`SIN: ***-***-${employee.sinLastFour}`, MARGIN, 8, font, TEXT_MUTED);
    y -= 11;
  }
  const blockBottom = y;
  y = blockTop;
  right('PAY PERIOD', COL_YTD, 7, bold, TEXT_MUTED);
  y -= 12;
  right(`${run.payPeriodStart} to ${run.payPeriodEnd}`, COL_YTD, 9);
  y -= 12;
  if (employee.payType === 'Hourly') {
    const rate = employee.hourlyRateCents ?? 0;
    const ot = (run.overtimeHours ?? 0) > 0 ? ` + ${run.overtimeHours} OT hrs @ ${formatMoney(Math.round(rate * 1.5))}` : '';
    right(`${run.regularHours ?? 0} reg hrs @ ${formatMoney(rate)}${ot}`, COL_YTD, 8, font, TEXT_MUTED);
    y -= 11;
  }
  y = Math.min(y, blockBottom) - 14;

  // Table header.
  text('EARNINGS & DEDUCTIONS', MARGIN, 7, bold, TEXT_MUTED);
  right('CURRENT', COL_CURRENT, 7, bold, TEXT_MUTED);
  right('YEAR TO DATE', COL_YTD, 7, bold, TEXT_MUTED);
  y -= 6;
  rule(1);
  y -= 14;

  const row = (label: string, current: number, ytd?: number, isBold = false) => {
    const f = isBold ? bold : font;
    text(label, MARGIN, 9, f);
    right(formatMoney(current), COL_CURRENT, 9, f);
    if (ytd !== undefined) right(formatMoney(ytd), COL_YTD, 9, f, TEXT_MUTED);
    y -= 14;
  };
  const caption = (label: string) => {
    y -= 2;
    rule();
    y -= 6;
    text(label.toUpperCase(), MARGIN, 6.5, bold, TEXT_MUTED);
    y -= 12;
  };

  const items = (run.items ?? []).filter((i) => i.amountCents > 0);
  const byKind = (kind: string) => items.filter((i) => i.kind === kind);
  const sum = (list: { amountCents: number }[]) => list.reduce((t, i) => t + i.amountCents, 0);
  const hasSplit = run.regularPayCents > 0 || run.overtimePayCents > 0;
  const grossPay = run.grossPayCents + run.vacationPayCents;

  if (hasSplit) {
    row('Regular Pay', run.regularPayCents);
    if ((run.overtimeHours ?? 0) > 0) row('Overtime Pay', run.overtimePayCents);
    if (run.vacationPayCents > 0) row('Vacation Pay', run.vacationPayCents);
  } else {
    row('Regular / Vacation Pay', grossPay);
  }
  for (const i of byKind('earning')) row(i.name, i.amountCents, ytdItems[i.name]);
  row('Gross Pay', grossPay, ytdThroughThisRun.grossPayCents, true);

  const benefits = byKind('taxableBenefit');
  if (benefits.length > 0) {
    caption('Taxable Benefits (non-cash)');
    for (const i of benefits) row(i.name, i.amountCents, ytdItems[i.name]);
  }

  caption('Deductions');
  const cpp = run.cpp1EmployeeCents + run.cpp2EmployeeCents;
  row('CPP', cpp, ytdThroughThisRun.cppEmployeeCents);
  row('EI', run.eiEmployeeCents, ytdThroughThisRun.eiEmployeeCents);
  row('Income Tax', run.incomeTaxCents, ytdThroughThisRun.incomeTaxCents);
  const deductions = byKind('deduction');
  for (const i of deductions) row(i.name, i.amountCents, ytdItems[i.name]);
  row('Total Deductions', cpp + run.eiEmployeeCents + run.incomeTaxCents + sum(deductions), undefined, true);

  const reimbursements = byKind('reimbursement');
  if (reimbursements.length > 0) {
    caption('Reimbursements (non-taxable)');
    for (const i of reimbursements) row(i.name, i.amountCents, ytdItems[i.name]);
  }

  y -= 2;
  page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 4 }, thickness: 1.2, color: TEXT_DARK });
  y -= 8;
  row('Net Pay', run.netPayCents, ytdThroughThisRun.netPayCents, true);

  y -= 10;
  const note = 'Retain for your records.';
  page.drawText(note, { x: MARGIN + (CONTENT_WIDTH - font.widthOfTextAtSize(note, 7)) / 2, y, size: 7, font, color: TEXT_MUTED });

  return pdfDoc.save();
}
