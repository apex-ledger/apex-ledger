export type NavItem = {
  label: string;
  route: string;
  icon: string;
  group?: 'main' | 'master' | 'system';
};

export const ultimateSuiteNav: NavItem[] = [
  { label: 'Dashboard', route: '/dashboard', icon: 'LayoutDashboard', group: 'main' },
  { label: 'Sales', route: '/sales', icon: 'ReceiptText', group: 'main' },
  { label: 'Purchases', route: '/purchases', icon: 'ShoppingCart', group: 'main' },
  { label: 'Banking', route: '/banking', icon: 'Landmark', group: 'main' },
  { label: 'Expenses', route: '/expenses', icon: 'WalletCards', group: 'main' },
  { label: 'Inventory', route: '/inventory', icon: 'Boxes', group: 'main' },
  { label: 'GST/HST Centre', route: '/hst', icon: 'BadgePercent', group: 'main' },
  { label: 'Payroll', route: '/payroll', icon: 'UsersRound', group: 'main' },
  { label: 'Accounting', route: '/accounting', icon: 'Calculator', group: 'main' },
  { label: 'Reports', route: '/reports', icon: 'ChartNoAxesCombined', group: 'main' },
  { label: 'Tax & GIFI', route: '/tax-gifi', icon: 'FileSpreadsheet', group: 'main' },
  { label: 'Customers', route: '/customers', icon: 'ContactRound', group: 'master' },
  { label: 'Vendors', route: '/vendors', icon: 'Building2', group: 'master' },
  { label: 'Settings', route: '/settings', icon: 'Settings', group: 'system' }
];
