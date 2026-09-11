import { describe, expect, it } from 'vitest';
import { currencyMatchRefusalReason, moneyAccountRefusalReason, type MoneyAccountCandidate } from './bankAccountRules';

const chequing: MoneyAccountCandidate = { id: 1, name: 'Chequing', accountSubtype: 'Cash and Bank', isActive: true };
const undeposited: MoneyAccountCandidate = { id: 2, name: 'Undeposited Funds', accountSubtype: 'Current Asset', isActive: true };
const revenue: MoneyAccountCandidate = { id: 3, name: 'Sales Revenue', accountSubtype: 'Operating Revenue', isActive: true };
const closed: MoneyAccountCandidate = { id: 4, name: 'Old Savings', accountSubtype: 'Cash and Bank', isActive: false };

describe('where money may land', () => {
  it('accepts an active Cash and Bank account', () => {
    expect(moneyAccountRefusalReason(chequing, 'make this deposit')).toBeNull();
  });

  it('refuses an account that does not exist', () => {
    expect(moneyAccountRefusalReason(undefined, 'pay this bill')).toMatch(/choose an account/i);
  });

  it('refuses an inactive bank account by name', () => {
    expect(moneyAccountRefusalReason(closed, 'pay this bill')).toMatch(/Old Savings is inactive/);
  });

  it('refuses a revenue account, and says what to pick instead', () => {
    const reason = moneyAccountRefusalReason(revenue, 'refund this credit');
    expect(reason).toMatch(/not a bank account/i);
    expect(reason).toMatch(/Cash and Bank account to refund this credit/);
  });

  it('refuses Undeposited Funds unless the caller parks cash there', () => {
    // A deposit INTO Undeposited Funds nets to zero and marks payments banked that never were.
    expect(moneyAccountRefusalReason(undeposited, 'make this deposit')).toMatch(/not a bank account/i);
    // Receive Payment and Sales Receipt legitimately hold cash there until a deposit.
    expect(moneyAccountRefusalReason(undeposited, 'receive this payment', { undepositedFundsAccountId: 2 })).toBeNull();
  });

  it('mentions Undeposited Funds as an option only when it is one', () => {
    expect(moneyAccountRefusalReason(revenue, 'record this receipt', { undepositedFundsAccountId: 2 })).toMatch(/or Undeposited Funds/);
    expect(moneyAccountRefusalReason(revenue, 'make this deposit')).not.toMatch(/Undeposited Funds/);
  });
});

describe('which currency an account may move', () => {
  const cad = { name: 'Chequing', currency: 'CAD' };
  const usd = { name: 'US Dollar Chequing', currency: 'USD' };
  const legacy = { name: 'Old Chequing' }; // opened before accounts carried a currency

  it('lets a Canadian-dollar account settle any document — the payment carries the rate', () => {
    expect(currencyMatchRefusalReason(cad, null, 'invoice INV-1')).toBeNull();
    expect(currencyMatchRefusalReason(cad, 'USD', 'invoice INV-2')).toBeNull();
    expect(currencyMatchRefusalReason(legacy, 'EUR', 'bill 7')).toBeNull();
  });

  it('lets a foreign account settle a document in its own currency', () => {
    expect(currencyMatchRefusalReason(usd, 'USD', 'invoice INV-2')).toBeNull();
  });

  it('refuses a CAD document through a foreign account, naming both currencies', () => {
    const reason = currencyMatchRefusalReason(usd, null, 'invoice INV-1');
    expect(reason).toMatch(/US Dollar Chequing is held in USD, but invoice INV-1 is in CAD/);
    expect(reason).toMatch(/Choose a Canadian-dollar account instead/);
  });

  it('refuses a document in a different foreign currency, offering that currency or CAD', () => {
    expect(currencyMatchRefusalReason(usd, 'EUR', 'bill 7')).toMatch(/Choose a EUR or Canadian-dollar account instead/);
  });

  it('lets a bill be paid with a credit card, but never a deposit into one', () => {
    const visa: MoneyAccountCandidate = { id: 9, name: 'Visa', accountSubtype: 'Credit Card', isActive: true };
    expect(moneyAccountRefusalReason(visa, 'pay this bill', { allowCreditCard: true })).toBeNull();
    expect(moneyAccountRefusalReason(visa, 'make this deposit')).toMatch(/not a bank account/);
    const supplies: MoneyAccountCandidate = { id: 10, name: 'Office Supplies', accountSubtype: 'Operating Expense', isActive: true };
    expect(moneyAccountRefusalReason(supplies, 'pay this bill', { allowCreditCard: true })).toMatch(/Cash and Bank account or Credit Card/);
  });
});
