import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { roleAllows } from './access.js';

describe('firm role permissions', () => {
  it('allows accountants to post but keeps viewers read-only', () => {
    assert.equal(roleAllows('accountant', 'ledger:post'), true);
    assert.equal(roleAllows('viewer', 'ledger:post'), false);
    assert.equal(roleAllows('viewer', 'company:read'), true);
  });

  it('does not expose payroll to ordinary bookkeepers', () => {
    assert.equal(roleAllows('bookkeeper', 'payroll:run'), false);
    assert.equal(roleAllows('payroll', 'payroll:run'), true);
  });
});
