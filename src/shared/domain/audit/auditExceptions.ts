import type { Account, JournalEntry } from '../types';

/**
 * Audit exceptions — the tests an auditor runs on a set of books before asking questions. Each
 * test returns the rows that fail it, not a summary, so every flagged item can be opened and
 * explained or fixed. Nothing here is an accusation: a weekend entry or a round number is usually
 * innocent, but it is exactly where an auditor looks first, so it is exactly what the bookkeeper
 * should be able to answer.
 */
export type ExceptionSeverity = 'high' | 'medium' | 'low';

export interface ExceptionRow {
  /** What to open: a journal entry, invoice, bill or account. */
  ref: { kind: 'journal' | 'invoice' | 'bill' | 'account'; id: number };
  date: string;
  label: string;
  detail: string;
  amountCents: number;
}

export interface ExceptionTest {
  id: string;
  title: string;
  severity: ExceptionSeverity;
  /** Why an auditor cares — one or two sentences a bookkeeper can act on. */
  why: string;
  /** What to do about it, for someone new to the books. */
  howToFix: string;
  rows: ExceptionRow[];
  /** Tests that compare two figures report them so the difference is visible even when it is nil. */
  comparison?: { left: string; leftCents: number; right: string; rightCents: number };
}

export interface AuditExceptionsReport {
  periodStart: string;
  periodEnd: string;
  tests: ExceptionTest[];
  counts: { high: number; medium: number; low: number; total: number };
}

export interface AuditInput {
  periodStart: string;
  periodEnd: string;
  accounts: Account[];
  entries: JournalEntry[];
  invoices: Array<{ id: number; customerId: number; customerName: string; invoiceNumber: string; invoiceDate: string; dueDate: string; totalCents: number; paidCents: number; status: string }>;
  bills: Array<{ id: number; vendorId: number; vendorName: string; billNumber: string | null; billDate: string; dueDate: string; amountCents: number; paidCents: number; status: string; billJournalEntryId: number | null }>;
  fiscalPeriods: Array<{ periodStart: string; periodEnd: string; isLocked: boolean; lockedAt: string | null }>;
  /** Journal entry ids and bill ids that have at least one attachment. */
  attachedJournalIds: Set<number>;
  attachedBillIds: Set<number>;
  /** Threshold under which "no support" is not flagged. */
  supportThresholdCents?: number;
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const inPeriod = (date: string, from: string, to: string) => date >= from && date <= to;
const entryAmount = (e: JournalEntry) => e.lines.reduce((s, l) => s + l.debitCents, 0);
const isManual = (e: JournalEntry) => e.source === 'manual' && !e.reference;

function balanceThrough(entries: JournalEntry[], accountId: number, to: string): number {
  let bal = 0;
  for (const e of entries) {
    if (e.status !== 'posted' || e.entryDate > to) continue;
    for (const l of e.lines) if (l.accountId === accountId) bal += l.debitCents - l.creditCents;
  }
  return bal;
}

function findAccount(accounts: Account[], pattern: RegExp, type?: Account['accountType']): Account | undefined {
  return accounts.find((a) => a.isActive && (!type || a.accountType === type) && pattern.test(a.name));
}

/** Gaps in a numeric-suffixed document sequence: INV-1003 then INV-1005 means 1004 is missing. */
export function sequenceGaps(numbers: string[]): Array<{ prefix: string; missing: number }> {
  const byPrefix = new Map<string, number[]>();
  for (const n of numbers) {
    const m = /^(.*?)(\d+)$/.exec(n.trim());
    if (!m) continue;
    byPrefix.set(m[1], [...(byPrefix.get(m[1]) ?? []), Number(m[2])]);
  }
  const gaps: Array<{ prefix: string; missing: number }> = [];
  for (const [prefix, list] of byPrefix) {
    const sorted = [...new Set(list)].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      for (let k = sorted[i - 1] + 1; k < sorted[i] && gaps.length < 200; k += 1) gaps.push({ prefix, missing: k });
    }
  }
  return gaps;
}

