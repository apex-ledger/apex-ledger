import type { Account, JournalEntry } from '../types';
import { computeAccountBalances, filterEntriesByDateRange } from './computeAccountBalances';

/** Statement of Cash Flows, indirect method.
 *
 * The construction is deliberately "everything that isn't cash", rather than trying to trace cash
 * receipts and payments directly. Every posted entry balances, so the movement in every non-cash
 * account over a period must net to exactly the movement in cash — which means the statement ties
 * to the bank by construction rather than by luck, the same argument balanceSheet.ts relies on for
 * Assets = Liabilities + Equity. `isReconciled` re-checks it against the cash accounts' own
 * balances anyway, because a silent break here would be worth catching.
 *
 * For every non-cash account the cash effect is the opposite of its own movement: cash spent on
 * inventory leaves as the inventory balance grows, cash retained by not paying vendors stays as
 * payables grow. Revenue and expense movements are folded into a single "net income" line rather
 * than listed one account at a time, which is what makes this the indirect method.
 */

export type CashFlowCategory = 'operating' | 'investing' | 'financing';

export interface CashFlowLine {
  label: string;
  /** Signed as cash: positive is cash coming in, negative is cash going out. */
  amountCents: number;
  accountId: number | null;
}

export interface CashFlowSection {
  label: string;
  lines: CashFlowLine[];
  totalCents: number;
}

export interface CashFlowResult {
  periodStart: string;
  periodEnd: string;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netChangeCents: number;
  openingCashCents: number;
  closingCashCents: number;
  /** Opening and closing cash straight from the bank/cash accounts, independent of the sections
   * above. Equal to netChangeCents by construction; compared anyway as a self-check. */
  actualCashChangeCents: number;
  isReconciled: boolean;
  /** True when no account carries the 'Cash and Bank' subtype, in which case every figure here is
   * meaningless and the page should say so rather than render zeroes. */
  hasNoCashAccounts: boolean;
}

const CASH_SUBTYPE = 'Cash and Bank';

/** Non-cash expenses that reduced net income without any money leaving. Identified by name — the
 * chart of accounts has no flag for it — so this covers the conventional wordings and nothing
 * else; anything unusual simply stays inside net income and the statement still ties. */
function isNonCashExpense(account: Account): boolean {
  return account.accountType === 'Expense' && /deprecia|amorti/i.test(account.name);
}

function categoryFor(account: Account): CashFlowCategory {
  if (account.accountType === 'Revenue' || account.accountType === 'Expense') return 'operating';
  switch (account.accountSubtype) {
    case 'Capital Asset':
      return 'investing';
    case 'Long-Term Liability':
    case 'Share Capital':
    case 'Equity':
    case 'Retained Earnings':
      return 'financing';
    case 'Current Asset':
    case 'Current Liability':
    case 'Credit Card':
      return 'operating';
    default:
      // No subtype set, or one this app doesn't seed. Equity is financing by nature; everything
      // else is far more likely to be working capital than a capital purchase.
      return account.accountType === 'Equity' ? 'financing' : 'operating';
  }
}

/** How a movement in this account shows up as cash. An asset growing consumes cash; a liability or
 * equity balance growing provides it. `balanceCents` is already signed to the account's normal
 * balance, so the rule is just a sign flip on debit-normal accounts. */
function cashEffectOf(account: Account, balanceChangeCents: number): number {
  return account.normalBalance === 'Debit' ? -balanceChangeCents : balanceChangeCents;
}

export function cashFlowStatement(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart: string,
  periodEnd: string,
): CashFlowResult {
  const cashAccounts = accounts.filter((a) => a.accountSubtype === CASH_SUBTYPE);
  const nonCashAccounts = accounts.filter((a) => a.accountSubtype !== CASH_SUBTYPE);

  const periodEntries = filterEntriesByDateRange(entries, periodStart, periodEnd);
  const periodBalances = computeAccountBalances(accounts, periodEntries);

  // Strictly before the period, so opening cash is the closing balance of the day before — no
  // date arithmetic, which would have to know about month lengths and leap years.
  const priorEntries = entries.filter((e) => e.entryDate < periodStart);
  const openingBalances = computeAccountBalances(accounts, priorEntries);
  const throughBalances = computeAccountBalances(accounts, filterEntriesByDateRange(entries, undefined, periodEnd));

  const sumCash = (balances: ReturnType<typeof computeAccountBalances>) =>
    cashAccounts.reduce((sum, a) => sum + (balances.get(a.id)?.balanceCents ?? 0), 0);

  const openingCashCents = sumCash(openingBalances);
  const closingCashCents = sumCash(throughBalances);

  const sections: Record<CashFlowCategory, CashFlowLine[]> = { operating: [], investing: [], financing: [] };

  // Revenue and expenses collapse into one net income line, which is what makes this indirect.
  let netIncomeCents = 0;
  let nonCashAddBackCents = 0;
  for (const account of nonCashAccounts) {
    if (account.accountType !== 'Revenue' && account.accountType !== 'Expense') continue;
    const change = periodBalances.get(account.id)?.balanceCents ?? 0;
    netIncomeCents += account.accountType === 'Revenue' ? change : -change;
    if (isNonCashExpense(account)) nonCashAddBackCents += change;
  }
  sections.operating.push({ label: 'Net income for the period', amountCents: netIncomeCents, accountId: null });
  if (nonCashAddBackCents !== 0) {
    // Depreciation left net income but never left the bank, so it comes back here. The matching
    // fall in the capital asset balance would otherwise surface in investing as a phantom inflow,
    // so the same amount is removed there — the statement total is unchanged either way, this only
    // puts the two halves in the sections a reader expects them in.
    sections.operating.push({
      label: 'Add back: depreciation and amortization',
      amountCents: nonCashAddBackCents,
      accountId: null,
    });
    sections.investing.push({
      label: 'Less: depreciation included in capital assets above',
      amountCents: -nonCashAddBackCents,
      accountId: null,
    });
  }

  for (const account of nonCashAccounts) {
    if (account.accountType === 'Revenue' || account.accountType === 'Expense') continue;
    const change = periodBalances.get(account.id)?.balanceCents ?? 0;
    if (change === 0) continue;
    const amountCents = cashEffectOf(account, change);
    sections[categoryFor(account)].push({ label: account.name, amountCents, accountId: account.id });
  }

  const build = (label: string, lines: CashFlowLine[]): CashFlowSection => ({
    label,
    lines,
    totalCents: lines.reduce((sum, l) => sum + l.amountCents, 0),
  });

  const operating = build('Operating activities', sections.operating);
  const investing = build('Investing activities', sections.investing);
  const financing = build('Financing activities', sections.financing);
  const netChangeCents = operating.totalCents + investing.totalCents + financing.totalCents;
  const actualCashChangeCents = closingCashCents - openingCashCents;

  return {
    periodStart,
    periodEnd,
    operating,
    investing,
    financing,
    netChangeCents,
    openingCashCents,
    closingCashCents,
    actualCashChangeCents,
    isReconciled: netChangeCents === actualCashChangeCents,
    hasNoCashAccounts: cashAccounts.length === 0,
  };
}
