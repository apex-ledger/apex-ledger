import { describe, expect, it } from 'vitest';
import { normalBalanceForType, type Account, type Contact, type JournalEntry } from '../types';
import { writeIif } from './writeIif';
import { parseIif } from './parseIif';

function account(id: number, name: string, accountType: Account['accountType'], accountSubtype: string | null = null): Account {
  return {
    id,
    code: String(1000 + id),
    name,
    accountType,
    accountSubtype,
    normalBalance: normalBalanceForType(accountType),
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
  };
}

function contact(id: number, name: string): Contact {
  return {
    id,
    name,
    email: null,
    phone: null,
    address: null,
    notes: null,
    isActive: true,
    isT4aContractor: false,
    t4aSin: null,
    t4aBusinessNumber: null,
    isT5018Contractor: false,
    defaultExpenseAccountId: null,
    paymentTerms: null,
  };
}

const CASH = account(1, 'Cash - Operating Account', 'Asset', 'Cash and Bank');
const SUPPLIES = account(2, 'Office Supplies & Expenses', 'Expense');
const SALES = account(3, 'Sales Revenue', 'Revenue');
const AR = account(4, 'Accounts Receivable', 'Asset');
const VISA = account(5, 'Visa', 'Liability', 'Credit Card');
const ACCOUNTS = [CASH, SUPPLIES, SALES, AR, VISA];

function entry(id: number, entryDate: string, memo: string | null, lines: { accountId: number; debitCents?: number; creditCents?: number; description?: string | null }[]): JournalEntry {
  return {
    id,
    entryDate,
    memo,
    reference: null,
    status: 'posted',
    createdAt: entryDate,
    postedAt: entryDate,
    lines: lines.map((l, i) => ({
      id: id * 100 + i,
      journalEntryId: id,
      accountId: l.accountId,
      debitCents: l.debitCents ?? 0,
      creditCents: l.creditCents ?? 0,
      description: l.description ?? null,
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

describe('writeIif', () => {
  it('writes an ACCNT header row and one row per account, mapped to sensible IIF types', () => {
    const iif = writeIif({ accounts: ACCOUNTS, postedJournalEntries: [], customers: [], vendors: [] });
    expect(iif).toContain('!ACCNT\tNAME\tACCNTTYPE\tDESC');
    expect(iif).toContain('ACCNT\tCash - Operating Account\tBANK\t');
    expect(iif).toContain('ACCNT\tOffice Supplies & Expenses\tEXP\t');
    expect(iif).toContain('ACCNT\tSales Revenue\tINC\t');
    expect(iif).toContain('ACCNT\tVisa\tCCARD\t');
  });

  it('maps an account literally named "Accounts Receivable" to the AR type regardless of subtype', () => {
    const iif = writeIif({ accounts: [AR], postedJournalEntries: [], customers: [], vendors: [] });
    expect(iif).toContain('ACCNT\tAccounts Receivable\tAR\t');
  });

  it('writes a balanced transaction as TRNS + SPL + ENDTRNS with the debit/credit sign convention', () => {
    const entries = [entry(1, '2026-07-04', 'Staples run', [{ accountId: SUPPLIES.id, debitCents: 4500 }, { accountId: CASH.id, creditCents: 4500 }])];
    const iif = writeIif({ accounts: ACCOUNTS, postedJournalEntries: entries, customers: [], vendors: [] });
    const lines = iif.split('\r\n');
    const trnsLine = lines.find((l) => l.startsWith('TRNS\t'));
    const splLine = lines.find((l) => l.startsWith('SPL\t'));
    expect(trnsLine).toContain('Office Supplies & Expenses');
    expect(trnsLine).toContain('45.00'); // positive = debit
    expect(splLine).toContain('Cash - Operating Account');
    expect(splLine).toContain('-45.00'); // negative = credit
    expect(lines).toContain('ENDTRNS');
  });

  it('skips a transaction with fewer than 2 lines rather than writing an invalid entry', () => {
    const entries = [entry(1, '2026-07-04', 'Broken', [{ accountId: CASH.id, debitCents: 100 }])];
    const iif = writeIif({ accounts: ACCOUNTS, postedJournalEntries: entries, customers: [], vendors: [] });
    const dataLines = iif.split('\r\n').filter((l) => !l.startsWith('!'));
    expect(dataLines.some((l) => l.startsWith('TRNS\t') || l === 'ENDTRNS')).toBe(false);
  });

  it('includes a CUST section only when there are customers, and a VEND section only when there are vendors', () => {
    const withNeither = writeIif({ accounts: ACCOUNTS, postedJournalEntries: [], customers: [], vendors: [] });
    expect(withNeither).not.toContain('!CUST');
    expect(withNeither).not.toContain('!VEND');

    const withBoth = writeIif({ accounts: ACCOUNTS, postedJournalEntries: [], customers: [contact(1, 'Acme Co')], vendors: [contact(2, 'Staples')] });
    expect(withBoth).toContain('!CUST');
    expect(withBoth).toContain('CUST\tAcme Co');
    expect(withBoth).toContain('!VEND');
    expect(withBoth).toContain('VEND\tStaples');
  });

  it('round-trips through parseIif: accounts and a balanced multi-line transaction survive intact', () => {
    const RENT = account(6, 'Rent / Lease', 'Expense');
    const entries = [
      entry(1, '2026-07-04', 'Split payment', [
        { accountId: SUPPLIES.id, debitCents: 3000 },
        { accountId: RENT.id, debitCents: 2000 },
        { accountId: CASH.id, creditCents: 5000 },
      ]),
    ];
    const iif = writeIif({ accounts: [...ACCOUNTS, RENT], postedJournalEntries: entries, customers: [], vendors: [] });
    const parsed = parseIif(iif);

    expect(parsed.warnings).toHaveLength(0);
    expect(parsed.accounts.map((a) => a.name)).toEqual(expect.arrayContaining(['Cash - Operating Account', 'Office Supplies & Expenses', 'Rent / Lease']));
    expect(parsed.transactions).toHaveLength(1);
    const [tx] = parsed.transactions;
    expect(tx.date).toBe('2026-07-04');
    expect(tx.balanced).toBe(true);
    expect(tx.lines).toHaveLength(3);
    const cashLine = tx.lines.find((l) => l.accountName === 'Cash - Operating Account')!;
    expect(cashLine.creditCents).toBe(5000);
  });
});
