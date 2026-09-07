import { describe, expect, it } from 'vitest';
import { bankingActivity, commonIssues, type OverviewAccount, type OverviewEntry } from './clientOverview';

const accounts: OverviewAccount[] = [
  { id: 1, name: 'Chequing Account', accountType: 'Asset', accountSubtype: 'Cash and Bank', isActive: true },
  { id: 2, name: 'Visa', accountType: 'Liability', accountSubtype: 'Credit Card', isActive: true },
  { id: 3, name: 'Undeposited Funds', accountType: 'Asset', accountSubtype: 'Current Asset', isActive: true },
  { id: 4, name: 'Sales', accountType: 'Revenue', accountSubtype: 'Revenue', isActive: true },
  { id: 5, name: 'Suspense Account (Bank Errors)', accountType: 'Asset', accountSubtype: 'Current Asset', isActive: true },
  { id: 6, name: 'Old Savings', accountType: 'Asset', accountSubtype: 'Cash and Bank', isActive: false },
];

const entry = (entryDate: string, lines: [number, number, number, number | null][], status = 'posted'): OverviewEntry => ({
  entryDate,
  status,
  lines: lines.map(([accountId, debitCents, creditCents, reconciliationId]) => ({ accountId, debitCents, creditCents, reconciliationId })),
});

describe('bankingActivity', () => {
  it('shows each active bank and card account with book balance, unreconciled count and last statement', () => {
    const rows = bankingActivity(
      accounts,
      [entry('2026-01-05', [[1, 100000, 0, 7], [4, 0, 100000, null]]), entry('2026-02-10', [[1, 0, 25000, null], [2, 0, 0, null], [4, 25000, 0, null]]), entry('2026-03-01', [[2, 0, 5000, null], [4, 5000, 0, null]])],
      [{ accountId: 1, statementDate: '2026-01-31', status: 'completed' }],
      '2026-08-31',
    );
    const chequing = rows.find((r) => r.accountId === 1)!;
    expect(chequing.bookBalanceCents).toBe(75000);
    expect(chequing.unreconciledCount).toBe(1);
    expect(chequing.reconciledThrough).toBe('2026-01-31');
    expect(chequing.attention).toMatch(/Last reconciled 2026-01-31/);
    const visa = rows.find((r) => r.accountId === 2)!;
    expect(visa.kind).toBe('card');
    expect(visa.bookBalanceCents).toBe(5000);
    expect(visa.attention).toBe('Never reconciled');
    expect(rows.find((r) => r.accountId === 6)).toBeUndefined();
  });

  it('flags a bank account that is negative in the books', () => {
    const rows = bankingActivity(accounts, [entry('2026-05-01', [[1, 0, 1000, null], [4, 1000, 0, null]])], [], '2026-08-31');
    expect(rows.find((r) => r.accountId === 1)!.attention).toBe('Overdrawn in the books');
  });

  it('ignores drafts and entries after the review date', () => {
    const rows = bankingActivity(accounts, [entry('2026-05-01', [[1, 500, 0, null]], 'draft'), entry('2027-01-01', [[1, 500, 0, null]])], [], '2026-08-31');
    expect(rows.find((r) => r.accountId === 1)!.bookBalanceCents).toBe(0);
    expect(rows.find((r) => r.accountId === 1)!.unreconciledCount).toBe(0);
  });
});

describe('commonIssues', () => {
  const base = { accounts, reconciliations: [], openInvoices: [], openBills: [], draftJournalCount: 0, receiptsWaiting: 0, unfiledPeriods: [], asOf: '2026-08-31' };

  it('is empty for a clean file', () => {
    expect(commonIssues({ ...base, entries: [] })).toEqual([]);
  });

  it('finds stale undeposited funds, a parked suspense balance, and old receivables, worst first', () => {
    const issues = commonIssues({
      ...base,
      entries: [entry('2026-03-01', [[3, 30000, 0, null], [4, 0, 30000, null]]), entry('2026-08-01', [[5, 1234, 0, null], [1, 0, 1234, null]])],
      openInvoices: [{ dueDate: '2026-04-01', balanceDueCents: 50000 }, { dueDate: '2026-08-20', balanceDueCents: 100 }],
      draftJournalCount: 2,
    });
    expect(issues.map((i) => i.key)).toEqual(['overdrawn-1', 'undeposited-3', 'never-reconciled-1', 'suspense-5', 'ar-90', 'drafts']);
    expect(issues[0].severity).toBe('high');
    expect(issues[0].amountCents).toBe(-1234);
    expect(issues[1].amountCents).toBe(30000);
    expect(issues.find((i) => i.key === 'ar-90')!.amountCents).toBe(50000);
  });

  it('treats recent undeposited funds as normal, not alarming', () => {
    const issues = commonIssues({ ...base, entries: [entry('2026-08-29', [[3, 30000, 0, null], [4, 0, 30000, null]])] });
    expect(issues.find((i) => i.key === 'undeposited-3')!.severity).toBe('low');
  });

  it('lists unfiled GST/HST periods and waiting receipts', () => {
    const issues = commonIssues({ ...base, entries: [], receiptsWaiting: 3, unfiledPeriods: [{ period: '2026-Q1', netCents: 12000 }] });
    expect(issues.map((i) => i.key)).toEqual(['hst-2026-Q1', 'receipts']);
  });
});
