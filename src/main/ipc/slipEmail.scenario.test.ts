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

/** Emailing slips, pay stubs, forms and letters through the real handlers: one slip per person with the
 * SIN masked and consent confirmed, and letters issued only when complete and reviewed. Same node:sqlite
 * adapter as customerVendorCycle.scenario.test.ts. */


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

import os from 'node:os';
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import * as payroll from './payroll.handlers';
import { paystubEmailDefaults, paystubSend, slipsRecipients, slipsSendAll, slipsSendOne } from './slipEmail.handlers';
import { formsSendDirect } from './forms.handlers';
import { LETTER_REVIEW_REFUSAL, lettersSendDirect } from './letters.handlers';

const sentMail = vi.hoisted(() => [] as Array<{ to: string; subject: string; body: string; replyTo?: string; pages: Promise<number> }>);
const t4Calls = vi.hoisted(() => [] as Array<{ sins: Array<string | null>; withSummary: boolean }>);
vi.mock('../email/sendEmail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../email/sendEmail')>()),
  sendPlatformEmailWithAttachment: async (file: string, to: string, subject: string, body: string, replyTo?: string) => {
    if (to.includes('bounce')) throw new Error('Mailbox does not exist');
    const bytes = fs.readFileSync(file);
    sentMail.push({ to, subject, body, replyTo, pages: PDFDocument.load(bytes).then((d) => d.getPageCount()) });
  },
}));
vi.mock('../forms/generateT4Pdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../forms/generateT4Pdf')>();
  return {
    ...actual,
    generateT4Pdf: (async (...args: Parameters<typeof actual.generateT4Pdf>) => {
      t4Calls.push({ sins: args[1].map((s) => s.sin), withSummary: args[2] !== null });
      return actual.generateT4Pdf(...args);
    }) as typeof actual.generateT4Pdf,
  };
});
vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
vi.mock('../userActivity', () => ({ recordUserActivity: async () => undefined }));
vi.mock('./company.handlers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./company.handlers')>()),
  companyGet: async () => ({ legalName: 'Scenario Company Inc.', displayName: 'Scenario Co', logoDataUrl: null, businessNumber: '123456789RP0001' }),
}));

let db: AppDb;
let asha: number;
let ben: number;
let carl: number;
let ashaRun: number;

async function postedRun(employeeId: number, payDate: string) {
  const run = await payroll.payrollRunsCreate({ employeeId, payPeriodStart: `${payDate.slice(0, 8)}01`, payPeriodEnd: `${payDate.slice(0, 8)}14`, payDate, regularHours: 0, overtimeHours: 0 });
  await db.updateTable('payrollRuns').set({ status: 'posted' }).where('id', '=', run.id).execute();
  return run.id;
}

beforeAll(async () => {
  db = openScenarioCompany();
  state.db = db;
  await seedGifiCodes(db);
  await seedChartOfAccounts(db, GENERAL_SERVICES_TEMPLATE);
  await seedCategoryRules(db);
  await seedOpeningBalanceAccounts(db);
  const salaried = { province: 'ON', payType: 'Salary', annualSalaryCents: 5_200_000, payPeriodsPerYear: 26 };
  asha = (await payroll.employeesCreate({ ...salaried, name: 'Asha Patel', sin: '046 454 286', email: 'asha@example.com' })).id;
  ben = (await payroll.employeesCreate({ ...salaried, name: 'Ben Ortiz', sin: '130 692 544' })).id;
  carl = (await payroll.employeesCreate({ ...salaried, name: 'Carl Bounce', sin: '193 456 787', email: 'bounce@example.com' })).id;
  ashaRun = await postedRun(asha, '2026-03-15');
  await postedRun(ben, '2026-03-15');
  await postedRun(carl, '2026-03-15');
});
afterAll(async () => {
  await db.destroy();
});

