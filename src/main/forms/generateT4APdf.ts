import { PDFDocument } from 'pdf-lib';
import type { CompanyInfo } from '@shared/domain/types';
import type { T4ASlipResult } from '@shared/domain/payroll/computeT4ASlip';
import { PAGE_HEIGHT, PAGE_WIDTH, companyAddressLines } from './pdfStyle';
import { SLIP_WIDTH, beginSlip, boxMoney, drawBox, drawOtherInformation, drawSlipFooter, formatSinForSlip, slipFonts, type SlipCanvas } from './craSlipLayout';

/**
 * T4A — Statement of Pension, Retirement, Annuity, and Other Income, in CRA's arrangement: payer
 * at the top left with box 061, the recipient's identifiers (012 SIN, 013 account number) beneath,
 * the recipient's name and address in the lower left, and the figure boxes in two columns at the
 * right. This app reports box 048 (fees for services); the other boxes print blank as on the
 * form. Two copies to a page per recipient.
 */
export async function generateT4APdf(company: CompanyInfo, slips: T4ASlipResult[], taxYear: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fonts = await slipFonts(pdfDoc);
  const payerAccount = company.payrollNumber ?? (company.businessNumber ? `${company.businessNumber}RP0001` : '');
  const payerLines = [company.legalName, ...companyAddressLines(company)];

  function drawT4A(canvas: SlipCanvas, slip: T4ASlipResult): void {
    const figW = 118;
    const col2 = SLIP_WIDTH - 6 - 2 * figW - 4;
    const col3 = col2 + figW + 4;
    drawBox(canvas, { x: 6, y: 28, w: col2 - 12, h: 58, label: "Payer's name – Nom du payeur", lines: payerLines });
    drawBox(canvas, { x: 6, y: 90, w: col2 - 12, h: 26, number: '061', label: "Payer's account number – Numéro de compte du payeur", lines: [payerAccount] });
    drawBox(canvas, { x: 6, y: 120, w: 130, h: 30, number: '012', label: 'Social insurance number', labelFr: "Numéro d'assurance sociale", value: formatSinForSlip(slip.sin) || null, valueSize: 9 });
    drawBox(canvas, { x: 140, y: 120, w: col2 - 146, h: 30, number: '013', label: "Recipient's account number", labelFr: 'Numéro de compte du bénéficiaire', value: slip.businessNumber ?? null, valueSize: 8 });
    drawBox(canvas, { x: 6, y: 154, w: col2 - 12, h: 92, label: "Recipient's name and address – Nom et adresse du bénéficiaire", lines: [slip.vendorName] });

    const rows: [string, string, string, number | null, string, string, string, number | null][] = [
      ['016', 'Pension or superannuation – line 11500', 'Prestations de retraite ou autres pensions – ligne 11500', null, '022', 'Income tax deducted – line 43700', 'Impôt sur le revenu retenu – ligne 43700', null],
      ['018', 'Lump-sum payments – line 13000', 'Paiements forfaitaires – ligne 13000', null, '024', 'Annuities', 'Rentes', null],
      ['020', 'Self-employed commissions', 'Commissions d’un travail indépendant', null, '048', 'Fees for services', 'Honoraires ou autres sommes pour services rendus', slip.feesForServicesCents],
    ];
    rows.forEach(([n1, l1, f1, c1, n2, l2, f2, c2], i) => {
      const y = 28 + i * 32;
      drawBox(canvas, { x: col2, y, w: figW, h: 30, number: n1, label: l1, labelFr: f1, value: c1 === null ? null : boxMoney(c1, true) });
      drawBox(canvas, { x: col3, y, w: figW, h: 30, number: n2, label: l2, labelFr: f2, value: c2 === null ? null : boxMoney(c2, true) });
    });
    drawOtherInformation(canvas, 298, []);
    drawSlipFooter(canvas, 'Working copy produced by Apex Ledger from paid bills to this T4A-flagged vendor — not the CRA-issued form. Verify before filing.');
  }

  for (const slip of slips) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawT4A(beginSlip(page, fonts, 0, 'T4A  Statement of Pension, Retirement, Annuity, and Other Income', 'État du revenu de pension, de retraite, de rente ou d’autres sources', taxYear, "Copy 2 – To be attached to the recipient's return / Copie 2"), slip);
    drawT4A(beginSlip(page, fonts, 1, 'T4A  Statement of Pension, Retirement, Annuity, and Other Income', 'État du revenu de pension, de retraite, de rente ou d’autres sources', taxYear, "Copy 3 – For the recipient's records / Copie 3"), slip);
  }
  if (slips.length === 0) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawText(`No T4A slips for ${taxYear}.`, { x: 50, y: PAGE_HEIGHT - 80, size: 12, font: fonts.regular });
  }
  return pdfDoc.save();
}
