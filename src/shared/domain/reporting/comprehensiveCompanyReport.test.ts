import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry, JournalEntryLine } from '../types';
import { buildCustomCompanyReportRows } from './comprehensiveCompanyReport';

const account = { id: 1, code: '5000', name: 'Office Expense' } as Account;
const line = {
  id: 11, journalEntryId: 7, accountId: 1, debitCents: 11_300, creditCents: 0,
  description: 'Printer supplies', lineOrder: 0, taxCode: 'HST', manualHstCents: null,
  baseCents: 10_000, clearedAt: null, reconciliationId: null, foreignCurrency: 'USD',
  foreignAmountCents: 8_000, exchangeRate: 1.4125, customerId: null, vendorId: 3,
} as JournalEntryLine;

function entry(date: string): JournalEntry {
  return {
    id: 7, entryDate: date, memo: 'Office order', reference: 'BILL-7', status: 'posted',
    createdAt: `${date}T10:00:00Z`, postedAt: `${date}T10:01:00Z`, createdBy: 'Morgan Lee',
    periodFrom: null, periodTo: null, isAdjustingEntry: false, source: 'manual', sourceReference: null,
    lines: [line],
  } as JournalEntry;
}

describe('comprehensive custom report rows', () => {
  it('joins journal, GL, contact, tax, currency and audit fields without losing traceability', () => {
    const rows = buildCustomCompanyReportRows(
      [account], [entry('2026-08-15')], '2026-08-01', '2026-08-31', new Map(),
      new Map([[3, 'Supply House']]), new Map([[7, 'Bill']]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entryId: 7, lineId: 11, transactionType: 'Bill', user: 'Morgan Lee', accountName: 'Office Expense',
      contactName: 'Supply House', taxAmountCents: 1_300, currency: 'USD', foreignAmountCents: 8_000,
    });
  });

  it('honours the selected report period', () => {
    expect(buildCustomCompanyReportRows([account], [entry('2026-07-31')], '2026-08-01', '2026-08-31')).toEqual([]);
  });
});