export function runAuditExceptions(input: AuditInput): AuditExceptionsReport {
  const { periodStart: from, periodEnd: to, accounts, entries, invoices, bills } = input;
  const threshold = input.supportThresholdCents ?? 100_000;
  const posted = entries.filter((e) => e.status === 'posted');
  const periodEntries = posted.filter((e) => inPeriod(e.entryDate, from, to));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const tests: ExceptionTest[] = [];

  // 1. Subledger vs control accounts.
  const ar = findAccount(accounts, /^accounts receivable$/i, 'Asset');
  if (ar) {
    const openAr = invoices.filter((i) => i.status === 'unpaid' && i.invoiceDate <= to).reduce((s, i) => s + (i.totalCents - i.paidCents), 0);
    const glAr = balanceThrough(posted, ar.id, to);
    const diff = glAr - openAr;
    tests.push({
      id: 'ar-control', title: 'Accounts receivable: open invoices vs GL control account', severity: 'high',
      howToFix: 'Open the General Ledger for Accounts Receivable and look for any entry that is not an invoice or a customer payment — a manual journal or a bank-import line coded straight to A/R. Reverse it and record the proper invoice or Receive Payment instead.', why: 'The customer list and the general ledger must agree to the cent. A difference means a manual entry hit the control account, or a payment was recorded without its invoice.',
      comparison: { left: 'Open invoices', leftCents: openAr, right: `GL balance — ${ar.name}`, rightCents: glAr },
      rows: diff === 0 ? [] : [{ ref: { kind: 'account', id: ar.id }, date: to, label: 'Difference', detail: `GL ${diff > 0 ? 'exceeds' : 'is below'} the open-invoice total`, amountCents: Math.abs(diff) }],
    });
  }
  const ap = findAccount(accounts, /^accounts payable$/i, 'Liability');
  if (ap) {
    const openAp = bills.filter((b) => b.status === 'unpaid' && b.billDate <= to).reduce((s, b) => s + (b.amountCents - b.paidCents), 0);
    const glAp = -balanceThrough(posted, ap.id, to);
    const diff = glAp - openAp;
    tests.push({
      id: 'ap-control', title: 'Accounts payable: open bills vs GL control account', severity: 'high', howToFix: 'Open the General Ledger for Accounts Payable and find entries that are not bills or bill payments — usually a bank payment coded to A/P without matching a bill. Void it and record it as Pay Bill against the right bill.',
      why: 'Same test on the vendor side. A difference usually means a bill was paid straight from the bank without being matched, or a manual entry touched Accounts Payable.',
      comparison: { left: 'Open bills', leftCents: openAp, right: `GL balance — ${ap.name}`, rightCents: glAp },
      rows: diff === 0 ? [] : [{ ref: { kind: 'account', id: ap.id }, date: to, label: 'Difference', detail: `GL ${diff > 0 ? 'exceeds' : 'is below'} the open-bill total`, amountCents: Math.abs(diff) }],
    });
  }

  // 2. Suspense / uncategorized balances.
  const suspense = accounts.filter((a) => a.isActive && /suspense|uncategori[sz]ed|ask my accountant|clearing/i.test(a.name));
  tests.push({
    id: 'suspense', title: 'Suspense, clearing and uncategorized accounts with a balance', severity: 'high', howToFix: 'Open each account, read every line, and re-code it to the real account (an expense, a customer payment, an owner draw). The balance should reach zero before the period is closed.',
    why: 'These accounts should be empty at period end. A balance is money the books have not yet explained.',
    rows: suspense.map((a) => ({ a, bal: balanceThrough(posted, a.id, to) })).filter((x) => x.bal !== 0).map((x) => ({ ref: { kind: 'account', id: x.a.id }, date: to, label: x.a.name, detail: x.bal > 0 ? 'debit balance' : 'credit balance', amountCents: Math.abs(x.bal) })),
  });

  // 3. Entries dated inside a locked period but created after the lock.
  tests.push({
    id: 'post-lock', title: 'Entries dated in a locked period but entered after it was locked', severity: 'high',
    howToFix: 'Ask why the entry was needed. If it belongs in the closed period, keep it but note the reason in the memo and tell the accountant, because filed figures changed. If it was a date typo, change the date to the open period.', why: 'Once a period is closed and filed, nothing should land in it. An entry that did changes figures already reported.',
    rows: posted.filter((e) => input.fiscalPeriods.some((p) => p.isLocked && p.lockedAt && inPeriod(e.entryDate, p.periodStart, p.periodEnd) && e.createdAt > p.lockedAt))
      .map((e) => ({ ref: { kind: 'journal', id: e.id }, date: e.entryDate, label: `#${e.id} ${e.memo ?? ''}`.trim(), detail: `entered ${e.createdAt.slice(0, 10)}`, amountCents: entryAmount(e) })),
  });

  // 4. Backdated entries: entered more than 30 days after their date.
  tests.push({
    id: 'backdated', title: 'Backdated entries (entered 30+ days after the entry date)', severity: 'medium',
    howToFix: 'Open each entry and add a memo explaining why it was entered late (found receipt, accountant adjustment, bank statement arrived). Going forward, enter transactions weekly.', why: 'Late entries are normal at year end, but a pattern of them is how figures get moved between periods. Each one should have a reason.',
    rows: periodEntries.filter((e) => days(e.entryDate, e.createdAt.slice(0, 10)) >= 30)
      .map((e) => ({ ref: { kind: 'journal', id: e.id }, date: e.entryDate, label: `#${e.id} ${e.memo ?? ''}`.trim(), detail: `entered ${e.createdAt.slice(0, 10)}, ${days(e.entryDate, e.createdAt.slice(0, 10))} days later`, amountCents: entryAmount(e) })),
  });

  // 5. Manual entries touching cash or revenue.
  const cashIds = new Set(accounts.filter((a) => a.accountSubtype === 'Cash and Bank').map((a) => a.id));
  const revenueIds = new Set(accounts.filter((a) => a.accountType === 'Revenue').map((a) => a.id));
  tests.push({
    id: 'manual-cash-revenue', title: 'Manual journal entries that touch bank or revenue accounts', severity: 'medium',
    howToFix: 'Replace hand-typed cash entries with the proper document: Receive Payment, Sales Receipt, Make Payment or a bank transaction, so the entry carries a customer, vendor and source. Keep manual entries for adjustments only.', why: 'Cash and sales should come from invoices, receipts, bills and bank transactions. A hand-typed entry on either is the first place an auditor looks for unsupported adjustments.',
    rows: periodEntries.filter((e) => isManual(e) && e.lines.some((l) => cashIds.has(l.accountId) || revenueIds.has(l.accountId)))
      .map((e) => ({ ref: { kind: 'journal', id: e.id }, date: e.entryDate, label: `#${e.id} ${e.memo ?? ''}`.trim(), detail: e.lines.filter((l) => cashIds.has(l.accountId) || revenueIds.has(l.accountId)).map((l) => accountName.get(l.accountId)).join(', '), amountCents: entryAmount(e) })),
  });

  // 6. Round-number manual entries.
  tests.push({
    id: 'round', title: 'Manual entries in round thousands ($1,000 and up)', severity: 'low',
    howToFix: 'Attach the calculation or agreement that produced the amount (an estimate, a loan schedule, an accrual worksheet) and say so in the memo.', why: 'Real transactions rarely land on exact thousands. Estimates and plugs do. Each should trace to a calculation.',
    rows: periodEntries.filter((e) => isManual(e) && entryAmount(e) >= 100_000 && entryAmount(e) % 100_000 === 0)
      .map((e) => ({ ref: { kind: 'journal', id: e.id }, date: e.entryDate, label: `#${e.id} ${e.memo ?? ''}`.trim(), detail: 'round amount', amountCents: entryAmount(e) })),
  });

  // 7. Weekend manual entries.
  tests.push({
    id: 'weekend', title: 'Manual entries dated on a weekend', severity: 'low',
    howToFix: 'Check the source document. If the date was mistyped, correct it. If the business really worked that day, add a memo saying so.', why: 'A business that does not trade on weekends should not have hand entries dated on one. Usually a typo in the date; occasionally not.',
    rows: periodEntries.filter((e) => isManual(e) && [0, 6].includes(new Date(`${e.entryDate}T00:00:00Z`).getUTCDay()))
      .map((e) => ({ ref: { kind: 'journal', id: e.id }, date: e.entryDate, label: `#${e.id} ${e.memo ?? ''}`.trim(), detail: new Date(`${e.entryDate}T00:00:00Z`).getUTCDay() === 0 ? 'Sunday' : 'Saturday', amountCents: entryAmount(e) })),
  });

  // 8. Missing support: large manual entries and bills without an attachment.
  tests.push({
    id: 'no-support', title: `Large items with no attached document (${(threshold / 100).toLocaleString('en-CA')}+)`, severity: 'medium',
    howToFix: 'Open the item and use Attachments to add the invoice, contract or receipt. For a manual entry, attach the working paper that supports the figure.', why: 'An auditor will ask for the invoice or agreement behind every material entry. Attaching it now saves the scramble later.',
    rows: [
      ...periodEntries.filter((e) => isManual(e) && entryAmount(e) >= threshold && !input.attachedJournalIds.has(e.id)).map((e) => ({ ref: { kind: 'journal' as const, id: e.id }, date: e.entryDate, label: `Journal #${e.id} ${e.memo ?? ''}`.trim(), detail: 'no attachment', amountCents: entryAmount(e) })),
      ...bills.filter((b) => inPeriod(b.billDate, from, to) && b.amountCents >= threshold && !input.attachedBillIds.has(b.id)).map((b) => ({ ref: { kind: 'bill' as const, id: b.id }, date: b.billDate, label: `Bill ${b.billNumber ?? ''} — ${b.vendorName}`.trim(), detail: 'no attachment', amountCents: b.amountCents })),
    ],
  });

  // 9. Possible duplicate bills and invoices.
  const dupBills: ExceptionRow[] = [];
  const sortedBills = bills.filter((b) => inPeriod(b.billDate, from, to)).sort((a, b) => a.billDate.localeCompare(b.billDate));
  for (let i = 0; i < sortedBills.length; i += 1) {
    for (let j = i + 1; j < sortedBills.length; j += 1) {
      const a = sortedBills[i], b = sortedBills[j];
      if (a.vendorId !== b.vendorId || a.amountCents !== b.amountCents) continue;
      if (Math.abs(days(a.billDate, b.billDate)) > 14) continue;
      if (a.billNumber && b.billNumber && a.billNumber !== b.billNumber) continue;
      dupBills.push({ ref: { kind: 'bill', id: b.id }, date: b.billDate, label: `Bill ${b.billNumber ?? ''} — ${b.vendorName}`.trim(), detail: `same vendor and amount as bill ${a.billNumber ?? `#${a.id}`} on ${a.billDate}`, amountCents: b.amountCents });
    }
  }
  const dupInvoices: ExceptionRow[] = [];
  const sortedInv = invoices.filter((i) => inPeriod(i.invoiceDate, from, to)).sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
  for (let i = 0; i < sortedInv.length; i += 1) {
    for (let j = i + 1; j < sortedInv.length; j += 1) {
      const a = sortedInv[i], b = sortedInv[j];
      if (a.customerId !== b.customerId || a.totalCents !== b.totalCents || Math.abs(days(a.invoiceDate, b.invoiceDate)) > 14) continue;
      dupInvoices.push({ ref: { kind: 'invoice', id: b.id }, date: b.invoiceDate, label: `${b.invoiceNumber} — ${b.customerName}`, detail: `same customer and amount as ${a.invoiceNumber} on ${a.invoiceDate}`, amountCents: b.totalCents });
    }
  }
  tests.push({ id: 'dup-bills', title: 'Possible duplicate bills (same vendor, amount, within 14 days)', severity: 'medium', howToFix: 'Open both bills and compare the vendor invoice numbers. If they are the same purchase, delete or void the second one before it is paid. If they are two real bills, enter the vendor\'s invoice number on each so they stop looking alike.', why: 'Paying a vendor twice is the commonest overpayment. Check the vendor invoice numbers before paying.', rows: dupBills });
  tests.push({ id: 'dup-invoices', title: 'Possible duplicate invoices (same customer, amount, within 14 days)', severity: 'low', howToFix: 'Open both invoices. If the customer was billed twice, issue a credit note against the second one. If both are real, add a reference so they stop looking alike.', why: 'Double-billing a customer overstates revenue and receivables until it is credited back.', rows: dupInvoices });

  // 10. Sequence gaps.
  const invGaps = sequenceGaps(invoices.map((i) => i.invoiceNumber));
  tests.push({
    id: 'invoice-gaps', title: 'Gaps in the invoice number sequence', severity: 'medium', howToFix: 'Find what happened to the missing number: an invoice deleted instead of voided, or one created outside the app. Re-create it as a voided invoice with a memo so the sequence is complete.',
    why: 'Every number should exist, even if voided. A missing number is an invoice that may have been issued and never recorded.',
    rows: invGaps.map((g) => ({ ref: { kind: 'invoice', id: 0 }, date: to, label: `${g.prefix}${g.missing}`, detail: 'no invoice with this number', amountCents: 0 })),
  });

  // 11. Voided entries.
  tests.push({
    id: 'voids', title: 'Voided entries in the period', severity: 'low',
    howToFix: 'Open each void and make sure the memo says why. A void with no reason will be questioned.', why: 'Voids are legitimate, but an auditor reads every one. Each should say why in its memo.',
    rows: entries.filter((e) => e.status === 'void' && inPeriod(e.entryDate, from, to)).map((e) => ({ ref: { kind: 'journal', id: e.id }, date: e.entryDate, label: `#${e.id} ${e.memo ?? ''}`.trim(), detail: 'void', amountCents: entryAmount(e) })),
  });

  // 12. Stale open items.
  tests.push({
    id: 'stale-ar', title: 'Invoices unpaid more than 90 days past due', severity: 'medium',
    howToFix: 'Contact the customer. If it will be paid, note the promise date. If not, record a credit note or bad-debt write-off so receivables are not overstated.', why: 'Old receivables may not be collectible. An auditor will ask whether an allowance or write-off is needed.',
    rows: invoices.filter((i) => i.status === 'unpaid' && days(i.dueDate, to) > 90).map((i) => ({ ref: { kind: 'invoice', id: i.id }, date: i.dueDate, label: `${i.invoiceNumber} — ${i.customerName}`, detail: `${days(i.dueDate, to)} days past due`, amountCents: i.totalCents - i.paidCents })),
  });
  tests.push({
    id: 'stale-ap', title: 'Bills unpaid more than 90 days past due', severity: 'low',
    howToFix: 'Check with the vendor whether it was paid another way. If yes, record the payment or void the bill. If disputed, note it in the bill memo.', why: 'Old payables are either disputed, forgotten, or already paid outside the books. Each needs an answer.',
    rows: bills.filter((b) => b.status === 'unpaid' && days(b.dueDate, to) > 90).map((b) => ({ ref: { kind: 'bill', id: b.id }, date: b.dueDate, label: `Bill ${b.billNumber ?? ''} — ${b.vendorName}`.trim(), detail: `${days(b.dueDate, to)} days past due`, amountCents: b.amountCents - b.paidCents })),
  });

  // 13. Entries with no memo.
  tests.push({
    id: 'no-memo', title: 'Manual entries with no memo', severity: 'low',
    howToFix: 'Open each entry and write one line that says what it is for and where the figure comes from.', why: 'An entry nobody can explain is an entry an auditor will not accept. A one-line memo is enough.',
    rows: periodEntries.filter((e) => isManual(e) && !(e.memo ?? '').trim()).map((e) => ({ ref: { kind: 'journal', id: e.id }, date: e.entryDate, label: `#${e.id}`, detail: 'no memo', amountCents: entryAmount(e) })),
  });

  const counts = { high: 0, medium: 0, low: 0, total: 0 };
  for (const t of tests) {
    if (t.rows.length === 0) continue;
    counts[t.severity] += t.rows.length;
    counts.total += t.rows.length;
  }
  const order: Record<ExceptionSeverity, number> = { high: 0, medium: 1, low: 2 };
  tests.sort((a, b) => order[a.severity] - order[b.severity] || (b.rows.length > 0 ? 1 : 0) - (a.rows.length > 0 ? 1 : 0));
  return { periodStart: from, periodEnd: to, tests, counts };
}
