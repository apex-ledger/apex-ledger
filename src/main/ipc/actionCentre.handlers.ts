import { buildActionItems, unfiledHstPeriods, type ActionCentreData, type ActionCentreInput } from '@shared/domain/workflow/actionCentre';
import { computeRemittanceObligations } from '@shared/domain/payroll/computeRemittanceObligations';
import { computeNextPayPeriod, mostRecentPayPeriod } from '@shared/domain/payroll/computeNextPayPeriod';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { getCurrentDb } from '../companyFile';
import { getAllAccounts, getAllBills, getAllCustomers, getAllEmployees, getAllInvoices, getAllPayrollRuns, getAllVendors, getLatestCompletedReconciliation } from '../db/queries';
import { companyGet } from './company.handlers';
import { hstFilingsList } from './hstFilings.handlers';
import { receiptInboxList } from './receiptInbox.handlers';
import { recurringInvoicesDue } from './recurringInvoices.handlers';
import { timeEntriesUnbilled } from './timeEntries.handlers';
import { inventoryStatusReport, productsList } from './inventory.handlers';
import { remindersList } from './clients.handlers';
import type { ReminderRecord } from '@shared/domain/types';
import { approvalsPending } from './approvals.handlers';
import { budgetVsActualReport, budgetsList } from './taxSchedules.handlers';

/** The company file does not store its own GST/HST reporting period; the filings it has made do.
 * The most recent filing's length says whether it files monthly, quarterly or annually. With no
 * filing on record there is nothing to base a deadline on, so none is raised. */
function inferHstFrequency(filings: Array<{ periodStart: string; periodEnd: string }>): 'Monthly' | 'Quarterly' | 'Annually' | 'None' {
  const latest = [...filings].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
  if (!latest) return 'None';
  const months = (Number(latest.periodEnd.slice(0, 4)) - Number(latest.periodStart.slice(0, 4))) * 12 + Number(latest.periodEnd.slice(5, 7)) - Number(latest.periodStart.slice(5, 7)) + 1;
  if (months <= 1) return 'Monthly';
  if (months <= 4) return 'Quarterly';
  return 'Annually';
}

/** Gathers every source the Action Centre reads and hands the facts to the pure builder. Each
 * source is fetched defensively: one missing table or empty module must not blank the whole list. */
