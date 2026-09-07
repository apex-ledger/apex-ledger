import { describe, expect, it } from 'vitest';
import { buildActionItems, severityFor, unfiledHstPeriods, type ActionCentreInput } from './actionCentre';

const empty: ActionCentreInput = {
  today: '2026-09-04', bills: [], invoices: [], draftJournalEntries: [], draftPayRuns: [], nextPayDates: [], remittances: [], hstPeriodsUnfiled: [], receiptInboxCount: 0, recurringDue: [], unbilledTime: [], reorder: [], bankAccounts: [], reminders: [],
};

describe('action centre', () => {
  it('raises a suggestion for expense accounts over budget', () => {
    const data = buildActionItems({ ...empty, budgetAlerts: [{ accountId: 9, accountName: 'Advertising', budgetCents: 100_000, actualCents: 140_000, variancePercent: 40 }] });
    const item = data.items.find((i) => i.id === 'budget-9');
    expect(item).toMatchObject({ section: 'suggest', severity: 'soon', amountCents: 40_000 });
    expect(item?.title).toContain('40% over budget');
  });

  it('grades urgency by days to the due date', () => {
    expect(severityFor('2026-09-04', '2026-09-01')).toBe('overdue');
    expect(severityFor('2026-09-04', '2026-09-04')).toBe('today');
    expect(severityFor('2026-09-04', '2026-09-10')).toBe('soon');
    expect(severityFor('2026-09-04', '2026-10-10')).toBe('info');
  });

  it('lists overdue bills and invoices first, then drafts and suggestions, with counts', () => {
    const data = buildActionItems({
      ...empty,
      bills: [
        { id: 1, vendorName: 'Hydro', billNumber: 'H-1', dueDate: '2026-08-30', amountCents: 12000, paidCents: 0, status: 'unpaid' },
        { id: 2, vendorName: 'Paid Co', billNumber: null, dueDate: '2026-08-01', amountCents: 500, paidCents: 500, status: 'paid' },
        { id: 3, vendorName: 'Far Co', billNumber: null, dueDate: '2026-12-01', amountCents: 900, paidCents: 0, status: 'unpaid' },
      ],
      invoices: [{ id: 7, customerName: 'Acme', invoiceNumber: 'INV-7', dueDate: '2026-09-04', totalCents: 50000, paidCents: 10000, status: 'unpaid', customerEmail: null }],
      draftJournalEntries: [{ id: 40, entryDate: '2026-08-20', memo: 'Accrual' }],
      draftPayRuns: [{ id: 13, employeeName: 'Sam', payDate: '2026-09-11', netPayCents: 247246 }],
      receiptInboxCount: 6,
      reorder: [{ productId: 98, name: 'Paper', quantityOnHand: 0, reorderPoint: 2, reorderQuantity: 12, preferredVendorName: 'Amazon Business' }],
      bankAccounts: [{ accountId: 1, name: 'Chequing', lastReconciledStatementDate: '2026-06-30' }, { accountId: 2, name: 'Savings', lastReconciledStatementDate: '2026-08-31' }],
    });
    const ids = data.items.map((i) => i.id);
    expect(ids[0]).toBe('bill-1');
    expect(ids).toContain('invoice-7');
    expect(ids).not.toContain('bill-2');
    expect(ids).not.toContain('bill-3');
    expect(ids).toContain('journal-40');
    expect(ids).toContain('payrun-13');
    expect(ids).toContain('receipts');
    expect(ids).toContain('reorder-98');
    expect(ids).toContain('recon-1');
    expect(ids).not.toContain('recon-2');
    expect(ids).toContain('customers-no-email');
    expect(data.items.find((i) => i.id === 'bill-1')?.amountCents).toBe(12000);
    expect(data.items.find((i) => i.id === 'invoice-7')?.amountCents).toBe(40000);
    expect(data.counts).toMatchObject({ overdue: 1, today: 1 });
    expect(data.items.find((i) => i.id === 'reorder-98')?.detail).toContain('from Amazon Business');
  });

  it('finds ended GST/HST periods with no filing and their CRA due dates', () => {
    const q = unfiledHstPeriods('Quarterly', 12, 31, [{ periodStart: '2026-01-01', periodEnd: '2026-03-31' }], '2026-09-04');
    expect(q.map((p) => `${p.periodStart}..${p.periodEnd}>${p.dueDate}`)).toEqual(['2026-04-01..2026-06-30>2026-07-31']);
    const m = unfiledHstPeriods('Monthly', 12, 31, [], '2026-09-04', 2);
    expect(m.map((p) => p.periodEnd)).toEqual(['2026-07-31', '2026-08-31']);
    expect(m[1].dueDate).toBe('2026-09-30');
    expect(unfiledHstPeriods('None', 12, 31, [], '2026-09-04')).toEqual([]);
  });
});
