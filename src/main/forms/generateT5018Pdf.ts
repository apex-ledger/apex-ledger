import { PDFDocument } from 'pdf-lib';
import type { CompanyInfo } from '@shared/domain/types';
import type { T5018SlipResult } from '@shared/domain/payroll/computeT5018Slip';
import { PAGE_HEIGHT, PAGE_WIDTH, companyAddressLines } from './pdfStyle';
import { SLIP_WIDTH, beginSlip, boxMoney, drawBox, drawSlipFooter, formatSinForSlip, slipFonts, type SlipCanvas } from './craSlipLayout';

/**
 * T5018 — Statement of Contract Payments, in CRA's arrangement: the reporting period end (box
 * 20) and the payment (box 22) at the top right, the recipient's identification number (box 24)
 * and name/address at the left, the payer's name, address and account number at the lower right.
 * Two copies to a page per subcontractor.
 */
export async function generateT5018Pdf(company: CompanyInfo, slips: T5018SlipResult[], taxYear: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fonts = await slipFonts(pdfDoc);
  const payerAccount = company.businessNumber ? `${company.businessNumber}RZ0001` : '';
  const payerLines = [company.legalName, ...companyAddressLines(company)];

  function drawT5018(canvas: SlipCanvas, slip: T5018SlipResult): void {
    const figW = 150;
    const right = SLIP_WIDTH - 6 - figW;
    drawBox(canvas, { x: right, y: 28, w: figW, h: 30, number: '20', label: 'Reporting period ending (YYYY-MM-DD)', labelFr: 'Fin de la période de déclaration', value: `${taxYear}-12-31`, valueSize: 9 });
    drawBox(canvas, { x: right, y: 62, w: figW, h: 30, number: '22', label: 'Construction subcontractor payments', labelFr: 'Paiements aux sous-traitants en construction', value: boxMoney(slip.totalPaymentsCents, true) });
    drawBox(canvas, { x: 6, y: 28, w: right - 12, h: 30, number: '24', label: "Recipient's identification number (BN or SIN)", labelFr: 'Numéro d’identification du bénéficiaire (NE ou NAS)', value: slip.businessNumber ?? formatSinForSlip(slip.sin) ?? null, valueSize: 9 });
    drawBox(canvas, { x: 6, y: 62, w: right - 12, h: 96, label: "Recipient's name and address – Nom et adresse du bénéficiaire", lines: [slip.vendorName] });
    drawBox(canvas, { x: 6, y: 162, w: right - 12, h: 26, label: "Payer's account number – Numéro de compte du payeur", lines: [payerAccount] });
    drawBox(canvas, { x: 6, y: 192, w: SLIP_WIDTH - 12, h: 80, label: "Payer's name and address – Nom et adresse du payeur", lines: payerLines });
    drawSlipFooter(canvas, 'Working copy produced by Apex Ledger from paid bills to this T5018-flagged subcontractor — not the CRA-issued form. Box 22 includes GST/HST. Verify before filing.');
  }

  for (const slip of slips) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawT5018(beginSlip(page, fonts, 0, 'T5018  Statement of Contract Payments', 'État des paiements contractuels', taxYear, "Copy 2 – For the recipient / Copie 2"), slip);
    drawT5018(beginSlip(page, fonts, 1, 'T5018  Statement of Contract Payments', 'État des paiements contractuels', taxYear, "Copy 3 – For the recipient's records / Copie 3"), slip);
  }
  if (slips.length === 0) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawText(`No T5018 slips for ${taxYear}.`, { x: 50, y: PAGE_HEIGHT - 80, size: 12, font: fonts.regular });
  }
  return pdfDoc.save();
}