export async function actionCentreItems(): Promise<ActionCentreData> {
  const db = getCurrentDb();
  const today = localIsoDate();
  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  const [bills, invoices, vendors, customers, employees, runs, accounts, company, filings, inbox, recurring, unbilled, products, reminders] = await Promise.all([
    safe(() => getAllBills(db), []),
    safe(() => getAllInvoices(db), []),
    safe(() => getAllVendors(db), []),
    safe(() => getAllCustomers(db), []),
    safe(() => getAllEmployees(db), []),
    safe(() => getAllPayrollRuns(db), []),
    safe(() => getAllAccounts(db), []),
    companyGet(),
    safe(() => hstFilingsList(), []),
    safe(() => receiptInboxList(), []),
    safe(() => recurringInvoicesDue(), []),
    safe(() => timeEntriesUnbilled(), []),
    safe(() => productsList({ activeOnly: true }), []),
    safe(async () => remindersList(), [] as ReminderRecord[]),
  ]);

  const vendorName = new Map(vendors.map((v) => [v.id, v.name]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const employeeName = new Map(employees.map((e) => [e.id, e.name]));

  const draftEntries = await safe(
    () => db.selectFrom('journalEntries').select(['id', 'entryDate', 'memo']).where('status', '=', 'draft').orderBy('entryDate').limit(50).execute(),
    [] as Array<{ id: number; entryDate: string; memo: string | null }>,
  );

  const yearStart = `${today.slice(0, 4)}-01-01`;
  const remittances = computeRemittanceObligations(runs, yearStart, today, company.payrollRemitterType ?? 'regular');

  const nextPayDates = employees
    .filter((e) => e.isActive)
    .map((e) => {
      const own = runs.filter((r) => r.employeeId === e.id);
      const next = computeNextPayPeriod(mostRecentPayPeriod(own), today, e.payPeriodsPerYear);
      return { employeeName: e.name, payDate: next.payDate };
    });

  const status = await safe(() => inventoryStatusReport({ asOfDate: today }), null);
  const onHand = new Map((status?.rows ?? []).map((r) => [r.productId, r.quantityOnHand]));
  const reorder = products
    .filter((p) => p.trackQuantity && p.reorderPoint > 0 && (onHand.get(p.id) ?? 0) <= p.reorderPoint)
    .map((p) => ({ productId: p.id, name: p.name, quantityOnHand: onHand.get(p.id) ?? 0, reorderPoint: p.reorderPoint, reorderQuantity: p.reorderQuantity ?? 0, preferredVendorName: p.preferredVendorId ? vendorName.get(p.preferredVendorId) ?? null : null }));

  const bankAccounts = await Promise.all(
    accounts
      .filter((a) => a.accountSubtype === 'Cash and Bank' && !/undeposited|petty cash/i.test(a.name))
      .map(async (a) => ({ accountId: a.id, name: a.name, lastReconciledStatementDate: (await safe(() => getLatestCompletedReconciliation(db, a.id), undefined))?.statementDate ?? null })),
  );

  // Budget alerts: the active budget whose fiscal year contains today, compared year-to-date.
  const budgetAlerts = await safe(async () => {
    const budgets = await budgetsList();
    const current = budgets.find((b) => b.isActive && b.fiscalYearEnd >= today) ?? budgets.find((b) => b.fiscalYearEnd >= today);
    if (!current) return [];
    const end = new Date(`${current.fiscalYearEnd}T00:00:00Z`);
    const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), end.getUTCDate() + 1)).toISOString().slice(0, 10);
    if (start > today) return [];
    const report = await budgetVsActualReport({ budgetId: current.id, fiscalYearStart: start, periodStart: start, periodEnd: today });
    return report.expenses
      .filter((r) => r.budgetCents > 0 && !r.isFavourable && r.variancePercent !== null && r.variancePercent >= 10 && r.actualCents - r.budgetCents >= 50_000)
      .map((r) => ({ accountId: r.account.id, accountName: r.account.name, budgetCents: r.budgetCents, actualCents: r.actualCents, variancePercent: r.variancePercent ?? 0 }));
  }, []);

  const input: ActionCentreInput = {
    today,
    budgetAlerts,
    bills: bills.map((b) => ({ id: b.id, vendorName: vendorName.get(b.vendorId) ?? 'Vendor', billNumber: b.billNumber, dueDate: b.dueDate, amountCents: b.amountCents, paidCents: b.paidCents, status: b.status, approvalStatus: (b as { approvalStatus?: string | null }).approvalStatus ?? null })),
    invoices: invoices.map((i) => ({ id: i.id, customerName: customerById.get(i.customerId)?.name ?? 'Customer', invoiceNumber: i.invoiceNumber, dueDate: i.dueDate, totalCents: i.totalCents, paidCents: i.paidCents, status: i.status, customerEmail: customerById.get(i.customerId)?.email ?? null })),
    draftJournalEntries: draftEntries,
    draftPayRuns: runs.filter((r) => r.status === 'draft').map((r) => ({ id: r.id, employeeName: employeeName.get(r.employeeId) ?? 'Employee', payDate: r.payDate, netPayCents: r.netPayCents })),
    nextPayDates,
    remittances: remittances.map((r) => ({ periodLabel: r.periodLabel, dueDate: r.dueDate, totalRemittanceCents: r.totalRemittanceCents, dueDateEstimate: r.dueDateEstimate })),
    hstPeriodsUnfiled: unfiledHstPeriods(company.hstFilingFrequency && company.hstFilingFrequency !== 'None' ? company.hstFilingFrequency : inferHstFrequency(filings), company.fiscalYearEndMonth, company.fiscalYearEndDay, filings, today),
    receiptInboxCount: inbox.length,
    recurringDue: recurring.map((t) => ({ id: t.id, customerName: customerById.get(t.customerId)?.name ?? 'Customer', nextDate: t.nextDate, totalCents: t.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitPriceCents), 0) })),
    unbilledTime: unbilled.map((u) => ({ customerName: customerById.get(u.customerId)?.name ?? 'Customer', hours: u.hours, amountCents: u.amountCents })),
    reorder,
    bankAccounts,
    reminders: reminders.filter((r) => !r.completed).map((r) => ({ id: r.id, title: r.title, dueDate: r.dueDate })),
  };
  const report = buildActionItems(input);
  const pending = await safe(() => approvalsPending(), []);
  if (pending.length > 0) {
    report.items.unshift({ id: 'approvals', section: 'post', severity: 'soon', title: `${pending.length} item${pending.length === 1 ? '' : 's'} awaiting approval`, detail: pending.slice(0, 3).map((p) => p.title).join(' · '), target: { kind: 'approvals' }, actionLabel: 'Review', howTo: ['Open Approvals from the sidebar (Accounting section).', 'Read each item; open it if you need the detail.', 'Click Approve, or Reject with a note saying what to change. Only administrators and accountants can decide.'], example: 'A $12,000 journal entry is above the $10,000 threshold, so it waits here. An administrator opens Approvals, reads it, and clicks Approve; it can then be posted.' });
    report.counts.soon += 1;
    report.counts.total += 1;
  }
  return report;
}
