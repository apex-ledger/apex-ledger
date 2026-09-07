import { dialog, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs';

export function safeFileNamePart(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').trim();
}

/** Lets the accountant pick where to save a generated PDF, writes it, then opens it in the OS's
 * default viewer — the same save/open pattern used by every PDF-producing feature in this app
 * (forms.handlers.ts, and now payroll/shareholder year-end slips). */
export async function savePdfAndOpen(window: BrowserWindow, title: string, defaultFileName: string, bytes: Uint8Array) {
  const saveResult = await dialog.showSaveDialog(window, {
    title,
    defaultPath: defaultFileName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return { saved: false as const };
  fs.writeFileSync(saveResult.filePath, bytes);
  await shell.openPath(saveResult.filePath);
  return { saved: true as const, filePath: saveResult.filePath };
}
