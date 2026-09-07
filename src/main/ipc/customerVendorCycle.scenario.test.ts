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
import { UNDEPOSITED_FUNDS_ACCOUNT_ARGS, ACCOUNTS_RECEIVABLE_ARGS, ACCOUNTS_PAYABLE_ARGS } from '../db/controlAccounts';

/** Two end-to-end scenarios run through the real main-process handlers, the way the screens call
 * them, against a fresh company file:
 *
 *   1. A new customer is invoiced and pays — partly into Undeposited Funds (then banked with a
 *      deposit), the rest straight into the chequing account.
 *   2. A new vendor sends a bill which is paid in two instalments from the chequing account.
 *
 * Along the way every refusal a bookkeeper could hit is tried (overpaying, paying before the
 * document date, paying twice, deleting a paid document, deactivating a contact who still owes or
 * is owed), a payment is reversed and redone, and at the end the ledger is checked account by
 * account and the trial balance must balance.
 *
 * The packaged better-sqlite3 binary is built for Electron's ABI, so the test runs the same
 * Kysely stack over Node's built-in SQLite through a tiny adapter that mimics the better-sqlite3
 * statement surface Kysely uses (prepare → reader/all/run). */

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
import * as bills from './bills.handlers';
import { journalGet } from './journal.handlers';
import { accountsCreate } from './accounts.handlers';
import { getAllAccounts, getAllJournalEntriesWithLines } from '../db/queries';
import { computeForeignBalances } from '@shared/domain/currency/foreignBalances';
import { EXCHANGE_GAIN_LOSS_ACCOUNT_ARGS } from '../db/controlAccounts';

let db: AppDb;
const accountId = async (code: string) => (await db.selectFrom('accounts').select('id').where('code', '=', code).executeTakeFirstOrThrow()).id;
const accountIdByName = async (name: string) => (await db.selectFrom('accounts').select('id').where('name', '=', name).executeTakeFirstOrThrow()).id;

/** Signed balance of one account over posted entries only: debits minus credits. */
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

async function trialBalance(): Promise<{ debits: number; credits: number }> {
  const rows = await db
    .selectFrom('journalEntryLines')
    .innerJoin('journalEntries', 'journalEntries.id', 'journalEntryLines.journalEntryId')
    .select(['journalEntryLines.debitCents as debitCents', 'journalEntryLines.creditCents as creditCents'])
    .where('journalEntries.status', '=', 'posted')
    .execute();
  return { debits: rows.reduce((s, r) => s + r.debitCents, 0), credits: rows.reduce((s, r) => s + r.creditCents, 0) };
}

beforeAll(async () => {
  db = openScenarioCompany();
  state.db = db;
  // The same seeding a brand-new company gets from Create Company (companyFile.createCompanyAt).
  await seedGifiCodes(db);
  await seedChartOfAccounts(db, GENERAL_SERVICES_TEMPLATE);
  await seedCategoryRules(db);
  await seedOpeningBalanceAccounts(db);
});
afterAll(async () => {
  await db.destroy();
});

