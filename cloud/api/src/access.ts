export const firmRoles = ['owner', 'firm_admin', 'accountant', 'bookkeeper', 'payroll', 'viewer'] as const;
export type FirmRole = (typeof firmRoles)[number];

const permissions = {
  owner: ['firm:manage', 'company:read', 'company:write', 'ledger:post', 'payroll:run'],
  firm_admin: ['firm:manage', 'company:read', 'company:write', 'ledger:post', 'payroll:run'],
  accountant: ['company:read', 'company:write', 'ledger:post', 'payroll:run'],
  bookkeeper: ['company:read', 'company:write', 'ledger:post'],
  payroll: ['company:read', 'payroll:run'],
  viewer: ['company:read'],
} as const satisfies Record<FirmRole, readonly string[]>;

export type Permission = (typeof permissions)[FirmRole][number];

export function roleAllows(role: FirmRole, permission: Permission): boolean {
  return (permissions[role] as readonly string[]).includes(permission);
}
