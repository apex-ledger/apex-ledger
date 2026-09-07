import { z } from 'zod';
import { FOREIGN_CURRENCY_CODES } from '../domain/types';

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const;
const GIFI_STATEMENT_TYPES = ['BalanceSheet', 'IncomeStatement'] as const;
export const TAX_CODES = [
  'HST',
  'NonHST',
  'Manual',
  'USTax',
  'MealsHST',
  'GST',
  'HST_NS',
  'HST_15',
  'HST_NB',
  'HST_NL',
  'HST_PE',
  'GST_AB',
  'GST_NT',
  'GST_NU',
  'GST_YT',
  'GST_PST_BC',
  'GST_PST_SK',
  'GST_RST_MB',
  'GST_QST_QC',
  'GST_QST_QC_NR',
] as const;
const foreignCurrencyFieldsSchema = {
  foreignCurrency: z.enum(FOREIGN_CURRENCY_CODES).nullable().optional().default(null),
  foreignAmountCents: z.number().int().positive().nullable().optional().default(null),
  exchangeRate: z.number().positive().nullable().optional().default(null),
};
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD).');

/** Account codes are at least four characters, matching every code in the app's own starter charts
 * (assets 1000–, liabilities 2000–, and so on) and the numbering an accountant expects.
 *
 * The length is not cosmetic. Codes sort the whole chart of accounts and are what the account
 * pickers match against as you type — a one- or two-character code like "1" matches loosely enough
 * to be picked by accident, which is how a bank account ends up on a line that meant something
 * else. Letters are allowed (some charts use "1000A"); only the length is enforced. */
const ACCOUNT_CODE = z
  .string()
  .trim()
  .min(4, 'Account code must be at least 4 characters — use the usual numbering, e.g. 1000 for a bank account.')
  .max(20);

export const newAccountSchema = z.object({
  code: ACCOUNT_CODE,
  name: z.string().trim().min(1).max(200),
  accountType: z.enum(ACCOUNT_TYPES),
  accountSubtype: z.string().trim().max(100).nullable().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  gifiCode: z.string().trim().min(1).max(10).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  accountNumber: z.string().trim().max(50).nullable().optional(),
  isTransferEligible: z.boolean().optional(),
  isMaster: z.boolean().optional(),
  currency: z.enum(['CAD', ...FOREIGN_CURRENCY_CODES]).optional(),
});
export type NewAccountPayload = z.infer<typeof newAccountSchema>;

export const updateAccountSchema = z.object({
  id: z.number().int().positive(),
  // isActive lives here rather than on newAccountSchema: an account is always created active, but
  // it can be retired later. Without it the Chart of Accounts' Status dropdown was sending a field
  // zod then stripped, so switching an account to inactive silently did nothing.
  patch: newAccountSchema.partial().extend({ isActive: z.boolean().optional() }),
});

export const newGifiCodeSchema = z.object({
  code: z.string().trim().min(1).max(10),
  description: z.string().trim().min(1).max(300),
  statementType: z.enum(GIFI_STATEMENT_TYPES),
  category: z.string().trim().max(100).nullable().optional(),
});

export const updateGifiCodeSchema = z.object({
  code: z.string().trim().min(1).max(10),
  patch: newGifiCodeSchema.omit({ code: true }).partial(),
});

const journalEntryLineSchema = z.object({
  accountId: z.number().int().positive(),
  debitCents: z.number().int().min(0),
  creditCents: z.number().int().min(0),
  description: z.string().trim().max(500).nullable().optional(),
  taxCode: z.enum(TAX_CODES).nullable().optional(),
  manualHstCents: z.number().int().min(0).nullable().optional(),
  baseCents: z.number().int().min(0).nullable().optional(),
  vendorId: z.number().int().positive().nullable().optional(),
  customerId: z.number().int().positive().nullable().optional(),
  ...foreignCurrencyFieldsSchema,
});

export const newJournalEntrySchema = z.object({
  entryDate: ISO_DATE,
  memo: z.string().trim().max(500).nullable().optional(),
  reference: z.string().trim().max(100).nullable().optional(),
  lines: z.array(journalEntryLineSchema).min(1),
  periodFrom: ISO_DATE.nullable().optional().default(null),
  periodTo: ISO_DATE.nullable().optional().default(null),
  isAdjustingEntry: z.boolean().optional().default(false),
  /** Where the entry came from. Defaults to 'manual', which is every entry typed in this app. */
  source: z.enum(['manual', 'quickEntry', 'clientImport', 'bankImport']).optional().default('manual'),
  sourceReference: z.string().trim().max(300).nullable().optional().default(null),
});
export type NewJournalEntryPayload = z.infer<typeof newJournalEntrySchema>;

export const updateJournalEntrySchema = z.object({
  id: z.number().int().positive(),
  // `source` and `sourceReference` are omitted deliberately: where an entry came from is a fact
  // about its history, not a field to edit. Allowing a patch to change it would let an entry walk
  // out of the Adjusting Entries report by relabelling itself as manual.
  patch: newJournalEntrySchema.omit({ source: true, sourceReference: true }).partial(),
});

