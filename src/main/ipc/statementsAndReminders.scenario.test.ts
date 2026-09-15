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

/** Payment reminders and customer statements sent through the platform relay, and the month-end
 * batch as one PDF, through the real handlers — works where there is no desktop Outlook. */

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
import * as contacts from './contacts.handlers';
import * as invoices from './invoices.handlers';
import { customerStatementsEmailDefaults, customerStatementsSaveCombined, customerStatementsSendAll, customerStatementsSendDirect } from './customerStatements.handlers';
import { paymentRemindersSendDirect } from './paymentReminders.handlers';

const sentMail = vi.hoisted(() => [] as Array<{ to: string; subject: string; body: string; replyTo?: string; attachment: string; isPdf: boolean }>);
vi.mock('../email/sendEmail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../email/sendEmail')>()),
  sendPlatformEmailWithAttachment: async (file: string, to: string, subject: string, body: string, replyTo?: string) => {
    if (to.includes('bounce')) throw new Error('Mailbox does not exist');
    sentMail.push({ to, subject, body, replyTo, attachment: file, isPdf: fs.readFileSync(file).subarray(0, 5).toString() === '%PDF-' });
  },
}));
vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
vi.mock('../userActivity', () => ({ recordUserActivity: async () => undefined }));
vi.mock('./company.handlers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./company.handlers')>()),
  companyGet: async () => ({ legalName: 'Scenario Company Inc.', displayName: 'Scenario Co', logoDataUrl: null }),
}));

let db: AppDb;
const byCode = async (code: string) => (await db.selectFrom('accounts').select('id').where('code', '=', code).executeTakeFirstOrThrow()).id;

let withEmail: number;
let withoutEmail: number;
let bouncing: number;

beforeAll(async () => {
  db = openScenarioCompany();
  state.db = db;
  await seedGifiCodes(db);
  await seedChartOfAccounts(db, GENERAL_SERVICES_TEMPLATE);
  await seedCategoryRules(db);
  await seedOpeningBalanceAccounts(db);
  const revenue = await byCode('4000');
  withEmail = (await contacts.customersSave({ name: 'Om Financial', email: 'om@example.com', paymentTerms: 'net30' })).id;
  withoutEmail = (await contacts.customersSave({ name: 'Paper Only Ltd', paymentTerms: 'net30' })).id;
  bouncing = (await contacts.customersSave({ name: 'Gone Away Inc', email: 'bounce@example.com', paymentTerms: 'net30' })).id;
  for (const [customerId, n] of [[withEmail, 1], [withoutEmail, 2], [bouncing, 3]] as const) {
    await invoices.invoicesCreate({ customerId, invoiceNumber: `INV-00${n}`, invoiceDate: '2026-06-01', dueDate: '2026-07-01', lines: [{ description: 'Work', quantity: 1, unitPriceCents: 10_000 * n, revenueAccountId: revenue, taxCode: 'HST' }] });
  }
});
afterAll(async () => {
  await db.destroy();
});

describe('a payment reminder', () => {
  it('goes out through the platform relay with the wording as edited and the statement attached', async () => {
    sentMail.length = 0;
    const result = await paymentRemindersSendDirect({ customerId: withEmail, to: 'accounts@om.example', subject: 'Overdue: INV-001', body: 'Edited wording', replyTo: 'nisha@firm.example' });
    expect(result.sent).toBe(true);
    expect(result.tier).toBe('final');
    expect(sentMail).toEqual([expect.objectContaining({ to: 'accounts@om.example', subject: 'Overdue: INV-001', body: 'Edited wording', replyTo: 'nisha@firm.example', isPdf: true })]);
  });

  it('will not send a reminder for a customer who owes nothing', async () => {
    const paidUp = (await contacts.customersSave({ name: 'Paid Up Co', email: 'paid@example.com', paymentTerms: 'net30' })).id;
    await expect(paymentRemindersSendDirect({ customerId: paidUp, to: 'paid@example.com', subject: 's', body: 'b' })).rejects.toThrow(/nothing outstanding/);
  });
});

describe('customer statements', () => {
  it('start the send box with the covering note and the address on file', async () => {
    const defaults = await customerStatementsEmailDefaults({ customerId: withEmail });
    expect(defaults.to).toBe('om@example.com');
    expect(defaults.subject).toBe('Statement of account — Scenario Co');
    expect(defaults.body).toContain('113.00');
  });

  it('one statement sends to whatever address was typed, even for a customer with none on file', async () => {
    sentMail.length = 0;
    await customerStatementsSendDirect({ customerId: withoutEmail, to: 'ap@paperonly.example', subject: 'Statement', body: 'Hello' });
    expect(sentMail).toEqual([expect.objectContaining({ to: 'ap@paperonly.example', isPdf: true })]);
  });

  it('Email all sends each customer their own, skips those with no address, and reports a bounce without stopping the rest', async () => {
    sentMail.length = 0;
    const result = await customerStatementsSendAll({ customerIds: [withEmail, withoutEmail, bouncing], replyTo: 'nisha@firm.example' });
    expect(result.sent).toEqual(['Om Financial']);
    expect(result.skipped).toEqual(['Paper Only Ltd']);
    expect(result.failed).toEqual([{ customerName: 'Gone Away Inc', error: 'Mailbox does not exist' }]);
    expect(sentMail.map((m) => m.to)).toEqual(['om@example.com']);
    expect(sentMail[0].replyTo).toBe('nisha@firm.example');
  });

  it('download as one PDF puts every selected statement in a single file', async () => {
    const { filePath, count } = await customerStatementsSaveCombined({ customerIds: [withEmail, withoutEmail, bouncing] });
    expect(count).toBe(3);
    expect((await PDFDocument.load(fs.readFileSync(filePath))).getPageCount()).toBe(3);
    fs.rmSync(filePath);
  });
});
