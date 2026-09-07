import { asPaymentTerm, termFromDates } from '@shared/domain/contacts/paymentTerms';
import type { Selectable } from 'kysely';
import { FOREIGN_CURRENCY_CODES, type CpaNote, type CpaNoteStatus, type BankImportExclusion, type BankImportRowProgress, type BankReconciliation, type Bill, type BillLine, type Contact, type Account, type CategoryRule, type CreditNote, type CreditNoteKind, type CreditNoteLine, type CreditNoteStatus, type CompanyInfo, type Deposit, type Employee, type FiscalPeriod, type ForeignCurrencyCode, type GifiCode, type HstFiling, type Invoice, type InvoiceLine, type JournalEntry, type JournalEntryLine, type PayrollRun, type SalesReceipt, type SalesReceiptLine, type Shareholder, type T5Payment, type T5PaymentType, type TaxCode } from '@shared/domain/types';
import { TAX_CODE_DEFINITIONS } from '@shared/domain/ledger/taxCodes';
import type {
  AccountTable,
  BankImportExclusionTable,
  BankImportRowProgressTable,
  BankReconciliationTable,
  BillLineTable,
  BillTable,
  CategoryRuleTable,
  CompanyInfoTable,
  ContactTable,
  CpaNoteTable,
  CreditNoteLineTable,
  CreditNoteTable,
  DepositTable,
  EmployeeTable,
  FiscalPeriodTable,
  GifiCodeTable,
  HstFilingTable,
  InvoiceLineTable,
  InvoiceTable,
  JournalEntryLineTable,
  JournalEntryTable,
  PayrollRunTable,
  SalesReceiptLineTable,
  SalesReceiptTable,
  ShareholderTable,
  T5PaymentTable,
} from './schema';

// Every code the app knows, including each province's — a code missing here would read back as
// null and silently drop the tax treatment from the ledger line.
const TAX_CODE_VALUES: readonly TaxCode[] = TAX_CODE_DEFINITIONS.map((d) => d.code);

function asTaxCode(value: string | null): TaxCode | null {
  return (TAX_CODE_VALUES as readonly string[]).includes(value ?? '') ? (value as TaxCode) : null;
}

function asForeignCurrency(value: string | null): ForeignCurrencyCode | null {
  return (FOREIGN_CURRENCY_CODES as readonly string[]).includes(value ?? '') ? (value as ForeignCurrencyCode) : null;
}

export function mapAccountRow(row: Selectable<AccountTable>): Account {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    accountType: row.accountType,
    accountSubtype: row.accountSubtype,
    normalBalance: row.normalBalance,
    parentId: row.parentId,
    gifiCode: row.gifiCode,
    isActive: Boolean(row.isActive),
    isSystem: Boolean(row.isSystem),
    description: row.description,
    accountNumber: row.accountNumber,
    isTransferEligible: Boolean(row.isTransferEligible),
    isMaster: Boolean(row.isMaster),
    currency: (row.currency ?? 'CAD') as Account['currency'],
  };
}

export function mapGifiCodeRow(row: Selectable<GifiCodeTable>): GifiCode {
  return {
    code: row.code,
    description: row.description,
    statementType: row.statementType,
    category: row.category,
    isCustom: Boolean(row.isCustom),
  };
}

export function mapJournalEntryLineRow(row: Selectable<JournalEntryLineTable>): JournalEntryLine {
  return {
    id: row.id,
    journalEntryId: row.journalEntryId,
    accountId: row.accountId,
    debitCents: row.debitCents,
    creditCents: row.creditCents,
    description: row.description,
    lineOrder: row.lineOrder,
    taxCode: asTaxCode(row.taxCode),
    manualHstCents: row.manualHstCents,
    baseCents: row.baseCents,
    clearedAt: row.clearedAt,
    reconciliationId: row.reconciliationId,
    foreignCurrency: asForeignCurrency(row.foreignCurrency),
    foreignAmountCents: row.foreignAmountCents,
    exchangeRate: row.exchangeRate,
    vendorId: row.vendorId,
    customerId: row.customerId,
  };
}

export function mapCategoryRuleRow(row: Selectable<CategoryRuleTable>): CategoryRule {
  return {
    id: row.id,
    pattern: row.pattern,
    accountId: row.accountId,
    taxCode: asTaxCode(row.taxCode),
    priority: row.priority,
    isActive: Boolean(row.isActive),
  };
}

