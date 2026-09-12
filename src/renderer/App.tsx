import { useEffect, useMemo, useRef, useState } from 'react';
import { useUiStore, type ReportKind } from './app/store/uiStore';
import { useDataChangeStore } from './app/store/dataChangeStore';
import { CloseConfirmModal } from './components/CloseConfirmModal';
import { NavigationConfirmModal } from './components/NavigationConfirmModal';
import { ConfirmModalHost } from './components/ConfirmModalHost';
import { AppShell } from './layout/AppShell';
import { LoginGate, WelcomePage } from './features/welcome/WelcomePage';
import { LicenseGatePage } from './features/licensing/LicenseGatePage';
import { NewCompanyModal } from './features/company/NewCompanyModal';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ClientOverviewPage } from './features/accountant-centre/ClientOverviewPage';
import { ActionCentrePage } from './features/action-centre/ActionCentrePage';
import { FixedAssetsPage } from './features/fixed-assets/FixedAssetsPage';
import { ApprovalsPage } from './features/approvals/ApprovalsPage';
import { MonthEndClosePage } from './features/month-end-close/MonthEndClosePage';
import { CompanySettingsPage } from './features/company-settings/CompanySettingsPage';
import { WebAdminPage } from './features/company-settings/WebAdminPage';
import { WebSubscriptionsPage } from './features/company-settings/WebSubscriptionsSection';
import { ChartOfAccountsPage } from './features/chart-of-accounts/ChartOfAccountsPage';
import { JournalEntryListPage } from './features/journal-entries/JournalEntryListPage';
import { JournalEntryFormPage } from './features/journal-entries/JournalEntryFormPage';
import { QuickEntryPage } from './features/quick-entry/QuickEntryPage';
import { BulkExpenseImportPage } from './features/quick-entry/BulkExpenseImportPage';
import { BankImportPage } from './features/bank-import/BankImportPage';
import { TrialBalancePage } from './features/reports/TrialBalancePage';
import { GeneralLedgerPage } from './features/reports/GeneralLedgerPage';
import { IncomeStatementPage } from './features/reports/IncomeStatementPage';
import { BalanceSheetPage } from './features/reports/BalanceSheetPage';
import { GifiExportPage } from './features/reports/GifiExportPage';
import { ProjectionsPage } from './features/reports/ProjectionsPage';
import { HstSummaryPage } from './features/reports/HstSummaryPage';
import { HstReconciliationPage } from './features/reports/HstReconciliationPage';
import { ReportsHubPage } from './features/reports/ReportsHubPage';
import { HstCentrePage } from './features/hst-centre/HstCentrePage';
import { TaxGifiCentrePage } from './features/tax-gifi/TaxGifiCentrePage';
import { HstQuickMethodPage } from './features/reports/HstQuickMethodPage';
import { HstFilingPage } from './features/hst-centre/HstFilingPage';
import { BusinessPerformancePage } from './features/reports/BusinessPerformancePage';
import { PeriodStatementsPage } from './features/reports/PeriodStatementsPage';
import { AccountListPage } from './features/reports/AccountListPage';
import { AgingReportPage } from './features/reports/AgingReportPage';
import { SalesByCustomerPage } from './features/reports/SalesByCustomerPage';
import { ClientHubPage } from './features/client-hub/ClientHubPage';
import { PayrollPage } from './features/payroll/PayrollPage';
import { CreditNotesPage } from './features/credit-notes/CreditNotesPage';
import { CpaReviewPage } from './features/cpa-review/CpaReviewPage';
import { WorkpapersPage } from './features/workpapers/WorkpapersPage';
import { AccountantCentrePage } from './features/accountant-centre/AccountantCentrePage';
import { BankingCentrePage } from './features/banking/BankingCentrePage';
import { TransactionsPage } from './features/transactions/TransactionsPage';
import { InvoiceEditorPage } from './features/invoices/InvoiceEditorPage';
import { SalesReceiptEditorPage } from './features/sales-receipts/SalesReceiptEditorPage';
import { CashFlowStatementPage } from './features/reports/CashFlowStatementPage';
import { ChangesInEquityPage } from './features/reports/ChangesInEquityPage';
import { AdjustingEntriesPage } from './features/reports/AdjustingEntriesPage';
import { ProfitAndLossDetailPage } from './features/reports/ProfitAndLossDetailPage';
import { ProfitAndLossByCustomerPage } from './features/reports/ProfitAndLossByCustomerPage';
import { BusinessSnapshotPage } from './features/reports/BusinessSnapshotPage';
import { JournalReportPage } from './features/reports/JournalReportPage';
import { InvalidTransactionsPage } from './features/reports/InvalidTransactionsPage';
import { InventoryStatusPage } from './features/reports/InventoryStatusPage';
import { WorkingTrialBalancePage } from './features/reports/WorkingTrialBalancePage';
import { ExpensesByVendorPage } from './features/reports/ExpensesByVendorPage';
import { CustomerStatementPage } from './features/reports/CustomerStatementPage';
import { ChequeRegisterPage } from './features/reports/ChequeRegisterPage';
import { ActivityLogPage } from './features/reports/ActivityLogPage';
import { CcaSchedulePage } from './features/reports/CcaSchedulePage';
import { EmployeeEarningsPage } from './features/reports/EmployeeEarningsPage';
import { AuditExceptionsPage } from './features/reports/AuditExceptionsPage';
import { LoanSchedulePage } from './features/reports/LoanSchedulePage';
import { SalesTaxDetailPage } from './features/reports/SalesTaxDetailPage';
import { BudgetVsActualPage } from './features/reports/BudgetVsActualPage';
import { ReconciliationReportPage } from './features/reports/ReconciliationReportPage';
import { ComplianceReportPage, type ComplianceReportPageKind } from './features/reports/ComplianceReportPage';
import { ComprehensiveCompanyReportPage } from './features/reports/ComprehensiveCompanyReportPage';
import { CustomTransactionDetailPage } from './features/reports/CustomTransactionDetailPage';
import { ProductsPage } from './features/inventory/ProductsPage';
import { TagsPage } from './features/tags/TagsPage';
import { SalesPage } from './features/sales/SalesPage';
import { EstimateEditorPage } from './features/estimates/EstimateEditorPage';
import { PurchaseOrdersPage } from './features/purchase-orders/PurchaseOrdersPage';
import { PurchaseOrderEditorPage } from './features/purchase-orders/PurchaseOrderEditorPage';
import { ExpensesPage } from './features/expenses/ExpensesPage';
import { ProfitAndLossByTagPage } from './features/reports/ProfitAndLossByTagPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { BillApprovalPage } from './features/reports/BillApprovalPage';
import { BalanceSheetVariantsPage } from './features/reports/BalanceSheetVariantsPage';
import { BankReconciliationPage } from './features/bank-reconciliation/BankReconciliationPage';
import { ReceiptInboxPage } from './features/receipt-inbox/ReceiptInboxPage';
import { PaystubPage } from './features/payroll/PaystubPage';
import { FormsPage } from './features/forms/FormsPage';
import { UserGuidePage } from './features/user-guide/UserGuidePage';
import { ToolsPage } from './features/tools/ToolsPage';
import { ReportActions, ReportGeneratedStamp } from './components/ReportActions';
import { ReportPeriodControls } from './components/ReportPeriodControls';
import { KnowledgeBasePage } from './features/knowledge-base/KnowledgeBasePage';
import { AuditorCentrePage } from './features/audit/AuditorCentrePage';
import { CalendarPage } from './features/calendar/CalendarPage';
import { QuickBooksImportPage } from './features/qb-import/QuickBooksImportPage';
import { AboutPage } from './features/about/AboutPage';
import { WhatsNewPage } from './features/whats-new/WhatsNewPage';
import { ReclassifyPage } from './features/accountant-centre/ReclassifyPage';
import { YearEndSignoffPage } from './features/reports/YearEndSignoffPage';
import { BackButton } from './components/BackButton';
import { AccessPermissionsPage } from './features/access-permissions/AccessPermissionsPage';
import { FONT_SIZES } from './utils/fontSize';
import { fontStackFor } from './utils/fontFamily';
import { loadFavouritePages, toggleFavouritePage } from './utils/favouritePages';
import { SalesTaxByProvincePage } from './features/reports/SalesTaxByProvincePage';

