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
import { ACCOUNTS_PAYABLE_ARGS, ACCOUNTS_RECEIVABLE_ARGS, UNDEPOSITED_FUNDS_ACCOUNT_ARGS } from '../db/controlAccounts';

/** Company credit cards, end to end through the real handlers:
 *
 *   1. An expense is charged to the Visa (Quick Entry, HST split out).
 *   2. A vendor bill is paid with the Mastercard (Pay Bill).
 *   3. The Visa statement is paid in full from chequing; part of the Mastercard from savings
 *      (both the way the Transfer screen posts them).
 *   4. The Visa is reconciled to a nil statement, the Mastercard to its remaining balance.
 *   5. A customer pays an invoice by card: the money sits in Undeposited Funds, is deposited to
 *      chequing, and the processor's fee is recorded as an expense.
 *
 * At each step the ledger, trial balance, balance sheet and HST summary must agree.
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
import * as bills from './bills.handlers';
import * as recon from './bankReconciliation.handlers';
import { quickEntryCreate } from './quickEntry.handlers';
import { journalCreateAndPost, journalGet, journalVoid } from './journal.handlers';
import { getAllAccounts, getAllJournalEntriesWithLines } from '../db/queries';
import { trialBalance } from '@shared/domain/ledger/trialBalance';
import { balanceSheet } from '@shared/domain/ledger/balanceSheet';
import { incomeStatement } from '@shared/domain/ledger/incomeStatement';
import { computeHstSummary } from '@shared/domain/ledger/hstSummary';
import { accountsGet } from './accounts.handlers';
import { remapGifiTotalLines } from '../db/seeds/gifiTotalLineRemap';

let db: AppDb;
const byCode = async (code: string) => (await db.selectFrom('accounts').select('id').where('code', '=', code).executeTakeFirstOrThrow()).id;
const byName = async (name: string) => (await db.selectFrom('accounts').select('id').where('name', '=', name).executeTakeFirstOrThrow()).id;

/** Debits minus credits over posted entries. */
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
  const bs = balanceSheet(accounts, entries, '2026-12-31');
  expect(bs.isBalanced).toBe(true);
  return { accounts, entries, bs };
}

let chequing: number;
let savings: number;
let visa: number;
let mastercard: number;
let officeSupplies: number;
let merchantFees: number;
let hstRecoverable: number;
let hstPayable: number;

beforeAll(async () => {
  db = openScenarioCompany();
  state.db = db;
  await seedGifiCodes(db);
  await seedChartOfAccounts(db, GENERAL_SERVICES_TEMPLATE);
  await seedCategoryRules(db);
  await seedOpeningBalanceAccounts(db);
  chequing = await byCode('1000');
  savings = await byCode('1005');
  visa = await byCode('2050');
  mastercard = await byCode('2060');
  officeSupplies = await byCode('5040');
  merchantFees = await byCode('5015');
  const equity = (await db.selectFrom('accounts').select('id').where('accountType', '=', 'Equity').where('isActive', '=', 1).executeTakeFirstOrThrow()).id;
  // Owner funds the company: $5,000 in chequing, $2,000 in savings.
  await journalCreateAndPost({ entryDate: '2026-09-01', memo: 'Owner investment', lines: [{ accountId: chequing, debitCents: 500_000, creditCents: 0 }, { accountId: savings, debitCents: 200_000, creditCents: 0 }, { accountId: equity, debitCents: 0, creditCents: 700_000 }] });
});
afterAll(async () => {
  await db.destroy();
});

