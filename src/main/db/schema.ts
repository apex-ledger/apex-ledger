import Database from 'better-sqlite3';
import { Kysely, SqliteDialect, CamelCasePlugin, type Generated } from 'kysely';

// CamelCasePlugin translates camelCase identifiers here to snake_case SQL (table + column names),
// so every table/column below is declared camelCase even though the actual .sql migrations use
// snake_case — that mapping is what the plugin exists to do.
//
// `Generated<T>` marks columns the database fills in when omitted from an insert (autoincrement
// ids, DEFAULT (datetime('now')) timestamps) so they're optional on insert but always present
// on select — use the `Selectable<...>` / `Insertable<...>` helpers when typing rows elsewhere.

export interface CompanyInfoTable {
  id: number; // singleton row, always explicitly inserted as 1
  legalName: string;
  displayName: string | null;
  fiscalYearEndMonth: number;
  fiscalYearEndDay: number;
  baseCurrency: string;
  businessNumber: string | null;
  businessType: string | null;
  hstQuickMethodEnabled: Generated<number>;
  hstQuickMethodRate: Generated<number | null>;
  hstNumber: string | null;
  payrollNumber: string | null;
  /** CPA-005 direct deposit settings from the bank's EFT agreement. */
  eftOriginatorId: string | null;
  eftOriginatorShortName: string | null;
  eftDataCentre: string | null;
  eftSettlementInstitution: string | null;
  eftSettlementTransit: string | null;
  eftSettlementAccount: string | null;
  eftFileCreationNumber: Generated<number>;
  hstFilingFrequency: Generated<string>;
  payrollRemitterType: Generated<string>;
  ehtExemptionEligible: Generated<number>;
  ehtExemptionCents: Generated<number>;
  logoDataUrl: string | null;
  approvalJournalThresholdCents: number | null;
  approvalPoThresholdCents: number | null;
  numberOfEmployees: number | null;
  businessAddressLine1: string | null;
  businessAddressLine2: string | null;
  businessCity: string | null;
  businessProvince: string | null;
  businessPostalCode: string | null;
  mailingSameAsBusinessAddress: Generated<number>;
  mailingAddressLine1: string | null;
  mailingAddressLine2: string | null;
  mailingCity: string | null;
  mailingProvince: string | null;
  mailingPostalCode: string | null;
  /** Ontario-only (see wsibRates2026.ts) — both null when the company hasn't configured WSIB.
   * wsibRate is stored explicitly (not just derived from the class each time) so it survives a
   * year where the class-to-rate table changes, and so it can be manually overridden. */
  wsibClassCode: string | null;
  wsibRate: number | null;
  createdAt: Generated<string>;
}

export interface GifiCodeTable {
  code: string; // explicit PK, not generated
  description: string;
  statementType: 'BalanceSheet' | 'IncomeStatement';
  category: string | null;
  isCustom: number;
  createdAt: Generated<string>;
}

export interface AccountTable {
  id: Generated<number>;
  code: string;
  name: string;
  accountType: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  accountSubtype: string | null;
  normalBalance: 'Debit' | 'Credit';
  parentId: number | null;
  gifiCode: string | null;
  isActive: number;
  isSystem: number;
  description: string | null;
  createdAt: Generated<string>;
  accountNumber: string | null;
  isTransferEligible: number;
  isMaster: Generated<number>;
  /** 'CAD' or a foreign code — a USD chequing account holds USD, its ledger balance is CAD. */
  currency: Generated<string>;
}

export interface JournalEntryTable {
  id: Generated<number>;
  entryDate: string;
  memo: string | null;
  reference: string | null;
  status: 'draft' | 'posted' | 'void';
  createdAt: Generated<string>;
  postedAt: string | null;
  createdBy: string | null;
  /** Optional reference period this entry covers (e.g. a quarterly membership fee paid on one
   * date but covering Jan 1 – Mar 30) — informational only, doesn't affect posting. */
  periodFrom: string | null;
  periodTo: string | null;
  isAdjustingEntry: Generated<number>;
  /** Where this entry came from: 'manual', 'clientImport', 'bankImport'. Drives the Adjusting
   * Entries report, which is only meaningful for entries somebody else supplied. */
  source: Generated<string>;
  sourceReference: string | null;
  approvalStatus: Generated<string>;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
}

