import type { ApprovalStatus } from './purchases/billApproval';
import type { PaymentTerm } from './contacts/paymentTerms';
import type { PayRunItem } from './payroll/payrollItems';
export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
export type NormalBalance = 'Debit' | 'Credit';
export type JournalEntryStatus = 'draft' | 'posted' | 'void';
export type GifiStatementType = 'BalanceSheet' | 'IncomeStatement';
/** Lets an accountant flag a line for GST/HST review/filing purposes (e.g. "this needs an ITC
 * claim", "exempt supply"). 'HST', 'USTax', and 'MealsHST' amounts are entered as a pre-tax base
 * with the tax computed on top (see computeTaxSplit.ts) and posted to a dedicated GST/HST
 * Payable/Recoverable account — not embedded in the category account. 'USTax' is US sales tax,
 * not Canadian GST/HST: none of it is a Canadian ITC, so it's folded back into the category
 * account and intentionally excluded from the CRA HST Summary/remittance report. 'MealsHST' is
 * CRA's 50%-ITC restriction on meals & entertainment — only half the computed HST is claimable,
 * the other half is a real non-recoverable cost folded back into the expense. */
/** Sales-tax codes. The first five are the originals and are what existing ledger rows carry, so
 * their spellings must not change; the rest were added to cover the other provinces. Rates and
 * recoverability live in taxCodes.ts rather than being scattered through the UI. */
export type TaxCode =
  | 'HST'
  | 'NonHST'
  | 'Manual'
  | 'USTax'
  | 'MealsHST'
  | 'GST'
  | 'HST_NS'
  | 'HST_15'
  | 'HST_NB'
  | 'HST_NL'
  | 'HST_PE'
  | 'GST_AB'
  | 'GST_NT'
  | 'GST_NU'
  | 'GST_YT'
  | 'GST_PST_BC'
  | 'GST_PST_SK'
  | 'GST_RST_MB'
  | 'GST_QST_QC'
  | 'GST_QST_QC_NR';
/** Foreign-source document currencies supported for conversion into the CAD books at booking
 * time. This is transaction-level multi-currency, not foreign-denominated bank accounts or FX
 * revaluation; see convertForeignAmount.ts. */
/** Currencies for which the Bank of Canada publishes a daily foreign/CAD rate. CAD is deliberately
 * not in this list: it remains the books' base currency and is rendered first by the selector. */
export const FOREIGN_CURRENCY_CODES = [
  'USD', 'EUR', 'GBP', 'AUD', 'JPY',
  'CHF', 'CNY', 'HKD', 'INR', 'MXN', 'NZD', 'SGD',
  'KRW', 'BRL', 'IDR', 'MYR', 'NOK', 'PEN', 'PLN',
  'ZAR', 'SEK', 'TWD', 'THB', 'TRY',
] as const;
export type ForeignCurrencyCode = (typeof FOREIGN_CURRENCY_CODES)[number];

export const FOREIGN_CURRENCY_LABELS: Record<ForeignCurrencyCode, string> = {
  USD: 'US dollar', EUR: 'Euro', GBP: 'UK pound', AUD: 'Australian dollar', JPY: 'Japanese yen',
  CHF: 'Swiss franc', CNY: 'Chinese renminbi', HKD: 'Hong Kong dollar', INR: 'Indian rupee',
  MXN: 'Mexican peso', NZD: 'New Zealand dollar', SGD: 'Singapore dollar', KRW: 'South Korean won',
  BRL: 'Brazilian real', IDR: 'Indonesian rupiah', MYR: 'Malaysian ringgit', NOK: 'Norwegian krone',
  PEN: 'Peruvian sol', PLN: 'Polish zloty', ZAR: 'South African rand', SEK: 'Swedish krona',
  TWD: 'Taiwanese dollar', THB: 'Thai baht', TRY: 'Turkish lira',
};

export function normalBalanceForType(type: AccountType): NormalBalance {
  return type === 'Asset' || type === 'Expense' ? 'Debit' : 'Credit';
}