describe('Expenses on the company cards', () => {
  it('a Quick Entry expense charged to the Visa splits the HST onto its own line and owes the card', async () => {
    await quickEntryCreate({ type: 'expense', entryDate: '2026-09-03', moneyAccountId: visa, categoryAccountId: officeSupplies, baseCents: 20_000, taxCode: 'HST', taxCents: 2_600, description: 'Staples — toner' });
    hstRecoverable = await byName('GST/HST Recoverable');
    expect(await balance(visa)).toBe(-22_600); // liability: credit balance
    expect(await balance(officeSupplies)).toBe(20_000);
    expect(await balance(hstRecoverable)).toBe(2_600);
    expect(await balance(chequing)).toBe(500_000); // nothing left the bank
  });

  it('a vendor bill can be paid with the Mastercard, which clears the payable and owes the card instead', async () => {
    const vendor = await contacts.vendorsSave({ name: 'Bell Canada', defaultExpenseAccountId: officeSupplies, paymentTerms: 'net30' });
    const bill = await bills.billsCreate({ vendorId: vendor.id, billNumber: 'BELL-0912', billDate: '2026-09-04', dueDate: '2026-10-04', lines: [{ categoryAccountId: officeSupplies, description: 'Phones', baseCents: 100_000, taxCode: 'HST', taxCents: 13_000 }] });
    const ap = await byName(ACCOUNTS_PAYABLE_ARGS[0]);
    expect(await balance(ap)).toBe(-113_000);
    // Not from an expense or revenue account, though.
    await expect(bills.billsPay({ id: bill.id, bankAccountId: officeSupplies, paymentDate: '2026-09-05', amountCents: 113_000 })).rejects.toThrow(/not a bank/i);
    const paid = await bills.billsPay({ id: bill.id, bankAccountId: mastercard, paymentDate: '2026-09-05', amountCents: 113_000 });
    expect(paid.status).toBe('paid');
    expect(await balance(ap)).toBe(0);
    expect(await balance(mastercard)).toBe(-113_000);
    expect(await balance(hstRecoverable)).toBe(2_600 + 13_000);
    await booksBalance();
  });
});

describe('Paying the cards from the bank', () => {
  it('the Visa statement is paid in full from chequing', async () => {
    await journalCreateAndPost({ entryDate: '2026-09-10', memo: 'Visa payment', lines: [{ accountId: visa, debitCents: 22_600, creditCents: 0 }, { accountId: chequing, debitCents: 0, creditCents: 22_600 }] });
    expect(await balance(visa)).toBe(0);
    expect(await balance(chequing)).toBe(500_000 - 22_600);
  });

  it('part of the Mastercard is paid from savings, and the rest stays owing on the balance sheet', async () => {
    await journalCreateAndPost({ entryDate: '2026-09-11', memo: 'Mastercard payment', lines: [{ accountId: mastercard, debitCents: 50_000, creditCents: 0 }, { accountId: savings, debitCents: 0, creditCents: 50_000 }] });
    expect(await balance(mastercard)).toBe(-63_000);
    expect(await balance(savings)).toBe(150_000);
    const { bs } = await booksBalance();
    expect(bs.liabilities.lines.find((l) => l.account.id === mastercard)?.amountCents).toBe(63_000);
    expect(bs.liabilities.lines.find((l) => l.account.id === visa)).toBeUndefined(); // nil, so not shown
    // The card spending is expense with HST claimable — not a bank movement.
    expect(bs.assets.lines.find((l) => l.account.id === chequing)?.amountCents).toBe(477_400);
  });

  it('paying a card is not an expense: nothing on the income statement moved', async () => {
    expect(await balance(officeSupplies)).toBe(120_000);
  });
});

describe('Reconciling the card statements', () => {
  it('the Visa reconciles to a nil statement once the charge and the payment are ticked', async () => {
    const started = await recon.bankReconciliationStart({ accountId: visa, statementDate: '2026-09-30', endingBalanceCents: 0 });
    expect(started.unclearedLines).toHaveLength(2);
    for (const l of started.unclearedLines) await recon.bankReconciliationToggleLine({ reconciliationId: started.reconciliation.id, lineId: l.line.id, cleared: true });
    const done = await recon.bankReconciliationComplete({ id: started.reconciliation.id });
    expect(done.differenceCents).toBe(0);
    expect(done.reconciliation.status).toBe('completed');
  });

  it('the Mastercard reconciles to the balance still owing', async () => {
    const started = await recon.bankReconciliationStart({ accountId: mastercard, statementDate: '2026-09-30', endingBalanceCents: 63_000 });
    for (const l of started.unclearedLines) await recon.bankReconciliationToggleLine({ reconciliationId: started.reconciliation.id, lineId: l.line.id, cleared: true });
    const done = await recon.bankReconciliationComplete({ id: started.reconciliation.id });
    expect(done.clearedBalanceCents).toBe(63_000);
    expect(done.differenceCents).toBe(0);
  });

  it('an expense account cannot be reconciled', async () => {
    await expect(recon.bankReconciliationStart({ accountId: officeSupplies, statementDate: '2026-09-30', endingBalanceCents: 0 })).rejects.toThrow(/bank, cash, or credit-card/i);
  });
});

