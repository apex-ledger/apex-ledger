import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry } from '../types';
import { cashFlowStatement } from './cashFlowStatement';

function acct(id: number, name: string, accountType: Account['accountType'], accountSubtype: string): Account {
  return {
    id,
    code: String(1000 + id),
    name,
    accountType,
    accountSubtype,
    normalBalance: accountType === 'Asset' || accountType === 'Expense' ? 'Debit' : 'Credit',
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
  } as Account;
}

let nextId = 1;
/** One balanced entry: debit one account, credit another. */
function entry(date: string, debitAccountId: number, creditAccountId: number, cents: number): JournalEntry {
  const id = nextId++;
  return {
    id,
    entryDate: date,
    memo: null,
    reference: null,
    status: 'posted',
    createdAt: date,
    postedAt: date,
    periodFrom: null,
    periodTo: null,
    isAdjustingEntry: false,
    source: 'manual',
    sourceReference: null,
    lines: [
      { id: id * 10, journalEntryId: id, accountId: debitAccountId, debitCents: cents, creditCents: 0, description: null, lineOrder: 0, taxCode: null, manualHstCents: null, baseCents: null, clearedAt: null, reconciliationId: null, foreignCurrency: null, foreignAmountCents: null },
      { id: id * 10 + 1, journalEntryId: id, accountId: creditAccountId, debitCents: 0, creditCents: cents, description: null, lineOrder: 1, taxCode: null, manualHstCents: null, baseCents: null, clearedAt: null, reconciliationId: null, foreignCurrency: null, foreignAmountCents: null },
    ],
  } as JournalEntry;
}

const BANK = acct(1, 'Chequing', 'Asset', 'Cash and Bank');
const AR = acct(2, 'Accounts Receivable', 'Asset', 'Current Asset');
const EQUIP = acct(3, 'Equipment', 'Asset', 'Capital Asset');
const AP = acct(4, 'Accounts Payable', 'Liability', 'Current Liability');
const LOAN = acct(5, 'Bank Loan', 'Liability', 'Long-Term Liability');
const CAPITAL = acct(6, 'Share Capital', 'Equity', 'Share Capital');
const SALES = acct(7, 'Sales', 'Revenue', 'Revenue');
const RENT = acct(8, 'Rent', 'Expense', 'Operating Expense');
const DEPR = acct(9, 'Depreciation Expense', 'Expense', 'Operating Expense');

const ALL = [BANK, AR, EQUIP, AP, LOAN, CAPITAL, SALES, RENT, DEPR];

