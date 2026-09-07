import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../types';
import { bestContraAccount, suggestContraAccounts } from './suggestContraAccount';

const BANK = 1;
const RENT = 2;
const SALES = 3;
const CARD = 4;
const REPAIRS = 5;

let nextId = 1;
/** One posted two-line entry: debit one account, credit another. */
function entry(debitAccountId: number, creditAccountId: number, cents = 100_00, status: JournalEntry['status'] = 'posted'): JournalEntry {
  const id = nextId++;
  return {
    id,
    entryDate: '2025-03-01',
    memo: null,
    reference: null,
    status,
    createdAt: '2025-03-01',
    postedAt: '2025-03-01',
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

describe('suggestContraAccounts', () => {
  it('learns the habitual pairing from posted history', () => {
    // Rent has been paid from the bank three times.
    const entries = [entry(RENT, BANK), entry(RENT, BANK), entry(RENT, BANK)];
    const [top] = suggestContraAccounts(entries, RENT, 'debit');

    expect(top.accountId).toBe(BANK);
    expect(top.count).toBe(3);
    expect(top.confidence).toBe(1);
  });

  it('keeps the two directions apart', () => {
    // Money out of the bank pays rent; money into the bank is a sale. Asking about the bank on the
    // credit side must not answer with what happens when it is debited.
    const entries = [entry(RENT, BANK), entry(RENT, BANK), entry(BANK, SALES), entry(BANK, SALES)];

    expect(suggestContraAccounts(entries, BANK, 'credit')[0].accountId).toBe(RENT);
    expect(suggestContraAccounts(entries, BANK, 'debit')[0].accountId).toBe(SALES);
  });

  it('ranks by how often each pairing happened', () => {
    const entries = [entry(RENT, BANK), entry(RENT, BANK), entry(RENT, BANK), entry(RENT, CARD)];
    const ranked = suggestContraAccounts(entries, RENT, 'debit');

    expect(ranked.map((r) => r.accountId)).toEqual([BANK, CARD]);
    expect(ranked[0].confidence).toBeCloseTo(0.75);
  });

  it('ignores entries that were never posted', () => {
    const entries = [entry(RENT, BANK, 100_00, 'draft'), entry(RENT, BANK, 100_00, 'void')];
    expect(suggestContraAccounts(entries, RENT, 'debit')).toEqual([]);
  });

  it('learns nothing from entries with more than two lines', () => {
    // A payroll entry pairs nothing meaningfully — every debit faces every credit — so counting it
    // would swamp the real pairings.
    const multi = entry(RENT, BANK);
    multi.lines.push({ ...multi.lines[1], id: 999, accountId: REPAIRS });
    expect(suggestContraAccounts([multi], RENT, 'debit')).toEqual([]);
  });

  it('returns nothing for an account with no history', () => {
    expect(suggestContraAccounts([entry(RENT, BANK)], REPAIRS, 'debit')).toEqual([]);
  });
});

describe('bestContraAccount', () => {
  it('suggests the usual pairing once it has really been the habit', () => {
    const entries = [entry(RENT, BANK), entry(RENT, BANK)];
    expect(bestContraAccount(entries, RENT, 'debit')?.accountId).toBe(BANK);
  });

  it('stays quiet after a single occurrence', () => {
    // One prior entry is a coincidence, not a habit, and a wrong suggestion that gets accepted
    // without thinking is worse than none.
    expect(bestContraAccount([entry(RENT, BANK)], RENT, 'debit')).toBeNull();
  });

  it('stays quiet when the history is genuinely mixed', () => {
    // Three different contras, none of them the usual choice: 2/6 each is not a recommendation.
    const entries = [
      entry(RENT, BANK), entry(RENT, BANK),
      entry(RENT, CARD), entry(RENT, CARD),
      entry(RENT, SALES), entry(RENT, SALES),
    ];
    expect(bestContraAccount(entries, RENT, 'debit')).toBeNull();
  });

  it('speaks up again once one pairing clearly dominates', () => {
    const entries = [entry(RENT, BANK), entry(RENT, BANK), entry(RENT, BANK), entry(RENT, CARD)];
    expect(bestContraAccount(entries, RENT, 'debit')?.accountId).toBe(BANK);
  });
});
