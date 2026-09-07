import { describe, expect, it } from 'vitest';
import type { NewCreditNoteLineInput } from '../types';
import {
  buildCustomerCreditNoteJournalLines,
  buildCustomerRefundJournalLines,
  buildVendorCreditJournalLines,
  buildVendorRefundJournalLines,
} from './buildCreditNoteJournalLines';

const AR = 42;
const AP = 43;
const HST_PAYABLE = 10;
const HST_RECOVERABLE = 11;
const REVENUE = 100;
const EXPENSE = 200;
const BANK = 1;

function line(overrides: Partial<NewCreditNoteLineInput> = {}): NewCreditNoteLineInput {
  return { description: 'Returned goods', quantity: 1, unitPriceCents: 10000, categoryAccountId: REVENUE, ...overrides };
}

function totals(lines: { debitCents: number; creditCents: number }[]) {
  return {
    debits: lines.reduce((sum, l) => sum + l.debitCents, 0),
    credits: lines.reduce((sum, l) => sum + l.creditCents, 0),
  };
}

describe('buildCustomerCreditNoteJournalLines', () => {
  it('debits revenue and GST/HST Payable, crediting AR for the full amount', () => {
    const { lines, totalCents } = buildCustomerCreditNoteJournalLines(AR, HST_PAYABLE, [line({ taxCode: 'HST' })], [10000]);

    expect(totalCents).toBe(11300);
    expect(lines[0]).toMatchObject({ accountId: REVENUE, debitCents: 10000, creditCents: 0, taxCode: 'HST' });
    expect(lines[1]).toMatchObject({ accountId: HST_PAYABLE, debitCents: 1300, creditCents: 0 });
    expect(lines[2]).toMatchObject({ accountId: AR, debitCents: 0, creditCents: 11300 });
    const { debits, credits } = totals(lines);
    expect(debits).toBe(credits);
  });

  it('balances across several lines with mixed tax treatment', () => {
    const { lines, totalCents } = buildCustomerCreditNoteJournalLines(
      AR,
      HST_PAYABLE,
      [line({ taxCode: 'HST' }), line({ taxCode: 'NonHST', categoryAccountId: 101 })],
      [10000, 5000],
    );

    expect(totalCents).toBe(16300); // 11,300 + 5,000
    const { debits, credits } = totals(lines);
    expect(debits).toBe(credits);
  });

  it('refuses the meals & entertainment code on the customer side', () => {
    expect(() => buildCustomerCreditNoteJournalLines(AR, HST_PAYABLE, [line({ taxCode: 'MealsHST' })], [10000])).toThrow('purchases only');
  });

  it('rejects an empty or non-positive line', () => {
    expect(() => buildCustomerCreditNoteJournalLines(AR, HST_PAYABLE, [], [])).toThrow('at least one line');
    expect(() => buildCustomerCreditNoteJournalLines(AR, HST_PAYABLE, [line()], [0])).toThrow('positive amount');
  });
});

describe('buildVendorCreditJournalLines', () => {
  it('debits AP and credits the expense plus the recoverable tax', () => {
    const { lines, totalCents } = buildVendorCreditJournalLines(AP, HST_RECOVERABLE, [line({ taxCode: 'HST', categoryAccountId: EXPENSE })], [10000]);

    expect(totalCents).toBe(11300);
    expect(lines[0]).toMatchObject({ accountId: AP, debitCents: 11300, creditCents: 0 });
    expect(lines[1]).toMatchObject({ accountId: EXPENSE, debitCents: 0, creditCents: 10000 });
    expect(lines[2]).toMatchObject({ accountId: HST_RECOVERABLE, debitCents: 0, creditCents: 1300 });
    const { debits, credits } = totals(lines);
    expect(debits).toBe(credits);
  });

  it('keeps the restricted half of meals tax in the expense account, mirroring the original bill', () => {
    // $100 meal + $13 HST: only $6.50 was ever claimable, so only $6.50 comes back out of the
    // recoverable account — the other $6.50 was a real cost and reverses through the expense.
    const { lines, totalCents } = buildVendorCreditJournalLines(AP, HST_RECOVERABLE, [line({ taxCode: 'MealsHST', categoryAccountId: EXPENSE })], [10000]);

    expect(totalCents).toBe(11300);
    expect(lines[1]).toMatchObject({ accountId: EXPENSE, creditCents: 10650 });
    expect(lines[2]).toMatchObject({ accountId: HST_RECOVERABLE, creditCents: 650 });
    const { debits, credits } = totals(lines);
    expect(debits).toBe(credits);
  });

  it('leaves no separate tax line when the tax is entirely non-recoverable', () => {
    const { lines, totalCents } = buildVendorCreditJournalLines(AP, HST_RECOVERABLE, [line({ taxCode: 'USTax', categoryAccountId: EXPENSE })], [10000]);

    expect(totalCents).toBe(10800);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ accountId: EXPENSE, creditCents: 10800 });
  });
});

describe('refunds', () => {
  it('moves cash only — a customer refund clears AR against the bank', () => {
    const lines = buildCustomerRefundJournalLines(AR, BANK, 11300, 'Refund — CN-0001');
    expect(lines[0]).toMatchObject({ accountId: AR, debitCents: 11300 });
    expect(lines[1]).toMatchObject({ accountId: BANK, creditCents: 11300 });
    const { debits, credits } = totals(lines);
    expect(debits).toBe(credits);
  });

  it('banks a vendor refund against AP', () => {
    const lines = buildVendorRefundJournalLines(AP, BANK, 11300, 'Refund — VC-0001');
    expect(lines[0]).toMatchObject({ accountId: BANK, debitCents: 11300 });
    expect(lines[1]).toMatchObject({ accountId: AP, creditCents: 11300 });
    const { debits, credits } = totals(lines);
    expect(debits).toBe(credits);
  });

  it('rejects a zero or negative refund', () => {
    expect(() => buildCustomerRefundJournalLines(AR, BANK, 0, 'x')).toThrow('positive amount');
    expect(() => buildVendorRefundJournalLines(AP, BANK, -1, 'x')).toThrow('positive amount');
  });
});
