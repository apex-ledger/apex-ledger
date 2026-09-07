import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry } from '../types';
import { toCashBasisEntries } from './cashBasis';
import { incomeStatement } from './incomeStatement';

const accounts = [
  { id: 1, code: '1000', name: 'Bank', accountType: 'Asset', accountSubtype: 'Cash and Bank', normalBalance: 'Debit', isActive: true },
  { id: 2, code: '1200', name: 'Accounts Receivable', accountType: 'Asset', accountSubtype: 'Accounts Receivable', normalBalance: 'Debit', isActive: true },
  { id: 3, code: '2100', name: 'Accounts Payable', accountType: 'Liability', accountSubtype: 'Current Liability', normalBalance: 'Credit', isActive: true },
  { id: 4, code: '2300', name: 'GST/HST Payable', accountType: 'Liability', accountSubtype: 'Current Liability', normalBalance: 'Credit', isActive: true },
  { id: 5, code: '4000', name: 'Service Revenue', accountType: 'Revenue', accountSubtype: null, normalBalance: 'Credit', isActive: true },
  { id: 6, code: '6000', name: 'Rent', accountType: 'Expense', accountSubtype: 'Operating Expense', normalBalance: 'Debit', isActive: true },
] as unknown as Account[];

function entry(id: number, entryDate: string, lines: Array<[number, number, number]>): JournalEntry {
  return {
    id, entryDate, memo: null, reference: null, status: 'posted',
    lines: lines.map(([accountId, debitCents, creditCents], i) => ({ id: id * 10 + i, journalEntryId: id, accountId, debitCents, creditCents, description: null, lineOrder: i, taxCode: null, manualHstCents: null })),
  } as unknown as JournalEntry;
}

describe('cash-basis income statement', () => {
  // Invoice: $1,000 + $130 HST raised in March, half paid in April, rest in June.
  const invoiceEntry = entry(10, '2026-03-10', [[2, 113000, 0], [5, 0, 100000], [4, 0, 13000]]);
  // Bill: $2,000 rent received in March, paid in May.
  const billEntry = entry(20, '2026-03-01', [[6, 200000, 0], [3, 0, 200000]]);
  // A sales receipt paid on the spot in March stays where it is.
  const receipt = entry(30, '2026-03-15', [[1, 50000, 0], [5, 0, 50000]]);
  const entries = [invoiceEntry, billEntry, receipt];
  const sources = {
    invoices: [{ journalEntryId: 10, totalCents: 113000 }],
    bills: [{ journalEntryId: 20, totalCents: 200000 }],
    invoicePayments: [
      { documentJournalEntryId: 10, paymentDate: '2026-04-20', amountCents: 56500 },
      { documentJournalEntryId: 10, paymentDate: '2026-06-05', amountCents: 56500 },
    ],
    billPayments: [{ documentJournalEntryId: 20, paymentDate: '2026-05-02', amountCents: 200000 }],
  };

  it('counts income and expenses when the money moves, in proportion', () => {
    const cash = toCashBasisEntries(entries, accounts, sources);
    const q1 = incomeStatement(accounts, cash, '2026-01-01', '2026-03-31');
    expect(q1.revenue.totalCents).toBe(50000);
    expect(q1.expenses.totalCents).toBe(0);
    const q2 = incomeStatement(accounts, cash, '2026-04-01', '2026-06-30');
    expect(q2.revenue.totalCents).toBe(100000);
    expect(q2.expenses.totalCents).toBe(200000);
  });

  it('agrees with the accrual figures over the whole year', () => {
    const cash = toCashBasisEntries(entries, accounts, sources);
    const accrual = incomeStatement(accounts, entries, '2026-01-01', '2026-12-31');
    const cashYear = incomeStatement(accounts, cash, '2026-01-01', '2026-12-31');
    expect(cashYear.revenue.totalCents).toBe(accrual.revenue.totalCents);
    expect(cashYear.expenses.totalCents).toBe(accrual.expenses.totalCents);
  });

  it('leaves an unpaid invoice out entirely', () => {
    const cash = toCashBasisEntries(entries, accounts, { ...sources, invoicePayments: [] });
    expect(incomeStatement(accounts, cash, '2026-01-01', '2026-12-31').revenue.totalCents).toBe(50000);
  });
});