describe('emailing T4 slips', () => {
  it('lists each employee with the address on file and a covering note that explains the masked SIN', async () => {
    const rows = await slipsRecipients({ kind: 't4', taxYear: 2026 });
    expect(rows.map((r) => [r.name, r.email])).toEqual([['Asha Patel', 'asha@example.com'], ['Ben Ortiz', null], ['Carl Bounce', 'bounce@example.com']]);
    expect(rows[0].subject).toBe('Your 2026 T4 slip — Scenario Co');
    expect(rows[0].body).toContain('last three digits');
  });

  it('refuses to send without confirmation that the employee agreed to electronic delivery', async () => {
    sentMail.length = 0;
    await expect(slipsSendOne({ kind: 't4', taxYear: 2026, key: asha, to: 'asha@example.com', subject: 's', body: 'b' })).rejects.toThrow(/agreed to receive their slip electronically/);
    await expect(slipsSendAll({ kind: 't4', taxYear: 2026, consentConfirmed: false })).rejects.toThrow(/agreed to receive/);
    expect(sentMail).toEqual([]);
  });

  it("sends one person only their own slip — no summary, no one else's pay — with the SIN masked", async () => {
    sentMail.length = 0;
    t4Calls.length = 0;
    await slipsSendOne({ kind: 't4', taxYear: 2026, key: asha, to: 'asha.home@example.com', subject: 'Your T4', body: 'Hi', replyTo: 'nisha@firm.example', consentConfirmed: true });
    expect(t4Calls).toEqual([{ sins: ['*** *** 286'], withSummary: false }]);
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0]).toMatchObject({ to: 'asha.home@example.com', subject: 'Your T4', replyTo: 'nisha@firm.example' });
    expect(await sentMail[0].pages).toBe(1);
  });

  it('Email all sends each their own, skips anyone with no address, and reports a bounce without stopping the rest', async () => {
    sentMail.length = 0;
    t4Calls.length = 0;
    const result = await slipsSendAll({ kind: 't4', taxYear: 2026, consentConfirmed: true });
    expect(result.sent).toEqual(['Asha Patel']);
    expect(result.skipped).toEqual(['Ben Ortiz']);
    expect(result.failed).toEqual([{ name: 'Carl Bounce', error: 'Mailbox does not exist' }]);
    expect(t4Calls.every((c) => c.sins.length === 1 && !c.withSummary && c.sins[0]?.startsWith('*** ***'))).toBe(true);
  });
});

describe('emailing a pay stub', () => {
  it('addresses it to the employee with the pay period in the note, and attaches the stub', async () => {
    const defaults = await paystubEmailDefaults({ id: ashaRun });
    expect(defaults.to).toBe('asha@example.com');
    expect(defaults.subject).toBe('Pay stub for 2026-03-15 — Scenario Co');
    expect(defaults.body).toContain('2026-03-01 to 2026-03-14');
    sentMail.length = 0;
    await paystubSend({ id: ashaRun, to: defaults.to, subject: defaults.subject, body: defaults.body });
    expect(sentMail).toHaveLength(1);
    expect(await sentMail[0].pages).toBeGreaterThan(0);
  });
});

describe('emailing forms and letters', () => {
  it('sends a fillable form through the relay with the PDF attached', async () => {
    sentMail.length = 0;
    await formsSendDirect({ formId: 'new_client_intake', clientName: 'Om Financial', to: 'om@example.com', subject: 'Intake form', body: 'Please complete' });
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].to).toBe('om@example.com');
  });

  const filled = { clientName: 'Om Financial', periodEnd: '2026-12-31', basisOfAccounting: 'historical cost', firmName: 'Janjua CPA', practitionerName: 'Nisha Janjua', city: 'Toronto', letterDate: '2027-02-01' };

  it('will not issue a letter by email while fields are blank, or before the practitioner confirms review', async () => {
    sentMail.length = 0;
    await expect(lettersSendDirect({ templateId: 'compilation-engagement-report', values: { ...filled, city: '' }, to: 'om@example.com', subject: 's', body: 'b', reviewedConfirmed: true })).rejects.toThrow(/1 still blank/);
    await expect(lettersSendDirect({ templateId: 'compilation-engagement-report', values: filled, to: 'om@example.com', subject: 's', body: 'b' })).rejects.toThrow(LETTER_REVIEW_REFUSAL);
    expect(sentMail).toEqual([]);
  });

  it('issues the finished, reviewed letter', async () => {
    sentMail.length = 0;
    await lettersSendDirect({ templateId: 'compilation-engagement-report', values: filled, to: 'om@example.com', subject: 'Compilation Engagement Report', body: 'Attached', reviewedConfirmed: true });
    expect(sentMail).toHaveLength(1);
  });
});
