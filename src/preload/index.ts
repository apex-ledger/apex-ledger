import { contextBridge, ipcRenderer, webFrame } from 'electron';
import type { FulfillmentStatus } from '@shared/domain/sales/commitmentDocuments';
import type { Account, AppointmentRecord, BankImportExclusion, BankImportRowProgress, BankReconciliation, Bill, BillPayment, CategoryRule, ClientRecord, CompanyInfo, Contact, CpaNote, CreditNote, Deposit, Employee, FiscalPeriod, ForeignCurrencyCode, GifiCode, HstFiling, Invoice, InvoicePayment, JournalEntry, JournalEntryLine, PayrollRun, ReminderRecord, Result, SalesReceipt, Shareholder, T5Payment, TaxCode, UndepositedItem } from '@shared/domain/types';
import type { PayCalculationResult } from '@shared/domain/payroll/calculatePay';
import type { TrialBalanceResult } from '@shared/domain/ledger/trialBalance';
import type { GeneralLedgerResult } from '@shared/domain/ledger/generalLedger';
import type { IncomeStatementResult } from '@shared/domain/ledger/incomeStatement';
import type { BalanceSheetResult } from '@shared/domain/ledger/balanceSheet';
import type { CashFlowResult } from '@shared/domain/ledger/cashFlowStatement';
import type { ProductValuation } from '@shared/domain/inventory/inventoryValuation';
import type { CcaScheduleResult } from '@shared/domain/tax/capitalCostAllowance';
import type { AmortizationResult } from '@shared/domain/tax/loanAmortization';
import type { InvalidTransaction, JournalReportResult } from '@shared/domain/ledger/transactionLists';
import type { WorkingTrialBalanceResult } from '@shared/domain/ledger/workingTrialBalance';
import type { CustomerStatementResult, ExpensesByVendorResult } from '@shared/domain/ledger/contactActivity';
import type { StatementRow } from '../main/ipc/customerStatements.handlers';
import type { ActivityLogRow } from '../main/ipc/reports.handlers';
import type { ReclassifyCandidate } from '../main/ipc/reclassify.handlers';
import type { AppSettings } from '../main/appSettings';
export type AppSettingsView = Omit<AppSettings, 'smtpPasswordEncrypted'> & { smtpPasswordSet: boolean };
import type { ChequeRegisterResult } from '@shared/domain/ledger/chequeRegister';
import type { SalesTaxDetailResult } from '@shared/domain/ledger/salesTaxDetail';
import type { ReconciliationReportResult } from '@shared/domain/ledger/reconciliationReport';
import type { T2125Result } from '@shared/domain/tax/t2125';
import type { BudgetVsActualResult } from '@shared/domain/ledger/budgetVsActual';
import type { ProfitAndLossByCustomerResult, ProfitAndLossDetailResult } from '@shared/domain/ledger/profitAndLossDetail';
import type { ChangesInEquityResult } from '@shared/domain/ledger/changesInEquity';
import type { GifiExportResult } from '@shared/domain/ledger/gifiExport';
import type { ProjectionResult } from '@shared/domain/ledger/projections';
import type { ProfitAndLossByTagResult } from '@shared/domain/ledger/profitAndLossByTag';
import type { ReclassifyPlan } from '@shared/domain/ledger/reclassifyAccount';
import type { EstimateStatus, PurchaseOrderStatus } from '@shared/domain/sales/commitmentDocuments';
import type { MileageClaimResult } from '@shared/domain/tax/mileage';
import type { ApprovalStatus, BillApprovalSummary } from '@shared/domain/purchases/billApproval';
import type { HstSummaryResult } from '@shared/domain/ledger/hstSummary';
import type { HstFilingPreview } from '@shared/domain/ledger/hstFiling';
import type { WorkpaperSheet } from '../main/ipc/workpapers.handlers';
import type { AuditEngagement } from '@shared/domain/audit/auditEngagement';
import type { LetterFieldKey } from '@shared/domain/letters/letterTemplates';

/** Letter templates as plain data for the picker — see letters.handlers.ts. */
export interface LetterTemplateSummary {
  id: string;
  name: string;
  description: string;
  standard: string | null;
  fields: LetterFieldKey[];
  practitionerReviewRequired: boolean;
}
import type { T4SlipResult } from '@shared/domain/payroll/computeT4Slip';
import type { T4ASlipResult } from '@shared/domain/payroll/computeT4ASlip';
import type { RepeatEntryMatch } from '@shared/domain/journal/findPossibleDuplicates';
import type { T5018SlipResult } from '@shared/domain/payroll/computeT5018Slip';
import type { T5SlipResult } from '@shared/domain/payroll/computeT5Slip';
import type { Edition } from '@shared/domain/licensing/editions';
import type { SeatPlanCode } from '@shared/domain/licensing/seatPlans';
import type { StaffSession } from '@shared/domain/access/staffSessions';
import type { ClientOverview } from '../main/ipc/clientOverview.handlers';
import type { CompliancePackageResult } from '@shared/domain/reporting/compliancePackage';
import type { ComprehensiveCompanyReportResult } from '@shared/domain/reporting/comprehensiveCompanyReport';
import type { AccessIdentity, AccessRole, AccessSessionUser, CompanyUser } from '@shared/domain/access';
import type { ForeignBalance } from '@shared/domain/currency/foreignBalances';
import type { RevaluationPreview } from '../main/ipc/fx.handlers';
import type { AttachmentRow } from '../main/ipc/attachments.handlers';
import type { ReminderPreview } from '../main/ipc/paymentReminders.handlers';
import type { HistoryEvent } from '../main/ipc/documentHistory.handlers';
import type { RecurringInvoiceTemplate } from '@shared/domain/sales/recurringInvoices';
import type { GeneratedRecurringInvoice } from '../main/ipc/recurringInvoices.handlers';
import type { TimeEntryRow } from '../main/ipc/timeEntries.handlers';
import type { UnbilledSummary } from '@shared/domain/sales/timeTracking';
import type { DirectDepositPreview } from '../main/ipc/directDeposit.handlers';
import type { SalesTaxByProvinceResult } from '@shared/domain/ledger/salesTaxByProvince';
import type { ProvincialSalesTaxResult } from '@shared/domain/ledger/provincialSalesTax';
import type { PayrollItemDefinition } from '@shared/domain/payroll/payrollItems';
import type { RoePreview } from '../main/ipc/roe.handlers';
import type { ActionCentreData } from '@shared/domain/workflow/actionCentre';
import type { FixedAssetRow } from '../main/ipc/fixedAssets.handlers';
import type { EmployeeEarningsReport } from '@shared/domain/payroll/employeeEarnings';
import type { AuditExceptionsReport } from '@shared/domain/audit/auditExceptions';
import type { YearEndSignoffReport } from '@shared/domain/audit/yearEndSignoff';
import type { YearEndSignoffRecord } from '../main/ipc/yearEndSignoff.handlers';
import type { VoiceStatus } from '../main/voice/transcriber';
import type { ApprovalQueueItem } from '@shared/domain/workflow/approvals';
type OverdueCustomerReminder = { customerId: number; customerName: string; customerEmail: string | null; tier: 'upcoming' | 'due' | 'overdue' | 'final'; totalCents: number; overdueCents: number; oldestDaysLate: number };

