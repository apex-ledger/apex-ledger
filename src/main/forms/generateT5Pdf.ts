import { PDFDocument } from 'pdf-lib';
import type { CompanyInfo } from '@shared/domain/types';
import type { T5SlipResult } from '@shared/domain/payroll/computeT5Slip';
import { PAGE_HEIGHT, PAGE_WIDTH, companyAddressLines } from './pdfStyle';
import { SLIP_WIDTH, beginSlip, boxMoney, drawBox, drawSlipFooter, formatSinForSlip, slipFonts, type SlipCanvas } from './craSlipLayout';

/**
 * T5 — Statement of Investment Income, in CRA's arrangement: the dividend boxes across the top
 * (24/25/26 eligible, 10/11/12 other than eligible), interest and capital gains dividends on the
 * next row, the recipient's identification (22 number, 23 type, 21 report code, 27 currency) in
 * the middle, the recipient's name and address at the lower left and the payer's at the lower
 * right. Two copies to a page per recipient.
 */
export async function generateT5Pdf(company: CompanyInfo, slips: T5SlipResult[], taxYear: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fonts = await slipFonts(pdfDoc);
  const payerLines = [company.legalName, ...companyAddressLines(company)];

  function drawT5(canvas: SlipCanvas, slip: T5SlipResult): void {
    const cols = 6;
    const gap = 4;
    const w = (SLIP_WIDTH - 12 - gap * (cols - 1)) / cols;
    const at = (i: number) => 6 + i * (w + gap);
    const row1: [string, string, string, number][] = [
      ['24', 'Eligible dividends – actual', 'Montant réel des dividendes déterminés', slip.eligibleDividendsCents],
      ['25', 'Eligible dividends – taxable', 'Montant imposable des dividendes déterminés', slip.eligibleTaxableCents],
      ['26', 'Eligible dividends – tax credit', 'Crédit d’impôt pour dividendes déterminés', slip.eligibleDtcCents],
      ['13', 'Interest from Canadian sources', 'Intérêts de source canadienne', slip.interestCents],
      ['18', 'Capital gains dividends', 'Dividendes sur gains en capital', 0],
      ['14', 'Other income (Canadian)', 'Autres revenus de source canadienne', 0],
    ];
    row1.forEach(([n, l, f, c], i) => drawBox(canvas, { x: at(i), y: 28, w, h: 34, number: n, label: l, labelFr: f, value: boxMoney(c) }));
    const row2: [string, string, string, number][] = [
      ['10', 'Other dividends – actual', 'Montant réel des dividendes autres que déterminés', slip.nonEligibleDividendsCents],
      ['11', 'Other dividends – taxable', 'Montant imposable des dividendes autres que déterminés', slip.nonEligibleTaxableCents],
      ['12', 'Other dividends – tax credit', 'Crédit d’impôt pour dividendes autres que déterminés', slip.nonEligibleDtcCents],
    ];
    row2.forEach(([n, l, f, c], i) => drawBox(canvas, { x: at(i), y: 66, w, h: 34, number: n, label: l, labelFr: f, value: boxMoney(c) }));

    const recipientType = slip.businessNumber ? '3' : '1';
    drawBox(canvas, { x: at(3), y: 66, w, h: 34, number: '21', label: 'Report code', labelFr: 'Code du feuillet', value: 'O', valueSize: 9 });
    drawBox(canvas, { x: at(4), y: 66, w, h: 34, number: '23', label: 'Recipient type', labelFr: 'Type de bénéficiaire', value: recipientType, valueSize: 9 });
    drawBox(canvas, { x: at(5), y: 66, w, h: 34, number: '27', label: 'Foreign currency', labelFr: 'Devises étrangères', value: null });
    drawBox(canvas, { x: 6, y: 104, w: 3 * w + 2 * gap, h: 30, number: '22', label: 'Recipient identification number', labelFr: 'Numéro d’identification du bénéficiaire', value: slip.businessNumber ?? formatSinForSlip(slip.sin) ?? null, valueSize: 9 });

    const half = (SLIP_WIDTH - 12 - gap) / 2;
    drawBox(canvas, { x: 6, y: 140, w: half, h: 96, label: "Recipient's name (last name first) and address – Nom, prénom et adresse du bénéficiaire", lines: [slip.shareholderName] });
    drawBox(canvas, { x: 6 + half + gap, y: 140, w: half, h: 96, label: "Payer's name and address – Nom et adresse du payeur", lines: payerLines });
    drawBox(canvas, { x: 6, y: 240, w: SLIP_WIDTH - 12, h: 30, label: 'Currency and identification codes – Codes de devise et d’identification', lines: ['CAD'] });
    drawSlipFooter(canvas, 'Working copy produced by Apex Ledger from recorded dividend and interest payments — not the CRA-issued form. Verify before filing.');
  }

  for (const slip of slips) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawT5(beginSlip(page, fonts, 0, 'T5  Statement of Investment Income', 'État des revenus de placements', taxYear, "Copy 2 – To be attached to the recipient's return / Copie 2"), slip);
    drawT5(beginSlip(page, fonts, 1, 'T5  Statement of Investment Income', 'État des revenus de placements', taxYear, "Copy 3 – For the recipient's records / Copie 3"), slip);
  }
  if (slips.length === 0) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawText(`No T5 slips for ${taxYear}.`, { x: 50, y: PAGE_HEIGHT - 80, size: 12, font: fonts.regular });
  }
  return pdfDoc.save();
}
