import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import type { ClientRecord } from '@shared/domain/types';
import { PAGE_WIDTH, PAGE_HEIGHT, MARGIN, CONTENT_WIDTH, HEADER_HEIGHT, BRAND_900, BRAND_50, GOLD_400, GOLD_50, GOLD_700, WHITE, TEXT_DARK, ROW_STRIPE, wrapText } from './pdfStyle';
import { localIsoDate } from '@shared/domain/dates/localDate';

interface Column {
  label: string;
  x: number;
  width: number;
  get: (client: ClientRecord) => string;
}

/** Same basic roster as buildClientSheetCsv.ts (Name/DOB/Phone/Address/Email/Service), laid out
 * as a printable table instead of a spreadsheet — for handing a client list to someone who wants
 * a document, not a file to reopen and edit. Follows generateInvoicePdf.ts's page/table pattern. */
export async function generateClientSheetPdf(clients: ClientRecord[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page!: PDFPage;
  let y!: number;
  let pageNumber = 0;

  function newPage() {
    pageNumber += 1;
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: BRAND_50 });
    if (pageNumber === 1) {
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_HEIGHT, width: PAGE_WIDTH, height: HEADER_HEIGHT, color: BRAND_900 });
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_HEIGHT - 4, width: PAGE_WIDTH, height: 4, color: GOLD_400 });
      page.drawText('CLIENT ROSTER', { x: MARGIN, y: PAGE_HEIGHT - 44, size: 22, font: boldFont, color: WHITE });
      page.drawText(`${clients.length} client${clients.length === 1 ? '' : 's'} — generated ${localIsoDate()}`, {
        x: MARGIN,
        y: PAGE_HEIGHT - 62,
        size: 10,
        font,
        color: rgb(0.85, 0.93, 0.87),
      });
      y = PAGE_HEIGHT - HEADER_HEIGHT - 22;
    } else {
      page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 4, width: PAGE_WIDTH, height: 4, color: GOLD_400 });
      page.drawText('Client Roster (continued)', { x: MARGIN, y: PAGE_HEIGHT - 26, size: 10, font: boldFont, color: BRAND_900 });
      y = PAGE_HEIGHT - 46;
    }
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 30) newPage();
  }

  newPage();

  const cols: Column[] = [
    { label: 'Name', x: MARGIN, width: 110, get: (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || c.clientName },
    { label: 'DOB', x: MARGIN + 110, width: 65, get: (c) => c.dateOfBirth ?? '—' },
    { label: 'Phone', x: MARGIN + 175, width: 85, get: (c) => c.phone ?? '—' },
    { label: 'Email', x: MARGIN + 260, width: 130, get: (c) => c.email ?? '—' },
    { label: 'Service', x: MARGIN + 390, width: 122, get: (c) => c.returnType ?? (c.insuranceTypes.length > 0 ? c.insuranceTypes.join(', ') : '—') },
  ];

  function drawTableHeader() {
    ensureSpace(24);
    page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_WIDTH, height: 18, color: GOLD_50 });
    for (const col of cols) {
      page.drawText(col.label, { x: col.x + 4, y, size: 9, font: boldFont, color: GOLD_700 });
    }
    y -= 20;
  }

  drawTableHeader();

  clients.forEach((client, i) => {
    const cellLines = cols.map((col) => wrapText(col.get(client), font, 8.5, col.width - 8));
    const rowHeight = Math.max(16, Math.max(...cellLines.map((lines) => lines.length)) * 11 + 4);
    ensureSpace(rowHeight + 4);
    if (i % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - rowHeight + 4, width: CONTENT_WIDTH, height: rowHeight - 2, color: ROW_STRIPE });

    cols.forEach((col, ci) => {
      cellLines[ci].forEach((line, li) => {
        page.drawText(line, { x: col.x + 4, y: y - li * 11, size: 8.5, font, color: TEXT_DARK });
      });
    });

    y -= rowHeight;
  });

  return pdfDoc.save();
}