export interface ProductTable {
  id: Generated<number>;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: Generated<string>;
  salePriceCents: Generated<number>;
  purchasePriceCents: Generated<number>;
  incomeAccountId: number | null;
  cogsAccountId: number | null;
  assetAccountId: number | null;
  trackQuantity: Generated<number>;
  defaultTaxCode: string | null;
  reorderPoint: Generated<number>;
  isActive: Generated<number>;
  createdAt: Generated<string>;
  productType: Generated<string>;
  category: string | null;
  preferredVendorId: number | null;
  leadTimeDays: Generated<number>;
  minimumOrderQuantity: Generated<number>;
  reorderQuantity: Generated<number>;
  binLocation: string | null;
  manufacturer: string | null;
  manufacturerPartNumber: string | null;
  weightKg: number | null;
  notes: string | null;
}

export interface FixedAssetTable {
  id: Generated<number>;
  name: string;
  description: string | null;
  assetAccountId: number;
  accumulatedDepreciationAccountId: number | null;
  depreciationExpenseAccountId: number | null;
  costCents: number;
  salvageCents: Generated<number>;
  acquiredDate: string;
  inServiceDate: string;
  method: Generated<string>;
  usefulLifeMonths: Generated<number>;
  decliningRate: Generated<number>;
  ccaClass: string | null;
  serialNumber: string | null;
  location: string | null;
  notes: string | null;
  status: Generated<string>;
  disposedDate: string | null;
  proceedsCents: number | null;
  disposalJournalEntryId: number | null;
  createdAt: Generated<string>;
}

export interface FixedAssetDepreciationTable {
  id: Generated<number>;
  assetId: number;
  periodMonth: string;
  amountCents: number;
  journalEntryId: number | null;
}

export interface ProductBundleItemTable {
  id: Generated<number>;
  bundleProductId: number;
  componentProductId: number;
  quantity: number;
}

export interface InventoryMovementTable {
  id: Generated<number>;
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
  createdAt: Generated<string>;
}

export interface TagGroupTable {
  id: Generated<number>;
  name: string;
  description: string | null;
  isActive: Generated<number>;
  createdAt: Generated<string>;
}

export interface TagTable {
  id: Generated<number>;
  tagGroupId: number;
  name: string;
  isActive: Generated<number>;
  createdAt: Generated<string>;
}

export interface JournalEntryLineTagTable {
  id: Generated<number>;
  journalEntryLineId: number;
  tagId: number;
}

export interface CcaPoolTable {
  id: Generated<number>;
  fiscalYearEnd: string;
  classCode: string;
  openingUccCents: Generated<number>;
  additionsCents: Generated<number>;
  dispositionsCents: Generated<number>;
  availableForUseYear: number | null;
  rateOverride: number | null;
  claimCents: number | null;
  note: string | null;
  createdAt: Generated<string>;
}

export interface LoanTable {
  id: Generated<number>;
  name: string;
  lender: string | null;
  principalCents: number;
  annualRate: number;
  frequency: Generated<string>;
  numberOfPayments: number;
  compounding: Generated<string>;
  startDate: string | null;
  liabilityAccountId: number | null;
  interestAccountId: number | null;
  isActive: Generated<number>;
  createdAt: Generated<string>;
}

export interface BudgetTable {
  id: Generated<number>;
  name: string;
  fiscalYearEnd: string;
  isActive: Generated<number>;
  note: string | null;
  createdAt: Generated<string>;
}

export interface BudgetLineTable {
  id: Generated<number>;
  budgetId: number;
  accountId: number;
  period: number;
  amountCents: Generated<number>;
}

export interface JournalEntryRevisionTable {
  id: Generated<number>;
  journalEntryId: number;
  changedAt: Generated<string>;
  field: string;
  label: string;
  kind: string;
  oldValue: string | null;
  newValue: string | null;
  lineLabel: string | null;
  changedBy: string | null;
}

