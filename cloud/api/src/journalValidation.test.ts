import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashJournalRequest, JournalValidationError, validateJournalPost } from './journalValidation.js';

const balanced = {
  transactionDate: '2026-08-29', memo: 'Cash sale',
  lines: [
    { accountId: 'cash', debitCents: 11300, creditCents: 0 },
    { accountId: 'sales', debitCents: 0, creditCents: 10000 },
    { accountId: 'hst', debitCents: 0, creditCents: 1300 },
  ],
};

describe('cloud journal validation', () => {
  it('balances exact cents including HST', () => {
    assert.deepEqual(validateJournalPost(balanced), { debitCents: 11300, creditCents: 11300 });
  });

  it('rejects unbalanced entries and lines containing both sides', () => {
    assert.throws(() => validateJournalPost({ ...balanced, lines: balanced.lines.slice(0, 2) }), JournalValidationError);
    assert.throws(() => validateJournalPost({ ...balanced, lines: [
      { accountId: 'cash', debitCents: 100, creditCents: 100 },
      { accountId: 'sales', debitCents: 0, creditCents: 100 },
    ] }), JournalValidationError);
  });

  it('creates a stable idempotency hash and changes it when cents change', () => {
    const first = hashJournalRequest('company-1', balanced);
    assert.equal(first, hashJournalRequest('company-1', balanced));
    assert.notEqual(first, hashJournalRequest('company-1', {
      ...balanced, lines: balanced.lines.map((line, index) => index === 0 ? { ...line, debitCents: 11301 } : line),
    }));
  });
});
