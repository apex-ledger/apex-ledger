import { app, dialog, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { runWiaScript } from '../scanner/wiaScript';
import { inkFraction } from '../scanner/pageInk';
import { sidesWithContent } from '@shared/domain/receipts/scanPages';
import type { TaxCode } from '@shared/domain/types';
import { getCurrentDb } from '../companyFile';
import { billsCreate, billsDelete } from './bills.handlers';
import { journalCreate, journalPost, journalVoid } from './journal.handlers';
import { extractReceiptFields, type ReceiptOcrResult } from '../ocr/receiptOcr';

// tesseract.js decodes raw photo formats reliably. PDFs are handled separately by
// extractPdfReceipt.ts (text-layer extraction, or pulling the embedded scan image out of the
// PDF directly — see that file for why this avoids needing a native canvas/rasterization
// library). HEIC still isn't handled — the UI nudges users to scan as JPEG/PNG instead for that
// one format, where OCR already works.
const OCR_SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.pdf']);

const ROOT_FOLDER_NAME = 'North Ledger Receipts';

export interface ReceiptScannerStatus {
  supported: boolean;
  devices: string[];
}

export interface ReceiptScanResult {
  scanned: boolean;
  cancelled: boolean;
  /** The first page scanned — what the Inbox opens for review. */
  fileName: string | null;
  /** Every page scanned in this pass, in feeder order; one Inbox file each. */
  fileNames: string[];
}

const SUPPORTED_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.heic': 'image/heic',
  '.pdf': 'application/pdf',
};

function receiptsRoot(): string {
  return path.join(app.getPath('documents'), ROOT_FOLDER_NAME);
}

/** Creates (if needed) and returns the Inbox/Archive/Skipped folders — see the plan for why these
 * three exist: Inbox is where the OneDrive iPhone app's scans land, Archive is where a reviewed
 * receipt goes once it becomes a Bill, Skipped is for scans dismissed as junk/duplicates. */
function ensureFolders(): { root: string; inbox: string; archive: string; skipped: string } {
  const root = receiptsRoot();
  const inbox = path.join(root, 'Inbox');
  const archive = path.join(root, 'Archive');
  const skipped = path.join(root, 'Skipped');
  for (const dir of [inbox, archive, skipped]) fs.mkdirSync(dir, { recursive: true });
  return { root, inbox, archive, skipped };
}

/** `fileName` ultimately comes from IPC input, so guard against path traversal — we only ever
 * want a bare file name inside the receipts folders, never a nested or absolute path. */
function safeFileName(fileName: string): string {
  const base = path.basename(fileName);
  if (!base || base !== fileName) throw new Error('Invalid receipt file name.');
  return base;
}

/** Never overwrite an earlier scan with the same camera/download filename. */
function uniqueDestination(folder: string, fileName: string): string {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = path.join(folder, fileName);
  let counter = 1;
  while (fs.existsSync(candidate)) candidate = path.join(folder, `${base} (${counter++})${ext}`);
  return candidate;
}

/** Finds scanners registered with Windows. Device names come from the installed WIA driver, so an
 * Epson model is shown by its real Epson name rather than a hard-coded marketing label. */
export async function receiptInboxScannerStatus(): Promise<ReceiptScannerStatus> {
  if (process.platform !== 'win32') return { supported: false, devices: [] };
  const output = await runWiaScript('scanner-status');
  const devices = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return { supported: true, devices };
}

/** Scans straight from the feeder — no Windows dialog, no settings to click through — and drops
 * every page it finds into Inbox as its own file. A receipt scanner holds a stack; one press should
 * take the stack. Nothing is posted: the OCR review screen opens on the first page and every
 * vendor/date/account/tax/amount box stays editable.
 *
 * The scanner's own defaults are used except resolution and colour, set to what OCR reads best
 * (300 dpi, colour); a driver that refuses those keeps its defaults. If the direct path is refused
 * outright, the Windows acquisition window is offered instead, so an unusual scanner still works. */
