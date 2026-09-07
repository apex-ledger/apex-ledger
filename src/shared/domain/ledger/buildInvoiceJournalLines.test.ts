import { describe, expect, it } from 'vitest';
import { buildInvoiceJournalLines, buildSalesReceiptJournalLines, computeInvoiceLineAmountCents } from './buildInvoiceJournalLines';
import type { NewInvoiceLineInput } from '../types';

const AR_ACCOUNT_ID = 42;
const GST_HST_PAYABLE_ID = 99;
const DEPOSIT_ACCOUNT_ID = 7;

function line(overrides: Partial<NewInvoiceLineInput> = {}): NewInvoiceLineInput {
  return {
    description: 'Consulting services',
    quantity: 1,
    unitPriceCents: 10000,
    revenueAccountId: 100,
    taxCode: null,
    manualHstCents: null,
    ...overrides,
  };
}

describe('computeInvoiceLineAmountCents', () => {
  it('multiplies quantity by unit price and rounds to the nearest cent', () => {
    expect(computeInvoiceLineAmountCents({ quantity: 2, unitPriceCents: 5000 })).toBe(10000);
    expect(computeInvoiceLineAmountCents({ quantity: 1.5, unitPriceCents: 999 })).toBe(1499); // 1498.5 -> 1499
  });
});

describe('buildInvoiceJournalLines', () => {
  it('posts a customer-linked discount to expense and reduces Accounts Receivable', () => {
    const result = buildInvoiceJournalLines(
      AR_ACCOUNT_ID,
      GST_HST_PAYABLE_ID,
      [line({ revenueAccountId: 100, taxCode: 'HST' })],
      [10000],
      { accountId: 5900, amountCents: 1000, customerId: 77 },
    );

    expect(result[0]).toMatchObject({ accountId: AR_ACCOUNT_ID, debitCents: 10300, customerId: 77 });
    expect(result[1]).toMatchObject({ accountId: 5900, debitCents: 1000, creditCents: 0, customerId: 77 });
    expect(result.reduce((sum, entry) => sum + entry.debitCents, 0)).toBe(result.reduce((sum, entry) => sum + entry.creditCents, 0));
  });

  it('rejects a discount that would reduce the invoice to zero', () => {
    expect(() => buildInvoiceJournalLines(
      AR_ACCOUNT_ID,
      GST_HST_PAYABLE_ID,
      [line({ taxCode: 'NonHST' })],
      [10000],
      { accountId: 5900, amountCents: 10000, customerId: 77 },
    )).toThrow('less than the invoice total');
  });

  it('builds AR debit + revenue credit for a line with no tax', () => {
    const lines = [line({ revenueAccountId: 100, taxCode: 'NonHST' })];
    const result = buildInvoiceJournalLines(AR_ACCOUNT_ID, GST_HST_PAYABLE_ID, lines, [10000]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ accountId: AR_ACCOUNT_ID, debitCents: 10000, creditCents: 0 });
    expect(result[1]).toMatchObject({ accountId: 100, debitCents: 0, creditCents: 10000, taxCode: 'NonHST' });
  });

  it('splits HST onto a separate GST/HST Payable line instead of embedding it in revenue', () => {
    const lines = [line({ revenueAccountId: 100, taxCode: 'HST' })];
    const result = buildInvoiceJournalLines(AR_ACCOUNT_ID, GST_HST_PAYABLE_ID, lines, [10000]);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ accountId: AR_ACCOUNT_ID, debitCents: 11300, creditCents: 0 });
    expect(result[1]).toMatchObject({ accountId: 100, creditCents: 10000, taxCode: 'HST' });
    expect(result[2]).toMatchObject({ accountId: GST_HST_PAYABLE_ID, creditCents: 1300 });
    const totalDebits = result.reduce((sum, l) => sum + l.debitCents, 0);
    const totalCredits = result.reduce((sum, l) => sum + l.creditCents, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  it('combines claimable tax from multiple lines with mixed tax codes into one GST/HST Payable line, balanced by construction', () => {
    const lines = [
      line({ revenueAccountId: 100, taxCode: 'HST' }),
      line({ revenueAccountId: 200, taxCode: 'NonHST' }),
      line({ revenueAccountId: 300, taxCode: 'Manual', manualHstCents: 500 }),
    ];
    const amounts = [10000, 5000, 20000];
    const result = buildInvoiceJournalLines(AR_ACCOUNT_ID, GST_HST_PAYABLE_ID, lines, amounts);

    expect(result).toHaveLength(5); // AR + 3 revenue lines + 1 combined tax line
    const totalDebits = result.reduce((sum, l) => sum + l.debitCents, 0);
    const totalCredits = result.reduce((sum, l) => sum + l.creditCents, 0);
    expect(totalDebits).toBe(totalCredits);
    expect(totalDebits).toBe(10000 + 1300 + 5000 + 20000 + 500); // base+HST, base, base, manual tax

    expect(result[0]).toMatchObject({ accountId: AR_ACCOUNT_ID, debitCents: 36800, creditCents: 0 });
    expect(result[1]).toMatchObject({ accountId: 100, creditCents: 10000, taxCode: 'HST', manualHstCents: null });
    expect(result[2]).toMatchObject({ accountId: 200, creditCents: 5000, taxCode: 'NonHST', manualHstCents: null });
    expect(result[3]).toMatchObject({ accountId: 300, creditCents: 20000, taxCode: 'Manual', manualHstCents: 500 });
    expect(result[4]).toMatchObject({ accountId: GST_HST_PAYABLE_ID, creditCents: 1800 });
  });

  it('folds non-claimable US sales tax into the revenue line instead of a separate GST/HST line', () => {
    const lines = [line({ revenueAccountId: 100, taxCode: 'USTax' })];
    const result = buildInvoiceJournalLines(AR_ACCOUNT_ID, GST_HST_PAYABLE_ID, lines, [10000]);

    expect(result).toHaveLength(2); // no GST/HST Payable line — nothing claimable
    expect(result[0]).toMatchObject({ accountId: AR_ACCOUNT_ID, debitCents: 10800, creditCents: 0 });
    expect(result[1]).toMatchObject({ accountId: 100, creditCents: 10800 }); // base + non-claimable tax folded in
  });

  it('clears manualHstCents when taxCode is not Manual, even if a stale value was passed in', () => {
    const lines = [line({ taxCode: 'HST', manualHstCents: 999 })];
    const result = buildInvoiceJournalLines(AR_ACCOUNT_ID, GST_HST_PAYABLE_ID, lines, [10000]);
    expect(result[1].manualHstCents).toBeNull();
  });

  it('rejects an invoice with no line items', () => {
    expect(() => buildInvoiceJournalLines(AR_ACCOUNT_ID, GST_HST_PAYABLE_ID, [], [])).toThrow('at least one line item');
  });

  it('rejects a zero or negative line amount', () => {
    expect(() => buildInvoiceJournalLines(AR_ACCOUNT_ID, GST_HST_PAYABLE_ID, [line()], [0])).toThrow('positive amount');
    expect(() => buildInvoiceJournalLines(AR_ACCOUNT_ID, GST_HST_PAYABLE_ID, [line()], [-100])).toThrow('positive amount');
  });

  it('rejects mismatched lines/amounts array lengths', () => {
    expect(() => buildInvoiceJournalLines(AR_ACCOUNT_ID, GST_HST_PAYABLE_ID, [line(), line()], [10000])).toThrow('same length');
  });
});