export function mapJournalEntryRow(row: Selectable<JournalEntryTable>, lines: JournalEntryLine[]): JournalEntry {
  return {
    id: row.id,
    entryDate: row.entryDate,
    memo: row.memo,
    reference: row.reference,
    status: row.status,
    createdAt: row.createdAt,
    postedAt: row.postedAt,
    createdBy: row.createdBy,
    lines,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    isAdjustingEntry: Boolean(row.isAdjustingEntry),
    source: (row.source ?? 'manual') as JournalEntry['source'],
    sourceReference: row.sourceReference ?? null,
    approvalStatus: ((row as { approvalStatus?: string }).approvalStatus ?? 'notRequired') as JournalEntry['approvalStatus'],
    approvedBy: (row as { approvedBy?: string | null }).approvedBy ?? null,
    approvedAt: (row as { approvedAt?: string | null }).approvedAt ?? null,
    approvalNote: (row as { approvalNote?: string | null }).approvalNote ?? null,
  };
}

export function mapFiscalPeriodRow(row: Selectable<FiscalPeriodTable>): FiscalPeriod {
  return {
    id: row.id,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    label: row.label,
    isLocked: Boolean(row.isLocked),
    lockedAt: row.lockedAt,
  };
}

export function mapEmployeeRow(row: Selectable<EmployeeTable>): Employee {
  return {
    id: row.id,
    name: row.name,
    province: row.province,
    payType: row.payType,
    hourlyRateCents: row.hourlyRateCents,
    annualSalaryCents: row.annualSalaryCents,
    payPeriodsPerYear: row.payPeriodsPerYear,
    vacationPayRate: row.vacationPayRate,
    sinLastFour: row.sinLastFour,
    sin: row.sin,
    isActive: Boolean(row.isActive),
    federalTotalClaimCents: row.federalTotalClaimCents,
    provincialTotalClaimCents: row.provincialTotalClaimCents,
    additionalTaxCents: row.additionalTaxCents,
    rrspEmployerMatchCents: row.rrspEmployerMatchCents,
    healthBenefitCents: row.healthBenefitCents,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    addressCity: row.addressCity,
    addressProvince: row.addressProvince,
    addressPostalCode: row.addressPostalCode,
    bankInstitution: row.bankInstitution ?? null,
    bankTransit: row.bankTransit ?? null,
    bankAccount: row.bankAccount ?? null,
    vacationPayAccrued: Boolean(row.vacationPayAccrued),
  };
}

export function mapPayrollRunRow(row: Selectable<PayrollRunTable>): PayrollRun {
  return {
    id: row.id,
    createdAt: row.createdAt,
    employeeId: row.employeeId,
    payPeriodStart: row.payPeriodStart,
    payPeriodEnd: row.payPeriodEnd,
    payDate: row.payDate,
    regularHours: row.regularHours,
    overtimeHours: row.overtimeHours,
    regularPayCents: row.regularPayCents,
    overtimePayCents: row.overtimePayCents,
    grossPayCents: row.grossPayCents,
    vacationPayCents: row.vacationPayCents,
    cpp1EmployeeCents: row.cpp1EmployeeCents,
    cpp1EmployerCents: row.cpp1EmployerCents,
    cpp2EmployeeCents: row.cpp2EmployeeCents,
    cpp2EmployerCents: row.cpp2EmployerCents,
    eiEmployeeCents: row.eiEmployeeCents,
    eiEmployerCents: row.eiEmployerCents,
    wsibEmployerCents: row.wsibEmployerCents,
    rrspEmployerMatchCents: row.rrspEmployerMatchCents,
    healthBenefitCents: row.healthBenefitCents,
    incomeTaxCents: row.incomeTaxCents,
    netPayCents: row.netPayCents,
    status: row.status,
    journalEntryId: row.journalEntryId,
    isVacationPayout: Boolean(row.isVacationPayout),
  };
}

export function mapShareholderRow(row: Selectable<ShareholderTable>): Shareholder {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    sin: row.sin,
    businessNumber: row.businessNumber,
    loanAccountId: row.loanAccountId,
    isActive: Boolean(row.isActive),
  };
}

function asT5PaymentType(value: string): T5PaymentType {
  return value === 'eligible_dividend' || value === 'non_eligible_dividend' ? value : 'interest';
}

export function mapT5PaymentRow(row: Selectable<T5PaymentTable>): T5Payment {
  return {
    id: row.id,
    shareholderId: row.shareholderId,
    paymentDate: row.paymentDate,
    paymentType: asT5PaymentType(row.paymentType),
    amountCents: row.amountCents,
    bankAccountId: row.bankAccountId,
    memo: row.memo,
    journalEntryId: row.journalEntryId,
  };
}

