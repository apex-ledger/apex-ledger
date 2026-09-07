import { describe, expect, it } from 'vitest';
import { normalBalanceForType, type Account, type FiscalPeriod, type GifiCode, type JournalEntry } from '../types';
import { validateJournalEntryForPosting } from './postJournalEntry';
import { computeAccountBalances } from './computeAccountBalances';
import { trialBalance } from './trialBalance';
import { generalLedger } from './generalLedger';
import { incomeStatement } from './incomeStatement';
import { balanceSheet } from './balanceSheet';
import { gifiExport } from './gifiExport';

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

const CASH = account(1, '1000', 'Cash', 'Asset', '1001');
const AR = account(2, '1200', 'Accounts Receivable', 'Asset', '1060');
const AP = account(3, '2200', 'Accounts Payable', 'Liability', '2620');
const COMMON_SHARES = account(4, '3000', 'Common Shares', 'Equity', '3450');
const SALES_REVENUE = account(5, '4000', 'Sales Revenue', 'Revenue', '8089');
const RENT_EXPENSE = account(6, '5000', 'Rent Expense', 'Expense', null); // deliberately unmapped
const SUPPLIES_EXPENSE = account(7, '5100', 'Office Supplies Expense', 'Expense', '8811');
const HST_RECOVERABLE = account(8, '1250', 'GST/HST Recoverable', 'Asset', '1066');

const ALL_ACCOUNTS: Account[] = [CASH, AR, AP, COMMON_SHARES, SALES_REVENUE, RENT_EXPENSE, SUPPLIES_EXPENSE];

