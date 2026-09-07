/**
 * Action Centre — everything waiting on the bookkeeper, in one list: what is due or overdue, what
 * still has to be posted or cleared, and what the books suggest doing next. Each item names the
 * screen that resolves it. Pure: the handler gathers the facts, this file decides what they mean.
 */
export type ActionSection = 'due' | 'post' | 'suggest';
export type ActionSeverity = 'overdue' | 'today' | 'soon' | 'info';

export interface ActionTarget {
  kind: string;
  [key: string]: unknown;
}

export interface ActionItem {
  id: string;
  section: ActionSection;
  severity: ActionSeverity;
  title: string;
  detail: string;
  dueDate?: string;
  amountCents?: number;
  /** What to click through to. Mirrors the renderer's View union without depending on it. */
  target: ActionTarget;
  /** The button label on the item ("Pay", "Post", "Send reminder"). */
  actionLabel: string;
  /** Step-by-step for someone new: how to clear this item in the app. */
  howTo: string[];
  /** One worked case in plain words, with real-looking figures, so a first-timer can picture
   * what the steps do before doing them. */
  example?: string;
}

export interface ActionCentreInput {
  today: string;
  bills: Array<{ id: number; vendorName: string; billNumber: string | null; dueDate: string; amountCents: number; paidCents: number; status: string; approvalStatus?: string | null }>;
  invoices: Array<{ id: number; customerName: string; invoiceNumber: string; dueDate: string; totalCents: number; paidCents: number; status: string; customerEmail: string | null }>;
  draftJournalEntries: Array<{ id: number; entryDate: string; memo: string | null }>;
  draftPayRuns: Array<{ id: number; employeeName: string; payDate: string; netPayCents: number }>;
  nextPayDates: Array<{ employeeName: string; payDate: string }>;
  remittances: Array<{ periodLabel: string; dueDate: string; totalRemittanceCents: number; dueDateEstimate: boolean }>;
  hstPeriodsUnfiled: Array<{ periodStart: string; periodEnd: string; dueDate: string }>;
  receiptInboxCount: number;
  recurringDue: Array<{ id: number; customerName: string; nextDate: string; totalCents: number }>;
  unbilledTime: Array<{ customerName: string; hours: number; amountCents: number }>;
  reorder: Array<{ productId: number; name: string; quantityOnHand: number; reorderPoint: number; reorderQuantity: number; preferredVendorName: string | null }>;
  bankAccounts: Array<{ accountId: number; name: string; lastReconciledStatementDate: string | null }>;
  reminders: Array<{ id: string; title: string; dueDate: string }>;
  /** Expense accounts running over budget for the year to date. */
  budgetAlerts?: Array<{ accountId: number; accountName: string; budgetCents: number; actualCents: number; variancePercent: number }>;
}

export interface ActionCentreData {
  generatedAt: string;
  items: ActionItem[];
  counts: { overdue: number; today: number; soon: number; total: number };
}

const DAY = 86_400_000;

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY);
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function severityFor(today: string, dueDate: string, soonWindowDays = 7): ActionSeverity {
  const days = daysBetween(today, dueDate);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= soonWindowDays) return 'soon';
  return 'info';
}

