import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

/** better-sqlite3 in this workspace is compiled for Electron's Node ABI (the app), not the Node that
 * runs vitest. When the binary cannot load, this test cannot open a database at all, so it steps
 * aside with the reason instead of failing the whole suite for an environment limit. */
function nativeSqliteLoads(): boolean {
  try {
    new Database(':memory:').close();
    return true;
  } catch {
    return false;
  }
}
const canOpenSqlite = nativeSqliteLoads();
import { afterEach, describe, expect, it } from 'vitest';
import { closeCompanyDatabase, openCompanyDatabase } from './connection';
import { MIGRATIONS } from './migrations/index';
import { splitStatements } from './migrationRunner';

const cleanup: string[] = [];
afterEach(() => {
  for (const target of cleanup.splice(0)) fs.rmSync(target, { recursive: true, force: true });
});

describe('pre-migration company safety copy', () => {
  it.skipIf(!canOpenSqlite)('creates a verified version-59 snapshot before applying the later migrations', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'north-ledger-migration-'));
    cleanup.push(dir);
    const companyPath = path.join(dir, 'Upgrade Test.company');
    const old = new Database(companyPath);
    for (const migration of MIGRATIONS.filter((item) => item.version <= 59)) {
      old.transaction(() => {
        for (const statement of splitStatements(migration.sql)) old.exec(statement);
        old.prepare('INSERT INTO schema_migrations(version) VALUES (?)').run(migration.version);
      })();
    }
    old.prepare("UPDATE company_info SET legal_name = 'Migration Safety Company' WHERE id = 1").run();
    old.close();

    const connection = await openCompanyDatabase(companyPath);
    const latest = Math.max(...MIGRATIONS.map((item) => item.version));
    expect((connection.sqlite.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number }).version).toBe(latest);
    closeCompanyDatabase(connection);

    const backups = fs.readdirSync(path.join(dir, 'Backups')).filter((name) => name.includes(`pre-upgrade-v59-to-v${latest}`));
    expect(backups).toHaveLength(1);
    const backup = new Database(path.join(dir, 'Backups', backups[0]), { readonly: true });
    expect((backup.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number }).version).toBe(59);
    expect(backup.pragma('quick_check')).toEqual([{ quick_check: 'ok' }]);
    expect(backup.prepare("SELECT name FROM pragma_table_info('recurring_templates') WHERE name = 'next_due_date'").get()).toBeUndefined();
    backup.close();
  });
});
