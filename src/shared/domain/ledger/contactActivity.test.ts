import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry, JournalEntryLine } from '../types';
import { customerStatement, expensesByVendor } from './contactActivity';

function acct(id: number, code: string, name: string, accountType: Account['accountType'], accountSubtype: string | null = null): Account {
  return {
    id,
    code,
    name,
    accountType,
    accountSubtype,
    normalBalance: accountType === 'Revenue' || accountType === 'Liability' || accountType === 'Equity' ? 'Credit' : 'Debit',
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
  } as Account;
}

const BANK = acct(1, '1000', 'Chequing', 'Asset', 'Cash and Bank');
const AR = acct(2, '1100', 'Accounts Receivable', 'Asset', 'Current Asset');
const EQUIP = acct(3, '1500', 'Equipment', 'Asset', 'Capital Asset');
const SALES = acct(4, '4000', 'Sales', 'Revenue');
const RENT = acct(5, '5100', 'Rent', 'Expense');
const SUPPLIES = acct(6, '5200', 'Supplies', 'Expense');
const ACCOUNTS = [BANK, AR, EQUIP, SALES, RENT, SUPPLIES];

const NAMES = new Map([
  [10, 'Planeti Foods'],
  [11, 'Jas Walia'],
  [20, 'Rasta Pasta'],
]);

let nextId = 1;
function line(accountId: number, debitCents: number, creditCents: number, extra: Partial<JournalEntryLine> = {}): JournalEntryLine {
  return {
    id: 0,
    journalEntryId: 0,
    accountId,
    debitCents,
    creditCents,
    description: null,
    lineOrder: 0,
    taxCode: null,
    manualHstCents: null,
    baseCents: null,
    clearedAt: null,
    reconciliationId: null,
    foreignCurrency: null,
    foreignAmountCents: null,
    customerId: null,
    vendorId: null,
    ...extra,
  } as JournalEntryLine;
}

function entry(entryDate: string, lines: JournalEntryLine[], overrides: Partial<JournalEntry> = {}): JournalEntry {
  const id = nextId++;
  return {
    id,
    entryDate,
    memo: null,
    reference: null,
    status: 'posted',
    createdAt: entryDate,
    postedAt: entryDate,
    periodFrom: null,
    periodTo: null,
    isAdjustingEntry: false,
    source: 'manual',
    sourceReference: null,
    lines: lines.map((l, i) => ({ ...l, journalEntryId: id, id: id * 100 + i, lineOrder: i })),
    ...overrides,
  } as JournalEntry;
}

describe('expensesByVendor', () => {
  it('totals spend per supplier, biggest first', () => {
    const entries = [
      entry('2025-03-01', [line(RENT.id, 800_00, 0, { vendorId: 11 }), line(BANK.id, 0, 800_00)]),
      entry('2025-03-05', [line(SUPPLIES.id, 1_500_00, 0, { vendorId: 10 }), line(BANK.id, 0, 1_500_00)]),
      entry('2025-04-05', [line(SUPPLIES.id, 500_00, 0, { vendorId: 10 }), line(BANK.id, 0, 500_00)]),
    ];
    const r = expensesByVendor(ACCOUNTS, entries, '2025-01-01', '2025-12-31', NAMES);

    expect(r.rows.map((x) => x.vendorName)).toEqual(['Planeti Foods', 'Jas Walia']);
    expect(r.rows[0].amountCents).toBe(2_000_00);
    expect(r.rows[0].transactionCount).toBe(2);
    expect(r.totalCents).toBe(2_800_00);
  });

  it('lets a credit note reduce what was spent rather than adding to it', () => {
    const entries = [
      entry('2025-03-05', [line(SUPPLIES.id, 1_000_00, 0, { vendorId: 10 }), line(BANK.id, 0, 1_000_00)]),
      entry('2025-03-20', [line(BANK.id, 200_00, 0), line(SUPPLIES.id, 0, 200_00, { vendorId: 10 })]),
    ];
    const r = expensesByVendor(ACCOUNTS, entries, '2025-01-01', '2025-12-31', NAMES);
    expect(r.rows[0].amountCents).toBe(800_00);
  });

  it('counts an asset purchase, not just expenses', () => {
    // Buying a freezer is spend with that supplier even though it lands on the balance sheet.
    const entries = [entry('2025-03-05', [line(EQUIP.id, 3_000_00, 0, { vendorId: 10 }), line(BANK.id, 0, 3_000_00)])];
    expect(expensesByVendor(ACCOUNTS, entries, '2025-01-01', '2025-12-31', NAMES).totalCents).toBe(3_000_00);
  });

  it('keeps spend with no supplier as its own row', () => {
    const entries = [entry('2025-03-05', [line(SUPPLIES.id, 400_00, 0), line(BANK.id, 0, 400_00)])];
    const r = expensesByVendor(ACCOUNTS, entries, '2025-01-01', '2025-12-31', NAMES);
    expect(r.untaggedCents).toBe(400_00);
    expect(r.rows[0].vendorName).toBe('No vendor recorded');
  });

  it('names what is bought from each supplier', () => {
    const entries = [
      entry('2025-03-05', [line(SUPPLIES.id, 900_00, 0, { vendorId: 10 }), line(BANK.id, 0, 900_00)]),
      entry('2025-03-06', [line(RENT.id, 100_00, 0, { vendorId: 10 }), line(BANK.id, 0, 100_00)]),
    ];
    const r = expensesByVendor(ACCOUNTS, entries, '2025-01-01', '2025-12-31', NAMES);
    expect(r.rows[0].topAccounts[0].accountName).toBe('Supplies');
    expect(r.rows[0].topAccounts[0].amountCents).toBe(900_00);
  });

  it('ignores unposted entries and anything outside the period', () => {
    const draft = entry('2025-03-05', [line(SUPPLIES.id, 900_00, 0, { vendorId: 10 })], { status: 'draft' });
    const old = entry('2024-03-05', [line(SUPPLIES.id, 900_00, 0, { vendorId: 10 })]);
    expect(expensesByVendor(ACCOUNTS, [draft, old], '2025-01-01', '2025-12-31', NAMES).totalCents).toBe(0);
  });
});

