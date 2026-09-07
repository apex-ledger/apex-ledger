import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry } from '../types';
import { runAuditExceptions, sequenceGaps } from './auditExceptions';

const acct = (id: number, name: string, accountType: Account['accountType'], accountSubtype: string | null = null): Account => ({ id, code: String(1000 + id), name, accountType, accountSubtype, normalBalance: accountType === 'Asset' || accountType === 'Expense' ? 'Debit' : 'Credit', parentId: null, gifiCode: null, isActive: true, isSystem: false, description: null, accountNumber: null, isTransferEligible: false });
const accounts = [acct(1, 'Chequing', 'Asset', 'Cash and Bank'), acct(2, 'Accounts Receivable', 'Asset'), acct(3, 'Accounts Payable', 'Liability'), acct(4, 'Sales Revenue', 'Revenue'), acct(5, 'Suspense', 'Asset'), acct(6, 'Office Expense', 'Expense')];

const entry = (id: number, entryDate: string, lines: Array<[number, number, number]>, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id, entryDate, memo: `Entry ${id}`, reference: null, status: 'posted', createdAt: `${entryDate}T10:00:00Z`, postedAt: null, isAdjustingEntry: false, source: 'manual', sourceReference: null, periodFrom: null, periodTo: null,
  lines: lines.map(([accountId, debitCents, creditCents], i) => ({ id: id * 10 + i, journalEntryId: id, accountId, debitCents, creditCents, description: null, lineOrder: i, taxCode: null })),
  ...extra,
} as JournalEntry);

describe('audit exceptions', () => {
  it('finds sequence gaps per prefix', () => {
    expect(sequenceGaps(['INV-1001', 'INV-1002', 'INV-1004', 'CN-7'])).toEqual([{ prefix: 'INV-', missing: 1003 }]);
  });

  it('flags control-account differences, suspense balances, manual cash entries, round, weekend, backdated and post-lock entries', () => {
    const entries = [
      entry(1, '2026-03-02', [[2, 50_000, 0], [4, 0, 50_000]], { source: 'quickEntry', reference: 'INV-1001' }),
      entry(2, '2026-03-07', [[1, 200_000, 0], [4, 0, 200_000]]), // Saturday, manual, cash + revenue, round
      entry(3, '2026-03-10', [[5, 12_345, 0], [1, 0, 12_345]]), // suspense
      entry(4, '2026-01-15', [[6, 7_000, 0], [1, 0, 7_000]], { createdAt: '2026-03-20T10:00:00Z' }), // backdated & post-lock
      entry(5, '2026-03-11', [[6, 3_000, 0], [1, 0, 3_000]], { memo: '' }),
    ];
    const report = runAuditExceptions({
      periodStart: '2026-01-01', periodEnd: '2026-03-31', accounts, entries,
      invoices: [
        { id: 1, customerId: 1, customerName: 'Acme', invoiceNumber: 'INV-1001', invoiceDate: '2026-03-02', dueDate: '2026-04-01', totalCents: 50_000, paidCents: 0, status: 'unpaid' },
        { id: 2, customerId: 1, customerName: 'Acme', invoiceNumber: 'INV-1003', invoiceDate: '2026-03-05', dueDate: '2025-11-01', totalCents: 50_000, paidCents: 0, status: 'unpaid' },
      ],
      bills: [
        { id: 1, vendorId: 9, vendorName: 'Hydro', billNumber: 'H-1', billDate: '2026-03-01', dueDate: '2026-03-31', amountCents: 150_000, paidCents: 0, status: 'unpaid', billJournalEntryId: null },
        { id: 2, vendorId: 9, vendorName: 'Hydro', billNumber: null, billDate: '2026-03-04', dueDate: '2026-03-31', amountCents: 150_000, paidCents: 0, status: 'unpaid', billJournalEntryId: null },
      ],
      fiscalPeriods: [{ periodStart: '2026-01-01', periodEnd: '2026-01-31', isLocked: true, lockedAt: '2026-02-10T00:00:00Z' }],
      attachedJournalIds: new Set(), attachedBillIds: new Set([1]),
    });
    const byId = new Map(report.tests.map((t) => [t.id, t]));
    expect(byId.get('ar-control')?.comparison).toMatchObject({ leftCents: 100_000, rightCents: 50_000 });
    expect(byId.get('ar-control')?.rows[0].amountCents).toBe(50_000);
    expect(byId.get('ap-control')?.rows[0].amountCents).toBe(300_000);
    expect(byId.get('suspense')?.rows.map((r) => r.label)).toEqual(['Suspense']);
    expect(byId.get('manual-cash-revenue')?.rows.map((r) => r.ref.id)).toEqual([2, 3, 4, 5]);
    expect(byId.get('round')?.rows.map((r) => r.ref.id)).toEqual([2]);
    expect(byId.get('weekend')?.rows.map((r) => r.ref.id)).toEqual([2]);
    expect(byId.get('backdated')?.rows.map((r) => r.ref.id)).toEqual([4]);
    expect(byId.get('post-lock')?.rows.map((r) => r.ref.id)).toEqual([4]);
    expect(byId.get('no-memo')?.rows.map((r) => r.ref.id)).toEqual([5]);
    expect(byId.get('no-support')?.rows.map((r) => r.label)).toEqual(['Journal #2 Entry 2', 'Bill  — Hydro']);
    expect(byId.get('dup-bills')?.rows).toHaveLength(1);
    expect(byId.get('invoice-gaps')?.rows.map((r) => r.label)).toEqual(['INV-1002']);
    expect(byId.get('stale-ar')?.rows.map((r) => r.ref.id)).toEqual([2]);
    expect(report.counts.high).toBeGreaterThan(0);
    expect(report.tests[0].severity).toBe('high');
  });
});
