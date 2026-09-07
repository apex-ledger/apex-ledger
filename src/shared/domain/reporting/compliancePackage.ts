import type { Account, JournalEntry } from '../types';

export interface ComplianceReportQuery { periodStart: string; periodEnd: string }
export interface AuditTrailReportRow { revisionId: number; journalEntryId: number | null; entryDate: string; changedAt: string; action: string; field: string; lineLabel: string | null; oldValue: string | null; newValue: string | null; memo: string | null; createdBy: string | null }
export interface SourceDocumentReportRow { date: string; kind: string; documentNumber: string; party: string; amountCents: number; journalEntryId: number | null; evidence: 'Attached' | 'Generated in Apex Ledger' | 'Reference only' | 'Missing'; evidenceName: string | null }
export interface BankDepositReportRow { journalEntryId: number; date: string; bankAccount: string; amountCents: number; memo: string | null; reference: string | null; classification: string; requiresReview: boolean; reviewReason: string | null }
export interface PayrollRegisterReportRow { payrollRunId: number; employee: string; periodStart: string; periodEnd: string; payDate: string; regularHours: number | null; overtimeHours: number | null; grossPayCents: number; vacationPayCents: number; cppEmployeeCents: number; cppEmployerCents: number; eiEmployeeCents: number; eiEmployerCents: number; incomeTaxCents: number; netPayCents: number; status: string; journalEntryId: number | null }
export interface HstWorkingPaperReport { boxes: Array<{ box: string; label: string; amountCents: number }>; manualItemsPending: number; filedReturn: { filingDate: string; netPayableCents: number; journalEntryId: number | null } | null; categories: Array<{ account: string; direction: 'collected' | 'itc'; baseAmountCents: number; hstCents: number }> }
export interface FixedAssetContinuityRow { classCode: string; fiscalYearEnd: string; openingUccCents: number; additionsCents: number; dispositionsCents: number; ccaClaimCents: number; closingUccCents: number; note: string | null }
export interface ShareholderContinuityRow { shareholder: string; loanAccount: string | null; loanBalanceCents: number | null; eligibleDividendsCents: number; nonEligibleDividendsCents: number; interestCents: number; identityComplete: boolean }
export interface InventoryContinuityRow { product: string; sku: string | null; openingQuantity: number; quantityIn: number; quantityOut: number; closingQuantity: number; closingValueCents: number; wentNegative: boolean; unlinkedMovementCount: number }
export interface DebtContinuityRow { loan: string; lender: string | null; originalPrincipalCents: number; linkedAccount: string | null; ledgerBalanceCents: number | null; annualRate: number; startDate: string | null; isActive: boolean }
export interface T2ReconciliationReport { lines: Array<{ label: string; amountCents: number; treatment: 'starting' | 'add' | 'deduct' | 'result' }>; preliminaryTaxableIncomeCents: number; unmappedGifiAccountCount: number; warning: string }

export interface CompliancePackageResult {
  periodStart: string; periodEnd: string;
  auditTrail: AuditTrailReportRow[];
  sourceDocuments: SourceDocumentReportRow[];
  bankDeposits: BankDepositReportRow[];
  payrollRegister: PayrollRegisterReportRow[];
  hstWorkingPaper: HstWorkingPaperReport;
  fixedAssets: FixedAssetContinuityRow[];
  /** Book side of the continuity, from the fixed asset register. Optional for older packages. */
  fixedAssetRegister?: FixedAssetRegisterRow[];
  shareholders: ShareholderContinuityRow[];
  inventory: InventoryContinuityRow[];
  debt: DebtContinuityRow[];
  t2Reconciliation: T2ReconciliationReport;
}

/** Classifies one debit into a bank/cash account from the other accounts on the entry. This is a
 * review aid, not a tax conclusion: ambiguous deposits stay visibly flagged for the accountant. */
export function classifyBankDeposit(entry: JournalEntry, bankLineId: number, accountById: Map<number, Account>): Pick<BankDepositReportRow, 'classification' | 'requiresReview' | 'reviewReason'> {
  const counterparts = entry.lines.filter((line) => line.id !== bankLineId && (line.debitCents !== 0 || line.creditCents !== 0)).map((line) => accountById.get(line.accountId)).filter((account): account is Account => Boolean(account));
  const types = new Set(counterparts.map((account) => account.accountType));
  if (types.has('Revenue')) return { classification: 'Sales / income', requiresReview: false, reviewReason: null };
  if (types.has('Liability')) return { classification: 'Borrowing / liability', requiresReview: false, reviewReason: null };
  if (types.has('Equity')) return { classification: 'Owner contribution / equity', requiresReview: false, reviewReason: null };
  if (types.has('Asset')) return { classification: 'Transfer / asset recovery', requiresReview: false, reviewReason: null };
  return { classification: 'Unclassified deposit', requiresReview: true, reviewReason: 'No revenue, liability, equity, or transfer account explains this deposit.' };
}

export function closingUccCents(opening: number, additions: number, dispositions: number, claim: number): number { return opening + additions - dispositions - claim }

export interface FixedAssetRegisterRow {
  name: string;
  ccaClass: string | null;
  acquiredDate: string;
  openingCostCents: number;
  additionsCents: number;
  disposalsCents: number;
  openingAccumulatedCents: number;
  depreciationCents: number;
  closingCostCents: number;
  closingAccumulatedCents: number;
  closingBookValueCents: number;
  proceedsCents: number;
}