describe('Scenario 1 — become a customer and get paid', () => {
  let customerId: number;
  let invoiceId: number;
  let chequing: number;
  let ar: number;
  let undeposited: number;
  let revenue: number;
  let gstPayable: number;

  it('adds the customer, and refuses a second one with the same name', async () => {
    const customer = await contacts.customersSave({ name: 'Northwind Traders', email: 'ap@northwind.example', paymentTerms: 'net30' });
    customerId = customer.id;
    expect(customer.isActive).toBe(true);
    expect((await contacts.customersList()).map((c) => c.name)).toContain('Northwind Traders');
    await expect(contacts.customersSave({ name: 'northwind traders' })).rejects.toThrow(/already/i);
  });

  it('issues an invoice with HST and posts it to the ledger', async () => {
    chequing = await accountId('1000');
    revenue = await accountId('4000');
    const invoiceNumber = await invoices.invoicesNextNumber({ invoiceDate: '2026-09-01' });
    const invoice = await invoices.invoicesCreate({
      customerId,
      invoiceNumber,
      invoiceDate: '2026-09-01',
      dueDate: '2026-10-01',
      lines: [{ description: 'Consulting — September', quantity: 10, unitPriceCents: 10000, revenueAccountId: revenue, taxCode: 'HST' }],
    });
    invoiceId = invoice.id;
    ar = await accountIdByName(ACCOUNTS_RECEIVABLE_ARGS[0]);
    gstPayable = await accountIdByName('GST/HST Payable');
    expect(invoice.totalCents).toBe(113000);
    expect(invoice.status).toBe('unpaid');
    expect(invoice.balanceDueCents).toBe(113000);
    expect(await balance(ar)).toBe(113000);
    expect(await balance(revenue)).toBe(-100000);
    expect(await balance(gstPayable)).toBe(-13000);
    const listed = (await invoices.invoicesList()).find((row) => row.id === invoiceId);
    expect(listed?.balanceDueCents).toBe(113000);
  });

  it('refuses money that cannot be right: dated before the invoice, or more than is owed', async () => {
    await expect(invoices.invoicesReceivePayment({ id: invoiceId, paymentDate: '2026-08-31', amountCents: 100000 })).rejects.toThrow(/before/i);
    await expect(invoices.invoicesReceivePayment({ id: invoiceId, paymentDate: '2026-09-10', amountCents: 113001 })).rejects.toThrow(/exceed/i);
  });

  it('takes a part payment into Undeposited Funds and then banks it with a deposit', async () => {
    const after = await invoices.invoicesReceivePayment({ id: invoiceId, paymentDate: '2026-09-10', amountCents: 50000 });
    expect(after.status).toBe('unpaid');
    expect(after.balanceDueCents).toBe(63000);
    undeposited = await accountIdByName(UNDEPOSITED_FUNDS_ACCOUNT_ARGS[0]);
    expect(await balance(undeposited)).toBe(50000);
    expect(await balance(ar)).toBe(63000);

    // A customer who still owes money cannot be made inactive.
    await expect(contacts.customersDeactivate(customerId)).rejects.toThrow();

    const waiting = await invoices.depositsGetUndeposited();
    const item = waiting.find((w) => w.kind === 'invoicePayment' && w.totalCents === 50000);
    expect(item).toBeDefined();
    await invoices.depositsCreate({ invoicePaymentIds: [item!.id], bankAccountId: chequing, depositDate: '2026-09-11' });
    expect(await balance(undeposited)).toBe(0);
    expect(await balance(chequing)).toBe(50000);
    expect(await invoices.depositsGetUndeposited()).toHaveLength(0);
  });

  it('takes the remainder straight into the bank, closing the invoice', async () => {
    const paid = await invoices.invoicesReceivePayment({ id: invoiceId, paymentDate: '2026-09-20', bankAccountId: chequing, amountCents: 63000 });
    expect(paid.status).toBe('paid');
    expect(paid.balanceDueCents).toBe(0);
    expect(await balance(ar)).toBe(0);
    expect(await balance(chequing)).toBe(113000);
    expect(await invoices.invoicesPayments(invoiceId)).toHaveLength(2);
    await expect(invoices.invoicesReceivePayment({ id: invoiceId, paymentDate: '2026-09-21', amountCents: 100 })).rejects.toThrow(/paid in full/i);
  });

  it('reverses the last receipt, reopening the balance, then takes it again', async () => {
    const payments = await invoices.invoicesPayments(invoiceId);
    const newest = payments[0];
    const reopened = await invoices.invoicesReverseLastPayment(invoiceId);
    expect(reopened.status).toBe('unpaid');
    expect(reopened.balanceDueCents).toBe(63000);
    expect((await journalGet(newest.journalEntryId)).status).toBe('void');
    expect(await balance(ar)).toBe(63000);
    expect(await balance(chequing)).toBe(50000);

    const closed = await invoices.invoicesReceivePayment({ id: invoiceId, paymentDate: '2026-09-22', bankAccountId: chequing, amountCents: 63000 });
    expect(closed.status).toBe('paid');
    expect(await balance(ar)).toBe(0);
    expect(await balance(chequing)).toBe(113000);
  });

  it('will not delete a paid invoice, and only now lets the customer be deactivated', async () => {
    await expect(invoices.invoicesDelete(invoiceId)).rejects.toThrow();
    const inactive = await contacts.customersDeactivate(customerId);
    expect(inactive.isActive).toBe(false);
    // …and an inactive customer cannot be invoiced.
    await expect(invoices.invoicesCreate({
      customerId, invoiceNumber: 'INV-9999', invoiceDate: '2026-09-23', dueDate: '2026-10-23',
      lines: [{ description: 'x', quantity: 1, unitPriceCents: 100, revenueAccountId: revenue }],
    })).rejects.toThrow(/inactive/i);
  });
});

