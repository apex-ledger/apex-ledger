import { useEffect, useState } from 'react';
import { useUiStore, type View } from '../../app/store/uiStore';
import type { Invoice } from '@shared/domain/types';
import { runAccountingAudit } from '@shared/domain/audit/runAccountingAudit';
import { checkChartOfAccounts } from '@shared/domain/ledger/chartOfAccountsHealth';
import { BackupRecoveryPanel } from './BackupRecoveryPanel';
import { localIsoDate } from '@shared/domain/dates/localDate';

interface ChecklistItem { title: string; description: string; example: string; count?: number; view?: View; run?: () => void; action: string; tone: string }
const money = (cents: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);

function ChecklistCard({ item, onOpen }: { item: ChecklistItem; onOpen: (view: View) => void }) {
  return <button type="button" onClick={() => item.run ? item.run() : item.view && onOpen(item.view)} className="rounded-xl border border-gray-200 bg-white p-3 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-900">{item.title}</h2><p className="mt-1 text-sm text-gray-500">{item.description}</p><p className="mt-1.5 text-xs text-gray-500"><span className="font-semibold text-gray-600">Example: </span>{item.example}</p></div>{item.count !== undefined && <span className={`min-w-9 rounded-full px-2.5 py-1 text-center text-sm font-bold ${item.tone}`}>{item.count}</span>}</div><div className="mt-3 text-sm font-semibold text-brand-700">{item.action} →</div></button>;
}

function Summary({ title, value, detail, tone, onClick }: { title: string; value: string; detail: string; tone: 'red' | 'sky' | 'rose' | 'amber'; onClick: () => void }) {
  const styles = { red: 'border-red-200 bg-red-50 text-red-900', sky: 'border-sky-200 bg-sky-50 text-sky-900', rose: 'border-rose-200 bg-rose-50 text-rose-900', amber: 'border-amber-200 bg-amber-50 text-amber-900' };
  return <button type="button" onClick={onClick} className={`rounded-xl border p-3 text-left ${styles[tone]}`}><div className="text-xs font-semibold uppercase tracking-wide opacity-75">{title}</div><div className="mt-1 text-lg font-bold">{value}</div><div className="text-xs opacity-75">{detail}</div></button>;
}