export interface Account {
  id: number;
  code: string;
  name: string;
  accountType: AccountType;
  accountSubtype: string | null;
  normalBalance: NormalBalance;
  parentId: number | null;
  gifiCode: string | null;
  isActive: boolean;
  isSystem: boolean;
  description: string | null;
  /** e.g. a chequing/savings account number, or the last 4 digits of a credit card — shown
   * alongside the account name so it's clear which real-world bank/card account this maps to.
   * Meaningful only for Asset/Liability accounts; null everywhere else. */
  accountNumber: string | null;
  /** Manually flags an account as a valid Transfer target in Bank Import's category dropdown,
   * on top of the accounts automatically offered there (Cash and Bank / Credit Card subtypes) —
   * for balance-sheet accounts that move money between each other but don't carry one of those
   * two subtypes (a line of credit, PayPal, an intercompany account, Petty Cash, and similar). */
  isTransferEligible: boolean;
  /** Explicitly marks this as a non-posting roll-up account, even before any children are added. */
  isMaster?: boolean;
  /** The currency this account is held in. Ledger balances are always CAD; a foreign account
   * also carries its foreign balance from the foreign amounts on its lines. */
  currency?: 'CAD' | ForeignCurrencyCode;
}

export interface GifiCode {
  code: string;
  description: string;
  statementType: GifiStatementType;
  category: string | null;
  isCustom: boolean;
}

export interface JournalEntryLine {
  id: number;
  journalEntryId: number;
  accountId: number;
  debitCents: number;
  creditCents: number;
  description: string | null;
  lineOrder: number;
  taxCode: TaxCode | null;
  /** For lines tagged 'Manual' — the HST amount the accountant calculated by hand from the
   * source invoice and entered/linked back to this transaction. Null until entered. */
  manualHstCents: number | null;
  /** The pre-tax amount this line's base/tax split was built from (see buildTaxSplitJournalLines)
   * — null on lines that were never part of a split (money-side lines, plain journal entries).
   * debitCents/creditCents alone can't be un-mixed back into base vs. tax for every tax code —
   * USTax and MealsHST fold part or all of the tax into the category line with no other trace of
   * it — so this is what a "Base Amt" column reads from. */
  baseCents: number | null;
  /** Set once this line has been ticked off in a bank reconciliation checklist. Null until then. */
  clearedAt: string | null;
  /** The bank reconciliation this line was cleared against, if any. */
  reconciliationId: number | null;
  /** Informational only, like taxCode/manualHstCents — the source USD figures behind this line's
   * (already-converted) CAD debitCents/creditCents, kept for the client's own reference. */
  foreignCurrency: ForeignCurrencyCode | null;
  foreignAmountCents: number | null;
  exchangeRate: number | null;
  /** Optionally tags this line with a vendor or customer — independent of the category account,
   * same as QuickBooks' journal-entry "Name" column. At most one of the two is ever set. */
  vendorId: number | null;
  customerId: number | null;
}

export interface JournalEntry {
  id: number;
  entryDate: string;
  memo: string | null;
  reference: string | null;
  status: JournalEntryStatus;
  createdAt: string;
  postedAt: string | null;
  /** Display name of the signed-in person who created the entry. Older entries may be null. */
  createdBy?: string | null;
  lines: JournalEntryLine[];
  /** Optional reference period this entry covers (e.g. a quarterly membership fee paid on one
   * date but covering Jan 1 – Mar 30) — informational only, doesn't affect posting. */
  periodFrom: string | null;
  periodTo: string | null;
  /** Flags this as a period-end/audit adjustment rather than a routine transaction — informational
   * only (matches QuickBooks' "Is Adjusting Journal Entry?"), doesn't affect posting or reports. */
  isAdjustingEntry: boolean;
  /** Where the entry came from. 'clientImport' marks the rows a client supplied in a spreadsheet,
   * which is what makes the accountant's later corrections worth reporting on. */
  source: JournalEntrySource;
  /** Approval workflow — see workflow/approvals.ts. Absent on hand-built test objects. */
  approvalStatus?: 'notRequired' | 'pending' | 'approved' | 'rejected';
  approvedBy?: string | null;
  approvedAt?: string | null;
  approvalNote?: string | null;
  /** The specific source: a spreadsheet filename, a statement name, a batch reference. */
  sourceReference: string | null;
}

