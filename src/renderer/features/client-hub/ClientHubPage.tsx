import { clientsSharingAFile, companyFileName, isBookkeepingClient } from '@shared/domain/clients/bookkeepingClients';
import { useEffect, useMemo, useState } from 'react';
import type { AppointmentRecord, ClientGender, ClientRecord, ReminderRecord } from '@shared/domain/types';
import { colorForDueDate, computeAllDeadlines, type ComputedDeadline, type DeadlineColor } from '@shared/domain/reminders/computeDeadlines';
import { ClientFormModal } from './ClientFormModal';
import { ReminderFormModal } from './ReminderFormModal';
import { AppointmentFormModal } from '../calendar/AppointmentFormModal';
import { clientMatchesSearch } from './clientSearch';
import { URGENCY_CHIP, URGENCY_LABEL } from '../calendar/urgencyColors';
import { toTelUrl, toWhatsAppUrl } from '../../utils/phone';
import { IconWhatsApp } from '../../components/icons';
import { useUiStore } from '../../app/store/uiStore';
import { confirmDialog } from '../../app/store/confirmStore';
import { localIsoDate } from '@shared/domain/dates/localDate';

function today(): string {
  return localIsoDate();
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function dueLabel(dueDate: string): string {
  const days = daysBetween(today(), dueDate);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  return `Due in ${days} day${days === 1 ? '' : 's'}`;
}

const COLOR_CLASSES: Record<DeadlineColor, string> = {
  red: 'border-red-300 bg-red-50 text-red-700',
  amber: 'border-amber-300 bg-amber-50 text-amber-700',
  green: 'border-green-300 bg-green-50 text-green-700',
};

const DOT_CLASSES: Record<DeadlineColor, string> = {
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  green: 'bg-green-500',
};

// Purely a visual recognition aid on the client list — never used for anything filing-related.
const GENDER_ROW_CLASSES: Record<ClientGender, string> = {
  Male: 'border-l-4 border-l-sky-400 bg-sky-50/40',
  Female: 'border-l-4 border-l-rose-400 bg-rose-50/40',
  Other: 'border-l-4 border-l-violet-400 bg-violet-50/40',
  Unspecified: 'border-l-4 border-l-transparent',
};
const GENDER_DOT_CLASSES: Record<ClientGender, string> = {
  Male: 'bg-sky-400',
  Female: 'bg-rose-400',
  Other: 'bg-violet-400',
  Unspecified: 'bg-gray-300',
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const SIGN_OFF = 'Warm regards,';

function renewalReminderMessage(client: ClientRecord): string {
  const products = client.insuranceTypes.join(' / ') || 'insurance';
  const expiry = client.policyExpiryDate ? formatDate(client.policyExpiryDate) : 'in the near future';
  return `Dear ${client.clientName},\n\nWe hope you're doing well. This is a friendly reminder that your ${products} policy is set to expire on ${expiry}. Your protection means a great deal to us, and we'd love the chance to help you renew so there's never a gap in your coverage.\n\nPlease reach out whenever it's convenient for you — we're always happy to help.\n\n${SIGN_OFF}`;
}

function thankYouMessage(client: ClientRecord): string {
  const products = client.insuranceTypes.join(' / ') || 'insurance';
  return `Dear ${client.clientName},\n\nThank you, from all of us, for placing your trust in us for your ${products}. Relationships like ours with you are what make this work meaningful, and we're truly grateful to have you with us.\n\nIf there's ever anything you need, please don't hesitate to reach out — we're always here for you.\n\n${SIGN_OFF}`;
}

function birthdayMessage(client: ClientRecord): string {
  return `Dear ${client.clientName},\n\nOn your special day, we just wanted to pause and say how much you mean to us. Wishing you a birthday filled with love, laughter, and every happiness — and a year ahead as wonderful as you are.\n\nThank you for being part of our family. 🎉\n\n${SIGN_OFF}`;
}

/** WhatsApp if the client has a phone (matches this app's other "message the client" actions),
 * falling back to a pre-filled email when only an email address is on file. */
function sendClientMessage(client: ClientRecord, message: string): void {
  if (client.phone) {
    window.open(toWhatsAppUrl(client.phone, message), '_blank');
  } else if (client.email) {
    window.location.href = `mailto:${client.email}?subject=${encodeURIComponent('A note from us')}&body=${encodeURIComponent(message)}`;
  }
}

interface DeadlineRow extends ComputedDeadline {
  clientName: string;
  clientId: string;
}

function deadlineKey(row: DeadlineRow): string {
  return `${row.clientId}::${row.category}::${row.dueDate}`;
}

type DueFilter = 'all' | DeadlineColor | '7' | '15';

const DUE_FILTERS: { id: DueFilter; label: string; dotClass?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'red', label: 'Due Soon / Overdue', dotClass: 'bg-red-500' },
  { id: 'amber', label: 'Within a Month', dotClass: 'bg-amber-500' },
  { id: 'green', label: 'On Track', dotClass: 'bg-green-500' },
  { id: '7', label: '7 Days' },
  { id: '15', label: '15 Days' },
];

const INSURANCE_BADGE_CLASSES: Record<string, string> = {
  Life: 'bg-emerald-100 text-emerald-700',
  'Critical Illness': 'bg-rose-100 text-rose-700',
  Disability: 'bg-amber-100 text-amber-700',
  'Super Visa': 'bg-sky-100 text-sky-700',
  'Visitor Insurance': 'bg-cyan-100 text-cyan-700',
  RRSP: 'bg-violet-100 text-violet-700',
  TFSA: 'bg-indigo-100 text-indigo-700',
  FHSA: 'bg-fuchsia-100 text-fuchsia-700',
  RESP: 'bg-lime-100 text-lime-700',
};

export function ClientHubPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientTab, setClientTab] = useState<'all' | 'insurance'>('all');
  const [showAllReminders, setShowAllReminders] = useState(false);
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [deadlinesCollapsed, setDeadlinesCollapsed] = useState(false);
  const [informedKeys, setInformedKeys] = useState<Set<string>>(new Set());
  const [showInformed, setShowInformed] = useState(false);
  /** Which client's books are being opened, so the row can say so rather than appearing dead. */
  const [openingBooksFor, setOpeningBooksFor] = useState<string | null>(null);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [exportingSheet, setExportingSheet] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentRecord | null>(null);
  const [showAllAppointments, setShowAllAppointments] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const setCompany = useUiStore((s) => s.setCompany);
  const setView = useUiStore((s) => s.setView);
  const pendingSearchTerm = useUiStore((s) => s.pendingSearchTerm);
  const setPendingSearchTerm = useUiStore((s) => s.setPendingSearchTerm);

  // Quick Search (header) can deep-link here with a client name already typed — picked up once,
  // then cleared so it doesn't reapply on a later visit to this page.
  useEffect(() => {
    if (!pendingSearchTerm) return;
    setClientSearch(pendingSearchTerm);
    setPendingSearchTerm(null);
  }, [pendingSearchTerm, setPendingSearchTerm]);

  async function refresh() {
    setLoading(true);
    const [clientsResult, remindersResult, acksResult, appointmentsResult] = await Promise.all([
      window.api.clients.list(),
      window.api.reminders.list(),
      window.api.deadlineAcks.list(),
      window.api.appointments.list(),
    ]);
    if (clientsResult.ok) setClients(clientsResult.data);
    if (remindersResult.ok) setReminders(remindersResult.data);
    if (acksResult.ok) setInformedKeys(new Set(acksResult.data));
    if (appointmentsResult.ok) setAppointments(appointmentsResult.data);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const deadlineRows: DeadlineRow[] = useMemo(() => {
    const ref = today();
    const rows = clients.flatMap((client) =>
      computeAllDeadlines(
        { fiscalYearEndMonth: client.fiscalYearEndMonth, fiscalYearEndDay: client.fiscalYearEndDay, hstFilingFrequency: client.hstFilingFrequency },
        ref
      ).map((d) => ({ ...d, clientName: client.clientName, clientId: client.id }))
    );
    return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [clients]);

  const visibleDeadlineRows = useMemo(() => {
    // Once the client's been told about a deadline, it's clutter in the "what still needs
    // communicating" view — filtered out by default, but never deleted; "Show informed" below
    // brings them back for a quick double-check.
    const notYetInformed = showInformed ? deadlineRows : deadlineRows.filter((row) => !informedKeys.has(deadlineKey(row)));
    if (dueFilter === 'all') return notYetInformed;
    if (dueFilter === '7' || dueFilter === '15') {
      const days = dueFilter === '7' ? 7 : 15;
      return notYetInformed.filter((row) => daysBetween(today(), row.dueDate) <= days);
    }
    return notYetInformed.filter((row) => row.color === dueFilter);
  }, [deadlineRows, dueFilter, informedKeys, showInformed]);

  async function toggleInformed(row: DeadlineRow) {
    const key = deadlineKey(row);
    const nextInformed = !informedKeys.has(key);
    const result = await window.api.deadlineAcks.setInformed({ key, informed: nextInformed });
    if (!result.ok) return;
    setInformedKeys((prev) => {
      const next = new Set(prev);
      if (nextInformed) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function handleExportSheet() {
    setExportingSheet(true);
    setExportMessage(null);
    const result = await window.api.clients.exportSheet();
    setExportingSheet(false);
    if (!result.ok) return setExportMessage(`Export failed: ${result.error}`);
    if (!result.data.saved) return;
    setExportMessage(`Exported ${result.data.clientCount} client${result.data.clientCount === 1 ? '' : 's'} to ${result.data.filePath}.`);
  }

  async function handleExportPdf() {
    setExportingSheet(true);
    setExportMessage(null);
    const result = await window.api.clients.exportPdf();
    setExportingSheet(false);
    if (!result.ok) return setExportMessage(`Export failed: ${result.error}`);
    if (!result.data.saved) return;
    setExportMessage(`Exported ${result.data.clientCount} client${result.data.clientCount === 1 ? '' : 's'} to ${result.data.filePath}.`);
  }

  async function handleImportCsv() {
    setExportingSheet(true);
    setExportMessage(null);
    const result = await window.api.clients.importCsv();
    setExportingSheet(false);
    if (!result.ok) return setExportMessage(`Import failed: ${result.error}`);
    if (!result.data.imported) return;
    setExportMessage(
      `Imported ${result.data.importedCount} client${result.data.importedCount === 1 ? '' : 's'}` +
        (result.data.skippedCount > 0 ? ` — skipped ${result.data.skippedCount} row(s) with no name.` : '.') +
        ' Fiscal year-end and HST frequency were set to defaults (Dec 31 / None) — review each imported client and correct if needed.',
    );
    refresh();
  }

  const clientNameById = useMemo(() => new Map(clients.map((c) => [c.id, c.clientName])), [clients]);
  const insuranceClientCount = useMemo(() => clients.filter((c) => c.insuranceTypes.length > 0).length, [clients]);
  const tabFilteredClients = clientTab === 'insurance' ? clients.filter((c) => c.insuranceTypes.length > 0) : clients;
  const searchTerm = clientSearch.trim().toLowerCase();
  const visibleClients = searchTerm
    ? tabFilteredClients.filter((client) => clientMatchesSearch(client, searchTerm, reminders, appointments))
    : tabFilteredClients;

  const allActiveReminders = reminders.filter((r) => !r.completed).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  // Default view: only reminders due within the next two weeks (overdue ones still show — a
  // negative day count is still <= 14) so the list stays short and actionable instead of a
  // growing wall of everything ever added. "Show all" reveals the rest on demand.
  const activeReminders = showAllReminders ? allActiveReminders : allActiveReminders.filter((r) => daysBetween(today(), r.dueDate) <= 14);
  const hiddenReminderCount = allActiveReminders.length - activeReminders.length;
  const completedReminders = reminders.filter((r) => r.completed);

  async function toggleReminder(reminder: ReminderRecord) {
    await window.api.reminders.save({ ...reminder, completed: !reminder.completed });
    refresh();
  }

  async function removeReminder(id: string) {
    if (!(await confirmDialog('Delete this reminder? This cannot be undone.'))) return;
    await window.api.reminders.delete(id);
    refresh();
  }

  const allUpcomingAppointments = appointments.filter((a) => !a.completed).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  // Same "due within 2 weeks by default" pattern as Custom Reminders above.
  const upcomingAppointments = showAllAppointments ? allUpcomingAppointments : allUpcomingAppointments.filter((a) => daysBetween(today(), a.date) <= 14);
  const hiddenAppointmentCount = allUpcomingAppointments.length - upcomingAppointments.length;

  async function toggleAppointmentCompleted(appointment: AppointmentRecord) {
    await window.api.appointments.save({ ...appointment, completed: !appointment.completed });
    refresh();
  }

  async function removeAppointment(id: string) {
    if (!(await confirmDialog('Delete this appointment? This cannot be undone.'))) return;
    await window.api.appointments.delete(id);
    refresh();
  }

  async function removeClient(id: string) {
    if (
      !(await confirmDialog(
        'Permanently delete this client’s data (contact info, insurance details, comments, reminders link)? This cannot be undone. It does not touch their company file or journal entries.',
      ))
    )
      return;
    await window.api.clients.delete(id);
    refresh();
  }

  /** Opens a client's books.
   *
   * The path has been stored on the client record all along and never did anything — it was printed
   * on screen and that was the whole of the link. Opening it is what makes a bookkeeping client a
   * bookkeeping client.
   *
   * A file that has been moved or renamed fails here rather than somewhere deeper, and says which
   * client and which path, because "could not open company file" on its own is not something you
   * can act on. */
  // Two clients pointing at one file means one of them is reading somebody else's books.
  const sharedFileGroups = clientsSharingAFile(clients);

  async function openClientBooks(client: ClientRecord) {
    if (!client.companyFilePath) return;
    setBooksError(null);
    setOpeningBooksFor(client.id);

    const result = await window.api.company.open(client.companyFilePath);
    setOpeningBooksFor(null);

    if (!result.ok) {
      setBooksError(`Could not open ${client.clientName}'s books at ${client.companyFilePath} — ${result.error}`);
      return;
    }
    if (!result.data.opened) {
      // The main process resolved the path but nothing opened, which in practice means the file has
      // been moved, renamed or deleted since it was linked.
      setBooksError(
        `${client.clientName}'s books could not be found at ${client.companyFilePath}. Re-link the file on the client record.`,
      );
      return;
    }

    setCompany(result.data.filePath, result.data.company.legalName);
    setView({ kind: 'dashboard' });
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-brand-900">Client Management (CRM)</h1>

      {booksError && (
        <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{booksError}</div>
      )}

      {sharedFileGroups.length > 0 && (
        <div className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {sharedFileGroups.map((group) => (
            <div key={group.map((c) => c.id).join('-')}>
              {group.map((c) => c.clientName).join(' and ')} are linked to the same company file, so one of them is looking at the
              other&apos;s books. Re-link whichever is wrong on the client record.
            </div>
          ))}
        </div>
      )}
        <p className="mt-1 text-sm text-gray-500">
          Manage client records, communications, documents, insurance products, appointments, and filing reminders in one place. Deadlines
          shown here are general planning estimates — always confirm exact dates with the CRA or each client's Notice of Assessment.
        </p>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setDeadlinesCollapsed((c) => !c)}
            className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-brand-900"
          >
            <span className={`transition-transform ${deadlinesCollapsed ? '-rotate-90' : ''}`}>▾</span>
            Upcoming Deadlines
            {dueFilter !== 'all' && <span className="text-xs font-normal normal-case text-gray-400">({visibleDeadlineRows.length} shown)</span>}
          </button>
        </div>
        {!deadlinesCollapsed && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {DUE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDueFilter(f.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                    dueFilter === f.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.dotClass && <span className={`h-2 w-2 rounded-full ${f.dotClass}`} />}
                  {f.label}
                </button>
              ))}
              <label className="ml-2 flex items-center gap-1.5 text-xs text-gray-500">
                <input type="checkbox" checked={showInformed} onChange={(e) => setShowInformed(e.target.checked)} />
                Show informed
              </label>
            </div>
            {loading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : deadlineRows.length === 0 ? (
              <p className="text-sm text-gray-400">Add a client below to see their computed filing deadlines here.</p>
            ) : visibleDeadlineRows.length === 0 ? (
              <p className="text-sm text-gray-400">No deadlines match this filter.</p>
            ) : (
              <div className="space-y-1.5">
                {visibleDeadlineRows.map((row, i) => {
                  const informed = informedKeys.has(deadlineKey(row));
                  return (
                    <div
                      key={`${row.clientId}-${row.category}-${i}`}
                      className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${COLOR_CLASSES[row.color]}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${DOT_CLASSES[row.color]}`} />
                        <span className="font-medium">{row.clientName}</span>
                        <span className="text-gray-500">—</span>
                        <span>{row.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span>{formatDate(row.dueDate)}</span>
                        <span className="text-xs font-semibold">{dueLabel(row.dueDate)}</span>
                        <button
                          type="button"
                          onClick={() => toggleInformed(row)}
                          title="Has the client been told about this deadline?"
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            informed ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200' : 'bg-gray-50 text-gray-500 ring-1 ring-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {informed ? '✓ Informed' : 'Mark Informed'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setClientTab('all')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                clientTab === 'all' ? 'bg-white text-brand-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              All Clients ({clients.length})
            </button>
            <button
              type="button"
              onClick={() => setClientTab('insurance')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                clientTab === 'insurance' ? 'bg-white text-brand-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Insurance Clients ({insuranceClientCount})
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Search company/name, DOB, phone, SIN or address…"
              title="Search names, contact details, products, documents, notes, comments, reminders, appointments, dates and linked company information"
              className="w-72 rounded-full border border-gray-300 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-sky-400" /> Male
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-400" /> Female
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-violet-400" /> Other
              </span>
            </div>
            <button
              type="button"
              disabled={exportingSheet}
              onClick={handleExportSheet}
              title="Export a basic Name/DOB/Phone/Address/Email/Service sheet for all clients, opens in Excel"
              className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              {exportingSheet ? 'Exporting…' : '⬇ Export Client Sheet'}
            </button>
            <button
              type="button"
              disabled={exportingSheet}
              onClick={handleExportPdf}
              title="Export the same client roster as a printable PDF instead of a spreadsheet"
              className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              {exportingSheet ? 'Exporting…' : '⬇ Export as PDF'}
            </button>
            <button
              type="button"
              disabled={exportingSheet}
              onClick={handleImportCsv}
              title="Import clients from a CSV file (Name, DOB, Phone, Address, Email, Service, Insurance Type columns)"
              className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              ⬆ Import CSV
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingClient(null);
                setShowClientModal(true);
              }}
              className="rounded-full bg-brand-100 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-200"
            >
              + Add Client
            </button>
          </div>
        </div>
        {exportMessage && <p className="mb-3 text-xs text-gray-500">{exportMessage}</p>}
        {visibleClients.length === 0 ? (
          <p className="text-sm text-gray-400">
            {searchTerm
              ? `No clients match "${clientSearch.trim()}".`
              : clientTab === 'insurance'
                ? 'No insurance clients yet — edit a client and set their "Type of Insurance / Product" to list them here.'
                : 'No clients yet. Add your first client to start tracking their deadlines.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-2 pl-2">Client</th>
                <th className="pb-2">Contact</th>
                <th className="pb-2">Insurance / Product</th>
                <th className="pb-2">Policy Expiry</th>
                <th className="pb-2">Last Contact</th>
                <th className="pb-2">Fiscal Year-End</th>
                <th className="pb-2">HST Frequency</th>
                <th className="pb-2">Return</th>
                <th className="pb-2">Outstanding Docs</th>
                <th className="pb-2">Linked Company</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {visibleClients.map((c) => {
                const gender = c.gender ?? 'Unspecified';
                const outstanding = c.outstandingDocuments ?? [];
                const outstandingRemaining = outstanding.filter((d) => !d.received).length;
                const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
                return (
                  <tr key={c.id} className={`border-b border-gray-100 ${GENDER_ROW_CLASSES[gender]}`}>
                    <td className="py-2 pl-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${GENDER_DOT_CLASSES[gender]}`} />
                        <div>
                          <div className="font-medium text-gray-800">{c.clientName}</div>
                          {fullName && <div className="text-xs text-gray-400">{fullName}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 text-gray-600">
                      <div className="flex items-center gap-2">
                        {c.phone && (
                          <>
                            <a href={toTelUrl(c.phone)} className="hover:underline" title={c.phone}>
                              📞
                            </a>
                            <a href={toWhatsAppUrl(c.phone, `Hi ${c.clientName}, `)} target="_blank" rel="noreferrer" className="hover:underline" title="WhatsApp">
                              <IconWhatsApp className="h-4 w-4" />
                            </a>
                          </>
                        )}
                        {c.email && (
                          <a href={`mailto:${c.email}`} className="hover:underline" title={c.email}>
                            ✉️
                          </a>
                        )}
                        {!c.phone && !c.email && '—'}
                      </div>
                    </td>
                    <td className="py-2">
                      {c.insuranceTypes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {c.insuranceTypes.map((t) => (
                            <span key={t} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${INSURANCE_BADGE_CLASSES[t] ?? 'bg-gray-100 text-gray-600'}`}>
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      {c.policyExpiryDate ? (
                        <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${COLOR_CLASSES[colorForDueDate(c.policyExpiryDate, today())]}`}>
                          {formatDate(c.policyExpiryDate)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-2 text-gray-600">
                      {(() => {
                        const latest = [...c.comments].sort((a, b) => b.date.localeCompare(a.date))[0];
                        return latest ? (
                          <span title={latest.text}>{formatDate(latest.date)}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        );
                      })()}
                    </td>
                    <td className="py-2 text-gray-600">
                      {c.fiscalYearEndMonth}/{c.fiscalYearEndDay}
                    </td>
                    <td className="py-2 text-gray-600">{c.hstFilingFrequency}</td>
                    <td className="py-2">
                      {c.returnType ? (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{c.returnType}</span>
                          {c.returnFiled ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">Filed</span>
                          ) : c.returnCompleted ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">Completed</span>
                          ) : (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">In Progress</span>
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 text-gray-600">
                      {outstanding.length === 0 ? '—' : outstandingRemaining === 0 ? <span className="text-green-600">All received</span> : `${outstandingRemaining} pending`}
                    </td>
                    <td className="py-2 truncate">
                      {isBookkeepingClient(c) ? (
                        <button
                          type="button"
                          disabled={openingBooksFor === c.id}
                          onClick={() => void openClientBooks(c)}
                          title={`Open ${c.clientName}'s books`}
                          className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                        >
                          {openingBooksFor === c.id ? 'Opening...' : companyFileName(c.companyFilePath)}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">No books</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {c.insuranceTypes.length > 0 && (c.phone || c.email) && (
                        <>
                          <button
                            type="button"
                            onClick={() => sendClientMessage(c, renewalReminderMessage(c))}
                            title="Send a renewal reminder message"
                            className="mr-2 text-xs font-medium text-amber-600 hover:underline"
                          >
                            🔔 Remind
                          </button>
                          <button
                            type="button"
                            onClick={() => sendClientMessage(c, thankYouMessage(c))}
                            title="Send a thank-you message"
                            className="mr-2 text-xs font-medium text-emerald-600 hover:underline"
                          >
                            🙏 Thanks
                          </button>
                        </>
                      )}
                      {c.dateOfBirth && (c.phone || c.email) && (
                        <button
                          type="button"
                          onClick={() => sendClientMessage(c, birthdayMessage(c))}
                          title="Send a Happy Birthday message"
                          className="mr-2 text-xs font-medium text-fuchsia-600 hover:underline"
                        >
                          🎂 Birthday
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingClient(c);
                          setShowClientModal(true);
                        }}
                        className="mr-2 text-xs font-medium text-brand-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button type="button" onClick={() => removeClient(c.id)} className="text-xs font-medium text-red-500 hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-900">
            Custom Reminders {!showAllReminders && <span className="font-normal normal-case text-gray-400">— due within 2 weeks</span>}
          </h2>
          <div className="flex items-center gap-3">
            {hiddenReminderCount > 0 && !showAllReminders && (
              <button type="button" onClick={() => setShowAllReminders(true)} className="text-xs font-medium text-brand-600 hover:underline">
                Show all ({hiddenReminderCount} more)
              </button>
            )}
            {showAllReminders && (
              <button type="button" onClick={() => setShowAllReminders(false)} className="text-xs font-medium text-brand-600 hover:underline">
                Due soon only
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowReminderModal(true)}
              className="rounded-full bg-gold-100 px-3 py-1.5 text-xs font-medium text-gold-700 hover:bg-gold-200"
            >
              + Add Reminder
            </button>
          </div>
        </div>
        {activeReminders.length === 0 && completedReminders.length === 0 ? (
          <p className="text-sm text-gray-400">No custom reminders yet. Use this for anything not covered by the automatic deadlines above.</p>
        ) : (
          <div className="space-y-1.5">
            {activeReminders.map((r) => (
              <div key={r.id} className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${COLOR_CLASSES[colorForDueDate(r.dueDate, today())]}`}>
                <label className="flex flex-1 items-center gap-2">
                  <input type="checkbox" checked={r.completed} onChange={() => toggleReminder(r)} className="h-4 w-4" />
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${DOT_CLASSES[colorForDueDate(r.dueDate, today())]}`} />
                  <span className="font-medium">{r.title}</span>
                  {r.clientId && clientNameById.get(r.clientId) && <span className="text-xs text-gray-500">({clientNameById.get(r.clientId)})</span>}
                </label>
                <div className="flex items-center gap-3">
                  <span>{formatDate(r.dueDate)}</span>
                  <span className="text-xs font-semibold">{dueLabel(r.dueDate)}</span>
                  <button type="button" onClick={() => removeReminder(r.id)} className="text-xs text-gray-400 hover:text-red-500">
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {completedReminders.length > 0 && (
              <div className="pt-2">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Completed</p>
                {completedReminders.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                    <label className="flex flex-1 items-center gap-2">
                      <input type="checkbox" checked={r.completed} onChange={() => toggleReminder(r)} className="h-4 w-4" />
                      <span className="line-through">{r.title}</span>
                    </label>
                    <button type="button" onClick={() => removeReminder(r.id)} className="text-xs text-gray-400 hover:text-red-500">
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-900">
            Appointments {!showAllAppointments && <span className="font-normal normal-case text-gray-400">— due within 2 weeks</span>}
          </h2>
          <div className="flex items-center gap-3">
            {hiddenAppointmentCount > 0 && !showAllAppointments && (
              <button type="button" onClick={() => setShowAllAppointments(true)} className="text-xs font-medium text-brand-600 hover:underline">
                Show all ({hiddenAppointmentCount} more)
              </button>
            )}
            {showAllAppointments && (
              <button type="button" onClick={() => setShowAllAppointments(false)} className="text-xs font-medium text-brand-600 hover:underline">
                Due soon only
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEditingAppointment(null);
                setShowAppointmentModal(true);
              }}
              className="rounded-full bg-gold-100 px-3 py-1.5 text-xs font-medium text-gold-700 hover:bg-gold-200"
            >
              + Add Appointment
            </button>
          </div>
        </div>
        {upcomingAppointments.length === 0 ? (
          <p className="text-sm text-gray-400">
            {allUpcomingAppointments.length === 0 ? 'No upcoming appointments yet — book client meetings here or on the Calendar page.' : 'No appointments in this range.'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {upcomingAppointments.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${a.urgency === 'urgent' ? 'bg-red-500' : a.urgency === 'normal' ? 'bg-blue-500' : 'bg-green-500'}`} />
                  <span className="font-medium">{a.title}</span>
                  {a.clientId && clientNameById.get(a.clientId) && <span className="text-xs text-gray-500">({clientNameById.get(a.clientId)})</span>}
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${URGENCY_CHIP[a.urgency]}`}>{URGENCY_LABEL[a.urgency]}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-600">
                    {formatDate(a.date)} at {a.time}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAppointment(a);
                      setShowAppointmentModal(true);
                    }}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button type="button" onClick={() => toggleAppointmentCompleted(a)} className="text-xs font-medium text-emerald-600 hover:underline">
                    Complete
                  </button>
                  <button type="button" onClick={() => removeAppointment(a.id)} className="text-xs text-gray-400 hover:text-red-500">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ClientFormModal open={showClientModal} onClose={() => setShowClientModal(false)} onSaved={refresh} editing={editingClient} />
      <ReminderFormModal open={showReminderModal} onClose={() => setShowReminderModal(false)} onSaved={refresh} clients={clients} />
      <AppointmentFormModal
        open={showAppointmentModal}
        onClose={() => setShowAppointmentModal(false)}
        onSaved={refresh}
        editing={editingAppointment}
        defaultDate={today()}
        clients={clients}
      />
    </div>
  );
}