export interface EstimateLineRow {
  id: number;
  estimateId: number;
  lineOrder: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  revenueAccountId: number;
  taxCode: string | null;
  manualHstCents: number | null;
  productId: number | null;
}

export interface EstimateRow {
  id: number;
  customerId: number;
  estimateNumber: string;
  estimateDate: string;
  expiryDate: string | null;
  memo: string | null;
  totalCents: number;
  status: EstimateStatus;
  convertedInvoiceId: number | null;
  convertedAt: string | null;
  createdAt: string;
  fulfillmentStatus: FulfillmentStatus;
  shipDate: string | null;
  requiredByDate: string | null;
  convertedPurchaseOrderId: number | null;
  closedAt: string | null;
}

export type EstimateWithLines = EstimateRow & { lines: EstimateLineRow[] };

export interface PurchaseOrderLineRow {
  id: number;
  purchaseOrderId: number;
  lineOrder: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  categoryAccountId: number;
  taxCode: string | null;
  manualHstCents: number | null;
  productId: number | null;
  receivedQuantity: number;
}

export interface PurchaseOrderRow {
  id: number;
  vendorId: number;
  poNumber: string;
  orderDate: string;
  expectedDate: string | null;
  memo: string | null;
  totalCents: number;
  status: PurchaseOrderStatus;
  approvalStatus?: 'notRequired' | 'pending' | 'approved' | 'rejected';
  approvedBy?: string | null;
  approvalNote?: string | null;
  convertedBillId: number | null;
  convertedAt: string | null;
  receivedAt: string | null;
  receiptJournalEntryId: number | null;
  matchedBillId: number | null;
  matchedAt: string | null;
  createdAt: string;
}

export type PurchaseOrderWithLines = PurchaseOrderRow & { lines: PurchaseOrderLineRow[] };

export interface MileageTripRow {
  id: number;
  tripDate: string;
  kilometres: number;
  purpose: string;
  vehicle: string | null;
  startLocation: string | null;
  endLocation: string | null;
  journalEntryId: number | null;
  claimedAt: string | null;
  createdAt: string;
}

export type MileageClaimResponse = MileageClaimResult & {
  alreadyClaimedTripIds: number[];
  unclaimedCount: number;
};

export interface TagRow {
  id: number;
  tagGroupId: number;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface TagGroupRow {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  tags: TagRow[];
}

/** P&L by tag, plus what the columns are called — the report itself only knows tag ids. */
export type ProfitAndLossByTagResponse = ProfitAndLossByTagResult & {
  groupName: string;
  tags: { id: number; name: string }[];
};

export type BillApprovalResponse = BillApprovalSummary & { asOfDate: string };

function invoke<TResult>(channel: string) {
  return (...args: unknown[]): Promise<Result<TResult>> => ipcRenderer.invoke(channel, ...args);
}

export interface CoaTemplateSummary {
  id: string;
  label: string;
  description: string;
}

type CompanyOpenResult = { opened: false } | { opened: true; filePath: string; company: CompanyInfo };
type CompanyCreateResult = { created: false } | { created: true; filePath: string; company: CompanyInfo };
type CompanySaveAsResult = { saved: false } | { saved: true; filePath: string; company: CompanyInfo };
type GifiExportExcelResult = { saved: false } | { saved: true; filePath: string };
interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}
interface MarketNewsItem {
  title: string;
  link: string;
}
type ReadCsvFileResult = { loaded: false } | { loaded: true; fileName: string; content: string };
type ReadPdfBankStatementResult =
  | { loaded: false; error?: string }
  | { loaded: true; fileName: string; content: string; error?: string; openingBalanceCents?: number | null; closingBalanceCents?: number | null };
type ReadIifFileResult = { loaded: false } | { loaded: true; fileName: string; content: string };
export interface YtdPaystubTotals {
  grossPayCents: number;
  cppEmployeeCents: number;
  eiEmployeeCents: number;
  incomeTaxCents: number;
  netPayCents: number;
}
export interface PaystubData {
  run: PayrollRun;
  employee: Employee;
  company: CompanyInfo;
  ytdThroughThisRun: YtdPaystubTotals;
  ytdItems: Record<string, number>;
}
export interface ReconciliationCandidateLine {
  line: JournalEntryLine;
  entryDate: string;
  createdAt: string;
  memo: string | null;
  journalEntryId: number;
}
export interface BankReconciliationDetail {
  reconciliation: BankReconciliation;
  clearedLines: ReconciliationCandidateLine[];
  unclearedLines: ReconciliationCandidateLine[];
  clearedBalanceCents: number;
  differenceCents: number;
}
export interface ReceiptInboxEntry {
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
}
export interface ProcessedReceiptEntry {
  id: number;
  sourceFileName: string;
  archivedFilePath: string;
  billId: number | null;
  journalEntryId: number | null;
  importedAt: string;
}

export interface ReceiptScannerStatus {
  supported: boolean;
  devices: string[];
}

export interface ReceiptScanResult {
  scanned: boolean;
  cancelled: boolean;
  /** The first page scanned — what the Inbox opens for review. */
  fileName: string | null;
  /** Every page scanned in this pass, one Inbox file each. */
  fileNames: string[];
}
/** A recorded change joined to the entry it belongs to — what the Adjusting Entries report reads. */
export interface JournalEntryRevisionRow {
  id: number;
  journalEntryId: number;
  changedAt: string;
  field: string;
  label: string;
  kind: 'added' | 'removed' | 'changed';
  oldValue: string | null;
  newValue: string | null;
  lineLabel: string | null;
  changedBy: string | null;
  entryDate: string;
  memo: string | null;
  reference: string | null;
  source: string;
  sourceReference: string | null;
  isAdjustingEntry: boolean;
  status: 'draft' | 'posted' | 'void';
}

export interface BudgetRow {
  id: number;
  name: string;
  fiscalYearEnd: string;
  isActive: boolean;
  note: string | null;
  createdAt: string;
}

export interface BudgetLineRow {
  id: number;
  budgetId: number;
  accountId: number;
  period: number;
  amountCents: number;
}

export interface CcaPoolRow {
  id: number;
  fiscalYearEnd: string;
  classCode: string;
  openingUccCents: number;
  additionsCents: number;
  dispositionsCents: number;
  availableForUseYear: number | null;
  rateOverride: number | null;
  claimCents: number | null;
  note: string | null;
  createdAt: string;
}

export interface CcaScheduleReport extends CcaScheduleResult {
  rows: (CcaScheduleResult['rows'][number] & { poolId: number | null })[];
}