/** Date-only correction — unlike updateJournalEntrySchema's patch (draft entries only, since
 * changing amounts/accounts needs re-validating the whole entry), the date has no effect on
 * whether the entry balances, so this is allowed on posted entries too (see journalUpdateDate). */
export const updateJournalEntryDateSchema = z.object({
  id: z.number().int().positive(),
  entryDate: ISO_DATE,
});

export const newFiscalPeriodSchema = z.object({
  periodStart: ISO_DATE,
  periodEnd: ISO_DATE,
  label: z.string().trim().min(1).max(100),
});

export const companyCreateSchema = z.object({
  legalName: z.string().trim().min(1).max(300),
  fiscalYearEndMonth: z.number().int().min(1).max(12),
  fiscalYearEndDay: z.number().int().min(1).max(31),
  baseCurrency: z.literal('CAD').default('CAD'),
  businessNumber: z.string().trim().max(20).nullable().optional(),
  businessType: z.string().trim().max(50).nullable().optional(),
  hstQuickMethodEnabled: z.boolean().optional(),
  hstQuickMethodRate: z.number().min(0).max(100).nullable().optional(),
  hstNumber: z.string().trim().max(20).nullable().optional(),
  payrollNumber: z.string().trim().max(20).nullable().optional(),
  approvalJournalThresholdCents: z.number().int().min(0).nullable().optional(),
  approvalPoThresholdCents: z.number().int().min(0).nullable().optional(),
  hstFilingFrequency: z.enum(['Monthly', 'Quarterly', 'Annually', 'None']).optional(),
  payrollRemitterType: z.enum(['quarterly', 'regular', 'accelerated1', 'accelerated2']).optional(),
  ehtExemptionEligible: z.boolean().optional(),
  ehtExemptionCents: z.number().int().min(0).max(100_000_000).optional(),
  logoDataUrl: z.string().max(600_000).regex(/^data:image\/(png|jpeg);base64,/).nullable().optional(),
  eftOriginatorId: z.string().trim().max(10).nullable().optional(),
  eftOriginatorShortName: z.string().trim().max(15).nullable().optional(),
  eftDataCentre: z.string().trim().max(5).nullable().optional(),
  eftSettlementInstitution: z.string().trim().max(3).nullable().optional(),
  eftSettlementTransit: z.string().trim().max(5).nullable().optional(),
  eftSettlementAccount: z.string().trim().max(12).nullable().optional(),
  numberOfEmployees: z.number().int().min(0).nullable().optional(),
  businessAddressLine1: z.string().trim().max(200).nullable().optional(),
  businessAddressLine2: z.string().trim().max(200).nullable().optional(),
  businessCity: z.string().trim().max(100).nullable().optional(),
  businessProvince: z.string().trim().max(50).nullable().optional(),
  businessPostalCode: z.string().trim().max(20).nullable().optional(),
  mailingSameAsBusinessAddress: z.boolean().optional(),
  mailingAddressLine1: z.string().trim().max(200).nullable().optional(),
  mailingAddressLine2: z.string().trim().max(200).nullable().optional(),
  mailingCity: z.string().trim().max(100).nullable().optional(),
  mailingProvince: z.string().trim().max(50).nullable().optional(),
  mailingPostalCode: z.string().trim().max(20).nullable().optional(),
  coaTemplateId: z.string().trim().min(1).nullable().optional(),
  wsibClassCode: z.string().trim().max(10).nullable().optional(),
  wsibRate: z.number().min(0).nullable().optional(),
});

export const companyUpdateSchema = companyCreateSchema.omit({ coaTemplateId: true }).partial();

export const trialBalanceQuerySchema = z.object({ asOfDate: ISO_DATE });

export const generalLedgerQuerySchema = z.object({
  accountId: z.number().int().positive(),
  dateFrom: ISO_DATE,
  dateTo: ISO_DATE,
});

export const incomeStatementQuerySchema = z.object({
  periodStart: ISO_DATE,
  periodEnd: ISO_DATE,
  comparativeStart: ISO_DATE.nullable().optional(),
  comparativeEnd: ISO_DATE.nullable().optional(),
  /** Accrual counts invoices and bills on their date; cash counts them when paid. */
  basis: z.enum(['accrual', 'cash']).optional().default('accrual'),
});

export const balanceSheetQuerySchema = z.object({
  asOfDate: ISO_DATE,
  comparativeDate: ISO_DATE.nullable().optional(),
});

/** The Statement of Cash Flows and the Statement of Changes in Equity are both period reports with
 * no comparative column, so they share one schema rather than each declaring an identical pair. */
export const periodReportQuerySchema = z.object({
  periodStart: ISO_DATE,
  periodEnd: ISO_DATE,
});

