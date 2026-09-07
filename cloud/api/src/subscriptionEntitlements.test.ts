import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveSubscriptionEntitlements } from './subscriptionEntitlements.js';

describe('subscription entitlements', () => {
  it('keeps payroll unavailable on the Accounting plan', () => {
    assert.deepEqual(deriveSubscriptionEntitlements('accounting', 'active', false), {
      accountingRead: true, accountingWrite: true, simpleSalesExpenseEntry: true,
      salesTaxSummary: true, advancedAccounting: true, accountantCollaboration: true,
      payrollRead: false, payrollWrite: false,
    });
  });

  it('enables payroll immediately after upgrading', () => {
    assert.equal(deriveSubscriptionEntitlements('accounting_payroll', 'active', false).payrollWrite, true);
  });

  it('keeps payroll history read-only after downgrading', () => {
    assert.deepEqual(deriveSubscriptionEntitlements('accounting', 'active', true), {
      accountingRead: true, accountingWrite: true, simpleSalesExpenseEntry: true,
      salesTaxSummary: true, advancedAccounting: true, accountantCollaboration: true,
      payrollRead: true, payrollWrite: false,
    });
  });

  it('makes a past-due subscription read-only and blocks a canceled subscription', () => {
    assert.equal(deriveSubscriptionEntitlements('accounting_payroll', 'past_due', true).payrollWrite, false);
    assert.equal(deriveSubscriptionEntitlements('accounting_payroll', 'past_due', true).payrollRead, true);
    assert.deepEqual(deriveSubscriptionEntitlements('accounting_payroll', 'canceled', true), {
      accountingRead: false, accountingWrite: false, simpleSalesExpenseEntry: false,
      salesTaxSummary: false, advancedAccounting: false, accountantCollaboration: false,
      payrollRead: false, payrollWrite: false,
    });
  });

  it('blocks a support-suspended subscription until it is reactivated',()=>{
    const suspended=deriveSubscriptionEntitlements('accounting','suspended',false);
    assert.equal(suspended.accountingRead,false);assert.equal(suspended.accountingWrite,false);
  });

  it('keeps Essentials simple while allowing accountant collaboration', () => {
    assert.deepEqual(deriveSubscriptionEntitlements('essentials', 'active', false), {
      accountingRead: true, accountingWrite: true, simpleSalesExpenseEntry: true,
      salesTaxSummary: true, advancedAccounting: false, accountantCollaboration: true,
      payrollRead: false, payrollWrite: false,
    });
  });
});
