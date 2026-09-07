import { describe, expect, it } from 'vitest';
import { depositRefusalReason, isAwaitingDeposit, type DepositCandidate } from './undepositedFunds';

const UNDEPOSITED = 42;
const CHEQUING = 7;

function payment(overrides: Partial<DepositCandidate> = {}): DepositCandidate {
  return { status: 'paid', depositId: null, paymentAccountId: UNDEPOSITED, ...overrides };
}

describe('what is waiting to be banked', () => {
  it('includes a payment sitting in Undeposited Funds', () => {
    expect(isAwaitingDeposit(payment(), UNDEPOSITED)).toBe(true);
  });

  it('excludes one paid straight into a bank account', () => {
    // The whole point. Offering this for deposit posts Debit Bank / Credit Undeposited Funds a
    // second time: the bank is overstated and Undeposited Funds goes negative.
    expect(isAwaitingDeposit(payment({ paymentAccountId: CHEQUING }), UNDEPOSITED)).toBe(false);
  });

  it('excludes one already banked', () => {
    expect(isAwaitingDeposit(payment({ depositId: 3 }), UNDEPOSITED)).toBe(false);
  });

  it('excludes an invoice nobody has paid', () => {
    expect(isAwaitingDeposit(payment({ status: 'unpaid' }), UNDEPOSITED)).toBe(false);
  });

  it('excludes an invoice settled by a credit note', () => {
    // Applying a credit marks the invoice paid with no payment account — the same shape as a legacy
    // cash payment — but no money ever arrived. Depositing it would bank cash that does not exist.
    expect(isAwaitingDeposit(payment({ paymentAccountId: null, settledByCreditNote: true }), UNDEPOSITED)).toBe(false);
  });
});

describe('rows written before the account was recorded', () => {
  it('still counts as undeposited', () => {
    // Every one of those did go to Undeposited Funds. Reading null any other way would silently
    // change what past deposits mean.
    expect(isAwaitingDeposit(payment({ paymentAccountId: null }), UNDEPOSITED)).toBe(true);
  });

  it('is still excluded once banked', () => {
    expect(isAwaitingDeposit(payment({ paymentAccountId: null, depositId: 9 }), UNDEPOSITED)).toBe(false);
  });
});

describe('the reason given when it is refused', () => {
  it('says a directly-banked payment is not in Undeposited Funds', () => {
    expect(depositRefusalReason(payment({ paymentAccountId: CHEQUING }), UNDEPOSITED, 'INV-2026-0001')).toMatch(
      /straight into a bank account/i,
    );
  });

  it('says when it has already been deposited', () => {
    expect(depositRefusalReason(payment({ depositId: 2 }), UNDEPOSITED, 'INV-2026-0001')).toMatch(/already been deposited/i);
  });

  it('says when it has not been paid', () => {
    expect(depositRefusalReason(payment({ status: 'unpaid' }), UNDEPOSITED, 'INV-2026-0001')).toMatch(/not been paid/i);
  });

  it('says when a credit note, not money, settled it', () => {
    expect(depositRefusalReason(payment({ paymentAccountId: null, settledByCreditNote: true }), UNDEPOSITED, 'INV-2026-0001')).toMatch(/credit note/i);
  });

  it('names the document, so the message is actionable', () => {
    expect(depositRefusalReason(payment({ depositId: 2 }), UNDEPOSITED, 'INV-2026-0001')).toContain('INV-2026-0001');
  });

  it('gives no reason when the payment is fine', () => {
    expect(depositRefusalReason(payment(), UNDEPOSITED, 'INV-2026-0001')).toBeNull();
  });
});

describe('agreement between the two', () => {
  it('refuses exactly what it does not list, and no more', () => {
    // A screen that hides one thing while the handler refuses another is how a user ends up with a
    // button that silently does nothing.
    const cases: DepositCandidate[] = [
      payment(),
      payment({ paymentAccountId: null }),
      payment({ paymentAccountId: CHEQUING }),
      payment({ depositId: 1 }),
      payment({ status: 'unpaid' }),
      payment({ paymentAccountId: null, settledByCreditNote: true }),
    ];
    for (const candidate of cases) {
      const listed = isAwaitingDeposit(candidate, UNDEPOSITED);
      const refused = depositRefusalReason(candidate, UNDEPOSITED, 'INV-1') !== null;
      expect(listed).toBe(!refused);
    }
  });
});
