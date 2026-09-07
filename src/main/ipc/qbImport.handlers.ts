import { dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { readSpreadsheetAsCsv } from '../import/readSpreadsheet';

export interface ReadIifFileResult {
  loaded: boolean;
  fileName?: string;
  content?: string;
}

/** Opens a native file picker and reads the chosen QuickBooks IIF export as text — parsing
 * happens in the renderer via the shared parseIif() function. */
export async function qbImportReadIifFile(window: BrowserWindow): Promise<ReadIifFileResult> {
  const result = await dialog.showOpenDialog(window, {
    title: 'Import from QuickBooks (IIF)',
    properties: ['openFile'],
    filters: [{ name: 'QuickBooks IIF', extensions: ['iif', 'txt'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { loaded: false };

  const filePath = result.filePaths[0];
  const BOM = String.fromCharCode(0xfeff);
  const content = fs.readFileSync(filePath, 'utf-8').replace(new RegExp(`^${BOM}`), '');
  return { loaded: true, fileName: filePath.split(/[\\/]/).pop() ?? filePath, content };
}

/** The picker for QuickBooks Online / Xero exports. Those services export reports as Excel
 * workbooks by default (CSV on request), so both are accepted: an .xlsx is read here and handed to
 * the renderer as CSV text, which is all the shared parsers understand. */
export async function qbImportReadCsvFile(window: BrowserWindow): Promise<ReadIifFileResult> {
  const result = await dialog.showOpenDialog(window, {
    title: 'Import from QuickBooks Online / Xero (Excel or CSV)',
    properties: ['openFile'],
    filters: [
      { name: 'Excel or CSV', extensions: ['xlsx', 'csv', 'txt'] },
      { name: 'Excel workbook', extensions: ['xlsx'] },
      { name: 'CSV', extensions: ['csv', 'txt'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return { loaded: false };

  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.xlsx' || extension === '.xls') return { loaded: true, fileName, content: readSpreadsheetAsCsv(filePath).csv };
  const BOM = String.fromCharCode(0xfeff);
  const content = fs.readFileSync(filePath, 'utf-8').replace(new RegExp(`^${BOM}`), '');
  return { loaded: true, fileName, content };
}
