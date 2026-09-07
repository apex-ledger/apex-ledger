/** Year-End Sign-off: one clipboard of checks with a traffic light on each, and a decision.
 *
 * Every check answers a question a reviewer asks before a year (or a quarter) is declared closed:
 * does the trial balance balance, is every bank reconciled, are the sales-tax returns filed, do
 * the sub-ledgers agree with their control accounts, is anything still in draft. A red light is a
 * fact that must change before the period can be signed; an amber light is something to look at
 * and note. The decision at the bottom follows from the lights, never from opinion.
 *
 * Pure: the handler gathers the records, this file only judges them, so a test can hand it a
 * hand-built set and check every light.
 */
import type { Account, BankReconciliation, Bill, FiscalPeriod, HstFiling, HstFilingFrequency, Invoice, JournalEntry, PayrollRun } from '../types';
import { trialBalance } from '../ledger/trialBalance';
import { balanceSheet } from '../ledger/balanceSheet';
import { computeAccountBalances, filterEntriesByDateRange } from '../ledger/computeAccountBalances';
import { computeHstSummary } from '../ledger/hstSummary';
import type { AuditExceptionsReport } from './auditExceptions';

export type SignoffLight = 'green' | 'amber' | 'red';
export type SignoffDecision = 'ready' | 'readyWithNotes' | 'notReady';

/** Where the Open button on a check goes. Kept as plain data so the domain stays free of the UI store. */
export type SignoffTarget =
  | { kind: 'report'; report: string; accountId?: number }
  | { kind: 'page'; page: 'bankReconciliation' | 'hstCentre' | 'payroll' | 'journalList' | 'chartOfAccounts' | 'vendors' | 'customers' | 'inventory' | 'monthEndClose' | 'deposits' };

export interface SignoffCheck {
  id: string;
  /** Which part of the clipboard the check sits under. */
  section: 'Books balance' | 'Bank and cash' | 'Sales tax' | 'Payroll' | 'Sub-ledgers' | 'Housekeeping' | 'Audit tests';
  title: string;
  light: SignoffLight;
  /** One line a reviewer reads: the figure, or what is missing. */
  summary: string;
  /** What to do when the light is not green. */
  action?: string;
  target?: SignoffTarget;
}

export interface YearEndSignoffReport {
  periodStart: string;
  periodEnd: string;
  checks: SignoffCheck[];
  counts: { green: number; amber: number; red: number };
  decision: SignoffDecision;
}

export interface SignoffInput {
  periodStart: string;
  periodEnd: string;
  /** The day the report runs — a return is only "overdue" once its period has ended. */
  today: string;
  accounts: Account[];
  entries: JournalEntry[];
  invoices: Invoice[];
  bills: Bill[];
  fiscalPeriods: FiscalPeriod[];
  reconciliations: BankReconciliation[];
  hstFilings: HstFiling[];
  hstFilingFrequency: HstFilingFrequency;
  payrollRuns: PayrollRun[];
  undepositedFundsAccountId: number | null;
  inventory: Array<{ name: string; quantityOnHand: number }>;
  /** Names on the contact lists, to spot the same business entered twice. */
  vendorNames: string[];
  customerNames: string[];
  auditExceptions: AuditExceptionsReport;
}