describe('Scenario 2 — become a vendor and get paid', () => {
  let vendorId: number;
  let billId: number;
  let chequing: number;
  let ap: number;
  let expense: number;
  let gstRecoverable: number;

  it('adds the vendor with a default expense account', async () => {
    chequing = await accountId('1000');
    expense = await accountId('5000');
    const vendor = await contacts.vendorsSave({ name: 'Acme Office Supplies', defaultExpenseAccountId: expense, paymentTerms: 'net30' });
    vendorId = vendor.id;
    expect(vendor.defaultExpenseAccountId).toBe(expense);
    await expect(contacts.vendorsSave({ name: 'ACME OFFICE SUPPLIES' })).rejects.toThrow(/already/i);
  });

  it('records the bill with HST and posts it to payables', async () => {
    const bill = await bills.billsCreate({
      vendorId,
      billNumber: 'A-1001',
      billDate: '2026-09-02',
      dueDate: '2026-10-02',
      lines: [{ categoryAccountId: expense, description: 'Toner and paper', baseCents: 80000, taxCode: 'HST', taxCents: 10400 }],
    });
    billId = bill.id;
    ap = await accountIdByName(ACCOUNTS_PAYABLE_ARGS[0]);
    gstRecoverable = await accountIdByName('GST/HST Recoverable');
    expect(bill.amountCents).toBe(90400);
    expect(bill.status).toBe('unpaid');
    expect(bill.balanceDueCents).toBe(90400);
    expect(bill.approvalStatus).toBe('approved');
    expect(await balance(ap)).toBe(-90400);
    expect(await balance(expense)).toBe(80000);
    expect(await balance(gstRecoverable)).toBe(10400);
    await expect(bills.billsCreate({
      vendorId, billNumber: 'a-1001', billDate: '2026-09-03', dueDate: '2026-10-03',
      lines: [{ categoryAccountId: expense, baseCents: 100, taxCents: 0 }],
    })).rejects.toThrow(/already recorded/i);
  });

  it('refuses payments that cannot be right', async () => {
    const undeposited = await accountIdByName(UNDEPOSITED_FUNDS_ACCOUNT_ARGS[0]);
    await expect(bills.billsPay({ id: billId, bankAccountId: undeposited, paymentDate: '2026-09-15', amountCents: 1000 })).rejects.toThrow(/not a bank account/i);
    await expect(bills.billsPay({ id: billId, bankAccountId: chequing, paymentDate: '2026-09-01', amountCents: 1000 })).rejects.toThrow(/before/i);
    await expect(bills.billsPay({ id: billId, bankAccountId: chequing, paymentDate: '2026-09-15', amountCents: 90401 })).rejects.toThrow(/exceed/i);
  });

  it('pays the bill in two instalments from the chequing account', async () => {
    const first = await bills.billsPay({ id: billId, bankAccountId: chequing, paymentDate: '2026-09-15', amountCents: 40000 });
    expect(first.status).toBe('unpaid');
    expect(first.balanceDueCents).toBe(50400);
    expect(await balance(ap)).toBe(-50400);
    await expect(contacts.vendorsDeactivate(vendorId)).rejects.toThrow();

    const second = await bills.billsPay({ id: billId, bankAccountId: chequing, paymentDate: '2026-09-25', amountCents: 50400 });
    expect(second.status).toBe('paid');
    expect(second.balanceDueCents).toBe(0);
    expect(await balance(ap)).toBe(0);
    expect(await balance(chequing)).toBe(113000 - 90400);
    expect(await bills.billsPayments(billId)).toHaveLength(2);
    await expect(bills.billsPay({ id: billId, bankAccountId: chequing, paymentDate: '2026-09-26', amountCents: 100 })).rejects.toThrow(/paid in full/i);
  });

  it('reverses the last payment, then pays again', async () => {
    const newest = (await bills.billsPayments(billId))[0];
    const reopened = await bills.billsReverseLastPayment(billId);
    expect(reopened.status).toBe('unpaid');
    expect(reopened.balanceDueCents).toBe(50400);
    expect((await journalGet(newest.journalEntryId)).status).toBe('void');
    expect(await balance(ap)).toBe(-50400);
    const closed = await bills.billsPay({ id: billId, bankAccountId: chequing, paymentDate: '2026-09-27', amountCents: 50400 });
    expect(closed.status).toBe('paid');
    expect(await balance(ap)).toBe(0);
  });

  it('will not delete a paid bill, and only now lets the vendor be deactivated', async () => {
    await expect(bills.billsDelete(billId)).rejects.toThrow(/payments/i);
    const inactive = await contacts.vendorsDeactivate(vendorId);
    expect(inactive.isActive).toBe(false);
    await expect(bills.billsCreate({
      vendorId, billDate: '2026-09-28', dueDate: '2026-10-28',
      lines: [{ categoryAccountId: expense, baseCents: 100, taxCents: 0 }],
    })).rejects.toThrow(/inactive/i);
  });
});

