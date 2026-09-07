import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry } from '../types';
import { changesInEquity } from './changesInEquity';

function acct(id: number, name: string, accountType: Account['accountType'], accountSubtype: string): Account {
  return {
    id,
    code: String(1000 + id),
    name,
    accountType,
    accountSubtype,
    normalBalance: accountType === 'Asset' || accountType === 'Expense' ? 'Debit' : 'Credit',
    parentId: null,
    gifiCode: null,
    isActive: true,
    isSystem: false,
    description: null,
    accountNumber: null,
    isTransferEligible: false,
  } as Account;
}

let nextId = 1;
function entry(date: string, debitAccountId: number, creditAccountId: number, cents: number): JournalEntry {
  const id = nextId++;
  return {
    id,
    entryDate: date,
    memo: null,
    reference: null,
    status: 'posted',
    createdAt: date,
    postedAt: date,
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

const BANK = acct(1, 'Chequing', 'Asset', 'Cash and Bank');
const CAPITAL = acct(2, 'Share Capital', 'Equity', 'Share Capital');
const DRAWS = acct(3, "Owner's Draws", 'Equity', 'Equity');
const SALES = acct(4, 'Sales', 'Revenue', 'Revenue');
const RENT = acct(5, 'Rent', 'Expense', 'Operating Expense');
const ALL = [BANK, CAPITAL, DRAWS, SALES, RENT];

describe('changesInEquity', () => {
  it('carries opening equity forward and shows the period issue as the movement', () => {
    const entries = [
      entry('2024-05-01', BANK.id, CAPITAL.id, 1_000_00), // before the period
      entry('2025-03-10', BANK.id, CAPITAL.id, 500_00), // during it
    ];
    const r = changesInEquity(ALL, entries, '2025-01-01', '2025-12-31');
    const capital = r.rows.find((x) => x.label === 'Share Capital')!;

    expect(capital.openingCents).toBe(1_000_00);
    expect(capital.movementCents).toBe(500_00);
    expect(capital.closingCents).toBe(1_500_00);
  });

  it("shows an owner's draw as equity going down", () => {
    // Draws are debited, so against a credit-normal equity account the balance falls.
    const r = changesInEquity(ALL, [entry('2025-04-01', DRAWS.id, BANK.id, 300_00)], '2025-01-01', '2025-12-31');
    const draws = r.rows.find((x) => x.label === "Owner's Draws")!;

    expect(draws.movementCents).toBe(-300_00);
    expect(r.totalClosingCents).toBe(-300_00);
  });

  it('reports the period profit as a movement, not as opening equity', () => {
    // No closing entry is ever posted, so without this the statement would claim equity was flat
    // in a year the business made money.
    const entries = [
      entry('2024-08-01', BANK.id, SALES.id, 2_000_00), // last year's profit
      entry('2025-06-01', BANK.id, SALES.id, 900_00),
      entry('2025-06-02', RENT.id, BANK.id, 400_00),
    ];
    const r = changesInEquity(ALL, entries, '2025-01-01', '2025-12-31');
    const retained = r.rows.find((x) => x.isDerived)!;

    expect(retained.openingCents).toBe(2_000_00); // earned before the period opened
    expect(retained.movementCents).toBe(500_00); // 900 earned less 400 spent
    expect(retained.closingCents).toBe(2_500_00);
    expect(r.netIncomeCents).toBe(500_00);
  });

  it('keeps opening plus movement equal to closing on every row and in total', () => {
    const entries = [
      entry('2024-01-01', BANK.id, CAPITAL.id, 5_000_00),
      entry('2025-02-01', BANK.id, CAPITAL.id, 2_000_00),
      entry('2025-03-01', DRAWS.id, BANK.id, 1_200_00),
      entry('2025-04-01', BANK.id, SALES.id, 3_000_00),
      entry('2025-05-01', RENT.id, BANK.id, 800_00),
    ];
    const r = changesInEquity(ALL, entries, '2025-01-01', '2025-12-31');

    for (const row of r.rows) {
      expect(row.openingCents + row.movementCents).toBe(row.closingCents);
    }
    expect(r.totalOpeningCents + r.totalMovementCents).toBe(r.totalClosingCents);
    expect(r.totalClosingCents).toBe(5_000_00 + 2_000_00 - 1_200_00 + 3_000_00 - 800_00);
  });

  it('leaves out equity accounts that were nil the whole way through', () => {
    const r = changesInEquity(ALL, [entry('2025-04-01', DRAWS.id, BANK.id, 100_00)], '2025-01-01', '2025-12-31');
    expect(r.rows.map((x) => x.label)).not.toContain('Share Capital');
  });
});
