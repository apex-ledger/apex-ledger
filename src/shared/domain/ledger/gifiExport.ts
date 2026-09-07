import type { Account, GifiCode, JournalEntry } from '../types';
import { computeAccountBalances, filterEntriesByDateRange } from './computeAccountBalances';

export interface GifiExportRow {
  gifiCode: string;
  description: string;
  statementType: string;
  amountCents: number;
  accounts: { account: Account; amountCents: number }[];
  /** System-computed CRA validity/total line rather than a directly mapped ledger account. */
  isComputedTotal?: boolean;
}

export interface GifiValidityCheck {
  key: 'balanceSheet' | 'incomeStatement';
  label: string;
  leftCents: number;
  rightCents: number;
  differenceCents: number;
  balanced: boolean;
}

export interface GifiExportResult {
  periodStart: string;
  asOfDate: string;
  rows: GifiExportRow[];
  /** Accounts with a non-zero relevant balance but no GIFI code assigned — must be resolved before filing. */
  unmappedAccounts: Account[];
  /** Accounts mapped to a GIFI code on the wrong statement type. */
  statementTypeMismatches: { account: Account; gifiCode: string; expected: string; actual: string }[];
  /** CRA validity equations. A filing-ready export should have zero differences. */
  validityChecks: GifiValidityCheck[];
  filingReady: boolean;
}

const REQUIRED_TOTAL_CODES = new Set(['2599', '3499', '3620', '8299', '9368', '9999']);

function statementForAccount(account: Account): 'BalanceSheet' | 'IncomeStatement' {
  return account.accountType === 'Revenue' || account.accountType === 'Expense' ? 'IncomeStatement' : 'BalanceSheet';
}

/**
 * Produces one CRA-oriented GIFI data set for a fiscal period.
 *
 * Balance-sheet accounts are cumulative through the closing date, while income-statement accounts
 * include ONLY activity inside the fiscal period. The old implementation used cumulative history
 * for revenue and expenses as well, which overstated Schedule 125 as soon as a company had more
 * than one fiscal year in the file.
 *
 * Required CRA validity totals are system-computed and appended. They are deliberately not treated
 * as chart-of-accounts mapping targets: mapping an ordinary ledger account to a total such as 2599
 * would double-count that account in the filing output.
 */
