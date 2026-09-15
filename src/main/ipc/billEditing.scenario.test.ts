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
import { ACCOUNTS_PAYABLE_ARGS } from '../db/controlAccounts';

/** Correcting a vendor bill before it is paid, end to end through the real handlers.
 *
 * Lines are added and removed, and at every step Accounts Payable equals what the bill now says,
 * GST/HST Recoverable equals the tax on its current lines, and the books balance. An approval given
 * to one total is withdrawn when the total changes; a rejected bill is resubmitted when corrected.
 * Stock the bill brought in is restated with it until a later sale has been costed from it. A paid
 * bill and a bill in a locked period are refused and nothing moves. */

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
import * as bills from './bills.handlers';
import * as invoices from './invoices.handlers';
import * as fiscalPeriods from './fiscalPeriods.handlers';
import { productsCreate } from './inventory.handlers';
import { accountsCreate } from './accounts.handlers';
import { journalCreateAndPost, journalGet } from './journal.handlers';
import { getAllAccounts, getAllJournalEntriesWithLines } from '../db/queries';
import { trialBalance } from '@shared/domain/ledger/trialBalance';
import { balanceSheet } from '@shared/domain/ledger/balanceSheet';

let db: AppDb;
const byCode = async (code: string) => (await db.selectFrom('accounts').select('id').where('code', '=', code).executeTakeFirstOrThrow()).id;
const byName = async (name: string) => (await db.selectFrom('accounts').select('id').where('name', '=', name).executeTakeFirstOrThrow()).id;

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

let officeSupplies: number;
let phones: number;
let chequing: number;
let ap: number;
let vendorId: number;

const line = (categoryAccountId: number, baseCents: number, description: string) => ({ categoryAccountId, baseCents, taxCode: 'HST' as const, taxCents: Math.round(baseCents * 0.13), description });
const edit = (id: number, lines: ReturnType<typeof line>[]) =>
  bills.billsUpdate({ id, vendorId, billNumber: 'BELL-0912', billDate: '2026-09-04', dueDate: '2026-10-04', lines });

beforeAll(async () => {
  db = openScenarioCompany();
  state.db = db;
  await seedGifiCodes(db);
  await seedChartOfAccounts(db, GENERAL_SERVICES_TEMPLATE);
  await seedCategoryRules(db);
  await seedOpeningBalanceAccounts(db);
  chequing = await byCode('1000');
  officeSupplies = await byCode('5040');
  phones = (await db.selectFrom('accounts').select('id').where('accountType', '=', 'Expense').where('id', '!=', officeSupplies).where('isActive', '=', 1).executeTakeFirstOrThrow()).id;
  const equity = (await db.selectFrom('accounts').select('id').where('accountType', '=', 'Equity').where('isActive', '=', 1).executeTakeFirstOrThrow()).id;
  await journalCreateAndPost({ entryDate: '2026-09-01', memo: 'Owner investment', lines: [{ accountId: chequing, debitCents: 500_000, creditCents: 0 }, { accountId: equity, debitCents: 0, creditCents: 500_000 }] });
  vendorId = (await contacts.vendorsSave({ name: 'Bell Canada', defaultExpenseAccountId: officeSupplies, paymentTerms: 'net30' })).id;
});
afterAll(async () => {
  await db.destroy();
});

describe('an unpaid bill can still be corrected', () => {
  let id: number;
  let hstRecoverable: number;
  let firstJournal: number;

  it('starts as $100 plus HST owed to the vendor', async () => {
    const bill = await bills.billsCreate({ vendorId, billNumber: 'BELL-0912', billDate: '2026-09-04', dueDate: '2026-10-04', lines: [line(officeSupplies, 10_000, 'Toner')] });
    id = bill.id;
    firstJournal = bill.billJournalEntryId!;
    ap = await byName(ACCOUNTS_PAYABLE_ARGS[0]);
    hstRecoverable = await byName('GST/HST Recoverable');
    expect(await balance(ap)).toBe(-11_300);
  });

  it('adding a missed line re-posts the bill: payable, expense and HST all follow, and the old journal is voided', async () => {
    const edited = await edit(id, [line(officeSupplies, 10_000, 'Toner'), line(phones, 5_000, 'Phone line')]);
    expect(edited.id).toBe(id);
    expect(edited.amountCents).toBe(16_950);
    expect(edited.lines).toHaveLength(2);
    expect((await journalGet(firstJournal)).status).toBe('void');
    expect(await balance(ap)).toBe(-16_950);
    expect(await balance(officeSupplies)).toBe(10_000);
    expect(await balance(phones)).toBe(5_000);
    expect(await balance(hstRecoverable)).toBe(1_950);
    await booksBalance();
  });

  it('removing a line takes its expense and tax back out, and keeps its own vendor invoice number', async () => {
    const edited = await edit(id, [line(phones, 5_000, 'Phone line')]);
    expect(edited.billNumber).toBe('BELL-0912');
    expect(edited.amountCents).toBe(5_650);
    expect(await balance(ap)).toBe(-5_650);
    expect(await balance(officeSupplies)).toBe(0);
    expect(await balance(hstRecoverable)).toBe(650);
    const revisions = await db.selectFrom('journalEntryRevisions').selectAll().where('journalEntryId', '=', edited.billJournalEntryId!).execute();
    expect(revisions.some((r) => r.label === 'Bill BELL-0912 edited' && r.oldValue === '169.50 — 2 lines' && r.newValue === '56.50 — 1 line')).toBe(true);
    await booksBalance();
  });

  it('an approval given to one total is withdrawn when the total changes, but survives a correction that keeps the total', async () => {
    await bills.billsSetApproval({ id, approvalStatus: 'onHold' });
    await bills.billsSetApproval({ id, approvalStatus: 'approved', approvedBy: 'Nisha' });

    const sameTotal = await edit(id, [line(phones, 5_000, 'Phone line — September')]);
    expect(sameTotal.approvalStatus).toBe('approved');

    const newTotal = await edit(id, [line(phones, 6_000, 'Phone line — September')]);
    expect(newTotal.approvalStatus).toBe('pending');
    expect(newTotal.approvedBy).toBeNull();
    expect(newTotal.approvalNote).toBe('Changed after approval: 56.50 → 67.80. Approve again before paying.');
    // Not payable on the strength of an approval given to another amount.
    await expect(bills.billsPay({ id, bankAccountId: chequing, paymentDate: '2026-09-10', amountCents: 6_780 })).rejects.toThrow(/awaiting approval/i);
  });

  it('a rejected bill is resubmitted for approval when it is corrected', async () => {
    await bills.billsSetApproval({ id, approvalStatus: 'rejected', note: 'Wrong amount' });
    const corrected = await edit(id, [line(phones, 5_000, 'Phone line — September')]);
    expect(corrected.approvalStatus).toBe('pending');
    expect(corrected.approvalNote).toMatch(/Corrected after rejection/);
  });

  it('once paid it is locked, and nothing moves', async () => {
    await bills.billsSetApproval({ id, approvalStatus: 'approved', approvedBy: 'Nisha' });
    await bills.billsPay({ id, bankAccountId: chequing, paymentDate: '2026-09-10', amountCents: 5_650 });
    const apBefore = await balance(ap);
    await expect(edit(id, [line(phones, 99_000, 'X')])).rejects.toThrow(/payment has been made/);
    expect((await bills.billsGet(id)).amountCents).toBe(5_650);
    expect(await balance(ap)).toBe(apBefore);
    await booksBalance();
  });
});

