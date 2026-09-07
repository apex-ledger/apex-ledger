import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry, JournalEntryLine } from '../types';
import { salesTaxDetail } from './salesTaxDetail';

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
const SUPPLIES = acct(3, '5200', 'Supplies', 'Expense');
const ACCOUNTS = [BANK, SALES, SUPPLIES];

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

describe('salesTaxDetail', () => {
  it('pulls the HST out of a tax-inclusive sale', () => {
    // 113.00 collected at 13% contains 13.00 of HST.
    const entries = [entry('2025-03-01', [line(BANK.id, 113_00, 0), line(SALES.id, 0, 113_00, { taxCode: 'HST' })])];
    const r = salesTaxDetail(ACCOUNTS, entries, '2025-01-01', '2025-12-31');

    expect(r.collected).toHaveLength(1);
    expect(r.collected[0].gstHstCents).toBe(13_00);
    expect(r.totalCollectedCents).toBe(13_00);
  });

  it('separates tax collected from tax paid', () => {
    const entries = [
      entry('2025-03-01', [line(BANK.id, 113_00, 0), line(SALES.id, 0, 113_00, { taxCode: 'HST' })]),
      entry('2025-03-02', [line(SUPPLIES.id, 226_00, 0, { taxCode: 'HST' }), line(BANK.id, 0, 226_00)]),
    ];
    const r = salesTaxDetail(ACCOUNTS, entries, '2025-01-01', '2025-12-31');

    expect(r.totalCollectedCents).toBe(13_00);
    expect(r.totalPaidCents).toBe(26_00);
    expect(r.netCents).toBe(-13_00); // a refund is owed
  });

  it('counts only the federal share of a British Columbia purchase', () => {
    // 112.00 in BC is 100 + 5 GST + 7 PST. The return sees the 5, not the 12: the PST belongs to
    // the province and must not swell the federal figure.
    const entries = [entry('2025-03-02', [line(SUPPLIES.id, 112_00, 0, { taxCode: 'GST_PST_BC' }), line(BANK.id, 0, 112_00)])];
    const r = salesTaxDetail(ACCOUNTS, entries, '2025-01-01', '2025-12-31');

    expect(r.paid[0].gstHstCents).toBe(5_00);
    expect(r.paid[0].amountCents).toBe(112_00);
  });

  it('uses the hand-entered figure on a manual line', () => {
    const entries = [
      entry('2025-03-02', [line(SUPPLIES.id, 500_00, 0, { taxCode: 'Manual', manualHstCents: 42_17 }), line(BANK.id, 0, 500_00)]),
    ];
    expect(salesTaxDetail(ACCOUNTS, entries, '2025-01-01', '2025-12-31').totalPaidCents).toBe(42_17);
  });

  it('counts a manual line still awaiting its figure rather than treating it as zero', () => {
    // Silently calling it nothing is how a return goes out understated.
    const entries = [
      entry('2025-03-02', [line(SUPPLIES.id, 500_00, 0, { taxCode: 'Manual', manualHstCents: null }), line(BANK.id, 0, 500_00)]),
    ];
    const r = salesTaxDetail(ACCOUNTS, entries, '2025-01-01', '2025-12-31');

    expect(r.manualPendingCount).toBe(1);
    expect(r.paid).toHaveLength(0);
  });

  it('finds no Canadian tax in a US purchase', () => {
    const entries = [entry('2025-03-02', [line(SUPPLIES.id, 108_00, 0, { taxCode: 'USTax' }), line(BANK.id, 0, 108_00)])];
    expect(salesTaxDetail(ACCOUNTS, entries, '2025-01-01', '2025-12-31').totalPaidCents).toBe(0);
  });

  it('groups by tax code so each figure can be traced', () => {
    const entries = [
      entry('2025-03-01', [line(BANK.id, 113_00, 0), line(SALES.id, 0, 113_00, { taxCode: 'HST' })]),
      entry('2025-03-05', [line(BANK.id, 226_00, 0), line(SALES.id, 0, 226_00, { taxCode: 'HST' })]),
    ];
    const r = salesTaxDetail(ACCOUNTS, entries, '2025-01-01', '2025-12-31');

    expect(r.byCodeCollected).toHaveLength(1);
    expect(r.byCodeCollected[0].lineCount).toBe(2);
    expect(r.byCodeCollected[0].gstHstCents).toBe(39_00);
  });

  it('lets a credit note reduce the tax collected', () => {
    const entries = [
      entry('2025-03-01', [line(BANK.id, 113_00, 0), line(SALES.id, 0, 113_00, { taxCode: 'HST' })]),
      entry('2025-03-20', [line(SALES.id, 113_00, 0, { taxCode: 'HST' }), line(BANK.id, 0, 113_00)]),
    ];
    expect(salesTaxDetail(ACCOUNTS, entries, '2025-01-01', '2025-12-31').totalCollectedCents).toBe(0);
  });

  it('ignores lines with no tax code, and anything unposted', () => {
    const entries = [
      entry('2025-03-01', [line(BANK.id, 100_00, 0), line(SALES.id, 0, 100_00)]),
      entry('2025-03-02', [line(BANK.id, 113_00, 0), line(SALES.id, 0, 113_00, { taxCode: 'HST' })], 'draft'),
    ];
    const r = salesTaxDetail(ACCOUNTS, entries, '2025-01-01', '2025-12-31');
    expect(r.collected).toEqual([]);
  });

  it('respects the reporting period', () => {
    const entries = [entry('2024-12-31', [line(BANK.id, 113_00, 0), line(SALES.id, 0, 113_00, { taxCode: 'HST' })])];
    expect(salesTaxDetail(ACCOUNTS, entries, '2025-01-01', '2025-12-31').collected).toEqual([]);
  });
});
