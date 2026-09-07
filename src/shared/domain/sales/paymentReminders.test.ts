import { describe, expect, it } from 'vitest';
import { buildReminderDraft, reminderTier } from './paymentReminders';

const invoices = [
  { invoiceNumber: 'INV-1005', invoiceDate: '2026-05-30', dueDate: '2026-05-30', balanceDueCents: 30_000, totalCents: 30_000 },
  { invoiceNumber: 'INV-1008', invoiceDate: '2026-06-15', dueDate: '2026-07-15', balanceDueCents: 135_600, totalCents: 135_600 },
  { invoiceNumber: 'INV-1010', invoiceDate: '2026-09-03', dueDate: '2026-10-03', balanceDueCents: 33_900, totalCents: 33_900 },
  { invoiceNumber: 'INV-0999', invoiceDate: '2026-01-01', dueDate: '2026-01-31', balanceDueCents: 0, totalCents: 10_000 },
];

describe('payment reminders', () => {
  it('steps the tone up with how late the oldest invoice is', () => {
    expect(reminderTier(0)).toBe('upcoming');
    expect(reminderTier(10)).toBe('due');
    expect(reminderTier(45)).toBe('overdue');
    expect(reminderTier(97)).toBe('final');
  });

  it('writes one note per customer listing every open invoice with a total', () => {
    const draft = buildReminderDraft({ customerName: 'Willow Community Non-Profit', companyName: 'Northwind Bookkeeping', invoices, today: '2026-09-04' });
    expect(draft).not.toBeNull();
    expect(draft!.tier).toBe('final');
    expect(draft!.invoices.map((i) => i.invoiceNumber)).toEqual(['INV-1005', 'INV-1008', 'INV-1010']);
    expect(draft!.totalCents).toBe(199_500);
    expect(draft!.overdueCents).toBe(165_600);
    expect(draft!.subject).toBe('Final notice: $1,656.00 outstanding — Northwind Bookkeeping');
    expect(draft!.body).toContain('INV-1005  dated 2026-05-30  due 2026-05-30  $300.00  (97 days overdue)');
    expect(draft!.body).toContain('Total outstanding: $1,995.00 (of which $1,656.00 overdue)');
    expect(draft!.body).not.toContain('INV-0999');
  });

  it('is a plain statement when nothing is overdue, and nothing at all when nothing is open', () => {
    const draft = buildReminderDraft({ customerName: 'Maple', companyName: 'Northwind', invoices: [invoices[2]], today: '2026-09-04', signoff: 'Regards,\nPriya' });
    expect(draft!.tier).toBe('upcoming');
    expect(draft!.subject).toBe('Statement of account from Northwind');
    expect(draft!.body.endsWith('Regards,\nPriya')).toBe(true);
    expect(buildReminderDraft({ customerName: 'x', companyName: 'y', invoices: [invoices[3]], today: '2026-09-04' })).toBeNull();
  });
});
