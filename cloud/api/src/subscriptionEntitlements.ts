export const subscriptionPlanCodes = ['essentials', 'accounting', 'accounting_payroll'] as const;
export type SubscriptionPlanCode = (typeof subscriptionPlanCodes)[number];

export const subscriptionStatuses = ['trialing', 'active', 'past_due', 'suspended', 'canceled'] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export interface SubscriptionEntitlements {
  accountingRead: boolean;
  accountingWrite: boolean;
  simpleSalesExpenseEntry: boolean;
  salesTaxSummary: boolean;
  advancedAccounting: boolean;
  accountantCollaboration: boolean;
  payrollRead: boolean;
  payrollWrite: boolean;
}

export function deriveSubscriptionEntitlements(
  plan: SubscriptionPlanCode,
  status: SubscriptionStatus,
  hasPayrollHistory: boolean,
): SubscriptionEntitlements {
  const canRead = status !== 'canceled' && status !== 'suspended';
  const canWrite = status === 'trialing' || status === 'active';
  const includesPayroll = plan === 'accounting_payroll';
  const isEssentials = plan === 'essentials';
  return {
    accountingRead: canRead,
    accountingWrite: canWrite,
    simpleSalesExpenseEntry: canWrite,
    salesTaxSummary: canRead,
    advancedAccounting: canRead && !isEssentials,
    accountantCollaboration: canRead,
    payrollRead: canRead && (includesPayroll || hasPayrollHistory),
    payrollWrite: canWrite && includesPayroll,
  };
}