export function BookkeepingChecklistContent() {
  const setView = useUiStore((s) => s.setView);
  const [summary, setSummary] = useState({ receipts: 0, invoices: 0, invoiceCents: 0, overdueInvoices: 0, overdueInvoiceCents: 0, bills: 0, billCents: 0, overdueBillCents: 0, next30InCents: 0, next30OutCents: 0, drafts: 0 });
  const [overdueRows, setOverdueRows] = useState<(Invoice & { customerName: string; remainingCents: number; daysOverdue: number })[]>([]);
  const [health, setHealth] = useState({ errors: 0, warnings: 0, review: 0 });
  const [recurringDue, setRecurringDue] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([window.api.receiptInbox.list(), window.api.invoices.list(), window.api.bills.list(), window.api.journal.list({ status: 'draft' }), window.api.customers.list(), window.api.accounts.list({}), window.api.journal.list({})]).then(([receipts, invoices, bills, drafts, customers, accounts, allEntries]) => {
      const today = localIsoDate();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() + 30);
      const cutoff = cutoffDate.toISOString().slice(0, 10);
      const openInvoices = invoices.ok ? invoices.data.filter((row) => row.status === 'unpaid') : [];
      const overdueInvoices = openInvoices.filter((row) => row.dueDate < today);
      const customerNames = new Map(customers.ok ? customers.data.map((row) => [row.id, row.name]) : []);
      const openBills = bills.ok ? bills.data.filter((row) => row.status === 'unpaid') : [];
      const remainingInvoice = (row: (typeof openInvoices)[number]) => Math.max(0, row.totalCents - row.paidCents);
      const remainingBill = (row: (typeof openBills)[number]) => Math.max(0, row.amountCents - row.paidCents);
      setSummary({ receipts: receipts.ok ? receipts.data.length : 0, invoices: openInvoices.length, invoiceCents: openInvoices.reduce((sum, row) => sum + remainingInvoice(row), 0), overdueInvoices: overdueInvoices.length, overdueInvoiceCents: overdueInvoices.reduce((sum, row) => sum + remainingInvoice(row), 0), bills: openBills.length, billCents: openBills.reduce((sum, row) => sum + remainingBill(row), 0), overdueBillCents: openBills.filter((row) => row.dueDate < today).reduce((sum, row) => sum + remainingBill(row), 0), next30InCents: openInvoices.filter((row) => row.dueDate >= today && row.dueDate <= cutoff).reduce((sum, row) => sum + remainingInvoice(row), 0), next30OutCents: openBills.filter((row) => row.dueDate >= today && row.dueDate <= cutoff).reduce((sum, row) => sum + remainingBill(row), 0), drafts: drafts.ok ? drafts.data.length : 0 });
      setOverdueRows(overdueInvoices.map((row) => ({ ...row, customerName: customerNames.get(row.customerId) ?? 'Unknown customer', remainingCents: remainingInvoice(row), daysOverdue: Math.max(1, Math.floor((Date.now() - new Date(`${row.dueDate}T00:00:00`).getTime()) / 86_400_000)) })).sort((a, b) => b.daysOverdue - a.daysOverdue));
      if (accounts.ok && allEntries.ok) {
        const auditFindings = runAccountingAudit({ accounts: accounts.data, entries: allEntries.data, todayIso: today });
        const chartIssues = checkChartOfAccounts(accounts.data).issues;
        setHealth({
          errors: auditFindings.filter((row) => row.severity === 'error').length + chartIssues.filter((row) => row.severity === 'error').length,
          warnings: auditFindings.filter((row) => row.severity === 'warning').length + chartIssues.filter((row) => row.severity === 'warning').length,
          review: auditFindings.filter((row) => row.severity === 'info').length,
        });
      }
    }).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const today = localIsoDate();
    window.api.recurringTemplates.list(undefined).then((result) => {
      if (result.ok) setRecurringDue(result.data.filter((template) => template.scheduleFrequency && template.nextDueDate && template.nextDueDate <= today).length);
    });
  }, []);
  async function backupNow() {
    const result = await window.api.company.backup();
    if (!result.ok) return window.alert(result.error);
    if (result.data.saved) window.alert(`Backup saved successfully:\n${result.data.filePath}`);
  }
  const items: ChecklistItem[] = [
    { title: 'Protect the company file', description: 'Automatic backups run daily and on exit, keeping the latest 14 copies. Save an extra copy before major corrections or year-end work.', example: 'Before posting year-end adjustments, click Backup now; a dated copy of the file lands in your backups folder.', run: backupNow, action: 'Backup now', tone: 'bg-emerald-100 text-emerald-800' },
    { title: 'Recurring entries due', description: 'Review repeated rent, insurance, subscriptions, and income before posting them.', example: 'Office rent, $2,000 on the 1st: review the template and post it, and September rent is in the books.', count: recurringDue, view: { kind: 'transactions', tab: 'recurring' }, action: 'Review recurring entries', tone: 'bg-teal-100 text-teal-800' },
    { title: 'Receipts to review', description: 'Turn receipt images and PDFs into properly categorized entries.', example: 'A Staples receipt for $56.50 becomes a $50 Office Supplies expense with $6.50 HST claimed.', count: summary.receipts, view: { kind: 'receiptInbox' }, action: 'Review receipts', tone: 'bg-amber-100 text-amber-800' },
    { title: 'Customer invoices outstanding', description: `${money(summary.invoiceCents)} remains to be collected.`, example: 'Birch & Co. still owes $265 on INV-1003. When the e-transfer arrives, open it and click Receive Payment.', count: summary.invoices, view: { kind: 'invoices' }, action: 'Open invoices', tone: 'bg-sky-100 text-sky-800' },
    { title: 'Vendor bills outstanding', description: `${money(summary.billCents)} remains to be paid.`, example: 'Bell Canada, $459.90 due Oct 4: pay it from the bank before the due date so it does not show as late.', count: summary.bills, view: { kind: 'purchases' }, action: 'Open vendor bills', tone: 'bg-rose-100 text-rose-800' },
    { title: 'Draft journal entries', description: 'Finish incomplete journals before running final reports.', example: 'A draft for September rent, $2,000 Rent against $2,000 Bank: post it so the reports include it.', count: summary.drafts, view: { kind: 'journalList' }, action: 'Review drafts', tone: 'bg-violet-100 text-violet-800' },
    { title: 'Bring in bank activity', description: 'Import the latest bank or credit-card statement and match transactions.', example: 'Import the RBC August CSV: 38 lines match entries already in the books, 4 need a category.', view: { kind: 'banking', tab: 'transactions' }, action: 'Open statement import', tone: 'bg-blue-100 text-blue-800' },
    { title: 'Reconcile accounts', description: 'Compare Apex Ledger with each bank and credit-card statement.', example: 'Statement balance $12,450.10, book balance $12,450.10: difference $0.00, the month is reconciled.', view: { kind: 'banking', tab: 'reconcile' }, action: 'Start reconciliation', tone: 'bg-teal-100 text-teal-800' },
    { title: 'Check GST/HST', description: 'Review tax collected, input tax credits and the amount payable or refundable.', example: 'Collected $5,000, paid $1,500 on purchases: $3,500 to remit for the quarter.', view: { kind: 'hstCentre' }, action: 'Open GST/HST Centre', tone: 'bg-fuchsia-100 text-fuchsia-800' },
    { title: 'Review the books', description: 'Finish with the Income Statement, Balance Sheet and other financial reports.', example: 'The P&L shows August net income of $8,200; the Balance Sheet shows $12,450 in the bank and $6,716 owed by customers.', view: { kind: 'reportsHub' }, action: 'Open reports', tone: 'bg-emerald-100 text-emerald-800' },
  ];
  const projectedNet = summary.next30InCents - summary.next30OutCents;
  return <div className="w-full space-y-3"><div className="rounded-xl border border-brand-200 bg-brand-50 p-3"><div className="text-xs font-bold uppercase tracking-wider text-gold-700">Simple workflow</div><h1 className="mt-1 text-lg font-semibold text-brand-900">Bookkeeping Checklist</h1><p className="mt-2 text-sm text-brand-800">Work from the top down. Every button opens the existing source page where the entry belongs.</p></div>{loading && <div className="text-sm text-gray-500">Checking the company file…</div>}{!loading && <><CompanyHealth health={health} onOpen={() => setView({ kind: 'audit' })}/><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Summary title="Overdue invoices" value={money(summary.overdueInvoiceCents)} detail={`${summary.overdueInvoices} overdue`} tone="red" onClick={() => setView({ kind: 'invoices' })}/><Summary title="Total receivable" value={money(summary.invoiceCents)} detail="Still to collect" tone="sky" onClick={() => setView({ kind: 'invoices' })}/><Summary title="Bills payable" value={money(summary.billCents)} detail="Still to pay" tone="rose" onClick={() => setView({ kind: 'purchases' })}/><Summary title="Receipt backlog" value={String(summary.receipts)} detail="Waiting for review" tone="amber" onClick={() => setView({ kind: 'receiptInbox' })}/></div><div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3"><div className="text-xs font-bold uppercase tracking-wider text-indigo-700">Next 30 days cash outlook</div><div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4"><CashFigure label="Expected in" value={summary.next30InCents}/><CashFigure label="Bills due" value={summary.next30OutCents}/><CashFigure label="Overdue bills" value={summary.overdueBillCents}/><CashFigure label="Projected net" value={projectedNet} emphasize/></div><p className="mt-3 text-xs text-indigo-700">Based on open invoice and bill due dates; it is a planning view, not a bank-balance forecast.</p></div><OverdueFollowup rows={overdueRows} onOpen={(id) => setView({ kind: 'invoiceEditor', id })}/></>}<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{items.map((item) => <ChecklistCard key={item.title} item={item} onOpen={setView} />)}</div></div>;
}