export function mapContactRow(row: Selectable<ContactTable>): Contact {
  return {
    id: row.id,
    name: row.name,
    companyName: row.companyName ?? null,
    contactName: row.contactName ?? null,
    website: row.website ?? null,
    shippingAddress: row.shippingAddress ?? null,
    email: row.email,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    isActive: Boolean(row.isActive),
    isT4aContractor: Boolean(row.isT4aContractor),
    t4aSin: row.t4aSin,
    t4aBusinessNumber: row.t4aBusinessNumber,
    isT5018Contractor: Boolean(row.isT5018Contractor),
    defaultExpenseAccountId: row.defaultExpenseAccountId,
    // Left null when unset rather than defaulted here: null means "nothing chosen for this
    // contact", which is a different fact from "explicitly set to Net 30".
    paymentTerms: row.paymentTerms ? asPaymentTerm(row.paymentTerms) : null,
    lateInterestRatePercent: (row as { lateInterestRatePercent?: number | null }).lateInterestRatePercent ?? null,
  };
}

export function mapBillLineRow(row: Selectable<BillLineTable>): BillLine {
  return {
    id: row.id,
    billId: row.billId,
    lineOrder: row.lineOrder,
    categoryAccountId: row.categoryAccountId,
    description: row.description,
    baseCents: row.baseCents,
    taxCode: asTaxCode(row.taxCode),
    taxCents: row.taxCents,
    productId: row.productId,
    quantity: row.quantity,
  };
}

export function mapBillRow(row: Selectable<BillTable>, lines: BillLine[] = []): Bill {
  return {
    lines,
      id: row.id,
      createdAt: row.createdAt,
      vendorId: row.vendorId,
      billNumber: row.billNumber,
    purchaseOrderNumber: row.purchaseOrderNumber ?? null,
    billDate: row.billDate,
    dueDate: row.dueDate,
    categoryAccountId: row.categoryAccountId,
    amountCents: row.amountCents,
    taxCode: asTaxCode(row.taxCode),
    manualHstCents: row.manualHstCents,
    memo: row.memo,
    status: row.status,
    billJournalEntryId: row.billJournalEntryId,
    paymentJournalEntryId: row.paymentJournalEntryId,
    paidCents: row.paidCents ?? (row.status === 'paid' ? row.amountCents : 0),
    balanceDueCents: Math.max(0, row.amountCents - (row.paidCents ?? (row.status === 'paid' ? row.amountCents : 0))),
    foreignCurrency: asForeignCurrency(row.foreignCurrency),
    foreignAmountCents: row.foreignAmountCents,
    exchangeRate: row.exchangeRate,
    receiptFilePath: row.receiptFilePath,
    // Files created before approval existed have no value here; treat those bills as approved
    // rather than retroactively marking a year of paid bills as awaiting someone's decision.
    approvalStatus: (row.approvalStatus as Bill['approvalStatus']) ?? 'approved',
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt ?? null,
    approvalNote: row.approvalNote ?? null,
    paymentTerms: row.paymentTerms ? asPaymentTerm(row.paymentTerms) : termFromDates(row.billDate, row.dueDate),
    productId: row.productId ?? null,
    quantity: row.quantity ?? null,
  };
}

export function mapInvoiceLineRow(row: Selectable<InvoiceLineTable>): InvoiceLine {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    lineOrder: row.lineOrder,
    description: row.description,
    quantity: row.quantity,
    unitPriceCents: row.unitPriceCents,
    amountCents: row.amountCents,
    revenueAccountId: row.revenueAccountId,
    productId: row.productId ?? null,
    taxCode: asTaxCode(row.taxCode),
    manualHstCents: row.manualHstCents,
  };
}

