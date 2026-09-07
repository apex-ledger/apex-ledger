import { describe, expect, it } from 'vitest';
import { advanceDate, dueTemplates, invoicePayloadFromTemplate, templateTotalCents, type RecurringInvoiceTemplate } from './recurringInvoices';

const template: RecurringInvoiceTemplate = {
  id: 1, name: 'Monthly bookkeeping', customerId: 3, frequency: 'monthly', nextDate: '2026-09-30', endDate: null, paymentTerms: 'net15', memo: 'Monthly bookkeeping fee', customerPoNumber: null, autoEmail: true, isActive: true, lastGeneratedDate: null,
  lines: [{ description: 'Bookkeeping — monthly', quantity: 1, unitPriceCents: 50_000, revenueAccountId: 41, productId: null, taxCode: 'HST' }, { description: 'Payroll processing', quantity: 2, unitPriceCents: 7_500, revenueAccountId: 41, productId: null, taxCode: 'HST' }],
};

describe('recurring invoices', () => {
  it('advances by the frequency and clamps month ends without drifting', () => {
    expect(advanceDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(advanceDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
    expect(advanceDate('2026-11-30', 'quarterly')).toBe('2027-02-28');
    expect(advanceDate('2026-09-03', 'weekly')).toBe('2026-09-10');
    expect(advanceDate('2026-09-03', 'biweekly')).toBe('2026-09-17');
    expect(advanceDate('2024-02-29', 'annually')).toBe('2025-02-28');
    expect(advanceDate('2026-06-15', 'semiannually')).toBe('2026-12-15');
  });

  it('knows which templates are due and respects the end date', () => {
    const list = [template, { ...template, id: 2, nextDate: '2026-10-31' }, { ...template, id: 3, isActive: false }, { ...template, id: 4, nextDate: '2026-09-30', endDate: '2026-09-15' }];
    expect(dueTemplates(list, '2026-09-30').map((t) => t.id)).toEqual([1]);
    expect(dueTemplates(list, '2026-09-29')).toEqual([]);
  });

  it('builds a complete invoice payload from the template', () => {
    const payload = invoicePayloadFromTemplate(template, '2026-09-30', 'INV-1011', '2026-10-15');
    expect(payload).toMatchObject({ customerId: 3, invoiceNumber: 'INV-1011', invoiceDate: '2026-09-30', dueDate: '2026-10-15', paymentTerms: 'net15', memo: 'Monthly bookkeeping fee' });
    expect(payload.lines).toHaveLength(2);
    expect(payload.lines[1]).toMatchObject({ quantity: 2, unitPriceCents: 7_500, taxCode: 'HST', manualHstCents: null });
    expect(templateTotalCents(template.lines)).toBe(65_000);
  });
});