export const gifiExportQuerySchema = z.object({ periodStart: ISO_DATE, asOfDate: ISO_DATE });

export const projectionsQuerySchema = z.object({
  asOfDate: ISO_DATE,
  monthsOfHistory: z.number().int().min(1).max(24).optional(),
  monthsToProject: z.number().int().min(1).max(12).optional(),
});

export const hstSummaryQuerySchema = z.object({
  periodStart: ISO_DATE,
  periodEnd: ISO_DATE,
});

export const setManualHstSchema = z.object({
  lineId: z.number().int().positive(),
  manualHstCents: z.number().int().min(0).nullable(),
});

/** taxCode/manualHstCents are informational HST-tracking metadata, not part of the double-entry
 * structure (amounts, accounts, dates) — so this is allowed on a line regardless of whether its
 * parent entry is draft or posted, unlike journalUpdate which is draft-only. */
export const setLineTaxCodeSchema = z.object({
  lineId: z.number().int().positive(),
  taxCode: z.enum(TAX_CODES).nullable(),
});

export const newCategoryRuleSchema = z.object({
  pattern: z.string().trim().min(1).max(200),
  accountId: z.number().int().positive(),
  taxCode: z.enum(TAX_CODES).nullable().optional(),
  priority: z.number().int().default(0),
});

export const updateCategoryRuleSchema = z.object({
  id: z.number().int().positive(),
  patch: newCategoryRuleSchema.partial(),
});

const HST_FILING_FREQUENCIES = ['Monthly', 'Quarterly', 'Annually', 'None'] as const;
const MARITAL_STATUSES = ['Single', 'Married', 'Common-Law', 'Separated', 'Divorced', 'Widowed'] as const;
const EMPLOYMENT_STATUSES = ['Employed', 'Self-Employed', 'Both', 'Not Employed'] as const;
const HOME_OWNERSHIP_TYPES = ['Own', 'Lease'] as const;
const TAX_RETURN_TYPES = ['T1', 'T2', 'Both'] as const;
const CLIENT_GENDERS = ['Male', 'Female', 'Other', 'Unspecified'] as const;
const INSURANCE_PRODUCT_TYPES = ['Life', 'Critical Illness', 'Disability', 'Super Visa', 'Visitor Insurance', 'RRSP', 'TFSA', 'FHSA', 'RESP'] as const;

const dependentSchema = z.object({
  id: z.string(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dateOfBirth: ISO_DATE.nullable().optional().default(null),
});

const outstandingDocumentSchema = z.object({
  id: z.string(),
  label: z.string().trim().min(1).max(200),
  received: z.boolean().default(false),
});

const clientCommentSchema = z.object({
  id: z.string(),
  date: ISO_DATE,
  text: z.string().trim().min(1).max(2000),
});

export const saveClientSchema = z.object({
  id: z.string().optional(),
  clientName: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(50).nullable().optional().default(null),
  email: z.string().trim().max(200).nullable().optional().default(null),
  companyFilePath: z.string().nullable().optional().default(null),
  fiscalYearEndMonth: z.number().int().min(1).max(12),
  fiscalYearEndDay: z.number().int().min(1).max(31),
  hstFilingFrequency: z.enum(HST_FILING_FREQUENCIES),
  notes: z.string().max(2000).optional().default(''),

  firstName: z.string().trim().max(100).nullable().optional().default(null),
  lastName: z.string().trim().max(100).nullable().optional().default(null),
  address: z.string().trim().max(300).nullable().optional().default(null),
  sin: z.string().trim().max(11).nullable().optional().default(null),
  dateOfBirth: ISO_DATE.nullable().optional().default(null),
  gender: z.enum(CLIENT_GENDERS).optional().default('Unspecified'),
  maritalStatus: z.enum(MARITAL_STATUSES).nullable().optional().default(null),
  spouseFirstName: z.string().trim().max(100).nullable().optional().default(null),
  spouseLastName: z.string().trim().max(100).nullable().optional().default(null),
  spouseSin: z.string().trim().max(11).nullable().optional().default(null),
  spouseDateOfBirth: ISO_DATE.nullable().optional().default(null),
  dependents: z.array(dependentSchema).optional().default([]),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).nullable().optional().default(null),
  homeOwnership: z.enum(HOME_OWNERSHIP_TYPES).nullable().optional().default(null),
  returnType: z.enum(TAX_RETURN_TYPES).nullable().optional().default(null),
  returnCompleted: z.boolean().optional().default(false),
  returnFiled: z.boolean().optional().default(false),
  outstandingDocuments: z.array(outstandingDocumentSchema).optional().default([]),
  insuranceTypes: z.array(z.enum(INSURANCE_PRODUCT_TYPES)).optional().default([]),
  policyExpiryDate: ISO_DATE.nullable().optional().default(null),
  comments: z.array(clientCommentSchema).optional().default([]),
});

export const setDeadlineInformedSchema = z.object({
  key: z.string().trim().min(1).max(300),
  informed: z.boolean(),
});