/** A file attached to any transaction — see attachments.handlers.ts. */
/** A recurring-invoice template — see recurringInvoices.handlers.ts. Lines are JSON. */
/** Billable hours by customer — see timeEntries.handlers.ts. */
export interface PayrollItemTable {
  id: Generated<number>;
  name: string;
  kind: string;
  cppApplies: number;
  eiApplies: number;
  taxApplies: number;
  t4Box: string | null;
  defaultAmountCents: number;
  accountId: number | null;
  isActive: number;
  createdAt: Generated<string>;
}

export interface PayrollRunItemTable {
  id: Generated<number>;
  payrollRunId: number;
  itemId: number | null;
  name: string;
  kind: string;
  cppApplies: number;
  eiApplies: number;
  taxApplies: number;
  t4Box: string | null;
  amountCents: number;
  accountId: number | null;
}

export interface TimeEntryTable {
  id: Generated<number>;
  customerId: number;
  employeeId: number | null;
  staffName: string | null;
  workDate: string;
  hours: number;
  rateCents: number;
  description: string | null;
  billable: number;
  invoiceId: number | null;
  createdBy: string | null;
  createdAt: Generated<string>;
}

export interface RecurringInvoiceTable {
  id: Generated<number>;
  name: string;
  customerId: number;
  frequency: string;
  nextDate: string;
  endDate: string | null;
  paymentTerms: string | null;
  memo: string | null;
  customerPoNumber: string | null;
  autoEmail: number;
  isActive: number;
  linesJson: string;
  lastGeneratedDate: string | null;
  createdBy: string | null;
  createdAt: Generated<string>;
}

export interface AttachmentTable {
  id: Generated<number>;
  entityType: string;
  entityId: number;
  filePath: string;
  originalName: string;
  sizeBytes: number;
  note: string | null;
  addedBy: string | null;
  createdAt: Generated<string>;
}

export interface UserActivityLogTable {
  id: Generated<number>;
  actorKey: string;
  actorName: string;
  actorEmail: string | null;
  topic: string;
  action: string;
  targetReference: string | null;
  changedAt: Generated<string>;
}

/** One sign-in by one person in one window: from becoming the active identity until they switch,
 * lock, close the window or the app closes. Read only by an administrator. */
export interface StaffSessionTable {
  id: Generated<number>;
  actorKey: string;
  actorName: string;
  actorEmail: string | null;
  role: string;
  windowId: number;
  signedInAt: Generated<string>;
  signedOutAt: string | null;
  endReason: string | null;
}

export interface JournalEntryLineTable {
  id: Generated<number>;
  journalEntryId: number;
  accountId: number;
  debitCents: number;
  creditCents: number;
  description: string | null;
  lineOrder: number;
  taxCode: string | null;
  manualHstCents: number | null;
  /** Optionally tags this line with a vendor or customer — independent of the category account,
   * same as QuickBooks' journal-entry "Name" column. At most one of the two is ever set. */
  vendorId: number | null;
  customerId: number | null;
  /** The pre-tax amount this line's split was built from (buildTaxSplitJournalLines) — null on
   * lines that were never part of a base/tax split (money-side lines, plain journal entries).
   * Needed because debitCents/creditCents alone can't be un-mixed back into base vs. tax for every
   * tax code: USTax and MealsHST fold part or all of the tax into the category line with no
   * separate trace of it, so this is the only reliable source for a "Base Amt" column. */
  baseCents: number | null;
  clearedAt: string | null;
  reconciliationId: number | null;
  foreignCurrency: string | null;
  foreignAmountCents: number | null;
  exchangeRate: number | null;
}

export interface CategoryRuleTable {
  id: Generated<number>;
  pattern: string;
  accountId: number;
  taxCode: string | null;
  priority: number;
  isActive: number;
  createdAt: Generated<string>;
}

export interface FiscalPeriodTable {
  id: Generated<number>;
  periodStart: string;
  periodEnd: string;
  label: string;
  isLocked: number;
  lockedAt: string | null;
}

