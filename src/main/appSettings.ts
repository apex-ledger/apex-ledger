import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';

/**
 * Settings that belong to this installation rather than to a company file: where a second copy
 * of every backup goes, and how email is sent. They are the same whichever client is open, so
 * they live in the app's own data folder, not in any .company file.
 */
export interface EmailSettings {
  /** 'outlook' opens a draft in desktop Outlook for the person to send; 'smtp' sends directly. */
  mode: 'outlook' | 'smtp';
  host: string;
  port: number;
  /** 'starttls' for port 587 (Microsoft 365, Gmail), 'tls' for port 465. */
  security: 'starttls' | 'tls';
  user: string;
  fromName: string;
  fromAddress: string;
}

export interface AppSettings {
  secondaryBackupFolder: string | null;
  email: EmailSettings;
  /** SMTP password, encrypted with the OS keychain via Electron safeStorage, base64. Never sent to the renderer. */
  smtpPasswordEncrypted: string | null;
}

const DEFAULTS: AppSettings = {
  secondaryBackupFolder: null,
  email: { mode: 'outlook', host: 'smtp.office365.com', port: 587, security: 'starttls', user: '', fromName: '', fromAddress: '' },
  smtpPasswordEncrypted: null,
};

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'app-settings.json');
}

export function readAppSettings(): AppSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) as Partial<AppSettings>;
    return { ...DEFAULTS, ...raw, email: { ...DEFAULTS.email, ...(raw.email ?? {}) } };
  } catch {
    return { ...DEFAULTS, email: { ...DEFAULTS.email } };
  }
}

export function writeAppSettings(next: AppSettings): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
}

/** What the renderer may see: everything except the password, plus whether one is stored. */
export function appSettingsForRenderer(): Omit<AppSettings, 'smtpPasswordEncrypted'> & { smtpPasswordSet: boolean } {
  const { smtpPasswordEncrypted, ...rest } = readAppSettings();
  return { ...rest, smtpPasswordSet: Boolean(smtpPasswordEncrypted) };
}

export function storeSmtpPassword(password: string | null): void {
  const current = readAppSettings();
  if (password === null || password === '') {
    writeAppSettings({ ...current, smtpPasswordEncrypted: null });
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('This machine cannot store the password securely (OS encryption unavailable).');
  writeAppSettings({ ...current, smtpPasswordEncrypted: safeStorage.encryptString(password).toString('base64') });
}

export function readSmtpPassword(): string | null {
  const { smtpPasswordEncrypted } = readAppSettings();
  if (!smtpPasswordEncrypted) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(smtpPasswordEncrypted, 'base64'));
  } catch {
    return null;
  }
}