export const saveReminderSchema = z.object({
  id: z.string().optional(),
  clientId: z.string().nullable().optional().default(null),
  title: z.string().trim().min(1).max(200),
  dueDate: ISO_DATE,
  completed: z.boolean().optional().default(false),
  notes: z.string().max(2000).optional().default(''),
});

const PAY_TYPES = ['Hourly', 'Salary'] as const;

export const newEmployeeSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    province: z.string().trim().min(2).max(2).default('ON'),
    payType: z.enum(PAY_TYPES),
    hourlyRateCents: z.number().int().min(0).nullable().optional().default(null),
    annualSalaryCents: z.number().int().min(0).nullable().optional().default(null),
    payPeriodsPerYear: z.number().int().min(1).max(365).default(26),
    vacationPayRate: z.number().min(0).max(1).default(0.04),
    sinLastFour: z.string().trim().max(4).nullable().optional().default(null),
    sin: z.string().trim().max(11).nullable().optional().default(null),
    federalTotalClaimCents: z.number().int().min(0).nullable().optional().default(null),
    provincialTotalClaimCents: z.number().int().min(0).nullable().optional().default(null),
    additionalTaxCents: z.number().int().min(0).nullable().optional().default(null),
    rrspEmployerMatchCents: z.number().int().min(0).nullable().optional().default(null),
    healthBenefitCents: z.number().int().min(0).nullable().optional().default(null),
    addressLine1: z.string().trim().max(200).nullable().optional().default(null),
    addressLine2: z.string().trim().max(200).nullable().optional().default(null),
    addressCity: z.string().trim().max(100).nullable().optional().default(null),
    addressProvince: z.string().trim().max(2).nullable().optional().default(null),
    addressPostalCode: z.string().trim().max(10).nullable().optional().default(null),
    bankInstitution: z.string().trim().max(3).nullable().optional().default(null),
    bankTransit: z.string().trim().max(5).nullable().optional().default(null),
    bankAccount: z.string().trim().max(12).nullable().optional().default(null),
    vacationPayAccrued: z.boolean().optional().default(false),
  })
  .refine((v) => (v.payType === 'Hourly' ? v.hourlyRateCents !== null : v.annualSalaryCents !== null), {
    message: 'Hourly employees need an hourly rate; salaried employees need an annual salary.',
  });

export const updateEmployeeSchema = z.object({
  id: z.number().int().positive(),
  patch: z.object({
    name: z.string().trim().min(1).max(200).optional(),
    province: z.string().trim().min(2).max(2).optional(),
    payType: z.enum(PAY_TYPES).optional(),
    hourlyRateCents: z.number().int().min(0).nullable().optional(),
    annualSalaryCents: z.number().int().min(0).nullable().optional(),
    payPeriodsPerYear: z.number().int().min(1).max(365).optional(),
    vacationPayRate: z.number().min(0).max(1).optional(),
    sinLastFour: z.string().trim().max(4).nullable().optional(),
    sin: z.string().trim().max(11).nullable().optional(),
    isActive: z.boolean().optional(),
    federalTotalClaimCents: z.number().int().min(0).nullable().optional(),
    provincialTotalClaimCents: z.number().int().min(0).nullable().optional(),
    additionalTaxCents: z.number().int().min(0).nullable().optional(),
    rrspEmployerMatchCents: z.number().int().min(0).nullable().optional(),
    healthBenefitCents: z.number().int().min(0).nullable().optional(),
    addressLine1: z.string().trim().max(200).nullable().optional(),
    addressLine2: z.string().trim().max(200).nullable().optional(),
    addressCity: z.string().trim().max(100).nullable().optional(),
    addressProvince: z.string().trim().max(2).nullable().optional(),
    addressPostalCode: z.string().trim().max(10).nullable().optional(),
    bankInstitution: z.string().trim().max(3).nullable().optional(),
    bankTransit: z.string().trim().max(5).nullable().optional(),
    bankAccount: z.string().trim().max(12).nullable().optional(),
    vacationPayAccrued: z.boolean().optional(),
  }),
});

export const payRunItemSchema = z.object({
  itemId: z.number().int().positive().nullable().optional().default(null),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['earning', 'taxableBenefit', 'deduction', 'reimbursement', 'employerContribution']),
  cppApplies: z.boolean().optional().default(false),
  eiApplies: z.boolean().optional().default(false),
  taxApplies: z.boolean().optional().default(false),
  t4Box: z.enum(['rpp20', 'unionDues44', 'charity46']).nullable().optional().default(null),
  amountCents: z.number().int().min(0),
  accountId: z.number().int().positive().nullable().optional().default(null),
});