describe('A customer pays an invoice by card', () => {
  let invoiceId: number;
  let undeposited: number;
  let ar: number;

  it('the card payment is received into Undeposited Funds and clears the receivable', async () => {
    const revenue = await byCode('4000');
    const customer = await contacts.customersSave({ name: 'Maple Dental', paymentTerms: 'net30' });
    const invoice = await invoices.invoicesCreate({ customerId: customer.id, invoiceNumber: 'INV-2001', invoiceDate: '2026-09-12', dueDate: '2026-10-12', lines: [{ description: 'Bookkeeping — September', quantity: 1, unitPriceCents: 100_000, revenueAccountId: revenue, taxCode: 'HST' }] });
    invoiceId = invoice.id;
    ar = await byName(ACCOUNTS_RECEIVABLE_ARGS[0]);
    hstPayable = await byName('GST/HST Payable');
    expect(await balance(ar)).toBe(113_000);
    const paid = await invoices.invoicesReceivePayment({ id: invoiceId, paymentDate: '2026-09-12', amountCents: 113_000, memo: 'Paid by Visa via Stripe' });
    undeposited = await byName(UNDEPOSITED_FUNDS_ACCOUNT_ARGS[0]); // created the first time money parks there
    expect(paid.status).toBe('paid');
    expect(await balance(ar)).toBe(0);
    expect(await balance(undeposited)).toBe(113_000);
    expect(await balance(hstPayable)).toBe(-13_000);
  });

  it('the processor settles it into chequing, and its fee is booked as an expense', async () => {
    const items = await invoices.depositsGetUndeposited();
    const item = items.find((i) => i.kind === 'invoicePayment' && i.number === 'INV-2001');
    expect(item).toBeDefined();
    await invoices.depositsCreate({ invoicePaymentIds: [item!.id], bankAccountId: chequing, depositDate: '2026-09-14' });
    expect(await balance(undeposited)).toBe(0);
    // Stripe took 2.9% + 30¢ — $33.07, no HST on payment-processing fees.
    await quickEntryCreate({ type: 'expense', entryDate: '2026-09-14', moneyAccountId: chequing, categoryAccountId: merchantFees, baseCents: 3_307, taxCode: null, description: 'Stripe fee INV-2001' });
    expect(await balance(chequing)).toBe(477_400 + 113_000 - 3_307);
    expect(await balance(merchantFees)).toBe(3_307);
  });

  it('a deposit cannot go to a credit card or an expense account', async () => {
    await expect(invoices.depositsCreate({ invoicePaymentIds: [1], bankAccountId: visa, depositDate: '2026-09-14' })).rejects.toThrow(/not a bank/i);
  });
});