/** What an exported file is called. A folder of generic report names is unusable, and the
 * report's own name is the only thing that tells them apart later. */
const REPORT_FILE_NAMES: Partial<Record<ReportKind, string>> = {
  salesTaxByProvince: 'Sales Tax by Province',
  comprehensiveCompany: 'Comprehensive Company Report',
  customTransactionDetail: 'Customizable Transaction Detail',
  trialBalance: 'Trial Balance',
  workingTrialBalance: 'Working Trial Balance',
  balanceSheet: 'Balance Sheet',
  balanceSheetSummary: 'Balance Sheet Summary',
  balanceSheetDetail: 'Balance Sheet Detail',
  balanceSheetComparison: 'Balance Sheet Comparison',
  incomeStatement: 'Profit and Loss Summary',
  profitAndLossDetail: 'Profit and Loss Detail',
  profitAndLossByCustomer: 'P&L by Customer',
  periodStatements: 'P&L by Period',
  cashFlow: 'Statement of Cash Flows',
  changesInEquity: 'Statement of Changes in Equity',
  adjustingEntries: 'Adjusting Entries',
  journalReport: 'Journal',
  generalLedger: 'General Ledger',
  invalidTransactions: 'Invalid Transactions',
  chequeRegister: 'Cheque Register',
  activityLog: 'Activity Log',
  employeeEarnings: 'Employee Earnings Record',
  auditExceptions: 'Audit Exceptions',
  yearEndSignoff: 'Year-End Sign-off',
  accountList: 'Account List',
  gifiExport: 'GIFI Export',
  agingReceivable: 'Accounts Receivable Ageing',
  agingPayable: 'Accounts Payable Ageing',
  customerStatement: 'Customer Statement',
  salesByCustomer: 'Sales by Customer',
  expensesByVendor: 'Expenses by Vendor',
  inventoryStatus: 'Inventory Status',
  ccaSchedule: 'CCA Schedule',
  loanSchedule: 'Loan Schedule',
  salesTaxDetail: 'Sales Tax Detail',
  budgetVsActual: 'Budget vs Actual',
  reconciliationReport: 'Reconciliation Report',
  auditTrail: 'Audit Trail',
  sourceDocuments: 'Source Documents and Missing Evidence',
  bankDepositAnalysis: 'Bank Deposit Analysis',
  payrollRegister: 'Payroll Register',
  hstWorkingPaper: 'GST-HST Return Working Paper',
  fixedAssetContinuity: 'Fixed Asset and CCA Continuity',
  shareholderContinuity: 'Shareholder Continuity',
  inventoryContinuity: 'Inventory Continuity',
  debtContinuity: 'Debt Continuity',
  t2Reconciliation: 'T2 Preliminary Tax Reconciliation',
  profitAndLossByTag: 'Profit & Loss by Tag Group',
  billApproval: 'Bill Approval Status',
  businessSnapshot: 'Business Snapshot',
  businessPerformance: 'Business Performance',
  projections: 'Projections',
};