export type JournalEntrySource = 'manual' | 'quickEntry' | 'clientImport' | 'bankImport';

/** One recorded change to a journal entry, as stored. Mirrors JournalEntryChange in
 * ledger/journalEntryDiff.ts, which is what produces these. */
export interface JournalEntryRevision {
  id: number;
  journalEntryId: number;
  changedAt: string;
  field: string;
  label: string;
  kind: 'added' | 'removed' | 'changed';
  oldValue: string | null;
  newValue: string | null;
  lineLabel: string | null;
  /** Display name of the signed-in person who made this specific revision. */
  changedBy?: string | null;
}

export interface NewJournalEntryLineInput {
  accountId: number;
  debitCents: number;
  creditCents: number;
  description?: string | null;
  taxCode?: TaxCode | null;
  /** Only meaningful when taxCode is 'Manual' — lets the accountant enter the real HST amount
   * immediately; a line left without one is excluded from HST totals until it is filled in. */
  manualHstCents?: number | null;
  /** See JournalEntryLine.baseCents — pass through when this line came from a base/tax split. */
  baseCents?: number | null;
  vendorId?: number | null;
  customerId?: number | null;
  foreignCurrency?: ForeignCurrencyCode | null;
  foreignAmountCents?: number | null;
  exchangeRate?: number | null;
}

export interface NewJournalEntryInput {
  entryDate: string;
  memo?: string | null;
  reference?: string | null;
  lines: NewJournalEntryLineInput[];
  isAdjustingEntry?: boolean;
}

export interface FiscalPeriod {
  id: number;
  periodStart: string;
  periodEnd: string;
  label: string;
  isLocked: boolean;
  lockedAt: string | null;
}

export interface CompanyInfo {
  legalName: string;
  displayName: string | null;
  fiscalYearEndMonth: number;
  fiscalYearEndDay: number;
  baseCurrency: string;
  businessNumber: string | null;
  businessType: string | null;
  hstQuickMethodEnabled: boolean;
  hstQuickMethodRate: number | null;
  /** CRA GST/HST program account number, e.g. "123456789RT0001". */
  hstNumber: string | null;
  /** CRA payroll program account number, e.g. "123456789RP0001". */
  payrollNumber: string | null;
  /** Own GST/HST reporting period and CRA remitter type; absent on hand-built test objects. */
  hstFilingFrequency?: HstFilingFrequency;
  payrollRemitterType?: 'quarterly' | 'regular' | 'accelerated1' | 'accelerated2';
  /** Ontario Employer Health Tax: may the company claim the exemption, and how much of it. */
  ehtExemptionEligible?: boolean;
  ehtExemptionCents?: number;
  /** PNG/JPG data URL printed on customer PDFs; null = name only. */
  logoDataUrl?: string | null;
  /** Approval thresholds; null = that document type never needs approval. */
  approvalJournalThresholdCents?: number | null;
  approvalPoThresholdCents?: number | null;
  /** CPA-005 direct deposit settings; absent on hand-built test objects. */
  eftOriginatorId?: string | null;
  eftOriginatorShortName?: string | null;
  eftDataCentre?: string | null;
  eftSettlementInstitution?: string | null;
  eftSettlementTransit?: string | null;
  eftSettlementAccount?: string | null;
  eftFileCreationNumber?: number;
  numberOfEmployees: number | null;
  businessAddressLine1: string | null;
  businessAddressLine2: string | null;
  businessCity: string | null;
  businessProvince: string | null;
  businessPostalCode: string | null;
  /** When true, the mailing address fields are not used — the business address is the mailing
   * address too — and the mailing* fields below are ignored/cleared. */
  mailingSameAsBusinessAddress: boolean;
  mailingAddressLine1: string | null;
  mailingAddressLine2: string | null;
  mailingCity: string | null;
  mailingProvince: string | null;
  mailingPostalCode: string | null;
  /** Ontario-only (see wsibRates2026.ts) — both null when WSIB isn't configured. */
  wsibClassCode: string | null;
  wsibRate: number | null;
  schemaVersion: number;
}

