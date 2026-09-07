/**
 * The accountant's first look at a client file: how far behind the banking is, and what is wrong
 * that the client's own screens will not have shown them. Everything here is derived from what is
 * already in the books — nothing is stored, so it can never be stale or contradict a report.
 */
export interface OverviewAccount {
  id: number;
  name: string;
  accountType: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  accountSubtype: string | null;
  isActive: boolean;
}

export interface OverviewLine {
  accountId: number;
  debitCents: number;
  creditCents: number;
  reconciliationId?: number | null;
}

export interface OverviewEntry {
  entryDate: string;
  status: string;
  lines: OverviewLine[];
}

export interface OverviewReconciliation {
  accountId: number;
  statementDate: string;
  status: string;
}

export interface OverviewOpenDocument {
  dueDate: string;
  balanceDueCents: number;
}

export interface BankingActivityRow {
  accountId: number;
  name: string;
  kind: 'bank' | 'card';
  /** Balance in the books as of the review date. */
  bookBalanceCents: number;
  unreconciledCount: number;
  unreconciledCents: number;
  /** Statement date of the last completed reconciliation, or null if never. */
  reconciledThrough: string | null;
  attention: string | null;
}

export type IssueSeverity = 'high' | 'medium' | 'low';

export interface OverviewIssue {
  key: string;
  severity: IssueSeverity;
  title: string;
  detail: string;
  /** Where to go to deal with it — a view name the renderer maps to a screen. */
  go: 'reconcile' | 'deposits' | 'journal' | 'invoices' | 'bills' | 'chartOfAccounts' | 'receipts' | 'hst' | 'accounts';
  amountCents?: number;
  count?: number;
}

const MONEY_SUBTYPES = ['cash', 'bank'];