function ReportView({ report }: { report: ReportKind }) {
  const setView = useUiStore((s) => s.setView);
  const reportRef = useRef<HTMLDivElement>(null);
  const [favourites, setFavourites] = useState(() => loadFavouritePages());
  const favouriteKey = `report:${report}` as const;
  const generatedAt = useMemo(
    () => new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZoneName: 'short',
    }).format(new Date()),
    [report],
  );

  function renderReport() {
    switch (report) {
      case 'comprehensiveCompany':
        return <ComprehensiveCompanyReportPage />;
      case 'customTransactionDetail':
        return <CustomTransactionDetailPage />;
      case 'periodStatements':
        return <PeriodStatementsPage />;
      case 'accountList':
        return <AccountListPage />;
      case 'agingReceivable':
        return <AgingReportPage direction="receivable" />;
      case 'agingPayable':
        return <AgingReportPage direction="payable" />;
      case 'salesByCustomer':
        return <SalesByCustomerPage />;
      case 'cashFlow':
        return <CashFlowStatementPage />;
      case 'changesInEquity':
        return <ChangesInEquityPage />;
      case 'adjustingEntries':
        return <AdjustingEntriesPage />;
      case 'profitAndLossDetail':
        return <ProfitAndLossDetailPage />;
      case 'profitAndLossByCustomer':
        return <ProfitAndLossByCustomerPage />;
      case 'businessSnapshot':
        return <BusinessSnapshotPage />;
      case 'journalReport':
        return <JournalReportPage />;
      case 'invalidTransactions':
        return <InvalidTransactionsPage />;
      case 'inventoryStatus':
        return <InventoryStatusPage />;
      case 'workingTrialBalance':
        return <WorkingTrialBalancePage />;
      case 'expensesByVendor':
        return <ExpensesByVendorPage />;
      case 'customerStatement':
        return <CustomerStatementPage />;
      case 'chequeRegister':
        return <ChequeRegisterPage />;
      case 'activityLog':
        return <ActivityLogPage />;
      case 'employeeEarnings':
        return <EmployeeEarningsPage />;
      case 'auditExceptions':
        return <AuditExceptionsPage />;
      case 'yearEndSignoff':
        return <YearEndSignoffPage />;
      case 'ccaSchedule':
        return <CcaSchedulePage />;
      case 'loanSchedule':
        return <LoanSchedulePage />;
      case 'salesTaxDetail':
        return <SalesTaxDetailPage />;
      case 'budgetVsActual':
        return <BudgetVsActualPage />;
      case 'reconciliationReport':
        return <ReconciliationReportPage />;
      case 'profitAndLossByTag':
        return <ProfitAndLossByTagPage />;
      case 'billApproval':
        return <BillApprovalPage />;
      case 'balanceSheetSummary':
        return <BalanceSheetVariantsPage variant="summary" />;
      case 'balanceSheetDetail':
        return <BalanceSheetVariantsPage variant="detail" />;
      case 'balanceSheetComparison':
        return <BalanceSheetVariantsPage variant="comparison" />;
      case 'trialBalance':
        return <TrialBalancePage />;
      case 'generalLedger':
        return <GeneralLedgerPage />;
      case 'incomeStatement':
        return <IncomeStatementPage />;
      case 'balanceSheet':
        return <BalanceSheetPage />;
      case 'gifiExport':
        return <GifiExportPage />;
      case 'projections':
        return <ProjectionsPage />;
      case 'hstSummary':
        return <HstSummaryPage />;
      case 'salesTaxByProvince':
        return <SalesTaxByProvincePage />;
      case 'hstReconciliation':
        return <HstReconciliationPage />;
      case 'hstQuickMethod':
        return <HstQuickMethodPage />;
      case 'hstFiling':
        return <HstFilingPage />;
      case 'businessPerformance':
        return <BusinessPerformancePage />;
      case 'auditTrail':
      case 'sourceDocuments':
      case 'bankDepositAnalysis':
      case 'payrollRegister':
      case 'hstWorkingPaper':
      case 'fixedAssetContinuity':
      case 'shareholderContinuity':
      case 'inventoryContinuity':
      case 'debtContinuity':
      case 't2Reconciliation':
        return <ComplianceReportPage report={report as ComplianceReportPageKind} />;
    }
  }

  // Export lives here rather than on each report, so all of them get it and none can be forgotten.
  // It reads the tables already rendered below, which means what leaves the app is exactly what is
  // on screen — same dates, same filters, same toggles.
  return (
    <div className="w-full min-w-0 space-y-2">
      {/* One toolbar row: navigation, period, export and favourites together — no stacked bands above the sheet. */}
      <div className="flex flex-wrap items-center gap-2">
        <BackButton fallback={{ kind: 'reportsHub' }} fallbackLabel="Reports" />
        <ReportPeriodControls targetRef={reportRef} reportKey={report} />
        <ReportActions targetRef={reportRef} reportName={REPORT_FILE_NAMES[report] ?? 'Report'} generatedAt={generatedAt} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {report !== 'journalReport' && (
            <button
              type="button"
              onClick={() => setView({ kind: 'report', report: 'journalReport' })}
              className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
              title="Open the transaction list; use Open Entry on a row to return to the invoice, bill, receipt, payroll, tax filing, or journal entry"
            >
              ↗ Trace Source Entries
            </button>
          )}
          <button
            type="button"
            onClick={() => setFavourites((current) => toggleFavouritePage(current, favouriteKey))}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
              favourites.has(favouriteKey) ? 'border-gold-300 bg-gold-100 text-gold-900' : 'border-gray-300 bg-white text-gray-600 hover:bg-gold-50'
            }`}
          >
            {favourites.has(favouriteKey) ? '★ Favourite' : '☆ Add to favourites'}
          </button>
        </div>
      </div>
      <div ref={reportRef} className="w-full min-w-0">
        <ReportGeneratedStamp generatedAt={generatedAt} />
        {renderReport()}
      </div>
    </div>
  );
}

export default function App() {
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  // A hook for the automated lesson checks and screenshots (scripts drive the app over CDP); harmless in normal use.
  useEffect(() => { (window as unknown as { __apexSetView?: typeof setView }).__apexSetView = setView; }, [setView]);
  const refreshNonce = useUiStore((s) => s.refreshNonce);
  const setCompany = useUiStore((s) => s.setCompany);
  const showNewCompanyModal = useUiStore((s) => s.showNewCompanyModal);
  const setShowNewCompanyModal = useUiStore((s) => s.setShowNewCompanyModal);
  const colorScheme = useUiStore((s) => s.colorScheme);
  const fontSize = useUiStore((s) => s.fontSize);
  const fontFamily = useUiStore((s) => s.fontFamily);
  const zoomPercent = useUiStore((s) => s.zoomPercent);
  const companyPath = useUiStore((s) => s.companyPath);
  const sessionLocked = useUiStore((s) => s.sessionLocked);
  const setSessionLocked = useUiStore((s) => s.setSessionLocked);
  const [licenseChecked, setLicenseChecked] = useState(false);
  const [licensed, setLicensed] = useState(false);
  const [licenseError, setLicenseError] = useState<string | undefined>(undefined);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', colorScheme);
  }, [colorScheme]);

  useEffect(() => {
    const rootPx = FONT_SIZES.find((f) => f.id === fontSize)?.rootPx ?? 16;
    document.documentElement.style.fontSize = `${rootPx}px`;
  }, [fontSize]);

  useEffect(() => {
    document.documentElement.style.fontFamily = fontStackFor(fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    window.api.zoom.set(zoomPercent / 100);
  }, [zoomPercent]);

  useEffect(() => {
    window.api.license.status().then((r) => {
      setLicensed(r.ok && r.data.licensed);
      setLicenseError(r.ok ? r.data.error : r.error);
      setLicenseChecked(true);
    });
  }, []);

  const bumpDataVersion = useDataChangeStore((s) => s.bump);

  // The sign-in log closes the session on lock and opens a new one on unlock. Fire-and-forget:
  // the lock itself is renderer state and must never wait on, or fail because of, the log.
  const lockLogged = useRef(false);
  useEffect(() => {
    if (!companyPath) return;
    if (sessionLocked) {
      lockLogged.current = true;
      void window.api.access.recordLock();
    } else if (lockLogged.current) {
      lockLogged.current = false;
      void window.api.access.recordUnlock();
    }
  }, [sessionLocked, companyPath]);

  useEffect(() => {
    const unsubscribeChanged = window.api.events.onCompanyChanged((event) => {
      setCompany(event.opened ? event.filePath : null, event.opened ? event.company.legalName : null);
      // A company switch changes the entire data universe. Force every live IPC-backed list
      // (accounts, contacts, products, bank accounts, reports) to discard any data loaded for the
      // previous company and refetch from the newly opened .company database.
      bumpDataVersion();
    });
    const unsubscribeTrigger = window.api.events.onTriggerNewCompany(() => setShowNewCompanyModal(true));
    const unsubscribeNavigate = window.api.events.onNavigateToClientHub(() => setView({ kind: 'clientHub' }));
    const unsubscribeDataChanged = window.api.events.onDataChanged(() => bumpDataVersion());
    return () => {
      unsubscribeChanged();
      unsubscribeTrigger();
      unsubscribeNavigate();
      unsubscribeDataChanged();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!licenseChecked) return <div className="flex h-screen w-screen items-center justify-center bg-brand-900" />;
  if (!licensed) return <LicenseGatePage initialError={licenseError} onActivated={() => setLicensed(true)} />;
  if (sessionLocked && companyPath) {
    return <LoginGate lastCompanyPath={companyPath} heading="Unlock Apex Ledger" onSuccess={() => setSessionLocked(false)} />;
  }

  return (
    <>
      {view.kind === 'welcome' ? (
        <WelcomePage />
      ) : view.kind === 'paystub' ? (
        <PaystubPage runId={view.runId} />
      ) : (
        <AppShell>
          {/* Quick Entry is excluded from the remount key: a full remount would wipe its
              in-progress row (Date, Period covered, category/amount typed but not yet saved).
              It instead listens to refreshNonce itself and only reloads its data lists. */}
          {/* animate-viewIn rides on the same remount key: every navigation re-runs the animation,
              so each screen settles in rather than snapping. */}
          <div className="w-full min-w-0 animate-viewIn" key={`${view.kind}-${view.kind === 'quickEntry' ? '' : refreshNonce}`}>
          {view.kind === 'dashboard' && <DashboardPage />}
          {view.kind === 'bookkeepingChecklist' && <ActionCentrePage />}
          {view.kind === 'actionCentre' && <ActionCentrePage />}
          {view.kind === 'fixedAssets' && <FixedAssetsPage />}
          {view.kind === 'approvals' && <ApprovalsPage />}
          {view.kind === 'reclassify' && <ReclassifyPage />}
          {view.kind === 'clientOverview' && <ClientOverviewPage />}
          {view.kind === 'monthEndClose' && <MonthEndClosePage />}
          {view.kind === 'chartOfAccounts' && <ChartOfAccountsPage />}
          {view.kind === 'journalList' && <JournalEntryListPage />}
          {view.kind === 'journalForm' && <JournalEntryFormPage id={view.id} />}
          {view.kind === 'quickEntry' && <QuickEntryPage type={view.type} templateId={view.templateId} prefill={view.prefill} />}
          {view.kind === 'bulkExpenseImport' && <BulkExpenseImportPage />}
          {view.kind === 'bankImport' && <BankImportPage />}
          {view.kind === 'companySettings' && <CompanySettingsPage />}
          {view.kind === 'webAdmin' && <WebAdminPage />}
          {view.kind === 'webSubscriptions' && <WebSubscriptionsPage />}
          {view.kind === 'report' && <ReportView report={view.report} />}
          {view.kind === 'hstCentre' && <HstCentrePage />}
          {view.kind === 'taxGifi' && <TaxGifiCentrePage />}
          {view.kind === 'reportsHub' && <ReportsHubPage group={view.group} />}
          {view.kind === 'clientHub' && <ClientHubPage />}
          {view.kind === 'payroll' && <PayrollPage />}
          {view.kind === 'customers' && <SalesPage tab="customers" />}
          {view.kind === 'vendors' && <ExpensesPage tab="vendors" />}
          {view.kind === 'purchases' && <ExpensesPage tab={view.tab === 'paid' ? 'paid' : view.tab === 'vendors' ? 'vendors' : 'bills'} billId={view.billId} vendorId={view.vendorId} />}
          {view.kind === 'invoices' && <SalesPage tab="invoices" />}
          {view.kind === 'creditNotes' && <SalesPage tab="creditNotes" />}
          {view.kind === 'cpaReview' && <CpaReviewPage />}
          {view.kind === 'workpapers' && <WorkpapersPage />}
          {view.kind === 'accountantCentre' && <AccountantCentrePage />}
          {view.kind === 'banking' && <BankingCentrePage />}
          {view.kind === 'transactions' && <TransactionsPage tab={view.tab} />}
          {view.kind === 'products' && <ProductsPage />}
          {view.kind === 'projects' && <ProjectsPage />}
          {view.kind === 'tags' && <TagsPage />}
          {view.kind === 'sales' && <SalesPage tab={view.tab} customerId={view.customerId} />}
          {view.kind === 'estimates' && <SalesPage tab="estimates" />}
          {view.kind === 'estimateEditor' && <EstimateEditorPage id={view.id} asOrder={view.asOrder} customerId={view.customerId} />}
          {view.kind === 'purchaseOrders' && <PurchaseOrdersPage />}
          {view.kind === 'mileage' && <ExpensesPage tab="mileage" />}
          {view.kind === 'deposits' && <SalesPage tab="deposits" />}
          {view.kind === 'purchaseOrderEditor' && <PurchaseOrderEditorPage id={view.id} prefill={view.prefill} />}
          {view.kind === 'expenses' && <ExpensesPage tab={view.tab} billId={view.billId} vendorId={view.vendorId} />}
          {view.kind === 'invoiceEditor' && <InvoiceEditorPage id={view.id} customerId={view.customerId} />}
          {view.kind === 'salesReceipts' && <SalesPage tab="receipts" />}
          {view.kind === 'salesReceiptEditor' && <SalesReceiptEditorPage id={view.id} customerId={view.customerId} />}
          {view.kind === 'bankReconciliation' && <BankReconciliationPage />}
          {view.kind === 'receiptInbox' && <ReceiptInboxPage />}
          {view.kind === 'forms' && <FormsPage requestedFormId={view.formId} />}
          {view.kind === 'userGuide' && <UserGuidePage />}
          {view.kind === 'tools' && <ToolsPage />}
          {view.kind === 'knowledgeBase' && <KnowledgeBasePage />}
          {view.kind === 'audit' && <AuditorCentrePage tab={view.tab} />}
          {view.kind === 'about' && <AboutPage />}
          {view.kind === 'whatsNew' && <WhatsNewPage />}
          {view.kind === 'accessPermissions' && <AccessPermissionsPage />}
          {view.kind === 'calendar' && <CalendarPage />}
          {view.kind === 'qbImport' && <QuickBooksImportPage />}
          </div>
        </AppShell>
      )}
      <NewCompanyModal open={showNewCompanyModal} onClose={() => setShowNewCompanyModal(false)} />
      <CloseConfirmModal />
      <NavigationConfirmModal />
      <ConfirmModalHost />
    </>
  );
}