describe('buildSalesReceiptJournalLines', () => {
  it('debits the deposit-to account instead of Accounts Receivable', () => {
    const lines = [line({ revenueAccountId: 100, taxCode: 'NonHST' })];
    const result = buildSalesReceiptJournalLines(DEPOSIT_ACCOUNT_ID, GST_HST_PAYABLE_ID, lines, [10000]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ accountId: DEPOSIT_ACCOUNT_ID, debitCents: 10000, creditCents: 0 });
    expect(result[1]).toMatchObject({ accountId: 100, debitCents: 0, creditCents: 10000, taxCode: 'NonHST' });
  });

  it('splits HST onto a separate GST/HST Payable line, same as an invoice', () => {
    const lines = [line({ revenueAccountId: 100, taxCode: 'HST' })];
    const result = buildSalesReceiptJournalLines(DEPOSIT_ACCOUNT_ID, GST_HST_PAYABLE_ID, lines, [10000]);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ accountId: DEPOSIT_ACCOUNT_ID, debitCents: 11300, creditCents: 0 });
    expect(result[1]).toMatchObject({ accountId: 100, creditCents: 10000, taxCode: 'HST' });
    expect(result[2]).toMatchObject({ accountId: GST_HST_PAYABLE_ID, creditCents: 1300 });
    const totalDebits = result.reduce((sum, l) => sum + l.debitCents, 0);
    const totalCredits = result.reduce((sum, l) => sum + l.creditCents, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  it('rejects a sales receipt with no line items', () => {
    expect(() => buildSalesReceiptJournalLines(DEPOSIT_ACCOUNT_ID, GST_HST_PAYABLE_ID, [], [])).toThrow('at least one line item');
  });

  it('rejects a zero or negative line amount', () => {
    expect(() => buildSalesReceiptJournalLines(DEPOSIT_ACCOUNT_ID, GST_HST_PAYABLE_ID, [line()], [0])).toThrow('positive amount');
  });
});

describe('MealsHST is purchase-side only', () => {
  it('refuses to build an invoice line with the meals & entertainment code', () => {
    expect(() => buildInvoiceJournalLines(AR_ACCOUNT_ID, GST_HST_PAYABLE_ID, [line({ taxCode: 'MealsHST' })], [10000])).toThrow('purchases only');
  });

  it('refuses to build a sales receipt line with the meals & entertainment code', () => {
    expect(() => buildSalesReceiptJournalLines(DEPOSIT_ACCOUNT_ID, GST_HST_PAYABLE_ID, [line({ taxCode: 'MealsHST' })], [10000])).toThrow('purchases only');
  });
});
