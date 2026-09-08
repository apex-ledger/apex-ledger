import { useEffect, useState } from 'react';
import { ACCESS_ROLE_LABELS, type AccessRole } from '@shared/domain/access';

export type { AccessRole } from '@shared/domain/access';
export { ACCESS_ROLE_LABELS } from '@shared/domain/access';
export const ACCESS_ROLE_EVENT = 'north-ledger-access-role-changed';
const STORAGE_KEY = 'northLedger.accessRole';

const VALID_ROLES = new Set<AccessRole>(Object.keys(ACCESS_ROLE_LABELS) as AccessRole[]);

/** On the web the server told us the seat's role at sign-in; that is the role, full stop. */
function webSeatRole(): { role: AccessRole; seatType: string } | null {
  const w = (window as unknown as { __apexWeb?: { user?: { accessRole?: AccessRole; seatType?: string } } }).__apexWeb;
  if (!w?.user?.accessRole || !VALID_ROLES.has(w.user.accessRole)) return null;
  return { role: w.user.accessRole, seatType: w.user.seatType ?? 'full' };
}

export function loadAccessRole(): AccessRole {
  const web = webSeatRole();
  if (web && web.seatType !== 'full') return web.role;
  const stored = sessionStorage.getItem(STORAGE_KEY) as AccessRole | null;
  return stored && VALID_ROLES.has(stored) && stored !== 'custom' ? stored : 'administrator';
}

export function storeAccessRole(role: AccessRole): void {
  const web = webSeatRole();
  const effective = web && web.seatType !== 'full' ? web.role : role;
  sessionStorage.setItem(STORAGE_KEY, effective);
  void window.api.access.setRole(effective);
  window.dispatchEvent(new CustomEvent(ACCESS_ROLE_EVENT, { detail: effective }));
}

/** Screens a seat may open beyond its role's usual list: a Bookkeeper seat also runs payroll and HST. */
const SEAT_EXTRA_DESTINATIONS: Record<string, string[]> = { bookkeeper: ['Payroll', 'GST/HST Centre', 'Sales Tax (GST/HST)'], business: ['Settings', 'GST/HST Centre', 'Sales Tax (GST/HST)'] };

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
  if (role === 'administrator' || role === 'custom') return true;
  const web = webSeatRole();
  if (web && SEAT_EXTRA_DESTINATIONS[web.seatType]?.includes(label)) return true;
  return ROLE_DESTINATIONS[role].has(label);
}