describe('customerStatement', () => {
  it('carries the prior balance forward and runs a balance down the page', () => {
    const entries = [
      entry('2024-12-01', [line(AR.id, 500_00, 0, { customerId: 20 }), line(SALES.id, 0, 500_00)]), // before
      entry('2025-02-01', [line(AR.id, 300_00, 0, { customerId: 20 }), line(SALES.id, 0, 300_00)]),
      entry('2025-03-01', [line(BANK.id, 200_00, 0), line(AR.id, 0, 200_00, { customerId: 20 })]),
    ];
    const r = customerStatement(ACCOUNTS, entries, 20, 'Rasta Pasta', '2025-01-01', '2025-12-31');

    expect(r.openingBalanceCents).toBe(500_00);
    expect(r.lines.map((l) => l.balanceCents)).toEqual([800_00, 600_00]);
    expect(r.closingBalanceCents).toBe(600_00);
    expect(r.totalChargesCents).toBe(300_00);
    expect(r.totalPaymentsCents).toBe(200_00);
  });

  it('shows a payment posted straight to the ledger, not only invoices', () => {
    // A statement read from invoices alone would omit this and show a balance the customer disputes.
    const entries = [
      entry('2025-02-01', [line(AR.id, 400_00, 0, { customerId: 20 }), line(SALES.id, 0, 400_00)]),
      entry('2025-02-15', [line(BANK.id, 400_00, 0), line(AR.id, 0, 400_00, { customerId: 20 })]),
    ];
    const r = customerStatement(ACCOUNTS, entries, 20, 'Rasta Pasta', '2025-01-01', '2025-12-31');
    expect(r.closingBalanceCents).toBe(0);
    expect(r.lines).toHaveLength(2);
  });

  it('leaves out another customer entirely', () => {
    const entries = [
      entry('2025-02-01', [line(AR.id, 400_00, 0, { customerId: 20 }), line(SALES.id, 0, 400_00)]),
      entry('2025-02-02', [line(AR.id, 999_00, 0, { customerId: 21 }), line(SALES.id, 0, 999_00)]),
    ];
    const r = customerStatement(ACCOUNTS, entries, 20, 'Rasta Pasta', '2025-01-01', '2025-12-31');
    expect(r.closingBalanceCents).toBe(400_00);
  });

  it('ignores lines that are not against a receivable account', () => {
    // A cash sale to the same customer is not part of their account balance.
    const entries = [entry('2025-02-01', [line(BANK.id, 400_00, 0), line(SALES.id, 0, 400_00, { customerId: 20 })])];
    const r = customerStatement(ACCOUNTS, entries, 20, 'Rasta Pasta', '2025-01-01', '2025-12-31');
    expect(r.lines).toEqual([]);
    expect(r.closingBalanceCents).toBe(0);
  });

  it('ignores unposted entries', () => {
    const draft = entry('2025-02-01', [line(AR.id, 400_00, 0, { customerId: 20 })], { status: 'draft' });
    expect(customerStatement(ACCOUNTS, [draft], 20, 'Rasta Pasta', '2025-01-01', '2025-12-31').closingBalanceCents).toBe(0);
  });
});
