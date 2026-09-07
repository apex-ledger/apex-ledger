import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry, JournalEntryLine } from '../types';
import { profitAndLossByTag } from './profitAndLossByTag';

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
const RENT = acct(3, '5100', 'Rent', 'Expense');
const ACCOUNTS = [BANK, SALES, RENT];

// A "Store" tag group: Dundas and Kipling.
const DUNDAS = 1;
const KIPLING = 2;
const STORE_TAGS = [DUNDAS, KIPLING];

let nextLineId = 1000;
function line(accountId: number, debitCents: number, creditCents: number): JournalEntryLine {
  return {
    id: nextLineId++,
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
  } as JournalEntryLine;
}

let nextId = 1;
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
    lines: lines.map((l, i) => ({ ...l, journalEntryId: id, lineOrder: i })),
  } as JournalEntry;
}

describe('profitAndLossByTag', () => {
  it('splits revenue between the tags in the group', () => {
    const dundasSale = line(SALES.id, 0, 10_000_00);
    const kiplingSale = line(SALES.id, 0, 6_000_00);
    const entries = [
      entry('2025-03-01', [line(BANK.id, 10_000_00, 0), dundasSale]),
      entry('2025-03-02', [line(BANK.id, 6_000_00, 0), kiplingSale]),
    ];
    const tags = new Map([[dundasSale.id, [DUNDAS]], [kiplingSale.id, [KIPLING]]]);

    const r = profitAndLossByTag(ACCOUNTS, entries, STORE_TAGS, tags, '2025-01-01', '2025-12-31');

    expect(r.revenue.totalByTag.get(DUNDAS)).toBe(10_000_00);
    expect(r.revenue.totalByTag.get(KIPLING)).toBe(6_000_00);
    expect(r.revenue.totalCents).toBe(16_000_00);
  });

  it('gives a profit per tag', () => {
    const sale = line(SALES.id, 0, 10_000_00);
    const rent = line(RENT.id, 3_000_00, 0);
    const entries = [entry('2025-03-01', [line(BANK.id, 10_000_00, 0), sale]), entry('2025-03-02', [rent, line(BANK.id, 0, 3_000_00)])];
    const tags = new Map([[sale.id, [DUNDAS]], [rent.id, [DUNDAS]]]);

    const r = profitAndLossByTag(ACCOUNTS, entries, STORE_TAGS, tags, '2025-01-01', '2025-12-31');
    expect(r.netByTag.get(DUNDAS)).toBe(7_000_00);
    expect(r.netByTag.get(KIPLING)).toBe(0);
  });

  it('keeps untagged overhead in its own column rather than sharing it out', () => {
    // Spreading head-office rent across the stores would invent an allocation nobody decided on.
    const sale = line(SALES.id, 0, 10_000_00);
    const headOfficeRent = line(RENT.id, 2_000_00, 0);
    const entries = [
      entry('2025-03-01', [line(BANK.id, 10_000_00, 0), sale]),
      entry('2025-03-02', [headOfficeRent, line(BANK.id, 0, 2_000_00)]),
    ];
    const tags = new Map([[sale.id, [DUNDAS]]]);

    const r = profitAndLossByTag(ACCOUNTS, entries, STORE_TAGS, tags, '2025-01-01', '2025-12-31');

    expect(r.expenses.totalUntaggedCents).toBe(2_000_00);
    expect(r.expenses.totalByTag.get(DUNDAS) ?? 0).toBe(0);
    expect(r.netUntaggedCents).toBe(-2_000_00);
  });

  it('always adds up: every column plus untagged equals the total', () => {
    const a = line(SALES.id, 0, 5_000_00);
    const b = line(SALES.id, 0, 3_000_00);
    const c = line(SALES.id, 0, 1_000_00);
    const entries = [
      entry('2025-03-01', [line(BANK.id, 5_000_00, 0), a]),
      entry('2025-03-02', [line(BANK.id, 3_000_00, 0), b]),
      entry('2025-03-03', [line(BANK.id, 1_000_00, 0), c]),
    ];
    const tags = new Map([[a.id, [DUNDAS]], [b.id, [KIPLING]]]);

    const r = profitAndLossByTag(ACCOUNTS, entries, STORE_TAGS, tags, '2025-01-01', '2025-12-31');
    const columns = STORE_TAGS.reduce((sum, t) => sum + (r.revenue.totalByTag.get(t) ?? 0), 0);
    expect(columns + r.revenue.totalUntaggedCents).toBe(r.revenue.totalCents);
  });

  it('ignores a tag from a different group', () => {
    // A line tagged both Store=Dundas and Job=Reno appears once under Dundas when Store is on
    // screen, and is untagged when a group it does not belong to is being reported.
    const sale = line(SALES.id, 0, 4_000_00);
    const entries = [entry('2025-03-01', [line(BANK.id, 4_000_00, 0), sale])];
    const tags = new Map([[sale.id, [99]]]); // 99 belongs to some other group

    const r = profitAndLossByTag(ACCOUNTS, entries, STORE_TAGS, tags, '2025-01-01', '2025-12-31');
    expect(r.revenue.totalUntaggedCents).toBe(4_000_00);
  });

  it('splits evenly if a line somehow carries two tags from one group', () => {
    // The UI allows one, but if the data ever holds two, attributing the whole amount to each
    // would double-count it and the columns would exceed the total.
    const sale = line(SALES.id, 0, 1_000_01);
    const entries = [entry('2025-03-01', [line(BANK.id, 1_000_01, 0), sale])];
    const tags = new Map([[sale.id, [DUNDAS, KIPLING]]]);

    const r = profitAndLossByTag(ACCOUNTS, entries, STORE_TAGS, tags, '2025-01-01', '2025-12-31');
    const columns = (r.revenue.totalByTag.get(DUNDAS) ?? 0) + (r.revenue.totalByTag.get(KIPLING) ?? 0);
    expect(columns).toBe(1_000_01); // the odd cent is not lost or duplicated
  });

  it('lets a credit note reduce a tag column', () => {
    const sale = line(SALES.id, 0, 5_000_00);
    const refund = line(SALES.id, 1_000_00, 0);
    const entries = [
      entry('2025-03-01', [line(BANK.id, 5_000_00, 0), sale]),
      entry('2025-03-20', [refund, line(BANK.id, 0, 1_000_00)]),
    ];
    const tags = new Map([[sale.id, [DUNDAS]], [refund.id, [DUNDAS]]]);

    expect(profitAndLossByTag(ACCOUNTS, entries, STORE_TAGS, tags, '2025-01-01', '2025-12-31').revenue.totalByTag.get(DUNDAS)).toBe(4_000_00);
  });

  it('ignores unposted entries and anything outside the period', () => {
    const draft = line(SALES.id, 0, 9_000_00);
    const old = line(SALES.id, 0, 8_000_00);
    const entries = [
      entry('2025-03-01', [line(BANK.id, 9_000_00, 0), draft], 'draft'),
      entry('2024-03-01', [line(BANK.id, 8_000_00, 0), old]),
    ];
    const tags = new Map([[draft.id, [DUNDAS]], [old.id, [DUNDAS]]]);

    expect(profitAndLossByTag(ACCOUNTS, entries, STORE_TAGS, tags, '2025-01-01', '2025-12-31').revenue.totalCents).toBe(0);
  });
});
