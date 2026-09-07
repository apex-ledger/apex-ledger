import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateSalesInvoice, hashSalesInvoiceRequest, SalesInvoiceCalculationError } from './salesInvoiceCalculation.js';

describe('sales invoice calculation', () => {
  const taxableLine = {
    description: 'Plastic Glass', quantityMilli: 5000, unitPriceCents: 4500,
    revenueAccountId: '8bbaf352-720e-420c-93ef-672f5cc7cb84', taxCode: 'hst_13' as const,
  };

  it('calculates quantity, subtotal, Ontario HST and total in exact cents', () => {
    const invoice = calculateSalesInvoice([taxableLine]);
    assert.equal(invoice.subtotalCents, 22500);
    assert.equal(invoice.hstCents, 2925);
    assert.equal(invoice.totalCents, 25425);
    assert.equal(invoice.lines[0]?.lineNumber, 1);
  });

  it('supports mixed taxable, exempt, and manual-tax lines', () => {
    const invoice = calculateSalesInvoice([
      taxableLine,
      { ...taxableLine, description: 'Exempt item', quantityMilli: 1000, unitPriceCents: 1000, taxCode: 'hst_exempt' },
      { ...taxableLine, description: 'Manual item', quantityMilli: 1000, unitPriceCents: 1000, taxCode: 'manual_hst', manualHstCents: 75 },
    ]);
    assert.equal(invoice.subtotalCents, 24500);
    assert.equal(invoice.hstCents, 3000);
    assert.equal(invoice.totalCents, 27500);
  });

  it('rejects empty invoices and creates a stable idempotency hash', () => {
    assert.throws(() => calculateSalesInvoice([]), SalesInvoiceCalculationError);
    const request = { companyId: 'c1', customerId: 'customer-1', invoiceDate: '2026-08-29', dueDate: '2026-09-28', lines: [taxableLine] };
    assert.equal(hashSalesInvoiceRequest(request.companyId, request), hashSalesInvoiceRequest(request.companyId, request));
  });
});
