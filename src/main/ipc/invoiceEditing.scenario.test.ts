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

/** Editing a saved invoice before it is paid, end to end through the real handlers.
 *
 * Lines are added and removed and the number checked, and at every step Accounts Receivable equals
 * what the invoice now says, GST/HST Payable equals the tax on its current lines, and the books
 * balance. Once money is received, or the period is locked, the edit is refused and nothing moves.
 * Same node:sqlite adapter as customerVendorCycle.scenario.test.ts. */

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

import * as contacts from './contacts.handlers';
import * as invoices from './invoices.handlers';
import * as fiscalPeriods from './fiscalPeriods.handlers';
import { journalCreateAndPost, journalGet } from './journal.handlers';
import { getAllAccounts, getAllJournalEntriesWithLines } from '../db/queries';
import { trialBalance } from '@shared/domain/ledger/trialBalance';
import { balanceSheet } from '@shared/domain/ledger/balanceSheet';

let db: AppDb;
const byCode = async (code: string) => (await db.selectFrom('accounts').select('id').where('code', '=', code).executeTakeFirstOrThrow()).id;
const byName = async (name: string) => (await db.selectFrom('accounts').select('id').where('name', '=', name).executeTakeFirstOrThrow()).id;

/** Debits minus credits over posted entries only — a voided journal must drop out of this. */
async function balance(id: number): Promise<number> {
  const rows = await db
    .selectFrom('journalEntryLines')
    .innerJoin('journalEntries', 'journalEntries.id', 'journalEntryLines.journalEntryId')
    .select(['journalEntryLines.debitCents as debitCents', 'journalEntryLines.creditCents as creditCents'])
    .where('journalEntryLines.accountId', '=', id)
    .where('journalEntries.status', '=', 'posted')
    .execute();
  return rows.reduce((sum, r) => sum + r.debitCents - r.creditCents, 0);
}

async function booksBalance() {
  const accounts = await getAllAccounts(db);
  const entries = await getAllJournalEntriesWithLines(db);
  const tb = trialBalance(accounts, entries, '2026-12-31');
  expect(tb.totalDebitCents).toBe(tb.totalCreditCents);
  expect(balanceSheet(accounts, entries, '2026-12-31').isBalanced).toBe(true);
}

let revenue: number;
let consulting: number;
let ar: number;
let hstPayable: number;
let chequing: number;

const line = (description: string, unitPriceCents: number, revenueAccountId: number, quantity = 1) => ({ description, quantity, unitPriceCents, revenueAccountId, taxCode: 'HST' as const });

beforeAll(async () => {
  db = openScenarioCompany();
  state.db = db;
  await seedGifiCodes(db);
  await seedChartOfAccounts(db, GENERAL_SERVICES_TEMPLATE);
  await seedCategoryRules(db);
  await seedOpeningBalanceAccounts(db);
  revenue = await byCode('4000');
  consulting = (await db.selectFrom('accounts').select('id').where('accountType', '=', 'Revenue').where('id', '!=', revenue).where('isActive', '=', 1).executeTakeFirstOrThrow()).id;
  chequing = await byCode('1000');
  const equity = (await db.selectFrom('accounts').select('id').where('accountType', '=', 'Equity').where('isActive', '=', 1).executeTakeFirstOrThrow()).id;
  await journalCreateAndPost({ entryDate: '2026-09-01', memo: 'Owner investment', lines: [{ accountId: chequing, debitCents: 100_000, creditCents: 0 }, { accountId: equity, debitCents: 0, creditCents: 100_000 }] });
});
afterAll(async () => {
  await db.destroy();
});