function entry(
  id: number,
  entryDate: string,
  status: JournalEntry['status'],
  lines: { accountId: number; debitCents?: number; creditCents?: number }[],
): JournalEntry {
  return {
    id,
    entryDate,
    memo: null,
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

// Fixture: a fiscal year of postings that a hand-computed Trial Balance / Income Statement /
// Balance Sheet can be checked against. This round-trip is the key correctness gate for the engine.
const POSTED_ENTRIES: JournalEntry[] = [
  entry(1, '2026-01-01', 'posted', [
    { accountId: CASH.id, debitCents: 1_000_000 },
    { accountId: COMMON_SHARES.id, creditCents: 1_000_000 },
  ]),
  entry(2, '2026-01-05', 'posted', [
    { accountId: CASH.id, debitCents: 500_000 },
    { accountId: SALES_REVENUE.id, creditCents: 500_000 },
  ]),
  entry(3, '2026-01-10', 'posted', [
    { accountId: AR.id, debitCents: 300_000 },
    { accountId: SALES_REVENUE.id, creditCents: 300_000 },
  ]),
  entry(4, '2026-01-15', 'posted', [
    { accountId: RENT_EXPENSE.id, debitCents: 120_000 },
    { accountId: CASH.id, creditCents: 120_000 },
  ]),
  entry(5, '2026-01-20', 'posted', [
    { accountId: SUPPLIES_EXPENSE.id, debitCents: 30_000 },
    { accountId: AP.id, creditCents: 30_000 },
  ]),
  // Draft entry must NOT affect any balances or reports.
  entry(6, '2026-01-25', 'draft', [
    { accountId: CASH.id, debitCents: 999_999 },
    { accountId: SALES_REVENUE.id, creditCents: 999_999 },
  ]),
];

const FISCAL_PERIODS: FiscalPeriod[] = [
  { id: 1, periodStart: '2025-01-01', periodEnd: '2025-12-31', label: 'FY2025', isLocked: true, lockedAt: '2026-01-01' },
  { id: 2, periodStart: '2026-01-01', periodEnd: '2026-12-31', label: 'FY2026', isLocked: false, lockedAt: null },
];

const GIFI_CODES: GifiCode[] = [
  { code: '1001', description: 'Cash', statementType: 'BalanceSheet', category: 'Current Asset', isCustom: false },
  { code: '1060', description: 'Accounts receivable', statementType: 'BalanceSheet', category: 'Current Asset', isCustom: false },
  { code: '2620', description: 'Accounts payable', statementType: 'BalanceSheet', category: 'Current Liability', isCustom: false },
  { code: '3450', description: 'Common shares', statementType: 'BalanceSheet', category: 'Share Capital', isCustom: false },
  { code: '8089', description: 'Total sales of goods and services', statementType: 'IncomeStatement', category: 'Revenue', isCustom: false },
  { code: '8811', description: 'Office supplies', statementType: 'IncomeStatement', category: 'Expense', isCustom: false },
];

describe('validateJournalEntryForPosting', () => {
  it('rejects an unbalanced entry', () => {
    const result = validateJournalEntryForPosting(
      { entryDate: '2026-02-01', lines: [{ accountId: CASH.id, debitCents: 100, creditCents: 0 }, { accountId: SALES_REVENUE.id, debitCents: 0, creditCents: 50 }] },
      ALL_ACCOUNTS,
      FISCAL_PERIODS,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a line with both a debit and a credit', () => {
    const result = validateJournalEntryForPosting(
      { entryDate: '2026-02-01', lines: [{ accountId: CASH.id, debitCents: 100, creditCents: 100 }, { accountId: SALES_REVENUE.id, debitCents: 0, creditCents: 100 }] },
      ALL_ACCOUNTS,
      FISCAL_PERIODS,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects an entry dated inside a locked fiscal period', () => {
    const result = validateJournalEntryForPosting(
      { entryDate: '2025-06-15', lines: [{ accountId: CASH.id, debitCents: 100, creditCents: 0 }, { accountId: SALES_REVENUE.id, debitCents: 0, creditCents: 100 }] },
      ALL_ACCOUNTS,
      FISCAL_PERIODS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/locked/i);
  });

  it('accepts a balanced entry in an open period', () => {
    const result = validateJournalEntryForPosting(
      { entryDate: '2026-02-01', lines: [{ accountId: CASH.id, debitCents: 100, creditCents: 0 }, { accountId: SALES_REVENUE.id, debitCents: 0, creditCents: 100 }] },
      ALL_ACCOUNTS,
      FISCAL_PERIODS,
    );
    expect(result.ok).toBe(true);
  });

  it('allows non-tax banking/payroll/payment entries through a filing-owned HST lock', () => {
    const hstLock: FiscalPeriod[] = [{ id: 3, periodStart: '2026-07-01', periodEnd: '2026-09-30', label: 'GST/HST filed — 2026-07-01 to 2026-09-30', isLocked: true, lockedAt: '2026-10-01' }];
    const result = validateJournalEntryForPosting(
      { entryDate: '2026-08-29', lines: [{ accountId: AP.id, debitCents: 100, creditCents: 0 }, { accountId: CASH.id, debitCents: 0, creditCents: 100 }] },
      ALL_ACCOUNTS,
      hstLock,
    );
    expect(result.ok).toBe(true);
  });

  it('still blocks a tax-affecting entry inside a filing-owned HST lock', () => {
    const hstLock: FiscalPeriod[] = [{ id: 3, periodStart: '2026-07-01', periodEnd: '2026-09-30', label: 'GST/HST filed — 2026-07-01 to 2026-09-30', isLocked: true, lockedAt: '2026-10-01' }];
    const result = validateJournalEntryForPosting(
      { entryDate: '2026-08-29', lines: [{ accountId: SUPPLIES_EXPENSE.id, debitCents: 100, creditCents: 0, taxCode: 'HST' }, { accountId: HST_RECOVERABLE.id, debitCents: 13, creditCents: 0 }, { accountId: CASH.id, debitCents: 0, creditCents: 113 }] },
      [...ALL_ACCOUNTS, HST_RECOVERABLE],
      hstLock,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/reopen that return/i);
  });

  it('rejects an unknown account id', () => {
    const result = validateJournalEntryForPosting(
      { entryDate: '2026-02-01', lines: [{ accountId: 9999, debitCents: 100, creditCents: 0 }, { accountId: SALES_REVENUE.id, debitCents: 0, creditCents: 100 }] },
      ALL_ACCOUNTS,
      FISCAL_PERIODS,
    );
    expect(result.ok).toBe(false);
  });

  it('allows direct postings to a master account that has sub-accounts', () => {
    const masterChequing = account(20, '1010', 'Master Chequing', 'Asset');
    const chequing101 = { ...account(21, '1020', 'Chequing 101', 'Asset'), parentId: masterChequing.id };
    const result = validateJournalEntryForPosting(
      {
        entryDate: '2026-02-01',
        lines: [
          { accountId: masterChequing.id, debitCents: 100, creditCents: 0 },
          { accountId: SALES_REVENUE.id, debitCents: 0, creditCents: 100 },
        ],
      },
      [...ALL_ACCOUNTS, masterChequing, chequing101],
      FISCAL_PERIODS,
    );
    expect(result.ok).toBe(true);
  });

  it('allows optional direct postings to an explicitly marked master before it has sub-accounts', () => {
    const newMaster = { ...account(22, '1030', 'New Master Account', 'Asset'), isMaster: true };
    const result = validateJournalEntryForPosting(
      {
        entryDate: '2026-02-01',
        lines: [
          { accountId: newMaster.id, debitCents: 100, creditCents: 0 },
          { accountId: SALES_REVENUE.id, debitCents: 0, creditCents: 100 },
        ],
      },
      [...ALL_ACCOUNTS, newMaster],
      FISCAL_PERIODS,
    );
    expect(result.ok).toBe(true);
  });

  it('allows postings to a sub-account beneath a master account', () => {
    const masterChequing = account(20, '1010', 'Master Chequing', 'Asset');
    const chequing101 = { ...account(21, '1020', 'Chequing 101', 'Asset'), parentId: masterChequing.id };
    const result = validateJournalEntryForPosting(
      {
        entryDate: '2026-02-01',
        lines: [
          { accountId: chequing101.id, debitCents: 100, creditCents: 0 },
          { accountId: SALES_REVENUE.id, debitCents: 0, creditCents: 100 },
        ],
      },
      [...ALL_ACCOUNTS, masterChequing, chequing101],
      FISCAL_PERIODS,
    );
    expect(result.ok).toBe(true);
  });
});

describe('computeAccountBalances', () => {
  it('only counts posted entries, ignoring drafts', () => {
    const balances = computeAccountBalances(ALL_ACCOUNTS, POSTED_ENTRIES);
    expect(balances.get(CASH.id)!.balanceCents).toBe(1_000_000 + 500_000 - 120_000);
    expect(balances.get(SALES_REVENUE.id)!.balanceCents).toBe(500_000 + 300_000); // excludes the draft's 999_999
  });
});

describe('trialBalance', () => {
  it('balances: total debits equal total credits', () => {
    const tb = trialBalance(ALL_ACCOUNTS, POSTED_ENTRIES, '2026-01-31');
    expect(tb.totalDebitCents).toBe(tb.totalCreditCents);
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebitCents).toBe(1_380_000 + 300_000 + 120_000 + 30_000);
  });

  it('excludes accounts with a zero balance', () => {
    const tb = trialBalance(ALL_ACCOUNTS, POSTED_ENTRIES, '2026-01-31');
    const codes = tb.rows.map((r) => r.account.code);
    expect(codes).not.toContain('9999');
  });
});

describe('generalLedger', () => {
  it('produces a correct running balance for a single account', () => {
    const gl = generalLedger(CASH, POSTED_ENTRIES, '2026-01-01', '2026-01-31');
    expect(gl.openingBalanceCents).toBe(0);
    expect(gl.lines).toHaveLength(3); // entries 1, 2, 4 touch Cash
    expect(gl.closingBalanceCents).toBe(1_000_000 + 500_000 - 120_000);
    expect(gl.lines[gl.lines.length - 1].runningBalanceCents).toBe(gl.closingBalanceCents);
  });

  it('provides the detailed transaction, split, tax, contact, and foreign-currency columns', () => {
    const purchase = entry(20, '2026-01-22', 'posted', [
      { accountId: RENT_EXPENSE.id, debitCents: 10_000 },
      { accountId: HST_RECOVERABLE.id, debitCents: 1_300 },
      { accountId: CASH.id, creditCents: 11_300 },
    ]);
    purchase.reference = 'BILL-44';
    purchase.createdBy = 'Morgan Lee';
    purchase.isAdjustingEntry = true;
    purchase.lines[0] = {
      ...purchase.lines[0],
      taxCode: 'HST',
      baseCents: 10_000,
      vendorId: 7,
      foreignCurrency: 'USD',
      foreignAmountCents: 7_143,
      exchangeRate: 1.4,
    };

    const gl = generalLedger(RENT_EXPENSE, [purchase], '2026-01-01', '2026-01-31', {
      allAccounts: [...ALL_ACCOUNTS, HST_RECOVERABLE],
      vendorNames: new Map([[7, 'Office Supply Co.']]),
      transactionTypes: new Map([[20, 'Bill']]),
    });

    expect(gl.lines[0]).toMatchObject({
      transactionType: 'Bill',
      createdBy: 'Morgan Lee',
      reference: 'BILL-44',
      isAdjustment: true,
      name: 'Office Supply Co.',
      split: 'Split',
      taxAmountCents: 1_300,
      currency: 'USD',
      exchangeRate: 1.4,
      foreignAmountCents: 7_143,
    });
  });
});

describe('incomeStatement', () => {
  it('computes net income as revenue minus expenses', () => {
    const is = incomeStatement(ALL_ACCOUNTS, POSTED_ENTRIES, '2026-01-01', '2026-01-31');
    expect(is.revenue.totalCents).toBe(800_000);
    expect(is.expenses.totalCents).toBe(150_000);
    expect(is.netIncomeCents).toBe(650_000);
  });
});

describe('balanceSheet', () => {
  it('holds Assets = Liabilities + Equity by construction', () => {
    const bs = balanceSheet(ALL_ACCOUNTS, POSTED_ENTRIES, '2026-01-31');
    expect(bs.isBalanced).toBe(true);
    expect(bs.assets.totalCents).toBe(bs.totalLiabilitiesAndEquityCents);
    expect(bs.assets.totalCents).toBe(1_000_000 + 500_000 - 120_000 + 300_000); // Cash + AR
    expect(bs.equity.totalCents).toBe(1_000_000 + 650_000); // Common shares + net income to date
  });

  it('still balances across multiple fixture scenarios with differing account activity', () => {
    const sparseEntries = POSTED_ENTRIES.slice(0, 2); // just the two cash-affecting entries
    const bs = balanceSheet(ALL_ACCOUNTS, sparseEntries, '2026-01-31');
    expect(bs.assets.totalCents).toBe(bs.totalLiabilitiesAndEquityCents);
  });
});

describe('gifiExport', () => {
  it('aggregates accounts sharing a GIFI code and flags unmapped accounts', () => {
    const result = gifiExport(ALL_ACCOUNTS, POSTED_ENTRIES, GIFI_CODES, '2026-01-01', '2026-01-31');
    const unmappedCodes = result.unmappedAccounts.map((a) => a.code);
    expect(unmappedCodes).toContain(RENT_EXPENSE.code); // Rent Expense has no gifiCode and a non-zero balance

    const cashRow = result.rows.find((r) => r.gifiCode === '1001');
    expect(cashRow?.amountCents).toBe(1_000_000 + 500_000 - 120_000);
  });

  it('excludes zero-balance accounts from both mapped rows and the unmapped list', () => {
    const noActivity: JournalEntry[] = [];
    const result = gifiExport(ALL_ACCOUNTS, noActivity, GIFI_CODES, '2026-01-01', '2026-01-31');
    expect(result.rows.filter((r) => !r.isComputedTotal)).toHaveLength(0);
    expect(result.unmappedAccounts).toHaveLength(0);
  });
});