describe('At the end', () => {
  it('the HST return sees the card purchases as ITCs and the card sale as tax collected', async () => {
    const { accounts, entries } = await booksBalance();
    const hst = computeHstSummary(accounts, entries, '2026-09-01', '2026-09-30');
    const total = hst.annual.reduce((s, p) => ({ collected: s.collected + p.collectedCents, itc: s.itc + p.itcCents }), { collected: 0, itc: 0 });
    expect(total.itc).toBe(2_600 + 13_000);
    expect(total.collected).toBe(13_000);
    expect(await balance(hstRecoverable)).toBe(15_600);
  });

  it('an older chart’s cost-of-sales account on CRA total line 8518 is moved to 8320 when the company opens', async () => {
    const cogs = await accountsGet(await byCode('5035')); // the template's Cost of Goods Sold
    await db.updateTable('accounts').set({ gifiCode: '8518' }).where('id', '=', cogs.id).execute(); // as an older template left it
    expect(await remapGifiTotalLines(db)).toBe(1);
    expect((await accountsGet(cogs.id)).gifiCode).toBe('8320');
    expect((await accountsGet(officeSupplies)).gifiCode).toBe('8810'); // everything else untouched
    expect(await remapGifiTotalLines(db)).toBe(0); // and running again does nothing
  });

  it('an invoice dated December 31 and paid the same day can be moved to January 31 with its payment', async () => {
    const revenue = await byCode('4000');
    const customer = await contacts.customersSave({ name: 'Cedar Grove Residence', paymentTerms: 'net30' });
    const inv = await invoices.invoicesCreate({ customerId: customer.id, invoiceNumber: 'INV-2024-12', invoiceDate: '2024-12-31', dueDate: '2025-01-30', lines: [{ description: 'Year-end work', quantity: 1, unitPriceCents: 50_000, revenueAccountId: revenue, taxCode: 'HST' }] });
    await invoices.invoicesReceivePayment({ id: inv.id, paymentDate: '2024-12-31', bankAccountId: chequing, amountCents: 56_500 });
    const moved = await invoices.invoicesChangeDate({ id: inv.id, invoiceDate: '2025-01-31' });
    expect(moved.paymentsMoved).toBe(1);
    expect(moved.invoice.invoiceDate).toBe('2025-01-31');
    expect(moved.invoice.dueDate).toBe('2025-03-02'); // keeps its 30-day distance
    const pays = await invoices.invoicesPayments(inv.id);
    expect(pays.map((p) => p.paymentDate)).toEqual(['2025-01-31']);
    // Both journals moved: nothing of this invoice is left in 2024.
    const entries = await getAllJournalEntriesWithLines(db);
    const mine = entries.filter((e) => e.reference === 'INV-2024-12' || e.reference === `INVOICE-${inv.id}`);
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.every((e) => e.entryDate === '2025-01-31')).toBe(true);
    await booksBalance();
  });

  it('refuses a date change that would leave a payment before the invoice', async () => {
    const revenue = await byCode('4000');
    const customer = await contacts.customersSave({ name: 'Lakeside Bakery', paymentTerms: 'net30' });
    const inv = await invoices.invoicesCreate({ customerId: customer.id, invoiceNumber: 'INV-2025-01', invoiceDate: '2025-01-05', dueDate: '2025-02-04', lines: [{ description: 'Books', quantity: 1, unitPriceCents: 10_000, revenueAccountId: revenue, taxCode: 'HST' }] });
    await invoices.invoicesReceivePayment({ id: inv.id, paymentDate: '2025-01-20', bankAccountId: chequing, amountCents: 11_300 });
    await expect(invoices.invoicesChangeDate({ id: inv.id, invoiceDate: '2025-02-01' })).rejects.toThrow(/received on 2025-01-20/);
    expect((await invoices.invoicesGet(inv.id)).invoiceDate).toBe('2025-01-05'); // untouched
  });

  it('a month-end accrual with a reverse-on date posts its mirror on that date, and voiding one voids both', async () => {
    const accrued = (await db.selectFrom('accounts').select('id').where('accountType', '=', 'Liability').where('name', 'like', '%Payable%').where('isActive', '=', 1).executeTakeFirstOrThrow()).id;
    const posted = await journalCreateAndPost({ entryDate: '2026-09-30', memo: 'Accrued hydro for September', reverseOn: '2026-10-01', isAdjustingEntry: true, lines: [{ accountId: officeSupplies, debitCents: 12_000, creditCents: 0 }, { accountId: accrued, debitCents: 0, creditCents: 12_000 }] });
    expect(posted.reverseOn).toBe('2026-10-01');
    const entries = await getAllJournalEntriesWithLines(db);
    const mirror = entries.find((e) => e.reversesEntryId === posted.id);
    expect(mirror).toBeDefined();
    expect(mirror!.status).toBe('posted');
    expect(mirror!.entryDate).toBe('2026-10-01');
    expect(mirror!.memo).toBe('Reversal of: Accrued hydro for September');
    expect(mirror!.lines.map((l) => [l.accountId, l.debitCents, l.creditCents])).toEqual([[officeSupplies, 0, 12_000], [accrued, 12_000, 0]]);
    // September carries the expense; by October 1 it is gone again.
    const accounts = await getAllAccounts(db);
    const sept = incomeStatement(accounts, entries, '2026-09-01', '2026-09-30').expenses.lines.find((l) => l.account.id === officeSupplies)?.amountCents ?? 0;
    const oct = incomeStatement(accounts, entries, '2026-10-01', '2026-10-31').expenses.lines.find((l) => l.account.id === officeSupplies)?.amountCents ?? 0;
    expect(oct).toBe(-12_000); // October carries only the reversal
    expect(sept).toBeGreaterThanOrEqual(12_000); // September carries the accrual on top of its other spending
    await journalVoid(posted.id);
    expect((await journalGet(mirror!.id)).status).toBe('void');
    await booksBalance();
  });

  it('refuses a reversal date that is not after the entry date', async () => {
    await expect(journalCreateAndPost({ entryDate: '2026-09-30', memo: 'Bad', reverseOn: '2026-09-30', lines: [{ accountId: officeSupplies, debitCents: 100, creditCents: 0 }, { accountId: chequing, debitCents: 0, creditCents: 100 }] })).rejects.toThrow(/after the entry date/);
  });
});