export interface LoanRow {
  id: number;
  name: string;
  lender: string | null;
  principalCents: number;
  annualRate: number;
  frequency: string;
  numberOfPayments: number;
  compounding: string;
  startDate: string | null;
  liabilityAccountId: number | null;
  interestAccountId: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface LoanScheduleReport extends AmortizationResult {
  loan: LoanRow;
}

export interface Product {
  id: number;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: string;
  salePriceCents: number;
  purchasePriceCents: number;
  incomeAccountId: number | null;
  cogsAccountId: number | null;
  assetAccountId: number | null;
  trackQuantity: boolean;
  defaultTaxCode: TaxCode | null;
  reorderPoint: number;
  isActive: boolean;
  createdAt: string;
  /** inventory | nonInventory | service | bundle — see productCatalogue.ts. */
  productType: string;
  category: string | null;
  bundleItems: Array<{ componentProductId: number; quantity: number }>;
  /** Item master (ERP) fields — purchasing and warehouse facts. */
  preferredVendorId: number | null;
  leadTimeDays: number;
  minimumOrderQuantity: number;
  reorderQuantity: number;
  binLocation: string | null;
  manufacturer: string | null;
  manufacturerPartNumber: string | null;
  weightKg: number | null;
  notes: string | null;
}

export interface InventoryMovementRow {
  id: number;
  productId: number;
  movementDate: string;
  quantityDelta: number;
  unitCostCents: number | null;
  kind: string;
  journalEntryId: number | null;
  note: string | null;
  sourceDocumentType: string | null;
  sourceDocumentId: number | null;
  sourceLineId: number | null;
  createdAt: string;
}

export interface InventoryStatusReport {
  asOfDate: string;
  rows: {
    productId: number;
    sku: string | null;
    name: string;
    unit: string;
    salePriceCents: number;
    purchasePriceCents: number;
    quantityOnHand: number;
    averageCostCents: number;
    totalValueCents: number;
    wentNegative: boolean;
  }[];
  totalValueCents: number;
  negativeStockCount: number;
}

export interface RecurringTemplate {
  id: number;
  name: string;
  type: 'expense' | 'income';
  moneyAccountId: number;
  categoryAccountId: number;
  amountCents: number;
  taxCode: string | null;
  manualHstCents: number | null;
  description: string | null;
  scheduleFrequency: 'weekly' | 'monthly' | 'quarterly' | 'annually' | null;
  nextDueDate: string | null;
  lastUsedDate: string | null;
  /** When set, the template posts as an unpaid vendor bill to this vendor instead of a paid expense. */
  billVendorId: number | null;
  billDueDays: number | null;
  createdAt: string;
}
export interface ReceiptOcrResult {
  vendorNameGuess: string | null;
  dateGuess: string | null;
  amountCentsGuess: number | null;
  taxAmountCentsGuess: number | null;
  currencyGuess: 'USD' | null;
  rawText: string;
}
export type CompanyChangedEvent = { opened: false; filePath: null; company: null } | { opened: true; filePath: string; company: CompanyInfo };
export interface DataChangedEvent {
  topic: string;
}
export interface RequestCloseEvent {
  responseChannel: string;
}
export interface LicenseStatus {
  licensed: boolean;
  customer?: string;
  expires?: string | null;
  error?: string;
  /** Which edition the key unlocks. Absent when the key is invalid, since nothing is unlocked. */
  edition?: Edition;
  /** The seat plan code, for looking up what a seat costs. Absent on pre-seat keys. */
  plan?: SeatPlanCode | null;
  /** How many people this licence covers. null means no limit — a pre-seat key. */
  seats?: number | null;
}

export type AiProvider = 'claude' | 'chatgpt' | 'gemini' | 'qwen' | 'deepseek' | 'groq';
export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface AiKeyStatus {
  anthropicConfigured: boolean;
  openaiConfigured: boolean;
  geminiConfigured: boolean;
  qwenConfigured: boolean;
  deepseekConfigured: boolean;
  groqConfigured: boolean;
  anthropicModel: string;
  openaiModel: string;
  geminiModel: string;
  qwenModel: string;
  deepseekModel: string;
  groqModel: string;
}
export type UpdaterStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

function subscribe<TPayload>(channel: string) {
  return (callback: (payload: TPayload) => void): (() => void) => {
    const listener = (_event: unknown, payload: TPayload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

const api = {
  access: {
    getIdentity: invoke<AccessIdentity>('access:getIdentity'),
    setIdentity: invoke<AccessIdentity>('access:setIdentity'),
    getRole: invoke<AccessRole>('access:getRole'),
    setRole: invoke<AccessRole>('access:setRole'),
    usersList: invoke<CompanyUser[]>('access:usersList'),
    usersInvite: invoke<{ user: CompanyUser; inviteUrl: string }>('access:usersInvite'),
    usersUpdateRole: invoke<CompanyUser>('access:usersUpdateRole'),
    usersSetStatus: invoke<CompanyUser>('access:usersSetStatus'),
    usersResendInvite: invoke<{ user: CompanyUser; inviteUrl: string }>('access:usersResendInvite'),
    usersCancelInvite: invoke<{ id: number }>('access:usersCancelInvite'),
    sessionUsersList: invoke<AccessSessionUser[]>('access:sessionUsersList'),
    switchUser: invoke<AccessSessionUser>('access:switchUser'),
    setupThreeUserDemo: invoke<CompanyUser[]>('access:setupThreeUserDemo'),
    signInHistory: invoke<StaffSession[]>('access:signInHistory'),
    recordLock: invoke<void>('access:recordLock'),
    recordUnlock: invoke<void>('access:recordUnlock'),
  },
  app: {
    getVersion: invoke<string>('app:getVersion'),
    quit: invoke<{ quit: true }>('app:quit'),
    savePdf: invoke<{ saved: boolean; filePath?: string }>('app:savePdf'),
    saveExcelFile: invoke<{ saved: boolean; filePath?: string }>('app:saveExcelFile'),
  },
  aiAssistant: {
    keysStatus: invoke<AiKeyStatus>('aiAssistant:keysStatus'),
    keysSave: invoke<AiKeyStatus>('aiAssistant:keysSave'),
    chatSend: invoke<{ reply: string }>('aiAssistant:chatSend'),
  },
  license: {
    status: invoke<LicenseStatus>('license:status'),
    activate: invoke<LicenseStatus>('license:activate'),
    getMachineId: invoke<string>('license:getMachineId'),
  },
  company: {
    get: invoke<CompanyInfo>('company:get'),
    update: invoke<CompanyInfo>('company:update'),
    pickLogo: invoke<{ picked: false } | { picked: true; dataUrl: string }>('company:pickLogo'),
    create: invoke<CompanyCreateResult>('company:create'),
    open: invoke<CompanyOpenResult>('company:open'),
    installDemo: invoke<CompanyOpenResult>('company:installDemo'),
    installTestCompany: invoke<CompanyOpenResult>('company:installTestCompany'),
    listRecent: invoke<string[]>('company:listRecent'),
    saveAs: invoke<CompanySaveAsResult>('company:saveAs'),
    backup: invoke<{ saved: false } | { saved: true; filePath: string }>('company:backup'),
    listRecoveryPoints: invoke<Array<{ filePath: string; fileName: string; createdAt: string; sizeBytes: number; valid: boolean; problem?: string; companyName?: string; journalEntries?: number; customers?: number; vendors?: number; invoices?: number; bills?: number }>>('company:listRecoveryPoints'),
    restoreRecoveryPoint: invoke<{ saved: false } | { saved: true; filePath: string }>('company:restoreRecoveryPoint'),
    close: invoke<{ closed: true }>('company:close'),
    deleteCurrent: invoke<{ deleted: true; filePath: string }>('company:deleteCurrent'),
  },
  fiscalPeriods: {
    list: invoke<FiscalPeriod[]>('fiscalPeriods:list'),
    create: invoke<FiscalPeriod>('fiscalPeriods:create'),
    lock: invoke<FiscalPeriod>('fiscalPeriods:lock'),
    unlock: invoke<FiscalPeriod>('fiscalPeriods:unlock'),
  },
  accounts: {
    list: invoke<Account[]>('accounts:list'),
    get: invoke<Account>('accounts:get'),
    create: invoke<Account>('accounts:create'),
    update: invoke<Account>('accounts:update'),
    deactivate: invoke<Account>('accounts:deactivate'),
    ensureGstHstAccount: invoke<{ id: number }>('accounts:ensureGstHstAccount'),
    seedFromTemplate: invoke<Account[]>('accounts:seedFromTemplate'),
    listTemplates: invoke<CoaTemplateSummary[]>('accounts:listTemplates'),
    saveAsTemplate: invoke<CoaTemplateSummary>('accounts:saveAsTemplate'),
    deleteTemplate: invoke<{ deleted: true }>('accounts:deleteTemplate'),
    reclassifyPreview: invoke<ReclassifyPlan>('accounts:reclassifyPreview'),
    reclassify: invoke<Account>('accounts:reclassify'),
  },
  gifi: {
    list: invoke<GifiCode[]>('gifi:list'),
    get: invoke<GifiCode>('gifi:get'),
    createCustom: invoke<GifiCode>('gifi:createCustom'),
    update: invoke<GifiCode>('gifi:update'),
  },
  journal: {
    list: invoke<JournalEntry[]>('journal:list'),
    get: invoke<JournalEntry>('journal:get'),
    create: invoke<JournalEntry>('journal:create'),
    createAndPost: invoke<JournalEntry>('journal:createAndPost'),
    post: invoke<JournalEntry>('journal:post'),
    update: invoke<JournalEntry>('journal:update'),
    reclassifyCandidates: invoke<ReclassifyCandidate[]>('journal:reclassifyCandidates'),
    reclassify: invoke<{ moved: number; entryIds: number[]; totalCents: number }>('journal:reclassify'),
    revisions: invoke<JournalEntryRevisionRow[]>('journal:revisions'),
    suggestContraAccount: invoke<{ accountId: number; count: number; confidence: number } | null>('journal:suggestContraAccount'),
    updateDate: invoke<JournalEntry>('journal:updateDate'),
    void: invoke<JournalEntry>('journal:void'),
    delete: invoke<{ deleted: true }>('journal:delete'),
    setManualHst: invoke<JournalEntry>('journal:setManualHst'),
    setLineTaxCode: invoke<JournalEntry>('journal:setLineTaxCode'),
    findPossibleDuplicates: invoke<{ entryId: number; entryDate: string; memo: string | null }[]>('journal:findPossibleDuplicates'),
    findByReference: invoke<{ entryId: number; entryDate: string; memo: string | null } | null>('journal:findByReference'),
    findRecentByMemo: invoke<RepeatEntryMatch | null>('journal:findRecentByMemo'),
    suggestTaxCodeForAccount: invoke<TaxCode | null>('journal:suggestTaxCodeForAccount'),
  },
  quickEntry: {
    create: invoke<JournalEntry>('quickEntry:create'),
    correct: invoke<{ original: JournalEntry; corrected: JournalEntry }>('quickEntry:correct'),
  },
  reports: {
    trialBalance: invoke<TrialBalanceResult>('reports:trialBalance'),
    generalLedger: invoke<GeneralLedgerResult>('reports:generalLedger'),
    incomeStatement: invoke<IncomeStatementResult>('reports:incomeStatement'),
    balanceSheet: invoke<BalanceSheetResult>('reports:balanceSheet'),
    cashFlow: invoke<CashFlowResult>('reports:cashFlow'),
    journal: invoke<JournalReportResult>('reports:journal'),
    workingTrialBalance: invoke<WorkingTrialBalanceResult>('reports:workingTrialBalance'),
    expensesByVendor: invoke<ExpensesByVendorResult>('reports:expensesByVendor'),
    customerStatement: invoke<CustomerStatementResult>('reports:customerStatement'),
    chequeRegister: invoke<ChequeRegisterResult>('reports:chequeRegister'),
    activityLog: invoke<ActivityLogRow[]>('reports:activityLog'),
    employeeEarnings: invoke<EmployeeEarningsReport>('reports:employeeEarnings'),
    auditExceptions: invoke<AuditExceptionsReport>('reports:auditExceptions'),
    yearEndSignoff: invoke<YearEndSignoffReport>('reports:yearEndSignoff'),
    yearEndSignoffHistory: invoke<YearEndSignoffRecord[]>('reports:yearEndSignoffHistory'),
    yearEndSignoffSign: invoke<YearEndSignoffRecord>('reports:yearEndSignoffSign'),
    salesTaxDetail: invoke<SalesTaxDetailResult>('reports:salesTaxDetail'),
    reconciliation: invoke<ReconciliationReportResult>('reports:reconciliation'),
    reconciliationList: invoke<BankReconciliation[]>('reports:reconciliationList'),
    t2125: invoke<T2125Result>('reports:t2125'),
    invalidTransactions: invoke<InvalidTransaction[]>('reports:invalidTransactions'),
    profitAndLossDetail: invoke<ProfitAndLossDetailResult>('reports:profitAndLossDetail'),
    profitAndLossByCustomer: invoke<ProfitAndLossByCustomerResult>('reports:profitAndLossByCustomer'),
    changesInEquity: invoke<ChangesInEquityResult>('reports:changesInEquity'),
    gifiExport: invoke<GifiExportResult>('reports:gifiExport'),
    gifiExportExcel: invoke<GifiExportExcelResult>('reports:gifiExportExcel'),
    projections: invoke<ProjectionResult>('reports:projections'),
    hstSummary: invoke<HstSummaryResult>('reports:hstSummary'),
    salesTaxByProvince: invoke<SalesTaxByProvinceResult>('reports:salesTaxByProvince'),
    provincialSalesTax: invoke<ProvincialSalesTaxResult>('reports:provincialSalesTax'),
    profitAndLossByTag: invoke<ProfitAndLossByTagResponse>('reports:profitAndLossByTag'),
    compliancePackage: invoke<CompliancePackageResult>('reports:compliancePackage'),
    comprehensiveCompany: invoke<ComprehensiveCompanyReportResult>('reports:comprehensiveCompany'),
  },
  categoryRules: {
    list: invoke<CategoryRule[]>('categoryRules:list'),
    create: invoke<CategoryRule>('categoryRules:create'),
    update: invoke<CategoryRule>('categoryRules:update'),
    delete: invoke<{ deleted: true }>('categoryRules:delete'),
  },
  bankImport: {
    readCsvFile: invoke<ReadCsvFileResult>('bankImport:readCsvFile'),
    readPdfFile: invoke<ReadPdfBankStatementResult>('bankImport:readPdfFile'),
    exclusionsList: invoke<BankImportExclusion[]>('bankImport:exclusionsList'),
    exclusionsAdd: invoke<BankImportExclusion>('bankImport:exclusionsAdd'),
    exclusionsRemove: invoke<{ deleted: true }>('bankImport:exclusionsRemove'),
    rowProgressList: invoke<BankImportRowProgress[]>('bankImport:rowProgressList'),
    rowProgressSave: invoke<{ saved: true; count: number }>('bankImport:rowProgressSave'),
    rowProgressClear: invoke<{ cleared: true }>('bankImport:rowProgressClear'),
  },
  clientOverview: {
    get: invoke<ClientOverview>('clientOverview:get'),
  },
  qbImport: {
    readIifFile: invoke<ReadIifFileResult>('qbImport:readIifFile'),
    readCsvFile: invoke<ReadIifFileResult>('qbImport:readCsvFile'),
  },
  qbExport: {
    toIif: invoke<{ saved: false } | { saved: true; filePath: string; accountCount: number; transactionCount: number }>('qbExport:toIif'),
  },
  clients: {
    list: invoke<ClientRecord[]>('clients:list'),
    save: invoke<ClientRecord>('clients:save'),
    delete: invoke<{ deleted: true }>('clients:delete'),
    exportSheet: invoke<{ saved: false } | { saved: true; filePath: string; clientCount: number }>('clients:exportSheet'),
    exportPdf: invoke<{ saved: false } | { saved: true; filePath: string; clientCount: number }>('clients:exportPdf'),
    importCsv: invoke<{ imported: false } | { imported: true; importedCount: number; skippedCount: number }>('clients:importCsv'),
  },
  reminders: {
    list: invoke<ReminderRecord[]>('reminders:list'),
    save: invoke<ReminderRecord>('reminders:save'),
    delete: invoke<{ deleted: true }>('reminders:delete'),
  },
  deadlineAcks: {
    list: invoke<string[]>('deadlineAcks:list'),
    setInformed: invoke<{ key: string; informed: boolean }>('deadlineAcks:setInformed'),
  },
  appointments: {
    list: invoke<AppointmentRecord[]>('appointments:list'),
    save: invoke<AppointmentRecord>('appointments:save'),
    delete: invoke<{ deleted: true }>('appointments:delete'),
    snooze: invoke<AppointmentRecord>('appointments:snooze'),
  },
  employees: {
    list: invoke<Employee[]>('employees:list'),
    get: invoke<Employee>('employees:get'),
    create: invoke<Employee>('employees:create'),
    update: invoke<Employee>('employees:update'),
    deactivate: invoke<Employee>('employees:deactivate'),
  },
  payrollRuns: {
    list: invoke<PayrollRun[]>('payrollRuns:list'),
    get: invoke<PayrollRun>('payrollRuns:get'),
    calculate: invoke<PayCalculationResult>('payrollRuns:calculate'),
    create: invoke<PayrollRun>('payrollRuns:create'),
    post: invoke<PayrollRun>('payrollRuns:post'),
    reverse: invoke<PayrollRun>('payrollRuns:reverse'),
    delete: invoke<{ deleted: true }>('payrollRuns:delete'),
    getPaystub: invoke<PaystubData>('payrollRuns:getPaystub'),
    savePaystubPdf: invoke<{ saved: false } | { saved: true; filePath: string }>('payrollRuns:savePaystubPdf'),
  },
  payroll: {
    generatePd7aPdf: invoke<{ saved: false } | { saved: true; filePath: string }>('payroll:generatePd7aPdf'),
    ehtAccrued: invoke<{ accruedCents: number }>('payroll:ehtAccrued'),
    ehtAccrue: invoke<{ amountCents: number; journalEntryId: number }>('payroll:ehtAccrue'),
    generateT4Slips: invoke<{ saved: false } | { saved: true; filePath: string }>('payroll:generateT4Slips'),
    generateT4ASlips: invoke<{ saved: false } | { saved: true; filePath: string }>('payroll:generateT4ASlips'),
    getT4Preview: invoke<T4SlipResult[]>('payroll:getT4Preview'),
    getT4APreview: invoke<T4ASlipResult[]>('payroll:getT4APreview'),
    generateT5018Slips: invoke<{ saved: false } | { saved: true; filePath: string }>('payroll:generateT5018Slips'),
    getT5018Preview: invoke<T5018SlipResult[]>('payroll:getT5018Preview'),
  },
  shareholders: {
    list: invoke<Shareholder[]>('shareholders:list'),
    save: invoke<Shareholder>('shareholders:save'),
    deactivate: invoke<Shareholder>('shareholders:deactivate'),
    generateT5Slips: invoke<{ saved: false } | { saved: true; filePath: string }>('shareholders:generateT5Slips'),
    getT5Preview: invoke<T5SlipResult[]>('shareholders:getT5Preview'),
  },
  t5Payments: {
    list: invoke<T5Payment[]>('t5Payments:list'),
    record: invoke<T5Payment>('t5Payments:record'),
    delete: invoke<{ deleted: true }>('t5Payments:delete'),
  },
  customers: {
    list: invoke<Contact[]>('customers:list'),
    save: invoke<Contact>('customers:save'),
    deactivate: invoke<Contact>('customers:deactivate'),
    merge: invoke<{ merged: true; keepId: number; mergeId: number; keepName: string; mergedName: string }>('customers:merge'),
  },
  vendors: {
    list: invoke<Contact[]>('vendors:list'),
    save: invoke<Contact>('vendors:save'),
    deactivate: invoke<Contact>('vendors:deactivate'),
    merge: invoke<{ merged: true; keepId: number; mergeId: number; keepName: string; mergedName: string }>('vendors:merge'),
  },
  bills: {
    list: invoke<Bill[]>('bills:list'),
    get: invoke<Bill>('bills:get'),
    payments: invoke<BillPayment[]>('bills:payments'),
    create: invoke<Bill>('bills:create'),
    pay: invoke<Bill>('bills:pay'),
    reverseLastPayment: invoke<Bill>('bills:reverseLastPayment'),
    delete: invoke<{ deleted: true }>('bills:delete'),
    setApproval: invoke<Bill>('bills:setApproval'),
    approvalReport: invoke<BillApprovalResponse>('bills:approvalReport'),
  },
  estimates: {
    list: invoke<EstimateRow[]>('estimates:list'),
    get: invoke<EstimateWithLines>('estimates:get'),
    nextNumber: invoke<string>('estimates:nextNumber'),
    create: invoke<EstimateRow>('estimates:create'),
    update: invoke<EstimateWithLines>('estimates:update'),
    setStatus: invoke<EstimateWithLines>('estimates:setStatus'),
    delete: invoke<{ deleted: true }>('estimates:delete'),
    convertToInvoice: invoke<{ estimate: EstimateWithLines; invoice: Invoice }>('estimates:convertToInvoice'),
    convertToPurchaseOrder: invoke<{ estimate: EstimateWithLines; purchaseOrder: PurchaseOrderRow }>('estimates:convertToPurchaseOrder'),
    setFulfillment: invoke<EstimateWithLines>('estimates:setFulfillment'),
    setRequiredBy: invoke<EstimateWithLines>('estimates:setRequiredBy'),
  },
  purchaseOrders: {
    list: invoke<PurchaseOrderRow[]>('purchaseOrders:list'),
    get: invoke<PurchaseOrderWithLines>('purchaseOrders:get'),
    nextNumber: invoke<string>('purchaseOrders:nextNumber'),
    create: invoke<PurchaseOrderRow>('purchaseOrders:create'),
    update: invoke<PurchaseOrderWithLines>('purchaseOrders:update'),
    setStatus: invoke<PurchaseOrderWithLines>('purchaseOrders:setStatus'),
    receive: invoke<PurchaseOrderWithLines>('purchaseOrders:receive'),
    reverseLatestReceipt: invoke<PurchaseOrderWithLines>('purchaseOrders:reverseLatestReceipt'),
    matchSupplierBill: invoke<{ purchaseOrder: PurchaseOrderWithLines; bill: Bill; baseVarianceCents: number }>('purchaseOrders:matchSupplierBill'),
    unmatchSupplierBill: invoke<PurchaseOrderWithLines>('purchaseOrders:unmatchSupplierBill'),
    delete: invoke<{ deleted: true }>('purchaseOrders:delete'),
    convertToBill: invoke<{ purchaseOrder: PurchaseOrderWithLines; bill: Bill; combinedCategories: number | null }>(
      'purchaseOrders:convertToBill',
    ),
  },
  mileage: {
    list: invoke<MileageTripRow[]>('mileage:list'),
    claim: invoke<MileageClaimResponse>('mileage:claim'),
    create: invoke<MileageTripRow>('mileage:create'),
    update: invoke<MileageTripRow>('mileage:update'),
    delete: invoke<{ deleted: true }>('mileage:delete'),
    postClaim: invoke<{ journalEntryId: number; amountCents: number; tripCount: number; kilometres: number; rateYear: number }>(
      'mileage:postClaim',
    ),
    reverseLatestClaim: invoke<{ journalEntryId: number; releasedTrips: number }>('mileage:reverseLatestClaim'),
  },
  tags: {
    groups: invoke<TagGroupRow[]>('tags:groups'),
    createGroup: invoke<TagGroupRow>('tags:createGroup'),
    updateGroup: invoke<TagGroupRow>('tags:updateGroup'),
    deleteGroup: invoke<{ deleted: true }>('tags:deleteGroup'),
    create: invoke<TagRow>('tags:create'),
    update: invoke<TagRow>('tags:update'),
    delete: invoke<{ deleted: true }>('tags:delete'),
    forEntry: invoke<Record<number, number[]>>('tags:forEntry'),
    setForLine: invoke<{ journalEntryLineId: number; tagIds: number[] }>('tags:setForLine'),
    allAssignments: invoke<Record<number, number[]>>('tags:allAssignments'),
  },
  invoices: {
    list: invoke<Invoice[]>('invoices:list'),
    get: invoke<Invoice>('invoices:get'),
    payments: invoke<InvoicePayment[]>('invoices:payments'),
    lateInterestPreview: invoke<{ customerId: number; customerName: string; ratePercent: number; asOf: string; totalCents: number; lines: Array<{ invoiceId: number; invoiceNumber: string; balanceDueCents: number; fromDate: string; toDate: string; days: number; interestCents: number }> }>('invoices:lateInterestPreview'),
    chargeLateInterest: invoke<Invoice>('invoices:chargeLateInterest'),
    nextNumber: invoke<string>('invoices:nextNumber'),
    create: invoke<Invoice>('invoices:create'),
    recordStock: invoke<{ recorded: number; linesWithoutProduct: number; problems: string[] }>('invoices:recordStock'),
    receivePayment: invoke<Invoice>('invoices:receivePayment'),
    reverseLastPayment: invoke<Invoice>('invoices:reverseLastPayment'),
    delete: invoke<{ deleted: true }>('invoices:delete'),
  },
  deposits: {
    list: invoke<Deposit[]>('deposits:list'),
    listDetailed: invoke<(Deposit & { totalCents: number; itemCount: number })[]>('deposits:listDetailed'),
    getUndeposited: invoke<UndepositedItem[]>('deposits:getUndeposited'),
    create: invoke<Deposit>('deposits:create'),
    delete: invoke<{ deleted: true }>('deposits:delete'),
  },
  salesReceipts: {
    list: invoke<SalesReceipt[]>('salesReceipts:list'),
    get: invoke<SalesReceipt>('salesReceipts:get'),
    nextNumber: invoke<string>('salesReceipts:nextNumber'),
    undepositedFundsAccountId: invoke<number>('salesReceipts:undepositedFundsAccountId'),
    create: invoke<SalesReceipt>('salesReceipts:create'),
    delete: invoke<{ deleted: true }>('salesReceipts:delete'),
  },
  letters: {
    list: invoke<LetterTemplateSummary[]>('letters:list'),
    generate: invoke<{ saved: false } | { saved: true; filePath: string }>('letters:generate'),
  },
  workpapers: {
    sheet: invoke<WorkpaperSheet>('workpapers:sheet'),
    setStatus: invoke<{ ok: true }>('workpapers:setStatus'),
    setNote: invoke<{ ok: true }>('workpapers:setNote'),
    addAttachment: invoke<{ added: number }>('workpapers:addAttachment'),
    removeAttachment: invoke<{ deleted: true }>('workpapers:removeAttachment'),
    openAttachment: invoke<{ opened: true }>('workpapers:openAttachment'),
  },
  auditEngagement: {
    get: invoke<AuditEngagement>('auditEngagement:get'),
    saveMateriality: invoke<AuditEngagement>('auditEngagement:saveMateriality'),
    saveDocument: invoke<AuditEngagement>('auditEngagement:saveDocument'),
    signDocument: invoke<AuditEngagement>('auditEngagement:signDocument'),
    addReviewNote: invoke<AuditEngagement>('auditEngagement:addReviewNote'),
    resolveReviewNote: invoke<AuditEngagement>('auditEngagement:resolveReviewNote'),
    setStatus: invoke<AuditEngagement>('auditEngagement:setStatus'),
    lock: invoke<AuditEngagement>('auditEngagement:lock'),
  },
  cpaNotes: {
    list: invoke<CpaNote[]>('cpaNotes:list'),
    save: invoke<CpaNote>('cpaNotes:save'),
    setStatus: invoke<CpaNote>('cpaNotes:setStatus'),
    delete: invoke<{ deleted: true }>('cpaNotes:delete'),
    generateReviewPackage: invoke<{ saved: false } | { saved: true; filePath: string }>('cpaNotes:generateReviewPackage'),
  },
  creditNotes: {
    list: invoke<CreditNote[]>('creditNotes:list'),
    get: invoke<CreditNote>('creditNotes:get'),
    nextNumber: invoke<string>('creditNotes:nextNumber'),
    create: invoke<CreditNote>('creditNotes:create'),
    apply: invoke<CreditNote>('creditNotes:apply'),
    refund: invoke<CreditNote>('creditNotes:refund'),
    undoSettlement: invoke<CreditNote>('creditNotes:undoSettlement'),
    delete: invoke<{ deleted: true }>('creditNotes:delete'),
  },
  hstFilings: {
    list: invoke<HstFiling[]>('hstFilings:list'),
    preview: invoke<HstFilingPreview>('hstFilings:preview'),
    create: invoke<HstFiling>('hstFilings:create'),
    void: invoke<HstFiling>('hstFilings:void'),
  },
  salesReceiptPdf: {
    generate: invoke<{ saved: false } | { saved: true; filePath: string }>('salesReceiptPdf:generate'),
    emailViaOutlook: invoke<{ sent: true }>('salesReceiptPdf:emailViaOutlook'),
    saveToDownloads: invoke<{ filePath: string }>('salesReceiptPdf:saveToDownloads'),
  },
  invoicePdf: {
    generate: invoke<{ saved: false } | { saved: true; filePath: string }>('invoicePdf:generate'),
    emailViaOutlook: invoke<{ sent: true }>('invoicePdf:emailViaOutlook'),
    saveToDownloads: invoke<{ filePath: string }>('invoicePdf:saveToDownloads'),
  },
  bankReconciliation: {
    list: invoke<BankReconciliation[]>('bankReconciliation:list'),
    get: invoke<BankReconciliationDetail>('bankReconciliation:get'),
    start: invoke<BankReconciliationDetail>('bankReconciliation:start'),
    toggleLine: invoke<BankReconciliationDetail>('bankReconciliation:toggleLine'),
    complete: invoke<BankReconciliationDetail>('bankReconciliation:complete'),
    reopen: invoke<BankReconciliationDetail>('bankReconciliation:reopen'),
    abandon: invoke<{ abandoned: true }>('bankReconciliation:abandon'),
  },
  fixedAssets: {
    list: invoke<FixedAssetRow[]>('fixedAssets:list'),
    save: invoke<FixedAssetRow>('fixedAssets:save'),
    delete: invoke<{ deleted: true }>('fixedAssets:delete'),
    schedule: invoke<{ rows: Array<{ month: string; amountCents: number; accumulatedCents: number; bookValueCents: number }>; postedMonths: string[] }>('fixedAssets:schedule'),
    runDepreciation: invoke<{ postedMonths: number; assets: number; totalCents: number; skippedLocked: string[] }>('fixedAssets:runDepreciation'),
    dispose: invoke<FixedAssetRow>('fixedAssets:dispose'),
  },
  approvals: {
    pending: invoke<ApprovalQueueItem[]>('approvals:pending'),
    setJournal: invoke<JournalEntry>('journal:setApproval'),
    setPurchaseOrder: invoke<PurchaseOrderWithLines>('purchaseOrders:setApproval'),
  },
  actionCentre: {
    items: invoke<ActionCentreData>('actionCentre:items'),
  },
  roe: {
    preview: invoke<RoePreview>('roe:preview'),
    savePdf: invoke<{ saved: false } | { saved: true; filePath: string }>('roe:savePdf'),
    saveXml: invoke<{ saved: false } | { saved: true; filePath: string }>('roe:saveXml'),
  },
  payrollItems: {
    list: invoke<PayrollItemDefinition[]>('payrollItems:list'),
    save: invoke<PayrollItemDefinition[]>('payrollItems:save'),
  },
  directDeposit: {
    payDates: invoke<Array<{ payDate: string; employees: number; totalCents: number }>>('directDeposit:payDates'),
    preview: invoke<DirectDepositPreview>('directDeposit:preview'),
    saveFile: invoke<{ saved: boolean; filePath?: string; fileNumber?: number; totalCents?: number }>('directDeposit:saveFile'),
  },
  timeEntries: {
    list: invoke<TimeEntryRow[]>('timeEntries:list'),
    unbilled: invoke<UnbilledSummary[]>('timeEntries:unbilled'),
    create: invoke<TimeEntryRow>('timeEntries:create'),
    update: invoke<TimeEntryRow>('timeEntries:update'),
    delete: invoke<{ deleted: true }>('timeEntries:delete'),
    invoice: invoke<{ invoiceId: number; invoiceNumber: string; totalCents: number; entries: number }>('timeEntries:invoice'),
  },
  recurringInvoices: {
    list: invoke<RecurringInvoiceTemplate[]>('recurringInvoices:list'),
    due: invoke<RecurringInvoiceTemplate[]>('recurringInvoices:due'),
    create: invoke<RecurringInvoiceTemplate>('recurringInvoices:create'),
    update: invoke<RecurringInvoiceTemplate>('recurringInvoices:update'),
    delete: invoke<{ deleted: true }>('recurringInvoices:delete'),
    generateDue: invoke<GeneratedRecurringInvoice[]>('recurringInvoices:generateDue'),
  },
  documentHistory: {
    get: invoke<HistoryEvent[]>('documentHistory:get'),
  },
  paymentReminders: {
    preview: invoke<ReminderPreview | null>('paymentReminders:preview'),
    emailViaOutlook: invoke<{ opened: true; tier: string; totalCents: number }>('paymentReminders:emailViaOutlook'),
    overdueCustomers: invoke<OverdueCustomerReminder[]>('paymentReminders:overdueCustomers'),
  },
  appSettings: {
    get: invoke<AppSettingsView>('appSettings:get'),
    save: invoke<AppSettingsView>('appSettings:save'),
    pickBackupFolder: invoke<{ picked: false } | { picked: true; folder: string }>('appSettings:pickBackupFolder'),
    sendTestEmail: invoke<{ route: 'smtp'; sent: true } | { route: 'outlook'; opened: true }>('appSettings:sendTestEmail'),
  },
  customerStatements: {
    list: invoke<StatementRow[]>('customerStatements:list'),
    saveAll: invoke<{ saved: false } | { saved: true; folder: string; count: number }>('customerStatements:saveAll'),
    email: invoke<{ opened: true; totalCents: number }>('customerStatements:email'),
  },
  attachments: {
    list: invoke<AttachmentRow[]>('attachments:list'),
    add: invoke<AttachmentRow[]>('attachments:add'),
    open: invoke<{ opened: true }>('attachments:open'),
    remove: invoke<{ removed: true }>('attachments:remove'),
    counts: invoke<Record<number, number>>('attachments:counts'),
  },
  fx: {
    foreignBalances: invoke<ForeignBalance[]>('fx:foreignBalances'),
    revaluationPreview: invoke<RevaluationPreview>('fx:revaluationPreview'),
    revaluationPost: invoke<{ journalEntryId: number; reversalEntryId: number; totalGainLossCents: number }>('fx:revaluationPost'),
  },
  fxRates: {
    getLatest: (currency: ForeignCurrencyCode) => ipcRenderer.invoke('fxRates:getLatest', currency) as Promise<Result<{ rate: number; date: string }>>,
    getOnDate: (currency: ForeignCurrencyCode, date: string) => ipcRenderer.invoke('fxRates:getOnDate', currency, date) as Promise<Result<{ rate: number; date: string }>>,
  },
  market: {
    quotes: invoke<MarketQuote[]>('market:quotes'),
    news: invoke<MarketNewsItem[]>('market:news'),
  },
  receiptInbox: {
    list: invoke<ReceiptInboxEntry[]>('receiptInbox:list'),
    history: invoke<ProcessedReceiptEntry[]>('receiptInbox:history'),
    reprocess: invoke<{ returnedToInbox: true; fileName: string }>('receiptInbox:reprocess'),
    importFiles: invoke<{ importedCount: number }>('receiptInbox:importFiles'),
    scannerStatus: invoke<ReceiptScannerStatus>('receiptInbox:scannerStatus'),
    scan: invoke<ReceiptScanResult>('receiptInbox:scan'),
    getPreview: invoke<{ dataUrl: string }>('receiptInbox:getPreview'),
    extractFields: invoke<ReceiptOcrResult>('receiptInbox:extractFields'),
    pickAndExtract: invoke<{ picked: false } | { picked: true; fileName: string; fields: ReceiptOcrResult }>('receiptInbox:pickAndExtract'),
    importAsBill: invoke<Bill>('receiptInbox:importAsBill'),
    importAsQuickEntry: invoke<JournalEntry>('receiptInbox:importAsQuickEntry'),
    dismiss: invoke<{ skipped: true }>('receiptInbox:dismiss'),
    openFile: invoke<{ opened: true }>('receiptInbox:openFile'),
    showFolder: invoke<{ inboxPath: string }>('receiptInbox:showFolder'),
    getForJournalEntry: invoke<{ archivedFilePath: string } | null>('receiptInbox:getForJournalEntry'),
  },
  clipboard: {
    readText: invoke<string>('clipboard:readText'),
  },
  cca: {
    pools: invoke<CcaPoolRow[]>('cca:pools'),
    save: invoke<CcaPoolRow>('cca:save'),
    delete: invoke<{ deleted: true }>('cca:delete'),
    schedule: invoke<CcaScheduleReport>('cca:schedule'),
    rollForward: invoke<{ created: number }>('cca:rollForward'),
  },
  budgets: {
    list: invoke<BudgetRow[]>('budgets:list'),
    create: invoke<BudgetRow>('budgets:create'),
    delete: invoke<{ deleted: true }>('budgets:delete'),
    lines: invoke<BudgetLineRow[]>('budgets:lines'),
    setLine: invoke<{ ok: true }>('budgets:setLine'),
    spreadEvenly: invoke<{ ok: true }>('budgets:spreadEvenly'),
    vsActual: invoke<BudgetVsActualResult>('budgets:vsActual'),
  },
  loans: {
    list: invoke<LoanRow[]>('loans:list'),
    save: invoke<LoanRow>('loans:save'),
    delete: invoke<{ deleted: true }>('loans:delete'),
    schedule: invoke<LoanScheduleReport>('loans:schedule'),
  },
  products: {
    list: invoke<Product[]>('products:list'),
    create: invoke<Product>('products:create'),
    update: invoke<Product>('products:update'),
    delete: invoke<{ deleted: boolean; deactivated: boolean }>('products:delete'),
  },
  inventory: {
    movements: invoke<InventoryMovementRow[]>('inventory:movements'),
    addMovement: invoke<InventoryMovementRow & { postedEntryId: number | null; notPostedReason: string | null }>('inventory:addMovement'),
    deleteMovement: invoke<{ deleted: true }>('inventory:deleteMovement'),
    reverseMovement: invoke<{ reversed: true; journalEntryId: number }>('inventory:reverseMovement'),
    status: invoke<InventoryStatusReport>('inventory:status'),
    productValuation: invoke<ProductValuation>('inventory:productValuation'),
  },
  recurringTemplates: {
    list: invoke<RecurringTemplate[]>('recurringTemplates:list'),
    create: invoke<RecurringTemplate>('recurringTemplates:create'),
    update: invoke<RecurringTemplate>('recurringTemplates:update'),
    delete: invoke<{ deleted: true }>('recurringTemplates:delete'),
    postBill: invoke<Bill>('recurringTemplates:postBill'),
  },
  forms: {
    generatePdf: invoke<{ saved: false } | { saved: true; filePath: string }>('forms:generatePdf'),
    emailViaOutlook: invoke<{ sent: true }>('forms:emailViaOutlook'),
    saveToDownloads: invoke<{ filePath: string }>('forms:saveToDownloads'),
  },
  voice: {
    status: invoke<VoiceStatus>('voice:status'),
    prepare: invoke<VoiceStatus>('voice:prepare'),
    transcribe: invoke<{ text: string }>('voice:transcribe'),
  },
  events: {
    onVoiceProgress: subscribe<string>('voice:progress'),
    onCompanyChanged: subscribe<CompanyChangedEvent>('company:changed'),
    onTriggerNewCompany: subscribe<void>('menu:triggerNewCompany'),
    onNavigateToClientHub: subscribe<void>('menu:navigateToClientHub'),
    onDataChanged: subscribe<DataChangedEvent>('data:changed'),
    onRequestClose: subscribe<RequestCloseEvent>('app:requestClose'),
  },
  updater: {
    checkForUpdates: invoke<void>('updater:checkForUpdates'),
    quitAndInstall: invoke<void>('updater:quitAndInstall'),
    onStatus: subscribe<UpdaterStatus>('updater:status'),
  },
  window: {
    openMirror: invoke<void>('window:openMirror'),
    respondClose: (responseChannel: string, action: 'close' | 'cancel'): void => {
      ipcRenderer.send(responseChannel, action);
    },
  },
  zoom: {
    // webFrame is a real browser-style zoom (like Ctrl+/Ctrl- in Chrome) — it scales layout width
    // as well as text, so zooming out actually fits more table columns on screen, not just
    // shrinking the font. Synchronous and per-window; no main-process round trip needed.
    get: (): number => webFrame.getZoomFactor(),
    set: (factor: number): void => {
      webFrame.setZoomFactor(factor);
    },
  },
};

export type PreloadApi = typeof api;

contextBridge.exposeInMainWorld('api', api);