export async function receiptInboxScan(): Promise<ReceiptScanResult> {
  const { inbox } = ensureFolders();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `Scanned receipt ${stamp}`;
  try {
    const output = await runWiaScript('scan-feeder', { APEX_LEDGER_SCAN_DIR: inbox, APEX_LEDGER_SCAN_BASE: uniqueBaseName(inbox, baseName) });
    if (output.startsWith('__APEX_SCAN_ERROR__')) throw new Error(output.slice('__APEX_SCAN_ERROR__'.length).trim());
    if (output.includes('__APEX_SCAN_NO_SCANNER__')) throw new Error('No scanner is registered with Windows. Switch the scanner on, connect it, and install its driver (Epson Scan 2), then try again.');
    if (output.includes('__APEX_SCAN_NO_PAPER__')) throw new Error('The feeder is empty. Load the receipt into the scanner, then click Scan Receipt.');
    if (!output.includes('__APEX_SCAN_SAVED__')) throw new Error('Windows did not return a scanned image. Check the scanner connection and try again.');
    const scannedNames = output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('__APEX_')).map((full) => path.basename(full)).filter((name) => fs.existsSync(path.join(inbox, name)));
    if (scannedNames.length === 0) throw new Error('Windows did not return a scanned image. Check the scanner connection and try again.');
    const fileNames = dropBlankSides(inbox, scannedNames);
    return { scanned: true, cancelled: false, fileName: fileNames[0], fileNames };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/80210006|device is busy/i.test(message)) {
      throw new Error(SCANNER_BUSY_MESSAGE);
    }
    if (/feeder is empty|No scanner is registered|did not return/.test(message)) throw error;
    // The direct path was refused for some other reason — let Windows drive the scanner instead.
    return acquireWithWindowsDialog(inbox, `${baseName}.jpg`);
  }
}

/** The scanner reads both sides of every sheet (see resources/scripts/scan-feeder.js); the blank
 * backs are measured and deleted here so the inbox only ever shows printed sides. If a page cannot
 * be measured, every page is kept — losing a receipt is worse than showing a blank. */
function dropBlankSides(folder: string, names: string[]): string[] {
  if (names.length < 2) return names;
  let fractions: number[];
  try {
    fractions = names.map((name) => inkFraction(path.join(folder, name)));
  } catch {
    return names;
  }
  const keep = new Set(sidesWithContent(fractions));
  for (const [index, name] of names.entries()) {
    if (!keep.has(index)) fs.rmSync(path.join(folder, name), { force: true });
  }
  return names.filter((_, index) => keep.has(index));
}

/** A base name with no file in the folder starting with it, so page files never collide. */
function uniqueBaseName(folder: string, baseName: string): string {
  let candidate = baseName;
  let counter = 1;
  while (fs.readdirSync(folder).some((name) => name.startsWith(candidate))) candidate = `${baseName} (${counter++})`;
  return candidate;
}

/** The Windows/Epson acquisition window — the fallback when a driver refuses direct transfer. */
async function acquireWithWindowsDialog(inbox: string, fileName: string): Promise<ReceiptScanResult> {
  const destination = uniqueDestination(inbox, fileName);
  try {
    const output = await runWiaScript('scan-dialog', { APEX_LEDGER_SCAN_PATH: destination });
    if (output.includes('__APEX_SCAN_CANCELLED__')) return { scanned: false, cancelled: true, fileName: null, fileNames: [] };
    if (!output.includes('__APEX_SCAN_SAVED__') || !fs.existsSync(destination)) {
      throw new Error('Windows did not return a scanned image. Check the scanner connection and try again.');
    }
    return { scanned: true, cancelled: false, fileName: path.basename(destination), fileNames: [path.basename(destination)] };
  } catch (error) {
    if (fs.existsSync(destination)) fs.unlinkSync(destination);
    const message = error instanceof Error ? error.message : String(error);
    // "The WIA device is busy" (0x80210006) almost always means another Epson program holds the
    // scanner open — Event Manager watches the hardware button and keeps the device claimed. Name
    // it, rather than sending the person off to reinstall a driver that is working fine.
    if (/80210006|device is busy/i.test(message)) {
      throw new Error(SCANNER_BUSY_MESSAGE);
    }
    throw new Error(`Scanner capture failed. Install or repair the Epson Scan 2/WIA driver, confirm the scanner is powered on, and try again. ${message}`);
  }
}

/** "The WIA device is busy" (0x80210006) almost always means another Epson program holds the
 * scanner open — Event Manager watches the hardware button and keeps the device claimed. Name the
 * usual suspects rather than sending the person off to reinstall a driver that is working fine.
 * (The app deliberately does not list running processes to find out which one: an unsigned
 * application enumerating processes is itself something antivirus heuristics flag.) */
const SCANNER_BUSY_MESSAGE =
  'Another program is holding the scanner — usually Epson Event Manager or Epson ScanSmart. Close it (right-click its icon in the system tray, then Exit — it comes back at next sign-in) and try again.';

