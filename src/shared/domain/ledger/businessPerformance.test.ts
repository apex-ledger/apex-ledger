import { describe, expect, it } from 'vitest';
import { computeBusinessPerformance } from './businessPerformance';
import type { IncomeStatementResult } from './incomeStatement';
import type { Account } from '../types';

function account(id: number, name: string): Account {
  return {
    id,
    code: String(1000 + id),
    name,
    accountType: 'Revenue',
    accountSubtype: null,
    normalBalance: 'Credit',
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
  };
}

function result(overrides: Partial<IncomeStatementResult> = {}): IncomeStatementResult {
  return {
    periodStart: '2026-04-01',
    periodEnd: '2026-06-30',
    comparativeStart: '2026-01-01',
    comparativeEnd: '2026-03-31',
    revenue: { label: 'Revenue', lines: [], totalCents: 0, comparativeTotalCents: 0 },
    expenses: { label: 'Expenses', lines: [], totalCents: 0, comparativeTotalCents: 0 },
    costOfSales: { label: 'Cost of Sales', lines: [], totalCents: 0, comparativeTotalCents: 0 },
    operatingExpenses: { label: 'Operating Expenses', lines: [], totalCents: 0, comparativeTotalCents: 0 },
    grossProfitCents: 0,
    netIncomeCents: 0,
    comparativeNetIncomeCents: 0,
    ...overrides,
  };
}

describe('computeBusinessPerformance', () => {
  it('returns null when no comparative period was supplied', () => {
    const r = result({ comparativeNetIncomeCents: undefined, revenue: { label: 'Revenue', lines: [], totalCents: 0 }, expenses: { label: 'Expenses', lines: [], totalCents: 0 } });
    expect(computeBusinessPerformance(r)).toBeNull();
  });

  it('labels a clear net income increase as growing', () => {
    const r = result({
      revenue: { label: 'Revenue', lines: [], totalCents: 220_000, comparativeTotalCents: 200_000 },
      expenses: { label: 'Expenses', lines: [], totalCents: 100_000, comparativeTotalCents: 100_000 },
      netIncomeCents: 120_000,
      comparativeNetIncomeCents: 100_000,
    });
    const perf = computeBusinessPerformance(r)!;
    expect(perf.verdict).toBe('growing');
    expect(perf.netIncomeChangePercent).toBeCloseTo(20, 1);
  });

  it('labels a clear net income decrease as declining', () => {
    const r = result({
      revenue: { label: 'Revenue', lines: [], totalCents: 150_000, comparativeTotalCents: 200_000 },
      expenses: { label: 'Expenses', lines: [], totalCents: 100_000, comparativeTotalCents: 100_000 },
      netIncomeCents: 50_000,
      comparativeNetIncomeCents: 100_000,
    });
    const perf = computeBusinessPerformance(r)!;
    expect(perf.verdict).toBe('declining');
    expect(perf.insights.some((i) => i.toLowerCase().includes('down'))).toBe(true);
  });

  it('labels a small swing as flat rather than growing/declining', () => {
    const r = result({
      revenue: { label: 'Revenue', lines: [], totalCents: 101_000, comparativeTotalCents: 100_000 },
      expenses: { label: 'Expenses', lines: [], totalCents: 50_000, comparativeTotalCents: 50_000 },
      netIncomeCents: 51_000,
      comparativeNetIncomeCents: 50_000,
    });
    const perf = computeBusinessPerformance(r)!;
    expect(perf.verdict).toBe('flat');
  });

  it('identifies the top revenue mover by dollar change, not percentage', () => {
    const r = result({
      revenue: {
        label: 'Revenue',
        lines: [
          { account: account(1, 'Consulting'), amountCents: 500_000, comparativeAmountCents: 400_000 }, // +100,000 (+25%)
          { account: account(2, 'Workshops'), amountCents: 3_000, comparativeAmountCents: 1_000 }, // +2,000 (+200%)
        ],
        totalCents: 503_000,
        comparativeTotalCents: 401_000,
      },
      expenses: { label: 'Expenses', lines: [], totalCents: 100_000, comparativeTotalCents: 100_000 },
      netIncomeCents: 403_000,
      comparativeNetIncomeCents: 301_000,
    });
    const perf = computeBusinessPerformance(r)!;
    expect(perf.topRevenueMovers[0].accountName).toBe('Consulting');
  });

  it('computes margin change in percentage points of revenue', () => {
    const r = result({
      revenue: { label: 'Revenue', lines: [], totalCents: 200_000, comparativeTotalCents: 200_000 },
      expenses: { label: 'Expenses', lines: [], totalCents: 150_000, comparativeTotalCents: 100_000 },
      netIncomeCents: 50_000,
      comparativeNetIncomeCents: 100_000,
    });
    const perf = computeBusinessPerformance(r)!;
    expect(perf.marginComparativePercent).toBeCloseTo(50, 1);
    expect(perf.marginCurrentPercent).toBeCloseTo(25, 1);
    expect(perf.insights.some((i) => i.includes('Profit margin fell'))).toBe(true);
  });
});
