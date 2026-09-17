import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { MIGRATIONS } from '../db/migrations/index';
import { splitStatements } from '../db/migrationRunner';
import { createKysely, type AppDb } from '../db/schema';
import { seedChartOfAccounts } from '../db/seeds/coaTemplateTypes';
import { seedGifiCodes } from '../db/seeds/gifi_codes.seed';
import { seedCategoryRules } from '../db/seeds/categoryRules.seed';
import { seedOpeningBalanceAccounts } from '../db/seeds/openingBalanceAccounts.seed';
import { GENERAL_SERVICES_TEMPLATE } from '../db/seeds/coa_template.general_services.seed';
import { ACCOUNTS_RECEIVABLE_ARGS } from '../db/controlAccounts';

/** Company Settings always saves: a CRA number that breaks the rule is the only thing held back. */


const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../companyFile', () => ({
  getCurrentDb: () => state.db,
  getCurrentConnection: () => ({ db: state.db, sqlite: null, filePath: ':memory:' }),
  getCurrentFilePath: () => null,
  isCompanyOpen: () => true,
}));

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec: (sql: string) => void;
    prepare: (sql: string) => {
      all: (...params: unknown[]) => Record<string, unknown>[];
      run: (...params: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
      iterate: (...params: unknown[]) => Iterable<Record<string, unknown>>;
    };
    close: () => void;
  };
};

function openScenarioCompany(): AppDb {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    for (const statement of splitStatements(migration.sql)) {
      try {
        sqlite.exec(statement);
      } catch (err) {
        if (!/duplicate column name|already exists/i.test(String(err))) throw err;
      }
    }
    sqlite.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(migration.version);
  }
  sqlite.prepare("INSERT INTO company_info (id, legal_name, display_name) VALUES (1, 'Scenario Company Inc.', 'Scenario Co')").run();
  const betterSqliteShape = {
    prepare(sql: string) {
      const stmt = sqlite.prepare(sql);
      const reader = /^\s*(select|with|pragma|explain)\b/i.test(sql) || /\breturning\b/i.test(sql);
      return {
        reader,
        all: (params: unknown[] = []) => stmt.all(...params),
        run: (params: unknown[] = []) => stmt.run(...params),
        iterate: (params: unknown[] = []) => stmt.iterate(...params),
      };
    },
    close: () => sqlite.close(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createKysely(betterSqliteShape as any);
}

import { companyGet, companyUpdate } from './company.handlers';

let db: AppDb;
beforeAll(async () => {
  db = openScenarioCompany();
  state.db = db;
});
afterAll(async () => { await db.destroy(); });

describe('saving About Company', () => {
  it('saves the address and filing schedule even when a CRA number is incomplete, and says which number was held back', async () => {
    await companyUpdate({ businessNumber: '783221005', hstNumber: '783221005RT0001' });
    const result = await companyUpdate({
      businessNumber: '78322 1005',
      hstNumber: '783221005RT0001',
      payrollNumber: '78322 1005 RP000',
      businessAddressLine1: '141 Calderstone Rd',
      businessCity: 'Brampton',
      hstFilingFrequency: 'Quarterly',
    });
    expect(result.saveWarnings).toEqual([expect.stringMatching(/Payroll account is the 9-digit Business Number, RP, then 4 digits.*It was not changed/)]);
    const company = await companyGet();
    expect(company.businessAddressLine1).toBe('141 Calderstone Rd');
    expect(company.hstFilingFrequency).toBe('Quarterly');
    expect(company.hstNumber).toBe('783221005RT0001');
    expect(company.payrollNumber).toBeNull();
  });

  it('stores a complete number compactly, and holds back one under another Business Number', async () => {
    const ok = await companyUpdate({ businessNumber: '783221005', payrollNumber: '783221005 rp 0001', corporateTaxNumber: '999999999RC0001' });
    expect(ok.saveWarnings).toEqual([expect.stringMatching(/must be the same nine digits/)]);
    const company = await companyGet();
    expect(company.payrollNumber).toBe('783221005RP0001');
    expect(company.corporateTaxNumber).toBeNull();
  });
});
