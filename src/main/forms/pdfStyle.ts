import { rgb, type PDFFont, PDFDocument, PDFPage } from 'pdf-lib';

// Same brand palette as generateFormPdf.ts / generateInvoicePdf.ts (pdf-lib needs plain 0–1 rgb()
// values, not Tailwind hex tokens) — pulled out here since a third+ PDF generator needing it would
// otherwise mean a third copy-paste of the same constants.
export const BRAND_900 = rgb(0.0824, 0.2588, 0.1686); // #15422b
export const BRAND_700 = rgb(0.1098, 0.3882, 0.2353); // #1c633c
export const BRAND_50 = rgb(0.9412, 0.9804, 0.9529); // #f0faf3
export const GOLD_400 = rgb(0.8745, 0.6627, 0.1922); // #dfa931
export const GOLD_50 = rgb(0.9922, 0.9725, 0.9255); // #fdf8ec
export const GOLD_700 = rgb(0.5294, 0.3294, 0.0902); // #875417
export const WHITE = rgb(1, 1, 1);
export const TEXT_DARK = rgb(0.15, 0.15, 0.15);
export const TEXT_MUTED = rgb(0.4, 0.4, 0.4);
export const BORDER = rgb(0.75, 0.78, 0.75);
export const ROW_STRIPE = rgb(0.97, 0.99, 0.975);

export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;
export const MARGIN = 50;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
export const HEADER_HEIGHT = 70;

/** Draws the company logo, if any, inside a box whose top-right corner is (right, top). Returns
 * the width used so the caller can keep text clear of it. Nothing is drawn for a missing or
 * unreadable image; a bad logo must never stop a PDF. */
export async function drawCompanyLogo(doc: PDFDocument, page: PDFPage, logoDataUrl: string | null | undefined, right: number, top: number, maxHeight: number, maxWidth: number): Promise<number> {
  if (!logoDataUrl) return 0;
  try {
    const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(logoDataUrl);
    if (!match) return 0;
    const bytes = Buffer.from(match[2], 'base64');
    const image = match[1] === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const scale = Math.min(maxHeight / image.height, maxWidth / image.width, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: right - width, y: top - height, width, height });
    return width;
  } catch {
    return 0;
  }
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
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

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function companyAddressLines(company: {
  businessAddressLine1: string | null;
  businessAddressLine2: string | null;
  businessCity: string | null;
  businessProvince: string | null;
  businessPostalCode: string | null;
}): string[] {
  const lines: string[] = [];
  if (company.businessAddressLine1) lines.push([company.businessAddressLine1, company.businessAddressLine2].filter(Boolean).join(', '));
  const cityLine = [company.businessCity, [company.businessProvince, company.businessPostalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (cityLine) lines.push(cityLine);
  return lines;
}