export const payrollItemDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['earning', 'taxableBenefit', 'deduction', 'reimbursement', 'employerContribution']),
  cppApplies: z.boolean().optional().default(true),
  eiApplies: z.boolean().optional().default(true),
  taxApplies: z.boolean().optional().default(true),
  t4Box: z.enum(['rpp20', 'unionDues44', 'charity46']).nullable().optional().default(null),
  defaultAmountCents: z.number().int().min(0).optional().default(0),
  accountId: z.number().int().positive().nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
});

export const calculatePayrollRunSchema = z.object({
  employeeId: z.number().int().positive(),
  payPeriodStart: ISO_DATE,
  payPeriodEnd: ISO_DATE,
  payDate: ISO_DATE,
  regularHours: z.number().min(0).nullable().optional().default(null),
  overtimeHours: z.number().min(0).nullable().optional().default(null),
  overtimeMultiplier: z.number().min(1).max(5).optional(),
  incomeTaxCents: z.number().int().min(0).nullable().optional(),
  /** Employer-paid RRSP contribution for this pay period. When omitted, use the employee default;
   * passing zero intentionally skips it for this run. */
  rrspEmployerMatchCents: z.number().int().min(0).nullable().optional(),
  items: z.array(payRunItemSchema).optional().default([]),
});

export const savePayrollRunSchema = calculatePayrollRunSchema;

export const postPayrollRunSchema = z.object({
  id: z.number().int().positive(),
  bankAccountId: z.number().int().positive(),
});

const PAYMENT_TERM_VALUES = ['dueOnReceipt', 'net7', 'net15', 'net30', 'net45', 'net60', 'net90', 'custom'] as const;

export const saveContactSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200),
  companyName: z.string().trim().max(200).nullable().optional().default(null),
  contactName: z.string().trim().max(200).nullable().optional().default(null),
  website: z.string().trim().max(300).nullable().optional().default(null),
  shippingAddress: z.string().trim().max(500).nullable().optional().default(null),
  email: z.string().trim().max(200).nullable().optional().default(null),
  phone: z.string().trim().max(50).nullable().optional().default(null),
  address: z.string().trim().max(500).nullable().optional().default(null),
  notes: z.string().trim().max(2000).nullable().optional().default(null),
  isT4aContractor: z.boolean().optional().default(false),
  t4aSin: z.string().trim().max(11).nullable().optional().default(null),
  t4aBusinessNumber: z.string().trim().max(20).nullable().optional().default(null),
  isT5018Contractor: z.boolean().optional().default(false),
  defaultExpenseAccountId: z.number().int().positive().nullable().optional().default(null),
  /** Null means nothing has been chosen for this contact, which is different from choosing Net 30. */
  paymentTerms: z.enum(PAYMENT_TERM_VALUES).nullable().optional().default(null),
  lateInterestRatePercent: z.number().min(0).max(100).nullable().optional().default(null),
});

const T5_PAYMENT_TYPES = ['eligible_dividend', 'non_eligible_dividend', 'interest'] as const;

export const saveShareholderSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().max(200).nullable().optional().default(null),
  phone: z.string().trim().max(50).nullable().optional().default(null),
  address: z.string().trim().max(500).nullable().optional().default(null),
  notes: z.string().trim().max(2000).nullable().optional().default(null),
  sin: z.string().trim().max(11).nullable().optional().default(null),
  businessNumber: z.string().trim().max(20).nullable().optional().default(null),
  loanAccountId: z.number().int().positive().nullable().optional().default(null),
});

export const recordT5PaymentSchema = z.object({
  shareholderId: z.number().int().positive(),
  paymentDate: ISO_DATE,
  paymentType: z.enum(T5_PAYMENT_TYPES),
  amountCents: z.number().int().positive(),
  bankAccountId: z.number().int().positive(),
  memo: z.string().trim().max(500).nullable().optional().default(null),
});

export const billLineSchema = z.object({
  categoryAccountId: z.number().int().positive(),
  description: z.string().trim().max(500).nullable().optional().default(null),
  baseCents: z.number().int().min(0),
  taxCode: z.enum(TAX_CODES).nullable().optional().default(null),
  taxCents: z.number().int().min(0).default(0),
  productId: z.number().int().positive().nullable().optional().default(null),
  quantity: z.number().positive().nullable().optional().default(null),
  /** Class / location tags for this line — they land on the posted journal line. */
  tagIds: z.array(z.number().int().positive()).optional().default([]),
});