export function mapInvoiceRow(row: Selectable<InvoiceTable>, lines: InvoiceLine[]): Invoice {
  return {
    id: row.id,
    createdAt: row.createdAt,
    customerId: row.customerId,
    invoiceNumber: row.invoiceNumber,
    customerPoNumber: row.customerPoNumber ?? null,
    shippingAddress: row.shippingAddress ?? null,
    invoiceDate: row.invoiceDate,
    dueDate: row.dueDate,
    memo: row.memo,
    totalCents: row.totalCents,
    discountCents: row.discountCents ?? 0,
    status: row.status,
    invoiceJournalEntryId: row.invoiceJournalEntryId,
    paymentJournalEntryId: row.paymentJournalEntryId,
    paidCents: row.paidCents ?? (row.status === 'paid' ? row.totalCents : 0),
    balanceDueCents: Math.max(0, row.totalCents - (row.paidCents ?? (row.status === 'paid' ? row.totalCents : 0))),
    lines,
    foreignCurrency: asForeignCurrency(row.foreignCurrency),
    foreignAmountCents: row.foreignAmountCents,
    exchangeRate: row.exchangeRate,
    depositId: row.depositId,
    // Documents entered before terms existed carry only dates. termFromDates reads the real term
    // back out of them, so they do not all show as "Custom date".
    paymentTerms: row.paymentTerms ? asPaymentTerm(row.paymentTerms) : termFromDates(row.invoiceDate, row.dueDate),
    paymentAccountId: row.paymentAccountId ?? null,
    lateInterestChargedThrough: (row as { lateInterestChargedThrough?: string | null }).lateInterestChargedThrough ?? null,
  };
}

export function mapSalesReceiptLineRow(row: Selectable<SalesReceiptLineTable>): SalesReceiptLine {
  return {
    id: row.id,
    salesReceiptId: row.salesReceiptId,
    lineOrder: row.lineOrder,
    description: row.description,
    quantity: row.quantity,
    unitPriceCents: row.unitPriceCents,
    amountCents: row.amountCents,
    revenueAccountId: row.revenueAccountId,
    productId: row.productId ?? null,
    taxCode: asTaxCode(row.taxCode),
    manualHstCents: row.manualHstCents,
  };
}

export function mapSalesReceiptRow(row: Selectable<SalesReceiptTable>, lines: SalesReceiptLine[]): SalesReceipt {
  return {
    id: row.id,
    createdAt: row.createdAt,
    customerId: row.customerId,
    receiptNumber: row.receiptNumber,
    receiptDate: row.receiptDate,
    memo: row.memo,
    totalCents: row.totalCents,
    depositToAccountId: row.depositToAccountId,
    journalEntryId: row.journalEntryId,
    depositId: row.depositId,
    lines,
    foreignCurrency: asForeignCurrency(row.foreignCurrency),
    foreignAmountCents: row.foreignAmountCents,
    exchangeRate: row.exchangeRate,
  };
}

export function mapBankImportExclusionRow(row: Selectable<BankImportExclusionTable>): BankImportExclusion {
  return {
    id: row.id,
    accountId: row.accountId,
    transactionDate: row.transactionDate,
    description: row.description,
    amountCents: row.amountCents,
  };
}

export function mapBankImportRowProgressRow(row: Selectable<BankImportRowProgressTable>): BankImportRowProgress {
  return {
    id: row.id,
    accountId: row.accountId,
    transactionDate: row.transactionDate,
    description: row.description,
    amountCents: row.amountCents,
    categoryAccountId: row.categoryAccountId,
    taxCode: asTaxCode(row.taxCode),
    manualHstCents: row.manualHstCents,
    vendorId: row.vendorId,
    customerId: row.customerId,
    include: row.include === 1,
  };
}

export function mapDepositRow(row: Selectable<DepositTable>): Deposit {
  return {
    id: row.id,
    createdAt: row.createdAt,
    depositDate: row.depositDate,
    bankAccountId: row.bankAccountId,
    journalEntryId: row.journalEntryId,
  };
}

export function mapBankReconciliationRow(row: Selectable<BankReconciliationTable>): BankReconciliation {
  return {
    id: row.id,
    accountId: row.accountId,
    statementDate: row.statementDate,
    startingBalanceCents: row.startingBalanceCents,
    endingBalanceCents: row.endingBalanceCents,
    status: row.status,
    completedAt: row.completedAt,
  };
}