export interface CategoryRule {
  id: number;
  /** Case-insensitive substring matched against a transaction description. */
  pattern: string;
  accountId: number;
  taxCode: TaxCode | null;
  priority: number;
  isActive: boolean;
}

/** Result shape returned across the IPC boundary — errors never throw across it. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type HstFilingFrequency = 'Monthly' | 'Quarterly' | 'Annually' | 'None';

/** The CRA's own marital status categories for a T1 return (line on the Info page of the return). */
export type MaritalStatus = 'Single' | 'Married' | 'Common-Law' | 'Separated' | 'Divorced' | 'Widowed';

export type EmploymentStatus = 'Employed' | 'Self-Employed' | 'Both' | 'Not Employed';

export type HomeOwnership = 'Own' | 'Lease';

/** T1 = personal return, T2 = corporate return — a client can need either or both. */
export type TaxReturnType = 'T1' | 'T2' | 'Both';

/** Purely for the color-coded client list — never used for anything filing-related. */
export type ClientGender = 'Male' | 'Female' | 'Other' | 'Unspecified';

/** The insurance and registered-plan products this practice sells — set on a client to mark them
 * as an insurance/investment client (as opposed to, or in addition to, a bookkeeping/tax client). */
export type InsuranceProductType = 'Life' | 'Critical Illness' | 'Disability' | 'Super Visa' | 'Visitor Insurance' | 'RRSP' | 'TFSA' | 'FHSA' | 'RESP';

export interface DependentInfo {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
}

export interface OutstandingDocumentItem {
  id: string;
  label: string;
  received: boolean;
}

/** A dated log entry for a conversation/interaction with the client — e.g. "Called about renewal,
 * will follow up next week." Kept as a running log (not a single overwritten note) so past
 * conversations stay visible. */
export interface ClientCommentEntry {
  id: string;
  date: string;
  text: string;
}

/**
 * A practice-wide client entry, stored outside any single company file (in the app's userData
 * folder) since a company's own SQLite file only knows about itself, never about siblings.
 *
 * The personal-taxpayer fields (name/SIN/DOB onward) are all optional/nullable — a client created
 * before this data was tracked, or one that's purely a bookkeeping client with no personal T1
 * involved, simply won't have them set.
 */
export interface ClientRecord {
  id: string;
  clientName: string;
  phone: string | null;
  email: string | null;
  companyFilePath: string | null;
  fiscalYearEndMonth: number;
  fiscalYearEndDay: number;
  hstFilingFrequency: HstFilingFrequency;
  notes: string;
  createdAt: string;

  firstName: string | null;
  lastName: string | null;
  address: string | null;
  sin: string | null;
  dateOfBirth: string | null;
  gender: ClientGender;
  maritalStatus: MaritalStatus | null;
  spouseFirstName: string | null;
  spouseLastName: string | null;
  spouseSin: string | null;
  spouseDateOfBirth: string | null;
  dependents: DependentInfo[];
  employmentStatus: EmploymentStatus | null;
  /** Whether the client owns their home or rents/leases it — relevant for T1 credits (e.g.
   * provincial property tax/rent credits) and general client-profile context. */
  homeOwnership: HomeOwnership | null;
  returnType: TaxReturnType | null;
  returnCompleted: boolean;
  returnFiled: boolean;
  outstandingDocuments: OutstandingDocumentItem[];
  /** A client can hold more than one product at once (e.g. Life + a TFSA), so this is a list. */
  insuranceTypes: InsuranceProductType[];
  /** When the client's insurance policy renews/lapses — drives the "expiring soon" highlight and
   * renewal-reminder message on the Insurance Clients tab. */
  policyExpiryDate: string | null;
  /** Dated log of conversations with this client, newest first. */
  comments: ClientCommentEntry[];
}

/** A user-created, checkable reminder — separate from the auto-computed tax/HST/year-end
 * deadlines, which are derived fresh from ClientRecord fields rather than stored. */
export interface ReminderRecord {
  id: string;
  clientId: string | null;
  title: string;
  dueDate: string;
  completed: boolean;
  notes: string;
  createdAt: string;
}

export type AppointmentUrgency = 'urgent' | 'normal' | 'mild';

