/**
 * Lays the rows of a report out as a real PDF, in the browser.
 *
 * Reports used to reach a PDF only through Chromium's printToPDF in the Electron main process,
 * which does not exist on the web — so on the web the button failed, and emailing a report was
 * impossible for want of anything to attach. Building it here works the same in both, and gives
 * the Email button a file to send.
 *
 * It renders the report's TABLE, not a picture of the screen: columns sized to their contents,
 * repeating headers, page numbers. A chart-only report has no rows and says so rather than
 * producing a blank sheet.
 *
 * pdf-lib is imported dynamically — it is a few hundred kilobytes that only matters at the moment
 * someone actually asks for a PDF, and never on the path that just opens a report.
 */

const PAGE_LONG = 842; // A4 landscape width
const PAGE_SHORT = 595;
const MARGIN = 32;
const FONT_SIZE = 8;
const HEADER_SIZE = 8.5;
const TITLE_SIZE = 14;
const ROW_HEIGHT = 13;

export class NothingToRenderError extends Error {}

export async function buildTablePdf({ title, subtitle, rows }: { title: string; subtitle?: string; rows: string[][] }): Promise<Uint8Array> {
  if (rows.length === 0) throw new NothingToRenderError('This report has no table on screen to put in a PDF.');
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Landscape for anything with more than five columns — a trial balance in portrait is unreadable.
  const columnCount = Math.max(...rows.map((row) => row.length));
  const landscape = columnCount > 5;
  const pageWidth = landscape ? PAGE_LONG : PAGE_SHORT;
  const pageHeight = landscape ? PAGE_SHORT : PAGE_LONG;
  const contentWidth = pageWidth - MARGIN * 2;

  // Each column gets its widest cell, then every column is scaled to fit the page rather than
  // letting a long memo push the money columns off the right edge.
  const naturalWidths = Array.from({ length: columnCount }, (_, column) =>
    Math.max(24, ...rows.map((row) => (row[column] ? font.widthOfTextAtSize(row[column], FONT_SIZE) + 8 : 24))),
  );
  const naturalTotal = naturalWidths.reduce((sum, w) => sum + w, 0);
  const scale = naturalTotal > contentWidth ? contentWidth / naturalTotal : 1;
  const widths = naturalWidths.map((w) => w * scale);

  const TEXT = rgb(0.15, 0.15, 0.15);
  const MUTED = rgb(0.45, 0.45, 0.45);
  const RULE = rgb(0.85, 0.85, 0.85);
  const HEAD_BG = rgb(0.94, 0.96, 0.95);

  // The first row of a report table is its header; it repeats at the top of every page so page 4
  // of a general ledger is still readable on its own.
  const [headerRow, ...bodyRows] = rows;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - MARGIN;
  let pageNumber = 1;

  function truncate(text: string, maxWidth: number, size: number): string {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
    return `${cut}…`;
  }

  function drawRow(cells: string[], { bold = false }: { bold?: boolean } = {}) {
    let x = MARGIN;
    if (bold) page.drawRectangle({ x: MARGIN, y: y - 3.5, width: contentWidth, height: ROW_HEIGHT, color: HEAD_BG });
    for (let column = 0; column < columnCount; column += 1) {
      const text = cells[column] ?? '';
      if (text) {
        // Figures read right-aligned, words left — decided per cell so a column of amounts lines
        // up on the decimal even when its heading is a word.
        const numeric = /^[-(]?[$]?[\d,]+\.?\d*[)%]?$/.test(text.trim());
        const size = bold ? HEADER_SIZE : FONT_SIZE;
        const shown = truncate(text, widths[column] - 8, size);
        const textWidth = (bold ? boldFont : font).widthOfTextAtSize(shown, size);
        page.drawText(shown, {
          x: numeric && !bold ? x + widths[column] - 4 - textWidth : x + 4,
          y,
          size,
          font: bold ? boldFont : font,
          color: bold ? TEXT : TEXT,
        });
      }
      x += widths[column];
    }
    y -= ROW_HEIGHT;
  }

  function drawPageFurniture() {
    page.drawText(title, { x: MARGIN, y: pageHeight - MARGIN + 4, size: TITLE_SIZE, font: boldFont, color: TEXT });
    if (subtitle) page.drawText(subtitle, { x: MARGIN, y: pageHeight - MARGIN - 10, size: FONT_SIZE, font, color: MUTED });
    page.drawText(`Page ${pageNumber}`, { x: pageWidth - MARGIN - 40, y: MARGIN - 14, size: FONT_SIZE, font, color: MUTED });
  }

  drawPageFurniture();
  y -= subtitle ? 28 : 18;
  drawRow(headerRow, { bold: true });
  page.drawLine({ start: { x: MARGIN, y: y + ROW_HEIGHT - 4 }, end: { x: MARGIN + contentWidth, y: y + ROW_HEIGHT - 4 }, thickness: 0.5, color: RULE });

  for (const row of bodyRows) {
    if (y < MARGIN + ROW_HEIGHT) {
      page = pdf.addPage([pageWidth, pageHeight]);
      pageNumber += 1;
      y = pageHeight - MARGIN;
      drawPageFurniture();
      y -= subtitle ? 28 : 18;
      drawRow(headerRow, { bold: true });
      page.drawLine({ start: { x: MARGIN, y: y + ROW_HEIGHT - 4 }, end: { x: MARGIN + contentWidth, y: y + ROW_HEIGHT - 4 }, thickness: 0.5, color: RULE });
    }
    drawRow(row);
  }

  return pdf.save();
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked: spreading a megabyte-long array into String.fromCharCode overflows the call stack.
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

/** Hands the browser a real file to save. Works the same in Electron's renderer, which routes it
 * through the app's own download handling. */
export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  // Copied into a plain ArrayBuffer-backed view: a Uint8Array over a SharedArrayBuffer is not a
  // valid BlobPart, and pdf-lib's return type does not rule that out.
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
