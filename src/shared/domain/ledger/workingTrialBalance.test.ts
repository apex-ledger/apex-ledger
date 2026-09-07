import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry } from '../types';
import { workingTrialBalance } from './workingTrialBalance';

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
const PREPAID = acct(2, '1200', 'Prepaid Insurance', 'Asset');
const SALES = acct(3, '4000', 'Sales', 'Revenue');
const RENT = acct(4, '5100', 'Rent', 'Expense');
const INSURANCE = acct(5, '5200', 'Insurance', 'Expense');
const UNUSED = acct(6, '5900', 'Never Used', 'Expense');
const ACCOUNTS = [BANK, PREPAID, SALES, RENT, INSURANCE, UNUSED];

let nextId = 1;
function entry(entryDate: string, debitAccountId: number, creditAccountId: number, cents: number, isAdjusting = false): JournalEntry {
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
    isAdjustingEntry: isAdjusting,
    source: 'manual',
    sourceReference: null,
    lines: [
      { id: id * 10, journalEntryId: id, accountId: debitAccountId, debitCents: cents, creditCents: 0, description: null, lineOrder: 0, taxCode: null, manualHstCents: null, baseCents: null, clearedAt: null, reconciliationId: null, foreignCurrency: null, foreignAmountCents: null },
      { id: id * 10 + 1, journalEntryId: id, accountId: creditAccountId, debitCents: 0, creditCents: cents, description: null, lineOrder: 1, taxCode: null, manualHstCents: null, baseCents: null, clearedAt: null, reconciliationId: null, foreignCurrency: null, foreignAmountCents: null },
    ],
  } as JournalEntry;
}

describe('workingTrialBalance', () => {
  it('brings the prior balance forward as opening, not as movement', () => {
    const entries = [
      entry('2024-06-01', BANK.id, SALES.id, 1_000_00), // before the period
      entry('2025-03-01', BANK.id, SALES.id, 400_00), // in it
    ];
    const r = workingTrialBalance(ACCOUNTS, entries, '2025-01-01', '2025-12-31');
    const bank = r.rows.find((x) => x.account.id === BANK.id)!;

    expect(bank.openingCents).toBe(1_000_00);
    expect(bank.movementCents).toBe(400_00);
    expect(bank.closingCents).toBe(1_400_00);
  });

  it('separates an adjusting entry from the ordinary movement', () => {
    // The classic year-end adjustment: part of prepaid insurance becomes an expense.
    const entries = [
      entry('2025-01-05', PREPAID.id, BANK.id, 1_200_00), // paid the year up front
      entry('2025-12-31', INSURANCE.id, PREPAID.id, 900_00, true), // nine months used
    ];
    const r = workingTrialBalance(ACCOUNTS, entries, '2025-01-01', '2025-12-31');
    const prepaid = r.rows.find((x) => x.account.id === PREPAID.id)!;

    expect(prepaid.movementCents).toBe(1_200_00);
    expect(prepaid.adjustmentCents).toBe(-900_00);
    expect(prepaid.unadjustedCents).toBe(1_200_00); // what the books said before the accountant
    expect(prepaid.closingCents).toBe(300_00); // three months still prepaid
  });

  it('keeps unadjusted plus adjustment equal to closing on every row', () => {
    const entries = [
      entry('2025-01-05', PREPAID.id, BANK.id, 1_200_00),
      entry('2025-03-01', RENT.id, BANK.id, 800_00),
      entry('2025-06-01', BANK.id, SALES.id, 5_000_00),
      entry('2025-12-31', INSURANCE.id, PREPAID.id, 900_00, true),
    ];
    const r = workingTrialBalance(ACCOUNTS, entries, '2025-01-01', '2025-12-31');
    for (const row of r.rows) {
      expect(row.unadjustedCents + row.adjustmentCents, `${row.account.name} does not add up`).toBe(row.closingCents);
    }
  });

  it('balances: closing debits equal closing credits', () => {
    const entries = [
      entry('2024-11-01', BANK.id, SALES.id, 2_000_00),
      entry('2025-02-01', RENT.id, BANK.id, 700_00),
      entry('2025-12-31', INSURANCE.id, BANK.id, 150_00, true),
    ];
    const r = workingTrialBalance(ACCOUNTS, entries, '2025-01-01', '2025-12-31');

    expect(r.totalClosingDebitCents).toBe(r.totalClosingCreditCents);
    expect(r.isBalanced).toBe(true);
  });

  it('puts a credit-normal account in the credit column and vice versa', () => {
    const r = workingTrialBalance(ACCOUNTS, [entry('2025-03-01', BANK.id, SALES.id, 500_00)], '2025-01-01', '2025-12-31');
    const bank = r.rows.find((x) => x.account.id === BANK.id)!;
    const sales = r.rows.find((x) => x.account.id === SALES.id)!;

    expect(bank.closingDebitCents).toBe(500_00);
    expect(bank.closingCreditCents).toBe(0);
    expect(sales.closingCreditCents).toBe(500_00);
    expect(sales.closingDebitCents).toBe(0);
  });

  it('puts an account with a backwards balance on the other side', () => {
    // An overdrawn bank account is an asset with a credit balance; it must print as a credit.
    const r = workingTrialBalance(ACCOUNTS, [entry('2025-03-01', RENT.id, BANK.id, 500_00)], '2025-01-01', '2025-12-31');
    const bank = r.rows.find((x) => x.account.id === BANK.id)!;

    expect(bank.closingCreditCents).toBe(500_00);
    expect(bank.closingDebitCents).toBe(0);
  });

  it('leaves out accounts that were nil all the way through', () => {
    const r = workingTrialBalance(ACCOUNTS, [entry('2025-03-01', BANK.id, SALES.id, 100_00)], '2025-01-01', '2025-12-31');
    expect(r.rows.map((x) => x.account.id)).not.toContain(UNUSED.id);
  });

  it('keeps an account that closed at zero but moved during the period', () => {
    // Nil at both ends, but it was used — an accountant reviewing the year needs to see that.
    const entries = [entry('2025-03-01', RENT.id, BANK.id, 100_00), entry('2025-04-01', BANK.id, RENT.id, 100_00)];
    const r = workingTrialBalance(ACCOUNTS, entries, '2025-01-01', '2025-12-31');
    expect(r.rows.map((x) => x.account.id)).toContain(RENT.id);
  });

  it('ignores entries outside the period and anything unposted', () => {
    const draft = { ...entry('2025-03-01', BANK.id, SALES.id, 900_00), status: 'draft' } as JournalEntry;
    const later = entry('2026-03-01', BANK.id, SALES.id, 700_00);
    const r = workingTrialBalance(ACCOUNTS, [draft, later], '2025-01-01', '2025-12-31');
    expect(r.rows).toEqual([]);
  });

  it('sorts by account code, the way a trial balance is read', () => {
    const entries = [entry('2025-03-01', RENT.id, SALES.id, 100_00), entry('2025-03-02', BANK.id, SALES.id, 50_00)];
    const r = workingTrialBalance(ACCOUNTS, entries, '2025-01-01', '2025-12-31');
    expect(r.rows.map((x) => x.account.code)).toEqual(['1000', '4000', '5100']);
  });
});
