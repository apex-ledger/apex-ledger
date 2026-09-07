import { app, dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openCompanyDatabase, closeCompanyDatabase, type CompanyConnection } from './db/connection';
import type { AppDb } from './db/schema';
import { seedGifiCodes } from './db/seeds/gifi_codes.seed';
import { readAppSettings } from './appSettings';
import { seedOpeningBalanceAccounts } from './db/seeds/openingBalanceAccounts.seed';
import { getCoaTemplate, seedChartOfAccounts } from './db/seeds/coaTemplates';
import { seedCategoryRules } from './db/seeds/categoryRules.seed';
import { localIsoDate } from '@shared/domain/dates/localDate';

let currentConnection: CompanyConnection | null = null;

/** On the web server every signed-in browser has its own opened company. The context travels on
 * async-local storage through the whole request, so `getCurrentDb()` in any handler finds that
 * session's connection. Outside a context (the desktop app) the single global connection is used. */
export interface CompanyContext { connection: CompanyConnection | null }
const companyContext = new AsyncLocalStorage<CompanyContext>();
export function runWithCompanyContext<T>(context: CompanyContext, fn: () => T): T {
  return companyContext.run(context, fn);
}
/** The open connection, or a clear error. */
function requireConnection(): CompanyConnection {
  return getCurrentConnection();
}

function slot(): { get: () => CompanyConnection | null; set: (next: CompanyConnection | null) => void } {
  const ctx = companyContext.getStore();
  if (ctx) return { get: () => ctx.connection, set: (next) => { ctx.connection = next; } };
  return { get: () => currentConnection, set: (next) => { currentConnection = next; } };
}

function sameFilePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

/** Commits a prepared connection switch. Callers must fully open/seed/validate `next` first. */
function replaceCurrentConnection(next: CompanyConnection): void {
  const previous = slot().get();
  slot().set(next);
  if (previous && previous !== next) closeCompanyDatabase(previous);
}

