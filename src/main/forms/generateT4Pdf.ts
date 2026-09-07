import { PDFDocument, type PDFPage } from 'pdf-lib';
import type { CompanyInfo } from '@shared/domain/types';
import type { T4SlipResult, T4SummaryResult } from '@shared/domain/payroll/computeT4Slip';
import { BORDER, CONTENT_WIDTH, MARGIN, PAGE_HEIGHT, PAGE_WIDTH, TEXT_DARK, TEXT_MUTED, companyAddressLines, formatMoney, wrapText } from './pdfStyle';
import { SLIP_WIDTH, beginSlip, boxMoney, drawBox, drawOtherInformation, drawSlipFooter, formatSinForSlip, slipFonts, type SlipCanvas } from './craSlipLayout';

/**
 * T4 — Statement of Remuneration Paid, laid out the way CRA prints it: employer at the top left,
 * box 14 and box 22 at the top right, the CPP / EI / pensionable-earnings boxes in two columns
 * beneath, the employee's SIN, province and exemption boxes down the left, the employee's name
 * and address in the lower left, and the "other information" code/amount strip along the foot.
 * Two copies to a page per employee (Copy 2 to attach to the return, Copy 3 to keep), then the
 * T4 Summary. Figures come from posted pay runs; every dollar should be checked against the
 * payroll records before anything is filed.
 */
