import { describe, expect, it } from 'vitest';
import type { Account, BankReconciliation, JournalEntry, JournalEntryLine } from '../types';
import { daysOutstanding, reconciliationReport, STALE_DAYS } from './reconciliationReport';

function acct(id: number, code: string, name: string): Account {
  return {
    id,
    code,
    name,
    accountType: 'Asset',
    accountSubtype: 'Cash and Bank',
    normalBalance: 'Debit',
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: true,
  } as Account;
}

const BANK = acct(1, '1000', 'Chequing');
const SALES = acct(2, '4000', 'Sales');

let nextId = 1;
function entry(entryDate: string, bankAmountCents: number, clearedAt: string | null, status: JournalEntry['status'] = 'posted'): JournalEntry {
  const id = nextId++;
  const isDeposit = bankAmountCents > 0;
  const lines: JournalEntryLine[] = [
    {
      id: id * 10,
      journalEntryId: id,
      accountId: BANK.id,
      debitCents: isDeposit ? bankAmountCents : 0,
      creditCents: isDeposit ? 0 : -bankAmountCents,
      description: isDeposit ? 'Deposit' : 'Cheque',
      lineOrder: 0,
      taxCode: null,
      manualHstCents: null,
      baseCents: null,
      clearedAt,
      reconciliationId: clearedAt ? 1 : null,
      foreignCurrency: null,
      foreignAmountCents: null,
    },
    {
      id: id * 10 + 1,
      journalEntryId: id,
      accountId: SALES.id,
      debitCents: isDeposit ? 0 : -bankAmountCents,
      creditCents: isDeposit ? bankAmountCents : 0,
      description: null,
      lineOrder: 1,
      taxCode: null,
      manualHstCents: null,
      baseCents: null,
      clearedAt: null,
      reconciliationId: null,
      foreignCurrency: null,
      foreignAmountCents: null,
    },
  ] as JournalEntryLine[];

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
    lines,
  } as JournalEntry;
}

function reconciliation(endingBalanceCents: number): BankReconciliation {
  return {
    id: 1,
    accountId: BANK.id,
    statementDate: '2025-03-31',
    startingBalanceCents: 0,
    endingBalanceCents,
    status: 'completed',
    completedAt: '2025-04-02',
  } as BankReconciliation;
}

describe('reconciliationReport', () => {
  it('reconciles when everything has cleared', () => {
    const entries = [entry('2025-03-01', 1_000_00, '2025-03-02'), entry('2025-03-10', -400_00, '2025-03-11')];
    const r = reconciliationReport(reconciliation(600_00), BANK, entries);

    expect(r.bookBalanceCents).toBe(600_00);
    expect(r.adjustedBalanceCents).toBe(600_00);
    expect(r.differenceCents).toBe(0);
    expect(r.isReconciled).toBe(true);
    expect(r.clearedCount).toBe(2);
  });

  it('adds a deposit the bank has not shown yet', () => {
    // Books say 1,000; the bank statement only shows 600 because a 400 deposit is in transit.
    const entries = [entry('2025-03-01', 600_00, '2025-03-02'), entry('2025-03-30', 400_00, null)];
    const r = reconciliationReport(reconciliation(600_00), BANK, entries);

    expect(r.outstandingDeposits).toHaveLength(1);
    expect(r.outstandingDepositsCents).toBe(400_00);
    expect(r.adjustedBalanceCents).toBe(1_000_00);
    expect(r.bookBalanceCents).toBe(1_000_00);
    expect(r.isReconciled).toBe(true);
  });

  it('takes off a cheque that has not been cashed', () => {
    const entries = [entry('2025-03-01', 1_000_00, '2025-03-02'), entry('2025-03-28', -250_00, null)];
    const r = reconciliationReport(reconciliation(1_000_00), BANK, entries);

    expect(r.outstandingPayments).toHaveLength(1);
    expect(r.outstandingPaymentsCents).toBe(250_00);
    expect(r.adjustedBalanceCents).toBe(750_00);
    expect(r.bookBalanceCents).toBe(750_00);
    expect(r.isReconciled).toBe(true);
  });

  it('reports a real difference rather than hiding it', () => {
    // A deposit was recorded that the bank never received: the report must not balance.
    const entries = [entry('2025-03-01', 1_000_00, '2025-03-02')];
    const r = reconciliationReport(reconciliation(900_00), BANK, entries);

    expect(r.differenceCents).toBe(-100_00);
    expect(r.isReconciled).toBe(false);
  });

  it('leaves anything dated after the statement for the next reconciliation', () => {
    const entries = [entry('2025-03-01', 1_000_00, '2025-03-02'), entry('2025-04-05', 5_000_00, null)];
    const r = reconciliationReport(reconciliation(1_000_00), BANK, entries);

    expect(r.bookBalanceCents).toBe(1_000_00);
    expect(r.outstandingDeposits).toEqual([]);
  });

  it('ignores unposted entries', () => {
    const entries = [entry('2025-03-01', 1_000_00, '2025-03-02'), entry('2025-03-05', 900_00, null, 'draft')];
    expect(reconciliationReport(reconciliation(1_000_00), BANK, entries).bookBalanceCents).toBe(1_000_00);
  });

  it('ignores lines belonging to other accounts', () => {
    const entries = [entry('2025-03-01', 1_000_00, '2025-03-02')];
    const r = reconciliationReport(reconciliation(1_000_00), BANK, entries);
    // The sales side of the same entry must not move the bank balance.
    expect(r.bookBalanceCents).toBe(1_000_00);
  });

  it('lists outstanding items oldest first', () => {
    const entries = [entry('2025-03-20', -100_00, null), entry('2025-03-05', -200_00, null)];
    const r = reconciliationReport(reconciliation(0), BANK, entries);
    expect(r.outstandingPayments.map((i) => i.entryDate)).toEqual(['2025-03-05', '2025-03-20']);
  });
});

describe('daysOutstanding', () => {
  it('counts the days an item has been sitting there', () => {
    expect(daysOutstanding({ entryId: 1, entryDate: '2025-03-01', description: '', amountCents: 0 }, '2025-03-31')).toBe(30);
  });

  it('recognises a cheque old enough to be stale-dated', () => {
    // Six months is when a Canadian bank will normally refuse it, and it needs reversing rather
    // than waiting for.
    const days = daysOutstanding({ entryId: 1, entryDate: '2024-09-01', description: '', amountCents: 0 }, '2025-03-31');
    expect(days).toBeGreaterThan(STALE_DAYS);
  });

  it('never reports a negative age for a future-dated item', () => {
    expect(daysOutstanding({ entryId: 1, entryDate: '2025-06-01', description: '', amountCents: 0 }, '2025-03-31')).toBe(0);
  });
});