/** A scheduled client meeting/appointment — distinct from ReminderRecord (a dateless-time,
 * checkable to-do): appointments carry a specific time, a duration, an urgency color, and can be
 * snoozed (deferred without being marked done). */
export interface AppointmentRecord {
  id: string;
  clientId: string | null;
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  urgency: AppointmentUrgency;
  notes: string;
  completed: boolean;
  /** ISO datetime; while in the future, this appointment is excluded from "due now" reminders. */
  snoozedUntil: string | null;
  createdAt: string;
}

export type PayType = 'Hourly' | 'Salary';

export interface Employee {
  id: number;
  name: string;
  province: string;
  payType: PayType;
  hourlyRateCents: number | null;
  annualSalaryCents: number | null;
  payPeriodsPerYear: number;
  vacationPayRate: number;
  sinLastFour: string | null;
  /** Full 9-digit SIN — used only for T4 slip generation, never displayed elsewhere. */
  sin: string | null;
  isActive: boolean;
  /** TD1 "Total Claim Amount" — null means "use the current year's basic personal amount" (the
   * correct default when no TD1 was filed). Federal and Ontario claims are tracked separately
   * since they can legitimately differ (e.g. spousal/disability amounts claimed on one TD1 but
   * not the other). Only used for automatic income tax calculation; see calculateIncomeTax.ts. */
  federalTotalClaimCents: number | null;
  provincialTotalClaimCents: number | null;
  /** TD1 "Additional tax deductions requested for this pay period" (factor L in the CRA formula). */
  additionalTaxCents: number | null;
  /** Recurring per-pay-period employer benefit defaults. RRSP contributions are taxable benefits
   * remitted directly to the plan; health benefits are employer-cost additions. Neither is paid
   * as cash net pay. Null/0 means the employee doesn't get it. */
  rrspEmployerMatchCents: number | null;
  healthBenefitCents: number | null;
  /** Mailing address — printed in the employee block of the T4 slip. Distinct from `province`
   * above, which is the province of EMPLOYMENT (T4 box 10): an employee can live in one province
   * and work in another. Use employeeAddressLines() to format it. */
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressProvince: string | null;
  addressPostalCode: string | null;
  /** Direct deposit destination; absent on hand-built test objects. */
  bankInstitution?: string | null;
  bankTransit?: string | null;
  bankAccount?: string | null;
  /** True = vacation pay accrues to a Vacation Pay Payable liability instead of being paid out with
   * every cheque, with CPP/EI/tax deferred until it is actually paid (see calculatePay). */
  vacationPayAccrued: boolean;
}

export type CpaNoteStatus = 'open' | 'resolved';

/**
 * A note written for the CPA reviewing the books — a question, or an explanation of something that
 * would otherwise look wrong to a reviewer. Bundled into the review package sent to the CPA
 * alongside the balance sheet (see cpaReviewPackage.ts).
 */
export interface CpaNote {
  id: number;
  noteDate: string;
  subject: string;
  body: string;
  status: CpaNoteStatus;
  /** Optional anchors — what the note is about. */
  accountId: number | null;
  journalEntryId: number | null;
  /** The CPA's answer, once the note comes back reviewed. */
  cpaResponse: string | null;
  resolvedAt: string | null;
}

/** 'customer' credits a sale back to a customer; 'vendor' is a credit received from a vendor. */
export type CreditNoteKind = 'customer' | 'vendor';

/**
 * open — issued, with the balance still sitting in AR/AP
 * applied — used up against a specific invoice or bill
 * refunded — paid out (or received) in cash
 */
export type CreditNoteStatus = 'open' | 'applied' | 'refunded';

export interface CreditNoteLine {
  id: number;
  creditNoteId: number;
  lineOrder: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  /** Revenue account for a customer credit; expense/asset account for a vendor credit. */
  categoryAccountId: number;
  taxCode: TaxCode | null;
  manualHstCents: number | null;
}

export interface NewCreditNoteLineInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
  categoryAccountId: number;
  taxCode?: TaxCode | null;
  manualHstCents?: number | null;
}

