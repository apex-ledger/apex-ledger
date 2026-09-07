import type { Account, JournalEntry } from '../types';
import { computeAccountBalances } from '../ledger/computeAccountBalances';

export type AuditSeverity = 'error' | 'warning' | 'info';

export interface AuditFinding {
  /** Stable within one audit run — lets the UI dedupe/link back to the entry or account. */
  id: string;
  severity: AuditSeverity;
  rule: string;
  title: string;
  detail: string;
  entryId?: number;
  accountId?: number;
}

export interface AuditInput {
  accounts: Account[];
  entries: JournalEntry[];
  /** Today's date, ISO (YYYY-MM-DD) — injected rather than read from the clock so this stays pure/testable. */
  todayIso: string;
  /** A draft sitting unposted longer than this is flagged as incomplete bookkeeping. Default 14. */
  draftAgeWarningDays?: number;
}

const RETAINED_EARNINGS_GIFI_CODE = '3600';

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

/**
 * Runs a fixed set of rule-based checks against the ledger for violations of fundamental
 * double-entry bookkeeping principles — not a substitute for a professional audit, but a fast,
 * repeatable pass that catches the mistakes bookkeeping training explicitly warns about:
 * unbalanced entries, expense/revenue accounts running the wrong direction, undocumented equity
 * postings, and stale unposted work.
 */
