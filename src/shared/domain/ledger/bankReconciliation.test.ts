import { describe, expect, it } from 'vitest';
import { computeClearedBalanceCents, computeDifferenceCents, defaultStartingBalanceCents, hasReconciledLines } from './bankReconciliation';
import type { BankReconciliation, JournalEntryLine } from '../types';

function line(overrides: Partial<Pick<JournalEntryLine, 'debitCents' | 'creditCents' | 'clearedAt'>> = {}) {
  return { debitCents: 0, creditCents: 0, clearedAt: null, ...overrides };
}

describe('computeClearedBalanceCents', () => {
  it('adds debits and subtracts credits for a Debit-normal account (a real bank account)', () => {
    const lines = [line({ debitCents: 10000 }), line({ creditCents: 3000 })];
    expect(computeClearedBalanceCents(50000, lines, 'Debit')).toBe(50000 + 10000 - 3000);
  });

  it('adds credits and subtracts debits for a Credit-normal account (a credit card)', () => {
    const lines = [line({ creditCents: 10000 }), line({ debitCents: 2000 })];
    expect(computeClearedBalanceCents(50000, lines, 'Credit')).toBe(50000 + 10000 - 2000);
  });

  it('returns the starting balance unchanged when no lines are cleared', () => {
    expect(computeClearedBalanceCents(12345, [], 'Debit')).toBe(12345);
    expect(computeClearedBalanceCents(12345, [], 'Credit')).toBe(12345);
  });
});

describe('computeDifferenceCents', () => {
  it('is zero when the cleared balance matches the statement ending balance', () => {
    expect(computeDifferenceCents(50000, 50000)).toBe(0);
  });

  it('is nonzero otherwise, in either direction', () => {
    expect(computeDifferenceCents(50100, 50000)).toBe(100);
    expect(computeDifferenceCents(49900, 50000)).toBe(-100);
  });
});

describe('defaultStartingBalanceCents', () => {
  it('uses the previous completed reconciliation ending balance when one exists', () => {
    const previous: BankReconciliation = {
      id: 1,
      accountId: 10,
      statementDate: '2026-06-30',
      startingBalanceCents: 0,
      endingBalanceCents: 42000,
      status: 'completed',
      completedAt: '2026-07-01',
    };
    expect(defaultStartingBalanceCents(previous)).toBe(42000);
  });

  it('defaults to zero when there is no previous reconciliation', () => {
    expect(defaultStartingBalanceCents(undefined)).toBe(0);
  });
});

describe('hasReconciledLines', () => {
  it('is false when no line has a clearedAt', () => {
    expect(hasReconciledLines([line(), line()])).toBe(false);
  });

  it('is true when any line has a clearedAt', () => {
    expect(hasReconciledLines([line(), line({ clearedAt: '2026-07-01T00:00:00Z' })])).toBe(true);
  });
});
