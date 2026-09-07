import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { runMigrations } from './migrationRunner';
import { MIGRATIONS } from './migrations/index';
import { createKysely, type AppDb } from './schema';

export interface CompanyConnection {
  sqlite: Database.Database;
  db: AppDb;
  filePath: string;
}

function migrationBackupStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function verifyPreMigrationBackup(filePath: string, sourceVersion: number): void {
  const backup = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const check = backup.pragma('quick_check') as { quick_check: string }[];
    if (check.length !== 1 || check[0]?.quick_check !== 'ok') throw new Error('SQLite integrity check failed.');
    const found = new Set((backup.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((row) => row.name));
    const required = ['schema_migrations', ...(sourceVersion >= 1 ? ['company_info'] : []), ...(sourceVersion >= 3 ? ['accounts'] : []), ...(sourceVersion >= 4 ? ['journal_entries', 'journal_entry_lines'] : [])];
    const missing = required.filter((table) => !found.has(table));
    if (missing.length) throw new Error(`Required tables are missing: ${missing.join(', ')}`);
  } finally {
    backup.close();
  }
}

/** Creates one verified, consistent SQLite snapshot before an older company receives migrations.
 * Reopening after a failed upgrade reuses the same source-to-target backup instead of piling up
 * copies. New/empty databases do not need a pre-upgrade copy. */
export async function createPreMigrationBackupIfNeeded(filePath: string): Promise<string | null> {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) return null;
  const source = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const hasMigrations = source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
    if (!hasMigrations) return null;
    const applied = new Set((source.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((row) => row.version));
    const latestVersion = Math.max(...MIGRATIONS.map((migration) => migration.version));
    const pending = MIGRATIONS.some((migration) => !applied.has(migration.version));
    if (!pending) return null;
    const sourceVersion = applied.size ? Math.max(...applied) : 0;
    const backupDir = path.join(path.dirname(filePath), 'Backups');
    const baseName = path.basename(filePath, '.company');
    const prefix = `${baseName} - pre-upgrade-v${sourceVersion}-to-v${latestVersion}`;
    fs.mkdirSync(backupDir, { recursive: true });
    const existing = fs.readdirSync(backupDir).find((name) => name.startsWith(prefix) && name.endsWith('.company'));
    if (existing) {
      const existingPath = path.join(backupDir, existing);
      verifyPreMigrationBackup(existingPath, sourceVersion);
      return existingPath;
    }
    const destination = path.join(backupDir, `${prefix}-${migrationBackupStamp()}.company`);
    try {
      await source.backup(destination);
      verifyPreMigrationBackup(destination, sourceVersion);
      return destination;
    } catch (error) {
      if (fs.existsSync(destination)) fs.unlinkSync(destination);
      throw error;
    }
  } finally {
    source.close();
  }
}

/** Opens (creating if needed) a company file, safeguarding it before pending migrations. */
export async function openCompanyDatabase(filePath: string): Promise<CompanyConnection> {
  const migrationBackup = await createPreMigrationBackupIfNeeded(filePath);
  const sqlite = new Database(filePath);
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    return { sqlite, db: createKysely(sqlite), filePath };
  } catch (error) {
    sqlite.close();
    const recovery = migrationBackup ? ` A verified pre-upgrade copy is safe at: ${migrationBackup}` : '';
    throw new Error(`Company-file upgrade failed.${recovery} ${error instanceof Error ? error.message : String(error)}`.trim());
  }
}

export function closeCompanyDatabase(connection: CompanyConnection): void {
  connection.sqlite.close();
}
