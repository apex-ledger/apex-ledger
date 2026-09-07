import { describe, expect, it } from 'vitest';
import { dateOrderRefusalReason, depositDateRefusalReason, paymentDateRefusalReason } from './paymentTiming';

describe('payment dates', () => {
  it('allows a payment on or after the document date', () => {
    expect(paymentDateRefusalReason('2026-03-01', '2026-03-01', 'invoice INV-1')).toBeNull();
    expect(paymentDateRefusalReason('2026-03-01', '2026-04-15', 'invoice INV-1')).toBeNull();
  });

  it('refuses a payment before the document, naming both dates', () => {
    const reason = paymentDateRefusalReason('2026-03-01', '2025-03-01', 'invoice INV-1');
    expect(reason).toMatch(/dated 2025-03-01, before invoice INV-1 was issued on 2026-03-01/);
  });
});

describe('follow-on document dates', () => {
  it('allows a receipt on or after its order', () => {
    expect(dateOrderRefusalReason('purchase order PO-1', '2026-03-01', 'goods receipt', '2026-03-01')).toBeNull();
  });

  it('refuses an invoice dated before the estimate it came from', () => {
    expect(dateOrderRefusalReason('estimate EST-1', '2026-03-10', 'invoice', '2026-03-01')).toMatch(/invoice is dated 2026-03-01, before estimate EST-1/);
  });
});

describe('deposit dates', () => {
  it('allows a deposit on or after every payment it banks', () => {
    expect(depositDateRefusalReason('2026-03-10', ['2026-03-01', '2026-03-10'])).toBeNull();
  });

  it('allows an empty deposit through — the count check lives elsewhere', () => {
    expect(depositDateRefusalReason('2026-03-10', [])).toBeNull();
  });

  it('refuses a deposit before the latest payment in it', () => {
    expect(depositDateRefusalReason('2026-03-05', ['2026-03-01', '2026-03-09'])).toMatch(/received on 2026-03-09/);
  });
});
