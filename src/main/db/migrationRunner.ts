import type Database from 'better-sqlite3';
import { MIGRATIONS } from './migrations/index';

const ALREADY_APPLIED_ERROR_PATTERNS = [/duplicate column name/i, /already exists/i];

function isAlreadyAppliedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return ALREADY_APPLIED_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Strips `--` line comments, leaving string literals alone.
 *
 * This has to happen BEFORE splitting on semicolons. A semicolon inside a comment — easy to write
 * without noticing, e.g. `-- (credits AR); kind='vendor' is a credit received` — otherwise splits
 * the comment in half, and the second half arrives at SQLite as a bare statement:
 * `kind='vendor' is a credit received...` → `near "kind": syntax error`. The comment reads as prose
 * either way, so nothing about the SQL looks wrong when you read it.
 *
 * A `--` inside a quoted string (a default value, a CHECK literal) is left as data, which is why
 * this tracks quote state rather than just regex-replacing.
 */
export function stripSqlComments(sql: string): string {
  let out = '';
  let inString = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];

    if (inString) {
      out += char;
      // '' inside a string is an escaped quote, not the end of it.
      if (char === "'") {
        if (sql[i + 1] === "'") {
          out += sql[i + 1];
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (char === "'") {
      inString = true;
      out += char;
      continue;
    }

    if (char === '-' && sql[i + 1] === '-') {
      // Skip to end of line, keeping the newline so line structure survives.
      while (i < sql.length && sql[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }

    out += char;
  }

  return out;
}

/** Splits a migration's SQL into individual statements so each one can be applied (and tolerated
 * if already applied) independently. Comments are removed first (see stripSqlComments); what's left
 * is plain DDL — CREATE TABLE, CREATE INDEX, ALTER TABLE ADD COLUMN — with no semicolons inside
 * string literals or trigger bodies, so splitting on semicolons is then safe. */
export function splitStatements(sql: string): string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/**
 * Applies every migration, in order, each in its own transaction. Every migration is re-verified
 * on every open — not just ones missing from `schema_migrations` — and each individual statement
 * tolerates "already applied" errors (duplicate column, table/index already exists) as no-ops
 * instead of failing. This makes the system self-healing: if a company file's bookkeeping ever
 * drifts from its actual schema (e.g. an interrupted apply, or a file that changed hands between
 * app versions), any statement that didn't actually take effect gets applied on the next open
 * instead of silently leaving a column missing forever. The re-check cost is negligible — DDL
 * statements that no-op are essentially free — against the safety this buys.
 */
export function runMigrations(db: Database.Database): void {
  const hasSchemaTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
    .get();

  const appliedVersions = new Set<number>();
  if (hasSchemaTable) {
    const rows = db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[];
    for (const row of rows) appliedVersions.add(row.version);
  }

  const sorted = [...MIGRATIONS].sort((a, b) => a.version - b.version);

  for (const migration of sorted) {
    const alreadyRecorded = appliedVersions.has(migration.version);
    const applyMigration = db.transaction(() => {
      for (const statement of splitStatements(migration.sql)) {
        try {
          db.exec(statement);
        } catch (err) {
          if (isAlreadyAppliedError(err)) continue;
          throw err;
        }
      }
      if (!alreadyRecorded) {
        db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
      }
    });
    applyMigration();
  }
}
