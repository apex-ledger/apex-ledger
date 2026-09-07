import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildExcelWorkbook } from './excelWorkbook';

describe('Excel report workbooks', () => {
  it('creates a genuine XLSX with report title, headers, numbers, and leading-zero references intact', async () => {
    const bytes = await buildExcelWorkbook({
      title: 'Trial Balance / Final',
      rows: [
        ['Code', 'Account', 'Amount'],
        ['0542', 'Chequing', '1234.56'],
        ['5100', 'Rent', '-500.00'],
      ],
    });

    expect(bytes.subarray(0, 2).toString('ascii')).toBe('PK');
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']));

    const workbookXml = strFromU8(files['xl/workbook.xml']);
    const sheetXml = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(workbookXml).toContain('name="Trial Balance - Final"');
    expect(sheetXml).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Trial Balance / Final</t>');
    expect(sheetXml).toContain('<c r="A3" s="2" t="inlineStr"><is><t xml:space="preserve">Code</t>');
    expect(sheetXml).toContain('<c r="A4" t="inlineStr"><is><t xml:space="preserve">0542</t>');
    expect(sheetXml).toContain('<c r="C4" s="4"><v>1234.56</v></c>');
    expect(sheetXml).toContain('<c r="C5" s="4"><v>-500</v></c>');
  });

  it('stores formula-looking report text as an inline string rather than an executable formula', async () => {
    const bytes = await buildExcelWorkbook({ title: 'Safe Export', rows: [['Description'], ['=2+2']] });
    const files = unzipSync(bytes);
    const sheetXml = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(sheetXml).toContain('t="inlineStr"><is><t xml:space="preserve">=2+2</t>');
    expect(sheetXml).not.toContain('<f>');
  });

  it('keeps report metadata above the real multi-column header', async () => {
    const bytes = await buildExcelWorkbook({
      title: 'General Ledger',
      rows: [['Sample Company'], ['October - December, 2025'], ['Chequing'], [], ['Date', 'Transaction Type', 'Debit'], ['2025-10-01', 'Bill', '100.00']],
    });
    const sheetXml = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);
    expect(sheetXml).toContain('ySplit="7" topLeftCell="A8"');
    expect(sheetXml).toContain('<c r="A7" s="2" t="inlineStr"');
    expect(sheetXml).toContain('<c r="C8" s="4"><v>100</v></c>');
  });
});
