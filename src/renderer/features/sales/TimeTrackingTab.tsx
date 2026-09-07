import { useEffect, useMemo, useState } from 'react';
import type { Contact, Employee } from '@shared/domain/types';
import type { TimeEntryRow } from '../../../main/ipc/timeEntries.handlers';
import type { UnbilledSummary } from '@shared/domain/sales/timeTracking';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { Money } from '../../components/Money';
import { Combobox } from '../../components/Combobox';
import { CurrencyInput } from '../../components/CurrencyInput';
import { EnteredTd, EnteredTh } from '../../components/EnteredCell';
import { useUiStore } from '../../app/store/uiStore';

/** Billable hours by client. A one-row entry bar at the top (date, client, who, hours, rate,
 * what), the list beneath with filters, and "Invoice unbilled" per client that turns the hours
 * into a posted invoice — the practice's timesheet and its billing in one place. */
export function TimeTrackingTab() {
  const setView = useUiStore((s) => s.setView);
  const [entries, setEntries] = useState<TimeEntryRow[]>([]);
  const [unbilled, setUnbilled] = useState<UnbilledSummary[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filterCustomer, setFilterCustomer] = useState<number | null>(null);
  const [unbilledOnly, setUnbilledOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState({ workDate: localIsoDate(), customerId: null as number | null, employeeId: null as number | null, hours: 1, rateCents: 0, description: '', billable: true });

  async function reload() {
    const [e, u, c, emp] = await Promise.all([window.api.timeEntries.list(filterCustomer || unbilledOnly ? { customerId: filterCustomer ?? undefined, unbilledOnly } : {}), window.api.timeEntries.unbilled(), window.api.customers.list(), window.api.employees.list()]);
    if (e.ok) setEntries(e.data); if (u.ok) setUnbilled(u.data); if (c.ok) setCustomers(c.data); if (emp.ok) setEmployees(emp.data);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterCustomer, unbilledOnly]);

  const customerName = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const employeeName = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);

  async function add() {
    if (!draft.customerId || draft.hours <= 0) return setError('Choose a client and enter the hours.');
    setBusy(true); setError(null);
    const result = await window.api.timeEntries.create({ ...draft, description: draft.description || null, staffName: draft.employeeId ? employeeName.get(draft.employeeId) ?? null : null });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDraft({ ...draft, hours: 1, description: '' });
    await reload();
  }

  async function invoice(customerId: number) {
    const name = customerName.get(customerId) ?? 'this client';
    if (!window.confirm(`Create an invoice for all unbilled time for ${name}?`)) return;
    setBusy(true); setError(null); setNotice(null);
    const result = await window.api.timeEntries.invoice({ customerId });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setNotice(`Created ${result.data.invoiceNumber} for ${(result.data.totalCents / 100).toFixed(2)} from ${result.data.entries} time entr${result.data.entries === 1 ? 'y' : 'ies'}.`);
    await reload();
  }

  async function remove(e: TimeEntryRow) {
    if (!window.confirm('Delete this time entry?')) return;
    const result = await window.api.timeEntries.delete(e.id);
    if (!result.ok) return setError(result.error);
    await reload();
  }

  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
  const totalCents = entries.reduce((s, e) => s + e.amountCents, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded border border-gray-200 bg-white p-3 text-sm">
        <label className="block"><span className="text-xs text-gray-500">Date</span><input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 block rounded border border-gray-300 px-2 py-1" value={draft.workDate} onChange={(e) => setDraft({ ...draft, workDate: clampIsoDate(e.target.value) })} /></label>
        <label className="block w-56"><span className="text-xs text-gray-500">Client</span><div className="mt-1"><Combobox options={customers.filter((c) => c.isActive).map((c) => ({ value: String(c.id), label: c.name }))} value={draft.customerId ? String(draft.customerId) : null} onChange={(v) => setDraft({ ...draft, customerId: v ? Number(v) : null })} placeholder="Client…" /></div></label>
        <label className="block w-40"><span className="text-xs text-gray-500">Who</span><select className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1" value={draft.employeeId ?? ''} onChange={(e) => { const id = e.target.value ? Number(e.target.value) : null; const emp = employees.find((x) => x.id === id); setDraft({ ...draft, employeeId: id, rateCents: draft.rateCents || (emp?.hourlyRateCents ? Math.round(emp.hourlyRateCents * 2.5) : draft.rateCents) }); }}><option value="">Me</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label className="block w-20"><span className="text-xs text-gray-500">Hours</span><input type="number" step="0.1" min="0.1" max="24" className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-right" value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: Number(e.target.value) || 0 })} /></label>
        <label className="block w-28"><span className="text-xs text-gray-500">Rate / h</span><div className="mt-1"><CurrencyInput valueCents={draft.rateCents} onChange={(cents) => setDraft({ ...draft, rateCents: cents })} aria-label="Hourly rate" /></div></label>
        <label className="block min-w-64 flex-1"><span className="text-xs text-gray-500">What was done</span><input className="mt-1 block w-full rounded border border-gray-300 px-2 py-1" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="e.g. Monthly bookkeeping, T2 preparation" /></label>
        <label className="flex items-center gap-1 pb-1.5 text-xs text-gray-600"><input type="checkbox" checked={draft.billable} onChange={(e) => setDraft({ ...draft, billable: e.target.checked })} />Billable</label>
        <button type="button" disabled={busy} onClick={() => void add()} className="rounded-full bg-brand-100 px-4 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50">Add time</button>
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}

      {unbilled.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="mb-1 font-semibold text-amber-900">Unbilled time</div>
          <div className="flex flex-wrap gap-2">
            {unbilled.map((u) => (
              <div key={u.customerId} className="flex items-center gap-2 rounded bg-white px-3 py-1.5 ring-1 ring-amber-200">
                <span className="font-medium text-gray-800">{customerName.get(u.customerId) ?? u.customerId}</span>
                <span className="text-gray-600">{u.hours} h · <Money cents={u.amountCents} /></span>
                <button type="button" disabled={busy} onClick={() => void invoice(u.customerId)} className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Invoice</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="w-56"><Combobox options={customers.map((c) => ({ value: String(c.id), label: c.name }))} value={filterCustomer ? String(filterCustomer) : null} onChange={(v) => setFilterCustomer(v ? Number(v) : null)} placeholder="All clients" /></div>
        <label className="flex items-center gap-1 text-gray-600"><input type="checkbox" checked={unbilledOnly} onChange={(e) => setUnbilledOnly(e.target.checked)} />Unbilled only</label>
        <span className="ml-auto text-gray-600">{entries.length} entries · {Math.round(totalHours * 10) / 10} h · <Money cents={totalCents} /></span>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400"><th className="pb-2">Date</th><EnteredTh className="pb-2" /><th className="pb-2">Client</th><th className="pb-2">Who</th><th className="pb-2">What</th><th className="pb-2 text-right">Hours</th><th className="pb-2 text-right">Rate</th><th className="pb-2 text-right">Amount</th><th className="pb-2">Status</th><th className="pb-2" /></tr></thead>
        <tbody>
          {entries.length === 0 && <tr><td colSpan={10} className="py-6 text-center text-gray-400">No time recorded yet.</td></tr>}
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-gray-100">
              <td className="py-1.5 tabular-nums">{e.workDate}</td>
              <EnteredTd at={e.createdAt} className="py-1.5" />
              <td className="py-1.5">{customerName.get(e.customerId) ?? '—'}</td>
              <td className="py-1.5 text-gray-600">{e.staffName ?? (e.employeeId ? employeeName.get(e.employeeId) : null) ?? '—'}</td>
              <td className="py-1.5 text-gray-700">{e.description ?? '—'}</td>
              <td className="py-1.5 text-right tabular-nums">{e.hours}</td>
              <td className="py-1.5 text-right"><Money cents={e.rateCents} /></td>
              <td className="py-1.5 text-right font-medium"><Money cents={e.amountCents} /></td>
              <td className="py-1.5">{!e.billable ? <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">not billable</span> : e.invoiceId ? <button type="button" onClick={() => setView({ kind: 'invoiceEditor', id: e.invoiceId! })} className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800 hover:underline">invoiced</button> : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">unbilled</span>}</td>
              <td className="py-1.5 text-right">{!e.invoiceId && <button type="button" onClick={() => void remove(e)} className="text-xs text-red-600 hover:underline">Delete</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
