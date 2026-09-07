import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry, JournalEntryLine } from '../types';
import { chequeRegister, parseChequeNumber } from './chequeRegister';

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

const BANK = acct(1, '1000', 'Chequing', 'Asset', 'Cash and Bank');
const RENT = acct(2, '5100', 'Rent', 'Expense');
const ACCOUNTS = [BANK, RENT];
const NAMES = new Map([[7, 'Jas Walia']]);

let nextId = 1;
function cheque(entryDate: string, number: string | null, cents: number, status: JournalEntry['status'] = 'posted', reference: string | null = null): JournalEntry {
  const id = nextId++;
  const lines: JournalEntryLine[] = [
    { id: id * 10, journalEntryId: id, accountId: RENT.id, debitCents: cents, creditCents: 0, description: null, lineOrder: 0, taxCode: null, manualHstCents: null, baseCents: null, clearedAt: null, reconciliationId: null, foreignCurrency: null, foreignAmountCents: null, vendorId: 7, customerId: null },
    { id: id * 10 + 1, journalEntryId: id, accountId: BANK.id, debitCents: 0, creditCents: cents, description: number, lineOrder: 1, taxCode: null, manualHstCents: null, baseCents: null, clearedAt: null, reconciliationId: null, foreignCurrency: null, foreignAmountCents: null, vendorId: 7, customerId: null },
  ] as JournalEntryLine[];
  return {
    id,
    entryDate,
    memo: null,
    reference,
    status,
    createdAt: entryDate,
    postedAt: status === 'posted' ? entryDate : null,
    periodFrom: null,
    periodTo: null,
    isAdjustingEntry: false,
    source: 'manual',
    sourceReference: null,
    lines,
  } as JournalEntry;
}

describe('parseChequeNumber', () => {
  it('reads the ways a cheque number actually appears', () => {
    expect(parseChequeNumber('CHQ#1043')).toBe(1043);
    expect(parseChequeNumber('Cheque 1043')).toBe(1043);
    expect(parseChequeNumber('chk 1043')).toBe(1043);
    expect(parseChequeNumber('CHECK #1043')).toBe(1043);
    expect(parseChequeNumber('1043')).toBe(1043);
    expect(parseChequeNumber('#1043')).toBe(1043);
  });

  it('refuses to read a number that is not a cheque number', () => {
    // A loose "any digits" rule would turn amounts, dates and invoice numbers into cheques and
    // fill the register with things that are not cheques at all.
    expect(parseChequeNumber('Rent for March 2025')).toBeNull();
    expect(parseChequeNumber('Invoice 4471 paid')).toBeNull();
    expect(parseChequeNumber('EFT 500.00')).toBeNull();
    expect(parseChequeNumber(null)).toBeNull();
    expect(parseChequeNumber('')).toBeNull();
  });
});

describe('chequeRegister', () => {
  it('lists cheques in number order with payee and amount', () => {
    const entries = [cheque('2025-03-10', 'CHQ#1002', 500_00), cheque('2025-03-01', 'CHQ#1001', 800_00)];
    const r = chequeRegister(ACCOUNTS, entries, '2025-01-01', '2025-12-31', NAMES);

    expect(r.cheques.map((c) => c.chequeNumber)).toEqual([1001, 1002]);
    expect(r.cheques[0].payee).toBe('Jas Walia');
    expect(r.totalCents).toBe(1_300_00);
  });

  it('finds the gap where a cheque was written but never entered', () => {
    const entries = [cheque('2025-03-01', '1001', 100_00), cheque('2025-03-02', '1004', 200_00)];
    const r = chequeRegister(ACCOUNTS, entries, '2025-01-01', '2025-12-31', NAMES);

    expect(r.gaps).toEqual([{ from: 1002, to: 1003, count: 2 }]);
  });

  it('collapses a long gap into one run rather than eight rows', () => {
    const entries = [cheque('2025-03-01', '1043', 100_00), cheque('2025-03-02', '1052', 200_00)];
    const r = chequeRegister(ACCOUNTS, entries, '2025-01-01', '2025-12-31', NAMES);

    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0]).toEqual({ from: 1044, to: 1051, count: 8 });
  });

  it('reports no gaps for an unbroken run', () => {
    const entries = [cheque('2025-03-01', '1001', 100_00), cheque('2025-03-02', '1002', 200_00), cheque('2025-03-03', '1003', 300_00)];
    expect(chequeRegister(ACCOUNTS, entries, '2025-01-01', '2025-12-31', NAMES).gaps).toEqual([]);
  });

  it('flags a number used twice', () => {
    const entries = [cheque('2025-03-01', '1001', 100_00), cheque('2025-03-05', '1001', 250_00)];
    expect(chequeRegister(ACCOUNTS, entries, '2025-01-01', '2025-12-31', NAMES).duplicates).toEqual([1001]);
  });

  it('lists a voided cheque but leaves it out of the total', () => {
    // A void is exactly what explains a gap, so it has to appear — but it moved no money.
    const entries = [cheque('2025-03-01', '1001', 100_00), cheque('2025-03-02', '1002', 500_00, 'void')];
    const r = chequeRegister(ACCOUNTS, entries, '2025-01-01', '2025-12-31', NAMES);

    expect(r.cheques).toHaveLength(2);
    expect(r.totalCents).toBe(100_00);
    expect(r.gaps).toEqual([]);
  });

  it('leaves drafts out entirely — they are not money yet', () => {
    const entries = [cheque('2025-03-01', '1001', 100_00, 'draft')];
    expect(chequeRegister(ACCOUNTS, entries, '2025-01-01', '2025-12-31', NAMES).cheques).toEqual([]);
  });

  it('falls back to the entry reference when the line has no number', () => {
    const entries = [cheque('2025-03-01', null, 100_00, 'posted', 'CHQ 1077')];
    expect(chequeRegister(ACCOUNTS, entries, '2025-01-01', '2025-12-31', NAMES).cheques[0].chequeNumber).toBe(1077);
  });

  it('ignores money going INTO the bank', () => {
    // A deposit referencing a cheque number is a cheque received, not one written.
    const id = 99;
    const deposit = {
      id,
      entryDate: '2025-03-01',
      memo: null,
      reference: 'CHQ 2001',
      status: 'posted',
      createdAt: '2025-03-01',
      postedAt: '2025-03-01',
      periodFrom: null,
      periodTo: null,
      isAdjustingEntry: false,
      source: 'manual',
      sourceReference: null,
      lines: [
        { id: 1, journalEntryId: id, accountId: BANK.id, debitCents: 400_00, creditCents: 0, description: 'CHQ 2001', lineOrder: 0, taxCode: null, manualHstCents: null, baseCents: null, clearedAt: null, reconciliationId: null, foreignCurrency: null, foreignAmountCents: null, vendorId: null, customerId: null },
      ],
    } as unknown as JournalEntry;

    expect(chequeRegister(ACCOUNTS, [deposit], '2025-01-01', '2025-12-31', NAMES).cheques).toEqual([]);
  });
});
