import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry } from '../types';
import { budgetVsActual, periodsInRange } from './budgetVsActual';

function acct(id: number, code: string, name: string, accountType: Account['accountType']): Account {
  return {
    id,
    code,
    name,
    accountType,
    accountSubtype: null,
    normalBalance: accountType === 'Revenue' || accountType === 'Liability' || accountType === 'Equity' ? 'Credit' : 'Debit',
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
  } as Account;
}

const BANK = acct(1, '1000', 'Chequing', 'Asset');
const SALES = acct(2, '4000', 'Sales', 'Revenue');
const RENT = acct(3, '5100', 'Rent', 'Expense');
const ACCOUNTS = [BANK, SALES, RENT];

let nextId = 1;
function entry(entryDate: string, debitAccountId: number, creditAccountId: number, cents: number): JournalEntry {
  const id = nextId++;
  return {
    id,
    entryDate,
    memo: null,
    reference: null,
    status: 'posted',
    createdAt: entryDate,
    postedAt: entryDate,
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

describe('periodsInRange', () => {
  it('gives all twelve periods for a full calendar year', () => {
    expect(periodsInRange('2025-01-01', '2025-01-01', '2025-12-31')).toHaveLength(12);
  });

  it('gives only the months being reported on', () => {
    // A quarter's actuals compared against a whole year's budget would look catastrophic every time.
    expect(periodsInRange('2025-01-01', '2025-01-01', '2025-03-31')).toEqual([1, 2, 3]);
  });

  it('counts periods from the fiscal year start, not from January', () => {
    // A September year end budgets from October: period 1 is October, so January is period 4.
    const periods = periodsInRange('2024-10-01', '2025-01-01', '2025-01-31');
    expect(periods).toEqual([4]);
  });

  it('returns nothing for a window outside the fiscal year', () => {
    expect(periodsInRange('2025-01-01', '2027-01-01', '2027-03-31')).toEqual([]);
  });
});

describe('budgetVsActual', () => {
  const budget = [
    { accountId: SALES.id, period: 1, amountCents: 10_000_00 },
    { accountId: SALES.id, period: 2, amountCents: 10_000_00 },
    { accountId: RENT.id, period: 1, amountCents: 2_000_00 },
    { accountId: RENT.id, period: 2, amountCents: 2_000_00 },
  ];

  it('compares actual against the budget for the periods reported on', () => {
    const entries = [entry('2025-01-15', BANK.id, SALES.id, 12_000_00)];
    const r = budgetVsActual(ACCOUNTS, entries, budget, '2025-01-01', '2025-01-01', '2025-01-31');

    const sales = r.revenue[0];
    expect(sales.budgetCents).toBe(10_000_00); // January only, not the whole year
    expect(sales.actualCents).toBe(12_000_00);
    expect(sales.varianceCents).toBe(2_000_00);
  });

  it('calls extra revenue favourable and extra cost unfavourable', () => {
    // The distinction a bare variance number loses: the same +2,000 means opposite things.
    const entries = [entry('2025-01-15', BANK.id, SALES.id, 12_000_00), entry('2025-01-20', RENT.id, BANK.id, 4_000_00)];
    const r = budgetVsActual(ACCOUNTS, entries, budget, '2025-01-01', '2025-01-01', '2025-01-31');

    expect(r.revenue[0].varianceCents).toBe(2_000_00);
    expect(r.revenue[0].isFavourable).toBe(true);
    expect(r.expenses[0].varianceCents).toBe(2_000_00);
    expect(r.expenses[0].isFavourable).toBe(false);
  });

  it('calls spending under budget favourable', () => {
    const entries = [entry('2025-01-20', RENT.id, BANK.id, 1_500_00)];
    const r = budgetVsActual(ACCOUNTS, entries, budget, '2025-01-01', '2025-01-01', '2025-01-31');

    expect(r.expenses[0].varianceCents).toBe(-500_00);
    expect(r.expenses[0].isFavourable).toBe(true);
  });

  it('adds the budget across the months in a longer window', () => {
    const entries = [entry('2025-01-15', BANK.id, SALES.id, 9_000_00)];
    const r = budgetVsActual(ACCOUNTS, entries, budget, '2025-01-01', '2025-01-01', '2025-02-28');
    expect(r.revenue[0].budgetCents).toBe(20_000_00);
  });

  it('reports the bottom line and whether it beat the plan', () => {
    const entries = [entry('2025-01-15', BANK.id, SALES.id, 12_000_00), entry('2025-01-20', RENT.id, BANK.id, 1_800_00)];
    const r = budgetVsActual(ACCOUNTS, entries, budget, '2025-01-01', '2025-01-01', '2025-01-31');

    expect(r.budgetNetIncomeCents).toBe(8_000_00);
    expect(r.actualNetIncomeCents).toBe(10_200_00);
    expect(r.netVarianceCents).toBe(2_200_00);
    expect(r.netIsFavourable).toBe(true);
  });

  it('gives no percentage when there was no budget to vary from', () => {
    // Dividing by a zero budget would be an infinite overrun, which is true and useless.
    const entries = [entry('2025-01-20', RENT.id, BANK.id, 500_00)];
    const r = budgetVsActual(ACCOUNTS, entries, [], '2025-01-01', '2025-01-01', '2025-01-31');
    expect(r.expenses[0].variancePercent).toBeNull();
  });

  it('shows an account that was budgeted but never used', () => {
    // Spending nothing against a 2,000 budget is exactly what a variance report is for.
    const r = budgetVsActual(ACCOUNTS, [], budget, '2025-01-01', '2025-01-01', '2025-01-31');
    const rent = r.expenses.find((x) => x.account.id === RENT.id)!;
    expect(rent.budgetCents).toBe(2_000_00);
    expect(rent.actualCents).toBe(0);
    expect(rent.isFavourable).toBe(true);
  });

  it('leaves out accounts with neither a budget nor any activity', () => {
    const r = budgetVsActual(ACCOUNTS, [], [], '2025-01-01', '2025-01-01', '2025-01-31');
    expect(r.revenue).toEqual([]);
    expect(r.expenses).toEqual([]);
  });
});
