import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry } from '../types';
import { runAuditExceptions } from './auditExceptions';
import { normalizeContactName, runYearEndSignoff, type SignoffInput } from './yearEndSignoff';

const acct = (id: number, name: string, accountType: Account['accountType'], accountSubtype: string | null = null): Account => ({ id, code: String(1000 + id), name, accountType, accountSubtype, normalBalance: accountType === 'Asset' || accountType === 'Expense' ? 'Debit' : 'Credit', parentId: null, gifiCode: null, isActive: true, isSystem: false, description: null, accountNumber: null, isTransferEligible: false });
const accounts = [
  acct(1, 'Chequing Account', 'Asset', 'Cash and Bank'), acct(2, 'Accounts Receivable', 'Asset'), acct(3, 'Accounts Payable', 'Liability'),
  acct(4, 'Service Revenue', 'Revenue'), acct(5, 'Suspense Account', 'Asset'), acct(6, 'Office Expense', 'Expense'), acct(7, 'Common Shares', 'Equity'),
  acct(8, 'Undeposited Funds', 'Asset'), acct(9, 'Visa', 'Liability', 'Credit Card'),
];
const entry = (id: number, entryDate: string, lines: Array<[number, number, number]>, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id, entryDate, memo: `Entry ${id}`, reference: null, status: 'posted', createdAt: `${entryDate}T10:00:00Z`, postedAt: null, isAdjustingEntry: false, source: 'manual', sourceReference: null, periodFrom: null, periodTo: null,
  lines: lines.map(([accountId, debitCents, creditCents], i) => ({ id: id * 10 + i, journalEntryId: id, accountId, debitCents, creditCents, description: null, lineOrder: i, taxCode: null })),
  ...extra,
} as JournalEntry);

function build(overrides: Partial<SignoffInput> = {}): SignoffInput {
  const entries = overrides.entries ?? [
    entry(1, '2026-01-02', [[1, 100_000, 0], [7, 0, 100_000]]),
    entry(2, '2026-02-10', [[2, 50_000, 0], [4, 0, 50_000]], { source: 'quickEntry' }),
    entry(3, '2026-03-05', [[6, 20_000, 0], [1, 0, 20_000]], { source: 'quickEntry' }),
  ];
  const base: SignoffInput = {
    periodStart: '2026-01-01', periodEnd: '2026-06-30', today: '2026-09-06',
    accounts, entries, invoices: [], bills: [],
    fiscalPeriods: [{ id: 1, periodStart: '2026-01-01', periodEnd: '2026-12-31', label: 'FY2026', isLocked: false, lockedAt: null }],
    reconciliations: [{ id: 1, accountId: 1, statementDate: '2026-06-30', startingBalanceCents: 0, endingBalanceCents: 80_000, status: 'completed', completedAt: '2026-07-02T00:00:00Z' }],
    hstFilings: [], hstFilingFrequency: 'None', payrollRuns: [], undepositedFundsAccountId: 8, inventory: [],
    vendorNames: ['Bell Canada'], customerNames: ['Acme'],
    auditExceptions: runAuditExceptions({
      periodStart: '2026-01-01', periodEnd: '2026-06-30', accounts, entries,
      invoices: [{ id: 1, customerId: 1, customerName: 'Acme', invoiceNumber: 'INV-1', invoiceDate: '2026-02-10', dueDate: '2026-03-10', totalCents: 50_000, paidCents: 0, status: 'unpaid' }],
      bills: [], fiscalPeriods: [], attachedJournalIds: new Set(), attachedBillIds: new Set(), supportThresholdCents: 1_000_000_00,
    }),
    ...overrides,
  };
  return base;
}

describe('year-end sign-off', () => {
  it('treats "Bell Canada Inc." and "Bell Canada" as one name', () => {
    expect(normalizeContactName('Bell Canada Inc.')).toBe(normalizeContactName('Bell Canada'));
    expect(normalizeContactName('The Home Depot')).toBe('home depot');
  });

  it('is ready with notes on a tidy set of books whose period is not yet locked', () => {
    const report = runYearEndSignoff(build());
    const byId = new Map(report.checks.map((c) => [c.id, c]));
    expect(byId.get('trial-balance')?.light).toBe('green');
    expect(byId.get('balance-sheet')?.light).toBe('green');
    expect(byId.get('recon-1')?.light).toBe('green');
    expect(byId.get('ar-control')?.light).toBe('green');
    expect(byId.get('undeposited')?.light).toBe('green');
    expect(byId.get('locks')?.light).toBe('amber');
    expect(report.counts.red).toBe(0);
    expect(report.decision).toBe('readyWithNotes');
  });

  it('goes red for an unfiled return, an unreconciled bank, a duplicate vendor and a negative stock item', () => {
    const report = runYearEndSignoff(build({
      hstFilingFrequency: 'Quarterly',
      reconciliations: [],
      vendorNames: ['Bell Canada', 'Bell Canada Inc.'],
      inventory: [{ name: 'Widget', quantityOnHand: -2 }],
    }));
    const byId = new Map(report.checks.map((c) => [c.id, c]));
    expect(byId.get('hst-2026-Q1')?.light).toBe('red');
    expect(byId.get('hst-2026-Q2')?.light).toBe('red');
    expect(byId.get('recon-1')?.light).toBe('red');
    expect(byId.get('dup-vendors')?.light).toBe('amber');
    expect(byId.get('dup-vendors')?.summary).toContain('Bell Canada / Bell Canada Inc.');
    expect(byId.get('inventory')?.light).toBe('red');
    expect(report.decision).toBe('notReady');
  });

  it('accepts a filed return whose figures still agree with the books, and flags one that no longer does', () => {
    const agree = runYearEndSignoff(build({ hstFilingFrequency: 'Quarterly', hstFilings: [
      { id: 1, periodStart: '2026-01-01', periodEnd: '2026-03-31', filingDate: '2026-04-20', collectedCents: 0, itcCents: 0, netPayableCents: 0, paymentAccountId: null, journalEntryId: null, fiscalPeriodId: null, memo: null },
      { id: 2, periodStart: '2026-04-01', periodEnd: '2026-06-30', filingDate: '2026-07-20', collectedCents: 1, itcCents: 0, netPayableCents: 1, paymentAccountId: null, journalEntryId: null, fiscalPeriodId: null, memo: null },
    ] as SignoffInput['hstFilings'] }));
    const byId = new Map(agree.checks.map((c) => [c.id, c]));
    expect(byId.get('hst-2026-Q1')?.light).toBe('green');
    expect(byId.get('hst-2026-Q2')?.light).toBe('amber');
  });

  it('flags a quick entry dated before the period and a draft journal', () => {
    const report = runYearEndSignoff(build({ entries: [
      entry(1, '2026-01-02', [[1, 100_000, 0], [7, 0, 100_000]]),
      entry(2, '2025-08-11', [[6, 14_200, 0], [9, 0, 14_200]], { source: 'quickEntry' }),
      entry(3, '2026-03-05', [[6, 20_000, 0], [1, 0, 20_000]], { status: 'draft' }),
    ] }));
    const byId = new Map(report.checks.map((c) => [c.id, c]));
    expect(byId.get('before-period')?.light).toBe('amber');
    expect(byId.get('draft-journals')?.light).toBe('amber');
  });
});