describe('cashFlowStatement', () => {
  it('ties to the movement in the bank account', () => {
    // A month with a bit of everything: a cash sale, a credit sale, rent paid, equipment bought.
    const entries = [
      entry('2025-03-02', BANK.id, SALES.id, 500_00),
      entry('2025-03-05', AR.id, SALES.id, 300_00),
      entry('2025-03-10', RENT.id, BANK.id, 200_00),
      entry('2025-03-20', EQUIP.id, BANK.id, 1_000_00),
    ];
    const r = cashFlowStatement(ALL, entries, '2025-03-01', '2025-03-31');

    expect(r.actualCashChangeCents).toBe(500_00 - 200_00 - 1_000_00); // -700.00
    expect(r.netChangeCents).toBe(r.actualCashChangeCents);
    expect(r.isReconciled).toBe(true);
  });

  it('reports the credit sale as cash not yet received', () => {
    const entries = [entry('2025-03-05', AR.id, SALES.id, 300_00)];
    const r = cashFlowStatement(ALL, entries, '2025-03-01', '2025-03-31');

    // Net income is up 300, but receivables absorbed all of it, so operating cash is nil.
    expect(r.operating.lines.find((l) => l.label === 'Net income for the period')?.amountCents).toBe(300_00);
    expect(r.operating.lines.find((l) => l.label === 'Accounts Receivable')?.amountCents).toBe(-300_00);
    expect(r.operating.totalCents).toBe(0);
    expect(r.netChangeCents).toBe(0);
  });

  it('puts equipment in investing and the loan and share issue in financing', () => {
    const entries = [
      entry('2025-03-20', EQUIP.id, BANK.id, 1_000_00),
      entry('2025-03-21', BANK.id, LOAN.id, 800_00),
      entry('2025-03-22', BANK.id, CAPITAL.id, 5_000_00),
    ];
    const r = cashFlowStatement(ALL, entries, '2025-03-01', '2025-03-31');

    expect(r.investing.totalCents).toBe(-1_000_00);
    expect(r.financing.totalCents).toBe(800_00 + 5_000_00);
    expect(r.operating.totalCents).toBe(0);
    expect(r.isReconciled).toBe(true);
  });

  it('adds depreciation back into operating without letting it inflate investing', () => {
    // Equipment bought last year; this period only carries the depreciation charge, which moved no
    // money at all. Every section total must reflect that.
    const entries = [
      entry('2024-06-01', EQUIP.id, BANK.id, 1_200_00), // prior period
      entry('2025-03-31', DEPR.id, EQUIP.id, 100_00), // this period, no cash
    ];
    const r = cashFlowStatement(ALL, entries, '2025-03-01', '2025-03-31');

    expect(r.operating.lines.find((l) => l.label === 'Net income for the period')?.amountCents).toBe(-100_00);
    expect(r.operating.lines.find((l) => l.label.startsWith('Add back'))?.amountCents).toBe(100_00);
    expect(r.operating.totalCents).toBe(0); // the charge and its add-back cancel
    expect(r.investing.totalCents).toBe(0); // and it does NOT show up as an investing inflow
    expect(r.netChangeCents).toBe(0);
    expect(r.isReconciled).toBe(true);
  });

  it('opens at the closing balance of the day before the period', () => {
    const entries = [
      entry('2025-02-28', BANK.id, SALES.id, 400_00),
      entry('2025-03-02', BANK.id, SALES.id, 100_00),
    ];
    const r = cashFlowStatement(ALL, entries, '2025-03-01', '2025-03-31');

    expect(r.openingCashCents).toBe(400_00);
    expect(r.closingCashCents).toBe(500_00);
    expect(r.netChangeCents).toBe(100_00);
  });

  it('ignores entries that are not posted', () => {
    const draft = { ...entry('2025-03-02', BANK.id, SALES.id, 900_00), status: 'draft' } as JournalEntry;
    const r = cashFlowStatement(ALL, [draft], '2025-03-01', '2025-03-31');

    expect(r.netChangeCents).toBe(0);
    expect(r.closingCashCents).toBe(0);
  });

  it('says so when the chart of accounts has no bank account at all', () => {
    const r = cashFlowStatement([SALES, RENT], [entry('2025-03-02', RENT.id, SALES.id, 10_00)], '2025-03-01', '2025-03-31');
    expect(r.hasNoCashAccounts).toBe(true);
  });

  it('still ties when several accounts move at once', () => {
    // The property that matters most: whatever the mix, the sections must total the bank movement.
    const entries = [
      entry('2025-03-01', BANK.id, CAPITAL.id, 10_000_00),
      entry('2025-03-02', EQUIP.id, BANK.id, 3_000_00),
      entry('2025-03-03', AR.id, SALES.id, 2_500_00),
      entry('2025-03-04', BANK.id, AR.id, 1_000_00),
      entry('2025-03-05', RENT.id, AP.id, 800_00),
      entry('2025-03-06', AP.id, BANK.id, 500_00),
      entry('2025-03-07', DEPR.id, EQUIP.id, 250_00),
      entry('2025-03-08', LOAN.id, BANK.id, 400_00),
    ];
    const r = cashFlowStatement(ALL, entries, '2025-03-01', '2025-03-31');

    const expected = 10_000_00 - 3_000_00 + 1_000_00 - 500_00 - 400_00;
    expect(r.actualCashChangeCents).toBe(expected);
    expect(r.netChangeCents).toBe(expected);
    expect(r.isReconciled).toBe(true);
  });
});