export interface CreditNote {
  id: number;
  /** When this was keyed in (stored UTC) — the Entered column beside Date. Absent only on
   * hand-built test objects. */
  createdAt?: string;
  kind: CreditNoteKind;
  /** Customer id for a customer credit note, vendor id for a vendor credit. */
  contactId: number;
  creditNoteNumber: string;
  creditNoteDate: string;
  memo: string | null;
  totalCents: number;
  status: CreditNoteStatus;
  /** The invoice (customer) or bill (vendor) it last settled, or null if never applied. */
  appliedToId: number | null;
  /** How much of the credit has been applied so far, across every document. */
  appliedCents: number;
  /** What is still available to apply or refund. */
  remainingCents: number;
  creditJournalEntryId: number | null;
  /** Set once refunded in cash. */
  refundJournalEntryId: number | null;
  lines: CreditNoteLine[];
}

/** A filed GST/HST return — one closed reporting period. See hstFiling.ts for the posting. */
export interface HstFiling {
  id: number;
  /** When this was keyed in (stored UTC) — the Entered column beside Date. Absent only on
   * hand-built test objects. */
  createdAt?: string;
  periodStart: string;
  periodEnd: string;
  filingDate: string;
  collectedCents: number;
  itcCents: number;
  /** collectedCents − itcCents. Positive = remitted to CRA, negative = refund received. */
  netPayableCents: number;
  paymentAccountId: number | null;
  journalEntryId: number | null;
  /** Filing-owned locked period that prevents later transactions changing a submitted return. */
  fiscalPeriodId: number | null;
  memo: string | null;
}

export interface Contact {
  id: number;
  name: string;
  companyName?: string | null;
  contactName?: string | null;
  website?: string | null;
  shippingAddress?: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  /** Vendors only, in practice — whether payments to this contact should be reported on a T4A
   * (Box 048, fees for services) at year end. */
  isT4aContractor: boolean;
  t4aSin: string | null;
  t4aBusinessNumber: string | null;
  /** Vendors only, in practice — whether payments to this contact should be reported on a T5018
   * (Statement of Contract Payments, construction-industry subcontractors) instead of/as well as a
   * T4A. Reuses t4aSin/t4aBusinessNumber for identity — see computeT5018Slip.ts. */
  isT5018Contractor: boolean;
  /** Vendors only, in practice — pre-fills a Bill's category the first time this vendor is picked
   * (a specific bill's own "last category used" still takes priority once one exists). */
  defaultExpenseAccountId: number | null;
  /** Usual terms for this contact, used to prefill a new invoice or bill. Null means nothing has
   * been chosen and the app-wide default applies. */
  paymentTerms: PaymentTerm | null;
  /** Customers: annual late-payment interest rate agreed; null or absent = never charged. */
  lateInterestRatePercent?: number | null;
}

export type BillStatus = 'unpaid' | 'paid';

export interface BillLine {
  id: number;
  billId: number;
  lineOrder: number;
  categoryAccountId: number;
  description: string | null;
  /** Pre-tax amount. */
  baseCents: number;
  taxCode: TaxCode | null;
  taxCents: number;
  productId: number | null;
  quantity: number | null;
}

export interface Bill {
  id: number;
  /** When this was keyed in (stored UTC) — the Entered column beside Date. Absent only on
   * hand-built test objects. */
  createdAt?: string;
  vendorId: number;
  /** Vendor's invoice/reference number. Unique within that vendor when supplied. */
  billNumber: string | null;
  purchaseOrderNumber?: string | null;
  billDate: string;
  dueDate: string;
  categoryAccountId: number;
  amountCents: number;
  taxCode: TaxCode | null;
  manualHstCents: number | null;
  memo: string | null;
  status: BillStatus;
  billJournalEntryId: number | null;
  paymentJournalEntryId: number | null;
  paidCents: number;
  balanceDueCents: number;
  foreignCurrency: ForeignCurrencyCode | null;
  foreignAmountCents: number | null;
  exchangeRate: number | null;
  /** Path to the original scanned receipt this bill was created from, if any — see the Receipt
   * Inbox feature. Points into the app's "North Ledger Receipts/Archive" folder. */
  receiptFilePath: string | null;
  /** Whether anyone has agreed to pay this. Deliberately separate from `status`: a bill spends
   * most of its life approved but unpaid, which one combined field could not express. */
  approvalStatus: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  /** Terms agreed on this bill, independent of the vendor's current default. */
  paymentTerms: PaymentTerm | null;
  productId?: number | null;
  quantity?: number | null;
  /** Every bill has at least one line; a "split" bill has several, each to its own account. The
   * header fields above summarise them (category/tax code = first line, amount = grand total).
   * Optional only so hand-built fixtures and pre-lines callers still type-check; every bill the
   * database returns carries its lines. */
  lines?: BillLine[];
}