export const newBillSchema = z.object({
  vendorId: z.number().int().positive(),
  /** The bill's lines. Older callers send the single-line fields below instead; either is accepted
   * (see billLinesFromPayload). When lines are given they are the truth and the single-line
   * fields are ignored. */
  lines: z.array(billLineSchema).max(200).optional(),
  billNumber: z.string().trim().max(100).nullable().optional().default(null),
  purchaseOrderNumber: z.string().trim().max(100).nullable().optional().default(null),
  billDate: ISO_DATE,
  dueDate: ISO_DATE,
  categoryAccountId: z.number().int().positive().optional(),
  /** Pre-tax amount — tax is computed on top and posted to its own GST/HST Recoverable line, see
   * buildTaxSplitLines.ts. */
  baseCents: z.number().int().positive().optional(),
  taxCode: z.enum(TAX_CODES).nullable().optional().default(null),
  /** The real tax amount entered in the UI (editable for every tax code, not just Manual). */
  taxCents: z.number().int().min(0).default(0),
  memo: z.string().trim().max(500).nullable().optional().default(null),
  receiptFilePath: z.string().trim().min(1).nullable().optional().default(null),
  paymentTerms: z.enum(PAYMENT_TERM_VALUES).nullable().optional().default(null),
  productId: z.number().int().positive().nullable().optional().default(null),
  quantity: z.number().positive().nullable().optional().default(null),
  ...foreignCurrencyFieldsSchema,
});

export const payBillSchema = z.object({
  id: z.number().int().positive(),
  bankAccountId: z.number().int().positive(),
  paymentDate: ISO_DATE,
  amountCents: z.number().int().positive(),
  memo: z.string().trim().max(500).nullable().optional().default(null),
  /** For a foreign-currency bill: the foreign amount paid and the rate it converted at. */
  foreignAmountCents: z.number().int().positive().nullable().optional().default(null),
  exchangeRate: z.number().positive().nullable().optional().default(null),
});

/** Quick Entry (Expense / Sale) posting: baseCents is the pre-tax amount and taxCents is the real
 * tax amount entered in the UI (editable for every tax code, not just Manual) — tax is posted to
 * its own GST/HST Payable/Recoverable line instead of being embedded, see buildTaxSplitLines.ts. */
export const quickEntrySchema = z.object({
  type: z.enum(['expense', 'income']),
  entryDate: ISO_DATE,
  moneyAccountId: z.number().int().positive(),
  categoryAccountId: z.number().int().positive(),
  baseCents: z.number().int().positive(),
  taxCode: z.enum(TAX_CODES).nullable().optional().default(null),
  taxCents: z.number().int().min(0).default(0),
  description: z.string().trim().max(500).nullable().optional().default(null),
  periodFrom: ISO_DATE.nullable().optional().default(null),
  periodTo: ISO_DATE.nullable().optional().default(null),
  ...foreignCurrencyFieldsSchema,
});
export type QuickEntryPayload = z.infer<typeof quickEntrySchema>;

export const newInvoiceLineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().min(0),
  revenueAccountId: z.number().int().positive(),
  /** The product sold, when the line is stock. Null for a service or a delivery charge — forcing
   * one would make the common case harder in order to serve the uncommon one. */
  productId: z.number().int().positive().nullable().optional().default(null),
  taxCode: z.enum(TAX_CODES).nullable().optional().default(null),
  manualHstCents: z.number().int().min(0).nullable().optional().default(null),
  /** Class / location tags for this line — they land on the posted journal line. */
  tagIds: z.array(z.number().int().positive()).optional().default([]),
});

export const newInvoiceSchema = z.object({
  customerId: z.number().int().positive(),
  invoiceNumber: z.string().trim().min(1).max(50),
  customerPoNumber: z.string().trim().max(100).nullable().optional().default(null),
  shippingAddress: z.string().trim().max(500).nullable().optional().default(null),
  invoiceDate: ISO_DATE,
  dueDate: ISO_DATE,
  memo: z.string().trim().max(500).nullable().optional().default(null),
  discountCents: z.number().int().min(0).optional().default(0),
  lines: z.array(newInvoiceLineSchema).min(1),
  paymentTerms: z.enum(PAYMENT_TERM_VALUES).nullable().optional().default(null),
  ...foreignCurrencyFieldsSchema,
});

/** Receiving a payment normally posts to Undeposited Funds, matching QuickBooks Desktop's Receive
 * Payment → Make Deposit workflow (see makeDepositSchema) — UNLESS bankAccountId is given, which
 * posts directly to that account instead. That direct path is for Bank Import matching only: when
 * a specific statement line is already confirmed to have landed in a specific account, routing it
 * through Undeposited Funds first would make it invisible to Bank Reconciliation for that account. */
export const receiveInvoicePaymentSchema = z.object({
  id: z.number().int().positive(),
  paymentDate: ISO_DATE,
  bankAccountId: z.number().int().positive().nullable().optional().default(null),
  amountCents: z.number().int().positive(),
  memo: z.string().trim().max(500).nullable().optional().default(null),
  /** For a foreign-currency invoice: the foreign amount received and the rate it converted at.
   * The CAD applied to the invoice and the exchange gain/loss are computed from these. */
  foreignAmountCents: z.number().int().positive().nullable().optional().default(null),
  exchangeRate: z.number().positive().nullable().optional().default(null),
});

