import { app, dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { buildExcelWorkbook } from '../export/excelWorkbook';
import { localIsoDate } from '@shared/domain/dates/localDate';

export function appGetVersion(): string {
  return app.getVersion();
}

/** Renders whatever page is currently on screen to a PDF the user saves wherever they like —
 * uses Chromium's own PDF engine (webContents.printToPDF), so it's a real vector PDF rather than
 * a screenshot, and needs no OS print dialog the way the existing File > Print… does. */
export async function appSaveAsPdf(window: BrowserWindow): Promise<{ saved: boolean; filePath?: string }> {
  const result = await dialog.showSaveDialog(window, {
    title: 'Save as PDF',
    defaultPath: path.join(app.getPath('documents'), `Apex Ledger - ${todayStamp()}.pdf`),
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };

  const pdfBuffer = await window.webContents.printToPDF({});
  fs.writeFileSync(result.filePath, pdfBuffer);
  return { saved: true, filePath: result.filePath };
}

/** Builds and saves a genuine Office Open XML workbook. The renderer supplies exactly the rows on
 * screen; the main process owns both workbook generation and the native save dialog. */
export async function appSaveExcelFile(
  window: BrowserWindow,
  input: unknown,
): Promise<{ saved: boolean; filePath?: string }> {
  const { suggestedName, rows } = input as { suggestedName: string; rows: string[][] };
  if (!Array.isArray(rows) || rows.some((row) => !Array.isArray(row) || row.some((cell) => typeof cell !== 'string'))) {
    throw new Error('The report could not be exported because its table data is invalid.');
  }
  const safeName = (suggestedName || 'export').replace(/[\/:*?"<>|]/g, '-');
  const result = await dialog.showSaveDialog(window, {
    title: 'Export to Excel',
    defaultPath: path.join(app.getPath('documents'), `${safeName} - ${todayStamp()}.xlsx`),
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  const workbook = await buildExcelWorkbook({ title: suggestedName || 'Report', rows });
  fs.writeFileSync(result.filePath, workbook);
  return { saved: true, filePath: result.filePath };
}

function todayStamp(): string {
  return localIsoDate();
}

/** Goes through the normal quit path — main/index.ts's existing `before-quit` handler still runs
 * the auto-backup before the app actually exits, same as closing the window or Alt+F4 would. */
export function appQuit(): { quit: true } {
  app.quit();
  return { quit: true };
}
