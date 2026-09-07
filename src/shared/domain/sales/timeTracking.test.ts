import { describe, expect, it } from 'vitest';
import { entryAmountCents, invoiceLinesFromTime, roundHours, unbilledByCustomer } from './timeTracking';

const entries = [
  { id: 1, customerId: 3, workDate: '2026-09-02', hours: 1.25, rateCents: 8500, description: 'Bookkeeping', billable: true, invoiceId: null },
  { id: 2, customerId: 3, workDate: '2026-09-01', hours: 2.5, rateCents: 8500, description: 'Bookkeeping', billable: true, invoiceId: null },
  { id: 3, customerId: 3, workDate: '2026-09-03', hours: 3, rateCents: 15000, description: 'T2 preparation', billable: true, invoiceId: null },
  { id: 4, customerId: 3, workDate: '2026-09-03', hours: 1, rateCents: 8500, description: 'Internal admin', billable: false, invoiceId: null },
  { id: 5, customerId: 3, workDate: '2026-08-15', hours: 4, rateCents: 8500, description: 'Bookkeeping', billable: true, invoiceId: 9 },
  { id: 6, customerId: 5, workDate: '2026-09-04', hours: 0.5, rateCents: 12000, description: null, billable: true, invoiceId: null },
];

describe('time tracking', () => {
  it('keeps hours to a tenth and prices an entry', () => {
    expect(roundHours(1.25)).toBe(1.3);
    expect(roundHours(0.04)).toBe(0);
    expect(entryAmountCents({ hours: 1.25, rateCents: 8500 })).toBe(11_050);
  });

  it('sums billable unbilled time per customer, ignoring non-billable and already invoiced', () => {
    const summary = unbilledByCustomer(entries);
    expect(summary.map((s) => [s.customerId, s.entries, s.hours, s.amountCents, s.oldestDate])).toEqual([
      [3, 3, 6.8, 11_050 + 21_250 + 45_000, '2026-09-01'],
      [5, 1, 0.5, 6_000, '2026-09-04'],
    ]);
  });

  it('collapses same description and rate into one invoice line with the hours as quantity', () => {
    const lines = invoiceLinesFromTime(entries.filter((e) => e.customerId === 3 && e.billable && e.invoiceId === null));
    expect(lines).toEqual([
      { description: 'Bookkeeping (3.8 h)', quantity: 3.8, unitPriceCents: 8500, entryIds: [1, 2] },
      { description: 'T2 preparation (3 h)', quantity: 3, unitPriceCents: 15000, entryIds: [3] },
    ]);
    expect(invoiceLinesFromTime([entries[5]])[0].description).toBe('Professional services (0.5 h)');
  });
});