export interface EmployeeTable {
  id: Generated<number>;
  name: string;
  province: string;
  payType: 'Hourly' | 'Salary';
  hourlyRateCents: number | null;
  annualSalaryCents: number | null;
  payPeriodsPerYear: number;
  vacationPayRate: number;
  sinLastFour: string | null;
  /** Full 9-digit SIN — used only for T4 slip generation, never displayed elsewhere (see
   * sinLastFour for the masked value shown on pay stubs). */
  sin: string | null;
  isActive: number;
  createdAt: Generated<string>;
  federalTotalClaimCents: number | null;
  provincialTotalClaimCents: number | null;
  additionalTaxCents: number | null;
  /** Recurring per-pay-period employer benefit defaults. RRSP contributions are taxable benefits
   * remitted directly to the plan; health benefits are employer-cost additions. Neither is paid
   * as cash net pay. Null/0 means the employee doesn't get it. */
  rrspEmployerMatchCents: number | null;
  healthBenefitCents: number | null;
  /** Mailing address — printed in the employee block of the T4 slip. Kept separate from
   * `province` above, which is the province of EMPLOYMENT (T4 box 10) used for tax calculation:
   * an employee can live in one province and work in another. */
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressProvince: string | null;
  addressPostalCode: string | null;
  /** Direct deposit destination — 3-digit institution, 5-digit transit, account. */
  bankInstitution: string | null;
  bankTransit: string | null;
  bankAccount: string | null;
  /** 1 = accrue vacation pay to a liability instead of paying it out each period (see
   * calculatePay's vacationPayAccrued). Defaults to 0, the original pay-it-out behaviour. */
  vacationPayAccrued: Generated<number>;
}

export interface PayrollRunTable {
  id: Generated<number>;
  employeeId: number;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  regularHours: number | null;
  overtimeHours: number | null;
  regularPayCents: number;
  overtimePayCents: number;
  grossPayCents: number;
  vacationPayCents: number;
  cpp1EmployeeCents: number;
  cpp1EmployerCents: number;
  cpp2EmployeeCents: number;
  cpp2EmployerCents: number;
  eiEmployeeCents: number;
  eiEmployerCents: number;
  wsibEmployerCents: Generated<number>;
  rrspEmployerMatchCents: Generated<number>;
  healthBenefitCents: Generated<number>;
  incomeTaxCents: number;
  netPayCents: number;
  status: 'draft' | 'posted';
  journalEntryId: number | null;
  createdAt: Generated<string>;
  /** 1 = this run pays out previously accrued vacation rather than a normal pay period. */
  isVacationPayout: Generated<number>;
}

export interface ContactTable {
  id: Generated<number>;
  name: string;
  companyName: string | null;
  contactName: string | null;
  website: string | null;
  shippingAddress: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: number;
  createdAt: Generated<string>;
  /** Vendors only, in practice — whether payments to this contact should be reported on a T4A
   * (Box 048, fees for services) at year end. Present on both customers and vendors since they
   * share this table shape, but only meaningful for vendors. */
  isT4aContractor: Generated<number>;
  t4aSin: string | null;
  t4aBusinessNumber: string | null;
  /** Vendors only, in practice — whether payments to this contact should be reported on a T5018
   * (Statement of Contract Payments) at year end instead of/as well as a T4A. Construction-industry
   * subcontractors use T5018, not T4A Box 048 — see computeT5018Slip.ts. Reuses t4aSin/
   * t4aBusinessNumber above for the recipient's identity number since it's the same real SIN/BN
   * regardless of which slip references it. */
  isT5018Contractor: Generated<number>;
  /** Vendors only, in practice — pre-fills a Bill's category the first time this vendor is picked
   * (a specific bill's own "last category used" still takes priority once one exists). */
  defaultExpenseAccountId: number | null;
  /** This contact's usual payment terms, used to prefill a new invoice or bill. Null on files that
   * predate the field; the document's own value is what actually decides its due date. */
  paymentTerms: string | null;
  /** Customers only: annual late-payment interest rate agreed, null = never charged. */
  lateInterestRatePercent: number | null;
}

export interface BillLineTable {
  id: Generated<number>;
  billId: number;
  lineOrder: number;
  categoryAccountId: number;
  description: string | null;
  /** Pre-tax; tax is on top (see buildTaxSplitLines.ts). */
  baseCents: number;
  taxCode: string | null;
  taxCents: number;
  productId: number | null;
  quantity: number | null;
}

