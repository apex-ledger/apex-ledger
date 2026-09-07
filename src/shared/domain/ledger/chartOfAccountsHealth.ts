import type { Account } from '../types';

/** Checks a chart of accounts for the misclassifications that quietly distort the statements.
 *
 * An account in the wrong place does not error and does not look wrong on any screen. It shows up
 * only as a figure that is off — income understated because a revenue account was typed as an
 * expense, or a balance sheet missing equipment because a capital purchase was booked as a cost.
 * Nobody finds those by reading the chart; they find them a year later, or their accountant does.
 */

export type CoaIssueSeverity = 'error' | 'warning';

export interface CoaIssue {
  accountId: number;
  accountCode: string;
  accountName: string;
  severity: CoaIssueSeverity;
  /** What is wrong, in one line. */
  message: string;
  /** What to do about it. */
  suggestion: string;
}

/** Words that name something a business OWNS rather than something it SPENDS.
 *
 * Deliberately narrow. "Equipment" and "Vehicle" are worth flagging because buying them is a
 * capital purchase that belongs on the balance sheet and gets depreciated — booking one as an
 * expense overstates costs this year and leaves the asset off the books entirely. Words like
 * "repairs" or "rental" are excluded: those really are expenses even though they mention the asset.
 */
const CAPITAL_WORDS = /\b(equipment|machinery|vehicles?|furniture|computer hardware|leasehold improvements?)\b/i;

/** Words that mean the money came IN. */
const INCOME_WORDS = /\b(income|revenue|sales|fees earned|commission)\b/i;

/** Expense accounts that legitimately mention a capital word — the cost of USING the asset, not of
 * buying it. Checked first, because these are the common case and flagging them would be noise. */
const RUNNING_COST_WORDS = /\b(repairs?|maintenance|rentals?|rent|leases?|insurance|fuel|expenses?|costs?|depreciation|amortization)\b/i;

/** Contra accounts sit on the opposite side to their type and are correct that way. */
const CONTRA_WORDS = /\b(accumulated depreciation|accumulated amortization|allowance for|refunds?|returns?|rebates?|discount)\b/i;

function issue(account: Account, severity: CoaIssueSeverity, message: string, suggestion: string): CoaIssue {
  return { accountId: account.id, accountCode: account.code, accountName: account.name, severity, message, suggestion };
}

/** A capital purchase booked as an expense — the "is equipment an asset?" check. */
function checkCapitalItemsAsExpenses(accounts: Account[]): CoaIssue[] {
  return accounts
    .filter((a) => a.accountType === 'Expense' && CAPITAL_WORDS.test(a.name) && !RUNNING_COST_WORDS.test(a.name))
    .map((a) =>
      issue(
        a,
        'warning',
        `"${a.name}" is an expense account, but the name describes something the business owns.`,
        'Equipment and vehicles?s are capital assets: they belong on the balance sheet and are written off over time through depreciation. If this account holds purchases of the item itself, it should be an Asset.',
      ),
    );
}

/** Income booked as an expense, or a cost booked as income. Either one moves profit the wrong way
 * twice over — once by the amount missing from its own side, once by the amount added to the other. */
function checkIncomeExpenseMixups(accounts: Account[]): CoaIssue[] {
  const issues: CoaIssue[] = [];

  for (const account of accounts) {
    if (account.accountType === 'Expense' && INCOME_WORDS.test(account.name) && !CONTRA_WORDS.test(account.name)) {
      issues.push(
        issue(
          account,
          'error',
          `"${account.name}" is classified as an Expense, but the name describes money coming in.`,
          'Change it to Revenue. Left as an expense, every amount posted to it both understates income and overstates costs.',
        ),
      );
    }
  }

  return issues;
}

/** The subtype disagreeing with the type. Not itself a posting error, but it is how a chart drifts:
 * the subtype is what the reports group by, so an expense filed under "Revenue" lands in the wrong
 * section of anything that reads subtypes. */
function checkSubtypeContradictions(accounts: Account[]): CoaIssue[] {
  const contradictions: Record<string, string[]> = {
    Expense: ['revenue', 'income'],
    Revenue: ['expense', 'operating expense', 'cost of sales'],
    Asset: ['liability', 'equity'],
    Liability: ['asset'],
  };

  return accounts
    .filter((a) => {
      const subtype = (a.accountSubtype ?? '').toLowerCase();
      if (!subtype) return false;
      return (contradictions[a.accountType] ?? []).some((bad) => subtype === bad);
    })
    .map((a) =>
      issue(
        a,
        'warning',
        `"${a.name}" is ${a.accountType} but its sub-type says "${a.accountSubtype}".`,
        'Set the sub-type to one that matches the account type, so reports that group by sub-type put it in the right section.',
      ),
    );
}

/** Two accounts meaning the same thing. Costs get split across both, and neither total is right. */
function checkNearDuplicates(accounts: Account[]): CoaIssue[] {
  // Compared on words rather than the raw string, so "Rent / Lease" and "Rent" match, and so does
  // "Interest & Bank Charges - Long-Term Debt" against its bracketed twin.
  function fingerprint(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !['and', 'the', 'of', 'for', 'to'].includes(w))
      .sort()
      .join(' ');
  }

  const byPrint = new Map<string, Account[]>();
  for (const account of accounts) {
    if (!account.isActive) continue;
    const key = `${account.accountType}|${fingerprint(account.name)}`;
    byPrint.set(key, [...(byPrint.get(key) ?? []), account]);
  }

  const issues: CoaIssue[] = [];
  for (const group of byPrint.values()) {
    if (group.length < 2) continue;
    // Reported against the later one, since the earlier is usually the original.
    const [first, ...rest] = [...group].sort((a, b) => a.code.localeCompare(b.code));
    for (const duplicate of rest) {
      issues.push(
        issue(
          duplicate,
          'warning',
          `"${duplicate.name}" duplicates "${first.name}" (${first.code}).`,
          'Costs posted to both are split across two accounts, so neither total is right. Make one inactive and move its history to the other.',
        ),
      );
    }
  }
  return issues;
}

export interface CoaHealthResult {
  issues: CoaIssue[];
  errorCount: number;
  warningCount: number;
}

export function checkChartOfAccounts(accounts: Account[]): CoaHealthResult {
  const active = accounts.filter((a) => a.isActive);
  const issues = [
    ...checkIncomeExpenseMixups(active),
    ...checkCapitalItemsAsExpenses(active),
    ...checkSubtypeContradictions(active),
    ...checkNearDuplicates(accounts),
  ].sort((a, b) => (a.severity === b.severity ? a.accountCode.localeCompare(b.accountCode) : a.severity === 'error' ? -1 : 1));

  return {
    issues,
    errorCount: issues.filter((i) => i.severity === 'error').length,
    warningCount: issues.filter((i) => i.severity === 'warning').length,
  };
}