export const makeDepositSchema = z
  .object({
    invoiceIds: z.array(z.number().int().positive()).optional().default([]),
    invoicePaymentIds: z.array(z.number().int().positive()).optional().default([]),
    salesReceiptIds: z.array(z.number().int().positive()).optional().default([]),
    bankAccountId: z.number().int().positive(),
    depositDate: ISO_DATE,
  })
  .refine((v) => v.invoiceIds.length + v.invoicePaymentIds.length + v.salesReceiptIds.length > 0, {
    message: 'Select at least one payment to deposit.',
  });

export const newSalesReceiptLineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().min(0),
  revenueAccountId: z.number().int().positive(),
  /** The product sold, when the line is stock. Null for a service or a delivery charge — forcing
   * one would make the common case harder in order to serve the uncommon one. */
  productId: z.number().int().positive().nullable().optional().default(null),
  taxCode: z.enum(TAX_CODES).nullable().optional().default(null),
  manualHstCents: z.number().int().min(0).nullable().optional().default(null),
  /** Class / location tags for this line — they land on the posted journal line. */
  tagIds: z.array(z.number().int().positive()).optional().default([]),
});

export const newSalesReceiptSchema = z.object({
  customerId: z.number().int().positive(),
  receiptNumber: z.string().trim().min(1).max(50),
  receiptDate: ISO_DATE,
  memo: z.string().trim().max(500).nullable().optional().default(null),
  /** The account actually debited at posting. Pass the real Undeposited Funds account id to defer
   * the bank leg to Make Deposit, exactly like the same choice a real QuickBooks Sales Receipt
   * offers — there's no separate "undeposited" flag, the chosen account id says it all. */
  depositToAccountId: z.number().int().positive(),
  lines: z.array(newSalesReceiptLineSchema).min(1),
  ...foreignCurrencyFieldsSchema,
});

export const addBankImportExclusionSchema = z.object({
  accountId: z.number().int().positive(),
  transactionDate: ISO_DATE,
  description: z.string().trim().min(1).max(500),
  amountCents: z.number().int(),
});

const bankImportRowProgressItemSchema = z.object({
  accountId: z.number().int().positive(),
  transactionDate: ISO_DATE,
  description: z.string().trim().min(1).max(500),
  amountCents: z.number().int(),
  categoryAccountId: z.number().int().positive().nullable(),
  taxCode: z.enum(TAX_CODES).nullable(),
  manualHstCents: z.number().int(),
  vendorId: z.number().int().positive().nullable(),
  customerId: z.number().int().positive().nullable(),
  include: z.boolean(),
});

export const saveBankImportRowProgressSchema = z.array(bankImportRowProgressItemSchema).max(5000);

export const clearBankImportRowProgressSchema = z.object({
  accountId: z.number().int().positive(),
  rows: z.array(z.object({ transactionDate: ISO_DATE, description: z.string(), amountCents: z.number().int() })).max(5000),
});

export const startBankReconciliationSchema = z.object({
  accountId: z.number().int().positive(),
  statementDate: ISO_DATE,
  endingBalanceCents: z.number().int(),
});

export const toggleReconciliationLineSchema = z.object({
  reconciliationId: z.number().int().positive(),
  lineId: z.number().int().positive(),
  cleared: z.boolean(),
});

export const completeBankReconciliationSchema = z.object({
  id: z.number().int().positive(),
});

const APPOINTMENT_URGENCIES = ['urgent', 'normal', 'mild'] as const;
const TIME_OF_DAY = z.string().regex(/^\d{2}:\d{2}$/, 'Expected HH:MM');

export const saveAppointmentSchema = z.object({
  id: z.string().optional(),
  clientId: z.string().nullable().optional().default(null),
  title: z.string().trim().min(1).max(200),
  date: ISO_DATE,
  time: TIME_OF_DAY,
  durationMinutes: z.number().int().min(5).max(480).default(30),
  urgency: z.enum(APPOINTMENT_URGENCIES).default('normal'),
  notes: z.string().max(2000).optional().default(''),
  completed: z.boolean().optional().default(false),
  snoozedUntil: z.string().nullable().optional().default(null),
});

export const snoozeAppointmentSchema = z.object({
  id: z.string(),
  snoozedUntil: z.string().nullable(),
});

/** Filing a GST/HST return for a period. The collected/ITC figures aren't accepted from the
 * renderer — the handler recomputes them from the ledger so what's filed can't drift from what the
 * books say. */
export const fileHstReturnSchema = z.object({
  periodStart: ISO_DATE,
  periodEnd: ISO_DATE,
  filingDate: ISO_DATE,
  /** Required whenever the net isn't zero; validated against the computed net in the handler. */
  paymentAccountId: z.number().int().positive().nullable().optional().default(null),
  memo: z.string().trim().max(500).nullable().optional().default(null),
});

const CREDIT_NOTE_KINDS = ['customer', 'vendor'] as const;

const creditNoteLineSchema = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().min(0),
  categoryAccountId: z.number().int().positive(),
  taxCode: z.enum(TAX_CODES).nullable().optional(),
  manualHstCents: z.number().int().min(0).nullable().optional(),
});

