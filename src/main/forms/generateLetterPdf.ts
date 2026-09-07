import { PDFDocument, StandardFonts } from 'pdf-lib';
import { BRAND_900, CONTENT_WIDTH, MARGIN, PAGE_HEIGHT, PAGE_WIDTH, TEXT_DARK, TEXT_MUTED, wrapText } from './pdfStyle';

/**
 * Renders a rendered letter (paragraphs already placeholder-substituted by renderLetter) as a plain,
 * correspondence-style PDF — no branding band or table styling, because these go out on a firm's
 * letterhead and anything decorative would fight it. A leading '# ' marks a heading.
 */
export async function generateLetterPdf(title: string, paragraphs: string[], footerNote: string | null): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureRoom(needed: number) {
    if (y - needed < MARGIN + 30) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      y -= 14;
      continue;
    }
    const isHeading = paragraph.startsWith('# ');
    const text = isHeading ? paragraph.slice(2) : paragraph;
    const size = isHeading ? 11 : 10;
    const activeFont = isHeading ? boldFont : font;
    const lines = wrapText(text, activeFont, size, CONTENT_WIDTH);

    ensureRoom(lines.length * (size + 4) + (isHeading ? 8 : 0));
    if (isHeading) y -= 6;
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y, size, font: activeFont, color: isHeading ? BRAND_900 : TEXT_DARK });
      y -= size + 4;
    }
    y -= isHeading ? 4 : 8;
  }

  if (footerNote) {
    for (const [i, p] of pdfDoc.getPages().entries()) {
      p.drawText(`${footerNote}   ·   Page ${i + 1} of ${pdfDoc.getPageCount()}`, { x: MARGIN, y: MARGIN - 18, size: 7, font, color: TEXT_MUTED });
    }
  }

  pdfDoc.setTitle(title);
  return pdfDoc.save();
}
