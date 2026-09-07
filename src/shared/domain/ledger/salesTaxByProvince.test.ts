import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../types';
import { computeSalesTaxByProvince } from './salesTaxByProvince';

function entry(id: number, date: string, lines: Array<Partial<JournalEntry['lines'][number]> & { accountId: number; debitCents: number; creditCents: number }>): JournalEntry {
  return {
    id, entryDate: date, memo: null, reference: null, status: 'posted', createdAt: `${date} 12:00:00`, postedAt: null,
    lines: lines.map((l, i) => ({ id: id * 10 + i, journalEntryId: id, lineOrder: i, description: null, taxCode: null, manualHstCents: null, baseCents: null, vendorId: null, customerId: null, foreignCurrency: null, foreignAmountCents: null, exchangeRate: null, reconciliationId: null, clearedAt: null, ...l } as JournalEntry['lines'][number])),
    periodFrom: null, periodTo: null, isAdjustingEntry: false, source: 'manual', sourceReference: null,
  } as JournalEntry;
}

describe('sales tax by province — whole of Canada', () => {
  const entries = [
    entry(1, '2026-09-01', [{ accountId: 1200, debitCents: 11_300, creditCents: 0 }, { accountId: 4000, debitCents: 0, creditCents: 10_000, taxCode: 'HST', baseCents: 10_000 }]),
    entry(2, '2026-09-02', [{ accountId: 1200, debitCents: 11_200, creditCents: 0 }, { accountId: 4000, debitCents: 0, creditCents: 10_000, taxCode: 'GST_PST_BC', baseCents: 10_000 }]),
    entry(3, '2026-09-03', [{ accountId: 5040, debitCents: 4_000, creditCents: 0, taxCode: 'GST_QST_QC', baseCents: 4_000 }, { accountId: 1000, debitCents: 0, creditCents: 4_599 }]),
    entry(4, '2026-09-04', [{ accountId: 1200, debitCents: 1_050, creditCents: 0 }, { accountId: 4000, debitCents: 0, creditCents: 1_000, taxCode: 'GST_AB', baseCents: 1_000 }]),
    entry(5, '2026-09-05', [{ accountId: 1200, debitCents: 1_150, creditCents: 0 }, { accountId: 4000, debitCents: 0, creditCents: 1_000, taxCode: 'HST_15', baseCents: 1_000 }]),
  ];

  it('lists all thirteen jurisdictions with federal and provincial parts kept apart', () => {
    const result = computeSalesTaxByProvince(entries, '2026-09-01', '2026-09-30');
    const codes = result.rows.map((r) => r.jurisdiction?.code ?? 'OTHER');
    expect(codes).toEqual(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT', 'OTHER']);
    const by = (c: string) => result.rows.find((r) => (r.jurisdiction?.code ?? 'OTHER') === c)!;
    expect(by('ON')).toMatchObject({ taxableSalesCents: 10_000, federalCollectedCents: 1_300, provincialCollectedCents: 0 });
    expect(by('BC')).toMatchObject({ federalCollectedCents: 500, provincialCollectedCents: 700, provincialNetCents: 700 });
    expect(by('QC')).toMatchObject({ taxablePurchasesCents: 4_000, federalItcCents: 200, provincialItrCents: 399, provincialNetCents: -399 });
    expect(by('AB')).toMatchObject({ federalCollectedCents: 50, provincialCollectedCents: 0 });
    expect(by('OTHER')).toMatchObject({ label: 'Not assigned to a province', federalCollectedCents: 150 });
    expect(by('YT').lineCount).toBe(0);
    expect(result.totals.federalCollectedCents).toBe(1_300 + 500 + 50 + 150);
    expect(result.totals.provincialCollectedCents).toBe(700);
  });

  it('drops the unassigned row when every line has a province', () => {
    const result = computeSalesTaxByProvince(entries.slice(0, 2), '2026-09-01', '2026-09-30');
    expect(result.rows).toHaveLength(13);
  });
});
