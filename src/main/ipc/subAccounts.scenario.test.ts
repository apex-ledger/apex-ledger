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

/** Sub-accounts, end to end through the real handlers: a firm that keeps two bank accounts under
 * one "Bank Accounts" master, splits Office Expenses into sub-accounts, and nests a sub-account one
 * level deeper. Money is posted to the sub-accounts and the ledger, trial balance, balance sheet
 * and roll-up must all agree; then every mistake the form cannot make but an import or a second
 * window could (wrong-type parent, missing parent, an account as its own parent, a loop, retiring
 * a master that still has live children) is tried and must be refused.
 *
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

import { accountsCreate, accountsDeactivate, accountsGet, accountsUpdate } from './accounts.handlers';
import { journalCreateAndPost } from './journal.handlers';
import { getAllAccounts, getAllJournalEntriesWithLines } from '../db/queries';
import { trialBalance } from '@shared/domain/ledger/trialBalance';
import { balanceSheet } from '@shared/domain/ledger/balanceSheet';
import { incomeStatement } from '@shared/domain/ledger/incomeStatement';
import { generalLedger } from '@shared/domain/ledger/generalLedger';
import { buildAccountTree, rollUpBalances } from '@shared/domain/ledger/accountTree';
import { depositableAccounts, reconcilableAccounts } from '../../renderer/utils/bankAccounts';

let db: AppDb;
const byCode = async (code: string) => (await db.selectFrom('accounts').selectAll().where('code', '=', code).executeTakeFirstOrThrow()).id;

beforeAll(async () => {
  db = openScenarioCompany();
  state.db = db;
  await seedGifiCodes(db);
  await seedChartOfAccounts(db, GENERAL_SERVICES_TEMPLATE);
  await seedCategoryRules(db);
  await seedOpeningBalanceAccounts(db);
});
afterAll(async () => {
  await db.destroy();
});

describe('Creating sub-accounts of bank accounts and others', () => {
  let bankMaster: number;
  let tdChequing: number;
  let rbcSavings: number;
  let rbcSavingsUsd: number;
  let officeMaster: number;
  let stationery: number;
  let printerInk: number;
  let revenue: number;
  let equity: number;

  it('creates a bank master with two bank sub-accounts, and the master becomes a roll-up automatically', async () => {
    const master = await accountsCreate({ code: '1020', name: 'Bank Accounts', accountType: 'Asset', accountSubtype: 'Cash and Bank', gifiCode: '1002', isMaster: true });
    bankMaster = master.id;
    const td = await accountsCreate({ code: '1021', name: 'TD Chequing 4471', accountType: 'Asset', accountSubtype: 'Cash and Bank', parentId: bankMaster, isTransferEligible: true, accountNumber: '4471' });
    const rbc = await accountsCreate({ code: '1022', name: 'RBC Savings 9902', accountType: 'Asset', accountSubtype: 'Cash and Bank', parentId: bankMaster, isTransferEligible: true, gifiCode: '1001' });
    tdChequing = td.id;
    rbcSavings = rbc.id;
    expect(td.parentId).toBe(bankMaster);
    expect(rbc.parentId).toBe(bankMaster);
    // The children file under the master's GIFI line even when the form sent another one.
    expect(td.gifiCode).toBe('1002');
    expect(rbc.gifiCode).toBe('1002');
    expect((await accountsGet(bankMaster)).isMaster).toBe(true);
  });

  it('a foreign-currency bank sub-account keeps its own currency', async () => {
    const usd = await accountsCreate({ code: '1023', name: 'RBC USD Savings', accountType: 'Asset', accountSubtype: 'Cash and Bank', parentId: bankMaster, isTransferEligible: true, currency: 'USD' });
    rbcSavingsUsd = usd.id;
    expect(usd.currency).toBe('USD');
    expect((await accountsGet(bankMaster)).currency).toBe('CAD');
  });

  it('the bank pickers offer the sub-accounts (deposit to, pay from, reconcile)', async () => {
    const accounts = await getAllAccounts(db);
    const names = (list: { id: number }[]) => list.map((a) => a.id);
    expect(names(depositableAccounts(accounts))).toEqual(expect.arrayContaining([tdChequing, rbcSavings, rbcSavingsUsd]));
    expect(names(reconcilableAccounts(accounts))).toEqual(expect.arrayContaining([tdChequing, rbcSavings]));
  });

  it('creates expense sub-accounts, and a sub-account of a sub-account', async () => {
    const office = await accountsCreate({ code: '5300', name: 'Office Expenses (master)', accountType: 'Expense', accountSubtype: 'Operating Expense', gifiCode: '8810' });
    officeMaster = office.id;
    stationery = (await accountsCreate({ code: '5301', name: 'Stationery', accountType: 'Expense', parentId: officeMaster })).id;
    printerInk = (await accountsCreate({ code: '5302', name: 'Printer ink', accountType: 'Expense', parentId: stationery })).id;
    const tree = buildAccountTree(await getAllAccounts(db));
    const depthOf = (id: number) => tree.find((n) => n.account.id === id)!.depth;
    expect(depthOf(officeMaster)).toBe(0);
    expect(depthOf(stationery)).toBe(1);
    expect(depthOf(printerInk)).toBe(2);
    // Order: the master, then its children directly beneath it.
    const ids = tree.map((n) => n.account.id);
    expect(ids.indexOf(stationery)).toBe(ids.indexOf(officeMaster) + 1);
    expect(ids.indexOf(printerInk)).toBe(ids.indexOf(stationery) + 1);
    expect((await accountsGet(printerInk)).gifiCode).toBe('8810');
  });

  it('posts money through the sub-accounts', async () => {
    revenue = await byCode('4000');
    equity = (await db.selectFrom('accounts').select('id').where('accountType', '=', 'Equity').where('isActive', '=', 1).executeTakeFirstOrThrow()).id;
    // Owner puts $10,000 into TD and $5,000 into RBC.
    await journalCreateAndPost({ entryDate: '2026-01-05', memo: 'Opening deposit', lines: [{ accountId: tdChequing, debitCents: 1_000_000, creditCents: 0 }, { accountId: rbcSavings, debitCents: 500_000, creditCents: 0 }, { accountId: equity, debitCents: 0, creditCents: 1_500_000 }] });
    // A $1,130 sale banked into TD.
    await journalCreateAndPost({ entryDate: '2026-01-10', memo: 'Sale', lines: [{ accountId: tdChequing, debitCents: 113_000, creditCents: 0 }, { accountId: revenue, debitCents: 0, creditCents: 113_000 }] });
    // Stationery $80 from TD, printer ink $45 from RBC, and $12 posted straight to the office master.
    await journalCreateAndPost({ entryDate: '2026-01-15', memo: 'Staples', lines: [{ accountId: stationery, debitCents: 8_000, creditCents: 0 }, { accountId: tdChequing, debitCents: 0, creditCents: 8_000 }] });
    await journalCreateAndPost({ entryDate: '2026-01-16', memo: 'Ink', lines: [{ accountId: printerInk, debitCents: 4_500, creditCents: 0 }, { accountId: rbcSavings, debitCents: 0, creditCents: 4_500 }] });
    await journalCreateAndPost({ entryDate: '2026-01-17', memo: 'Misc office', lines: [{ accountId: officeMaster, debitCents: 1_200, creditCents: 0 }, { accountId: rbcSavings, debitCents: 0, creditCents: 1_200 }] });
    // Transfer $2,000 TD -> RBC.
    await journalCreateAndPost({ entryDate: '2026-01-20', memo: 'Transfer', lines: [{ accountId: rbcSavings, debitCents: 200_000, creditCents: 0 }, { accountId: tdChequing, debitCents: 0, creditCents: 200_000 }] });
  });

  it('each sub-account carries only its own entries in the ledger', async () => {
    const accounts = await getAllAccounts(db);
    const entries = await getAllJournalEntriesWithLines(db);
    const acc = (id: number) => accounts.find((a) => a.id === id)!;
    const td = generalLedger(acc(tdChequing), entries, '2026-01-01', '2026-12-31', { allAccounts: accounts });
    const rbc = generalLedger(acc(rbcSavings), entries, '2026-01-01', '2026-12-31', { allAccounts: accounts });
    const master = generalLedger(acc(bankMaster), entries, '2026-01-01', '2026-12-31', { allAccounts: accounts });
    expect(td.closingBalanceCents).toBe(1_000_000 + 113_000 - 8_000 - 200_000);
    expect(rbc.closingBalanceCents).toBe(500_000 - 4_500 - 1_200 + 200_000);
    expect(td.lines).toHaveLength(4);
    expect(rbc.lines).toHaveLength(4);
    // Nothing was posted to the master itself, so its own ledger is empty.
    expect(master.lines).toHaveLength(0);
    expect(master.closingBalanceCents).toBe(0);
  });

  it('trial balance and balance sheet list the sub-accounts separately, and still balance', async () => {
    const accounts = await getAllAccounts(db);
    const entries = await getAllJournalEntriesWithLines(db);
    const tb = trialBalance(accounts, entries, '2026-12-31');
    expect(tb.totalDebitCents).toBe(tb.totalCreditCents);
    const row = (id: number) => tb.rows.find((r) => r.account.id === id);
    expect(row(tdChequing)!.debitCents).toBe(905_000);
    expect(row(rbcSavings)!.debitCents).toBe(694_300);
    expect(row(bankMaster)).toBeUndefined(); // zero balance: nothing posted to the master itself

    const bs = balanceSheet(accounts, entries, '2026-12-31');
    expect(bs.isBalanced).toBe(true);
    const line = (id: number) => bs.assets.lines.find((l) => l.account.id === id);
    expect(line(tdChequing)!.amountCents).toBe(905_000);
    expect(line(rbcSavings)!.amountCents).toBe(694_300);
    // The master is not a second copy of its children on the statement.
    expect(bs.assets.totalCents).toBe(905_000 + 694_300);

    const is = incomeStatement(accounts, entries, '2026-01-01', '2026-12-31');
    const exp = (id: number) => is.expenses.lines.find((l) => l.account.id === id)?.amountCents ?? 0;
    expect(exp(stationery)).toBe(8_000);
    expect(exp(printerInk)).toBe(4_500);
    expect(exp(officeMaster)).toBe(1_200);
    expect(is.expenses.totalCents).toBe(8_000 + 4_500 + 1_200);
  });

  it('rolls the children up into the master, one level and two levels deep', async () => {
    const accounts = await getAllAccounts(db);
    const entries = await getAllJournalEntriesWithLines(db);
    const tb = trialBalance(accounts, entries, '2026-12-31');
    const own = new Map(tb.rows.map((r) => [r.account.id, r.debitCents - r.creditCents]));
    const rolled = rollUpBalances(accounts, own);
    expect(rolled.get(bankMaster)).toBe(905_000 + 694_300);
    expect(rolled.get(tdChequing)).toBe(905_000);
    expect(rolled.get(stationery)).toBe(8_000 + 4_500);
    expect(rolled.get(officeMaster)).toBe(1_200 + 8_000 + 4_500);
  });

  it('can move a sub-account under a different master, and it takes that master’s GIFI line', async () => {
    const pettyCash = await accountsCreate({ code: '1024', name: 'Petty cash tin', accountType: 'Asset', accountSubtype: 'Cash and Bank', gifiCode: '1001' });
    const moved = await accountsUpdate({ id: pettyCash.id, patch: { parentId: bankMaster } });
    expect(moved.parentId).toBe(bankMaster);
    expect(moved.gifiCode).toBe('1002');
    const back = await accountsUpdate({ id: pettyCash.id, patch: { parentId: null } });
    expect(back.parentId).toBeNull();
  });

  describe('mistakes the server must refuse', () => {
    it('a parent of another type (an expense under a bank account)', async () => {
      await expect(accountsCreate({ code: '5310', name: 'Bank fees (wrong parent)', accountType: 'Expense', parentId: bankMaster })).rejects.toThrow(/type/i);
      await expect(accountsUpdate({ id: stationery, patch: { parentId: bankMaster } })).rejects.toThrow(/type/i);
    });

    it('a parent that does not exist', async () => {
      await expect(accountsCreate({ code: '1030', name: 'Orphan', accountType: 'Asset', parentId: 999_999 })).rejects.toThrow(/parent/i);
    });

    it('an account as its own parent, or a loop through its own children', async () => {
      await expect(accountsUpdate({ id: officeMaster, patch: { parentId: officeMaster } })).rejects.toThrow(/own parent|itself/i);
      // Office master -> Stationery -> Printer ink; putting the master under Printer ink would loop.
      await expect(accountsUpdate({ id: officeMaster, patch: { parentId: printerInk } })).rejects.toThrow(/loop|sub-account of/i);
      // Nothing changed.
      expect((await accountsGet(officeMaster)).parentId).toBeNull();
    });

    it('an inactive parent', async () => {
      const retired = await accountsCreate({ code: '1040', name: 'Old bank', accountType: 'Asset' });
      await accountsDeactivate(retired.id);
      await expect(accountsCreate({ code: '1041', name: 'Under old bank', accountType: 'Asset', parentId: retired.id })).rejects.toThrow(/inactive/i);
    });

    it('retiring a master that still has active sub-accounts', async () => {
      await expect(accountsDeactivate(bankMaster)).rejects.toThrow(/sub-account/i);
      await expect(accountsUpdate({ id: bankMaster, patch: { isActive: false } })).rejects.toThrow(/sub-account/i);
      expect((await accountsGet(bankMaster)).isActive).toBe(true);
    });

    it('a sub-account can be retired once its balance is nil, and the master after all its children', async () => {
      const spare = await accountsCreate({ code: '1025', name: 'Spare account', accountType: 'Asset', parentId: bankMaster });
      const retired = await accountsDeactivate(spare.id);
      expect(retired.isActive).toBe(false);
      // Master still has three live children, so it still cannot go.
      await expect(accountsDeactivate(bankMaster)).rejects.toThrow(/sub-account/i);
    });
  });

  it('after everything, the books still balance and every account is reachable in the tree', async () => {
    const accounts = await getAllAccounts(db);
    const entries = await getAllJournalEntriesWithLines(db);
    const tb = trialBalance(accounts, entries, '2026-12-31');
    expect(tb.totalDebitCents).toBe(tb.totalCreditCents);
    const tree = buildAccountTree(accounts);
    expect(tree).toHaveLength(accounts.length);
    expect(new Set(tree.map((n) => n.account.id)).size).toBe(accounts.length);
  });
});