export interface BillTable {
  id: Generated<number>;
  vendorId: number;
  billNumber: string | null;
  purchaseOrderNumber: string | null;
  billDate: string;
  dueDate: string;
  categoryAccountId: number;
  amountCents: number;
  taxCode: string | null;
  manualHstCents: number | null;
  memo: string | null;
  status: 'unpaid' | 'paid';
  billJournalEntryId: number | null;
  paymentJournalEntryId: number | null;
  paidCents: Generated<number>;
  createdAt: Generated<string>;
  foreignCurrency: string | null;
  foreignAmountCents: number | null;
  exchangeRate: number | null;
  receiptFilePath: string | null;
  /** 'pending' | 'approved' | 'rejected' | 'onHold'. Separate from paid/unpaid: a bill spends most
   * of its life approved but unpaid, which one combined field could not express. */
  approvalStatus: Generated<string>;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  /** The terms agreed on THIS bill — see the note on InvoiceTable.paymentTerms. */
  paymentTerms: string | null;
  /** Optional shared catalogue item received by this simple one-line bill. */
  productId: number | null;
  quantity: number | null;
}

export interface InvoiceTable {
  id: Generated<number>;
  customerId: number;
  /** Last day late-payment interest has been charged for; null = never. */
  lateInterestChargedThrough: string | null;
  invoiceNumber: string;
  customerPoNumber: string | null;
  shippingAddress: string | null;
  invoiceDate: string;
  dueDate: string;
  memo: string | null;
  totalCents: number;
  /** Customer discount granted on the invoice, posted to Customer Discounts expense. */
  discountCents: Generated<number>;
  status: 'unpaid' | 'paid';
  invoiceJournalEntryId: number | null;
  paymentJournalEntryId: number | null;
  paidCents: Generated<number>;
  createdAt: Generated<string>;
  foreignCurrency: string | null;
  foreignAmountCents: number | null;
  exchangeRate: number | null;
  /** Null while the received payment sits in Undeposited Funds; set once a Deposit batches it
   * into an actual bank account. */
  depositId: number | null;
  /** The terms agreed on THIS invoice. Kept here as well as on the customer so that changing a
   * customer's default cannot move the due date of an invoice already sent. */
  paymentTerms: string | null;
  /** Which account the payment landed in. Null on rows written before this was recorded, which the
   * code reads as Undeposited Funds — how those rows already behaved. */
  paymentAccountId: number | null;
}


export interface InvoicePaymentTable {
  id: Generated<number>;
  invoiceId: number;
  paymentDate: string;
  amountCents: number;
  moneyAccountId: number;
  journalEntryId: number;
  depositId: number | null;
  memo: string | null;
  createdAt: Generated<string>;
  /** Foreign amount settled and the rate it converted at — null for a CAD payment. */
  foreignAmountCents: number | null;
  exchangeRate: number | null;
  /** Realized exchange gain (+) or loss (−) in CAD cents posted with this payment. */
  fxGainLossCents: Generated<number>;
}

export interface BillPaymentTable {
  id: Generated<number>;
  billId: number;
  paymentDate: string;
  amountCents: number;
  bankAccountId: number;
  journalEntryId: number;
  memo: string | null;
  createdAt: Generated<string>;
  /** Foreign amount settled and the rate it converted at — null for a CAD payment. */
  foreignAmountCents: number | null;
  exchangeRate: number | null;
  /** Realized exchange gain (+) or loss (−) in CAD cents posted with this payment. */
  fxGainLossCents: Generated<number>;
}

export interface DepositTable {
  id: Generated<number>;
  depositDate: string;
  bankAccountId: number;
  journalEntryId: number | null;
  createdAt: Generated<string>;
}

export interface InvoiceLineTable {
  id: Generated<number>;
  invoiceId: number;
  lineOrder: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  revenueAccountId: number;
  taxCode: string | null;
  manualHstCents: number | null;
  /** The product sold, when the line is for stock. Null for a service or a delivery charge. */
  productId: number | null;
}

export interface SalesReceiptTable {
  id: Generated<number>;
  customerId: number;
  receiptNumber: string;
  receiptDate: string;
  memo: string | null;
  totalCents: number;
  depositToAccountId: number;
  journalEntryId: number | null;
  /** Only meaningful when depositToAccountId is the Undeposited Funds account: null until a
   * Deposit batches it into a real bank account, same as InvoiceTable.depositId. Stays permanently
   * null when depositToAccountId is already a real bank account — there's nothing left to sweep. */
  depositId: number | null;
  foreignCurrency: string | null;
  foreignAmountCents: number | null;
  exchangeRate: number | null;
  createdAt: Generated<string>;
}

