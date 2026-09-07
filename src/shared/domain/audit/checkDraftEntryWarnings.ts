import type { Account, TaxCode } from '../types';

const RETAINED_EARNINGS_GIFI_CODE = '3600';

// High-confidence category matches only — real-world GST/HST-exempt treatment has enough edge
// cases (commercial vs. residential rent, financial-service fees vs. taxable processing fees) that
// a wrong flag here would train the reviewer to ignore this warning entirely. Matched against the
// account's own name, so a renamed/custom account for the same real-world expense still triggers
// it. See the Knowledge Base page (Settings) for the fuller reference list this rule is drawn from.
const HST_EXEMPT_CATEGORY_PATTERNS: RegExp[] = [/insurance/i, /^bank charges$/i];

export interface DraftLineInput {
  accountId: number;
  debitCents: number;
  creditCents: number;
  taxCode?: TaxCode | null;
}

export interface DraftEntryWarning {
  id: string;
  rule: string;
  message: string;
}

/**
 * A lightweight, real-time subset of the same rules runAccountingAudit.ts checks after the fact —
 * evaluated against a single in-progress entry so the accounting-principle nudge shows up while
 * the user is still typing, not just later on the standalone Audit page. Every check here works
 * off the entry alone (no ledger-wide balance lookup), so it's cheap to run on every keystroke.
 * Advisory only — never blocks saving, since a rare legitimate case (e.g. a genuine correcting
 * entry) can look identical to a mistake.
 */
export function checkDraftEntryWarnings(
  accounts: Account[],
  lines: DraftLineInput[],
  entryDate: string,
  todayIso: string,
): DraftEntryWarning[] {
  const warnings: DraftEntryWarning[] = [];
  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  if (entryDate && entryDate > todayIso) {
    warnings.push({
      id: 'future-dated',
      rule: 'future-dated',
      message: `This entry is dated ${entryDate}, after today — check for a typo in the year or month.`,
    });
  }

  const sidesByAccount = new Map<number, { debit: boolean; credit: boolean }>();
  for (const line of lines) {
    if (line.debitCents === 0 && line.creditCents === 0) continue;
    const sides = sidesByAccount.get(line.accountId) ?? { debit: false, credit: false };
    if (line.debitCents > 0) sides.debit = true;
    if (line.creditCents > 0) sides.credit = true;
    sidesByAccount.set(line.accountId, sides);

    const account = accountsById.get(line.accountId);
    if (!account) continue;

    if (account.gifiCode === RETAINED_EARNINGS_GIFI_CODE) {
      warnings.push({
        id: `retained-earnings-${line.accountId}`,
        rule: 'direct-retained-earnings-posting',
        message: `You're posting directly to ${account.name}. That account normally only changes through net income or a deliberate equity transaction like dividends — double-check this is intentional.`,
      });
    }

    if (line.taxCode === 'HST' && HST_EXEMPT_CATEGORY_PATTERNS.some((p) => p.test(account.name))) {
      warnings.push({
        id: `hst-exempt-category-${line.accountId}`,
        rule: 'hst-exempt-category',
        message: `${account.name} is typically GST/HST-exempt — double-check this charge actually included HST before using the HST tax code. See Settings → Knowledge Base for details.`,
      });
    }

    if (account.accountType === 'Expense' && line.creditCents > 0 && line.debitCents === 0) {
      warnings.push({
        id: `expense-credited-${line.accountId}`,
        rule: 'expense-credited',
        message: `${account.name} is an expense account being credited here — expenses normally get debited. Make sure this is a refund/reversal, not a swapped debit and credit.`,
      });
    }
    if (account.accountType === 'Revenue' && line.debitCents > 0 && line.creditCents === 0) {
      warnings.push({
        id: `revenue-debited-${line.accountId}`,
        rule: 'revenue-debited',
        message: `${account.name} is a revenue account being debited here — revenue normally gets credited. Make sure this is a refund/credit note, not a swapped debit and credit.`,
      });
    }
  }

  for (const [accountId, sides] of sidesByAccount) {
    if (sides.debit && sides.credit) {
      const account = accountsById.get(accountId);
      warnings.push({
        id: `same-account-both-sides-${accountId}`,
        rule: 'same-account-both-sides',
        message: `${account?.name ?? 'The same account'} is both debited and credited in this entry — usually that nets to nothing. Make sure that's what you meant.`,
      });
    }
  }

  // Transposition check (the classic "divisible by 9" bookkeeping rule): once BOTH sides have
  // amounts (so the entry is plausibly complete, not just mid-typing) but they don't match, a
  // difference that is evenly divisible by 9 is the tell-tale sign of transposed digits — e.g. 54
  // keyed as 45, or 1,230 as 1,320. Only fires in that specific case so it doesn't nag a
  // half-entered entry.
  const totalDebits = lines.reduce((sum, l) => sum + l.debitCents, 0);
  const totalCredits = lines.reduce((sum, l) => sum + l.creditCents, 0);
  const diff = Math.abs(totalDebits - totalCredits);
  if (totalDebits > 0 && totalCredits > 0 && diff > 0 && diff % 9 === 0) {
    warnings.push({
      id: 'transposition-suspect',
      rule: 'transposition-suspect',
      message: `Debits and credits are off by $${(diff / 100).toFixed(2)}, which is evenly divisible by 9 — the classic sign of a transposed number (e.g. 54 typed as 45, or 1,230 as 1,320). Re-check the amounts.`,
    });
  }

  return warnings;
}
