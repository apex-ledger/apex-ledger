import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry, JournalEntryLine } from '../types';
import { diffJournalEntry, isReclassificationOnly, netAmountChangeCents } from './journalEntryDiff';

function acct(id: number, code: string, name: string): Account {
  return {
    id,
    code,
    name,
    accountType: 'Expense',
    accountSubtype: 'Operating Expense',
    normalBalance: 'Debit',
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
  } as Account;
}

const RENT = acct(1, '5100', 'Rent');
const REPAIRS = acct(2, '5200', 'Repairs');
const BANK = acct(3, '1000', 'Chequing');
const ACCOUNTS = [RENT, REPAIRS, BANK];

function line(accountId: number, debitCents: number, creditCents: number, extra: Partial<JournalEntryLine> = {}): JournalEntryLine {
  return {
    id: 0,
    journalEntryId: 1,
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
    ...extra,
  } as JournalEntryLine;
}

function entry(lines: JournalEntryLine[], overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 1,
    entryDate: '2025-03-31',
    memo: 'Client supplied',
    reference: null,
    status: 'draft',
    createdAt: '2025-03-31',
    postedAt: null,
    periodFrom: null,
    periodTo: null,
    isAdjustingEntry: false,
    source: 'manual',
    sourceReference: null,
    lines: lines.map((l, i) => ({ ...l, lineOrder: i })),
    ...overrides,
  } as JournalEntry;
}

describe('diffJournalEntry', () => {
  it('finds nothing when the accountant changed nothing', () => {
    const e = entry([line(RENT.id, 1_000_00, 0), line(BANK.id, 0, 1_000_00)]);
    expect(diffJournalEntry(e, e, ACCOUNTS)).toEqual([]);
  });

  it('reports a corrected amount with both the old and new figure', () => {
    // The client typed 1,000; the invoice says 1,200.
    const before = entry([line(RENT.id, 1_000_00, 0), line(BANK.id, 0, 1_000_00)]);
    const after = entry([line(RENT.id, 1_200_00, 0), line(BANK.id, 0, 1_200_00)]);
    const changes = diffJournalEntry(before, after, ACCOUNTS);

    const debit = changes.find((c) => c.field === 'line.debitCents')!;
    expect(debit.oldValue).toBe('1000.00');
    expect(debit.newValue).toBe('1200.00');
    expect(debit.kind).toBe('changed');
    expect(netAmountChangeCents(before, after)).toBe(200_00);
  });

  it('reports a reclassification by name, and says the total did not move', () => {
    // The client booked a repair as rent. Same money, wrong account.
    const before = entry([line(RENT.id, 500_00, 0), line(BANK.id, 0, 500_00)]);
    const after = entry([line(REPAIRS.id, 500_00, 0), line(BANK.id, 0, 500_00)]);
    const changes = diffJournalEntry(before, after, ACCOUNTS);

    const account = changes.find((c) => c.field === 'line.accountId')!;
    expect(account.oldValue).toBe('Rent');
    expect(account.newValue).toBe('Repairs');

    const net = netAmountChangeCents(before, after);
    expect(net).toBe(0);
    expect(isReclassificationOnly(changes, net)).toBe(true);
  });

  it('does not call a changed amount a reclassification', () => {
    const before = entry([line(RENT.id, 500_00, 0), line(BANK.id, 0, 500_00)]);
    const after = entry([line(RENT.id, 900_00, 0), line(BANK.id, 0, 900_00)]);
    const changes = diffJournalEntry(before, after, ACCOUNTS);
    expect(isReclassificationOnly(changes, netAmountChangeCents(before, after))).toBe(false);
  });

  it('reports a line the accountant added and one they took out', () => {
    const before = entry([line(RENT.id, 500_00, 0), line(BANK.id, 0, 500_00)]);
    const after = entry([
      line(RENT.id, 500_00, 0),
      line(BANK.id, 0, 500_00),
      line(REPAIRS.id, 120_00, 0),
    ]);
    const added = diffJournalEntry(before, after, ACCOUNTS).find((c) => c.kind === 'added')!;
    expect(added.label).toBe('Line added');
    expect(added.newValue).toContain('Repairs');
    expect(added.newValue).not.toContain('5200');

    const removed = diffJournalEntry(after, before, ACCOUNTS).find((c) => c.kind === 'removed')!;
    expect(removed.label).toBe('Line removed');
    expect(removed.oldValue).toContain('Repairs');
    expect(removed.oldValue).not.toContain('5200');
  });

  it('picks up the date, memo, and the adjusting-entry flag', () => {
    const before = entry([line(RENT.id, 100_00, 0)]);
    const after = entry([line(RENT.id, 100_00, 0)], {
      entryDate: '2025-04-01',
      memo: 'Corrected per lease',
      isAdjustingEntry: true,
      source: 'manual',
      sourceReference: null,
    });
    const changes = diffJournalEntry(before, after, ACCOUNTS);
    const fields = changes.map((c) => c.field);

    expect(fields).toContain('entryDate');
    expect(fields).toContain('memo');
    expect(fields).toContain('isAdjustingEntry');
    expect(changes.find((c) => c.field === 'isAdjustingEntry')?.newValue).toBe('Yes');
  });

  it('treats null and empty text as the same, so no change is invented', () => {
    const before = entry([line(RENT.id, 100_00, 0, { description: null })]);
    const after = entry([line(RENT.id, 100_00, 0, { description: '' })]);
    expect(diffJournalEntry(before, after, ACCOUNTS)).toEqual([]);
  });

  it('still names an account that has since been deleted', () => {
    // The report has to render months later; an account may be gone by then.
    const before = entry([line(99, 100_00, 0)]);
    const after = entry([line(RENT.id, 100_00, 0)]);
    const change = diffJournalEntry(before, after, ACCOUNTS).find((c) => c.field === 'line.accountId')!;
    expect(change.oldValue).toBe('Unknown account');
  });

  it('reports a tax code correction', () => {
    const before = entry([line(RENT.id, 100_00, 0, { taxCode: 'NonHST' })]);
    const after = entry([line(RENT.id, 100_00, 0, { taxCode: 'HST' })]);
    const change = diffJournalEntry(before, after, ACCOUNTS).find((c) => c.field === 'line.taxCode')!;
    expect(change.oldValue).toBe('NonHST');
    expect(change.newValue).toBe('HST');
  });
});
