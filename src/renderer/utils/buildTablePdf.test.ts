import { describe, expect, it } from 'vitest';
import { NothingToRenderError, buildTablePdf, bytesToBase64 } from './buildTablePdf';

describe('laying a report out as a PDF in the browser', () => {
  it('produces a real PDF from the rows on screen', async () => {
    const bytes = await buildTablePdf({
      title: 'Trial Balance',
      subtitle: 'Generated on: 2026-09-15',
      rows: [
        ['Code', 'Account', 'Debit', 'Credit'],
        ['1002', 'Cheque Account', '1,234.56', ''],
        ['4000', 'Service Revenue', '', '1,234.56'],
      ],
    });

    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(500);
  });

  it('pages a long report without running off the bottom of the sheet', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const rows = [['Date', 'Memo', 'Amount'], ...Array.from({ length: 400 }, (_, i) => ['2026-01-01', `Entry ${i}`, '10.00'])];
    const bytes = await buildTablePdf({ title: 'General Ledger', rows });
    // Four hundred rows cannot fit on one page; if they silently did, they were being drawn over
    // each other or off the bottom of the sheet.
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(5);
  });

  it('says so rather than handing back a blank sheet when the report is all chart and no table', async () => {
    await expect(buildTablePdf({ title: 'Business Performance', rows: [] })).rejects.toBeInstanceOf(NothingToRenderError);
  });

  it('base64-encodes bytes past the argument limit a spread would hit', () => {
    const big = new Uint8Array(200_000).fill(65);
    expect(bytesToBase64(big).length).toBeGreaterThan(260_000);
  });
});
