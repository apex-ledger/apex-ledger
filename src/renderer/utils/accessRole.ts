import { useEffect, useState } from 'react';
import { ACCESS_ROLE_LABELS, type AccessRole } from '@shared/domain/access';

export type { AccessRole } from '@shared/domain/access';
export { ACCESS_ROLE_LABELS } from '@shared/domain/access';
export const ACCESS_ROLE_EVENT = 'north-ledger-access-role-changed';
const STORAGE_KEY = 'northLedger.accessRole';

const VALID_ROLES = new Set<AccessRole>(Object.keys(ACCESS_ROLE_LABELS) as AccessRole[]);

export function loadAccessRole(): AccessRole {
  const stored = sessionStorage.getItem(STORAGE_KEY) as AccessRole | null;
  return stored && VALID_ROLES.has(stored) && stored !== 'custom' ? stored : 'administrator';
}

export function storeAccessRole(role: AccessRole): void {
  sessionStorage.setItem(STORAGE_KEY, role);
  void window.api.access.setRole(role);
  window.dispatchEvent(new CustomEvent(ACCESS_ROLE_EVENT, { detail: role }));
}

export function useAccessRole(): AccessRole {
  const [role, setRole] = useState<AccessRole>(loadAccessRole);
  useEffect(() => {
    const update = () => {
      const next = loadAccessRole();
      setRole(next);
      void window.api.access.setRole(next);
    };
    update();
    window.addEventListener(ACCESS_ROLE_EVENT, update);
    return () => {
      window.removeEventListener(ACCESS_ROLE_EVENT, update);
    };
  }, []);
  return role;
}

const ROLE_DESTINATIONS: Record<Exclude<AccessRole, 'administrator' | 'custom'>, Set<string>> = {
  accountant: new Set(['Dashboard', 'Bookkeeping Checklist', 'Month-End Close', 'Banking', 'GST/HST Centre', 'Chart of Accounts', 'Accounting', 'Reports', 'Tax & GIFI', 'Customers', 'Vendors', 'Settings', 'Access & Permissions', 'Forms', 'Audit', 'Tools', 'User Guide']),
  bookkeeper: new Set(['Dashboard', 'Bookkeeping Checklist', 'Month-End Close', 'Sales', 'Purchases', 'Banking', 'Expenses', 'Inventory', 'GST/HST Centre', 'Reports', 'Customers', 'Vendors', 'Access & Permissions', 'Calendar', 'Forms', 'Tools', 'User Guide']),
  payroll: new Set(['Dashboard', 'Bookkeeping Checklist', 'Month-End Close', 'Payroll', 'Reports', 'Settings', 'Access & Permissions', 'Calendar', 'Forms', 'User Guide']),
  accountsReceivable: new Set(['Dashboard', 'Sales', 'Customers', 'Reports', 'Access & Permissions', 'User Guide']),
  accountsPayable: new Set(['Dashboard', 'Purchases', 'Vendors', 'Reports', 'Access & Permissions', 'User Guide']),
  readOnly: new Set(['Dashboard', 'Bookkeeping Checklist', 'Month-End Close', 'Sales', 'Purchases', 'Banking', 'Expenses', 'Inventory', 'GST/HST Centre', 'Payroll', 'Chart of Accounts', 'Accounting', 'Reports', 'Tax & GIFI', 'Customers', 'Vendors', 'Access & Permissions', 'Calendar', 'Forms', 'Audit', 'User Guide', 'About']),
};

export function roleCanSee(role: AccessRole, label: string): boolean {
  return role === 'administrator' || role === 'custom' || ROLE_DESTINATIONS[role].has(label);
}