export async function generateT4Pdf(company: CompanyInfo, slips: T4SlipResult[], summary: T4SummaryResult, taxYear: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fonts = await slipFonts(pdfDoc);
  const payrollAccount = company.payrollNumber ?? (company.businessNumber ? `${company.businessNumber}RP0001` : '');
  const employerLines = [company.legalName, ...companyAddressLines(company)];

  function drawT4(canvas: SlipCanvas, slip: T4SlipResult): void {
    const col2 = SLIP_WIDTH - 6 - 2 * 118 - 4; // two figure columns at the right
    const col3 = col2 + 118 + 4;
    const figW = 118;

    // Employer block (left) and the two headline boxes (right)
    drawBox(canvas, { x: 6, y: 28, w: col2 - 12, h: 58, label: "Employer's name – Nom de l'employeur", lines: employerLines });
    drawBox(canvas, { x: col2, y: 28, w: figW, h: 30, number: '14', label: 'Employment income – line 10100', labelFr: "Revenus d'emploi – ligne 10100", value: boxMoney(slip.employmentIncomeCents, true) });
    drawBox(canvas, { x: col3, y: 28, w: figW, h: 30, number: '22', label: 'Income tax deducted – line 43700', labelFr: 'Impôt sur le revenu retenu – ligne 43700', value: boxMoney(slip.incomeTaxDeductedCents, true) });

    // Employer's account number under the employer block; the figure rows continue at the right
    drawBox(canvas, { x: 6, y: 90, w: col2 - 12, h: 26, number: '54', label: "Employer's account number – Numéro de compte de l'employeur", lines: [payrollAccount] });
    const rows: [string, string, string, number | null, string, string, string, number | null][] = [
      ['16', "Employee's CPP contributions – line 30800", 'Cotisations de l’employé au RPC – ligne 30800', slip.cpp1Cents, '17', "Employee's QPP contributions – line 30800", 'Cotisations de l’employé au RRQ – ligne 30800', null],
      ['16A', "Employee's second CPP contributions – line 30800", 'Deuxièmes cotisations de l’employé au RPC', slip.cpp2Cents, '17A', "Employee's second QPP contributions", 'Deuxièmes cotisations de l’employé au RRQ', null],
      ['18', "Employee's EI premiums – line 31200", 'Cotisations de l’employé à l’AE – ligne 31200', slip.eiPremiumsCents, '20', 'RPP contributions – line 20700', 'Cotisations à un RPA – ligne 20700', null],
      ['24', 'EI insurable earnings', 'Gains assurables d’AE', slip.eiInsurableEarningsCents, '26', 'CPP/QPP pensionable earnings', 'Gains ouvrant droit à pension – RPC/RRQ', slip.cppPensionableEarningsCents],
      ['44', 'Union dues – line 21200', 'Cotisations syndicales – ligne 21200', null, '46', 'Charitable donations – line 34900', 'Dons de bienfaisance – ligne 34900', null],
      ['52', 'Pension adjustment – line 20600', 'Facteur d’équivalence – ligne 20600', null, '50', 'RPP or DPSP registration number', 'N° d’agrément du RPA ou du RPDB', null],
      ['55', "Employee's PPIP premiums", 'Cotisations de l’employé au RPAP', null, '56', 'PPIP insurable earnings', 'Gains assurables du RPAP', null],
    ];
    rows.forEach(([n1, l1, f1, c1, n2, l2, f2, c2], i) => {
      const y = 62 + i * 32;
      drawBox(canvas, { x: col2, y, w: figW, h: 30, number: n1, label: l1, labelFr: f1, value: c1 === null ? null : boxMoney(c1) });
      drawBox(canvas, { x: col3, y, w: figW, h: 30, number: n2, label: l2, labelFr: f2, value: c2 === null ? null : boxMoney(c2) });
    });

    // Identification boxes down the left
    const idY = 120;
    drawBox(canvas, { x: 6, y: idY, w: 54, h: 30, number: '10', label: 'Province', labelFr: "Province d'emploi", value: slip.province, valueSize: 9 });
    drawBox(canvas, { x: 64, y: idY, w: 104, h: 30, number: '12', label: 'Social insurance number', labelFr: "Numéro d'assurance sociale", value: formatSinForSlip(slip.sin), valueSize: 9 });
    drawBox(canvas, { x: 172, y: idY, w: 44, h: 30, number: '28', label: 'CPP/QPP', labelFr: 'RPC/RRQ', value: null });
    drawBox(canvas, { x: 218, y: idY, w: 24, h: 30, label: 'EI', labelFr: 'AE', value: null });
    drawBox(canvas, { x: 244, y: idY, w: 30, h: 30, label: 'PPIP', labelFr: 'RPAP', value: null });
    canvas.page.drawText('Exempt – Exemption', { x: canvas.left + 172, y: canvas.top - idY + 2, size: 4.8, font: canvas.fonts.regular, color: TEXT_MUTED });
    drawBox(canvas, { x: 278, y: idY, w: col2 - 284, h: 30, number: '29', label: 'Code', labelFr: "Code d'emploi", value: null });

    // Employee block
    const employeeLines = [slip.employeeName, ...(slip.addressLines.length > 0 ? slip.addressLines : ['(address not on file)'])];
    drawBox(canvas, { x: 6, y: 154, w: col2 - 12, h: 92, label: "Employee's name and address – Nom et adresse de l'employé", lines: employeeLines });

    // Other information (code 40 when there is one)
    const other = slip.otherTaxableBenefitsCents > 0 ? [{ code: '40', cents: slip.otherTaxableBenefitsCents }] : [];
    drawOtherInformation(canvas, 298, other);
    drawSlipFooter(canvas, 'Working copy from posted pay runs — not the CRA-issued form. Verify every box; file through CRA Web Forms.');
  }

  for (const slip of slips) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawT4(beginSlip(page, fonts, 0, 'T4  Statement of Remuneration Paid', 'État de la rémunération payée', taxYear, "Copy 2 – To be attached to the employee's federal return / Copie 2"), slip);
    drawT4(beginSlip(page, fonts, 1, 'T4  Statement of Remuneration Paid', 'État de la rémunération payée', taxYear, "Copy 3 – For the employee's records / Copie 3"), slip);
  }

  // T4 Summary page
  const font = fonts.regular;
  const boldFont = fonts.bold;
  const page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawText('T4 Summary — Summary of Remuneration Paid', { x: MARGIN, y: PAGE_HEIGHT - MARGIN, size: 16, font: boldFont, color: TEXT_DARK });
  page.drawText(`Tax Year ${taxYear} — ${company.legalName}${payrollAccount ? ` — Account ${payrollAccount}` : ''}`, { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 18, size: 10, font, color: TEXT_MUTED });
  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 28 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - MARGIN - 28 }, thickness: 1, color: BORDER });
  let y = PAGE_HEIGHT - MARGIN - 48;
  for (const line of employerLines) {
    page.drawText(line, { x: MARGIN, y, size: 9, font, color: TEXT_MUTED });
    y -= 11;
  }
  y -= 12;
  const drawSummaryRow = (label: string, cents: number, bold = false) => {
    const f = bold ? boldFont : font;
    page.drawText(label, { x: MARGIN, y, size: bold ? 10.5 : 9.5, font: f, color: bold ? TEXT_DARK : TEXT_MUTED });
    const text = `$${formatMoney(cents)}`;
    page.drawText(text, { x: PAGE_WIDTH - MARGIN - f.widthOfTextAtSize(text, bold ? 10.5 : 9.5), y, size: bold ? 10.5 : 9.5, font: f, color: TEXT_DARK });
    y -= bold ? 18 : 15;
  };
  page.drawText(`Line 88 — Total number of T4 slips filed: ${summary.employeeCount}`, { x: MARGIN, y, size: 9.5, font, color: TEXT_MUTED });
  y -= 22;
  drawSummaryRow('Line 14 — Employment income', summary.employmentIncomeCents, true);
  y -= 6;
  drawSummaryRow("Line 16 — Employees' CPP contributions", summary.cpp1Cents);
  drawSummaryRow("Line 16A — Employees' second CPP contributions", summary.cpp2Cents);
  drawSummaryRow("Line 27 — Employer's CPP contributions", summary.cppEmployerCents);
  drawSummaryRow('Total CPP contributions', summary.cpp1Cents + summary.cpp2Cents + summary.cppEmployerCents, true);
  y -= 6;
  drawSummaryRow("Line 18 — Employees' EI premiums", summary.eiPremiumsCents);
  drawSummaryRow("Line 19 — Employer's EI premiums (1.4 ×)", summary.eiEmployerCents);
  drawSummaryRow('Total EI premiums', summary.eiPremiumsCents + summary.eiEmployerCents, true);
  y -= 6;
  drawSummaryRow('Line 22 — Income tax deducted', summary.incomeTaxDeductedCents, true);
  y -= 6;
  page.drawRectangle({ x: MARGIN, y: y - 22, width: CONTENT_WIDTH, height: 26, borderColor: TEXT_DARK, borderWidth: 1 });
  const totalRemitted = summary.cpp1Cents + summary.cpp2Cents + summary.cppEmployerCents + summary.eiPremiumsCents + summary.eiEmployerCents + summary.incomeTaxDeductedCents;
  page.drawText('Line 80 — Total deductions reported (should agree with the PD7A remittances)', { x: MARGIN + 8, y: y - 14, size: 10, font: boldFont, color: TEXT_DARK });
  const totalText = `$${formatMoney(totalRemitted)}`;
  page.drawText(totalText, { x: PAGE_WIDTH - MARGIN - 8 - boldFont.widthOfTextAtSize(totalText, 11), y: y - 14, size: 11, font: boldFont, color: TEXT_DARK });
  y -= 40;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: BORDER });
  y -= 12;
  for (const line of wrapText('Working copy — not the CRA-issued T4 Summary. Verify all information and amounts before filing.', font, 8, CONTENT_WIDTH)) {
    page.drawText(line, { x: MARGIN, y, size: 8, font, color: TEXT_MUTED });
    y -= 10;
  }

  return pdfDoc.save();
}
