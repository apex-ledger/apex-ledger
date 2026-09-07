import { strToU8, zipSync } from 'fflate';

export interface ExcelWorkbookInput {
  title: string;
  rows: string[][];
}

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function safeWorksheetName(title: string): string {
  const safe = title.replace(/[\\/*?:[\]]/g, '-').trim();
  return (safe || 'Report').slice(0, 31);
}

function columnName(index: number): string {
  let value = index;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

type ExcelValue = { kind: 'text'; value: string } | { kind: 'number'; value: number; decimal: boolean };

/** Keep reference numbers with a leading zero as text, while making ordinary report figures real
 * Excel numbers that can be summed and used in formulas. Dates and document numbers containing
 * punctuation remain text automatically. */
function excelCellValue(value: string): ExcelValue {
  const trimmed = value.trim();
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) return { kind: 'text', value };
  const numeric = Number(trimmed);
  return Number.isFinite(numeric)
    ? { kind: 'number', value: numeric, decimal: trimmed.includes('.') }
    : { kind: 'text', value };
}

function cellXml(reference: string, value: ExcelValue, style: number): string {
  if (value.kind === 'number') {
    const numberStyle = value.decimal ? 4 : 3;
    return `<c r="${reference}" s="${style || numberStyle}"><v>${value.value}</v></c>`;
  }
  return `<c r="${reference}"${style ? ` s="${style}"` : ''} t="inlineStr"><is><t xml:space="preserve">${xml(value.value)}</t></is></c>`;
}

function worksheetXml(input: ExcelWorkbookInput): string {
  const columnCount = Math.max(1, ...input.rows.map((row) => row.length));
  const firstHeaderIndex = input.rows.findIndex((row) => row.length > 1 && row.some((cell) => cell.trim() !== ''));
  const frozenRows = firstHeaderIndex >= 0 ? firstHeaderIndex + 3 : 1;
  const widths = Array.from({ length: columnCount }, (_, index) => {
    const values = [index === 0 ? input.title : '', ...input.rows.map((row) => row[index] ?? '')];
    return Math.min(50, Math.max(10, ...values.map((value) => value.length)) + 2);
  });

  const sheetRows: string[] = [];
  sheetRows.push(`<row r="1" ht="24" customHeight="1">${cellXml('A1', { kind: 'text', value: input.title }, 1)}</row>`);
  sheetRows.push('<row r="2"/>');

  let nextRowIsHeader = true;
  input.rows.forEach((sourceRow, sourceIndex) => {
    const rowNumber = sourceIndex + 3;
    if (sourceRow.length === 0 || sourceRow.every((cell) => cell.trim() === '')) {
      sheetRows.push(`<row r="${rowNumber}"/>`);
      nextRowIsHeader = true;
      return;
    }
    const style = nextRowIsHeader && sourceRow.length > 1 ? 2 : 0;
    const cells = sourceRow
      .map((value, index) => cellXml(`${columnName(index + 1)}${rowNumber}`, excelCellValue(value), style))
      .join('');
    sheetRows.push(`<row r="${rowNumber}">${cells}</row>`);
    if (style === 2) nextRowIsHeader = false;
  });

  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
  const lastColumn = columnName(columnCount);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="${frozenRows}" topLeftCell="A${frozenRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${cols}</cols>
  <sheetData>${sheetRows.join('')}</sheetData>
  <mergeCells count="1"><mergeCell ref="A1:${lastColumn}1"/></mergeCells>
</worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="FF173D2B"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF285E43"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export async function buildExcelWorkbook(input: ExcelWorkbookInput): Promise<Buffer> {
  const sheetName = safeWorksheetName(input.title);
  const files = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(STYLES_XML),
    'xl/worksheets/sheet1.xml': strToU8(worksheetXml(input)),
  };
  return Buffer.from(zipSync(files, { level: 6 }));
}