const money = (cents: number) => `$${(Math.abs(cents) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** A book balance keeps its sign: an overdrawn bank reads −$1,234.56, not $1,234.56. */
const signed = (cents: number) => (cents < 0 ? '−' : '') + money(cents);

/** "Bell Canada Inc." and "Bell Canada" are the same vendor to anyone but a computer. */
export function normalizeContactName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|ltd|limited|corp|corporation|co|company|llc|llp|the)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function duplicateNames(names: string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const name of names) {
    const key = normalizeContactName(name);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), name]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

function periodsEndingWithin(frequency: HstFilingFrequency, periodStart: string, periodEnd: string, today: string): Array<{ start: string; end: string; label: string }> {
  if (frequency === 'None') return [];
  const months = frequency === 'Monthly' ? 1 : frequency === 'Quarterly' ? 3 : 12;
  const out: Array<{ start: string; end: string; label: string }> = [];
  const [y0] = periodStart.split('-').map(Number);
  // Walk calendar periods from January of the start year; keep the ones that end inside the report
  // period and have already ended in real time.
  for (let year = y0; year <= Number(periodEnd.slice(0, 4)); year += 1) {
    for (let month = 1; month <= 12; month += months) {
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const endMonth = month + months - 1;
      const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
      const end = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      if (end < periodStart || end > periodEnd || end >= today) continue;
      const label = months === 1 ? start.slice(0, 7) : months === 3 ? `${year}-Q${Math.floor((month - 1) / 3) + 1}` : String(year);
      out.push({ start, end, label });
    }
  }
  return out;
}

export function runYearEndSignoff(input: SignoffInput): YearEndSignoffReport {
  const { periodStart, periodEnd, today, accounts, entries } = input;
  const checks: SignoffCheck[] = [];
  const add = (check: SignoffCheck) => checks.push(check);
  const posted = entries.filter((e) => e.status === 'posted');
  const upToEnd = filterEntriesByDateRange(posted, undefined, periodEnd);
  const balances = computeAccountBalances(accounts, upToEnd);
  const balanceOf = (id: number) => balances.get(id)?.balanceCents ?? 0;
  const inPeriod = (date: string) => date >= periodStart && date <= periodEnd;

  // ---- Books balance ----
  const tb = trialBalance(accounts, posted, periodEnd);
  add({
    id: 'trial-balance', section: 'Books balance', title: 'Trial Balance balances',
    light: tb.isBalanced ? 'green' : 'red',
    summary: tb.isBalanced ? `Debits ${money(tb.totalDebitCents)} = credits ${money(tb.totalCreditCents)}.` : `Debits ${money(tb.totalDebitCents)} do not equal credits ${money(tb.totalCreditCents)}.`,
    action: tb.isBalanced ? undefined : 'Find the unbalanced entry on Invalid Transactions and correct it.',
    target: { kind: 'report', report: tb.isBalanced ? 'trialBalance' : 'invalidTransactions' },
  });
  const bs = balanceSheet(accounts, posted, periodEnd);
  const equation = bs.assets.totalCents === bs.liabilities.totalCents + bs.equity.totalCents;
  add({
    id: 'balance-sheet', section: 'Books balance', title: 'Balance Sheet: assets = liabilities + equity',
    light: equation ? 'green' : 'red',
    summary: `Assets ${money(bs.assets.totalCents)}; liabilities ${money(bs.liabilities.totalCents)} + equity ${money(bs.equity.totalCents)}.`,
    action: equation ? undefined : 'An account is typed wrongly or an entry is one-sided. Start from the Trial Balance.',
    target: { kind: 'report', report: 'balanceSheet' },
  });
  const drafts = entries.filter((e) => e.status === 'draft' && inPeriod(e.entryDate));
  add({
    id: 'draft-journals', section: 'Books balance', title: 'No journal entries left in draft',
    light: drafts.length === 0 ? 'green' : 'amber',
    summary: drafts.length === 0 ? 'Every entry in the period is posted or void.' : `${drafts.length} draft ${drafts.length === 1 ? 'entry' : 'entries'} dated in the period, not yet posted.`,
    action: drafts.length === 0 ? undefined : 'Post or delete each draft from Journal Entries.',
    target: { kind: 'page', page: 'journalList' },
  });
  const beforeStart = posted.filter((e) => e.entryDate < periodStart && e.source === 'quickEntry');
  add({
    id: 'before-period', section: 'Books balance', title: 'No quick entries dated before the period',
    light: beforeStart.length === 0 ? 'green' : 'amber',
    summary: beforeStart.length === 0 ? 'Nothing keyed with a date earlier than the period start.' : `${beforeStart.length} quick ${beforeStart.length === 1 ? 'entry' : 'entries'} dated before ${periodStart} — usually a wrong year on the date.`,
    action: beforeStart.length === 0 ? undefined : 'Open each one from Journal Entries and change the date, or confirm it belongs to the prior year.',
    target: { kind: 'page', page: 'journalList' },
  });

  // ---- Bank and cash ----
  const moneyAccounts = accounts.filter((a) => a.isActive && (a.accountSubtype === 'Cash and Bank' || a.accountSubtype === 'Credit Card'));
  for (const account of moneyAccounts) {
    const touched = upToEnd.some((e) => e.lines.some((l) => l.accountId === account.id));
    if (!touched) continue;
    const done = input.reconciliations.filter((r) => r.accountId === account.id && r.status === 'completed').sort((a, b) => b.statementDate.localeCompare(a.statementDate));
    const latest = done[0];
    const light: SignoffLight = latest && latest.statementDate >= periodEnd ? 'green' : latest ? 'amber' : 'red';
    add({
      id: `recon-${account.id}`, section: 'Bank and cash', title: `${account.name} reconciled to ${periodEnd}`,
      light,
      summary: light === 'green' ? `Reconciled to the ${latest!.statementDate} statement. Book balance ${signed(balanceOf(account.id))}.` : latest ? `Last reconciled to ${latest.statementDate}; the period end is ${periodEnd}. Book balance ${signed(balanceOf(account.id))}.` : `Never reconciled. Book balance ${signed(balanceOf(account.id))}.`,
      action: light === 'green' ? undefined : 'Bank Reconciliation → this account → statement dated at or after the period end.',
      target: { kind: 'page', page: 'bankReconciliation' },
    });
  }
  if (input.undepositedFundsAccountId !== null) {
    const undeposited = balanceOf(input.undepositedFundsAccountId);
    add({
      id: 'undeposited', section: 'Bank and cash', title: 'Undeposited Funds cleared',
      light: undeposited === 0 ? 'green' : 'amber',
      summary: undeposited === 0 ? 'Every payment received has been deposited to a bank account.' : `${money(undeposited)} received but not yet deposited.`,
      action: undeposited === 0 ? undefined : 'Sales → Deposits → Make Deposit for the payments still waiting.',
      target: { kind: 'page', page: 'deposits' },
    });
  }
  const overdrawn = moneyAccounts.filter((a) => a.accountSubtype === 'Cash and Bank' && balanceOf(a.id) < 0);
  add({
    id: 'overdrawn', section: 'Bank and cash', title: 'No bank or cash account below zero',
    light: overdrawn.length === 0 ? 'green' : 'amber',
    summary: overdrawn.length === 0 ? 'All bank and cash balances are positive.' : overdrawn.map((a) => `${a.name} ${signed(balanceOf(a.id))}`).join('; ') + '.',
    action: overdrawn.length === 0 ? undefined : 'A negative bank balance is usually a missing deposit or a payment posted to the wrong account.',
    target: { kind: 'report', report: 'generalLedger', accountId: overdrawn[0]?.id },
  });

  // ---- Sales tax ----
  const due = periodsEndingWithin(input.hstFilingFrequency, periodStart, periodEnd, today);
  const hst = computeHstSummary(accounts, posted, periodStart, periodEnd);
  const byPeriod = new Map([...hst.monthly, ...hst.quarterly, ...hst.annual].map((p) => [p.period, p]));
  for (const p of due) {
    const filing = input.hstFilings.find((f) => f.periodStart === p.start && f.periodEnd === p.end);
    const computed = byPeriod.get(p.label);
    if (!filing) {
      add({
        id: `hst-${p.label}`, section: 'Sales tax', title: `GST/HST return filed for ${p.label}`,
        light: 'red',
        summary: computed ? `Not filed. The books show ${money(computed.collectedCents)} collected, ${money(computed.itcCents)} ITCs, net ${computed.netPayableCents >= 0 ? 'owing' : 'refund'} ${money(computed.netPayableCents)}.` : 'Not filed.',
        action: 'Sales Tax → File GST/HST Return for this period.',
        target: { kind: 'report', report: 'hstFiling' },
      });
      continue;
    }
    // A period with no taxed lines is simply zero on both sides — a filing that reports tax there disagrees.
    const books = computed ?? { collectedCents: 0, itcCents: 0 };
    const agrees = books.collectedCents === filing.collectedCents && books.itcCents === filing.itcCents;
    add({
      id: `hst-${p.label}`, section: 'Sales tax', title: `GST/HST return filed for ${p.label}`,
      light: agrees ? 'green' : 'amber',
      summary: agrees ? `Filed ${filing.filingDate}: collected ${money(filing.collectedCents)}, ITCs ${money(filing.itcCents)}, net ${money(filing.netPayableCents)}.` : `Filed ${filing.filingDate} with collected ${money(filing.collectedCents)} / ITCs ${money(filing.itcCents)}, but the books now show ${money(books.collectedCents)} / ${money(books.itcCents)}.`,
      action: agrees ? undefined : 'Something was posted into a filed period. Void and re-file the return, or move the entry.',
      target: { kind: 'report', report: agrees ? 'hstSummary' : 'hstReconciliation' },
    });
  }
  const manual = [...hst.quarterly].reduce((sum, q) => sum + q.manualCount, 0);
  add({
    id: 'hst-manual', section: 'Sales tax', title: 'No sales-tax lines waiting for an amount',
    light: manual === 0 ? 'green' : 'amber',
    summary: manual === 0 ? 'Every taxed line carries its tax amount.' : `${manual} ${manual === 1 ? 'line' : 'lines'} tagged Custom rate with no tax amount entered — left out of the return.`,
    action: manual === 0 ? undefined : 'Open each from GST/HST Payable and enter the exact tax.',
    target: { kind: 'report', report: 'hstSummary' },
  });

  // ---- Payroll ----
  const runs = input.payrollRuns.filter((r) => inPeriod(r.payDate));
  const draftRuns = runs.filter((r) => r.status === 'draft');
  if (runs.length > 0) {
    add({
      id: 'payroll-drafts', section: 'Payroll', title: 'Every pay run posted',
      light: draftRuns.length === 0 ? 'green' : 'amber',
      summary: draftRuns.length === 0 ? `${runs.length} pay runs in the period, all posted.` : `${draftRuns.length} of ${runs.length} pay runs still in draft.`,
      action: draftRuns.length === 0 ? undefined : 'Payroll → post or delete each draft.',
      target: { kind: 'page', page: 'payroll' },
    });
    const remit = accounts.find((a) => a.isActive && /payroll remittances payable|payroll liabilities/i.test(a.name));
    if (remit) {
      // computeAccountBalances signs a credit-normal account's balance positive when it is a credit.
      const owing = balanceOf(remit.id);
      const lastTwo = runs.filter((r) => r.status === 'posted').sort((a, b) => b.payDate.localeCompare(a.payDate)).slice(0, 8);
      const recent = lastTwo.reduce((sum, r) => sum + r.cpp1EmployeeCents + r.cpp1EmployerCents + r.cpp2EmployeeCents + r.cpp2EmployerCents + r.eiEmployeeCents + r.eiEmployerCents + r.incomeTaxCents, 0);
      const light: SignoffLight = owing < 0 ? 'red' : owing <= recent ? 'green' : 'amber';
      add({
        id: 'payroll-remit', section: 'Payroll', title: 'Source deductions remitted to CRA',
        light,
        summary: owing < 0 ? `${remit.name} is ${money(owing)} on the wrong side — more remitted than withheld.` : light === 'green' ? `${money(owing)} withheld and not yet remitted, within the last remittance period.` : `${money(owing)} in ${remit.name} — more than the recent pay runs withheld, so an earlier remittance looks unpaid.`,
        action: light === 'green' ? undefined : 'Payroll → PD7A Remittance: compare each month with the payment made to CRA.',
        target: { kind: 'page', page: 'payroll' },
      });
    }
  }

  // ---- Sub-ledgers (from the audit tests, which already do the arithmetic) ----
  const auditTest = (id: string) => input.auditExceptions.tests.find((t) => t.id === id);
  for (const [id, title, page] of [['ar-control', 'Accounts receivable agrees with open invoices', 'customers'], ['ap-control', 'Accounts payable agrees with open bills', 'vendors']] as const) {
    const t = auditTest(id);
    if (!t) continue;
    const ok = t.rows.length === 0;
    const cmp = t.comparison;
    add({
      id, section: 'Sub-ledgers', title,
      light: ok ? 'green' : 'red',
      summary: cmp ? `${cmp.left} ${money(cmp.leftCents)}; ${cmp.right} ${money(cmp.rightCents)}${ok ? '.' : ` — difference ${money(cmp.leftCents - cmp.rightCents)}.`}` : ok ? 'Agrees.' : `${t.rows.length} differences.`,
      action: ok ? undefined : t.howToFix,
      target: ok ? { kind: 'page', page } : { kind: 'report', report: 'auditExceptions' },
    });
  }
  const suspense = auditTest('suspense');
  if (suspense) {
    add({
      id: 'suspense', section: 'Sub-ledgers', title: 'Suspense and clearing accounts at zero',
      light: suspense.rows.length === 0 ? 'green' : 'red',
      summary: suspense.rows.length === 0 ? 'Nothing parked in suspense.' : suspense.rows.map((r) => `${r.label} ${money(r.amountCents)}`).join('; ') + '.',
      action: suspense.rows.length === 0 ? undefined : suspense.howToFix,
      target: { kind: 'report', report: 'auditExceptions' },
    });
  }
  const negativeStock = input.inventory.filter((r) => r.quantityOnHand < 0);
  if (input.inventory.length > 0) {
    add({
      id: 'inventory', section: 'Sub-ledgers', title: 'No stock item below zero',
      light: negativeStock.length === 0 ? 'green' : 'red',
      summary: negativeStock.length === 0 ? `${input.inventory.length} tracked items, all with a quantity of zero or more.` : negativeStock.map((r) => `${r.name} ${r.quantityOnHand}`).join('; ') + '.',
      action: negativeStock.length === 0 ? undefined : 'A sale was recorded before its purchase. Enter the missing receipt or an adjustment.',
      target: { kind: 'page', page: 'inventory' },
    });
  }

  // ---- Housekeeping ----
  for (const [kind, names, page] of [['vendor', input.vendorNames, 'vendors'], ['customer', input.customerNames, 'customers']] as const) {
    const dups = duplicateNames(names);
    add({
      id: `dup-${kind}s`, section: 'Housekeeping', title: `No duplicate ${kind}s`,
      light: dups.length === 0 ? 'green' : 'amber',
      summary: dups.length === 0 ? `Each ${kind} appears once.` : dups.map((g) => g.join(' / ')).join('; ') + '.',
      action: dups.length === 0 ? undefined : `Open the ${kind} to keep → Merge duplicate… → choose the other one.`,
      target: { kind: 'page', page },
    });
  }
  const covering = input.fiscalPeriods.filter((p) => p.periodStart <= periodEnd && p.periodEnd >= periodStart);
  const unlocked = covering.filter((p) => !p.isLocked);
  const lockedThrough = covering.length > 0 && unlocked.length === 0 && covering.some((p) => p.periodEnd >= periodEnd);
  const lockedTo = covering.filter((p) => p.isLocked).map((p) => p.periodEnd).sort().pop();
  add({
    id: 'locks', section: 'Housekeeping', title: 'Fiscal periods locked through the period end',
    light: lockedThrough ? 'green' : 'amber',
    summary: lockedThrough ? 'Locked. Nothing can be posted into the period without an override.' : covering.length === 0 ? 'No fiscal period covers this range yet.' : unlocked.length > 0 ? `${unlocked.length} ${unlocked.length === 1 ? 'period is' : 'periods are'} still open: ${unlocked.map((p) => p.label).join(', ')}.` : `Locked through ${lockedTo}; no period is set up from there to ${periodEnd}.`,
    action: lockedThrough ? undefined : 'Month-End Close → lock each period once the checks above are green.',
    target: { kind: 'page', page: 'monthEndClose' },
  });

  // ---- Remaining audit tests, as one line each ----
  for (const t of input.auditExceptions.tests) {
    if (['ar-control', 'ap-control', 'suspense'].includes(t.id)) continue;
    const failing = t.rows.length > 0;
    add({
      id: `audit-${t.id}`, section: 'Audit tests', title: t.title,
      light: !failing ? 'green' : t.severity === 'high' ? 'red' : 'amber',
      summary: failing ? `${t.rows.length} ${t.rows.length === 1 ? 'item' : 'items'}: ${t.rows.slice(0, 3).map((r) => r.label).join('; ')}${t.rows.length > 3 ? '…' : ''}` : 'Passed.',
      action: failing ? t.howToFix : undefined,
      target: { kind: 'report', report: 'auditExceptions' },
    });
  }

  const counts = { green: 0, amber: 0, red: 0 };
  for (const c of checks) counts[c.light] += 1;
  const decision: SignoffDecision = counts.red > 0 ? 'notReady' : counts.amber > 0 ? 'readyWithNotes' : 'ready';
  return { periodStart, periodEnd, checks, counts, decision };
}

export const DECISION_LABELS: Record<SignoffDecision, string> = {
  ready: 'Ready to sign off',
  readyWithNotes: 'Ready with notes',
  notReady: 'Not ready',
};
