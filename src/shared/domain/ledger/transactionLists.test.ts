import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry, JournalEntryLine } from '../types';
import { invalidTransactions, journalReport } from './transactionLists';

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
function line(accountId: number, debitCents: number, creditCents: number, extra: Partial<JournalEntryLine> = {}): JournalEntryLine {
  return {
    id: 0,
    journalEntryId: 0,
    accountId,
    debitCents,
    creditCents,
    description: null,
    lineOrder: 0,
    taxCode: null,
    manualHstCents: null,
    baseCents: null,
    clearedAt: null,
    reconciliationId: null,
    foreignCurrency: null,
    foreignAmountCents: null,
    customerId: null,
    vendorId: null,
    ...extra,
  } as JournalEntryLine;
}

function entry(entryDate: string, lines: JournalEntryLine[], status: JournalEntry['status'] = 'posted'): JournalEntry {
  const id = nextId++;
  return {
    id,
    entryDate,
    memo: null,
    reference: null,
    status,
    createdAt: entryDate,
    postedAt: status === 'posted' ? entryDate : null,
    periodFrom: null,
    periodTo: null,
    isAdjustingEntry: false,
    source: 'manual',
    sourceReference: null,
    lines: lines.map((l, i) => ({ ...l, journalEntryId: id, id: id * 100 + i, lineOrder: i })),
  } as JournalEntry;
}

describe('journalReport', () => {
  it('lists entries in date order with both sides of each', () => {
    const entries = [
      entry('2025-03-20', [line(RENT.id, 400_00, 0), line(BANK.id, 0, 400_00)]),
      entry('2025-03-02', [line(BANK.id, 500_00, 0), line(SALES.id, 0, 500_00)]),
    ];
    const r = journalReport(ACCOUNTS, entries, '2025-03-01', '2025-03-31');

    expect(r.entries.map((e) => e.entryDate)).toEqual(['2025-03-02', '2025-03-20']);
    expect(r.entries[0].lines).toHaveLength(2);
    expect(r.entries[0].lines[0].accountName).toBe('Chequing');
  });

  it('carries the entry creator into the report for multi-user review', () => {
    const created = entry('2025-03-02', [line(BANK.id, 500_00, 0), line(SALES.id, 0, 500_00)]);
    created.createdBy = 'Asha Patel';
    const result = journalReport(ACCOUNTS, [created], '2025-03-01', '2025-03-31');
    expect(result.entries[0].createdBy).toBe('Asha Patel');
  });

  it('shows drafts and voids but leaves them out of the totals', () => {
    // They belong in a listing of what was entered, but they move no balance, so counting them
    // would make this disagree with the trial balance.
    const entries = [
      entry('2025-03-02', [line(BANK.id, 500_00, 0), line(SALES.id, 0, 500_00)]),
      entry('2025-03-03', [line(BANK.id, 900_00, 0), line(SALES.id, 0, 900_00)], 'draft'),
      entry('2025-03-04', [line(BANK.id, 700_00, 0), line(SALES.id, 0, 700_00)], 'void'),
    ];
    const r = journalReport(ACCOUNTS, entries, '2025-03-01', '2025-03-31');

    expect(r.entries).toHaveLength(3);
    expect(r.totalDebitCents).toBe(500_00);
    expect(r.totalCreditCents).toBe(500_00);
  });

  it('can be restricted to posted entries only', () => {
    const entries = [
      entry('2025-03-02', [line(BANK.id, 500_00, 0), line(SALES.id, 0, 500_00)]),
      entry('2025-03-03', [line(BANK.id, 900_00, 0), line(SALES.id, 0, 900_00)], 'draft'),
    ];
    const r = journalReport(ACCOUNTS, entries, '2025-03-01', '2025-03-31', new Map(), { postedOnly: true });
    expect(r.entries).toHaveLength(1);
  });

  it('still names an account that has been deleted since', () => {
    const r = journalReport(ACCOUNTS, [entry('2025-03-02', [line(99, 10_00, 0), line(BANK.id, 0, 10_00)])], '2025-03-01', '2025-03-31');
    expect(r.entries[0].lines[0].accountName).toBe('Unknown account');
  });

  it('attaches the contact name to a line that carries one', () => {
    const names = new Map([[7, 'Rasta Pasta']]);
    const r = journalReport(
      ACCOUNTS,
      [entry('2025-03-02', [line(BANK.id, 50_00, 0), line(SALES.id, 0, 50_00, { customerId: 7 })])],
      '2025-03-01',
      '2025-03-31',
      names,
    );
    expect(r.entries[0].lines[1].contactName).toBe('Rasta Pasta');
  });

  it('respects the period', () => {
    const entries = [entry('2025-02-28', [line(BANK.id, 100_00, 0), line(SALES.id, 0, 100_00)])];
    expect(journalReport(ACCOUNTS, entries, '2025-03-01', '2025-03-31').entries).toEqual([]);
  });
});