export interface SalesReceiptLineTable {
  id: Generated<number>;
  salesReceiptId: number;
  lineOrder: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  revenueAccountId: number;
  taxCode: string | null;
  manualHstCents: number | null;
  /** The product sold, when the line is for stock. Null for a service or a delivery charge. */
  productId: number | null;
}

export interface BankImportExclusionTable {
  id: Generated<number>;
  accountId: number;
  transactionDate: string;
  description: string;
  amountCents: number;
  createdAt: Generated<string>;
}

export interface BankImportRowProgressTable {
  id: Generated<number>;
  accountId: number;
  transactionDate: string;
  description: string;
  amountCents: number;
  categoryAccountId: number | null;
  taxCode: string | null;
  manualHstCents: Generated<number>;
  vendorId: number | null;
  customerId: number | null;
  include: Generated<number>;
  updatedAt: Generated<string>;
}

export interface BankReconciliationTable {
  id: Generated<number>;
  accountId: number;
  statementDate: string;
  startingBalanceCents: number;
  endingBalanceCents: number;
  status: 'in_progress' | 'completed';
  completedAt: string | null;
  createdAt: Generated<string>;
}

export interface ReceiptImportTable {
  id: Generated<number>;
  sourceFileName: string;
  archivedFilePath: string;
  billId: number | null;
  journalEntryId: number | null;
  importedAt: Generated<string>;
}

export interface RecurringTemplateTable {
  id: Generated<number>;
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
  /** Set when the template posts as a vendor bill (unpaid, into Accounts Payable) rather than a
   * paid expense. `billDueDays` is the vendor's terms, counted from the bill date. */
  billVendorId: number | null;
  billDueDays: number | null;
  createdAt: Generated<string>;
}

export interface ShareholderTable {
  id: Generated<number>;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  sin: string | null;
  businessNumber: string | null;
  loanAccountId: number | null;
  isActive: Generated<number>;
  createdAt: Generated<string>;
}

export interface T5PaymentTable {
  id: Generated<number>;
  shareholderId: number;
  paymentDate: string;
  paymentType: 'eligible_dividend' | 'non_eligible_dividend' | 'interest';
  amountCents: number;
  bankAccountId: number;
  memo: string | null;
  journalEntryId: number | null;
  createdAt: Generated<string>;
}

export interface EstimateTable {
  id: Generated<number>;
  customerId: number;
  estimateNumber: string;
  estimateDate: string;
  expiryDate: string | null;
  memo: string | null;
  totalCents: Generated<number>;
  status: Generated<string>;
  /** The invoice this became. What stops the same quote being invoiced twice. */
  convertedInvoiceId: number | null;
  convertedAt: string | null;
  createdAt: Generated<string>;
  /** Sales-order stage (an accepted estimate): 'pending' | 'shipped'. */
  fulfillmentStatus: Generated<string>;
  shipDate: string | null;
  requiredByDate: string | null;
  /** The purchase order raised to source this order, if any. */
  convertedPurchaseOrderId: number | null;
  closedAt: string | null;
}

