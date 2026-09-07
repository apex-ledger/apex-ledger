import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry } from '../types';
import { computeT2125, t2125LineFor, type T2125Input } from './t2125';

function acct(id: number, code: string, name: string, accountType: Account['accountType'], accountSubtype: string | null = null): Account {
  return {
    id,
    code,
    name,
    accountType,
    accountSubtype,
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
const PURCHASES = acct(3, '5000', 'Purchases', 'Expense', 'Cost of Sales');
const RENT = acct(4, '5100', 'Rent', 'Expense');
const INSURANCE = acct(5, '5200', 'Insurance', 'Expense');
const ODDITY = acct(6, '5900', 'Sundry bits and pieces', 'Expense');
const ACCOUNTS = [BANK, SALES, PURCHASES, RENT, INSURANCE, ODDITY];

const NO_EXTRAS: T2125Input = {
  homeUsePercent: 0,
  homeCostsCents: 0,
  vehicleUsePercent: 0,
  vehicleCostsCents: 0,
  homeCarryForwardInCents: 0,
  ccaClaimedCents: 0,
};

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

describe('t2125LineFor', () => {
  it('puts common accounts on their CRA line', () => {
    expect(t2125LineFor(acct(9, '5', 'Rent', 'Expense')).line).toBe('8910');
    expect(t2125LineFor(acct(9, '5', 'Insurance', 'Expense')).line).toBe('8690');
    expect(t2125LineFor(acct(9, '5', 'Advertising & Promotion', 'Expense')).line).toBe('8521');
    expect(t2125LineFor(acct(9, '5', 'Professional Fees', 'Expense')).line).toBe('8860');
    expect(t2125LineFor(acct(9, '5', 'Vehicle & Fuel', 'Expense')).line).toBe('9281');
  });

  it('sends anything it cannot place to Other expenses rather than dropping it', () => {
    // 9270 is a real line on the form, so nothing goes missing.
    expect(t2125LineFor(acct(9, '5', 'Sundry bits and pieces', 'Expense')).line).toBe('9270');
  });
});

describe('computeT2125', () => {
  it('reports cost of sales above gross profit, not among the expenses', () => {
    const entries = [
      entry('2025-03-01', BANK.id, SALES.id, 100_000_00),
      entry('2025-03-02', PURCHASES.id, BANK.id, 60_000_00),
      entry('2025-03-03', RENT.id, BANK.id, 12_000_00),
    ];
    const r = computeT2125(ACCOUNTS, entries, '2025-01-01', '2025-12-31', NO_EXTRAS);

    expect(r.grossRevenueCents).toBe(100_000_00);
    expect(r.costOfGoodsSoldCents).toBe(60_000_00);
    expect(r.grossProfitCents).toBe(40_000_00);
    expect(r.expenses.some((e) => e.accountIds.includes(PURCHASES.id))).toBe(false);
    expect(r.totalExpensesCents).toBe(12_000_00);
  });

  it('claims only the business share of vehicle costs', () => {
    const entries = [entry('2025-03-01', BANK.id, SALES.id, 50_000_00)];
    const r = computeT2125(ACCOUNTS, entries, '2025-01-01', '2025-12-31', {
      ...NO_EXTRAS,
      vehicleCostsCents: 10_000_00,
      vehicleUsePercent: 0.6,
    });
    expect(r.vehicleClaimCents).toBe(6_000_00);
  });

  it('claims only the business share of home costs', () => {
    const entries = [entry('2025-03-01', BANK.id, SALES.id, 50_000_00)];
    const r = computeT2125(ACCOUNTS, entries, '2025-01-01', '2025-12-31', {
      ...NO_EXTRAS,
      homeCostsCents: 20_000_00,
      homeUsePercent: 0.15,
    });
    expect(r.homeClaimAvailableCents).toBe(3_000_00);
    expect(r.homeClaimAllowedCents).toBe(3_000_00);
    expect(r.homeCarryForwardOutCents).toBe(0);
  });

  it('will not let home-office expenses create a loss', () => {
    // Profit of 1,000 before home costs, with 3,000 of home claim available: only 1,000 can be
    // deducted this year. Claiming the lot would produce a return the CRA reassesses.
    const entries = [entry('2025-03-01', BANK.id, SALES.id, 13_000_00), entry('2025-03-02', RENT.id, BANK.id, 12_000_00)];
    const r = computeT2125(ACCOUNTS, entries, '2025-01-01', '2025-12-31', {
      ...NO_EXTRAS,
      homeCostsCents: 20_000_00,
      homeUsePercent: 0.15,
    });

    expect(r.netBeforeHomeCents).toBe(1_000_00);
    expect(r.homeClaimAvailableCents).toBe(3_000_00);
    expect(r.homeClaimAllowedCents).toBe(1_000_00);
    expect(r.netIncomeCents).toBe(0);
  });

  it('carries the unclaimed home amount forward rather than losing it', () => {
    const entries = [entry('2025-03-01', BANK.id, SALES.id, 13_000_00), entry('2025-03-02', RENT.id, BANK.id, 12_000_00)];
    const r = computeT2125(ACCOUNTS, entries, '2025-01-01', '2025-12-31', {
      ...NO_EXTRAS,
      homeCostsCents: 20_000_00,
      homeUsePercent: 0.15,
    });
    expect(r.homeCarryForwardOutCents).toBe(2_000_00);
  });

  it('claims nothing for home in a year that already lost money', () => {
    const entries = [entry('2025-03-01', BANK.id, SALES.id, 5_000_00), entry('2025-03-02', RENT.id, BANK.id, 12_000_00)];
    const r = computeT2125(ACCOUNTS, entries, '2025-01-01', '2025-12-31', {
      ...NO_EXTRAS,
      homeCostsCents: 20_000_00,
      homeUsePercent: 0.15,
    });

    expect(r.netBeforeHomeCents).toBe(-7_000_00);
    expect(r.homeClaimAllowedCents).toBe(0);
    expect(r.homeCarryForwardOutCents).toBe(3_000_00);
    expect(r.netIncomeCents).toBe(-7_000_00); // the loss is the trading loss, not made worse
  });

  it('lets last year’s carried-forward home amount be claimed when there is profit for it', () => {
    const entries = [entry('2025-03-01', BANK.id, SALES.id, 50_000_00)];
    const r = computeT2125(ACCOUNTS, entries, '2025-01-01', '2025-12-31', {
      ...NO_EXTRAS,
      homeCostsCents: 10_000_00,
      homeUsePercent: 0.1,
      homeCarryForwardInCents: 2_000_00,
    });
    expect(r.homeClaimAvailableCents).toBe(3_000_00);
    expect(r.homeClaimAllowedCents).toBe(3_000_00);
  });

  it('takes CCA off before the home claim is measured', () => {
    // CCA reduces the profit the home claim is capped against, which is the correct order.
    const entries = [entry('2025-03-01', BANK.id, SALES.id, 10_000_00)];
    const r = computeT2125(ACCOUNTS, entries, '2025-01-01', '2025-12-31', {
      ...NO_EXTRAS,
      ccaClaimedCents: 9_500_00,
      homeCostsCents: 10_000_00,
      homeUsePercent: 0.2,
    });

    expect(r.netBeforeHomeCents).toBe(500_00);
    expect(r.homeClaimAllowedCents).toBe(500_00);
  });

  it('groups several accounts onto one CRA line', () => {
    const entries = [
      entry('2025-03-01', BANK.id, SALES.id, 50_000_00),
      entry('2025-03-02', RENT.id, BANK.id, 1_000_00),
      entry('2025-03-03', INSURANCE.id, BANK.id, 500_00),
      entry('2025-03-04', ODDITY.id, BANK.id, 250_00),
    ];
    const r = computeT2125(ACCOUNTS, entries, '2025-01-01', '2025-12-31', NO_EXTRAS);

    expect(r.expenses.find((e) => e.line === '8910')?.amountCents).toBe(1_000_00);
    expect(r.expenses.find((e) => e.line === '8690')?.amountCents).toBe(500_00);
    expect(r.expenses.find((e) => e.line === '9270')?.amountCents).toBe(250_00);
    expect(r.totalExpensesCents).toBe(1_750_00);
  });
});