function CompanyHealth({ health, onOpen }: { health: { errors: number; warnings: number; review: number }; onOpen: () => void }) {
  const clean = health.errors === 0 && health.warnings === 0 && health.review === 0;
  return <div className={`rounded-xl border p-3 ${clean ? 'border-emerald-200 bg-emerald-50' : health.errors > 0 ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-brand-700">Company health check</div><h2 className="mt-1 font-semibold text-gray-900">{clean ? 'No accounting health issues found' : 'Items need accounting review'}</h2><p className="mt-1 text-sm text-gray-600">Checks postings and the Chart of Accounts using the existing Accounting Audit rules.</p></div><button type="button" onClick={onOpen} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm hover:bg-brand-50">Open detailed audit →</button></div><div className="mt-3 grid grid-cols-3 gap-3"><HealthCount label="Errors" count={health.errors} tone="red"/><HealthCount label="Warnings" count={health.warnings} tone="amber"/><HealthCount label="To review" count={health.review} tone="sky"/></div></div>;
}

function HealthCount({ label, count, tone }: { label: string; count: number; tone: 'red' | 'amber' | 'sky' }) {
  const styles = { red: 'bg-red-100 text-red-800', amber: 'bg-amber-100 text-amber-800', sky: 'bg-sky-100 text-sky-800' };
  return <div className={`rounded-lg p-3 text-center ${styles[tone]}`}><div className="text-lg font-bold">{count}</div><div className="text-xs font-semibold">{label}</div></div>;
}

function OverdueFollowup({ rows, onOpen }: { rows: (Invoice & { customerName: string; remainingCents: number; daysOverdue: number })[]; onOpen: (id: number) => void }) {
  return <div className="rounded-xl border border-red-200 bg-white p-3"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-red-700">Overdue customer follow-up</div><h2 className="mt-1 font-semibold text-gray-900">Review before sending a reminder</h2></div><span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">{rows.length} overdue</span></div>{rows.length === 0 ? <p className="mt-3 text-sm text-emerald-700">No overdue customer invoices.</p> : <div className="mt-3 divide-y divide-gray-100">{rows.slice(0, 8).map((row) => <button key={row.id} type="button" onClick={() => onOpen(row.id)} className="grid w-full grid-cols-[1fr_auto] gap-3 py-2 text-left hover:bg-red-50"><div className="min-w-0"><div className="truncate font-medium text-gray-900">{row.customerName} · {row.invoiceNumber}</div><div className="text-xs text-gray-500">Due {row.dueDate} · {row.daysOverdue} days overdue</div></div><div className="text-right"><div className="font-mono font-bold text-red-800">{money(row.remainingCents)}</div><div className="text-xs text-brand-700">Open invoice →</div></div></button>)}</div>}<p className="mt-3 text-xs text-gray-500">Opening the invoice lets you confirm the balance and customer email before using its existing email action.</p></div>;
}

function CashFigure({ label, value, emphasize = false }: { label: string; value: number; emphasize?: boolean }) {
  return <div className={`rounded-lg bg-white p-3 ${emphasize ? 'ring-2 ring-indigo-300' : 'border border-indigo-100'}`}><div className="text-xs text-indigo-600">{label}</div><div className={`mt-1 font-mono text-lg font-bold ${value < 0 ? 'text-red-700' : 'text-indigo-900'}`}>{money(value)}</div></div>;
}

export function BookkeepingChecklistPage() {
  return <div className="space-y-3"><BackupRecoveryPanel/><BookkeepingChecklistContent/></div>;
}