describe('After both scenarios', () => {
  it('the books balance and every control account agrees with its documents', async () => {
    const tb = await trialBalance();
    expect(tb.debits).toBe(tb.credits);
    expect(await balance(await accountIdByName(ACCOUNTS_RECEIVABLE_ARGS[0]))).toBe(0);
    expect(await balance(await accountIdByName(ACCOUNTS_PAYABLE_ARGS[0]))).toBe(0);
    expect(await balance(await accountIdByName(UNDEPOSITED_FUNDS_ACCOUNT_ARGS[0]))).toBe(0);
    expect(await balance(await accountId('1000'))).toBe(22600);
    expect(await balance(await accountId('4000'))).toBe(-100000);
    expect(await balance(await accountId('5000'))).toBe(80000);
    expect(await balance(await accountIdByName('GST/HST Payable'))).toBe(-13000);
    expect(await balance(await accountIdByName('GST/HST Recoverable'))).toBe(10400);
    const openInvoices = (await invoices.invoicesList()).filter((i) => i.balanceDueCents > 0);
    const openBills = (await bills.billsList()).filter((b) => b.balanceDueCents > 0);
    expect(openInvoices).toHaveLength(0);
    expect(openBills).toHaveLength(0);
  });
});

describe('Foreign-currency edges met on the way', () => {
  let usdBank: number;
  let customerId: number;
  let vendorId: number;
  let revenue: number;
  let expense: number;
  let chequing: number;
  let undeposited: number;

  const usdBalance = async () => {
    const balances = computeForeignBalances(await getAllAccounts(db), await getAllJournalEntriesWithLines(db));
    return balances.find((b) => b.accountId === usdBank);
  };

  it('opens a USD chequing account and a US customer and vendor', async () => {
    const account = await accountsCreate({ code: '1020', name: 'US Dollar Chequing', accountType: 'Asset', accountSubtype: 'Cash and Bank', currency: 'USD' });
    usdBank = account.id;
    revenue = await accountId('4000');
    expense = await accountId('5000');
    chequing = await accountId('1000');
    undeposited = await accountIdByName(UNDEPOSITED_FUNDS_ACCOUNT_ARGS[0]);
    customerId = (await contacts.customersSave({ name: 'Pacific Imports LLC' })).id;
    vendorId = (await contacts.vendorsSave({ name: 'Seattle Parts Co' })).id;
  });

  it('a USD receipt parked in Undeposited Funds is banked at the cash amount, leaving nothing behind', async () => {
    const invoice = await invoices.invoicesCreate({
      customerId, invoiceNumber: 'INV-US-1', invoiceDate: '2026-09-05', dueDate: '2026-10-05',
      foreignCurrency: 'USD', foreignAmountCents: 100000, exchangeRate: 1.3,
      lines: [{ description: 'Export consulting', quantity: 1, unitPriceCents: 130000, revenueAccountId: revenue, taxCode: 'NonHST' }],
    });
    expect(invoice.totalCents).toBe(130000);
    const paid = await invoices.invoicesReceivePayment({ id: invoice.id, paymentDate: '2026-09-12', amountCents: 130000, foreignAmountCents: 100000, exchangeRate: 1.35 });
    expect(paid.status).toBe('paid');
    const fx = await accountIdByName(EXCHANGE_GAIN_LOSS_ACCOUNT_ARGS[0]);
    expect(await balance(undeposited)).toBe(135000);
    expect(await balance(fx)).toBe(-5000);

    const item = (await invoices.depositsGetUndeposited()).find((w) => w.kind === 'invoicePayment' && w.number === 'INV-US-1');
    expect(item).toBeDefined();
    // What the bank will show is the cash that arrived, not the receivable that was relieved.
    expect(item!.totalCents).toBe(135000);
    await invoices.depositsCreate({ invoicePaymentIds: [item!.id], bankAccountId: usdBank, depositDate: '2026-09-13' });
    expect(await balance(undeposited)).toBe(0);
    expect(await balance(usdBank)).toBe(135000);
    expect((await usdBalance())?.foreignCents).toBe(100000);
  });

  it('refuses settling a CAD document through an account held in another currency', async () => {
    const cadInvoice = await invoices.invoicesCreate({
      customerId, invoiceNumber: 'INV-CA-1', invoiceDate: '2026-09-06', dueDate: '2026-10-06',
      lines: [{ description: 'Domestic work', quantity: 1, unitPriceCents: 20000, revenueAccountId: revenue, taxCode: 'HST' }],
    });
    await expect(invoices.invoicesReceivePayment({ id: cadInvoice.id, paymentDate: '2026-09-14', bankAccountId: usdBank, amountCents: 22600 })).rejects.toThrow(/held in USD/);
    const cadBill = await bills.billsCreate({
      vendorId, billNumber: 'S-77', billDate: '2026-09-06', dueDate: '2026-10-06',
      lines: [{ categoryAccountId: expense, description: 'Domestic parts', baseCents: 10000, taxCode: 'HST', taxCents: 1300 }],
    });
    await expect(bills.billsPay({ id: cadBill.id, bankAccountId: usdBank, paymentDate: '2026-09-14', amountCents: 11300 })).rejects.toThrow(/held in USD/);
    // …and a CAD receipt waiting in Undeposited Funds cannot be banked into the USD account either.
    await invoices.invoicesReceivePayment({ id: cadInvoice.id, paymentDate: '2026-09-14', amountCents: 22600 });
    const item = (await invoices.depositsGetUndeposited()).find((w) => w.kind === 'invoicePayment' && w.number === 'INV-CA-1');
    await expect(invoices.depositsCreate({ invoicePaymentIds: [item!.id], bankAccountId: usdBank, depositDate: '2026-09-15' })).rejects.toThrow(/held in USD/);
    await invoices.depositsCreate({ invoicePaymentIds: [item!.id], bankAccountId: chequing, depositDate: '2026-09-15' });
    await bills.billsPay({ id: cadBill.id, bankAccountId: chequing, paymentDate: '2026-09-15', amountCents: 11300 });
    expect(await balance(usdBank)).toBe(135000);
  });

  it('a USD bill paid from the USD account carries the USD amount on the bank line', async () => {
    const bill = await bills.billsCreate({
      vendorId, billNumber: 'S-78', billDate: '2026-09-07', dueDate: '2026-10-07',
      foreignCurrency: 'USD', foreignAmountCents: 50000, exchangeRate: 1.3,
      lines: [{ categoryAccountId: expense, description: 'Imported parts', baseCents: 65000, taxCode: 'NonHST', taxCents: 0 }],
    });
    const paid = await bills.billsPay({ id: bill.id, bankAccountId: usdBank, paymentDate: '2026-09-16', amountCents: 65000, foreignAmountCents: 50000, exchangeRate: 1.32 });
    expect(paid.status).toBe('paid');
    expect(await balance(usdBank)).toBe(135000 - 66000);
    expect((await usdBalance())?.foreignCents).toBe(50000);
    const tb = await trialBalance();
    expect(tb.debits).toBe(tb.credits);
  });
});
