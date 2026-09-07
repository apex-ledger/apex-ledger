import { describe, expect, it } from 'vitest';
import {
  canTransitionEstimate,
  canTransitionPurchaseOrder,
  displayEstimateStatus,
  documentTotalCents,
  estimateConversionBlock,
  isExpired,
  isSalesOrder,
  lineAmountCents,
  orderInvoiceStatus,
  orderStatusLabel,
  purchaseOrderConversionBlock,
} from './commitmentDocuments';

describe('turning an estimate into an invoice', () => {
  it('is allowed once the customer has accepted', () => {
    expect(estimateConversionBlock('accepted', null)).toBeNull();
  });

  it('is allowed straight from a draft, since a verbal yes is still a yes', () => {
    expect(estimateConversionBlock('draft', null)).toBeNull();
  });

  it('is refused for one the customer declined', () => {
    // Invoicing something turned down is not a judgement call. Marking it accepted first leaves a
    // record of the change of mind.
    expect(estimateConversionBlock('declined', null)).toMatch(/declined/i);
  });

  it('is refused a second time', () => {
    // The blocker that matters: converting twice bills the customer twice for one job.
    expect(estimateConversionBlock('accepted', 42)).toMatch(/already been invoiced \(invoice #42\)/i);
  });

  it('names the invoice it became, so it can be found', () => {
    expect(estimateConversionBlock('converted', 42)).toContain('42');
  });
});

describe('turning a purchase order into a bill', () => {
  it('is allowed for one that has been sent', () => {
    expect(purchaseOrderConversionBlock('sent', null)).toBeNull();
  });

  it('is refused for a cancelled order', () => {
    expect(purchaseOrderConversionBlock('cancelled', null)).toMatch(/cancelled/i);
  });

  it('is refused a second time', () => {
    expect(purchaseOrderConversionBlock('received', 7)).toMatch(/already been billed/i);
  });
});

describe('once converted', () => {
  it('an estimate cannot move to any other status', () => {
    // It has become a posted invoice. Moving it back would leave a posted transaction with nothing
    // explaining where it came from; undoing means voiding the invoice, which is a ledger decision.
    for (const to of ['draft', 'sent', 'accepted', 'declined', 'expired'] as const) {
      expect(canTransitionEstimate('converted', to), to).toBe(false);
    }
  });

  it('a purchase order cannot either', () => {
    for (const to of ['draft', 'sent', 'received', 'cancelled'] as const) {
      expect(canTransitionPurchaseOrder('converted', to), to).toBe(false);
    }
  });
});

describe('changing an estimate’s status', () => {
  it('lets a sent quote be accepted or declined', () => {
    expect(canTransitionEstimate('sent', 'accepted')).toBe(true);
    expect(canTransitionEstimate('sent', 'declined')).toBe(true);
  });

  it('lets a declined quote come back', () => {
    // Customers change their minds, and the record of the decline is worth keeping.
    expect(canTransitionEstimate('declined', 'accepted')).toBe(true);
  });

  it('treats a move to the same status as no move', () => {
    expect(canTransitionEstimate('sent', 'sent')).toBe(false);
  });
});

describe('expiry', () => {
  it('lapses once the date has passed', () => {
    expect(isExpired('2025-03-01', 'sent', '2025-03-02')).toBe(true);
  });

  it('has not lapsed on the day itself', () => {
    expect(isExpired('2025-03-01', 'sent', '2025-03-01')).toBe(false);
  });

  it('never lapses without an expiry date', () => {
    expect(isExpired(null, 'sent', '2099-01-01')).toBe(false);
  });

  it('does not lapse once the outcome is settled', () => {
    // An accepted quote does not stop being accepted because a date passed.
    expect(isExpired('2025-03-01', 'accepted', '2025-06-01')).toBe(false);
    expect(isExpired('2025-03-01', 'declined', '2025-06-01')).toBe(false);
    expect(isExpired('2025-03-01', 'converted', '2025-06-01')).toBe(false);
  });

  it('is shown as expired without the stored status being touched', () => {
    // Worked out rather than stored: a stored flag is only right until the next day, and nothing
    // runs overnight to update it.
    expect(displayEstimateStatus('sent', '2025-03-01', '2025-06-01')).toBe('expired');
    expect(displayEstimateStatus('sent', '2025-12-01', '2025-06-01')).toBe('sent');
  });
});

describe('totals', () => {
  it('rounds each line once, the way an invoice does', () => {
    // Fractional hours make the product a fraction of a cent. Rounding per line and summing is what
    // keeps a converted estimate equal to the invoice it becomes.
    expect(lineAmountCents({ description: 'Work', quantity: 3.5, unitPriceCents: 10_033 })).toBe(35_116);
  });

  it('adds the lines up', () => {
    const total = documentTotalCents([
      { description: 'A', quantity: 2, unitPriceCents: 1_000 },
      { description: 'B', quantity: 1, unitPriceCents: 500 },
    ]);
    expect(total).toBe(2_500);
  });

  it('is zero for an empty document', () => {
    expect(documentTotalCents([])).toBe(0);
  });

  it('handles a credit line without breaking', () => {
    expect(documentTotalCents([{ description: 'Discount', quantity: 1, unitPriceCents: -500 }])).toBe(-500);
  });
});

describe('sales orders', () => {
  it('is what an accepted estimate becomes, through invoicing or closing', () => {
    expect(isSalesOrder('accepted')).toBe(true);
    expect(isSalesOrder('converted')).toBe(true);
    expect(isSalesOrder('closed')).toBe(true);
    expect(isSalesOrder('sent')).toBe(false);
  });

  it('can be closed without invoicing, and reopened', () => {
    expect(canTransitionEstimate('accepted', 'closed')).toBe(true);
    expect(canTransitionEstimate('closed', 'accepted')).toBe(true);
    expect(canTransitionEstimate('sent', 'closed')).toBe(false);
    expect(canTransitionEstimate('converted', 'closed')).toBe(false);
  });

  it('refuses to invoice a closed order until it is reopened', () => {
    expect(estimateConversionBlock('closed', null)).toMatch(/Reopen/);
  });

  it('shows order and invoice status the way a person reads them', () => {
    expect(orderStatusLabel('accepted')).toBe('Open');
    expect(orderStatusLabel('converted')).toBe('Closed (invoiced)');
    expect(orderInvoiceStatus('accepted', null)).toBe('Not invoiced');
    expect(orderInvoiceStatus('converted', 42)).toBe('Invoiced');
  });

  it('never expires a closed order', () => {
    expect(isExpired('2020-01-01', 'closed', '2026-01-01')).toBe(false);
  });
});