describe('invalidTransactions', () => {
  it('limits integrity findings to the selected report period', () => {
    const before = entry('2025-02-28', [line(BANK.id, 100_00, 0)]);
    const inside = entry('2025-03-15', [line(BANK.id, 200_00, 0)]);
    const after = entry('2025-04-01', [line(BANK.id, 300_00, 0)]);
    expect(invalidTransactions(ACCOUNTS, [before, inside, after], '2025-03-01', '2025-03-31').map((row) => row.entryId)).toEqual([inside.id]);
  });

  it('finds nothing wrong with ordinary entries', () => {
    const entries = [entry('2025-03-02', [line(BANK.id, 500_00, 0), line(SALES.id, 0, 500_00)])];
    expect(invalidTransactions(ACCOUNTS, entries)).toEqual([]);
  });

  it('catches an entry whose debits do not equal its credits', () => {
    const entries = [entry('2025-03-02', [line(BANK.id, 500_00, 0), line(SALES.id, 0, 300_00)])];
    expect(invalidTransactions(ACCOUNTS, entries)[0].reasons).toContain('unbalanced');
  });

  it('catches a one-sided entry, an empty one, and an all-zero one', () => {
    const single = entry('2025-03-02', [line(BANK.id, 500_00, 0)]);
    const empty = entry('2025-03-03', []);
    const zeroes = entry('2025-03-04', [line(BANK.id, 0, 0), line(SALES.id, 0, 0)]);
    const found = invalidTransactions(ACCOUNTS, [single, empty, zeroes]);

    expect(found.find((f) => f.entryId === single.id)?.reasons).toContain('single-line');
    expect(found.find((f) => f.entryId === empty.id)?.reasons).toContain('no-lines');
    expect(found.find((f) => f.entryId === zeroes.id)?.reasons).toContain('zero-amount');
  });

  it('catches a line carrying both a debit and a credit', () => {
    const entries = [entry('2025-03-02', [line(BANK.id, 100_00, 100_00), line(SALES.id, 0, 0)])];
    expect(invalidTransactions(ACCOUNTS, entries)[0].reasons).toContain('both-sides-on-one-line');
  });

  it('catches a line pointing at an account that no longer exists', () => {
    const entries = [entry('2025-03-02', [line(99, 100_00, 0), line(BANK.id, 0, 100_00)])];
    expect(invalidTransactions(ACCOUNTS, entries)[0].reasons).toContain('missing-account');
  });

  it('leaves voided entries alone', () => {
    // A void is a deliberate reversal, not a defect.
    const entries = [entry('2025-03-02', [line(BANK.id, 500_00, 0), line(SALES.id, 0, 300_00)], 'void')];
    expect(invalidTransactions(ACCOUNTS, entries)).toEqual([]);
  });

  it('puts posted problems ahead of draft ones', () => {
    // A broken posted entry is affecting real balances; a half-typed draft is not.
    const draft = entry('2025-03-01', [line(BANK.id, 100_00, 0)], 'draft');
    const posted = entry('2025-03-09', [line(BANK.id, 100_00, 0)]);
    const found = invalidTransactions(ACCOUNTS, [draft, posted]);
    expect(found[0].status).toBe('posted');
  });
});