export function mapCompanyInfoRow(row: Selectable<CompanyInfoTable>): CompanyInfo {
  return {
    legalName: row.legalName,
    displayName: row.displayName,
    fiscalYearEndMonth: row.fiscalYearEndMonth,
    fiscalYearEndDay: row.fiscalYearEndDay,
    baseCurrency: row.baseCurrency,
    businessNumber: row.businessNumber,
    businessType: row.businessType,
    hstQuickMethodEnabled: row.hstQuickMethodEnabled === 1,
    hstQuickMethodRate: row.hstQuickMethodRate,
    hstNumber: row.hstNumber,
    payrollNumber: row.payrollNumber,
    approvalJournalThresholdCents: (row as { approvalJournalThresholdCents?: number | null }).approvalJournalThresholdCents ?? null,
    approvalPoThresholdCents: (row as { approvalPoThresholdCents?: number | null }).approvalPoThresholdCents ?? null,
    hstFilingFrequency: ((row as { hstFilingFrequency?: string }).hstFilingFrequency ?? 'None') as CompanyInfo['hstFilingFrequency'],
    payrollRemitterType: ((row as { payrollRemitterType?: string }).payrollRemitterType ?? 'regular') as CompanyInfo['payrollRemitterType'],
    ehtExemptionEligible: ((row as { ehtExemptionEligible?: number }).ehtExemptionEligible ?? 1) === 1,
    ehtExemptionCents: (row as { ehtExemptionCents?: number }).ehtExemptionCents ?? 100000000,
    logoDataUrl: (row as { logoDataUrl?: string | null }).logoDataUrl ?? null,
    eftOriginatorId: row.eftOriginatorId ?? null,
    eftOriginatorShortName: row.eftOriginatorShortName ?? null,
    eftDataCentre: row.eftDataCentre ?? null,
    eftSettlementInstitution: row.eftSettlementInstitution ?? null,
    eftSettlementTransit: row.eftSettlementTransit ?? null,
    eftSettlementAccount: row.eftSettlementAccount ?? null,
    eftFileCreationNumber: row.eftFileCreationNumber ?? 0,
    numberOfEmployees: row.numberOfEmployees,
    businessAddressLine1: row.businessAddressLine1,
    businessAddressLine2: row.businessAddressLine2,
    businessCity: row.businessCity,
    businessProvince: row.businessProvince,
    businessPostalCode: row.businessPostalCode,
    mailingSameAsBusinessAddress: row.mailingSameAsBusinessAddress === 1,
    mailingAddressLine1: row.mailingAddressLine1,
    mailingAddressLine2: row.mailingAddressLine2,
    mailingCity: row.mailingCity,
    mailingProvince: row.mailingProvince,
    mailingPostalCode: row.mailingPostalCode,
    wsibClassCode: row.wsibClassCode,
    wsibRate: row.wsibRate,
    schemaVersion: 7,
  };
}

export function mapHstFilingRow(row: Selectable<HstFilingTable>): HstFiling {
  return {
    id: row.id,
    createdAt: row.createdAt,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    filingDate: row.filingDate,
    collectedCents: row.collectedCents,
    itcCents: row.itcCents,
    netPayableCents: row.netPayableCents,
    paymentAccountId: row.paymentAccountId,
      journalEntryId: row.journalEntryId,
      fiscalPeriodId: row.fiscalPeriodId,
    memo: row.memo,
  };
}

export function mapCreditNoteLineRow(row: Selectable<CreditNoteLineTable>): CreditNoteLine {
  return {
    id: row.id,
    creditNoteId: row.creditNoteId,
    lineOrder: row.lineOrder,
    description: row.description,
    quantity: row.quantity,
    unitPriceCents: row.unitPriceCents,
    amountCents: row.amountCents,
    categoryAccountId: row.categoryAccountId,
    taxCode: asTaxCode(row.taxCode),
    manualHstCents: row.manualHstCents,
  };
}

export function mapCreditNoteRow(row: Selectable<CreditNoteTable>, lines: CreditNoteLine[]): CreditNote {
  return {
    id: row.id,
    createdAt: row.createdAt,
    kind: row.kind as CreditNoteKind,
    contactId: row.contactId,
    creditNoteNumber: row.creditNoteNumber,
    creditNoteDate: row.creditNoteDate,
    memo: row.memo,
    totalCents: row.totalCents,
    status: row.status as CreditNoteStatus,
    appliedToId: row.appliedToId,
    appliedCents: row.appliedCents,
    remainingCents: Math.max(0, row.totalCents - row.appliedCents),
    creditJournalEntryId: row.creditJournalEntryId,
    refundJournalEntryId: row.refundJournalEntryId,
    lines,
  };
}

const CPA_NOTE_STATUSES: readonly CpaNoteStatus[] = ['open', 'resolved'];

export function mapCpaNoteRow(row: Selectable<CpaNoteTable>): CpaNote {
  return {
    id: row.id,
    noteDate: row.noteDate,
    subject: row.subject,
    body: row.body,
    status: (CPA_NOTE_STATUSES as readonly string[]).includes(row.status) ? (row.status as CpaNoteStatus) : 'open',
    accountId: row.accountId,
    journalEntryId: row.journalEntryId,
    cpaResponse: row.cpaResponse,
    resolvedAt: row.resolvedAt,
  };
}
