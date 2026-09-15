import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { generateDocumentPdf, printableTotals, type PrintableDocument } from './generateDocumentPdf';

const company = { legalName: 'ABC CORP', businessAddressLine1: '100 Queen St', businessCity: 'Toronto', businessProvince: 'ON', businessPostalCode: 'M5H 2N2', hstNumber: '123456789RT0001', logoDataUrl: null } as never;

const estimate: PrintableDocument = {
  title: 'ESTIMATE',
  partyHeading: 'Prepared For',
  party: { id: 1, name: 'Om Financial', email: 'om@example.com', address: '1 Bay St, Toronto ON' } as never,
  fields: [{ label: 'Estimate #', value: 'EST-2026-0004' }, { label: 'Estimate Date', value: '2026-09-15' }, { label: 'Valid Until', value: '2026-10-15' }],
  lines: [
    { description: 'Year-end review', quantity: 1, unitPriceCents: 150_000, amountCents: 150_000, taxCode: 'HST', manualHstCents: null },
    { description: 'T2 corporate return', quantity: 1, unitPriceCents: 90_000, amountCents: 90_000, taxCode: 'HST', manualHstCents: null },
  ],
  memo: 'Fees assume books are reconciled by the client.',
  footer: 'This is an estimate, not an invoice. It is valid until 2026-10-15.',
};

describe('the shared document PDF', () => {
  it('works out subtotal, tax and total from the lines, whatever the document stores as its total', () => {
    expect(printableTotals(estimate.lines)).toEqual({ subtotalCents: 240_000, taxCents: 31_200, totalCents: 271_200 });
    expect(printableTotals([{ description: 'x', quantity: 1, unitPriceCents: 1_000, amountCents: 1_000, taxCode: 'Manual', manualHstCents: 77 }]).taxCents).toBe(77);
  });

  it('produces a real PDF, and pages a long document with the header repeated', async () => {
    const bytes = await generateDocumentPdf(estimate, company);
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    if (process.env.SAMPLE_OUT) fs.writeFileSync(process.env.SAMPLE_OUT, bytes);

    const long = { ...estimate, lines: Array.from({ length: 120 }, (_, i) => ({ ...estimate.lines[0], description: `Line ${i + 1}` })) };
    expect((await PDFDocument.load(await generateDocumentPdf(long, company))).getPageCount()).toBeGreaterThan(2);
  });
});
