import type { Account, JournalEntry } from '../types';
import { computeAccountBalances, filterEntriesByDateRange } from './computeAccountBalances';
import { buildSection, type Section } from './sectionHelpers';

export interface BalanceSheetResult {
  asOfDate: string;
  comparativeDate?: string;
  assets: Section;
  liabilities: Section;
  equity: Section;
  totalLiabilitiesAndEquityCents: number;
  comparativeTotalLiabilitiesAndEquityCents?: number;
  isBalanced: boolean;
}

/** Cumulative revenue less expenses, from inception through `asOfDate` (no closing entries yet). */
function netIncomeToDate(accounts: Account[], entriesAsOfDate: JournalEntry[]): number {
  const revenueAndExpense = accounts.filter((a) => a.accountType === 'Revenue' || a.accountType === 'Expense');
  const balances = computeAccountBalances(revenueAndExpense, entriesAsOfDate);
  let net = 0;
  for (const account of revenueAndExpense) {
    const bal = balances.get(account.id)!.balanceCents;
    net += account.accountType === 'Revenue' ? bal : -bal;
  }
  return net;
}

const NET_INCOME_LINE_ACCOUNT: Account = {
  id: -1,
  code: '',
  name: 'Net Income to Date',
  accountType: 'Equity',
  accountSubtype: 'Retained Earnings',
  normalBalance: 'Credit',
  parentId: null,
  gifiCode: null,
  isActive: true,
  isSystem: true,
  description: 'Cumulative revenue less expenses not yet closed to a permanent equity account.',
  accountNumber: null,
  isTransferEligible: false,
};

/**
 * Assets = Liabilities + Equity holds by construction here: every posted journal entry balances,
 * so summing every account (including revenue/expense) always nets to zero. Folding cumulative
 * net income into equity as a synthetic line is what closes that identity on the reported sheet.
 */
export function balanceSheet(
  accounts: Account[],
  entries: JournalEntry[],
  asOfDate: string,
  comparativeDate?: string,
): BalanceSheetResult {
  const assetAccounts = accounts.filter((a) => a.accountType === 'Asset');
  const liabilityAccounts = accounts.filter((a) => a.accountType === 'Liability');
  const equityAccounts = accounts.filter((a) => a.accountType === 'Equity');

  const asOfEntries = filterEntriesByDateRange(entries, undefined, asOfDate);
  const balances = computeAccountBalances(accounts, asOfEntries);
  const netIncomeCents = netIncomeToDate(accounts, asOfEntries);

  // Isolates the contribution of entries flagged "Is Adjusting Journal Entry?" — a second balance
  // computed from just that subset, so buildSection can show each line's pre-adjustment balance,
  // the adjustment, and the final balance together (a year-end workpapers view), without changing
  // what the un-split amountCents means for every other caller of this report.
  const adjustingEntries = asOfEntries.filter((e) => e.isAdjustingEntry);
  const adjustingBalances = computeAccountBalances(accounts, adjustingEntries);
  const adjustingNetIncomeCents = netIncomeToDate(accounts, adjustingEntries);

  let comparativeBalances;
  let comparativeNetIncomeCents: number | undefined;
  if (comparativeDate) {
    const comparativeEntries = filterEntriesByDateRange(entries, undefined, comparativeDate);
    comparativeBalances = computeAccountBalances(accounts, comparativeEntries);
    comparativeNetIncomeCents = netIncomeToDate(accounts, comparativeEntries);
  }

  const assets = buildSection('Assets', assetAccounts, balances, comparativeBalances, adjustingBalances);
  const liabilities = buildSection('Liabilities', liabilityAccounts, balances, comparativeBalances, adjustingBalances);
  const equity = buildSection('Equity', equityAccounts, balances, comparativeBalances, adjustingBalances);

  equity.lines.push({
    account: NET_INCOME_LINE_ACCOUNT,
    amountCents: netIncomeCents,
    comparativeAmountCents: comparativeNetIncomeCents,
    adjustingAmountCents: adjustingNetIncomeCents,
  });
  equity.totalCents += netIncomeCents;
  if (equity.comparativeTotalCents !== undefined) {
    equity.comparativeTotalCents += comparativeNetIncomeCents ?? 0;
  }
  if (equity.adjustingTotalCents !== undefined) {
    equity.adjustingTotalCents += adjustingNetIncomeCents;
  }

  const totalLiabilitiesAndEquityCents = liabilities.totalCents + equity.totalCents;
  const comparativeTotalLiabilitiesAndEquityCents =
    liabilities.comparativeTotalCents !== undefined && equity.comparativeTotalCents !== undefined
      ? liabilities.comparativeTotalCents + equity.comparativeTotalCents
      : undefined;

  return {
    asOfDate,
    comparativeDate,
    assets,
    liabilities,
    equity,
    totalLiabilitiesAndEquityCents,
    comparativeTotalLiabilitiesAndEquityCents,
    isBalanced: assets.totalCents === totalLiabilitiesAndEquityCents,
  };
}
