import { useUiStore } from '../app/store/uiStore';

/* One source of truth for what each screen is called. Both the compact bar title and the large
 * page title read from here, so they can never drift apart. */
export const TITLES: Record<string, string> = {
  welcome: 'Welcome',
  dashboard: 'Dashboard',
  actionCentre: 'Action Centre',
  audit: 'Auditor Centre',
  fixedAssets: 'Fixed Assets',
  approvals: 'Approvals',
  reclassify: 'Reclassify Transactions',
  clientOverview: 'Client Overview',
  monthEndClose: 'Month-End Close',
  chartOfAccounts: 'Chart of Accounts',
  journalList: 'Journal Entries',
  journalForm: 'Journal Entry',
  quickEntry: 'Quick Entry',
  bulkExpenseImport: 'Bulk Expense Import',
  bankImport: 'Banking',
  companySettings: 'Settings',
  webAdmin: 'Administration',
  webSubscriptions: 'Subscriptions',
  hstCentre: 'GST/HST Centre',
  reportsHub: 'Reports',
  clientHub: 'Client Management (CRM)',
  forms: 'Forms',
  calendar: 'Calendar',
  accessPermissions: 'Access & Permissions',
  qbImport: 'Import Data (QuickBooks / Xero)',
  payroll: 'Payroll',
  customers: 'Customers',
  vendors: 'Vendors',
  purchases: 'Purchases',
  invoices: 'Invoices',
  creditNotes: 'Credit Notes',
  cpaReview: 'CPA Review',
  workpapers: 'Workpapers',
  accountantCentre: 'Accountant Centre',
  banking: 'Banking',
  invoiceEditor: 'Invoice',
  bankReconciliation: 'Bank Reconciliation',
  receiptInbox: 'Receipt Inbox',
  projects: 'Projects',
};

export const REPORT_TITLES: Record<string, string> = {
  comprehensiveCompany: 'Comprehensive Company Report',
  customTransactionDetail: 'Customizable Transaction Detail',
  trialBalance: 'Trial Balance',
  generalLedger: 'General Ledger',
  incomeStatement: 'Income Statement',
  balanceSheet: 'Balance Sheet',
  gifiExport: 'GIFI Export',
  projections: 'Projections',
  hstSummary: 'GST/HST Payable',
  hstReconciliation: 'GST/HST Reconciliation',
  hstQuickMethod: 'GST/HST Quick Method',
  hstFiling: 'GST/HST Return',
  auditTrail: 'Audit Trail / Change History',
  sourceDocuments: 'Source Documents & Missing Evidence',
  bankDepositAnalysis: 'Bank Deposit Analysis',
  payrollRegister: 'Payroll Register',
  hstWorkingPaper: 'GST/HST Return Working Paper',
  fixedAssetContinuity: 'Fixed Asset / CCA Continuity',
  shareholderContinuity: 'Shareholder & Related-Party Continuity',
  inventoryContinuity: 'Inventory Movement & Valuation',
  debtContinuity: 'Debt Continuity',
  t2Reconciliation: 'T2 Preliminary Tax Reconciliation',
  employeeEarnings: 'Employee Earnings Record',
  auditExceptions: 'Audit Exceptions',
  yearEndSignoff: 'Year-End Sign-off',
  accountList: 'Account List',
  activityLog: 'Activity Log',
  adjustingEntries: 'Adjusting Entries',
  agingPayable: 'A/P Ageing',
  agingReceivable: 'A/R Ageing',
  balanceSheetComparison: 'Balance Sheet Comparison',
  balanceSheetDetail: 'Balance Sheet Detail',
  balanceSheetSummary: 'Balance Sheet Summary',
  billApproval: 'Bill Approval Status',
  budgetVsActual: 'Budget vs Actual',
  businessPerformance: 'Business Performance',
  businessSnapshot: 'Business Snapshot',
  cashFlow: 'Statement of Cash Flows',
  changesInEquity: 'Statement of Changes in Equity',
  chequeRegister: 'Cheque Register',
  customerStatement: 'Customer Statement',
  expensesByVendor: 'Expenses by Vendor',
  invalidTransactions: 'Invalid Transactions',
  inventoryStatus: 'Inventory Status',
  journalReport: 'Journal Report',
  loanSchedule: 'Loan Schedule',
  periodStatements: 'P&L by Period',
  profitAndLossByCustomer: 'P&L by Customer',
  profitAndLossByTag: 'P&L by Tag Group',
  profitAndLossDetail: 'Profit & Loss Detail',
  reconciliationReport: 'Reconciliation Report',
  salesByCustomer: 'Sales by Customer',
  workingTrialBalance: 'Working Trial Balance',
};

/** The current screen's title, or null on screens that don't declare one. */
/** The title a view shows in the strip, usable outside React (the Back button names the page it
 * returns to). A hub group reads as "Reports · Who owes you". */
export function titleForView(view: { kind: string; report?: string; group?: string; tab?: string }): string | null {
  if (view.kind === 'report' && view.report) return REPORT_TITLES[view.report] ?? null;
  if (view.kind === 'reportsHub' && view.group) return `Reports · ${view.group}`;
  return TITLES[view.kind] ?? SECTIONS[view.kind] ?? null;
}

export function usePageTitle(): string | null {
  const view = useUiStore((s) => s.view);
  return (view.kind === 'report' ? REPORT_TITLES[view.report] : TITLES[view.kind]) ?? null;
}

/** The section a screen belongs to, shown ahead of its title so the strip reads "Payroll › Pay
 * Stub" and there is never any doubt which tab is open. */
const SECTIONS: Record<string, string> = {
  invoices: 'Sales', invoiceEditor: 'Sales', salesReceipts: 'Sales', salesReceiptEditor: 'Sales', estimates: 'Sales', estimateEditor: 'Sales', customers: 'Sales', creditNotes: 'Sales', deposits: 'Sales', sales: 'Sales',
  purchases: 'Expenses', vendors: 'Expenses', purchaseOrders: 'Expenses', purchaseOrderEditor: 'Expenses', expenses: 'Expenses', mileage: 'Expenses', receiptInbox: 'Banking',
  banking: 'Banking', bankImport: 'Banking', bankReconciliation: 'Banking', transactions: 'Banking',
  chartOfAccounts: 'Accounting', journalList: 'Accounting', journalForm: 'Accounting', fixedAssets: 'Accounting', monthEndClose: 'Accounting', taxGifi: 'Accounting',
  products: 'Inventory', projects: 'Projects', tags: 'Settings', companySettings: 'Settings', accessPermissions: 'Settings', webAdmin: 'Administration',
  payroll: 'Payroll', paystub: 'Payroll', hstCentre: 'Sales Tax (GST/HST)',
  approvals: 'Accounting', reclassify: 'Accountant', reportsHub: 'Reports', report: 'Reports', audit: 'Auditor', accountantCentre: 'Accountant', workpapers: 'Accountant', cpaReview: 'Accountant', clientHub: 'CRM',
};

export function usePageBreadcrumb(): { section: string | null; title: string | null } {
  const view = useUiStore((s) => s.view);
  const title = (view.kind === 'report' ? REPORT_TITLES[view.report] : TITLES[view.kind]) ?? null;
  const section = SECTIONS[view.kind] ?? null;
  return { section: section && section !== title ? section : null, title };
}
