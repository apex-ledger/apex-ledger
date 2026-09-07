import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../types';
import { computeProvincialSalesTax } from './provincialSalesTax';

function entry(id: number, date: string, lines: Array<Partial<JournalEntry['lines'][number]> & { accountId: number; debitCents: number; creditCents: number }>): JournalEntry {
  return {
    id, entryDate: date, memo: `E${id}`, reference: null, status: 'posted', createdAt: `${date} 12:00:00`, postedAt: null,
    lines: lines.map((l, i) => ({ id: id * 10 + i, journalEntryId: id, lineOrder: i, description: null, taxCode: null, manualHstCents: null, baseCents: null, vendorId: null, customerId: null, foreignCurrency: null, foreignAmountCents: null, exchangeRate: null, reconciliationId: null, clearedAt: null, ...l } as JournalEntry['lines'][number])),
    periodFrom: null, periodTo: null, isAdjustingEntry: false, source: 'manual', sourceReference: null,
  } as JournalEntry;
}

describe('provincial sales tax return', () => {
  it('collects PST on BC sales and ignores PST paid on BC purchases', () => {
    const entries = [
      entry(1, '2026-09-05', [{ accountId: 1200, debitCents: 11_200, creditCents: 0 }, { accountId: 4000, debitCents: 0, creditCents: 10_000, taxCode: 'GST_PST_BC', baseCents: 10_000 }]),
      entry(2, '2026-09-06', [{ accountId: 5040, debitCents: 5_350, creditCents: 0, taxCode: 'GST_PST_BC', baseCents: 5_000 }, { accountId: 1000, debitCents: 0, creditCents: 5_600 }]),
    ];
    const result = computeProvincialSalesTax(entries, '2026-09-01', '2026-09-30');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ province: 'BC', taxName: 'PST', taxableSalesCents: 10_000, collectedCents: 700, taxablePurchasesCents: 0, refundableCents: 0, netCents: 700 });
  });

  it('nets QST collected against QST refunds for a Quebec registrant, and keeps provinces apart', () => {
    const entries = [
      entry(1, '2026-09-05', [{ accountId: 1200, debitCents: 11_498, creditCents: 0 }, { accountId: 4000, debitCents: 0, creditCents: 10_000, taxCode: 'GST_QST_QC', baseCents: 10_000 }]),
      entry(2, '2026-09-06', [{ accountId: 5040, debitCents: 4_000, creditCents: 0, taxCode: 'GST_QST_QC', baseCents: 4_000 }, { accountId: 1000, debitCents: 0, creditCents: 4_599 }]),
      entry(3, '2026-09-07', [{ accountId: 1200, debitCents: 2_140, creditCents: 0 }, { accountId: 4000, debitCents: 0, creditCents: 2_000, taxCode: 'GST_RST_MB', baseCents: 2_000 }]),
      entry(4, '2026-10-01', [{ accountId: 1200, debitCents: 1_120, creditCents: 0 }, { accountId: 4000, debitCents: 0, creditCents: 1_000, taxCode: 'GST_PST_BC', baseCents: 1_000 }]),
    ];
    const result = computeProvincialSalesTax(entries, '2026-09-01', '2026-09-30');
    expect(result.rows.map((r) => r.province)).toEqual(['MB', 'QC']);
    const qc = result.rows.find((r) => r.province === 'QC')!;
    expect(qc).toMatchObject({ taxName: 'QST', collectedCents: 998, refundableCents: 399, netCents: 599 });
    expect(qc.lines.map((l) => l.direction)).toEqual(['sale', 'purchase']);
    expect(result.rows.find((r) => r.province === 'MB')).toMatchObject({ taxName: 'RST', collectedCents: 140, netCents: 140 });
  });
});