export interface ReceiptInboxEntry {
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface ProcessedReceiptEntry {
  id: number;
  sourceFileName: string;
  archivedFilePath: string;
  billId: number | null;
  journalEntryId: number | null;
  importedAt: string;
}

/** The paper trail after a scan leaves Inbox: preserves the file and takes the user back to the
 * exact source bill or journal instead of making them hunt through reports. */
export async function receiptInboxHistory(): Promise<ProcessedReceiptEntry[]> {
  const db = getCurrentDb();
  return db.selectFrom('receiptImports').selectAll().orderBy('importedAt', 'desc').orderBy('id', 'desc').execute();
}

/** Returns a processed scan to Inbox for corrected review. The file move is compensated if the
 * database transaction refuses or fails; document-owned accounting is reversed before the link is
 * removed, so no posted amount survives while its scan looks pending again. */
export async function receiptInboxReprocess(id: number) {
  const db = getCurrentDb();
  const item = await db.selectFrom('receiptImports').selectAll().where('id', '=', id).executeTakeFirst();
  if (!item) throw new Error(`Processed receipt ${id} not found.`);
  if (!fs.existsSync(item.archivedFilePath)) throw new Error('The archived scan is missing. Restore the file before reprocessing its accounting entry.');

  const { inbox } = ensureFolders();
  const inboxPath = uniqueDestination(inbox, item.sourceFileName);
  fs.renameSync(item.archivedFilePath, inboxPath);
  try {
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom('receiptImports').where('id', '=', id).execute();
      if (item.billId !== null) await billsDelete(item.billId, trx);
      if (item.journalEntryId !== null) await journalVoid(item.journalEntryId, false, trx, true);
    });
  } catch (error) {
    if (fs.existsSync(inboxPath) && !fs.existsSync(item.archivedFilePath)) fs.renameSync(inboxPath, item.archivedFilePath);
    throw error;
  }
  return { returnedToInbox: true as const, fileName: path.basename(inboxPath) };
}

/** Files sitting in Inbox/ that haven't already been imported or skipped — genuinely new scans
 * waiting for review. */