export function runAccountingAudit(input: AuditInput): AuditFinding[] {
  const { accounts, entries, todayIso } = input;
  const draftAgeWarningDays = input.draftAgeWarningDays ?? 14;
  const findings: AuditFinding[] = [];
  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  for (const entry of entries) {
    if (entry.status === 'void') continue;

    if (entry.status === 'draft') {
      const ageDays = daysBetween(entry.entryDate, todayIso);
      if (ageDays > draftAgeWarningDays) {
        findings.push({
          id: `stale-draft-${entry.id}`,
          severity: 'warning',
          rule: 'stale-draft',
          title: 'Unposted entry left in draft',
          detail: `Entry dated ${entry.entryDate}${entry.memo ? ` ("${entry.memo}")` : ''} is still a draft ${ageDays} days later. Post it or delete it — an unposted entry isn't part of your books yet.`,
          entryId: entry.id,
        });
      }
      continue;
    }

    // From here on, entry.status === 'posted'.
    if (entry.entryDate > todayIso) {
      findings.push({
        id: `future-dated-${entry.id}`,
        severity: 'info',
        rule: 'future-dated',
        title: 'Entry dated in the future',
        detail: `Entry dated ${entry.entryDate}${entry.memo ? ` ("${entry.memo}")` : ''} is dated after today — check for a typo in the year or month.`,
        entryId: entry.id,
      });
    }

    let debitTotal = 0;
    let creditTotal = 0;
    for (const line of entry.lines) {
      debitTotal += line.debitCents;
      creditTotal += line.creditCents;

      if (line.debitCents === 0 && line.creditCents === 0) {
        findings.push({
          id: `zero-line-${entry.id}-${line.id}`,
          severity: 'info',
          rule: 'zero-amount-line',
          title: 'Zero-amount line in a posted entry',
          detail: `Entry dated ${entry.entryDate}${entry.memo ? ` ("${entry.memo}")` : ''} has a line with no debit or credit amount.`,
          entryId: entry.id,
        });
      }

      const account = accountsById.get(line.accountId);
      if (account?.gifiCode === RETAINED_EARNINGS_GIFI_CODE) {
        findings.push({
          id: `retained-earnings-posting-${entry.id}-${line.id}`,
          severity: 'warning',
          rule: 'direct-retained-earnings-posting',
          title: 'Direct posting to Retained Earnings',
          detail: `Entry dated ${entry.entryDate}${entry.memo ? ` ("${entry.memo}")` : ''} posts directly to ${account.name}. Retained Earnings normally only changes through net income (via the Income Statement) or a deliberate equity transaction like dividends — a direct posting here is worth double-checking.`,
          entryId: entry.id,
          accountId: account.id,
        });
      }
    }

    if (debitTotal !== creditTotal) {
      const diff = Math.abs(debitTotal - creditTotal);
      // A difference divisible by 9 is the classic signature of a transposed number, so point the
      // reviewer straight at that likely cause.
      const transpositionHint = diff % 9 === 0 ? ` The $${(diff / 100).toFixed(2)} difference is divisible by 9 — a strong sign of a transposed number (e.g. 54 keyed as 45).` : '';
      findings.push({
        id: `unbalanced-${entry.id}`,
        severity: 'error',
        rule: 'unbalanced-entry',
        title: "Entry doesn't balance",
        detail: `Entry dated ${entry.entryDate}${entry.memo ? ` ("${entry.memo}")` : ''} has debits of $${(debitTotal / 100).toFixed(2)} vs. credits of $${(creditTotal / 100).toFixed(2)}. Every posted entry must balance — this should never happen and needs immediate review.${transpositionHint}`,
        entryId: entry.id,
      });
    }
  }

  const balances = computeAccountBalances(
    accounts,
    entries.filter((e) => e.status === 'posted'),
  );

  for (const account of accounts) {
    if (!account.isActive) continue;
    const balance = balances.get(account.id);
    if (!balance) continue;

    // Expense accounts are debit-normal and Revenue accounts are credit-normal; balanceCents is
    // already signed so a positive value means "in the normal direction". A negative balance here
    // means the account is running backwards — almost always a miscoded refund, reversal, or a
    // debit/credit typed on the wrong side, and always worth a second look.
    if (account.accountType === 'Expense' && balance.balanceCents < 0) {
      findings.push({
        id: `wrong-direction-expense-${account.id}`,
        severity: 'warning',
        rule: 'expense-credit-balance',
        title: 'Expense account has a credit balance',
        detail: `${account.name} has a net credit balance of $${(Math.abs(balance.balanceCents) / 100).toFixed(2)}. Expense accounts normally carry a debit balance — check for a miscoded refund or an entry posted on the wrong side.`,
        accountId: account.id,
      });
    }
    if (account.accountType === 'Revenue' && balance.balanceCents < 0) {
      findings.push({
        id: `wrong-direction-revenue-${account.id}`,
        severity: 'warning',
        rule: 'revenue-debit-balance',
        title: 'Revenue account has a debit balance',
        detail: `${account.name} has a net debit balance of $${(Math.abs(balance.balanceCents) / 100).toFixed(2)}. Revenue accounts normally carry a credit balance — check for refunds/credit notes exceeding sales, or an entry posted on the wrong side.`,
        accountId: account.id,
      });
    }

    if (account.gifiCode === null && balance.balanceCents !== 0) {
      findings.push({
        id: `missing-gifi-${account.id}`,
        severity: 'info',
        rule: 'missing-gifi-code',
        title: 'Account has a balance but no GIFI code',
        detail: `${account.name} has a non-zero balance but isn't mapped to a GIFI code yet. It needs one before your GIFI/T2 export will be complete.`,
        accountId: account.id,
      });
    }
  }

  // Large, exactly-round amounts on a posted entry (>= $10,000 and a whole multiple of $1,000) —
  // a common signature of a placeholder/estimate or a mis-keyed figure. Info only. One finding
  // per entry: a $10,000 transfer has the same round figure on both its debit and its credit
  // line, and reporting it twice made the audit page read as if two things were wrong.
  for (const entry of entries) {
    if (entry.status === 'void') continue;
    const roundLine = entry.lines.find((line) => {
      const amount = Math.max(line.debitCents, line.creditCents);
      return amount >= 1_000_000 && amount % 100_000 === 0;
    });
    if (!roundLine) continue;
    const amount = Math.max(roundLine.debitCents, roundLine.creditCents);
    findings.push({
      id: `large-round-${entry.id}`,
      severity: 'info',
      rule: 'large-round-amount',
      title: 'Large round-number amount',
      detail: `Entry dated ${entry.entryDate}${entry.memo ? ` ("${entry.memo}")` : ''} has a line of $${(amount / 100).toFixed(2)} — a large, exactly-round figure. Double-check it isn't a placeholder estimate or a mis-keyed amount.`,
      entryId: entry.id,
    });
  }

  // Inconsistent HST/tax coding on a revenue or expense account: some posted lines carry a taxable
  // code and others carry none. Often means HST was missed on the untagged lines. Info only, since
  // an account can legitimately mix taxable and exempt/zero-rated activity.
  const isTaxableCode = (code: JournalEntry['lines'][number]['taxCode']) => code === 'HST' || code === 'MealsHST' || code === 'Manual' || code === 'USTax';
  const taxByAccount = new Map<number, { taxed: number; untaxed: number }>();
  for (const entry of entries) {
    if (entry.status === 'void') continue;
    for (const line of entry.lines) {
      if (line.debitCents === 0 && line.creditCents === 0) continue;
      const account = accountsById.get(line.accountId);
      if (!account || (account.accountType !== 'Revenue' && account.accountType !== 'Expense')) continue;
      const rec = taxByAccount.get(line.accountId) ?? { taxed: 0, untaxed: 0 };
      if (isTaxableCode(line.taxCode)) rec.taxed += 1;
      else rec.untaxed += 1;
      taxByAccount.set(line.accountId, rec);
    }
  }
  for (const [accountId, rec] of taxByAccount) {
    if (rec.taxed > 0 && rec.untaxed > 0) {
      const account = accountsById.get(accountId);
      findings.push({
        id: `tax-inconsistent-${accountId}`,
        severity: 'info',
        rule: 'inconsistent-tax-coding',
        title: 'Inconsistent HST coding on an account',
        detail: `${account?.name ?? 'An account'} has ${rec.taxed} line${rec.taxed === 1 ? '' : 's'} with an HST/tax code and ${rec.untaxed} without. Check the untagged ones — HST may have been missed (or confirm they're genuinely exempt/zero-rated).`,
        accountId,
      });
    }
  }

  return findings;
}
