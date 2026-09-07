import type { BalanceSheetResult } from '../ledger/balanceSheet';
import type { CashFlowResult } from '../ledger/cashFlowStatement';
import type { IncomeStatementResult } from '../ledger/incomeStatement';
import type { TrialBalanceResult } from '../ledger/trialBalance';
import type { CompliancePackageResult } from './compliancePackage';
import type { Account, JournalEntry } from '../types';
import { suggestTaxCents } from '../ledger/computeTaxSplit';
import { filterEntriesByDateRange } from '../ledger/computeAccountBalances';
import type { ExpensesByVendorResult } from '../ledger/contactActivity';

export interface ComprehensiveAgingRow { party: string; documentNumber: string; documentDate: string; dueDate: string; balanceCents: number; daysOverdue: number; bucket: 'Current' | '1–30' | '31–60' | '61–90' | '90+' }
export interface ComprehensiveSalesRow { customer: string; invoicedCents: number; receiptedCents: number; documentCount: number }

export interface CustomCompanyReportRow {
  entryId: number;
  lineId: number;
  entryDate: string;
  transactionType: string;
  reference: string | null;
  user: string | null;
  status: string;
  adjusting: boolean;
  memo: string | null;
  accountCode: string;
  accountName: string;
  contactName: string | null;
  description: string | null;
  debitCents: number;
  creditCents: number;
  taxCode: string | null;
  baseCents: number | null;
  taxAmountCents: number;
  currency: string;
  exchangeRate: number | null;
  foreignAmountCents: number | null;
}

export interface ComprehensiveCompanyReportResult {
  periodStart: string;
  periodEnd: string;
  trialBalance: TrialBalanceResult;
  incomeStatement: IncomeStatementResult;
  balanceSheet: BalanceSheetResult;
  cashFlow: CashFlowResult;
  compliance: CompliancePackageResult;
  receivables: ComprehensiveAgingRow[];
  payables: ComprehensiveAgingRow[];
  salesByCustomer: ComprehensiveSalesRow[];
  expensesByVendor: ExpensesByVendorResult;
  customRows: CustomCompanyReportRow[];
}

export function buildCustomCompanyReportRows(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart: string,
  periodEnd: string,
  customerNames: Map<number, string> = new Map(),
  vendorNames: Map<number, string> = new Map(),
  transactionTypes: Map<number, string> = new Map(),
): CustomCompanyReportRow[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  return filterEntriesByDateRange(entries, periodStart, periodEnd)
    .sort((left, right) => left.entryDate.localeCompare(right.entryDate) || left.id - right.id)
    .flatMap((entry) => entry.lines.map((line) => {
      const account = accountById.get(line.accountId);
      const taxAmountCents = !line.taxCode ? 0
        : line.taxCode === 'Manual' ? Math.max(0, line.manualHstCents ?? 0)
          : line.baseCents === null ? 0 : suggestTaxCents(line.taxCode, Math.abs(line.baseCents));
      return {
        entryId: entry.id,
        lineId: line.id,
        entryDate: entry.entryDate,
        transactionType: transactionTypes.get(entry.id) ?? (entry.source === 'quickEntry' ? 'Quick Entry' : entry.source === 'bankImport' ? 'Bank Import' : entry.source === 'clientImport' ? 'Client Import' : 'Journal Entry'),
        reference: entry.reference,
        user: entry.createdBy ?? null,
        status: entry.status,
        adjusting: entry.isAdjustingEntry,
        memo: entry.memo,
        accountCode: account?.code ?? '',
        accountName: account?.name ?? 'Unknown account',
        contactName: line.customerId !== null ? customerNames.get(line.customerId) ?? null : line.vendorId !== null ? vendorNames.get(line.vendorId) ?? null : null,
        description: line.description,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        taxCode: line.taxCode,
        baseCents: line.baseCents,
        taxAmountCents,
        currency: line.foreignCurrency ?? 'CAD',
        exchangeRate: line.exchangeRate,
        foreignAmountCents: line.foreignAmountCents,
      };
    }));
}