export function isMoneyAccount(account: OverviewAccount): 'bank' | 'card' | null {
  const subtype = (account.accountSubtype ?? '').toLowerCase();
  if (subtype.includes('credit card')) return 'card';
  if (MONEY_SUBTYPES.some((word) => subtype.includes(word))) return 'bank';
  return null;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** One row per bank and card account: what the books say, how much has never been matched to a
 * statement, and how long ago the last statement was closed off. */
export function bankingActivity(accounts: OverviewAccount[], entries: OverviewEntry[], reconciliations: OverviewReconciliation[], asOf: string): BankingActivityRow[] {
  const rows: BankingActivityRow[] = [];
  for (const account of accounts) {
    const kind = isMoneyAccount(account);
    if (!kind || !account.isActive) continue;
    let balance = 0;
    let unreconciledCount = 0;
    let unreconciledCents = 0;
    for (const entry of entries) {
      if (entry.status !== 'posted' || entry.entryDate > asOf) continue;
      for (const line of entry.lines) {
        if (line.accountId !== account.id) continue;
        const signed = line.debitCents - line.creditCents;
        balance += signed;
        if (line.reconciliationId === null || line.reconciliationId === undefined) {
          unreconciledCount += 1;
          unreconciledCents += signed;
        }
      }
    }
    const completed = reconciliations.filter((r) => r.accountId === account.id && r.status === 'completed').map((r) => r.statementDate).sort();
    const reconciledThrough = completed.length > 0 ? completed[completed.length - 1] : null;
    // Books show a bank asset as a debit balance and a card liability as a credit balance; show both
    // the way a statement would (positive = money there / money owed).
    const bookBalanceCents = kind === 'card' ? -balance : balance;
    let attention: string | null = null;
    if (kind === 'bank' && bookBalanceCents < 0) attention = 'Overdrawn in the books';
    else if (reconciledThrough === null && unreconciledCount > 0) attention = 'Never reconciled';
    else if (reconciledThrough !== null && daysBetween(reconciledThrough, asOf) > 60 && unreconciledCount > 0) attention = `Last reconciled ${reconciledThrough}`;
    rows.push({ accountId: account.id, name: account.name, kind, bookBalanceCents, unreconciledCount, unreconciledCents, reconciledThrough, attention });
  }
  return rows.sort((a, b) => (a.attention ? 0 : 1) - (b.attention ? 0 : 1) || a.name.localeCompare(b.name));
}

function balanceOf(accountId: number, entries: OverviewEntry[], asOf: string): number {
  let balance = 0;
  for (const entry of entries) {
    if (entry.status !== 'posted' || entry.entryDate > asOf) continue;
    for (const line of entry.lines) if (line.accountId === accountId) balance += line.debitCents - line.creditCents;
  }
  return balance;
}

function oldestOpenDate(accountId: number, entries: OverviewEntry[], asOf: string): string | null {
  const dates = entries.filter((entry) => entry.status === 'posted' && entry.entryDate <= asOf && entry.lines.some((line) => line.accountId === accountId && line.debitCents > 0)).map((entry) => entry.entryDate).sort();
  return dates[0] ?? null;
}

export interface OverviewInput {
  accounts: OverviewAccount[];
  entries: OverviewEntry[];
  reconciliations: OverviewReconciliation[];
  openInvoices: OverviewOpenDocument[];
  openBills: OverviewOpenDocument[];
  draftJournalCount: number;
  receiptsWaiting: number;
  /** GST/HST periods with activity that have not been filed, oldest first. */
  unfiledPeriods: { period: string; netCents: number }[];
  asOf: string;
}

/** The things an accountant checks first, in the order they matter. Each is an issue only when
 * it is actually true in this file; a clean file produces an empty list. */
export function commonIssues(input: OverviewInput): OverviewIssue[] {
  const { accounts, entries, asOf } = input;
  const issues: OverviewIssue[] = [];
  const byName = (pattern: RegExp) => accounts.filter((a) => a.isActive && pattern.test(a.name));

  for (const row of bankingActivity(accounts, entries, input.reconciliations, asOf)) {
    if (row.kind === 'bank' && row.bookBalanceCents < 0) {
      issues.push({ key: `overdrawn-${row.accountId}`, severity: 'high', title: `${row.name} is negative in the books`, detail: 'A bank account cannot really go below zero without an overdraft. Usually a missing deposit or a payment entered twice.', go: 'reconcile', amountCents: row.bookBalanceCents });
    }
    if (row.reconciledThrough === null && row.unreconciledCount > 0) {
      issues.push({ key: `never-reconciled-${row.accountId}`, severity: 'medium', title: `${row.name} has never been reconciled`, detail: `${row.unreconciledCount} transactions have not been matched to a statement.`, go: 'reconcile', count: row.unreconciledCount });
    }
  }

  for (const account of byName(/undeposited funds/i)) {
    const balance = balanceOf(account.id, entries, asOf);
    if (balance > 0) {
      const oldest = oldestOpenDate(account.id, entries, asOf);
      const age = oldest ? daysBetween(oldest, asOf) : 0;
      issues.push({ key: `undeposited-${account.id}`, severity: age > 30 ? 'high' : 'low', title: 'Money sitting in Undeposited Funds', detail: age > 30 ? `Payments received but never recorded as deposited, the oldest ${age} days ago. The bank will not agree with the books until they are.` : 'Payments received and not yet recorded as deposited — normal within the week.', go: 'deposits', amountCents: balance });
    }
  }

  for (const account of byName(/suspense|uncategori[sz]ed|ask my accountant|to be sorted|miscellaneous accounts/i)) {
    const balance = balanceOf(account.id, entries, asOf);
    if (balance !== 0) {
      issues.push({ key: `suspense-${account.id}`, severity: 'medium', title: `${account.name} is not empty`, detail: 'Entries parked here still need a real account before the statements mean anything.', go: 'journal', amountCents: balance });
    }
  }

  for (const account of byName(/opening balance equity/i)) {
    const balance = balanceOf(account.id, entries, asOf);
    if (balance !== 0) {
      issues.push({ key: `obe-${account.id}`, severity: 'medium', title: 'Opening Balance Equity has a balance', detail: 'Opening balances were entered but never moved to retained earnings or owner equity.', go: 'journal', amountCents: balance });
    }
  }

  const overdueInvoices = input.openInvoices.filter((doc) => doc.balanceDueCents > 0 && daysBetween(doc.dueDate, asOf) > 90);
  if (overdueInvoices.length > 0) {
    const total = overdueInvoices.reduce((sum, doc) => sum + doc.balanceDueCents, 0);
    issues.push({ key: 'ar-90', severity: 'medium', title: `${overdueInvoices.length} customer invoice${overdueInvoices.length === 1 ? '' : 's'} more than 90 days overdue`, detail: 'Chase them, or write off what will not be collected so receivables are real.', go: 'invoices', amountCents: total, count: overdueInvoices.length });
  }
  const overdueBills = input.openBills.filter((doc) => doc.balanceDueCents > 0 && daysBetween(doc.dueDate, asOf) > 90);
  if (overdueBills.length > 0) {
    const total = overdueBills.reduce((sum, doc) => sum + doc.balanceDueCents, 0);
    issues.push({ key: 'ap-90', severity: 'medium', title: `${overdueBills.length} vendor bill${overdueBills.length === 1 ? '' : 's'} more than 90 days overdue`, detail: 'Either unpaid, or paid and the payment never recorded against the bill.', go: 'bills', amountCents: total, count: overdueBills.length });
  }

  if (input.draftJournalCount > 0) {
    issues.push({ key: 'drafts', severity: 'low', title: `${input.draftJournalCount} draft journal entr${input.draftJournalCount === 1 ? 'y' : 'ies'}`, detail: 'Drafts are not in any report. Post or delete them.', go: 'journal', count: input.draftJournalCount });
  }
  if (input.receiptsWaiting > 0) {
    issues.push({ key: 'receipts', severity: 'low', title: `${input.receiptsWaiting} receipt${input.receiptsWaiting === 1 ? '' : 's'} waiting in the inbox`, detail: 'Scanned or uploaded but not yet turned into an expense or bill.', go: 'receipts', count: input.receiptsWaiting });
  }
  for (const period of input.unfiledPeriods) {
    issues.push({ key: `hst-${period.period}`, severity: 'medium', title: `GST/HST for ${period.period} not filed`, detail: period.netCents >= 0 ? 'Net tax is owed for this period.' : 'A refund is due for this period.', go: 'hst', amountCents: period.netCents });
  }

  const order: Record<IssueSeverity, number> = { high: 0, medium: 1, low: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
