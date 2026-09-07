export type AccessRole =
  | 'administrator'
  | 'accountant'
  | 'bookkeeper'
  | 'payroll'
  | 'accountsReceivable'
  | 'accountsPayable'
  | 'readOnly'
  | 'custom';

export type AccessPermission =
  | 'company'
  | 'users'
  | 'sales'
  | 'purchases'
  | 'banking'
  | 'accounting'
  | 'payroll'
  | 'tax'
  | 'inventory';

export type CompanyUserStatus = 'pending' | 'active' | 'suspended';

export interface AccessIdentity {
  key: string;
  name: string;
  email: string | null;
}

export interface AccessSessionUser extends AccessIdentity {
  role: AccessRole;
}

export interface CompanyUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: AccessRole;
  permissions: AccessPermission[];
  status: CompanyUserStatus;
  invitedAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export const ACCESS_ROLE_LABELS: Record<AccessRole, string> = {
  administrator: 'Administrator — all access',
  accountant: 'Accountant — accounting and tax',
  bookkeeper: 'Bookkeeper — daily transactions',
  payroll: 'Payroll only',
  accountsReceivable: 'Customers and A/R only',
  accountsPayable: 'Vendors and A/P only',
  readOnly: 'Read-only',
  custom: 'Custom role',
};

export const ALL_ACCESS_PERMISSIONS: AccessPermission[] = ['company', 'users', 'sales', 'purchases', 'banking', 'accounting', 'payroll', 'tax', 'inventory'];

export const ROLE_PERMISSIONS: Record<AccessRole, AccessPermission[]> = {
  administrator: ALL_ACCESS_PERMISSIONS,
  accountant: ['sales', 'purchases', 'banking', 'accounting', 'tax', 'inventory'],
  bookkeeper: ['sales', 'purchases', 'banking', 'inventory'],
  payroll: ['payroll'],
  accountsReceivable: ['sales'],
  accountsPayable: ['purchases'],
  readOnly: [],
  custom: [],
};
