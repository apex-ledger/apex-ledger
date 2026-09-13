import type { Account, JournalEntry } from '../types';
import { computeAccountBalances, filterEntriesByDateRange } from './computeAccountBalances';
import { buildSection, type Section } from './sectionHelpers';
import { currentFiscalYearDates } from '../company/fiscalYearDates';

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

/** With the fiscal year known, the profit is shown the way QuickBooks and Xero show it without a
 * closing entry ever being posted: prior years' profit carried forward as retained earnings, and
 * the current fiscal year's profit on its own line. Both are derived, not accounts. */
const RETAINED_EARNINGS_LINE_ACCOUNT: Account = { ...NET_INCOME_LINE_ACCOUNT, id: -1, name: 'Retained Earnings (prior years)', description: 'Profit of every completed fiscal year, carried forward.' };
const CURRENT_YEAR_EARNINGS_LINE_ACCOUNT: Account = { ...NET_INCOME_LINE_ACCOUNT, id: -2, name: 'Current Year Earnings', description: 'Profit from the start of the current fiscal year to the statement date.' };

export interface FiscalYearEnd { month: number; day: number }

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
  fiscalYearEnd?: FiscalYearEnd,
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

  if (fiscalYearEnd) {
    // Split each figure at the start of the fiscal year that contains its own date.
    const split = (date: string, all: JournalEntry[]) => {
      const fy = currentFiscalYearDates(fiscalYearEnd.month, fiscalYearEnd.day, date);
      const upTo = filterEntriesByDateRange(all, undefined, date);
      const prior = netIncomeToDate(accounts, upTo.filter((e) => e.entryDate < fy.startDate));
      return { prior, current: netIncomeToDate(accounts, upTo) - prior };
    };
    const now = split(asOfDate, entries);
    const adj = split(asOfDate, entries.filter((e) => e.isAdjustingEntry));
    const cmp = comparativeDate ? split(comparativeDate, entries) : undefined;
    if (now.prior !== 0 || (cmp && cmp.prior !== 0)) {
      equity.lines.push({ account: RETAINED_EARNINGS_LINE_ACCOUNT, amountCents: now.prior, comparativeAmountCents: cmp?.prior, adjustingAmountCents: adj.prior });
    }
    equity.lines.push({ account: CURRENT_YEAR_EARNINGS_LINE_ACCOUNT, amountCents: now.current, comparativeAmountCents: cmp?.current, adjustingAmountCents: adj.current });
  } else {
    equity.lines.push({
      account: NET_INCOME_LINE_ACCOUNT,
      amountCents: netIncomeCents,
      comparativeAmountCents: comparativeNetIncomeCents,
      adjustingAmountCents: adjustingNetIncomeCents,
    });
  }
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
