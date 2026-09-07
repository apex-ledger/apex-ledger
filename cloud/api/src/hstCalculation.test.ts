import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateHst, hashBusinessTransactionRequest, HstCalculationError, suggestHstCode } from './hstCalculation.js';

describe('Essentials HST calculation', () => {
  it('calculates Ontario HST at exact rounded cents', () => {
    assert.deepEqual(calculateHst(22500, 'hst_13'), { baseCents: 22500, hstCents: 2925, totalCents: 25425 });
    assert.deepEqual(calculateHst(1, 'hst_13'), { baseCents: 1, hstCents: 0, totalCents: 1 });
  });

  it('supports exempt and explicit manual HST', () => {
    assert.equal(calculateHst(10000, 'hst_exempt').hstCents, 0);
    assert.deepEqual(calculateHst(10000, 'manual_hst', 777), { baseCents: 10000, hstCents: 777, totalCents: 10777 });
  });

  it('requires manual cents and rejects non-cent values', () => {
    assert.throws(() => calculateHst(10000, 'manual_hst'), HstCalculationError);
    assert.throws(() => calculateHst(10.5, 'hst_13'), HstCalculationError);
  });

  it('includes the calculated tax and company in the idempotency hash', () => {
    const input = {
      transactionType: 'sale' as const, transactionDate: '2026-08-29', description: 'Sale',
      bankAccountId: 'bank', categoryAccountId: 'sales', taxCode: 'hst_13' as const,
      baseCents: 10000, hstCents: 1300, totalCents: 11300,
    };
    const first = hashBusinessTransactionRequest('company-1', input);
    assert.equal(first, hashBusinessTransactionRequest('company-1', input));
    assert.notEqual(first, hashBusinessTransactionRequest('company-2', input));
  });

  it('suggests exempt for common exempt descriptions but never silently selects manual HST', () => {
    assert.equal(suggestHstCode('Monthly bank fees').taxCode, 'hst_exempt');
    assert.equal(suggestHstCode('Office supplies').taxCode, 'hst_13');
    assert.notEqual(suggestHstCode('Office supplies').taxCode, 'manual_hst');
  });
});
