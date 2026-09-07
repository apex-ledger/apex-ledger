import { useEffect, useMemo, useState } from 'react';
import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AppointmentRecord, ClientRecord, Employee, JournalEntry, PayrollRun, ReminderRecord } from '@shared/domain/types';
import { buildMonthGrid } from '@shared/domain/calendar/buildMonthGrid';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { Money, formatCents } from '../../components/Money';
import { useUiStore } from '../../app/store/uiStore';
import { URGENCY_DOT } from '../calendar/urgencyColors';
import { isBankLikeAccount, isCreditCardLikeAccount } from '../../utils/bankAccounts';
import { craHstAccountNumber } from '@shared/domain/company/craAccountNumber';
import { computeNextPaystubAlert } from '@shared/domain/payroll/computeNextPaystubAlert';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { WhatsNewBanner } from '../whats-new/WhatsNewPage';

/* Light tints so the banking row reads as distinct accounts at a glance rather than a wall of
 * identical white cards. Written out in full for Tailwind's JIT scanner — see Sidebar.tsx. */
const BANKING_TONES = {
  sky: 'border-sky-200 bg-sky-50/70',
  emerald: 'border-emerald-200 bg-emerald-50/70',
  amber: 'border-amber-200 bg-amber-50/70',
  violet: 'border-violet-200 bg-violet-50/70',
  rose: 'border-rose-200 bg-rose-50/70',
  cyan: 'border-cyan-200 bg-cyan-50/70',
  teal: 'border-teal-200 bg-teal-50/70',
} as const;

/**
 * Colours an account by what it actually is, read off its name — chequing blue, savings green, cash
 * amber, cards purple/rose. Matching on the name (rather than the subtype) is deliberate: subtype is
 * a free-text field most files leave blank, so it's the name that reliably says "Visa" or "Savings".
 * Anything unrecognised falls back to teal rather than going colourless.
 */
function bankingTone(name: string, isCard: boolean): keyof typeof BANKING_TONES {
  const n = name.toLowerCase();
  if (/master ?card|mc/.test(n)) return 'rose';
  if (/visa|amex|american express|credit card|card/.test(n) || isCard) return 'violet';
  if (/saving/.test(n)) return 'emerald';
  if (/chequ|check/.test(n)) return 'sky';
  if (/cash|petty/.test(n)) return 'amber';
  if (/paypal|stripe|wise|e-?transfer|undeposited/.test(n)) return 'cyan';
  return 'teal';
}
import {
  IconBank,
  IconBarChart,
  IconBillPlus,
  IconBook,
  IconCamera,
  IconCloudUpload,
  IconDollarCircle,
} from '../../components/icons';

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}
function displayDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}
function quarterBounds(): { start: string; end: string; label: string } {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3);
  const startMonth = quarter * 3;
  const start = localIsoDate(new Date(now.getFullYear(), startMonth, 1));
  return { start, end: todayIso(), label: `Q${quarter + 1} ${now.getFullYear()}` };
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function StatCard({ label, cents, icon, sublabel }: { label: string; cents: number; icon: React.ReactNode; sublabel?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
        <div className="mt-0.5 truncate text-lg font-semibold text-gray-900">
          <Money cents={cents} />
        </div>
        {sublabel && <div className="text-xs text-gray-400">{sublabel}</div>}
      </div>
    </div>
  );
}

/** Same shape as StatCard, but for a plain tally rather than an amount — StatCard runs its value
 * through <Money>, which would render a transaction count as a dollar figure. */
function CountCard({ label, value, icon, sublabel }: { label: string; value: number; icon: React.ReactNode; sublabel?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
        <div className="mt-0.5 truncate text-lg font-semibold text-gray-900 tabular">{value.toLocaleString('en-CA')}</div>
        {sublabel && <div className="text-xs text-gray-400">{sublabel}</div>}
      </div>
    </div>
  );
}

