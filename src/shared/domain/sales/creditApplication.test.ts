import { describe, expect, it } from 'vitest';
import {
  creditApplicationRefusalReason,
  creditRefundRefusalReason,
  creditRemainingCents,
  defaultApplicationCents,
  statusAfterApplication,
  type CreditForApplication,
} from './creditApplication';

const credit = (overrides: Partial<CreditForApplication> = {}): CreditForApplication => ({
  creditNoteNumber: 'CN-0001',
  status: 'open',
  totalCents: 50_000,
  appliedCents: 0,
  ...overrides,
});

describe('what remains on a credit', () => {
  it('is the total less what has been applied', () => {
    expect(creditRemainingCents(credit({ appliedCents: 20_000 }))).toBe(30_000);
  });

  it('never goes negative', () => {
    expect(creditRemainingCents(credit({ appliedCents: 90_000 }))).toBe(0);
  });
});

describe('the amount applied when none is given', () => {
  it('is the whole credit against a bigger invoice', () => {
    expect(defaultApplicationCents(credit(), 120_000)).toBe(50_000);
  });

  it('is the whole balance against a smaller invoice', () => {
    expect(defaultApplicationCents(credit(), 25_000)).toBe(25_000);
  });

  it('is what is left of a partly used credit', () => {
    expect(defaultApplicationCents(credit({ appliedCents: 40_000 }), 120_000)).toBe(10_000);
  });
});

describe('applying part of a credit', () => {
  it('allows a partial application that leaves both sides with a balance', () => {
    expect(creditApplicationRefusalReason(credit(), 120_000, 30_000, 'Invoice INV-9')).toBeNull();
  });

  it('refuses more than remains on the credit', () => {
    expect(creditApplicationRefusalReason(credit({ appliedCents: 40_000 }), 120_000, 20_000, 'Invoice INV-9')).toMatch(/Only \$100\.00 remains on CN-0001/);
  });

  it('refuses more than the document still owes', () => {
    expect(creditApplicationRefusalReason(credit(), 25_000, 30_000, 'Invoice INV-9')).toMatch(/Invoice INV-9 has only \$250\.00 outstanding/);
  });

  it('refuses a settled document, a used-up credit, and a refunded one', () => {
    expect(creditApplicationRefusalReason(credit(), 0, 1, 'Invoice INV-9')).toMatch(/already settled/);
    expect(creditApplicationRefusalReason(credit({ appliedCents: 50_000 }), 100, 1, 'Invoice INV-9')).toMatch(/applied in full/);
    expect(creditApplicationRefusalReason(credit({ status: 'refunded' }), 100, 1, 'Invoice INV-9')).toMatch(/refunded/);
  });

  it('refuses a missing or non-cent amount', () => {
    expect(creditApplicationRefusalReason(credit(), 100, 0, 'Invoice INV-9')).toMatch(/Enter the amount/);
    expect(creditApplicationRefusalReason(credit(), 100, 12.5, 'Invoice INV-9')).toMatch(/Enter the amount/);
  });
});

describe('status after applying', () => {
  it('stays open while something remains', () => {
    expect(statusAfterApplication(50_000, 30_000)).toBe('open');
  });

  it('is applied once nothing remains', () => {
    expect(statusAfterApplication(50_000, 50_000)).toBe('applied');
  });
});

describe('refunding what is left', () => {
  it('allows refunding a partly applied credit', () => {
    expect(creditRefundRefusalReason(credit({ appliedCents: 20_000 }))).toBeNull();
  });

  it('refuses when nothing is left, or it was already refunded', () => {
    expect(creditRefundRefusalReason(credit({ appliedCents: 50_000 }))).toMatch(/nothing left to refund/);
    expect(creditRefundRefusalReason(credit({ status: 'refunded' }))).toMatch(/already been refunded/);
  });
});
