import { describe, expect, it } from 'vitest';
import { normalBalanceForType, type Account, type JournalEntry } from '../types';
import { computeMonthlyProjection } from './projections';

function account(id: number, code: string, name: string, accountType: Account['accountType']): Account {
  return {
    id,
    code,
    name,
    accountType,
    accountSubtype: null,
    normalBalance: normalBalanceForType(accountType),
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
  };
}

const CASH = account(1, '1000', 'Cash', 'Asset');
const REVENUE = account(2, '4000', 'Sales', 'Revenue');
const EXPENSE = account(3, '5000', 'Rent', 'Expense');
const ACCOUNTS: Account[] = [CASH, REVENUE, EXPENSE];

function entry(id: number, entryDate: string, lines: { accountId: number; debitCents?: number; creditCents?: number }[]): JournalEntry {
  return {
    id,
    entryDate,
    memo: null,
    reference: null,
    status: 'posted',
    createdAt: entryDate,
    postedAt: entryDate,
    lines: lines.map((l, i) => ({
      id: id * 100 + i,
      journalEntryId: id,
      accountId: l.accountId,
      debitCents: l.debitCents ?? 0,
      creditCents: l.creditCents ?? 0,
      description: null,
    accountNumber: null,
    isTransferEligible: false,
      lineOrder: i,
      taxCode: null,
      manualHstCents: null,
      baseCents: null,
      clearedAt: null,
      reconciliationId: null,
      vendorId: null,
      customerId: null,
      foreignCurrency: null,
      foreignAmountCents: null,
      exchangeRate: null,
    })),
    periodFrom: null,
    periodTo: null,
    isAdjustingEntry: false,
    source: 'manual',
    sourceReference: null,
  };
}

describe('computeMonthlyProjection', () => {
  it('splits history into monthly buckets and averages them for the projection', () => {
    const entries: JournalEntry[] = [
      entry(1, '2026-01-10', [{ accountId: CASH.id, debitCents: 100_000 }, { accountId: REVENUE.id, creditCents: 100_000 }]),
      entry(2, '2026-01-15', [{ accountId: EXPENSE.id, debitCents: 40_000 }, { accountId: CASH.id, creditCents: 40_000 }]),
      entry(3, '2026-02-10', [{ accountId: CASH.id, debitCents: 200_000 }, { accountId: REVENUE.id, creditCents: 200_000 }]),
      entry(4, '2026-02-15', [{ accountId: EXPENSE.id, debitCents: 60_000 }, { accountId: CASH.id, creditCents: 60_000 }]),
    ];

    const result = computeMonthlyProjection(ACCOUNTS, entries, '2026-02-28', 2, 2);

    expect(result.history).toHaveLength(2);
    expect(result.history[0]).toMatchObject({ month: '2026-01', revenueCents: 100_000, expenseCents: 40_000, netIncomeCents: 60_000 });
    expect(result.history[1]).toMatchObject({ month: '2026-02', revenueCents: 200_000, expenseCents: 60_000, netIncomeCents: 140_000 });

    expect(result.averageMonthlyRevenueCents).toBe(150_000);
    expect(result.averageMonthlyExpenseCents).toBe(50_000);
    expect(result.averageMonthlyNetIncomeCents).toBe(100_000);

    expect(result.projected).toHaveLength(2);
    expect(result.projected[0].month).toBe('2026-03');
    expect(result.projected[0].netIncomeCents).toBe(100_000);
    expect(result.projected[1].month).toBe('2026-04');
  });

  it('builds a full trailing window ending on the as-of month, never reaching into the future', () => {
    const result = computeMonthlyProjection(ACCOUNTS, [], '2026-01-15', 6, 1);
    expect(result.history).toHaveLength(6);
    expect(result.history[result.history.length - 1].month).toBe('2026-01');
    expect(result.history[0].month).toBe('2025-08');
    expect(result.history.every((h) => h.month <= '2026-01')).toBe(true);
  });
});
