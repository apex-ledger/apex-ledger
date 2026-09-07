import { dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { seedFirmServices } from '../db/seeds/firmServices.seed';
import { recordAllSignedOut, recordStaffSignIn } from '../staffSessions';
import { companyCreateSchema, companyUpdateSchema } from '@shared/validation/schemas';
import {
  backupCompanyTo,
  closeCompany,
  createCompany,
  deleteCompanyAndData,
  getCurrentDb,
  getCurrentFilePath,
  installComprehensiveDemo,
  installTestCompany,
  listCompanyRecoveryPoints,
  listRecentCompanies,
  openCompany,
  restoreCompanyRecoveryPoint,
  saveCompanyAs,
} from '../companyFile';
import { mapCompanyInfoRow } from '../db/mappers';
import { refreshMenu } from '../menu';

/** Tells the renderer which file is open now. Every screen that keys on the company — the name in
 * the header and sidebar, the favourites bar, every cached list — listens for this. Sent from
 * here, after the switch, so it does not matter which button, menu or recent-file entry caused
 * it: the renderer never has to remember to update itself. */
async function announceCompany(window: BrowserWindow, filePath: string | null): Promise<void> {
  if (window.isDestroyed()) return;
  const event = filePath ? { opened: true as const, filePath, company: await companyGet() } : { opened: false as const, filePath: null, company: null };
  window.webContents.send('company:changed', event);
}
import { getLicenseStatus } from '../licensing/license';

/** The renderer already blocks unlicensed installs from reaching this point, but every path
 * that opens or creates a real company file re-checks here too, since the main process — not
 * renderer state — is what actually needs to enforce this. */
function requireLicensed(): void {
  const status = getLicenseStatus();
  if (!status.licensed) throw new Error(status.error ?? 'This install is not licensed.');
}

export async function companyGet() {
  const db = getCurrentDb();
  const row = await db.selectFrom('companyInfo').selectAll().where('id', '=', 1).executeTakeFirstOrThrow();
  return mapCompanyInfoRow(row);
}

export async function companyUpdate(input: unknown) {
  const { hstQuickMethodEnabled, mailingSameAsBusinessAddress, ehtExemptionEligible, ...rest } = companyUpdateSchema.parse(input);
  const patch = {
    ...rest,
    ...(hstQuickMethodEnabled !== undefined ? { hstQuickMethodEnabled: hstQuickMethodEnabled ? 1 : 0 } : {}),
    ...(mailingSameAsBusinessAddress !== undefined ? { mailingSameAsBusinessAddress: mailingSameAsBusinessAddress ? 1 : 0 } : {}),
    ...(ehtExemptionEligible !== undefined ? { ehtExemptionEligible: ehtExemptionEligible ? 1 : 0 } : {}),
  };
  const db = getCurrentDb();
  if (Object.keys(patch).length > 0) {
    await db.updateTable('companyInfo').set(patch).where('id', '=', 1).execute();
  }
  // Becoming a firm (or being set up as one from the start) brings the service catalogue with it.
  if (patch.businessType !== undefined) await seedFirmServices(db, patch.businessType);
  return companyGet();
}

export async function companyCreateHandler(window: BrowserWindow, input: unknown) {
  requireLicensed();
  const payload = companyCreateSchema.parse(input);
  const result = await createCompany(window, payload);
  if (!result) return { created: false as const };
  await seedFirmServices(getCurrentDb(), payload.businessType);
  refreshMenu(window);
  await announceCompany(window, result.filePath);
  return { created: true as const, filePath: result.filePath, company: await companyGet() };
}

export async function companyOpenHandler(window: BrowserWindow, filePath?: string) {
  requireLicensed();
  const result = await openCompany(window, filePath);
  if (result) await recordStaffSignIn();
  if (!result) return { opened: false as const };
  refreshMenu(window);
  await announceCompany(window, result.filePath);
  return { opened: true as const, filePath: result.filePath, company: await companyGet() };
}

export async function companyInstallTestCompanyHandler(window: BrowserWindow) {
  requireLicensed();
  const result = await installTestCompany(window);
  if (!result) return { opened: false as const };
  refreshMenu(window);
  await announceCompany(window, result.filePath);
  return { opened: true as const, filePath: result.filePath, company: await companyGet() };
}

export async function companyInstallDemoHandler(window: BrowserWindow) {
  requireLicensed();
  const result = await installComprehensiveDemo(window);
  if (!result) return { opened: false as const };
  refreshMenu(window);
  await announceCompany(window, result.filePath);
  return { opened: true as const, filePath: result.filePath, company: await companyGet() };
}

/** A logo for customer PDFs: one PNG or JPG, at most 400 KB, returned as a data URL to save on
 * the company record so every machine prints the same header. */
export async function companyPickLogoHandler(window: BrowserWindow): Promise<{ picked: false } | { picked: true; dataUrl: string }> {
  const result = await dialog.showOpenDialog(window, { title: 'Choose a logo', properties: ['openFile'], filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg'] }] });
  if (result.canceled || result.filePaths.length === 0) return { picked: false };
  const file = result.filePaths[0];
  const bytes = fs.readFileSync(file);
  if (bytes.length > 400 * 1024) throw new Error('The logo is over 400 KB. Save a smaller copy (a PNG around 600 pixels wide is plenty) and try again.');
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return { picked: true, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
}

export async function companyListRecentHandler() {
  return listRecentCompanies();
}

export async function companySaveAsHandler(window: BrowserWindow) {
  const result = await saveCompanyAs(window);
  if (!result) return { saved: false as const };
  refreshMenu(window);
  await announceCompany(window, result.filePath);
  return { saved: true as const, filePath: result.filePath, company: await companyGet() };
}

/** The toolbar Backup button — does NOT switch the active company, unlike Save As above. */
export async function companyBackupHandler(window: BrowserWindow) {
  const result = await backupCompanyTo(window);
  if (!result) return { saved: false as const };
  return { saved: true as const, filePath: result.filePath };
}

export async function companyListRecoveryPointsHandler() {
  return listCompanyRecoveryPoints();
}

export async function companyRestoreRecoveryPointHandler(window: BrowserWindow, backupPath: string) {
  const result = await restoreCompanyRecoveryPoint(window, backupPath);
  if (!result) return { saved: false as const };
  return { saved: true as const, filePath: result.filePath };
}

export async function companyCloseHandler(window: BrowserWindow) {
  await recordAllSignedOut('company_closed');
  closeCompany();
  refreshMenu(window);
  await announceCompany(window, null);
  return { closed: true as const };
}

/** Permanently deletes the currently open company file and its Backups folder — irreversible.
 * Always acts on whichever file is actually open (never a caller-supplied path), so there's no
 * way to point this at an arbitrary file on disk. The renderer is responsible for getting the
 * user's explicit confirmation (typing the company name back) before ever calling this. */
export async function companyDeleteCurrentHandler(window: BrowserWindow) {
  const filePath = getCurrentFilePath();
  if (!filePath) throw new Error('No company file is open.');
  deleteCompanyAndData(filePath);
  refreshMenu(window);
  return { deleted: true as const, filePath };
}
