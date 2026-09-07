import fs from 'node:fs';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { excelSerialToIsoDate } from '@shared/domain/importing/reportLayout';

/**
 * Reads the first worksheet of an .xlsx file into rows of text, the way a CSV would arrive —
 * QuickBooks Online, Xero and Excel-minded bookkeepers hand over Excel files far more often than
 * CSVs, and the import parsers only understand text. Dates come back as YYYY-MM-DD (read from the
 * cell's number format), numbers as plain digits, everything else as its text.
 *
 * An .xlsx is a zip of XML parts; fflate (already used to write Excel exports) opens it, and the
 * handful of parts that matter are small enough to read with targeted patterns rather than an XML
 * library. Formulas contribute their cached value, which is what Excel last displayed.
 */
export interface SpreadsheetSheet {
  name: string;
  rows: string[][];
}

const BUILT_IN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:]+)="([^"]*)"/g)) result[match[1]] = decodeXml(match[2]);
  return result;
}

function textRuns(xml: string): string {
  return Array.from(xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (match) => decodeXml(match[1])).join('');
}

/** A custom number format is a date format when it spells out day/month/year/hour parts and
 * carries no digit placeholders (a currency or accounting format has "0" and "#"). */
export function isDateNumberFormat(numFmtId: number, formatCode: string | undefined): boolean {
  if (BUILT_IN_DATE_FORMATS.has(numFmtId)) return true;
  if (!formatCode) return false;
  const bare = formatCode.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[ymdh]/i.test(bare) && !/[#0?]/.test(bare);
}

function columnIndex(reference: string): number {
  let index = 0;
  for (const letter of reference.replace(/\d+$/, '')) index = index * 26 + (letter.toUpperCase().charCodeAt(0) - 64);
  return index - 1;
}

function formatNumber(raw: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  return String(Number(value.toPrecision(15)));
}

export function readWorkbook(data: Uint8Array): SpreadsheetSheet[] {
  const files = unzipSync(data);
  const part = (name: string): string | null => {
    const key = Object.keys(files).find((candidate) => candidate.replace(/^\//, '').toLowerCase() === name.toLowerCase());
    return key ? strFromU8(files[key]) : null;
  };
  const workbook = part('xl/workbook.xml');
  if (!workbook) throw new Error('This is not an Excel workbook (.xlsx).');
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(workbook);

  const relationships = new Map<string, string>();
  for (const match of (part('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const attrs = attributes(match[0]);
    if (attrs.Id && attrs.Target) relationships.set(attrs.Id, attrs.Target.startsWith('/') ? attrs.Target.slice(1) : `xl/${attrs.Target}`);
  }

  const sharedStrings = Array.from((part('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g), (match) => textRuns(match[1]));

  const styles = part('xl/styles.xml') ?? '';
  const customFormats = new Map<number, string>();
  for (const match of styles.matchAll(/<numFmt\b[^>]*\/?>/g)) {
    const attrs = attributes(match[0]);
    customFormats.set(Number(attrs.numFmtId), attrs.formatCode ?? '');
  }
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '';
  const dateStyles = Array.from(cellXfs.matchAll(/<xf\b[^>]*\/?>/g), (match) => {
    const id = Number(attributes(match[0]).numFmtId ?? 0);
    return isDateNumberFormat(id, customFormats.get(id));
  });

  const sheets: SpreadsheetSheet[] = [];
  for (const match of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const attrs = attributes(match[0]);
    const target = relationships.get(attrs['r:id'] ?? '') ?? 'xl/worksheets/sheet1.xml';
    const xml = part(target);
    if (xml === null) continue;
    sheets.push({ name: attrs.name ?? `Sheet${sheets.length + 1}`, rows: readSheetRows(xml, sharedStrings, dateStyles, date1904) });
  }
  if (sheets.length === 0) throw new Error('The workbook has no worksheets.');
  return sheets;
}

function readSheetRows(xml: string, sharedStrings: string[], dateStyles: boolean[], date1904: boolean): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attributes(rowMatch[1]).r ?? rows.length + 1);
    while (rows.length < rowNumber - 1) rows.push([]);
    const row: string[] = [];
    for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = attributes(cellMatch[1]);
      const index = attrs.r ? columnIndex(attrs.r) : row.length;
      while (row.length < index) row.push('');
      row[index] = cellText(attrs, cellMatch[2] ?? '', sharedStrings, dateStyles, date1904);
    }
    rows.push(row);
  }
  return rows;
}

function cellText(attrs: Record<string, string>, inner: string, sharedStrings: string[], dateStyles: boolean[], date1904: boolean): string {
  const value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
  switch (attrs.t) {
    case 's':
      return sharedStrings[Number(value)] ?? '';
    case 'inlineStr':
      return textRuns(inner);
    case 'str':
      return decodeXml(value);
    case 'b':
      return value === '1' ? 'TRUE' : 'FALSE';
    case 'd':
      return decodeXml(value).slice(0, 10);
    case 'e':
      return '';
    default: {
      if (value === '') return '';
      if (attrs.s !== undefined && dateStyles[Number(attrs.s)]) return excelSerialToIsoDate(Number(value), date1904) ?? formatNumber(value);
      return formatNumber(value);
    }
  }
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function rowsToCsv(rows: string[][]): string {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return rows.map((row) => Array.from({ length: width }, (_, index) => csvField(row[index] ?? '')).join(',')).join('\n');
}

/** The first worksheet that has anything on it, as CSV text — what the CSV importers read. */
export function readSpreadsheetAsCsv(filePath: string): { sheetName: string; csv: string } {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.xls') throw new Error('Old-style .xls workbooks are not supported — open it in Excel and save as .xlsx or .csv, then import that file.');
  const sheets = readWorkbook(new Uint8Array(fs.readFileSync(filePath)));
  const sheet = sheets.find((candidate) => candidate.rows.some((row) => row.some((value) => value.trim() !== ''))) ?? sheets[0];
  return { sheetName: sheet.name, csv: rowsToCsv(sheet.rows) };
}
