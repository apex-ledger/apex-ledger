import { describe, expect, it } from 'vitest';
import { suggestDocumentMatch } from './suggestDocumentMatch';

const invoices = [
  { id: 1, date: '2026-08-31', balanceDueCents: 45_200, partyName: 'Maple Consulting Group' },
  { id: 2, date: '2026-06-30', balanceDueCents: 169_500, partyName: 'Spruce Retail Inc' },
  { id: 3, date: '2026-08-15', balanceDueCents: 45_200, partyName: 'Cedar Landscaping Ltd' },
];
const bills = [{ id: 9, date: '2026-09-03', balanceDueCents: 20_623, partyName: 'Staples Business' }];

describe('bank line → open document match', () => {
  it('matches a deposit to the one open invoice with that exact balance in the date window', () => {
    expect(suggestDocumentMatch({ date: '2026-09-10', amountCents: 169_500, description: 'E-TRANSFER RECEIVED', isExpense: false }, invoices, bills)).toEqual({ kind: 'invoice', id: 2, confidence: 'exact' });
  });

  it('uses the customer name to choose between two invoices of the same amount', () => {
    expect(suggestDocumentMatch({ date: '2026-09-05', amountCents: 45_200, description: 'DEPOSIT CEDAR LANDSCAPING', isExpense: false }, invoices, bills)).toEqual({ kind: 'invoice', id: 3, confidence: 'named' });
    expect(suggestDocumentMatch({ date: '2026-09-05', amountCents: 45_200, description: 'DEPOSIT', isExpense: false }, invoices, bills)).toBeNull();
  });

  it('matches a withdrawal to a bill, never to an invoice', () => {
    expect(suggestDocumentMatch({ date: '2026-09-04', amountCents: -20_623, description: 'STAPLES BUSINESS', isExpense: true }, invoices, bills)).toEqual({ kind: 'bill', id: 9, confidence: 'exact' });
    expect(suggestDocumentMatch({ date: '2026-09-04', amountCents: 20_623, description: 'STAPLES', isExpense: false }, invoices, bills)).toBeNull();
  });

  it('refuses partial amounts, stale documents and payments well before the document date', () => {
    expect(suggestDocumentMatch({ date: '2026-09-10', amountCents: 100_000, description: 'x', isExpense: false }, invoices, bills)).toBeNull();
    expect(suggestDocumentMatch({ date: '2026-12-15', amountCents: 169_500, description: 'x', isExpense: false }, invoices, bills)).toBeNull();
    expect(suggestDocumentMatch({ date: '2026-06-01', amountCents: 169_500, description: 'x', isExpense: false }, invoices, bills)).toBeNull();
  });
});