export async function receiptInboxList(): Promise<ReceiptInboxEntry[]> {
  const { inbox } = ensureFolders();
  const db = getCurrentDb();
  const alreadySeen = new Set((await db.selectFrom('receiptImports').select('sourceFileName').execute()).map((r) => r.sourceFileName));

  return fs
    .readdirSync(inbox)
    .filter((name) => !name.startsWith('.') && Object.prototype.hasOwnProperty.call(SUPPORTED_MIME_TYPES, path.extname(name).toLowerCase()))
    .filter((name) => !alreadySeen.has(name))
    .map((name) => {
      const stat = fs.statSync(path.join(inbox, name));
      return { fileName: name, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

/** Lets the user pick any receipt file from anywhere on their PC (a downloaded invoice PDF, a
 * photo taken with a regular camera, a screenshot) rather than only ones the OneDrive iPhone app
 * synced into Inbox/ — copies each chosen file in, giving it a unique name if one with that name
 * is already there, so it shows up for review exactly like a phone scan would. */
export async function receiptInboxImportFiles(window: BrowserWindow): Promise<{ importedCount: number }> {
  const { inbox } = ensureFolders();
  const result = await dialog.showOpenDialog(window, {
    title: 'Import Receipt Files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Receipts', extensions: ['jpg', 'jpeg', 'png', 'pdf'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled) return { importedCount: 0 };

  let importedCount = 0;
  for (const sourcePath of result.filePaths) {
    const ext = path.extname(sourcePath).toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(SUPPORTED_MIME_TYPES, ext)) continue;

    const base = path.basename(sourcePath, ext);
    let destName = `${base}${ext}`;
    let counter = 1;
    while (fs.existsSync(path.join(inbox, destName))) {
      destName = `${base} (${counter})${ext}`;
      counter++;
    }
    fs.copyFileSync(sourcePath, path.join(inbox, destName));
    importedCount++;
  }
  return { importedCount };
}

/** Reads a pending receipt as a base64 data URL so the renderer can display it without touching
 * the CSP (nothing in this app is ever loaded via a raw file:// URL in the renderer). */
/** For the Bill form's "Read from PDF or scan": one file, copied into the inbox so it is kept and
 * can be linked or archived later, then read for the vendor, date and amounts. */
export async function receiptInboxPickAndExtract(window: BrowserWindow): Promise<{ picked: false } | { picked: true; fileName: string; fields: ReceiptOcrResult }> {
  const { inbox } = ensureFolders();
  const result = await dialog.showOpenDialog(window, {
    title: 'Read a vendor invoice',
    properties: ['openFile'],
    filters: [{ name: 'Invoice (PDF or image)', extensions: ['pdf', 'jpg', 'jpeg', 'png'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { picked: false };
  const sourcePath = result.filePaths[0];
  const ext = path.extname(sourcePath).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(SUPPORTED_MIME_TYPES, ext)) throw new Error('Only PDF, JPG and PNG files can be read.');
  const base = path.basename(sourcePath, ext);
  let destName = `${base}${ext}`;
  let counter = 1;
  while (fs.existsSync(path.join(inbox, destName))) {
    destName = `${base} (${counter})${ext}`;
    counter++;
  }
  fs.copyFileSync(sourcePath, path.join(inbox, destName));
  const fields = await receiptInboxExtractFields(destName);
  return { picked: true, fileName: destName, fields };
}

export async function receiptInboxGetPreview(fileName: string): Promise<{ dataUrl: string }> {
  const { inbox } = ensureFolders();
  const safe = safeFileName(fileName);
  const mime = SUPPORTED_MIME_TYPES[path.extname(safe).toLowerCase()];
  if (!mime) throw new Error(`Unsupported receipt file type: ${safe}`);
  const bytes = fs.readFileSync(path.join(inbox, safe));
  return { dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
}

/** Runs OCR against a pending scan and returns best-effort guesses for the review form. Only
 * ever a starting point — every field it fills stays editable, since receipt photos are noisy
 * and the heuristics (biggest $ amount, first line of text, etc.) won't always be right. */
export async function receiptInboxExtractFields(fileName: string): Promise<ReceiptOcrResult> {
  const safe = safeFileName(fileName);
  const { inbox } = ensureFolders();
  if (!OCR_SUPPORTED_EXTENSIONS.has(path.extname(safe).toLowerCase())) {
    return { vendorNameGuess: null, dateGuess: null, amountCentsGuess: null, taxAmountCentsGuess: null, currencyGuess: null, rawText: '' };
  }
  return extractReceiptFields(path.join(inbox, safe));
}

/** Reviewing a receipt into a Bill: creates the bill exactly like the Purchases page does, then
 * moves the source scan from Inbox/ to Archive/ and links it on the bill. If bill creation fails
 * (bad vendor/account, validation error, etc.) the file is left in Inbox/ untouched so nothing is
 * silently lost. */
export async function receiptInboxImportAsBill(input: unknown) {
  const { fileName, bill } = input as { fileName: string; bill: Record<string, unknown> };
  const safe = safeFileName(fileName);
  const { inbox, archive } = ensureFolders();
  const sourcePath = path.join(inbox, safe);
  if (!fs.existsSync(sourcePath)) throw new Error(`Receipt file not found: ${safe}`);

  const archivedPath = uniqueDestination(archive, safe);
  const createdBill = await billsCreate({ ...bill, receiptFilePath: archivedPath });

  try {
    fs.renameSync(sourcePath, archivedPath);
    const db = getCurrentDb();
    await db.insertInto('receiptImports').values({ sourceFileName: safe, archivedFilePath: archivedPath, billId: createdBill.id, journalEntryId: null }).execute();
  } catch (error) {
    if (fs.existsSync(archivedPath) && !fs.existsSync(sourcePath)) fs.renameSync(archivedPath, sourcePath);
    await billsDelete(createdBill.id);
    throw error;
  }

  return createdBill;
}

export interface ReceiptQuickEntryInput {
  fileName: string;
  type: 'expense' | 'income';
  entryDate: string;
  moneyAccountId: number;
  categoryAccountId: number;
  amountCents: number;
  taxCode: TaxCode | null;
  manualHstCents: number | null;
  memo: string | null;
  foreignCurrency: string | null;
  foreignAmountCents: number | null;
  exchangeRate: number | null;
}

/** Reviewing a receipt as a Quick Expense or Quick Sale — same two-line posting the Quick Entry
 * page itself builds (category vs. money account, direction depending on type), just triggered
 * from the receipt review screen instead. No vendor is involved, unlike the Bill path. */
export async function receiptInboxImportAsQuickEntry(input: unknown) {
  const payload = input as ReceiptQuickEntryInput;
  const safe = safeFileName(payload.fileName);
  const { inbox, archive } = ensureFolders();
  const sourcePath = path.join(inbox, safe);
  if (!fs.existsSync(sourcePath)) throw new Error(`Receipt file not found: ${safe}`);

  const categoryLine = {
    accountId: payload.categoryAccountId,
    debitCents: payload.type === 'expense' ? payload.amountCents : 0,
    creditCents: payload.type === 'income' ? payload.amountCents : 0,
    description: payload.memo,
    taxCode: payload.taxCode,
    manualHstCents: payload.taxCode === 'Manual' ? payload.manualHstCents : null,
    foreignCurrency: payload.foreignCurrency,
    foreignAmountCents: payload.foreignAmountCents,
    exchangeRate: payload.exchangeRate,
  };
  const moneyLine = {
    accountId: payload.moneyAccountId,
    debitCents: payload.type === 'income' ? payload.amountCents : 0,
    creditCents: payload.type === 'expense' ? payload.amountCents : 0,
    description: payload.memo,
  };

  // Archive the scan BEFORE touching the ledger: a filesystem move can't participate in the DB
  // transaction, so doing it first means a later DB failure leaves an archived-but-unrecorded file
  // (re-importable, harmless) instead of a posted GL entry whose receipt never got filed.
  const archivedPath = uniqueDestination(archive, safe);
  fs.renameSync(sourcePath, archivedPath);

  const db = getCurrentDb();
  try {
    return await db.transaction().execute(async (trx) => {
      const entry = await journalCreate(
        {
          entryDate: payload.entryDate,
          memo: payload.memo,
          reference: null,
          lines: [categoryLine, moneyLine],
        },
        trx,
      );
      const posted = await journalPost(entry.id, trx);

      await trx
        .insertInto('receiptImports')
        .values({ sourceFileName: safe, archivedFilePath: archivedPath, billId: null, journalEntryId: posted.id })
        .execute();

      return posted;
    });
  } catch (error) {
    if (fs.existsSync(archivedPath) && !fs.existsSync(sourcePath)) fs.renameSync(archivedPath, sourcePath);
    throw error;
  }
}

/** Dismisses a scan that isn't a usable receipt (blurry, duplicate, not actually a receipt) —
 * moves it out of Inbox/ so it stops showing up, without creating a bill. */
export async function receiptInboxDismiss(fileName: string) {
  const safe = safeFileName(fileName);
  const { inbox, skipped } = ensureFolders();
  const sourcePath = path.join(inbox, safe);
  if (!fs.existsSync(sourcePath)) throw new Error(`Receipt file not found: ${safe}`);

  const skippedPath = uniqueDestination(skipped, safe);
  fs.renameSync(sourcePath, skippedPath);
  const db = getCurrentDb();
  await db.insertInto('receiptImports').values({ sourceFileName: safe, archivedFilePath: skippedPath, billId: null, journalEntryId: null }).execute();
  return { skipped: true as const };
}

/** A Bill keeps its receipt path denormalized directly on the bill row (see billsCreate), but a
 * Quick Expense/Quick Sale posted straight from Receipt Inbox has no row of its own to carry that
 * on — the only record of the link is receipt_imports.journal_entry_id. Looked up on demand so
 * the Journal Entry page can offer the same "View Receipt" link Bills already have. */
export async function receiptInboxGetForJournalEntry(journalEntryId: number): Promise<{ archivedFilePath: string } | null> {
  const db = getCurrentDb();
  const row = await db
    .selectFrom('receiptImports')
    .select('archivedFilePath')
    .where('journalEntryId', '=', journalEntryId)
    .executeTakeFirst();
  return row ?? null;
}

/** Opens an already-archived receipt in its OS default viewer — used by "View Receipt" on a Bill.
 * Constrained to the receipts folder since the path, while normally trustworthy (it only ever
 * comes from what this app itself wrote to the bill row), is passed in from the renderer. */
export async function receiptInboxOpenFile(filePath: string) {
  const { root } = ensureFolders();
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) {
    throw new Error('Refusing to open a file outside the receipts folder.');
  }
  await shell.openPath(resolved);
  return { opened: true as const };
}

/** Reveals the Inbox folder in the OS file browser — used by the one-time setup instructions. */
export async function receiptInboxShowFolder() {
  const { inbox } = ensureFolders();
  shell.showItemInFolder(inbox);
  return { inboxPath: inbox };
}
