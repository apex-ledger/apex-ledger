/** What each web seat may reach. One list, used on both sides: the server refuses requests outside
 * the seat's groups, and the screens hide the menus and buttons for the same things, so a person
 * never sees a door they cannot open.
 *
 * Business: its own books. Payroll Unlimited: payroll alone. Bookkeeper: books and payroll.
 * Full accountant: everything. The desktop has no seats and is never scoped. */
export type SeatType = 'business' | 'payroll' | 'bookkeeper' | 'full';

/** API groups (the part of a channel before the colon) a seat may call, or '*' for all. */
const COMMON_GROUPS = ['access', 'app', 'license', 'company', 'fiscalPeriods', 'accounts', 'appSettings', 'attachments', 'documentHistory', 'forms', 'voice', 'events', 'window', 'zoom', 'market', 'rows', 'clipboard', 'updater'];
const BOOKS_GROUPS = ['journal', 'quickEntry', 'reports', 'categoryRules', 'bankImport', 'qbImport', 'qbExport', 'customers', 'vendors', 'bills', 'estimates', 'purchaseOrders', 'mileage', 'tags', 'invoices', 'deposits', 'salesReceipts', 'creditNotes', 'hstFilings', 'salesReceiptPdf', 'invoicePdf', 'bankReconciliation', 'fixedAssets', 'approvals', 'actionCentre', 'recurringInvoices', 'paymentReminders', 'customerStatements', 'fx', 'fxRates', 'receiptInbox', 'budgets', 'loans', 'products', 'inventory', 'recurringTemplates', 'aiAssistant'];
const PAYROLL_GROUPS = ['employees', 'payrollRuns', 'payroll', 'shareholders', 't5Payments', 'roe', 'payrollItems', 'directDeposit', 'timeEntries'];
const ACCOUNTANT_GROUPS = ['gifi', 'workpapers', 'auditEngagement', 'cpaNotes', 'clients', 'reminders', 'deadlineAcks', 'appointments', 'letters', 'cca', 'clientOverview'];

export const SEAT_GROUPS: Record<SeatType, '*' | string[]> = {
  full: '*',
  bookkeeper: [...COMMON_GROUPS, ...BOOKS_GROUPS, ...PAYROLL_GROUPS],
  business: [...COMMON_GROUPS, ...BOOKS_GROUPS],
  payroll: [...COMMON_GROUPS, ...PAYROLL_GROUPS, 'reports', 'journal'],
};

/** Inside the reports group, a Payroll seat may run only payroll reports; a journal read is
 * allowed for the payroll journal view but nothing else. */
const PAYROLL_ONLY_CHANNELS = /^(reports:(employeeEarnings|activityLog|chequeRegister)|journal:(get|list|listByPeriod|listRecent))$/;

/** Reports that belong to the accountant's year end, not to the books: only a Full seat runs them. */
const ACCOUNTANT_REPORTS = /^reports:(yearEndSignoff|yearEndSignoffHistory|yearEndSignoffSign|gifiExport|gifiExportExcel|compliancePackage|auditExceptions|workingTrialBalance|changesInEquity|comprehensiveCompany)$/;

export function seatAllowsChannel(seat: SeatType, channel: string): boolean {
  const groups = SEAT_GROUPS[seat] ?? SEAT_GROUPS.full;
  if (groups === '*') return true;
  const group = channel.split(':')[0];
  if (!groups.includes(group)) return false;
  if (seat === 'payroll' && (group === 'reports' || group === 'journal')) return PAYROLL_ONLY_CHANNELS.test(channel);
  if (ACCOUNTANT_REPORTS.test(channel)) return false;
  return true;
}

export const SEAT_LABELS: Record<SeatType, string> = { business: 'Business', payroll: 'Payroll Unlimited', bookkeeper: 'Bookkeeper', full: 'Full accountant' };

/** Sidebar entries a seat sees (top-level labels). Full sees all. */
const ACCOUNTANT_NAV = ['Auditor Centre', 'Business Tax & GIFI', 'Audit', 'Access & Permissions'];
export const SEAT_NAV_HIDDEN: Record<SeatType, string[]> = {
  full: [],
  bookkeeper: ACCOUNTANT_NAV,
  business: [...ACCOUNTANT_NAV, 'Payroll', 'Approvals'],
  payroll: ['Dashboard', 'Action Centre', 'Sales & Payments', 'Expenses & Bills', 'Banking & Accounting', 'Chart of Accounts', 'Journal Entries', 'Fixed Assets', 'Approvals', 'General Ledger', 'Inventory', 'Projects', 'Sales Tax (GST/HST)', 'Auditor Centre', 'Month-End Close', 'Business Tax & GIFI', 'Settings', 'Access & Permissions', 'Audit', 'Tools', 'Quick Entry'],
};

/** Toolbar buttons: which family each seat may use. */
export function seatAllowsToolbar(seat: SeatType, family: 'books' | 'accountant' | 'crm'): boolean {
  if (seat === 'full') return true;
  if (family === 'books') return seat !== 'payroll';
  return false;
}

/** Where a seat lands after opening a company. */
export function seatHomeView(seat: SeatType): { kind: 'dashboard' } | { kind: 'payroll' } {
  return seat === 'payroll' ? { kind: 'payroll' } : { kind: 'dashboard' };
}
