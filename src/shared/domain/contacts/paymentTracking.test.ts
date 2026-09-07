import { describe, expect, it } from 'vitest';
import { buildContactPaymentHistory, type TrackedDocument, type TrackedPayment } from './paymentTracking';

const documents: TrackedDocument[] = [
  { id: 1, contactId: 7, number: 'INV-1001', date: '2026-01-10', dueDate: '2026-02-09', totalCents: 50_000, balanceDueCents: 0, status: 'paid' },
  { id: 2, contactId: 7, number: 'INV-1002', date: '2026-02-10', dueDate: '2026-02-20', totalCents: 20_000, balanceDueCents: 15_000, status: 'unpaid' },
  { id: 3, contactId: 7, number: 'INV-1003', date: '2026-03-01', dueDate: '2099-01-01', totalCents: 9_000, balanceDueCents: 0, status: 'paid' },
  { id: 4, contactId: 8, number: 'INV-1004', date: '2026-03-02', dueDate: '2026-03-30', totalCents: 1_000, balanceDueCents: 1_000, status: 'unpaid' },
];
const payments: TrackedPayment[] = [
  { id: 11, documentId: 1, paymentDate: '2026-02-01', amountCents: 30_000, accountId: 100, journalEntryId: 501, memo: null },
  { id: 12, documentId: 1, paymentDate: '2026-01-20', amountCents: 20_000, accountId: 101, journalEntryId: 502, memo: 'cheque' },
  { id: 13, documentId: 2, paymentDate: '2026-02-15', amountCents: 5_000, accountId: 100, journalEntryId: 503, memo: null },
];
const accounts = new Map([[100, 'Chequing'], [101, 'Undeposited Funds']]);

describe('a contact\'s payment history', () => {
  const history = buildContactPaymentHistory(7, documents, payments, accounts, '2026-03-10');

  it('lists only that contact\'s documents, newest first, with payments oldest first beneath each', () => {
    expect(history.documents.map((row) => row.document.number)).toEqual(['INV-1003', 'INV-1002', 'INV-1001']);
    expect(history.documents[2].payments.map((payment) => [payment.paymentDate, payment.accountName])).toEqual([['2026-01-20', 'Undeposited Funds'], ['2026-02-01', 'Chequing']]);
  });

  it('adds up what was billed, paid and is still owed', () => {
    expect(history.summary).toMatchObject({ documentCount: 3, billedCents: 79_000, paidCents: 64_000, outstandingCents: 15_000, lastPaymentDate: '2026-02-15' });
  });

  it('counts a document settled by credit note as paid even with no cash payment beneath it', () => {
    expect(history.documents[0].paidCents).toBe(9_000);
    expect(history.documents[0].payments).toHaveLength(0);
  });

  it('flags what is overdue and by how many days', () => {
    expect(history.documents[1].daysOverdue).toBe(18);
    expect(history.summary).toMatchObject({ overdueCount: 1, overdueCents: 15_000 });
    expect(history.documents[2].daysOverdue).toBe(0);
  });

  it('is empty for a contact with nothing', () => {
    const none = buildContactPaymentHistory(99, documents, payments, accounts, '2026-03-10');
    expect(none.documents).toEqual([]);
    expect(none.summary.lastPaymentDate).toBeNull();
  });
});
