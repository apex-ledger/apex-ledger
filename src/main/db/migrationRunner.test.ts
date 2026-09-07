import { describe, expect, it } from 'vitest';
import { splitStatements, stripSqlComments } from './migrationRunner';
import { MIGRATIONS } from './migrations/index';

/** DDL verbs every migration statement in this app legitimately starts with. Anything else is a
 * fragment — which is exactly what a mis-split comment produces. */
const STATEMENT_START = /^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|PRAGMA)\b/i;

describe('stripSqlComments', () => {
  it('removes a line comment', () => {
    expect(stripSqlComments('-- a note\nSELECT 1').trim()).toBe('SELECT 1');
  });

  it('removes a comment that contains a semicolon without splitting it', () => {
    // The bug this exists for: the semicolon inside the comment used to split the statement, and
    // the tail of the comment reached SQLite as `kind='vendor' is a credit` → syntax error.
    const sql = "-- kind='customer' is one thing; kind='vendor' is another\nCREATE TABLE t (id INTEGER);";
    expect(splitStatements(sql)).toEqual(['CREATE TABLE t (id INTEGER)']);
  });

  it('leaves a double dash inside a string literal alone', () => {
    const sql = "INSERT INTO t (code) VALUES ('a--b');";
    expect(splitStatements(sql)).toEqual(["INSERT INTO t (code) VALUES ('a--b')"]);
  });

  it('handles an escaped quote inside a string', () => {
    const sql = "INSERT INTO t (name) VALUES ('it''s fine'); -- trailing note\n";
    expect(splitStatements(sql)).toEqual(["INSERT INTO t (name) VALUES ('it''s fine')"]);
  });

  it('keeps a trailing inline comment out of the statement', () => {
    expect(splitStatements('CREATE TABLE t (id INTEGER); -- done')).toEqual(['CREATE TABLE t (id INTEGER)']);
  });
});

describe('every shipped migration', () => {
  it('splits into statements that are all real DDL, never comment fragments', () => {
    for (const migration of MIGRATIONS) {
      for (const statement of splitStatements(migration.sql)) {
        expect(STATEMENT_START.test(statement), `migration ${migration.version} (${migration.name}) produced a non-DDL fragment: ${statement.slice(0, 80)}`).toBe(
          true,
        );
      }
    }
  });

  it('leaves no comment markers in any statement handed to SQLite', () => {
    for (const migration of MIGRATIONS) {
      for (const statement of splitStatements(migration.sql)) {
        // A surviving `--` would mean a comment was only partially stripped.
        const outsideStrings = statement.replace(/'(?:[^']|'')*'/g, '');
        expect(outsideStrings.includes('--'), `migration ${migration.version} leaked a comment marker`).toBe(false);
      }
    }
  });

  it('has unique, gapless, ascending version numbers', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
    expect(versions[0]).toBe(1);
    expect(versions[versions.length - 1]).toBe(versions.length);
  });
});

describe('migration SQL matches the real schema naming', () => {
  /** Every table and column in this database is snake_case. Application code says `journalEntries`
   * only because Kysely's CamelCasePlugin translates for it — a migration is raw SQL and gets no
   * such translation, so a camelCase identifier there names a table that does not exist. That
   * failure does not surface until a company file is opened, and it takes the whole open down with
   * it, so it is worth catching here instead. */
  it('uses no camelCase identifiers', () => {
    // Values inside quotes are data, not identifiers, and may legitimately be camelCase.
    const stripStringLiterals = (sql: string) => sql.replace(/'(?:[^']|'')*'/g, "''");

    for (const migration of MIGRATIONS) {
      for (const statement of splitStatements(migration.sql)) {
        const offenders = stripStringLiterals(statement).match(/[a-z]+[A-Z][A-Za-z]*/g) ?? [];
        expect(
          offenders,
          `migration ${migration.version} (${migration.name}) uses camelCase where the schema is snake_case: ${offenders.join(', ')}`,
        ).toEqual([]);
      }
    }
  });
});