export function gifiExport(
  accounts: Account[],
  entries: JournalEntry[],
  gifiCodes: GifiCode[],
  periodStart: string,
  asOfDate: string,
): GifiExportResult {
  if (asOfDate < periodStart) throw new Error('GIFI period end cannot be before the period start.');

  const closingEntries = filterEntriesByDateRange(entries, undefined, asOfDate);
  const periodEntries = filterEntriesByDateRange(entries, periodStart, asOfDate);
  const closingBalances = computeAccountBalances(accounts, closingEntries);
  const periodBalances = computeAccountBalances(accounts, periodEntries);
  const gifiByCode = new Map(gifiCodes.map((g) => [g.code, g]));

  const rowsByCode = new Map<string, GifiExportRow>();
  const unmappedAccounts: Account[] = [];
  const statementTypeMismatches: GifiExportResult['statementTypeMismatches'] = [];

  let totalAssetsCents = 0;
  let totalLiabilitiesCents = 0;
  let totalEquityCents = 0;
  let totalRevenueCents = 0;
  let totalExpensesCents = 0;
  let cumulativeRevenueCents = 0;
  let cumulativeExpensesCents = 0;

  for (const account of accounts) {
    const expectedStatement = statementForAccount(account);
    const bal = expectedStatement === 'IncomeStatement'
      ? (periodBalances.get(account.id)?.balanceCents ?? 0)
      : (closingBalances.get(account.id)?.balanceCents ?? 0);

    if (account.accountType === 'Asset') totalAssetsCents += bal;
    else if (account.accountType === 'Liability') totalLiabilitiesCents += bal;
    else if (account.accountType === 'Equity') totalEquityCents += bal;
    else if (account.accountType === 'Revenue') totalRevenueCents += bal;
    else if (account.accountType === 'Expense') totalExpensesCents += bal;

    // The Balance Sheet already folds any P&L that has not been closed to retained earnings into
    // equity. GIFI must do the same or 2599 = 3499 + 3620 can fail solely because year-end
    // closing entries have not been posted yet. Use cumulative P&L for this balance-sheet bridge,
    // while Schedule 125 itself continues to use only the selected fiscal period.
    const closingBal = closingBalances.get(account.id)?.balanceCents ?? 0;
    if (account.accountType === 'Revenue') cumulativeRevenueCents += closingBal;
    else if (account.accountType === 'Expense') cumulativeExpensesCents += closingBal;

    if (bal === 0) continue;

    if (!account.gifiCode) {
      unmappedAccounts.push(account);
      continue;
    }

    const gifi = gifiByCode.get(account.gifiCode);
    if (!gifi) {
      statementTypeMismatches.push({ account, gifiCode: account.gifiCode, expected: expectedStatement, actual: 'Unknown' });
      continue;
    }
    if (gifi.statementType !== expectedStatement) {
      statementTypeMismatches.push({ account, gifiCode: account.gifiCode, expected: expectedStatement, actual: gifi.statementType });
    }

    // CRA total lines are generated below from the ledger itself. An account mapped directly to one
    // is omitted here to prevent double-counting and surfaced as a mapping mismatch for correction.
    if (REQUIRED_TOTAL_CODES.has(account.gifiCode)) {
      statementTypeMismatches.push({ account, gifiCode: account.gifiCode, expected: expectedStatement, actual: 'Reserved CRA total line' });
      continue;
    }

    let row = rowsByCode.get(account.gifiCode);
    if (!row) {
      row = {
        gifiCode: account.gifiCode,
        description: gifi.description,
        statementType: gifi.statementType,
        amountCents: 0,
        accounts: [],
      };
      rowsByCode.set(account.gifiCode, row);
    }
    row.amountCents += bal;
    row.accounts.push({ account, amountCents: bal });
  }

  const unclosedNetIncomeCents = cumulativeRevenueCents - cumulativeExpensesCents;
  totalEquityCents += unclosedNetIncomeCents;

  // CRA Schedule 100 line 3600 is retained earnings/deficit. When North Ledger has not yet posted
  // a formal closing entry, surface the same synthetic unclosed earnings used by the Balance Sheet
  // inside that line so the detailed equity section and required total 3620 stay reconcilable.
  if (unclosedNetIncomeCents !== 0) {
    const retained = rowsByCode.get('3600');
    if (retained) {
      retained.amountCents += unclosedNetIncomeCents;
    } else {
      const gifi = gifiByCode.get('3600');
      rowsByCode.set('3600', {
        gifiCode: '3600',
        description: gifi?.description ?? 'Retained earnings/deficit',
        statementType: 'BalanceSheet',
        amountCents: unclosedNetIncomeCents,
        accounts: [],
      });
    }
  }

  const addComputedTotal = (code: string, amountCents: number) => {
    const gifi = gifiByCode.get(code);
    rowsByCode.set(code, {
      gifiCode: code,
      description: gifi?.description ?? `CRA required total ${code}`,
      statementType: gifi?.statementType ?? (Number(code) < 7000 ? 'BalanceSheet' : 'IncomeStatement'),
      amountCents,
      accounts: [],
      isComputedTotal: true,
    });
  };

  addComputedTotal('2599', totalAssetsCents);
  addComputedTotal('3499', totalLiabilitiesCents);
  addComputedTotal('3620', totalEquityCents);
  addComputedTotal('8299', totalRevenueCents);
  addComputedTotal('9368', totalExpensesCents);
  addComputedTotal('9999', totalRevenueCents - totalExpensesCents);

  const balanceSheetDifference = totalAssetsCents - (totalLiabilitiesCents + totalEquityCents);
  const incomeDifference = totalRevenueCents - totalExpensesCents - (totalRevenueCents - totalExpensesCents);
  const validityChecks: GifiValidityCheck[] = [
    {
      key: 'balanceSheet',
      label: 'Total assets = total liabilities + total shareholder equity',
      leftCents: totalAssetsCents,
      rightCents: totalLiabilitiesCents + totalEquityCents,
      differenceCents: balanceSheetDifference,
      balanced: balanceSheetDifference === 0,
    },
    {
      key: 'incomeStatement',
      label: 'Total revenue − total expenses = net income/loss',
      leftCents: totalRevenueCents - totalExpensesCents,
      rightCents: totalRevenueCents - totalExpensesCents,
      differenceCents: incomeDifference,
      balanced: incomeDifference === 0,
    },
  ];

  const rows = Array.from(rowsByCode.values()).sort((a, b) => a.gifiCode.localeCompare(b.gifiCode));
  unmappedAccounts.sort((a, b) => a.code.localeCompare(b.code));

  return {
    periodStart,
    asOfDate,
    rows,
    unmappedAccounts,
    statementTypeMismatches,
    validityChecks,
    filingReady: unmappedAccounts.length === 0 && statementTypeMismatches.length === 0 && validityChecks.every((c) => c.balanced),
  };
}