function NotificationRow({ title, detail, actionLabel, onAction, tone }: { title: string; detail: string; actionLabel: string; onAction: () => void; tone: 'amber' | 'blue' | 'green' }) {
  const dot = { amber: 'bg-amber-400', blue: 'bg-blue-400', green: 'bg-green-400' }[tone];
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />
        <div>
          <div className="text-sm font-medium text-gray-800">{title}</div>
          <div className="text-xs text-gray-500">{detail}</div>
        </div>
      </div>
      <button type="button" onClick={onAction} className="flex-shrink-0 text-xs font-medium text-brand-600 hover:underline">
        {actionLabel}
      </button>
    </div>
  );
}

/* One theme for every action on this page. Six buttons in six different colours made the panel read
 * as six unrelated things — colour is reserved here for things that genuinely differ in kind (the
 * banking accounts, the workflow steps), not for buttons sitting in the same list. */
function QuickActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg bg-brand-50 px-3 py-2 text-left text-sm font-semibold text-brand-800 ring-1 ring-brand-100 transition-colors hover:bg-brand-100"
    >
      <span className="flex-shrink-0">{icon}</span>
      {label}
    </button>
  );
}

const MINI_WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function MiniCalendar({ appointments, today, onDayClick }: { appointments: AppointmentRecord[]; today: string; onDayClick: () => void }) {
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const datesWithAppointments = useMemo(() => new Set(appointments.map((a) => a.date)), [appointments]);

  return (
    <div>
      <div className="mb-2 text-center text-xs font-semibold text-brand-900">
        {new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {MINI_WEEKDAY_LABELS.map((d, i) => (
          <div key={i} className="text-[9px] font-semibold text-gray-400">
            {d}
          </div>
        ))}
        {grid.map((date, i) => {
          const isToday = date === today;
          const hasAppointments = date !== null && datesWithAppointments.has(date);
          return (
            <button
              type="button"
              key={i}
              disabled={!date}
              onClick={onDayClick}
              className={`relative flex h-6 items-center justify-center rounded-full text-[10px] ${
                !date ? '' : isToday ? 'bg-brand-300 font-bold text-brand-900' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {date ? Number(date.slice(-2)) : ''}
              {hasAppointments && !isToday && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-gold-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const setView = useUiStore((s) => s.setView);
  const companyLegalName = useUiStore((s) => s.companyLegalName);
  const today = todayIso();
  const yearStart = yearStartIso();
  const quarter = useMemo(() => quarterBounds(), []);
  const { data: balanceSheet } = useIpcQuery(() => window.api.reports.balanceSheet({ asOfDate: today }), [today]);
  const { data: foreignBalances } = useIpcQuery(() => window.api.fx.foreignBalances({}), []);
  const { data: recurringDue } = useIpcQuery(() => window.api.recurringInvoices.due(), []);
  const { data: unbilledTime } = useIpcQuery(() => window.api.timeEntries.unbilled(), []);
  const unbilledTimeCents = (unbilledTime ?? []).reduce((sum, u) => sum + u.amountCents, 0);
  const { data: incomeStatement } = useIpcQuery(
    () => window.api.reports.incomeStatement({ periodStart: yearStart, periodEnd: today }),
    [yearStart, today],
  );
  const { data: hst } = useIpcQuery(() => window.api.reports.hstSummary({ periodStart: quarter.start, periodEnd: quarter.end }), [quarter.start, quarter.end]);
  const { data: projection } = useIpcQuery(() => window.api.reports.projections({ asOfDate: today, monthsOfHistory: 7, monthsToProject: 1 }), [today]);
  const { data: gifi } = useIpcQuery(() => window.api.reports.gifiExport({ periodStart: yearStart, asOfDate: today }), [today]);
  const { data: drafts } = useIpcQuery(() => window.api.journal.list({ status: 'draft' }), []);
  const { data: clients } = useIpcQuery(() => window.api.clients.list(), []);
  const { data: appointments } = useIpcQuery(() => window.api.appointments.list(), []);
  const { data: reminders } = useIpcQuery(() => window.api.reminders.list(), []);
  const { data: dashboardAccounts } = useIpcQuery(() => window.api.accounts.list({ activeOnly: true }), []);
  const { data: company } = useIpcQuery(() => window.api.company.get(), []);
  const { data: payrollEmployees } = useIpcQuery(() => window.api.employees.list(), []);
  const { data: payrollRuns } = useIpcQuery(() => window.api.payrollRuns.list(), []);

  const [allEntries, setAllEntries] = useState<JournalEntry[]>([]);
  useEffect(() => {
    window.api.journal.list({}).then((r) => {
      if (r.ok) setAllEntries(r.data);
    });
  }, []);
  const recentEntries = useMemo(() => allEntries.slice(0, 6), [allEntries]);

  // Void entries are excluded from the headline count — they were reversed out and no longer
  // represent activity — but drafts are called out separately, since an unposted draft is work
  // still owed rather than work done.
  const entryCounts = useMemo(() => {
    const posted = allEntries.filter((e) => e.status === 'posted');
    return {
      posted: posted.length,
      drafts: allEntries.filter((e) => e.status === 'draft').length,
      thisYear: posted.filter((e) => e.entryDate >= yearStart).length,
    };
  }, [allEntries, yearStart]);

  // How many posted transactions touch each account — shown next to its balance in the Bank &
  // Cash Accounts widget below, the same "at a glance" activity signal QuickBooks' dashboard
  // shows per account.
  const transactionCountByAccountId = useMemo(() => {
    const counts = new Map<number, number>();
    for (const entry of allEntries) {
      if (entry.status === 'void') continue;
      const accountIds = new Set(entry.lines.map((l) => l.accountId));
      for (const accountId of accountIds) counts.set(accountId, (counts.get(accountId) ?? 0) + 1);
    }
    return counts;
  }, [allEntries]);

  const cashBalanceCents = balanceSheet?.assets.lines.filter((l) => isBankLikeAccount(l.account)).reduce((s, l) => s + l.amountCents, 0) ?? 0;
  const arCents = balanceSheet?.assets.lines.find((l) => l.account.name === 'Accounts Receivable')?.amountCents ?? 0;
  const apCents = balanceSheet?.liabilities.lines.find((l) => l.account.name === 'Accounts Payable')?.amountCents ?? 0;
  const netIncomeCents = incomeStatement?.netIncomeCents ?? 0;
  const hstPayableCents = hst ? hst.monthly.reduce((s, m) => s + m.netPayableCents, 0) : 0;
  const hstCollectedCents = hst ? hst.monthly.reduce((s, m) => s + m.collectedCents, 0) : 0;
  const hstPaidCents = hst ? hst.monthly.reduce((s, m) => s + m.itcCents, 0) : 0;
  const salesTaxableCents = hst ? hst.byAccount.filter((r) => r.direction === 'collected').reduce((s, r) => s + r.baseAmountCents, 0) : 0;
  const purchasesTaxableCents = hst ? hst.byAccount.filter((r) => r.direction === 'itc').reduce((s, r) => s + r.baseAmountCents, 0) : 0;

  const clientList: ClientRecord[] = clients ?? [];
  const totalClients = clientList.length;
  const newClientsThisMonth = clientList.filter((c) => c.createdAt.slice(0, 7) === today.slice(0, 7)).length;
  const reminderList: ReminderRecord[] = reminders ?? [];
  const remindersDueCount = reminderList.filter((r) => !r.completed && r.dueDate <= today).length;
  const appointmentList: AppointmentRecord[] = appointments ?? [];
  const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const appointmentsThisWeek = appointmentList.filter((a) => !a.completed && a.date >= today && a.date <= weekAhead).length;

  const clientNameById = useMemo(() => new Map(clientList.map((c) => [c.id, c.clientName])), [clientList]);
  const upcomingAppointments = useMemo(
    () =>
      appointmentList
        .filter((a) => !a.completed && a.date >= today)
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
        .slice(0, 5),
    [appointmentList, today],
  );
  const todaysAppointments = useMemo(() => appointmentList.filter((a) => a.date === today).sort((a, b) => a.time.localeCompare(b.time)), [appointmentList, today]);

  // accountSubtype is FREE TEXT (see bankAccounts.ts) — a user can type "Bank", "Chequing", or
  // leave it blank — so matching the exact string 'Cash and Bank' silently hid most real accounts.
  // Credit cards are included too: they're a banking account you reconcile against a statement,
  // which is what this widget is for.
  const bankingAccounts = [
    ...(balanceSheet?.assets.lines ?? []).filter((l) => isBankLikeAccount(l.account)),
    ...(balanceSheet?.liabilities.lines ?? []).filter((l) => isCreditCardLikeAccount(l.account)),
  ];
  const bankAccounts = bankingAccounts;
  const foreignByAccountId = new Map((foreignBalances ?? []).map((b) => [b.accountId, b]));
  const masterAccountIdsWithSubaccounts = new Set(
    (dashboardAccounts ?? []).flatMap((account) => (account.parentId == null ? [] : [account.parentId])),
  );
  const pendingManualHst = hst?.manualReviewLines.filter((l) => l.manualHstCents === null).length ?? 0;
  const unmappedGifi = gifi?.unmappedAccounts.length ?? 0;
  const draftCount = drafts?.length ?? 0;
  const missingHstAccount = company !== undefined && !craHstAccountNumber(company.hstNumber, company.businessNumber);
  const nextPaystub = useMemo(
    () => computeNextPaystubAlert((payrollEmployees ?? []) as Employee[], (payrollRuns ?? []) as PayrollRun[], today),
    [payrollEmployees, payrollRuns, today],
  );
  const nextPaystubTitle = nextPaystub
    ? nextPaystub.daysUntilDue < 0
      ? 'Paystub Overdue'
      : nextPaystub.daysUntilDue === 0
        ? 'Paystub Due Today'
        : 'Next Paystub Due'
    : '';
  const nextPaystubDetail = nextPaystub
    ? nextPaystub.draftRunId !== null
      ? `${nextPaystub.employeeName}'s draft for ${nextPaystub.payPeriodStart}–${nextPaystub.payPeriodEnd} was due ${displayDate(nextPaystub.payDate)}. Post it to create the paystub.`
      : `${nextPaystub.employeeName}${nextPaystub.employeesDueOnDate > 1 ? ` and ${nextPaystub.employeesDueOnDate - 1} other employee${nextPaystub.employeesDueOnDate === 2 ? '' : 's'}` : ''}: period ${nextPaystub.payPeriodStart}–${nextPaystub.payPeriodEnd}; pay date ${displayDate(nextPaystub.payDate)}.`
    : '';

  return (
    <div className="relative">
      <WhatsNewBanner onOpen={() => setView({ kind: 'whatsNew' })} />
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {greeting()}, Administrator!
          </h2>
          <p className="text-sm text-gray-500">Here's what's happening with {companyLegalName ?? 'your business'} today.</p>
        </div>
        <div className="text-sm text-gray-500">
          {new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {bankingAccounts.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-600">Banking accounts</h2>
            <span className="text-xs text-gray-400">{bankingAccounts.length} accounts</span>
          </div>
          {/* Six compact columns at desktop size keep the normal bank/card set on one row. More
              accounts continue onto additional rows instead of being hidden or truncated. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {bankingAccounts.map((line) => {
              const count = transactionCountByAccountId.get(line.account.id) ?? 0;
              const isCard = line.account.accountType === 'Liability';
              return (
                <button
                  key={line.account.id}
                  type="button"
                  onClick={() => setView({ kind: 'report', report: 'generalLedger' })}
                  className={`min-w-0 rounded-xl2 border p-2.5 text-left shadow-soft duration-250 ease-standard hover:-translate-y-0.5 hover:shadow-lift ${
                    BANKING_TONES[bankingTone(line.account.name, isCard)]
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <IconBank className="flex-shrink-0 text-brand-500" />
                    <span className={`truncate text-sm text-gray-800 ${masterAccountIdsWithSubaccounts.has(line.account.id) ? 'font-bold' : 'font-medium'}`}>{line.account.name}</span>
                  </div>
                  <div className="mt-1 truncate text-base font-semibold text-gray-900 xl:text-lg">
                    <Money cents={line.amountCents} />
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-gray-400" title={`${count.toLocaleString('en-CA')} transaction${count === 1 ? '' : 's'}${isCard ? ' · credit card' : ''}`}>
                    {line.account.accountNumber ? `${line.account.accountNumber} · ` : ''}{count.toLocaleString('en-CA')} transaction{count === 1 ? '' : 's'}
                    {isCard ? ' · credit card' : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Cash Balance" cents={cashBalanceCents} icon={<IconDollarCircle />} />
        <StatCard label="Accounts Receivable" cents={arCents} icon={<IconBillPlus />} />
        <StatCard label="Accounts Payable" cents={apCents} icon={<IconBillPlus />} />
        <StatCard label="Net Income (YTD)" cents={netIncomeCents} icon={<IconBarChart />} />
        <StatCard label="GST/HST Payable" cents={hstPayableCents} icon={<IconCloudUpload />} sublabel={quarter.label} />
        <CountCard
          label="Total Transactions"
          value={entryCounts.posted}
          icon={<IconBarChart />}
          sublabel={`${entryCounts.thisYear.toLocaleString('en-CA')} this year${entryCounts.drafts > 0 ? ` · ${entryCounts.drafts} draft` : ''}`}
        />
      </div>

      <div className="mt-3 flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-3 lg:col-span-2">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Cash Flow Overview</h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={projection?.history ?? []} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => `$${Math.round(v / 100000)}k`} tick={{ fontSize: 12 }} width={48} />
                <Tooltip formatter={(value) => formatCents(Number(value))} />
                <Legend />
                <Line type="monotone" dataKey="revenueCents" name="Income" stroke="#217d48" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="expenseCents" name="Expenses" stroke="#c98f1f" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="netIncomeCents" name="Net Cash Flow" stroke="#15422b" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Today's Tasks</h3>
          <div className="divide-y divide-gray-100">
            {missingHstAccount && (
              <NotificationRow
                tone="amber"
                title="GST/HST Account Number Missing"
                detail="Add the complete CRA RT program account before filing a sales tax return."
                actionLabel="Add now"
                onAction={() => setView({ kind: 'companySettings' })}
              />
            )}
            {pendingManualHst > 0 && (
              <NotificationRow
                tone="amber"
                title="HST amount missing"
                detail={`${pendingManualHst} entr${pendingManualHst === 1 ? 'y' : 'ies'} saved with the Custom rate tax code and no HST amount. Open each entry and type the HST from the receipt in its Tax Amt box.`}
                actionLabel="Open journal entries"
                onAction={() => setView({ kind: 'journalList' })}
              />
            )}
            {unmappedGifi > 0 && (
              <NotificationRow
                tone="amber"
                title="Unmapped GIFI Accounts"
                detail={`${unmappedGifi} account${unmappedGifi === 1 ? '' : 's'} with activity have no GIFI code assigned.`}
                actionLabel="Review now"
                onAction={() => setView({ kind: 'report', report: 'gifiExport' })}
              />
            )}
            {unbilledTimeCents > 0 && (
              <NotificationRow
                tone="blue"
                title="Unbilled Time"
                detail={`$${(unbilledTimeCents / 100).toFixed(2)} of billable hours across ${unbilledTime!.length} client${unbilledTime!.length === 1 ? '' : 's'} not yet invoiced.`}
                actionLabel="Invoice"
                onAction={() => setView({ kind: 'sales', tab: 'time' })}
              />
            )}
            {(recurringDue?.length ?? 0) > 0 && (
              <NotificationRow
                tone="blue"
                title="Recurring Invoices Due"
                detail={`${recurringDue!.length} recurring invoice${recurringDue!.length === 1 ? ' is' : 's are'} due to be created.`}
                actionLabel="Generate"
                onAction={() => setView({ kind: 'sales', tab: 'recurring' })}
              />
            )}
            {draftCount > 0 && (
              <NotificationRow
                tone="blue"
                title="Draft Journal Entries"
                detail={`${draftCount} entr${draftCount === 1 ? 'y is' : 'ies are'} saved but not posted.`}
                actionLabel="Review now"
                onAction={() => setView({ kind: 'journalList' })}
              />
            )}
            {nextPaystub && (
              <NotificationRow
                tone={nextPaystub.daysUntilDue <= 0 ? 'amber' : nextPaystub.daysUntilDue <= 7 ? 'blue' : 'green'}
                title={nextPaystubTitle}
                detail={nextPaystubDetail}
                actionLabel={nextPaystub.draftRunId !== null ? 'Post payroll' : 'Open Payroll'}
                onAction={() => setView({ kind: 'payroll' })}
              />
            )}
            {apCents > 0 && (
              <NotificationRow
                tone="blue"
                title="Accounts Payable Balance"
                detail={`You owe ${formatCents(apCents)} on Accounts Payable.`}
                actionLabel="View"
                onAction={() => setView({ kind: 'report', report: 'balanceSheet' })}
              />
            )}
            {balanceSheet && !balanceSheet.isBalanced && (
              <NotificationRow tone="amber" title="Balance Sheet Out of Balance" detail="Assets do not equal Liabilities + Equity — investigate." actionLabel="Review now" onAction={() => setView({ kind: 'report', report: 'balanceSheet' })} />
            )}
            {!missingHstAccount && pendingManualHst === 0 && unmappedGifi === 0 && draftCount === 0 && apCents === 0 && !nextPaystub && (
              <p className="py-4 text-center text-sm text-gray-400">Nothing needs your attention right now.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Upcoming Calendar</h3>
            <button type="button" onClick={() => setView({ kind: 'calendar' })} className="text-xs font-medium text-brand-600 hover:underline">
              View Calendar
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {upcomingAppointments.length === 0 && <p className="py-4 text-center text-sm text-gray-400">No upcoming appointments.</p>}
            {upcomingAppointments.map((a) => (
              <div key={a.id} className="flex items-start gap-2 py-2">
                <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${URGENCY_DOT[a.urgency]}`} />
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-gray-800">{a.title}</div>
                  <div className="text-[11px] text-gray-500">
                    {a.date === today ? 'Today' : a.date} · {a.time}
                    {a.clientId && clientNameById.get(a.clientId) ? ` · ${clientNameById.get(a.clientId)}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-3 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Recent Transactions</h3>
            <button type="button" onClick={() => setView({ kind: 'journalList' })} className="text-xs font-medium text-brand-600 hover:underline">
              View All
            </button>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="pb-2 pr-3 font-medium">Date</th>
                <th className="pb-2 pr-3 font-medium">Reference</th>
                <th className="pb-2 pr-3 font-medium">Memo</th>
                <th className="pb-2 pr-3 text-right font-medium">Amount</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentEntries.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-400">
                    No transactions yet.
                  </td>
                </tr>
              )}
              {recentEntries.map((entry) => {
                const statusStyle =
                  entry.status === 'posted' ? 'bg-green-100 text-green-800 ring-1 ring-green-200' : entry.status === 'void' ? 'bg-gray-200 text-gray-600' : 'bg-amber-100 text-amber-800 ring-1 ring-amber-200';
                return (
                  <tr key={entry.id} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => setView({ kind: 'journalForm', id: entry.id })}>
                    <td className="py-1.5 pr-3 tabular-nums">{entry.entryDate}</td>
                    <td className="py-1.5 pr-3">{entry.reference ?? '—'}</td>
                    <td className="py-1.5 pr-3">{entry.memo ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-right">
                      <Money cents={entry.lines.reduce((s, l) => s + l.debitCents, 0)} />
                    </td>
                    <td className="py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${statusStyle}`}>{entry.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Bank &amp; Cash Accounts</h3>
            <button type="button" onClick={() => setView({ kind: 'chartOfAccounts' })} className="text-xs font-medium text-brand-600 hover:underline">
              View All
            </button>
          </div>
          <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto pr-1">
            {bankAccounts.length === 0 && <p className="py-4 text-center text-sm text-gray-400">No bank/cash accounts tagged yet.</p>}
            {bankAccounts.map((line) => {
              const transactionCount = transactionCountByAccountId.get(line.account.id) ?? 0;
              return (
                <div key={line.account.id} className="flex items-center gap-2 py-2">
                  <IconBank className="flex-shrink-0 text-brand-500" />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm text-gray-800 ${masterAccountIdsWithSubaccounts.has(line.account.id) ? 'font-bold' : 'font-medium'}`}>{line.account.name}</div>
                    <div className="text-[11px] text-gray-400">
                      {transactionCount} transaction{transactionCount === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold text-gray-900">
                    <Money cents={line.amountCents} />
                    {foreignByAccountId.has(line.account.id) && (
                      <div className="text-[11px] font-medium text-sky-700" title="Balance in the account's own currency">{foreignByAccountId.get(line.account.id)!.currency} {(foreignByAccountId.get(line.account.id)!.foreignCents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-white p-3 lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">GST/HST Centre Quick Summary ({quarter.label})</h3>
            <button type="button" onClick={() => setView({ kind: 'hstCentre' })} className="text-xs font-medium text-brand-600 hover:underline">
              View GST/HST Centre
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div>
              <div className="text-[11px] uppercase text-gray-400">Sales (Taxable)</div>
              <div className="mt-0.5 text-sm font-semibold text-gray-900">
                <Money cents={salesTaxableCents} />
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-gray-400">Purchases (Taxable)</div>
              <div className="mt-0.5 text-sm font-semibold text-gray-900">
                <Money cents={purchasesTaxableCents} />
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-gray-400">HST Collected</div>
              <div className="mt-0.5 text-sm font-semibold text-gray-900">
                <Money cents={hstCollectedCents} />
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-gray-400">HST Paid</div>
              <div className="mt-0.5 text-sm font-semibold text-gray-900">
                <Money cents={hstPaidCents} />
              </div>
            </div>
            <div className="rounded bg-gold-50 px-2 py-1">
              <div className="text-[11px] uppercase text-gold-700">HST Payable</div>
              <div className="mt-0.5 text-sm font-semibold text-gold-800">
                <Money cents={hstPayableCents} />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-3 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Clients At A Glance</h3>
            <button type="button" onClick={() => setView({ kind: 'clientHub' })} className="text-xs font-medium text-brand-600 hover:underline">
              View Clients
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] uppercase text-gray-400">Total Clients</div>
              <div className="mt-0.5 text-lg font-semibold text-gray-900">{totalClients}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-gray-400">New This Month</div>
              <div className="mt-0.5 text-lg font-semibold text-gray-900">{newClientsThisMonth}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-gray-400">Reminders Due</div>
              <div className="mt-0.5 text-lg font-semibold text-gray-900">{remindersDueCount}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-gray-400">Appts This Week</div>
              <div className="mt-0.5 text-lg font-semibold text-gray-900">{appointmentsThisWeek}</div>
            </div>
          </div>
        </div>
      </div>
        </div>

        <div className="w-72 flex-shrink-0 space-y-3">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Quick Actions</h3>
            <div className="space-y-1.5">
              <QuickActionButton icon={<IconBillPlus />} label="Create Invoice" onClick={() => setView({ kind: 'invoiceEditor', id: 'new' })} />
              <QuickActionButton icon={<IconBank />} label="Pay Bill" onClick={() => setView({ kind: 'purchases' })} />
              <QuickActionButton icon={<IconDollarCircle />} label="Record Expense" onClick={() => setView({ kind: 'quickEntry', type: 'expense' })} />
              <QuickActionButton icon={<IconBank />} label="Import Bank" onClick={() => setView({ kind: 'bankImport' })} />
              <QuickActionButton icon={<IconCamera />} label="Scan Receipt" onClick={() => setView({ kind: 'receiptInbox' })} />
              <QuickActionButton icon={<IconBook />} label="Create Journal" onClick={() => setView({ kind: 'journalForm', id: 'new' })} />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <MiniCalendar appointments={appointmentList} today={today} onDayClick={() => setView({ kind: 'calendar' })} />
            <div className="mt-3 border-t border-gray-100 pt-2">
              <div className="mb-1 text-xs font-semibold text-gray-700">Today's Events</div>
              {todaysAppointments.length === 0 && <p className="text-xs text-gray-400">Nothing scheduled today.</p>}
              {todaysAppointments.map((a) => (
                <div key={a.id} className="flex items-center gap-1.5 py-0.5 text-xs text-gray-600">
                  <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${URGENCY_DOT[a.urgency]}`} />
                  <span className="truncate">{a.title}</span>
                  <span className="ml-auto flex-shrink-0 text-gray-400">{a.time}</span>
                </div>
              ))}
              <button type="button" onClick={() => setView({ kind: 'calendar' })} className="mt-2 text-xs font-medium text-brand-600 hover:underline">
                View Full Calendar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