export type InvoiceStatus = 'unpaid' | 'paid';

export interface InvoiceLine {
  id: number;
  invoiceId: number;
  lineOrder: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  revenueAccountId: number;
  /** The product sold, when the line is stock. Null for a service or a delivery charge. */
  productId: number | null;
  taxCode: TaxCode | null;
  manualHstCents: number | null;
}

export interface Invoice {
  id: number;
  /** When this was keyed in (stored UTC) — the Entered column beside Date. Absent only on
   * hand-built test objects. */
  createdAt?: string;
  customerId: number;
  invoiceNumber: string;
  customerPoNumber?: string | null;
  shippingAddress?: string | null;
  invoiceDate: string;
  dueDate: string;
  memo: string | null;
  totalCents: number;
  discountCents: number;
  status: InvoiceStatus;
  invoiceJournalEntryId: number | null;
  paymentJournalEntryId: number | null;
  paidCents: number;
  balanceDueCents: number;
  lines: InvoiceLine[];
  foreignCurrency: ForeignCurrencyCode | null;
  foreignAmountCents: number | null;
  exchangeRate: number | null;
  /** Null while the received payment sits in Undeposited Funds; set once a Deposit batches it
   * into an actual bank account. */
  depositId: number | null;
  /** Terms agreed on this invoice, independent of the customer's current default. */
  paymentTerms: PaymentTerm | null;
  /** Which account the payment landed in; null means it was not recorded (treated as Undeposited
   * Funds). What stops a payment banked directly being offered for deposit a second time. */
  paymentAccountId: number | null;
  /** Last day late-payment interest has been charged for; null = never. */
  lateInterestChargedThrough?: string | null;
}

export interface InvoicePayment {
  id: number;
  /** When this was keyed in (stored UTC) — the Entered column beside Date. Absent only on
   * hand-built test objects. */
  createdAt?: string;
  invoiceId: number;
  paymentDate: string;
  amountCents: number;
  moneyAccountId: number;
  journalEntryId: number;
  depositId: number | null;
  memo: string | null;
  foreignAmountCents?: number | null;
  exchangeRate?: number | null;
  /** Realized exchange gain (+) or loss (−) in CAD cents. */
  fxGainLossCents?: number;
}

export interface BillPayment {
  id: number;
  /** When this was keyed in (stored UTC) — the Entered column beside Date. Absent only on
   * hand-built test objects. */
  createdAt?: string;
  billId: number;
  paymentDate: string;
  amountCents: number;
  bankAccountId: number;
  journalEntryId: number;
  memo: string | null;
  foreignAmountCents?: number | null;
  exchangeRate?: number | null;
  /** Realized exchange gain (+) or loss (−) in CAD cents. */
  fxGainLossCents?: number;
}

export interface Deposit {
  id: number;
  /** When this was keyed in (stored UTC) — the Entered column beside Date. Absent only on
   * hand-built test objects. */
  createdAt?: string;
  depositDate: string;
  bankAccountId: number;
  journalEntryId: number | null;
}

/** One row in the Make Deposit picker — an invoice payment or sales receipt still sitting in
 * Undeposited Funds, normalized to a common shape so both kinds can be listed and selected
 * together. */
export interface UndepositedItem {
  kind: 'invoice' | 'invoicePayment' | 'salesReceipt';
  id: number;
  number: string;
  date: string;
  customerId: number;
  totalCents: number;
}

export interface NewInvoiceLineInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
  revenueAccountId: number;
  taxCode?: TaxCode | null;
  manualHstCents?: number | null;
}

