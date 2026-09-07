import { describe, expect, it } from 'vitest';
import type { Bill, Invoice } from '../types';
import { dayAfter, planRevaluation, reversedJournalLines, revaluationJournalLines } from './revaluation';

const invoice = (id: number, foreignCents: number, rate: number, paidCents = 0): Invoice => {
  const total = Math.round(foreignCents * rate);
  return { id, customerId: 1, invoiceNumber: `INV-${id}`, invoiceDate: '2026-06-15', dueDate: '2026-07-15', totalCents: total, paidCents, balanceDueCents: total - paidCents, status: paidCents >= total ? 'paid' : 'unpaid', lines: [], foreignCurrency: 'USD', foreignAmountCents: foreignCents, exchangeRate: rate } as unknown as Invoice;
};
const bill = (id: number, foreignCents: number, rate: number): Bill => {
  const total = Math.round(foreignCents * rate);
  return { id, vendorId: 1, billNumber: `B-${id}`, billDate: '2026-06-20', dueDate: '2026-07-20', amountCents: total, paidCents: 0, balanceDueCents: total, status: 'unpaid', lines: [], foreignCurrency: 'USD', foreignAmountCents: foreignCents, exchangeRate: rate } as unknown as Bill;
};

describe('period-end revaluation', () => {
  it('revalues a USD bank, open USD receivables and payables at the closing rate', () => {
    const plan = planRevaluation({
      asOfDate: '2026-06-30',
      rates: { USD: 1.40 },
      foreignBalances: [{ accountId: 5, currency: 'USD', foreignCents: 100_000, cadCents: 135_000 }],
      openInvoices: [invoice(1, 200_000, 1.35)],
      openBills: [bill(1, 50_000, 1.30)],
      accountsReceivableId: 10,
      accountsPayableId: 20,
    });
    expect(plan.missingRates).toEqual([]);
    expect(plan.lines.map((l) => [l.kind, l.gainLossCents])).toEqual([
      ['bank', 5_000], // 100,000 × 1.40 = 140,000 vs 135,000 booked
      ['receivable', 10_000], // 200,000 × 1.40 = 280,000 vs 270,000
      ['payable', -5_000], // owe 70,000 now vs 65,000 booked
    ]);
    expect(plan.totalGainLossCents).toBe(10_000);

    const lines = revaluationJournalLines(plan, 99);
    expect(lines.reduce((s, l) => s + l.debitCents, 0)).toBe(lines.reduce((s, l) => s + l.creditCents, 0));
    expect(lines.at(-1)).toMatchObject({ accountId: 99, creditCents: 10_000, debitCents: 0 });
    const reversed = reversedJournalLines(lines);
    expect(reversed.at(-1)).toMatchObject({ accountId: 99, debitCents: 10_000, creditCents: 0 });
    expect(dayAfter('2026-06-30')).toBe('2026-07-01');
  });

  it('uses only the still-outstanding part of a partly paid invoice', () => {
    const plan = planRevaluation({ asOfDate: '2026-06-30', rates: { USD: 1.40 }, foreignBalances: [], openInvoices: [invoice(1, 100_000, 1.35, 67_500)], openBills: [], accountsReceivableId: 10, accountsPayableId: 20 });
    expect(plan.lines[0]).toMatchObject({ kind: 'receivable', foreignCents: 50_000, bookedCadCents: 67_500, revaluedCadCents: 70_000, gainLossCents: 2_500 });
  });

  it('reports currencies with no rate instead of guessing, and posts nothing when nothing moved', () => {
    const plan = planRevaluation({ asOfDate: '2026-06-30', rates: {}, foreignBalances: [{ accountId: 5, currency: 'EUR', foreignCents: 1000, cadCents: 1500 }], openInvoices: [], openBills: [], accountsReceivableId: 10, accountsPayableId: 20 });
    expect(plan.missingRates).toEqual(['EUR']);
    expect(plan.lines).toEqual([]);
    expect(revaluationJournalLines(plan, 99)).toEqual([]);
    const flat = planRevaluation({ asOfDate: '2026-06-30', rates: { USD: 1.35 }, foreignBalances: [{ accountId: 5, currency: 'USD', foreignCents: 100_000, cadCents: 135_000 }], openInvoices: [], openBills: [], accountsReceivableId: 10, accountsPayableId: 20 });
    expect(revaluationJournalLines(flat, 99)).toEqual([]);
  });
});