function whenText(today: string, dueDate: string): string {
  const days = daysBetween(today, dueDate);
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

const SEVERITY_ORDER: Record<ActionSeverity, number> = { overdue: 0, today: 1, soon: 2, info: 3 };

export function buildActionItems(input: ActionCentreInput): ActionCentreData {
  const { today } = input;
  const items: ActionItem[] = [];

  // ---- Due: money in, money out, government ----
  for (const bill of input.bills) {
    if (bill.status !== 'unpaid') continue;
    const owing = bill.amountCents - bill.paidCents;
    if (owing <= 0) continue;
    const sev = severityFor(today, bill.dueDate);
    if (sev === 'info' && daysBetween(today, bill.dueDate) > 14) continue;
    items.push({
      id: `bill-${bill.id}`, section: 'due', severity: sev,
      title: `Pay ${bill.vendorName}${bill.billNumber ? ` — ${bill.billNumber}` : ''}`,
      detail: `${whenText(today, bill.dueDate)}${bill.approvalStatus === 'pending' ? ' · awaiting approval' : ''}`,
      dueDate: bill.dueDate, amountCents: owing,
      target: { kind: 'purchases', tab: 'unpaid', billId: bill.id }, howTo: ['Click Pay bill to open the bill in Expenses & Bills.', 'Choose Make Payment, pick the bank account the money leaves from, confirm the amount and date, and save.', 'If the bill is wrong or already paid another way, open it and use Void or Reverse instead of paying it again.'], example: 'Bell Canada sent a $459.90 bill due Oct 4. On Oct 1 you pay it from RBC Chequing: the bill shows Paid and $459.90 leaves the bank.', actionLabel: 'Pay bill',
    });
  }
  for (const inv of input.invoices) {
    if (inv.status !== 'unpaid') continue;
    const owing = inv.totalCents - inv.paidCents;
    if (owing <= 0) continue;
    const days = daysBetween(today, inv.dueDate);
    if (days > 3) continue;
    const sev = severityFor(today, inv.dueDate, 3);
    items.push({
      id: `invoice-${inv.id}`, section: 'due', severity: sev,
      title: `Collect ${inv.invoiceNumber} from ${inv.customerName}`,
      detail: `${whenText(today, inv.dueDate)}${inv.customerEmail ? '' : ' · no email on file for a reminder'}`,
      dueDate: inv.dueDate, amountCents: owing,
      target: { kind: 'invoiceEditor', id: inv.id }, howTo: ['Click the button to open the invoice.', 'If the customer has paid: use Receive Payment, choose the bank or Undeposited Funds, enter the amount and save. The invoice drops off this list.', 'If not paid: use Send reminder (needs the customer\'s email on their record) or phone them. If it will never be paid, record a credit note or write-off.'], example: 'You invoiced Birch & Co. $565 on Mar 10, Net 15. They e-transfer $565 on Mar 20: Receive Payment into Undeposited Funds, and the invoice drops off this list.', actionLabel: sev === 'overdue' ? 'Send reminder' : 'Open invoice',
    });
  }
  for (const r of input.remittances) {
    const days = daysBetween(today, r.dueDate);
    if (days > 14 || days < -45) continue;
    items.push({
      id: `remit-${r.periodLabel}`, section: 'due', severity: severityFor(today, r.dueDate),
      title: `CRA payroll remittance — ${r.periodLabel}`,
      detail: `${whenText(today, r.dueDate)}${r.dueDateEstimate ? ' (estimated date)' : ''}${days < 0 ? ' · confirm it was remitted, then record the payment' : ''}`,
      dueDate: r.dueDate, amountCents: r.totalRemittanceCents,
      target: { kind: 'payroll' }, howTo: ['Open Payroll and scroll to the PD7A panel; confirm the period and the amount shown.', 'Pay CRA through your bank (CRA payroll remittance, RP account) by the due date.', 'Record the payment: Make Payment from the bank to Payroll Remittances Payable for the same amount and date, so the liability clears.'], example: 'August payroll withheld $1,200 in CPP, EI and tax, plus $600 employer share. Pay CRA $1,800 by Sept 15, then record it from the bank to Payroll Remittances Payable.', actionLabel: 'Open PD7A',
    });
  }
  for (const h of input.hstPeriodsUnfiled) {
    const days = daysBetween(today, h.dueDate);
    if (days > 30) continue;
    items.push({
      id: `hst-${h.periodStart}`, section: 'due', severity: severityFor(today, h.dueDate, 14),
      title: `GST/HST return — ${h.periodStart} to ${h.periodEnd}`,
      detail: `${whenText(today, h.dueDate)} · not filed in Apex Ledger yet`,
      dueDate: h.dueDate,
      target: { kind: 'hstCentre' }, howTo: ['Open Sales Tax → HST Centre and choose the period.', 'Review the collected and claimed figures, then File Return: this posts the filing entry and locks the period.', 'Pay CRA (or expect the refund) through the bank and record it as a payment against the filed GST/HST liability.'], example: 'Quarter Apr–Jun: you collected $5,000 HST on sales and paid $1,500 HST on purchases. File the return and pay CRA the $3,500 difference.', actionLabel: 'File return',
    });
  }
  for (const p of input.nextPayDates) {
    const days = daysBetween(today, p.payDate);
    if (days > 5 || days < -14) continue;
    items.push({
      id: `pay-${p.employeeName}-${p.payDate}`, section: 'due', severity: severityFor(today, p.payDate, 5),
      title: `Run payroll — ${p.employeeName}`,
      detail: `pay date ${p.payDate}, ${whenText(today, p.payDate)}`,
      dueDate: p.payDate,
      target: { kind: 'payroll' }, howTo: ['Open Payroll and click Run Payroll.', 'Choose the employee, confirm the period and pay date, enter hours or salary and any extra items, then Save.', 'Post the run, print or email the stub, and if using direct deposit, save the bank file from the Direct Deposit panel.'], example: 'Jane is paid every second Friday. Run the period: $2,000 gross becomes about $1,560 net after deductions, and the net pay is posted from the bank.', actionLabel: 'Run payroll',
    });
  }
  for (const rem of input.reminders) {
    const days = daysBetween(today, rem.dueDate);
    if (days > 7) continue;
    items.push({
      id: `reminder-${rem.id}`, section: 'due', severity: severityFor(today, rem.dueDate),
      title: rem.title, detail: whenText(today, rem.dueDate), dueDate: rem.dueDate,
      target: { kind: 'calendar' }, howTo: ['Open the Calendar to see the reminder and any notes.', 'Do what it says, then mark it complete so it leaves this list.'], example: 'Reminder says \'Send T4 slips by Feb 28\'. Send them, then mark the reminder complete.', actionLabel: 'Open calendar',
    });
  }

  // ---- Post or clear ----
  for (const d of input.draftPayRuns) {
    items.push({
      id: `payrun-${d.id}`, section: 'post', severity: severityFor(today, d.payDate),
      title: `Post pay run — ${d.employeeName}`, detail: `pay date ${d.payDate} · draft, not in the books yet`,
      dueDate: d.payDate, amountCents: d.netPayCents,
      target: { kind: 'payroll' }, howTo: ['Open Payroll; the draft run is in the Pay Runs list with status draft.', 'Open it, check the figures, then click Post and choose the bank account the net pay comes from.', 'Posting creates the journal entry and the stub. Drafts are not in the books yet.'], example: 'Jane\'s Aug 29 run was saved as a draft last week. Open it, confirm $1,560 net, and post it from RBC Chequing.', actionLabel: 'Post',
    });
  }
  for (const j of input.draftJournalEntries) {
    items.push({
      id: `journal-${j.id}`, section: 'post', severity: daysBetween(j.entryDate, today) > 7 ? 'soon' : 'info',
      title: `Post journal entry #${j.id}`, detail: `${j.entryDate}${j.memo ? ` · ${j.memo}` : ''} · draft`,
      target: { kind: 'journalForm', id: j.id }, howTo: ['Click Post to open the draft journal entry.', 'Check each line: debits must equal credits and every line needs an account.', 'Click Post. If the entry is no longer needed, delete the draft instead.'], example: 'Draft entry for September rent: Debit Rent $2,000, Credit Bank $2,000. Both sides match, so post it.', actionLabel: 'Post',
    });
  }
  if (input.receiptInboxCount > 0) {
    items.push({
      id: 'receipts', section: 'post', severity: input.receiptInboxCount >= 5 ? 'soon' : 'info',
      title: `${input.receiptInboxCount} receipt${input.receiptInboxCount === 1 ? '' : 's'} waiting in the inbox`,
      detail: 'turn each into a bill or expense, or dismiss it',
      target: { kind: 'receiptInbox' }, howTo: ['Open the Receipt Inbox. Each file is a scanned or emailed receipt waiting to be booked.', 'For each one: choose Bill (if you will pay later) or Expense (already paid), check the vendor, date, amount and tax the scanner read, and save.', 'Dismiss anything that is not a business receipt.'], example: 'A Staples receipt for $56.50: choose Office Supplies, HST 13%, paid from Visa, save. It becomes a $50 expense with $6.50 HST claimed.', actionLabel: 'Open inbox',
    });
  }
  for (const r of input.recurringDue) {
    items.push({
      id: `recurring-${r.id}`, section: 'post', severity: severityFor(today, r.nextDate),
      title: `Create recurring invoice — ${r.customerName}`, detail: `scheduled ${r.nextDate}`,
      dueDate: r.nextDate, amountCents: r.totalCents,
      target: { kind: 'sales', tab: 'recurring' }, howTo: ['Open Sales → Recurring and click Generate on the due template.', 'Review the invoice it creates, then send it to the customer as usual.'], example: 'Monthly bookkeeping fee, $300, for Cedar Landscaping: Generate makes this month\'s invoice. Check it, then send it.', actionLabel: 'Generate',
    });
  }
  for (const t of input.unbilledTime) {
    if (t.amountCents <= 0) continue;
    items.push({
      id: `time-${t.customerName}`, section: 'post', severity: 'info',
      title: `Invoice unbilled time — ${t.customerName}`, detail: `${t.hours} h not yet invoiced`,
      amountCents: t.amountCents,
      target: { kind: 'sales', tab: 'time' }, howTo: ['Open Sales → Time; unbilled entries are grouped by customer.', 'Select the customer and click Invoice time. The entries become invoice lines and are marked billed.'], example: '6.5 unbilled hours for Maple Consulting at $120 an hour: Invoice makes a $780 invoice for those hours.', actionLabel: 'Invoice time',
    });
  }
  for (const b of input.bankAccounts) {
    const last = b.lastReconciledStatementDate;
    const stale = !last || daysBetween(last, today) > 35;
    if (!stale) continue;
    items.push({
      id: `recon-${b.accountId}`, section: 'post', severity: !last || daysBetween(last, today) > 65 ? 'soon' : 'info',
      title: `Reconcile ${b.name}`, detail: last ? `last reconciled to ${last}` : 'never reconciled',
      target: { kind: 'bankReconciliation' }, howTo: ['Open Banking → Bank Reconciliation and choose the account.', 'Enter the statement date and closing balance from the bank statement.', 'Tick each transaction that appears on the statement. When the difference is zero, click Finish. Anything left unticked is either not in the books yet or not on the statement.'], example: 'The RBC statement to Aug 31 closes at $12,450.10. Tick the entries that appear on it; the difference should end at $0.00.', actionLabel: 'Reconcile',
    });
  }

  // ---- Suggestions ----
  for (const p of input.reorder) {
    items.push({
      id: `reorder-${p.productId}`, section: 'suggest', severity: p.quantityOnHand <= 0 ? 'soon' : 'info',
      title: `Reorder ${p.name}`,
      detail: `${p.quantityOnHand} on hand, reorder point ${p.reorderPoint}${p.reorderQuantity > 0 ? ` · suggest ${p.reorderQuantity}` : ''}${p.preferredVendorName ? ` from ${p.preferredVendorName}` : ''}`,
      target: { kind: 'purchaseOrderEditor', id: 'new' }, howTo: ['Open Inventory → Products; the Reorder list at the top shows what is low.', 'Click Create PO for the vendor. The purchase order opens with the items and suggested quantities filled in.', 'Save and send the PO. When the goods arrive, receive them against the PO, then match the vendor\'s bill.'], example: 'Thermal paper: 0 on hand, reorder at 2, suggested 12. Create PO sends a 12-box order to Amazon Business.', actionLabel: 'Create PO',
    });
  }
  for (const b of input.budgetAlerts ?? []) {
    items.push({
      id: `budget-${b.accountId}`, section: 'suggest', severity: b.variancePercent >= 25 ? 'soon' : 'info',
      title: `${b.accountName} is ${Math.round(b.variancePercent)}% over budget`,
      detail: `spent so far vs budget for the same period`,
      amountCents: b.actualCents - b.budgetCents,
      target: { kind: 'report', report: 'budgetVsActual' }, actionLabel: 'Open budget report',
      howTo: ['Open the Budget vs Actual report and find the account.', 'Check whether the overspend is timing (an annual bill paid early) or real.', 'If it is real, either cut spending for the rest of the year or revise the budget line so the comparison stays honest.'], example: 'Advertising budget $6,000 so far this year, actual $7,400: over by $1,400. A one-off campaign is fine to note; a monthly habit is worth cutting back.',
    });
  }
  const noEmail = input.invoices.filter((i) => i.status === 'unpaid' && !i.customerEmail).length;
  if (noEmail > 0) {
    items.push({
      id: 'customers-no-email', section: 'suggest', severity: 'info',
      title: `${noEmail} open invoice${noEmail === 1 ? '' : 's'} for customers with no email`,
      detail: 'add an email so payment reminders can be sent',
      target: { kind: 'customers' }, howTo: ['Open Sales → Customers and open each customer on the list.', 'Add their email address and save. Payment reminders can then be sent from the invoice.'], example: 'Birch & Co. has no email on file. Add office@birch.example and save, so an overdue reminder can go out from the invoice.', actionLabel: 'Open customers',
    });
  }

  items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.title.localeCompare(b.title));
  const counts = { overdue: 0, today: 0, soon: 0, total: items.length };
  for (const i of items) if (i.severity !== 'info') counts[i.severity] += 1;
  return { generatedAt: today, items, counts };
}

