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

/** Estimates, purchase orders and credit notes laid out as PDFs from real records, through the
 * real handlers — each kind resolves its own party, number and dates, and its printed total is the
 * lines plus their tax. */

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
import { estimatesCreate } from './estimates.handlers';
import { purchaseOrdersCreate } from './purchaseOrders.handlers';
import { creditNotesCreate } from './creditNotes.handlers';
import { documentPdfBytes, documentPdfEmailDefaults, resolvePrintableDocument } from './documentPdf.handlers';
import { printableTotals } from '../forms/generateDocumentPdf';

vi.mock('electron', () => ({ app: { getPath: () => '.' } }));
vi.mock('./company.handlers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./company.handlers')>()),
  companyGet: async () => ({ legalName: 'Scenario Company Inc.', logoDataUrl: null }),
}));

let db: AppDb;
const byCode = async (code: string) => (await db.selectFrom('accounts').select('id').where('code', '=', code).executeTakeFirstOrThrow()).id;

let customerId: number;
let vendorId: number;
let revenue: number;
let supplies: number;

beforeAll(async () => {
  db = openScenarioCompany();
  state.db = db;
  await seedGifiCodes(db);
  await seedChartOfAccounts(db, GENERAL_SERVICES_TEMPLATE);
  await seedCategoryRules(db);
  await seedOpeningBalanceAccounts(db);
  revenue = await byCode('4000');
  supplies = await byCode('5040');
  customerId = (await contacts.customersSave({ name: 'Om Financial', email: 'om@example.com', paymentTerms: 'net30' })).id;
  vendorId = (await contacts.vendorsSave({ name: 'Grand & Toy', email: 'orders@grandandtoy.example', defaultExpenseAccountId: supplies, paymentTerms: 'net30' })).id;
});
afterAll(async () => {
  await db.destroy();
});

const isPdf = (base64: string) => Buffer.from(base64, 'base64').subarray(0, 5).toString() === '%PDF-';

describe('an estimate', () => {
  it('prints to its customer with its number, validity and a total that includes the tax it will carry', async () => {
    const est = await estimatesCreate({ customerId, estimateNumber: 'EST-2026-0004', estimateDate: '2026-09-15', expiryDate: '2026-10-15', memo: null, lines: [{ description: 'Year-end review', quantity: 1, unitPriceCents: 150_000, revenueAccountId: revenue, taxCode: 'HST', manualHstCents: null, productId: null }] });
    const { doc, fileName } = await resolvePrintableDocument({ kind: 'estimate', id: est.id });
    expect(doc.title).toBe('ESTIMATE');
    expect(doc.party.name).toBe('Om Financial');
    expect(doc.fields).toEqual([{ label: 'Estimate #', value: 'EST-2026-0004' }, { label: 'Estimate Date', value: '2026-09-15' }, { label: 'Valid Until', value: '2026-10-15' }]);
    expect(doc.footer).toMatch(/not an invoice.*2026-10-15/);
    // The estimate row stores its total before tax; the printed total must not.
    expect(est.totalCents).toBe(150_000);
    expect(printableTotals(doc.lines).totalCents).toBe(169_500);
    expect(fileName).toBe('Estimate EST-2026-0004.pdf');
    expect(isPdf((await documentPdfBytes({ kind: 'estimate', id: est.id })).base64)).toBe(true);
    expect(await documentPdfEmailDefaults({ kind: 'estimate', id: est.id })).toEqual({ partyName: 'Om Financial', partyEmail: 'om@example.com', subject: 'Estimate EST-2026-0004', sentence: 'Please find attached estimate EST-2026-0004, valid until 2026-10-15.' });
  });
});

describe('a purchase order', () => {
  it('prints to its vendor and asks for the PO number on their invoice, so the bill can be matched', async () => {
    const po = await purchaseOrdersCreate({ vendorId, poNumber: 'PO-2026-0007', orderDate: '2026-09-15', expectedDate: '2026-09-30', memo: null, lines: [{ description: 'Printer paper, 10 cases', quantity: 10, unitPriceCents: 4_500, categoryAccountId: supplies, taxCode: 'HST', manualHstCents: null, productId: null }] });
    const { doc } = await resolvePrintableDocument({ kind: 'purchaseOrder', id: po.id });
    expect(doc.title).toBe('PURCHASE ORDER');
    expect(doc.party.name).toBe('Grand & Toy');
    expect(doc.fields.map((f) => f.label)).toEqual(['PO #', 'Order Date', 'Expected By']);
    expect(doc.footer).toContain('PO-2026-0007');
    expect(printableTotals(doc.lines)).toEqual({ subtotalCents: 45_000, taxCents: 5_850, totalCents: 50_850 });
    expect(isPdf((await documentPdfBytes({ kind: 'purchaseOrder', id: po.id })).base64)).toBe(true);
  });
});

describe('a credit note', () => {
  it('prints to the customer, and its printed total is the credit that was posted', async () => {
    const note = await creditNotesCreate({ kind: 'customer', contactId: customerId, creditNoteNumber: 'CN-0001', creditNoteDate: '2026-09-20', lines: [{ description: 'Returned service hours', quantity: 2, unitPriceCents: 10_000, categoryAccountId: revenue, taxCode: 'HST' }] });
    const { doc } = await resolvePrintableDocument({ kind: 'creditNote', id: note.id });
    expect(doc.title).toBe('CREDIT NOTE');
    expect(doc.partyHeading).toBe('Credit To');
    expect(printableTotals(doc.lines).totalCents).toBe(note.totalCents);
    expect(isPdf((await documentPdfBytes({ kind: 'creditNote', id: note.id })).base64)).toBe(true);
  });

  it('a vendor credit is addressed to the vendor, not dressed up as a customer credit note', async () => {
    const note = await creditNotesCreate({ kind: 'vendor', contactId: vendorId, creditNoteNumber: 'VC-0001', creditNoteDate: '2026-09-21', lines: [{ description: 'Damaged cases', quantity: 1, unitPriceCents: 4_500, categoryAccountId: supplies, taxCode: 'HST' }] });
    const { doc } = await resolvePrintableDocument({ kind: 'creditNote', id: note.id });
    expect(doc.title).toBe('VENDOR CREDIT');
    expect(doc.party.name).toBe('Grand & Toy');
  });
});

describe('a bad request', () => {
  it('is refused rather than guessed at', async () => {
    await expect(documentPdfBytes({ kind: 'invoice', id: 1 })).rejects.toThrow(/Unknown document type/);
    await expect(documentPdfBytes({ kind: 'estimate', id: -3 })).rejects.toThrow(/Unknown document/);
  });
});