export const newCreditNoteSchema = z.object({
  kind: z.enum(CREDIT_NOTE_KINDS),
  contactId: z.number().int().positive(),
  creditNoteNumber: z.string().trim().min(1).max(50),
  creditNoteDate: ISO_DATE,
  memo: z.string().trim().max(500).nullable().optional().default(null),
  lines: z.array(creditNoteLineSchema).min(1),
});

/** Settles an open credit against a specific unpaid invoice (customer) or bill (vendor). */
export const applyCreditNoteSchema = z.object({
  id: z.number().int().positive(),
  targetId: z.number().int().positive(),
  /** How much of the credit to put against the document. Omitted means as much as possible — the
   * whole credit, or the whole balance, whichever is smaller. */
  amountCents: z.number().int().positive().optional(),
});

/** Pays an open customer credit back in cash, or banks a refund received from a vendor. */
export const refundCreditNoteSchema = z.object({
  id: z.number().int().positive(),
  bankAccountId: z.number().int().positive(),
  refundDate: ISO_DATE,
});

export const saveCpaNoteSchema = z.object({
  id: z.number().int().positive().nullable().optional().default(null),
  noteDate: ISO_DATE,
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  accountId: z.number().int().positive().nullable().optional().default(null),
  journalEntryId: z.number().int().positive().nullable().optional().default(null),
  cpaResponse: z.string().trim().max(5000).nullable().optional().default(null),
});

/** Bundles notes + statements into one PDF for the CPA. periodStart/End drive the income statement
 * and the notes included; asOfDate is the balance sheet date. */
export const cpaReviewPackageSchema = z.object({
  periodStart: ISO_DATE,
  periodEnd: ISO_DATE,
  includeBalanceSheet: z.boolean().optional().default(true),
  includeIncomeStatement: z.boolean().optional().default(true),
  includeTrialBalance: z.boolean().optional().default(false),
  includeOpenNotesOnly: z.boolean().optional().default(false),
  coverMessage: z.string().trim().max(2000).nullable().optional().default(null),
});

const WORKPAPER_STATUSES = ['pending', 'reviewed', 'query'] as const;

export const workpaperSheetQuerySchema = z.object({
  periodEnd: ISO_DATE,
  /** Defaults to one year before periodEnd when omitted. */
  priorPeriodEnd: ISO_DATE.nullable().optional().default(null),
});

export const setWorkpaperStatusSchema = z.object({
  periodEnd: ISO_DATE,
  accountId: z.number().int().positive(),
  status: z.enum(WORKPAPER_STATUSES),
});

export const setWorkpaperNoteSchema = z.object({
  periodEnd: ISO_DATE,
  accountId: z.number().int().positive(),
  note: z.string().trim().max(2000).nullable(),
});

export const addWorkpaperAttachmentSchema = z.object({
  periodEnd: ISO_DATE,
  accountId: z.number().int().positive(),
});

export const auditEngagementQuerySchema = z.object({ periodEnd: ISO_DATE });

export const saveAuditMaterialitySchema = z.object({
  engagementId: z.number().int().positive(),
  materialityBasis: z.string().trim().min(1).max(200),
  materialityBasisCents: z.number().int().nonnegative(),
  materialityPercent: z.number().positive().max(100),
  overallMaterialityCents: z.number().int().nonnegative(),
  performanceMaterialityCents: z.number().int().nonnegative(),
  trivialMisstatementCents: z.number().int().nonnegative(),
  materialityRationale: z.string().trim().max(5000).nullable(),
}).superRefine((value, ctx) => {
  if (value.performanceMaterialityCents > value.overallMaterialityCents) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['performanceMaterialityCents'], message: 'Performance materiality cannot exceed overall materiality.' });
  }
  if (value.trivialMisstatementCents > value.overallMaterialityCents) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['trivialMisstatementCents'], message: 'Clearly trivial amount cannot exceed overall materiality.' });
  }
});

export const saveAuditDocumentSchema = z.object({
  documentId: z.number().int().positive(),
  content: z.string().max(30000),
});

export const signAuditDocumentSchema = z.object({
  documentId: z.number().int().positive(),
  role: z.enum(['preparer', 'reviewer']),
  name: z.string().trim().min(1).max(120),
});

export const addAuditReviewNoteSchema = z.object({
  documentId: z.number().int().positive(),
  note: z.string().trim().min(1).max(5000),
  createdBy: z.string().trim().min(1).max(120),
});

export const resolveAuditReviewNoteSchema = z.object({
  noteId: z.number().int().positive(),
  resolvedBy: z.string().trim().min(1).max(120),
});

export const setAuditEngagementStatusSchema = z.object({
  engagementId: z.number().int().positive(),
  status: z.enum(['planning', 'fieldwork', 'completion']),
});

export const lockAuditEngagementSchema = z.object({
  engagementId: z.number().int().positive(),
  confirmedBy: z.string().trim().min(1).max(120),
});