describe('an unpaid invoice can still be changed', () => {
  let id: number;
  let customerId: number;
  let firstJournal: number;

  it('starts as one line of $250 plus HST', async () => {
    const customer = await contacts.customersSave({ name: 'Om Financial', paymentTerms: 'net30' });
    customerId = customer.id;
    const inv = await invoices.invoicesCreate({ customerId, invoiceNumber: 'INV-2026-0002', invoiceDate: '2026-09-15', dueDate: '2026-10-15', lines: [line('Accounting policy review', 25_000, revenue)] });
    id = inv.id;
    firstJournal = inv.invoiceJournalEntryId!;
    ar = await byName(ACCOUNTS_RECEIVABLE_ARGS[0]);
    hstPayable = await byName('GST/HST Payable');
    expect(inv.totalCents).toBe(28_250);
    expect(await balance(ar)).toBe(28_250);
    expect(await balance(hstPayable)).toBe(-3_250);
  });

  it('adding a line re-posts the whole invoice: A/R, revenue and HST all follow, and the old journal is voided', async () => {
    const edited = await invoices.invoicesUpdate({
      id, customerId, invoiceNumber: 'INV-2026-0002', invoiceDate: '2026-09-15', dueDate: '2026-10-15',
      lines: [line('Accounting policy review', 25_000, revenue), line('Process mapping workshop', 10_000, consulting, 2)],
    });
    expect(edited.id).toBe(id);
    expect(edited.lines).toHaveLength(2);
    expect(edited.totalCents).toBe(50_850); // (250 + 2 x 100) x 1.13
    expect((await journalGet(firstJournal)).status).toBe('void');
    expect(edited.invoiceJournalEntryId).not.toBe(firstJournal);
    expect(await balance(ar)).toBe(50_850);
    expect(await balance(hstPayable)).toBe(-5_850);
    expect(await balance(revenue)).toBe(-25_000);
    expect(await balance(consulting)).toBe(-20_000);
    await booksBalance();
  });

  it('removing a line takes its revenue and tax back out', async () => {
    const edited = await invoices.invoicesUpdate({
      id, customerId, invoiceNumber: 'INV-2026-0002', invoiceDate: '2026-09-15', dueDate: '2026-10-15',
      lines: [line('Process mapping workshop', 10_000, consulting, 2)],
    });
    expect(edited.lines).toHaveLength(1);
    expect(edited.totalCents).toBe(22_600);
    expect(await balance(ar)).toBe(22_600);
    expect(await balance(revenue)).toBe(0);
    expect(await balance(consulting)).toBe(-20_000);
    expect(await balance(hstPayable)).toBe(-2_600);
    await booksBalance();
  });

  it('records the edit on the invoice history, old total to new', async () => {
    const current = await invoices.invoicesGet(id);
    const revisions = await db.selectFrom('journalEntryRevisions').selectAll().where('journalEntryId', '=', current.invoiceJournalEntryId!).execute();
    expect(revisions.some((r) => r.label === 'Invoice INV-2026-0002 edited' && r.oldValue === '508.50 — 2 lines' && r.newValue === '226.00 — 1 line')).toBe(true);
  });

  it('refuses a number another invoice already uses, and changes nothing', async () => {
    const other = await invoices.invoicesCreate({ customerId, invoiceNumber: 'INV-2026-0003', invoiceDate: '2026-09-16', dueDate: '2026-10-16', lines: [line('Other work', 1_000, revenue)] });
    await expect(invoices.invoicesUpdate({ id, customerId, invoiceNumber: 'INV-2026-0003', invoiceDate: '2026-09-15', dueDate: '2026-10-15', lines: [line('X', 99_900, revenue)] })).rejects.toThrow(/already used/);
    expect((await invoices.invoicesGet(id)).totalCents).toBe(22_600);
    expect(await balance(ar)).toBe(22_600 + other.totalCents);
    await booksBalance();
  });

  it('once a payment is received the invoice is locked, and nothing moves', async () => {
    await invoices.invoicesReceivePayment({ id, paymentDate: '2026-09-20', bankAccountId: chequing, amountCents: 10_000 });
    const arBefore = await balance(ar);
    await expect(invoices.invoicesUpdate({ id, customerId, invoiceNumber: 'INV-2026-0002', invoiceDate: '2026-09-15', dueDate: '2026-10-15', lines: [line('More', 50_000, revenue)] })).rejects.toThrow(/payment has been received/);
    expect((await invoices.invoicesGet(id)).lines).toHaveLength(1);
    expect(await balance(ar)).toBe(arBefore);
    await booksBalance();
  });
});

describe('an invoice in a locked period', () => {
  it('cannot be edited, and the refused edit leaves the ledger exactly as it was', async () => {
    const customer = await contacts.customersSave({ name: 'Closed Books Ltd', paymentTerms: 'net30' });
    const inv = await invoices.invoicesCreate({ customerId: customer.id, invoiceNumber: 'INV-2026-0100', invoiceDate: '2026-03-10', dueDate: '2026-04-09', lines: [line('March work', 40_000, revenue)] });
    const period = await fiscalPeriods.fiscalPeriodsCreate({ periodStart: '2026-01-01', periodEnd: '2026-03-31', label: 'Q1 2026' });
    await fiscalPeriods.fiscalPeriodsLock(period.id);
    const arBefore = await balance(ar);

    await expect(invoices.invoicesUpdate({ id: inv.id, customerId: customer.id, invoiceNumber: 'INV-2026-0100', invoiceDate: '2026-03-10', dueDate: '2026-04-09', lines: [line('March work', 90_000, revenue)] })).rejects.toThrow(/locked/i);

    const after = await invoices.invoicesGet(inv.id);
    expect(after.totalCents).toBe(45_200);
    expect(after.invoiceJournalEntryId).toBe(inv.invoiceJournalEntryId);
    expect(after.lines).toHaveLength(1);
    expect((await journalGet(inv.invoiceJournalEntryId!)).status).toBe('posted');
    expect(await balance(ar)).toBe(arBefore);
    await booksBalance();
  });
});
