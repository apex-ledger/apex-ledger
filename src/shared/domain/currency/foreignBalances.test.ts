import { describe, expect, it } from 'vitest';
import type { Account, JournalEntry } from '../types';
import { computeForeignBalances } from './foreignBalances';

const usdBank: Account = { id: 1, code: '1050', name: 'USD Chequing', accountType: 'Asset', accountSubtype: 'Cash and Bank', normalBalance: 'Debit', parentId: null, gifiCode: null, isActive: true, isSystem: false, description: null, accountNumber: null, isTransferEligible: false, currency: 'USD' };
const cadBank: Account = { ...usdBank, id: 2, code: '1000', name: 'Chequing', currency: 'CAD' };
const usdCard: Account = { ...usdBank, id: 3, code: '2055', name: 'USD Visa', accountType: 'Liability', normalBalance: 'Credit' };

function entry(id: number, date: string, lines: Array<Partial<JournalEntry['lines'][number]> & { accountId: number; debitCents: number; creditCents: number }>, status: JournalEntry['status'] = 'posted'): JournalEntry {
  return {
    id, entryDate: date, memo: null, reference: null, status, createdAt: `${date} 12:00:00`, postedAt: null, lines: lines.map((l, i) => ({ id: id * 10 + i, journalEntryId: id, lineOrder: i, description: null, taxCode: null, manualHstCents: null, baseCents: null, vendorId: null, customerId: null, foreignCurrency: null, foreignAmountCents: null, exchangeRate: null, reconciliationId: null, clearedAt: null, ...l } as JournalEntry['lines'][number])),
    periodFrom: null, periodTo: null, isAdjustingEntry: false, source: 'manual', sourceReference: null,
  } as JournalEntry;
}

describe('foreign balances', () => {
  it('sums the foreign amounts on a foreign account and ignores CAD accounts', () => {
    const entries = [
      entry(1, '2026-01-10', [{ accountId: 1, debitCents: 135_000, creditCents: 0, foreignCurrency: 'USD', foreignAmountCents: 100_000, exchangeRate: 1.35 }, { accountId: 2, debitCents: 0, creditCents: 135_000 }]),
      entry(2, '2026-02-01', [{ accountId: 1, debitCents: 0, creditCents: 41_400, foreignCurrency: 'USD', foreignAmountCents: 30_000, exchangeRate: 1.38 }, { accountId: 2, debitCents: 41_400, creditCents: 0 }]),
    ];
    expect(computeForeignBalances([usdBank, cadBank], entries)).toEqual([{ accountId: 1, currency: 'USD', foreignCents: 70_000, cadCents: 93_600 }]);
  });

  it('respects the as-of date, skips drafts and voids, and handles a credit-normal card', () => {
    const entries = [
      entry(1, '2026-01-10', [{ accountId: 3, debitCents: 0, creditCents: 27_000, foreignCurrency: 'USD', foreignAmountCents: 20_000, exchangeRate: 1.35 }, { accountId: 2, debitCents: 27_000, creditCents: 0 }]),
      entry(2, '2026-03-01', [{ accountId: 3, debitCents: 13_800, creditCents: 0, foreignCurrency: 'USD', foreignAmountCents: 10_000, exchangeRate: 1.38 }, { accountId: 2, debitCents: 0, creditCents: 13_800 }]),
      entry(3, '2026-01-15', [{ accountId: 3, debitCents: 0, creditCents: 99_000, foreignCurrency: 'USD', foreignAmountCents: 70_000, exchangeRate: 1.4 }, { accountId: 2, debitCents: 99_000, creditCents: 0 }], 'void'),
    ];
    expect(computeForeignBalances([usdCard, cadBank], entries, '2026-01-31')).toEqual([{ accountId: 3, currency: 'USD', foreignCents: 20_000, cadCents: 27_000 }]);
    expect(computeForeignBalances([usdCard, cadBank], entries)[0].foreignCents).toBe(10_000);
  });
});
