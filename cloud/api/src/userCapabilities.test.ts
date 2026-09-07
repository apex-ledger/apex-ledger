import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveSubscriptionEntitlements } from './subscriptionEntitlements.js';
import { deriveUserCapabilities } from './userCapabilities.js';

const essentials = deriveSubscriptionEntitlements('essentials', 'active', false);

describe('Essentials user capabilities', () => {
  it('gives a business owner the simple entry interface without advanced accounting or payroll', () => {
    const capabilities = deriveUserCapabilities(essentials, 'owner', 'business');
    assert.equal(capabilities.showSimpleDashboard, true);
    assert.equal(capabilities.canEnterSalesAndExpenses, true);
    assert.equal(capabilities.showAdvancedAccounting, false);
    assert.equal(capabilities.canRunPayroll, false);
    assert.equal(capabilities.canPostAdjustments, false);
  });

  it('allows the invited accountant to prepare taxes and post limited adjustments', () => {
    const capabilities = deriveUserCapabilities(essentials, 'accountant', 'business');
    assert.equal(capabilities.canPrepareTaxes, true);
    assert.equal(capabilities.canPostAdjustments, true);
    assert.equal(capabilities.canRunPayroll, false);
  });
});