describe('a bill that brought in stock', () => {
  it('is restated with its stock while nothing has been costed from it, and refused once a sale has', async () => {
    const inventoryAsset = (await accountsCreate({ code: '1300', name: 'Inventory Asset', accountType: 'Asset', accountSubtype: 'Inventory' })).id;
    const cogs = await byCode('5035');
    const revenue = await byCode('4000');
    const widget = await productsCreate({ sku: 'W-1', barcode: null, name: 'Widget', description: null, unit: 'each', salePriceCents: 2_000, purchasePriceCents: 1_000, incomeAccountId: revenue, cogsAccountId: cogs, assetAccountId: inventoryAsset, trackQuantity: true, defaultTaxCode: 'HST', reorderPoint: 0 });

    const stockLine = (unit: number) => ({ categoryAccountId: inventoryAsset, baseCents: unit * 10, taxCode: 'HST' as const, taxCents: Math.round(unit * 10 * 0.13), description: 'Widgets', productId: widget.id, quantity: 10 });
    const bill = await bills.billsCreate({ vendorId, billNumber: 'WID-1', billDate: '2026-09-05', dueDate: '2026-10-05', lines: [stockLine(1_000)] });

    const restated = await bills.billsUpdate({ id: bill.id, vendorId, billNumber: 'WID-1', billDate: '2026-09-05', dueDate: '2026-10-05', lines: [stockLine(1_200)] });
    expect(restated.amountCents).toBe(13_560);
    const movements = await db.selectFrom('inventoryMovements').selectAll().where('sourceDocumentType', '=', 'bill').where('sourceDocumentId', '=', bill.id).execute();
    expect(movements).toHaveLength(1);
    expect(movements[0].unitCostCents).toBe(1_200);
    expect(await balance(inventoryAsset)).toBe(12_000);
    await booksBalance();

    const customer = await contacts.customersSave({ name: 'Widget Buyer', paymentTerms: 'net30' });
    await invoices.invoicesCreate({ customerId: customer.id, invoiceNumber: 'INV-W-1', invoiceDate: '2026-09-06', dueDate: '2026-10-06', lines: [{ description: 'Widgets', quantity: 5, unitPriceCents: 2_000, revenueAccountId: revenue, taxCode: 'HST', productId: widget.id }] });
    expect(await balance(cogs)).toBe(6_000); // five at the restated $12.00

    await expect(bills.billsUpdate({ id: bill.id, vendorId, billNumber: 'WID-1', billDate: '2026-09-05', dueDate: '2026-10-05', lines: [stockLine(900)] })).rejects.toThrow(/Widget.*later transaction/);
    expect((await bills.billsGet(bill.id)).amountCents).toBe(13_560);
    await booksBalance();
  });
});

describe('a bill in a locked period', () => {
  it('cannot be corrected, and the refused edit leaves the ledger as it was', async () => {
    const bill = await bills.billsCreate({ vendorId, billNumber: 'BELL-0301', billDate: '2026-03-01', dueDate: '2026-03-31', lines: [line(officeSupplies, 20_000, 'March')] });
    const period = await fiscalPeriods.fiscalPeriodsCreate({ periodStart: '2026-01-01', periodEnd: '2026-03-31', label: 'Q1 2026' });
    await fiscalPeriods.fiscalPeriodsLock(period.id);
    const apBefore = await balance(ap);

    await expect(bills.billsUpdate({ id: bill.id, vendorId, billNumber: 'BELL-0301', billDate: '2026-03-01', dueDate: '2026-03-31', lines: [line(officeSupplies, 90_000, 'March')] })).rejects.toThrow(/locked/i);

    const after = await bills.billsGet(bill.id);
    expect(after.amountCents).toBe(22_600);
    expect(after.billJournalEntryId).toBe(bill.billJournalEntryId);
    expect((await journalGet(bill.billJournalEntryId!)).status).toBe('posted');
    expect(await balance(ap)).toBe(apBefore);
    await booksBalance();
  });
});