export interface EstimateLineTable {
  id: Generated<number>;
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

export interface PurchaseOrderTable {
  id: Generated<number>;
  vendorId: number;
  poNumber: string;
  orderDate: string;
  expectedDate: string | null;
  memo: string | null;
  totalCents: Generated<number>;
  status: Generated<string>;
  approvalStatus: Generated<string>;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  convertedBillId: number | null;
  convertedAt: string | null;
  receivedAt: string | null;
  receiptJournalEntryId: number | null;
  matchedBillId: number | null;
  matchedAt: string | null;
  createdAt: Generated<string>;
}

export interface PurchaseOrderLineTable {
  id: Generated<number>;
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
  receivedQuantity: Generated<number>;
}


export interface PurchaseOrderReceiptTable {
  id: Generated<number>;
  purchaseOrderId: number;
  receiptDate: string;
  journalEntryId: number | null;
  createdAt: Generated<string>;
}

export interface PurchaseOrderReceiptLineTable {
  id: Generated<number>;
  receiptId: number;
  purchaseOrderLineId: number;
  quantity: number;
  unitCostCents: number;
  accruedCostCents: number;
}

export interface MileageTripTable {
  id: Generated<number>;
  tripDate: string;
  kilometres: number;
  purpose: string;
  vehicle: string | null;
  startLocation: string | null;
  endLocation: string | null;
  /** Set once included in a posted claim. Null means unclaimed — what stops double-claiming. */
  journalEntryId: number | null;
  claimedAt: string | null;
  createdAt: Generated<string>;
}

export interface CompanyUserTable {
  id: Generated<number>;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  permissionsJson: Generated<string>;
  status: Generated<string>;
  invitationToken: string | null;
  invitedAt: Generated<string>;
  acceptedAt: string | null;
  createdAt: Generated<string>;
}

export interface DatabaseSchema {
  userActivityLog: UserActivityLogTable;
  attachments: AttachmentTable;
  recurringInvoices: RecurringInvoiceTable;
  timeEntries: TimeEntryTable;
  payrollItems: PayrollItemTable;
  payrollRunItems: PayrollRunItemTable;
  staffSessions: StaffSessionTable;
  companyUsers: CompanyUserTable;
  companyInfo: CompanyInfoTable;
  gifiCodes: GifiCodeTable;
  accounts: AccountTable;
  journalEntries: JournalEntryTable;
  journalEntryLines: JournalEntryLineTable;
  journalEntryRevisions: JournalEntryRevisionTable;
  products: ProductTable;
  productBundleItems: ProductBundleItemTable;
  fixedAssets: FixedAssetTable;
  fixedAssetDepreciation: FixedAssetDepreciationTable;
  inventoryMovements: InventoryMovementTable;
  ccaPools: CcaPoolTable;
  tagGroups: TagGroupTable;
  tags: TagTable;
  journalEntryLineTags: JournalEntryLineTagTable;
  budgets: BudgetTable;
  budgetLines: BudgetLineTable;
  loans: LoanTable;
  fiscalPeriods: FiscalPeriodTable;
  categoryRules: CategoryRuleTable;
  employees: EmployeeTable;
  payrollRuns: PayrollRunTable;
  customers: ContactTable;
  vendors: ContactTable;
  bills: BillTable;
  billLines: BillLineTable;
  billPayments: BillPaymentTable;
  invoices: InvoiceTable;
  invoicePayments: InvoicePaymentTable;
  invoiceLines: InvoiceLineTable;
  estimates: EstimateTable;
  estimateLines: EstimateLineTable;
  purchaseOrders: PurchaseOrderTable;
  purchaseOrderLines: PurchaseOrderLineTable;
  purchaseOrderReceipts: PurchaseOrderReceiptTable;
  purchaseOrderReceiptLines: PurchaseOrderReceiptLineTable;
  mileageTrips: MileageTripTable;
  salesReceipts: SalesReceiptTable;
  salesReceiptLines: SalesReceiptLineTable;
  bankImportExclusions: BankImportExclusionTable;
  bankImportRowProgress: BankImportRowProgressTable;
  bankReconciliations: BankReconciliationTable;
  receiptImports: ReceiptImportTable;
  recurringTemplates: RecurringTemplateTable;
  shareholders: ShareholderTable;
  t5Payments: T5PaymentTable;
  deposits: DepositTable;
  hstFilings: HstFilingTable;
  creditNotes: CreditNoteTable;
  creditNoteApplications: CreditNoteApplicationTable;
  creditNoteLines: CreditNoteLineTable;
  cpaNotes: CpaNoteTable;
  workpaperAccounts: WorkpaperAccountTable;
  workpaperAttachments: WorkpaperAttachmentTable;
  auditEngagements: AuditEngagementTable;
  auditDocuments: AuditDocumentTable;
  auditReviewNotes: AuditReviewNoteTable;
  yearEndSignoffs: YearEndSignoffTable;
}

export interface HstFilingTable {
  id: Generated<number>;
  periodStart: string;
  periodEnd: string;
  filingDate: string;
  collectedCents: number;
  itcCents: number;
  /** collectedCents − itcCents. Positive = remitted to CRA, negative = refund received. */
  netPayableCents: number;
  /** Null only when the net was exactly zero and no money moved. */
  paymentAccountId: number | null;
  journalEntryId: number | null;
  fiscalPeriodId: number | null;
  memo: string | null;
  createdAt: Generated<string>;
}

export interface CreditNoteTable {
  id: Generated<number>;
  kind: 'customer' | 'vendor';
  /** Customer id when kind='customer', vendor id when kind='vendor'. */
  contactId: number;
  creditNoteNumber: string;
  creditNoteDate: string;
  memo: string | null;
  totalCents: number;
  status: Generated<'open' | 'applied' | 'refunded'>;
  /** Invoice id (customer) or bill id (vendor) this credit last settled. Kept for older screens;
   * the applications table is the record. */
  appliedToId: number | null;
  /** Running total of every application, so what remains is total less this. */
  appliedCents: Generated<number>;
  creditJournalEntryId: number | null;
  refundJournalEntryId: number | null;
  createdAt: Generated<string>;
}

/** One application of a credit against one document. A credit may have several. */
export interface CreditNoteApplicationTable {
  id: Generated<number>;
  creditNoteId: number;
  /** Invoice id for a customer credit, bill id for a vendor credit. */
  targetId: number;
  amountCents: number;
  appliedDate: string;
  createdAt: Generated<string>;
}

export interface CreditNoteLineTable {
  id: Generated<number>;
  creditNoteId: number;
  lineOrder: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  categoryAccountId: number;
  taxCode: string | null;
  manualHstCents: number | null;
}

export interface CpaNoteTable {
  id: Generated<number>;
  noteDate: string;
  subject: string;
  body: string;
  status: Generated<'open' | 'resolved'>;
  accountId: number | null;
  journalEntryId: number | null;
  cpaResponse: string | null;
  resolvedAt: string | null;
  createdAt: Generated<string>;
}

export interface WorkpaperAccountTable {
  id: Generated<number>;
  periodEnd: string;
  accountId: number;
  status: Generated<'pending' | 'reviewed' | 'query'>;
  note: string | null;
  reviewedAt: string | null;
  createdAt: Generated<string>;
}

export interface WorkpaperAttachmentTable {
  id: Generated<number>;
  workpaperAccountId: number;
  filePath: string;
  fileName: string;
  addedAt: Generated<string>;
}

export interface AuditEngagementTable {
  id: Generated<number>;
  periodEnd: string;
  status: Generated<'planning' | 'fieldwork' | 'completion' | 'locked'>;
  materialityBasis: string | null;
  materialityBasisCents: number | null;
  materialityPercent: number | null;
  overallMaterialityCents: number | null;
  performanceMaterialityCents: number | null;
  trivialMisstatementCents: number | null;
  materialityRationale: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
  createdAt: Generated<string>;
  updatedAt: Generated<string>;
}

export interface AuditDocumentTable {
  id: Generated<number>;
  engagementId: number;
  indexCode: string;
  title: string;
  phase: 'setup' | 'planning' | 'risk' | 'response' | 'completion' | 'reporting';
  status: Generated<'not_started' | 'in_progress' | 'prepared' | 'reviewed' | 'query'>;
  content: Generated<string>;
  preparedBy: string | null;
  preparedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: Generated<string>;
  updatedAt: Generated<string>;
}

export interface AuditReviewNoteTable {
  id: Generated<number>;
  documentId: number;
  note: string;
  status: Generated<'open' | 'resolved'>;
  createdBy: string | null;
  createdAt: Generated<string>;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export type AppDb = Kysely<DatabaseSchema>;

export function createKysely(sqlite: Database.Database): AppDb {
  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
    plugins: [new CamelCasePlugin()],
  });
}

export interface YearEndSignoffTable {
  id: Generated<number>;
  periodStart: string;
  periodEnd: string;
  reviewer: string;
  decision: 'ready' | 'readyWithNotes' | 'notReady';
  greenCount: number;
  amberCount: number;
  redCount: number;
  note: string | null;
  signedAt: Generated<string>;
}
