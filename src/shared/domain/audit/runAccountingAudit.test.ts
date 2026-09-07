import { describe, expect, it } from 'vitest';
import { normalBalanceForType, type Account, type JournalEntry } from '../types';
import { runAccountingAudit } from './runAccountingAudit';

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

function entry(
  id: number,
  entryDate: string,
  status: JournalEntry['status'],
  lines: { accountId: number; debitCents?: number; creditCents?: number; taxCode?: JournalEntry['lines'][number]['taxCode'] }[],
  memo: string | null = null,
): JournalEntry {
  return {
    id,
    entryDate,
    memo,
    reference: null,
    status,
    createdAt: entryDate,
    postedAt: status === 'posted' ? entryDate : null,
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
      taxCode: l.taxCode ?? null,
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

const CASH = account(1, '1000', 'Cash', 'Asset', '1001');
const RETAINED_EARNINGS = account(2, '3600', 'Retained Earnings', 'Equity', '3600');
const RENT_EXPENSE = account(3, '5000', 'Rent Expense', 'Expense', '8911');
const SALES_REVENUE = account(4, '4000', 'Sales Revenue', 'Revenue', '8089');
const UNMAPPED_EXPENSE = account(5, '5100', 'Mystery Expense', 'Expense', null);

const ALL_ACCOUNTS = [CASH, RETAINED_EARNINGS, RENT_EXPENSE, SALES_REVENUE, UNMAPPED_EXPENSE];

describe('runAccountingAudit', () => {
  it('flags a posted entry whose debits and credits do not balance', () => {
    const entries = [entry(1, '2026-01-05', 'posted', [{ accountId: CASH.id, debitCents: 500 }, { accountId: RENT_EXPENSE.id, creditCents: 400 }])];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-10' });
    expect(findings.some((f) => f.rule === 'unbalanced-entry' && f.entryId === 1)).toBe(true);
  });

  it('does not flag a balanced entry', () => {
    const entries = [entry(1, '2026-01-05', 'posted', [{ accountId: CASH.id, debitCents: 500 }, { accountId: RENT_EXPENSE.id, creditCents: 500 }])];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-10' });
    expect(findings.some((f) => f.rule === 'unbalanced-entry')).toBe(false);
  });

  it('flags a stale draft entry past the age threshold', () => {
    const entries = [entry(1, '2026-01-01', 'draft', [{ accountId: CASH.id, debitCents: 500 }, { accountId: RENT_EXPENSE.id, creditCents: 500 }])];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-20', draftAgeWarningDays: 14 });
    expect(findings.some((f) => f.rule === 'stale-draft' && f.entryId === 1)).toBe(true);
  });

  it('does not flag a recent draft entry', () => {
    const entries = [entry(1, '2026-01-15', 'draft', [{ accountId: CASH.id, debitCents: 500 }, { accountId: RENT_EXPENSE.id, creditCents: 500 }])];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-20', draftAgeWarningDays: 14 });
    expect(findings.some((f) => f.rule === 'stale-draft')).toBe(false);
  });

  it('never flags a voided entry, even if unbalanced or stale', () => {
    const entries = [entry(1, '2026-01-01', 'void', [{ accountId: CASH.id, debitCents: 500 }, { accountId: RENT_EXPENSE.id, creditCents: 400 }])];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-20' });
    expect(findings).toHaveLength(0);
  });

  it('flags a future-dated posted entry', () => {
    const entries = [entry(1, '2026-06-01', 'posted', [{ accountId: CASH.id, debitCents: 500 }, { accountId: RENT_EXPENSE.id, creditCents: 500 }])];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-10' });
    expect(findings.some((f) => f.rule === 'future-dated' && f.entryId === 1)).toBe(true);
  });

  it('flags a zero-amount line in a posted entry', () => {
    const entries = [
      entry(1, '2026-01-05', 'posted', [
        { accountId: CASH.id, debitCents: 500 },
        { accountId: RENT_EXPENSE.id, creditCents: 500 },
        { accountId: SALES_REVENUE.id, debitCents: 0, creditCents: 0 },
      ]),
    ];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-10' });
    expect(findings.some((f) => f.rule === 'zero-amount-line')).toBe(true);
  });

  it('flags a direct posting to the Retained Earnings account', () => {
    const entries = [entry(1, '2026-01-05', 'posted', [{ accountId: CASH.id, debitCents: 500 }, { accountId: RETAINED_EARNINGS.id, creditCents: 500 }])];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-10' });
    expect(findings.some((f) => f.rule === 'direct-retained-earnings-posting' && f.accountId === RETAINED_EARNINGS.id)).toBe(true);
  });

  it('flags an Expense account carrying a net credit balance', () => {
    // Rent Expense is credited more than debited overall -> a credit (backwards) balance.
    const entries = [
      entry(1, '2026-01-05', 'posted', [{ accountId: CASH.id, debitCents: 500 }, { accountId: RENT_EXPENSE.id, creditCents: 500 }]),
      entry(2, '2026-01-06', 'posted', [{ accountId: RENT_EXPENSE.id, creditCents: 200 }, { accountId: CASH.id, debitCents: 200 }]),
    ];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-10' });
    expect(findings.some((f) => f.rule === 'expense-credit-balance' && f.accountId === RENT_EXPENSE.id)).toBe(true);
  });

  it('flags a Revenue account carrying a net debit balance', () => {
    const entries = [entry(1, '2026-01-05', 'posted', [{ accountId: SALES_REVENUE.id, debitCents: 500 }, { accountId: CASH.id, creditCents: 500 }])];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-10' });
    expect(findings.some((f) => f.rule === 'revenue-debit-balance' && f.accountId === SALES_REVENUE.id)).toBe(true);
  });

  it('does not flag normal-direction Expense/Revenue balances', () => {
    const entries = [
      entry(1, '2026-01-05', 'posted', [{ accountId: RENT_EXPENSE.id, debitCents: 500 }, { accountId: CASH.id, creditCents: 500 }]),
      entry(2, '2026-01-06', 'posted', [{ accountId: CASH.id, debitCents: 700 }, { accountId: SALES_REVENUE.id, creditCents: 700 }]),
    ];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-10' });
    expect(findings.some((f) => f.rule === 'expense-credit-balance' || f.rule === 'revenue-debit-balance')).toBe(false);
  });

  it('flags an active account with a balance but no GIFI code', () => {
    const entries = [entry(1, '2026-01-05', 'posted', [{ accountId: UNMAPPED_EXPENSE.id, debitCents: 500 }, { accountId: CASH.id, creditCents: 500 }])];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-10' });
    expect(findings.some((f) => f.rule === 'missing-gifi-code' && f.accountId === UNMAPPED_EXPENSE.id)).toBe(true);
  });

  it('does not flag a zero-balance unmapped account', () => {
    const entries: JournalEntry[] = [];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-10' });
    expect(findings.some((f) => f.rule === 'missing-gifi-code')).toBe(false);
  });

  it('adds a transposition hint when an unbalanced difference is divisible by 9', () => {
    // Debit 54.00 vs credit 45.00 -> off by 9.00.
    const entries = [entry(1, '2026-01-05', 'posted', [{ accountId: CASH.id, debitCents: 5400 }, { accountId: RENT_EXPENSE.id, creditCents: 4500 }])];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-10' });
    const unbalanced = findings.find((f) => f.rule === 'unbalanced-entry');
    expect(unbalanced?.detail).toContain('divisible by 9');
  });

  it('flags a large, exactly-round amount as info', () => {
    const entries = [entry(1, '2026-01-05', 'posted', [{ accountId: RENT_EXPENSE.id, debitCents: 1_000_000 }, { accountId: CASH.id, creditCents: 1_000_000 }])];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-10' });
    expect(findings.some((f) => f.rule === 'large-round-amount' && f.entryId === 1)).toBe(true);
  });

  it('does not flag a non-round or smaller amount', () => {
    const entries = [entry(1, '2026-01-05', 'posted', [{ accountId: RENT_EXPENSE.id, debitCents: 1_234_56 }, { accountId: CASH.id, creditCents: 1_234_56 }])];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-10' });
    expect(findings.some((f) => f.rule === 'large-round-amount')).toBe(false);
  });

  it('flags inconsistent HST coding on an account (some lines taxed, some not)', () => {
    const entries = [
      entry(1, '2026-01-05', 'posted', [{ accountId: SALES_REVENUE.id, creditCents: 1000, taxCode: 'HST' }, { accountId: CASH.id, debitCents: 1000 }]),
      entry(2, '2026-01-06', 'posted', [{ accountId: SALES_REVENUE.id, creditCents: 1000 }, { accountId: CASH.id, debitCents: 1000 }]),
    ];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-10' });
    expect(findings.some((f) => f.rule === 'inconsistent-tax-coding' && f.accountId === SALES_REVENUE.id)).toBe(true);
  });

  it('does not flag an account coded consistently (all lines no tax code)', () => {
    const entries = [
      entry(1, '2026-01-05', 'posted', [{ accountId: SALES_REVENUE.id, creditCents: 1000 }, { accountId: CASH.id, debitCents: 1000 }]),
      entry(2, '2026-01-06', 'posted', [{ accountId: SALES_REVENUE.id, creditCents: 1000 }, { accountId: CASH.id, debitCents: 1000 }]),
    ];
    const findings = runAccountingAudit({ accounts: ALL_ACCOUNTS, entries, todayIso: '2026-01-10' });
    expect(findings.some((f) => f.rule === 'inconsistent-tax-coding')).toBe(false);
  });
});
