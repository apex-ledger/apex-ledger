import { describe, expect, it } from 'vitest';
import type { Account, FiscalPeriod, NewJournalEntryLineInput } from '../types';
import { isDateInLockedPeriod, validateJournalEntryForPosting } from './postJournalEntry';

const accounts = [
  { id: 1, name: 'Checking Account' },
  { id: 2, name: 'Cost of Goods Sold' },
] as Account[];

/** A tax-coded category line with no split — the pre-split shape, whose tax the return derives
 * from the amount. Changes the return. */
const lines: NewJournalEntryLineInput[] = [
  { accountId: 2, debitCents: 11300, creditCents: 0, taxCode: 'HST' },
  { accountId: 1, debitCents: 0, creditCents: 11300, taxCode: null },
];

/** No tax anywhere: a transfer, a payment, payroll. Never touches the return. */
const nonTaxLines: NewJournalEntryLineInput[] = [
  { accountId: 2, debitCents: 11300, creditCents: 0, taxCode: null },
  { accountId: 1, debitCents: 0, creditCents: 11300, taxCode: null },
];

/** The split builder's shape with the tax set to zero: the code stays on the line, baseCents is
 * recorded, and there is no control-account line. Nothing for the return to pick up. */
const splitZeroTaxLines: NewJournalEntryLineInput[] = [
  { accountId: 2, debitCents: 11300, creditCents: 0, taxCode: 'HST', baseCents: 11300 },
  { accountId: 1, debitCents: 0, creditCents: 11300, taxCode: null },
];

const filedMarker: FiscalPeriod = {
  id: 62,
  periodStart: '2026-07-01',
  periodEnd: '2026-09-30',
  label: 'GST/HST filed — 2026-07-01 to 2026-09-30',
  isLocked: true,
  lockedAt: '2026-08-29T12:00:00Z',
};

const accountantLock: FiscalPeriod = {
  id: 63,
  periodStart: '2026-07-01',
  periodEnd: '2026-09-30',
  label: 'Q3 accountant close',
  isLocked: true,
  lockedAt: '2026-08-29T13:00:00Z',
};

describe('accountant-only fiscal period locks', () => {
  it('allows posting by date inside a filed Sales Tax marker when nothing on the entry reaches the return', () => {
    expect(isDateInLockedPeriod('2026-08-14', [filedMarker])).toBeUndefined();
    expect(validateJournalEntryForPosting({ entryDate: '2026-08-14', lines: nonTaxLines }, accounts, [filedMarker])).toEqual({
      ok: true,
      data: { totalDebitCents: 11300, totalCreditCents: 11300 },
    });
  });

  it('refuses a tax-coded line with no split inside a filed return, because the return derives its tax from the amount', () => {
    const result = validateJournalEntryForPosting({ entryDate: '2026-08-14', lines }, accounts, [filedMarker]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/reopen that return/i);
  });

  it('still posts a split-era line whose tax was set to zero — the return would not change', () => {
    expect(validateJournalEntryForPosting({ entryDate: '2026-08-14', lines: splitZeroTaxLines }, accounts, [filedMarker]).ok).toBe(true);
  });

  it('still blocks an accountant lock even when it overlaps a filed return marker', () => {
    expect(isDateInLockedPeriod('2026-08-14', [filedMarker, accountantLock])).toEqual(accountantLock);
    expect(validateJournalEntryForPosting({ entryDate: '2026-08-14', lines }, accounts, [filedMarker, accountantLock])).toEqual({
      ok: false,
      error: 'Cannot post to 2026-08-14: fiscal period "Q3 accountant close" is locked by an accountant.',
    });
  });
});
