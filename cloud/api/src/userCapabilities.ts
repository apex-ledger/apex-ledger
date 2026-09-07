import { roleAllows, type FirmRole } from './access.js';
import type { SubscriptionEntitlements } from './subscriptionEntitlements.js';

export interface UserCapabilities {
  showSimpleDashboard: boolean;
  showAdvancedAccounting: boolean;
  canEnterSalesAndExpenses: boolean;
  canPrepareTaxes: boolean;
  canPostAdjustments: boolean;
  canRunPayroll: boolean;
}

export function deriveUserCapabilities(
  entitlements: SubscriptionEntitlements,
  role: FirmRole,
  workspaceType: 'cpa_firm' | 'business',
): UserCapabilities {
  const canWriteBooks = roleAllows(role, 'company:write');
  const isAccountantReviewer = role === 'accountant' || role === 'firm_admin' || role === 'owner';
  return {
    showSimpleDashboard: workspaceType === 'business' && entitlements.accountingRead,
    showAdvancedAccounting: entitlements.advancedAccounting && roleAllows(role, 'company:read'),
    canEnterSalesAndExpenses: entitlements.simpleSalesExpenseEntry && canWriteBooks,
    canPrepareTaxes: entitlements.accountantCollaboration && isAccountantReviewer,
    // On Essentials, only the invited accountant/administrators receive the
    // limited adjustment workflow; the business owner keeps the simple UI.
    canPostAdjustments: entitlements.accountingWrite && roleAllows(role, 'ledger:post') &&
      (entitlements.advancedAccounting || role === 'accountant' || role === 'firm_admin'),
    canRunPayroll: entitlements.payrollWrite && roleAllows(role, 'payroll:run'),
  };
}
