import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry, JournalEntryLine } from '../types';
import { profitAndLossByCustomer, profitAndLossDetail } from './profitAndLossDetail';

function acct(id: number, code: string, name: string, accountType: Account['accountType']): Account {
  return {
    id,
    code,
    name,
    accountType,
    accountSubtype: null,
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

const BANK = acct(1, '1000', 'Chequing', 'Asset');
const SALES = acct(2, '4000', 'Sales', 'Revenue');
const CONSULTING = acct(3, '4100', 'Consulting', 'Revenue');
const RENT = acct(4, '5100', 'Rent', 'Expense');
const SUBCONTRACT = acct(5, '5200', 'Subcontractors', 'Expense');
const ACCOUNTS = [BANK, SALES, CONSULTING, RENT, SUBCONTRACT];

const NAMES = new Map([
  [10, 'Rasta Pasta'],
  [11, 'Anokhi Restaurant'],
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

function entry(entryDate: string, lines: JournalEntryLine[], status: JournalEntry['status'] = 'posted'): JournalEntry {
  const id = nextId++;
  return {
    id,
    entryDate,
    memo: null,
    reference: null,
    status,
    createdAt: entryDate,
    postedAt: entryDate,
    periodFrom: null,
    periodTo: null,
    isAdjustingEntry: false,
    source: 'manual',
    sourceReference: null,
    lines: lines.map((l, i) => ({ ...l, journalEntryId: id, id: id * 100 + i, lineOrder: i })),
  } as JournalEntry;
}

describe('profitAndLossDetail', () => {
  it('lists the transactions behind each account and totals them', () => {
    const entries = [
      entry('2025-03-02', [line(BANK.id, 500_00, 0), line(SALES.id, 0, 500_00)]),
      entry('2025-03-09', [line(BANK.id, 300_00, 0), line(SALES.id, 0, 300_00)]),
      entry('2025-03-10', [line(RENT.id, 1_000_00, 0), line(BANK.id, 0, 1_000_00)]),
    ];
    const r = profitAndLossDetail(ACCOUNTS, entries, '2025-03-01', '2025-03-31');

    const sales = r.revenue.accounts.find((a) => a.account.id === SALES.id)!;
    expect(sales.lines).toHaveLength(2);
    expect(sales.totalCents).toBe(800_00);
    expect(r.expenses.totalCents).toBe(1_000_00);
    expect(r.netIncomeCents).toBe(-200_00);
  });

  it('lets a refund reduce the account rather than inflate it', () => {
    // A credit note debits revenue. Taking whichever side was non-zero would add it instead.
    const entries = [
      entry('2025-03-02', [line(BANK.id, 500_00, 0), line(SALES.id, 0, 500_00)]),
      entry('2025-03-20', [line(SALES.id, 100_00, 0), line(BANK.id, 0, 100_00)]),
    ];
    const r = profitAndLossDetail(ACCOUNTS, entries, '2025-03-01', '2025-03-31');
    expect(r.revenue.totalCents).toBe(400_00);
  });

  it('leaves out accounts with no activity in the period', () => {
    const entries = [entry('2025-03-02', [line(BANK.id, 500_00, 0), line(SALES.id, 0, 500_00)])];
    const r = profitAndLossDetail(ACCOUNTS, entries, '2025-03-01', '2025-03-31');
    expect(r.revenue.accounts.map((a) => a.account.id)).toEqual([SALES.id]);
    expect(r.expenses.accounts).toEqual([]);
  });

  it('respects the period and ignores unposted entries', () => {
    const entries = [
      entry('2025-02-28', [line(BANK.id, 900_00, 0), line(SALES.id, 0, 900_00)]),
      entry('2025-03-05', [line(BANK.id, 100_00, 0), line(SALES.id, 0, 100_00)], 'draft'),
    ];
    const r = profitAndLossDetail(ACCOUNTS, entries, '2025-03-01', '2025-03-31');
    expect(r.revenue.totalCents).toBe(0);
  });

  it('shows each line in date order with the name attached', () => {
    const entries = [
      entry('2025-03-20', [line(BANK.id, 200_00, 0), line(SALES.id, 0, 200_00, { customerId: 11 })]),
      entry('2025-03-02', [line(BANK.id, 500_00, 0), line(SALES.id, 0, 500_00, { customerId: 10 })]),
    ];
    const r = profitAndLossDetail(ACCOUNTS, entries, '2025-03-01', '2025-03-31', NAMES);
    const sales = r.revenue.accounts[0];
    expect(sales.lines.map((l) => l.entryDate)).toEqual(['2025-03-02', '2025-03-20']);
    expect(sales.lines[0].contactName).toBe('Rasta Pasta');
  });

  it('agrees with itself: the sections total the net income', () => {
    const entries = [
      entry('2025-03-02', [line(BANK.id, 500_00, 0), line(SALES.id, 0, 500_00)]),
      entry('2025-03-03', [line(BANK.id, 250_00, 0), line(CONSULTING.id, 0, 250_00)]),
      entry('2025-03-10', [line(RENT.id, 400_00, 0), line(BANK.id, 0, 400_00)]),
    ];
    const r = profitAndLossDetail(ACCOUNTS, entries, '2025-03-01', '2025-03-31');
    expect(r.netIncomeCents).toBe(r.revenue.totalCents - r.expenses.totalCents);
    expect(r.netIncomeCents).toBe(350_00);
  });
});

describe('profitAndLossByCustomer', () => {
  it('totals revenue per customer, biggest first', () => {
    const entries = [
      entry('2025-03-02', [line(BANK.id, 500_00, 0), line(SALES.id, 0, 500_00, { customerId: 10 })]),
      entry('2025-03-03', [line(BANK.id, 900_00, 0), line(SALES.id, 0, 900_00, { customerId: 11 })]),
      entry('2025-03-04', [line(BANK.id, 100_00, 0), line(SALES.id, 0, 100_00, { customerId: 10 })]),
    ];
    const r = profitAndLossByCustomer(ACCOUNTS, entries, '2025-03-01', '2025-03-31', NAMES);

    expect(r.rows.map((x) => x.customerName)).toEqual(['Anokhi Restaurant', 'Rasta Pasta']);
    expect(r.rows[0].revenueCents).toBe(900_00);
    expect(r.rows[1].revenueCents).toBe(600_00);
    expect(r.totalRevenueCents).toBe(1_500_00);
  });

  it('keeps revenue with no customer visible instead of hiding or spreading it', () => {
    // Spreading it across the named customers would invent an attribution the books do not have.
    const entries = [
      entry('2025-03-02', [line(BANK.id, 500_00, 0), line(SALES.id, 0, 500_00, { customerId: 10 })]),
      entry('2025-03-03', [line(BANK.id, 700_00, 0), line(SALES.id, 0, 700_00)]),
    ];
    const r = profitAndLossByCustomer(ACCOUNTS, entries, '2025-03-01', '2025-03-31', NAMES);

    expect(r.untaggedRevenueCents).toBe(700_00);
    expect(r.rows.find((x) => x.customerId === null)?.customerName).toBe('No customer recorded');
    expect(r.totalRevenueCents).toBe(1_200_00);
  });

  it('counts only costs actually tagged to the customer', () => {
    const entries = [
      entry('2025-03-02', [line(BANK.id, 1_000_00, 0), line(SALES.id, 0, 1_000_00, { customerId: 10 })]),
      entry('2025-03-05', [line(SUBCONTRACT.id, 400_00, 0, { customerId: 10 }), line(BANK.id, 0, 400_00)]),
      entry('2025-03-06', [line(RENT.id, 800_00, 0), line(BANK.id, 0, 800_00)]), // overhead, untagged
    ];
    const r = profitAndLossByCustomer(ACCOUNTS, entries, '2025-03-01', '2025-03-31', NAMES);
    const rasta = r.rows.find((x) => x.customerId === 10)!;

    expect(rasta.directCostCents).toBe(400_00); // the subcontractor, not the rent
    expect(rasta.marginCents).toBe(600_00);
    expect(r.totalDirectCostCents).toBe(400_00);
  });

  it('ignores unposted entries', () => {
    const entries = [entry('2025-03-02', [line(BANK.id, 500_00, 0), line(SALES.id, 0, 500_00, { customerId: 10 })], 'void')];
    const r = profitAndLossByCustomer(ACCOUNTS, entries, '2025-03-01', '2025-03-31', NAMES);
    expect(r.totalRevenueCents).toBe(0);
  });
});
