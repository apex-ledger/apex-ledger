import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { MIGRATIONS } from './migrations/index';
import { splitStatements } from './migrationRunner';

/** The upgrade path, run against real company files.
 *
 * Every other test here builds its database from the same migrations it is testing, so a migration
 * that is wrong in a way that only matters to an OLDER file passes cleanly. That is exactly how the
 * camelCase break got out: the migration was fine against a fresh file and broke every existing one.
 *
 * This opens copies of actual company files — whatever version they happen to be — and applies the
 * migrations the way the runner does. Skipped unless NL_REAL_COMPANY_DIR points at a folder of them,
 * so the suite stays portable; the files are real books and are never written to in place.
 */

// Required at runtime: node:sqlite is a builtin the bundler's resolver does not know about, and a
// static import fails to resolve before the test ever runs.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    prepare: (sql: string) => { get: () => unknown; all: () => unknown[] };
    exec: (sql: string) => void;
    close: () => void;
  };
};

const REAL_DIR = process.env.NL_REAL_COMPANY_DIR;
const ALREADY_APPLIED = [/duplicate column name/i, /already exists/i];

function realFiles(): string[] {
  if (!REAL_DIR || !existsSync(REAL_DIR)) return [];
  return readdirSync(REAL_DIR)
    .filter((f) => f.endsWith('.company'))
    .map((f) => join(REAL_DIR, f));
}

interface UpgradeResult {
  startVersion: number;
  applied: number;
  failures: { version: string; statement: string; error: string }[];
}

function upgradeCopy(source: string): UpgradeResult {
  const dir = mkdtempSync(join(tmpdir(), 'nl-upgrade-'));
  const target = join(dir, 'copy.company');
  copyFileSync(source, target);

  const db = new DatabaseSync(target);
  let startVersion = 0;
  try {
    startVersion = (db.prepare('SELECT MAX(version) v FROM schema_migrations').get() as { v: number }).v ?? 0;
  } catch {
    startVersion = 0;
  }

  const failures: UpgradeResult['failures'] = [];
  let applied = 0;

  for (const migration of MIGRATIONS) {
    for (const statement of splitStatements(migration.sql)) {
      try {
        db.exec(statement);
        applied += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (ALREADY_APPLIED.some((p) => p.test(message))) continue;
        failures.push({ version: String(migration.version), statement: statement.slice(0, 120), error: message });
      }
    }
  }

  db.close();
  return { startVersion, applied, failures };
}

const files = realFiles();

describe.skipIf(files.length === 0)('upgrading a real company file', () => {
  for (const file of files) {
    const name = file.split(/[\/]/).pop();

    it(`applies every migration to ${name}`, () => {
      const result = upgradeCopy(file);
      expect(
        result.failures,
        `${name} (was at v${result.startVersion}) failed to upgrade:\n` +
          result.failures.map((f) => `  ${f.version}: ${f.error}\n    ${f.statement}`).join('\n'),
      ).toEqual([]);
    });

    it(`leaves ${name} readable, with its data intact`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'nl-verify-'));
      const target = join(dir, 'copy.company');
      copyFileSync(file, target);

      const db = new DatabaseSync(target);
      const before = (db.prepare('SELECT COUNT(*) c FROM journal_entry_lines').get() as { c: number }).c;
      db.close();

      upgradeCopy(file);

      const db2 = new DatabaseSync(target);
      for (const statement of MIGRATIONS.flatMap((m) => splitStatements(m.sql))) {
        try {
          db2.exec(statement);
        } catch {
          /* tolerated above */
        }
      }
      const after = (db2.prepare('SELECT COUNT(*) c FROM journal_entry_lines').get() as { c: number }).c;

      // A migration that drops or rewrites rows would show up here and nowhere else.
      expect(after, 'the upgrade changed the number of journal lines').toBe(before);

      // The tables the newest migrations add have to actually be there afterwards.
      const tables = (db2.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
        (r) => r.name,
      );
      for (const required of ['tag_groups', 'tags', 'journal_entry_line_tags', 'products', 'inventory_movements']) {
        expect(tables, `${required} is missing after upgrade`).toContain(required);
      }

      const billCols = (db2.prepare('PRAGMA table_info(bills)').all() as { name: string }[]).map((r) => r.name);
      expect(billCols).toContain('approval_status');

      db2.close();
    });
  }
});