/** GST/HST reporting periods that have ended and have no filing covering them, with the CRA due
 * date: one month after period end for monthly and quarterly filers; three months for annual. */
export function unfiledHstPeriods(
  frequency: 'Monthly' | 'Quarterly' | 'Annually' | 'None',
  fiscalYearEndMonth: number,
  fiscalYearEndDay: number,
  filings: Array<{ periodStart: string; periodEnd: string }>,
  today: string,
  lookBackPeriods = 4,
): Array<{ periodStart: string; periodEnd: string; dueDate: string }> {
  if (frequency === 'None') return [];
  const periods: Array<{ periodStart: string; periodEnd: string; dueDate: string }> = [];
  const y = Number(today.slice(0, 4));
  const monthsPer = frequency === 'Monthly' ? 1 : frequency === 'Quarterly' ? 3 : 12;
  // Anchor on the fiscal year end so quarters line up with the year-end month.
  const anchorEnd = new Date(Date.UTC(y, fiscalYearEndMonth, 0));
  if (fiscalYearEndDay < anchorEnd.getUTCDate()) anchorEnd.setUTCDate(fiscalYearEndDay);
  let end = new Date(anchorEnd);
  while (end.toISOString().slice(0, 10) < today) end = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + monthsPer + 1, 0));
  while (periods.length < lookBackPeriods) {
    end = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - monthsPer + 1, 0));
    const periodEnd = end.toISOString().slice(0, 10);
    if (periodEnd >= today) continue;
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - monthsPer + 1, 1)).toISOString().slice(0, 10);
    // CRA: one month after the period end (three for annual filers), i.e. the last day of that month.
    const due = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1 + (frequency === 'Annually' ? 3 : 1), 0)).toISOString().slice(0, 10);
    const covered = filings.some((f) => f.periodStart <= start && f.periodEnd >= periodEnd);
    periods.push({ periodStart: start, periodEnd, dueDate: due });
    if (covered) break; // everything earlier is presumed filed too
    if (periods.length >= lookBackPeriods) break;
  }
  return periods.filter((p) => !filings.some((f) => f.periodStart <= p.periodStart && f.periodEnd >= p.periodEnd)).reverse();
}