function removeFailedNewCompany(filePath: string): void {
  for (const target of [filePath, `${filePath}-wal`, `${filePath}-shm`]) {
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
}

export function getCurrentConnection(): CompanyConnection {
  const current = slot().get();
  if (!current) throw new Error('No company file is open. Create or open a company first.');
  return current;
}

export function getCurrentDb(): AppDb {
  return getCurrentConnection().db;
}

export function getCurrentFilePath(): string | null {
  return slot().get()?.filePath ?? null;
}

export function isCompanyOpen(): boolean {
  return slot().get() !== null;
}

export function closeCompany(): void {
  const s = slot();
  const current = s.get();
  if (current) {
    closeCompanyDatabase(current);
    s.set(null);
  }
}

function recentsFilePath(): string {
  return path.join(app.getPath('userData'), 'recent-companies.json');
}

export function listRecentCompanies(): string[] {
  try {
    const raw = fs.readFileSync(recentsFilePath(), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === 'string' && fs.existsSync(p));
  } catch {
    return [];
  }
}

function addRecentCompany(filePath: string): void {
  const existing = listRecentCompanies().filter((p) => p !== filePath);
  const updated = [filePath, ...existing].slice(0, 10);
  fs.mkdirSync(path.dirname(recentsFilePath()), { recursive: true });
  fs.writeFileSync(recentsFilePath(), JSON.stringify(updated, null, 2), 'utf-8');
}

export interface CreateCompanyInput {
  legalName: string;
  fiscalYearEndMonth: number;
  fiscalYearEndDay: number;
  baseCurrency: string;
  businessNumber?: string | null;
  businessType?: string | null;
  coaTemplateId?: string | null;
}

/** Every new client gets their own folder under Documents/Ledgerly Books Clients/<Client Name>/,
 * so files stay organized by client without the accountant having to think about it — they can
 * still pick a different location in the save dialog that opens next. */
function defaultClientFilePath(legalName: string): string {
  const safeName = legalName.replace(/[\\/:*?"<>|]/g, '').trim() || 'Company';
  const testBuild = app.getName().toUpperCase().includes('TEST') || process.env.NORTH_LEDGER_TEST_BUILD === '1';
  const rootFolder = testBuild ? 'North Ledger Ultimate TEST Companies' : 'Ledgerly Books Clients';
  // D: when it exists, for the same reason the demo copy goes there: the system drive fills up.
  const base = fs.existsSync('D:\\') ? path.join('D:\\', 'ApexLedger') : app.getPath('documents');
  const clientFolder = path.join(base, rootFolder, safeName);
  fs.mkdirSync(clientFolder, { recursive: true });
  return path.join(clientFolder, `${safeName}.company`);
}

export async function createCompany(
  window: BrowserWindow,
  input: CreateCompanyInput,
): Promise<{ filePath: string } | null> {
  const result = await dialog.showSaveDialog(window, {
    title: 'Create Company File',
    defaultPath: defaultClientFilePath(input.legalName),
    filters: [{ name: 'Company File', extensions: ['company'] }],
  });
  if (result.canceled || !result.filePath) return null;
  return createCompanyAt(result.filePath, input);
}

/** Creates and opens a new company file at an exact path — the wizard above after its dialog, and
 * the test-company seeder, which has no dialog to show. Refuses to replace an existing file. */
export async function createCompanyAt(filePath: string, input: CreateCompanyInput): Promise<{ filePath: string }> {
  const result = { filePath };
  if (fs.existsSync(result.filePath)) throw new Error('Choose a new file name. Create Company will not replace an existing company file.');
  fs.mkdirSync(path.dirname(result.filePath), { recursive: true });

  let next: CompanyConnection | null = null;
  try {
    next = await openCompanyDatabase(result.filePath);
    await next.db.transaction().execute(async (db) => {
      await db.insertInto('companyInfo').values({ id: 1, legalName: input.legalName, displayName: null, fiscalYearEndMonth: input.fiscalYearEndMonth, fiscalYearEndDay: input.fiscalYearEndDay, baseCurrency: input.baseCurrency, businessNumber: input.businessNumber ?? null, businessType: input.businessType ?? null }).execute();
      await seedGifiCodes(db);
      if (input.coaTemplateId) {
        const template = getCoaTemplate(input.coaTemplateId);
        if (template) {
          await seedChartOfAccounts(db, template);
          await seedCategoryRules(db);
        }
      }
      await seedOpeningBalanceAccounts(db);
    });
    replaceCurrentConnection(next);
  } catch (error) {
    if (next) closeCompanyDatabase(next);
    removeFailedNewCompany(result.filePath);
    throw error;
  }

  addRecentCompany(result.filePath);
  await autoBackupIfDue(result.filePath);
  return { filePath: result.filePath };
}

/** Copies the read-only comprehensive demo shipped with the app to a user-owned location and
 * opens that copy. Existing files are never overwritten, so a second click resumes the same demo
 * rather than silently erasing changes made while learning. D: is preferred when available. */
export async function installComprehensiveDemo(window: BrowserWindow): Promise<{ filePath: string } | null> {
  return installBundledCompany(window, 'North Ledger Comprehensive Demo.company', 'Apex Ledger Comprehensive Demo.company', 'Install Comprehensive Demo Company');
}

/** The fictitious test company: every flow already exercised, with a sheet of expected figures
 * (docs/TEST-COMPANY-EXPECTED-RESULTS.md) to check each screen against. */
export async function installTestCompany(window: BrowserWindow): Promise<{ filePath: string } | null> {
  return installBundledCompany(window, 'Northwind Bookkeeping Test Co.company', 'Northwind Bookkeeping Test Co.company', 'Open Test Company');
}

async function installBundledCompany(window: BrowserWindow, bundledFileName: string, fileName: string, title: string): Promise<{ filePath: string } | null> {
  const bundledPath = app.isPackaged
    ? path.join(process.resourcesPath, 'demo-companies', bundledFileName)
    : path.join(process.cwd(), 'demo-companies', bundledFileName);
  if (!fs.existsSync(bundledPath)) throw new Error(`${fileName.replace(/\.company$/, '')} is missing from this installation.`);

  const preferredRoot = fs.existsSync('D:\\') ? 'D:\\ApexLedger Demo Companies' : path.join(app.getPath('documents'), 'ApexLedger Demo Companies');
  fs.mkdirSync(preferredRoot, { recursive: true });
  const result = await dialog.showSaveDialog(window, {
    title,
    defaultPath: path.join(preferredRoot, fileName),
    filters: [{ name: 'Company File', extensions: ['company'] }],
  });
  if (result.canceled || !result.filePath) return null;
  if (!fs.existsSync(result.filePath)) fs.copyFileSync(bundledPath, result.filePath, fs.constants.COPYFILE_EXCL);
  return openCompany(window, result.filePath);
}

export async function openCompany(window: BrowserWindow, filePath?: string): Promise<{ filePath: string } | null> {
  let targetPath = filePath;
  if (!targetPath) {
    const result = await dialog.showOpenDialog(window, {
      title: 'Open Company File',
      properties: ['openFile'],
      filters: [{ name: 'Company File', extensions: ['company'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    targetPath = result.filePaths[0];
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Company file not found: ${targetPath}`);
  }
  if (slot().get() && sameFilePath(requireConnection().filePath, targetPath)) return { filePath: requireConnection().filePath };

  const next = await openCompanyDatabase(targetPath);
  // Refreshes/backfills the shipped (is_custom = 0) GIFI codes on every open, not just at company
  // creation — accounts.gifi_code has a FOREIGN KEY to gifi_codes(code), so a company file created
  // by an older app version is missing any GIFI code introduced since (e.g. the GST/HST Recoverable
  // account's '1066'), and auto-creating that account would otherwise fail the FK constraint the
  // moment a taxed transaction first needs it. Safe to re-run: only touches is_custom = 0 rows.
  try {
    await seedGifiCodes(next.db);
  // Same idea, same ordering requirement — must run after seedGifiCodes above, since these
  // accounts' gifi_code foreign keys depend on codes that call just backfilled.
    await seedOpeningBalanceAccounts(next.db);
  } catch (error) {
    closeCompanyDatabase(next);
    throw error;
  }
  replaceCurrentConnection(next);
  addRecentCompany(targetPath);
  await autoBackupIfDue(targetPath);
  return { filePath: targetPath };
}

/**
 * Backs up the currently open company file to a new location the user picks, then switches to
 * editing that copy (standard "Save As" behavior) — handy for starting a new fiscal year's file
 * from an existing one, or setting up a second client from a template client. Reached from File >
 * Save Company As…, which correctly notifies the renderer of the switch afterward. NOT the same
 * as the toolbar Backup button below — that one must never switch the active file.
 */
export async function saveCompanyAs(window: BrowserWindow): Promise<{ filePath: string } | null> {
  if (!slot().get()) throw new Error('No company file is open.');

  const currentDir = path.dirname(requireConnection().filePath);
  const currentBaseName = path.basename(requireConnection().filePath, '.company');
  const result = await dialog.showSaveDialog(window, {
    title: 'Save Company As',
    defaultPath: path.join(currentDir, `${currentBaseName} copy.company`),
    filters: [{ name: 'Company File', extensions: ['company'] }],
  });
  if (result.canceled || !result.filePath) return null;
  if (sameFilePath(requireConnection().filePath, result.filePath)) throw new Error('Save As needs a different file name from the company that is currently open.');

  await requireConnection().sqlite.backup(result.filePath);
  verifyCompanyBackup(result.filePath);
  const next = await openCompanyDatabase(result.filePath);
  try {
    await seedGifiCodes(next.db); // see the matching call in openCompany for why
    await seedOpeningBalanceAccounts(next.db);
  } catch (error) {
    closeCompanyDatabase(next);
    throw error;
  }
  replaceCurrentConnection(next);
  addRecentCompany(result.filePath);
  return { filePath: result.filePath };
}

/**
 * Backs up the currently open company file to a location the user picks — a plain SQLite hot
 * backup (safe even while the file is open and being written to). Deliberately does NOT close or
 * switch the active connection: the app keeps working in the original file, exactly what
 * "backup" should mean. (The toolbar Backup button used to call saveCompanyAs above instead,
 * which silently changed which file new data was being written to without updating the UI —
 * fixed by giving Backup its own non-switching implementation.)
 */
export async function backupCompanyTo(window: BrowserWindow): Promise<{ filePath: string } | null> {
  if (!slot().get()) throw new Error('No company file is open.');

  const currentDir = path.dirname(requireConnection().filePath);
  const currentBaseName = path.basename(requireConnection().filePath, '.company');
  const result = await dialog.showSaveDialog(window, {
    title: 'Backup Company File',
    defaultPath: path.join(currentDir, `${currentBaseName} backup ${todayStamp()}.company`),
    filters: [{ name: 'Company File', extensions: ['company'] }],
  });
  if (result.canceled || !result.filePath) return null;

  await requireConnection().sqlite.backup(result.filePath);
  verifyCompanyBackup(result.filePath);
  copyToSecondaryBackup(result.filePath);
  return { filePath: result.filePath };
}

/** Opens a completed backup independently and proves it is a usable North Ledger company file.
 * This runs only after SQLite has finished writing the copy, never against a half-written file. */
export function verifyCompanyBackup(filePath: string): void {
  const backup = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const quickCheck = backup.pragma('quick_check') as { quick_check: string }[];
    if (quickCheck.length !== 1 || quickCheck[0]?.quick_check !== 'ok') {
      throw new Error(`SQLite quick_check failed: ${quickCheck.map((row) => row.quick_check).join('; ') || 'no result'}`);
    }
    const requiredTables = ['company_info', 'accounts', 'journal_entries', 'journal_entry_lines', 'schema_migrations'];
    const found = new Set(
      (backup.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map((row) => row.name),
    );
    const missing = requiredTables.filter((table) => !found.has(table));
    if (missing.length > 0) throw new Error(`Required accounting tables are missing: ${missing.join(', ')}`);
    const foreignKeyErrors = backup.pragma('foreign_key_check') as unknown[];
    if (foreignKeyErrors.length > 0) throw new Error(`Foreign-key check found ${foreignKeyErrors.length} broken relationship(s).`);
  } catch (error) {
    throw new Error(`Backup verification failed for "${filePath}": ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    backup.close();
  }
}

/**
 * Permanently deletes a company file and everything alongside it (the auto-backups "Backups"
 * folder created next to it — see autoBackupIfDue below). If it's the currently open company,
 * closes the connection first so the file isn't locked. Also drops it from the recent-companies
 * list so it doesn't show up as a dead entry in Open Recent. Irreversible — the renderer is
 * responsible for getting explicit confirmation before calling this.
 */
export function deleteCompanyAndData(filePath: string): void {
  if (slot().get() && requireConnection().filePath === filePath) {
    closeCompanyDatabase(requireConnection());
    slot().set(null);
  }

  if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
  const walPath = `${filePath}-wal`;
  const shmPath = `${filePath}-shm`;
  if (fs.existsSync(walPath)) fs.rmSync(walPath, { force: true });
  if (fs.existsSync(shmPath)) fs.rmSync(shmPath, { force: true });

  const backupDir = autoBackupDirFor(filePath);
  if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true });

  const remaining = listRecentCompanies().filter((p) => p !== filePath);
  fs.mkdirSync(path.dirname(recentsFilePath()), { recursive: true });
  fs.writeFileSync(recentsFilePath(), JSON.stringify(remaining, null, 2), 'utf-8');
}

/** The second copy of a backup, when a folder is set under Settings: a OneDrive folder, a network
 * share, an external drive. Best-effort — a missing drive must never stop the first backup. */
function copyToSecondaryBackup(backupPath: string): void {
  try {
    const folder = readAppSettings().secondaryBackupFolder;
    if (!folder || !fs.existsSync(folder)) return;
    fs.copyFileSync(backupPath, path.join(folder, path.basename(backupPath)));
  } catch (err) {
    console.warn('[companyFile] second backup copy failed', err instanceof Error ? err.message : String(err));
  }
}

function todayStamp(): string {
  return localIsoDate();
}

function timestampForFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

const AUTO_BACKUP_RETENTION_COUNT = 14;

function autoBackupDirFor(companyFilePath: string): string {
  return path.join(path.dirname(companyFilePath), 'Backups');
}

export interface CompanyRecoveryPoint {
  filePath: string;
  fileName: string;
  createdAt: string;
  sizeBytes: number;
  valid: boolean;
  problem?: string;
  companyName?: string;
  journalEntries?: number;
  customers?: number;
  vendors?: number;
  invoices?: number;
  bills?: number;
}

function readRecoverySummary(filePath: string): Pick<CompanyRecoveryPoint, 'companyName' | 'journalEntries' | 'customers' | 'vendors' | 'invoices' | 'bills'> {
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
    const company = db.prepare('SELECT COALESCE(display_name, legal_name) AS name FROM company_info WHERE id = 1').get() as { name: string } | undefined;
    return { companyName: company?.name, journalEntries: count('journal_entries'), customers: count('customers'), vendors: count('vendors'), invoices: count('invoices'), bills: count('bills') };
  } finally {
    db.close();
  }
}

/** Returns only backups belonging to the open company. Each copy is checked before it is shown,
 * so the recovery screen never presents an untested file as safe. */
export function listCompanyRecoveryPoints(): CompanyRecoveryPoint[] {
  if (!slot().get()) throw new Error('No company file is open.');
  const baseName = path.basename(requireConnection().filePath, '.company');
  const backupDir = autoBackupDirFor(requireConnection().filePath);
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter((fileName) => fileName.startsWith(`${baseName} - `) && fileName.endsWith('.company'))
    .map((fileName) => {
      const filePath = path.join(backupDir, fileName);
      const stat = fs.statSync(filePath);
      try {
        verifyCompanyBackup(filePath);
        return { filePath, fileName, createdAt: stat.mtime.toISOString(), sizeBytes: stat.size, valid: true, ...readRecoverySummary(filePath) };
      } catch (error) {
        return { filePath, fileName, createdAt: stat.mtime.toISOString(), sizeBytes: stat.size, valid: false, problem: error instanceof Error ? error.message : String(error) };
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Restores an automatic backup as a new company file. The active books are never replaced and
 * the restored copy is checked both before and after copying. */
export async function restoreCompanyRecoveryPoint(window: BrowserWindow, backupPath: string): Promise<{ filePath: string } | null> {
  if (!slot().get()) throw new Error('No company file is open.');
  const allowed = listCompanyRecoveryPoints().find((point) => point.filePath === backupPath);
  if (!allowed) throw new Error('That recovery point does not belong to the open company.');
  if (!allowed.valid) throw new Error(allowed.problem ?? 'That recovery point did not pass verification.');
  verifyCompanyBackup(backupPath);

  const currentDir = path.dirname(requireConnection().filePath);
  const baseName = path.basename(requireConnection().filePath, '.company');
  const result = await dialog.showSaveDialog(window, {
    title: 'Restore Backup as a New Company File',
    defaultPath: path.join(currentDir, `${baseName} restored ${todayStamp()}.company`),
    filters: [{ name: 'Company File', extensions: ['company'] }],
  });
  if (result.canceled || !result.filePath) return null;
  if (path.resolve(result.filePath).toLowerCase() === path.resolve(requireConnection().filePath).toLowerCase()) {
    throw new Error('Choose a new file name. Recovery cannot overwrite the company that is currently open.');
  }
  if (fs.existsSync(result.filePath)) {
    throw new Error('Choose a new file name. Recovery will not replace any existing company file.');
  }
  const source = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(result.filePath);
    verifyCompanyBackup(result.filePath);
  } catch (error) {
    if (fs.existsSync(result.filePath)) fs.unlinkSync(result.filePath);
    throw error;
  } finally {
    source.close();
  }
  return { filePath: result.filePath };
}

/** Runs at most once per calendar day per company file (checked by whether today's date already
 * appears in an existing auto-backup filename), so opening the same file repeatedly in one day
 * doesn't pile up redundant copies. Failures are logged, never thrown — a backup problem should
 * never block opening or working in a company file. */
export async function autoBackupIfDue(companyFilePath: string): Promise<void> {
  try {
    const backupDir = autoBackupDirFor(companyFilePath);
    const baseName = path.basename(companyFilePath, '.company');
    fs.mkdirSync(backupDir, { recursive: true });

    const today = todayStamp();
    const existing = fs.readdirSync(backupDir).filter((f) => f.startsWith(`${baseName} - `) && f.endsWith('.company'));
    if (existing.some((f) => f.includes(today))) return;

    await runAutoBackup(companyFilePath, backupDir, baseName);
  } catch (err) {
    console.error('[companyFile] auto backup failed', err);
  }
}

/** Unconditional (no once-per-day gate) — used on app quit, since "did we already back up today"
 * doesn't matter as much as "back up whatever changed since the last one." Still best-effort:
 * failures are logged, never thrown, so a backup problem can never prevent the app from quitting. */
export async function autoBackupOnQuit(): Promise<void> {
  if (!slot().get()) return;
  try {
    const companyFilePath = requireConnection().filePath;
    const backupDir = autoBackupDirFor(companyFilePath);
    const baseName = path.basename(companyFilePath, '.company');
    fs.mkdirSync(backupDir, { recursive: true });
    await runAutoBackup(companyFilePath, backupDir, baseName);
  } catch (err) {
    console.error('[companyFile] quit backup failed', err);
  }
}

async function runAutoBackup(companyFilePath: string, backupDir: string, baseName: string): Promise<void> {
  const destPath = path.join(backupDir, `${baseName} - ${timestampForFileName()}.company`);
  if (slot().get() && requireConnection().filePath === companyFilePath) {
    await requireConnection().sqlite.backup(destPath);
  } else {
    fs.copyFileSync(companyFilePath, destPath);
  }
  copyToSecondaryBackup(destPath);
  try {
    verifyCompanyBackup(destPath);
  } catch (error) {
    // This path was generated by runAutoBackup itself and cannot contain user-authored data. A
    // failed copy must not count toward retention or be mistaken for a recovery point.
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    throw error;
  }
  pruneOldAutoBackups(backupDir, baseName);
}

function pruneOldAutoBackups(backupDir: string, baseName: string): void {
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith(`${baseName} - `) && f.endsWith('.company'))
    .sort();
  const excess = files.length - AUTO_BACKUP_RETENTION_COUNT;
  for (let i = 0; i < excess; i++) {
    fs.unlinkSync(path.join(backupDir, files[i]));
  }
}
