import { describe, expect, it } from 'vitest';
import { normalBalanceForType, type Account } from '../types';
import { checkDraftEntryWarnings } from './checkDraftEntryWarnings';

function account(id: number, code: string, name: string, accountType: Account['accountType'], gifiCode: string | null = null): Account {
  return {
    id,
    code,
    name,
    accountType,
    accountSubtype: null,
    normalBalance: normalBalanceForType(accountType),
    parentId: null,
    gifiCode,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
  };
}

const CASH = account(1, '1000', 'Cash', 'Asset');
const RETAINED_EARNINGS = account(2, '3600', 'Retained Earnings', 'Equity', '3600');
const RENT_EXPENSE = account(3, '5000', 'Rent Expense', 'Expense');
const SALES_REVENUE = account(4, '4000', 'Sales Revenue', 'Revenue');
const INSURANCE_EXPENSE = account(5, '5300', 'Insurance Expense', 'Expense');
const BANK_CHARGES = account(6, '5400', 'Bank Charges', 'Expense');
const ALL_ACCOUNTS = [CASH, RETAINED_EARNINGS, RENT_EXPENSE, SALES_REVENUE, INSURANCE_EXPENSE, BANK_CHARGES];

describe('checkDraftEntryWarnings', () => {
  it('returns no warnings for a normal, well-formed entry', () => {
    const warnings = checkDraftEntryWarnings(
      ALL_ACCOUNTS,
      [
        { accountId: RENT_EXPENSE.id, debitCents: 500, creditCents: 0 },
        { accountId: CASH.id, debitCents: 0, creditCents: 500 },
      ],
      '2026-01-10',
      '2026-01-10',
    );
    expect(warnings).toHaveLength(0);
  });

  it('flags a future-dated entry', () => {
    const warnings = checkDraftEntryWarnings(ALL_ACCOUNTS, [], '2026-06-01', '2026-01-10');
    expect(warnings.some((w) => w.rule === 'future-dated')).toBe(true);
  });

  it('flags a direct posting to Retained Earnings', () => {
    const warnings = checkDraftEntryWarnings(
      ALL_ACCOUNTS,
      [
        { accountId: CASH.id, debitCents: 500, creditCents: 0 },
        { accountId: RETAINED_EARNINGS.id, debitCents: 0, creditCents: 500 },
      ],
      '2026-01-10',
      '2026-01-10',
    );
    expect(warnings.some((w) => w.rule === 'direct-retained-earnings-posting')).toBe(true);
  });

  it('flags an expense account being credited', () => {
    const warnings = checkDraftEntryWarnings(
      ALL_ACCOUNTS,
      [
        { accountId: CASH.id, debitCents: 500, creditCents: 0 },
        { accountId: RENT_EXPENSE.id, debitCents: 0, creditCents: 500 },
      ],
      '2026-01-10',
      '2026-01-10',
    );
    expect(warnings.some((w) => w.rule === 'expense-credited')).toBe(true);
  });

  it('flags a revenue account being debited', () => {
    const warnings = checkDraftEntryWarnings(
      ALL_ACCOUNTS,
      [
        { accountId: SALES_REVENUE.id, debitCents: 500, creditCents: 0 },
        { accountId: CASH.id, debitCents: 0, creditCents: 500 },
      ],
      '2026-01-10',
      '2026-01-10',
    );
    expect(warnings.some((w) => w.rule === 'revenue-debited')).toBe(true);
  });

  it('flags the same account debited and credited within one entry', () => {
    const warnings = checkDraftEntryWarnings(
      ALL_ACCOUNTS,
      [
        { accountId: CASH.id, debitCents: 500, creditCents: 0 },
        { accountId: CASH.id, debitCents: 0, creditCents: 500 },
      ],
      '2026-01-10',
      '2026-01-10',
    );
    expect(warnings.some((w) => w.rule === 'same-account-both-sides')).toBe(true);
  });

  it('ignores zero-amount lines when checking same-account-both-sides', () => {
    const warnings = checkDraftEntryWarnings(
      ALL_ACCOUNTS,
      [
        { accountId: CASH.id, debitCents: 500, creditCents: 0 },
        { accountId: CASH.id, debitCents: 0, creditCents: 0 },
      ],
      '2026-01-10',
      '2026-01-10',
    );
    expect(warnings.some((w) => w.rule === 'same-account-both-sides')).toBe(false);
  });

  it('flags a likely transposition when both sides have amounts and differ by a multiple of 9', () => {
    // Debit 54.00 vs credit 45.00 -> off by 9.00 (a transposed 54/45).
    const warnings = checkDraftEntryWarnings(
      ALL_ACCOUNTS,
      [
        { accountId: RENT_EXPENSE.id, debitCents: 5400, creditCents: 0 },
        { accountId: CASH.id, debitCents: 0, creditCents: 4500 },
      ],
      '2026-01-10',
      '2026-01-10',
    );
    expect(warnings.some((w) => w.rule === 'transposition-suspect')).toBe(true);
  });

  it('does not flag transposition for a balanced entry', () => {
    const warnings = checkDraftEntryWarnings(
      ALL_ACCOUNTS,
      [
        { accountId: RENT_EXPENSE.id, debitCents: 5400, creditCents: 0 },
        { accountId: CASH.id, debitCents: 0, creditCents: 5400 },
      ],
      '2026-01-10',
      '2026-01-10',
    );
    expect(warnings.some((w) => w.rule === 'transposition-suspect')).toBe(false);
  });

  it('does not flag transposition while only one side is entered (mid-typing)', () => {
    const warnings = checkDraftEntryWarnings(
      ALL_ACCOUNTS,
      [{ accountId: RENT_EXPENSE.id, debitCents: 900, creditCents: 0 }],
      '2026-01-10',
      '2026-01-10',
    );
    expect(warnings.some((w) => w.rule === 'transposition-suspect')).toBe(false);
  });

  it('flags HST applied to an Insurance expense line', () => {
    const warnings = checkDraftEntryWarnings(
      ALL_ACCOUNTS,
      [
        { accountId: INSURANCE_EXPENSE.id, debitCents: 500, creditCents: 0, taxCode: 'HST' },
        { accountId: CASH.id, debitCents: 0, creditCents: 500 },
      ],
      '2026-01-10',
      '2026-01-10',
    );
    expect(warnings.some((w) => w.rule === 'hst-exempt-category')).toBe(true);
  });

  it('flags HST applied to a Bank Charges line', () => {
    const warnings = checkDraftEntryWarnings(
      ALL_ACCOUNTS,
      [
        { accountId: BANK_CHARGES.id, debitCents: 500, creditCents: 0, taxCode: 'HST' },
        { accountId: CASH.id, debitCents: 0, creditCents: 500 },
      ],
      '2026-01-10',
      '2026-01-10',
    );
    expect(warnings.some((w) => w.rule === 'hst-exempt-category')).toBe(true);
  });

  it('does not flag Insurance when no HST tax code is applied', () => {
    const warnings = checkDraftEntryWarnings(
      ALL_ACCOUNTS,
      [
        { accountId: INSURANCE_EXPENSE.id, debitCents: 500, creditCents: 0, taxCode: 'NonHST' },
        { accountId: CASH.id, debitCents: 0, creditCents: 500 },
      ],
      '2026-01-10',
      '2026-01-10',
    );
    expect(warnings.some((w) => w.rule === 'hst-exempt-category')).toBe(false);
  });

  it('does not flag HST on an unrelated expense account', () => {
    const warnings = checkDraftEntryWarnings(
      ALL_ACCOUNTS,
      [
        { accountId: RENT_EXPENSE.id, debitCents: 500, creditCents: 0, taxCode: 'HST' },
        { accountId: CASH.id, debitCents: 0, creditCents: 500 },
      ],
      '2026-01-10',
      '2026-01-10',
    );
    expect(warnings.some((w) => w.rule === 'hst-exempt-category')).toBe(false);
  });
});