export interface SalesReceiptLine {
  id: number;
  salesReceiptId: number;
  lineOrder: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  revenueAccountId: number;
  /** The product sold, when the line is stock. Null for a service or a delivery charge. */
  productId: number | null;
  taxCode: TaxCode | null;
  manualHstCents: number | null;
}

/** A statement line the reviewer has told Bank Import to never surface again — matched by exact
 * date + description + amount within one bank/credit-card account, so the same recurring noise
 * (e.g. a bank fee reversal, an owner's known personal transaction) doesn't need re-excluding every
 * time an overlapping statement range gets imported. */
export interface BankImportExclusion {
  id: number;
  accountId: number;
  transactionDate: string;
  description: string;
  amountCents: number;
}

/** One saved row of in-progress Bank Import categorization — see the migration's own comment for
 * why this exists (an app close mid-review previously discarded uncommitted category/tax/vendor
 * choices silently). Keyed the same way as BankImportExclusion. */
export interface BankImportRowProgress {
  id: number;
  accountId: number;
  transactionDate: string;
  description: string;
  amountCents: number;
  categoryAccountId: number | null;
  taxCode: TaxCode | null;
  manualHstCents: number;
  vendorId: number | null;
  customerId: number | null;
  include: boolean;
}

/** A "money in" transaction that's paid in full the moment it's recorded — no unpaid state, no
 * Accounts Receivable — matching QuickBooks' Sales Receipt (as opposed to Invoice, which bills a
 * customer to be paid later). Posts a single journal entry: Debit depositToAccountId, Credit each
 * line's revenue account (+ GST/HST Payable if any). */
export interface SalesReceipt {
  id: number;
  /** When this was keyed in (stored UTC) — the Entered column beside Date. Absent only on
   * hand-built test objects. */
  createdAt?: string;
  customerId: number;
  receiptNumber: string;
  receiptDate: string;
  memo: string | null;
  totalCents: number;
  depositToAccountId: number;
  journalEntryId: number | null;
  depositId: number | null;
  lines: SalesReceiptLine[];
  foreignCurrency: ForeignCurrencyCode | null;
  foreignAmountCents: number | null;
  exchangeRate: number | null;
}

export interface NewSalesReceiptLineInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
  revenueAccountId: number;
  productId?: number | null;
  taxCode?: TaxCode | null;
  manualHstCents?: number | null;
}

export type BankReconciliationStatus = 'in_progress' | 'completed';

export interface BankReconciliation {
  id: number;
  accountId: number;
  statementDate: string;
  startingBalanceCents: number;
  endingBalanceCents: number;
  status: BankReconciliationStatus;
  completedAt: string | null;
}

export type PayrollRunStatus = 'draft' | 'posted';

export interface PayrollRun {
  id: number;
  /** When this was keyed in (stored UTC) — the Entered column beside Date. Absent only on
   * hand-built test objects. */
  createdAt?: string;
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
  wsibEmployerCents: number;
  rrspEmployerMatchCents: number;
  healthBenefitCents: number;
  incomeTaxCents: number;
  netPayCents: number;
  status: PayrollRunStatus;
  journalEntryId: number | null;
  /** True = this run releases previously accrued vacation pay rather than a normal pay period. */
  isVacationPayout: boolean;
  /** Payroll items on this run (bonuses, benefits, deductions…); loaded with the run. */
  items?: PayRunItem[];
}

export interface Shareholder {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  /** For individuals — used to fill in the T5 slip's recipient SIN. */
  sin: string | null;
  /** For corporate shareholders — used to fill in the T5 slip's recipient business number. */
  businessNumber: string | null;
  /** The Liability account tracking what the company owes this specific shareholder — typically
   * a sub-account of a "Due to Shareholder(s)" main account (e.g. "Due to Jane Smith" under "Due
   * to Shareholder"), same pattern as "RBC Visa" under "Visa". Null until linked. */
  loanAccountId: number | null;
  isActive: boolean;
}

export type T5PaymentType = 'eligible_dividend' | 'non_eligible_dividend' | 'interest';

export interface T5Payment {
  id: number;
  shareholderId: number;
  paymentDate: string;
  paymentType: T5PaymentType;
  amountCents: number;
  bankAccountId: number;
  memo: string | null;
  journalEntryId: number | null;
}
