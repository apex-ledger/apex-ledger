import { useMemo, useState } from 'react';
import { DateInput } from '../../components/DateInput';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { formatEnteredAt } from '@shared/domain/audit/enteredStamp';

function monthStart(): string {
  return `${localIsoDate().slice(0, 7)}-01`;
}

const TOPIC_LABELS: Record<string, string> = {
  invoices: 'Invoice', bills: 'Bill', journal: 'Journal entry', payrollRuns: 'Pay run', employees: 'Employee', customers: 'Customer', vendors: 'Vendor',
  accounts: 'Account', products: 'Product', salesReceipts: 'Sales receipt', estimates: 'Estimate / order', purchaseOrders: 'Purchase order', deposits: 'Deposit',
  creditNotes: 'Credit note', bankImport: 'Bank import', bankReconciliation: 'Bank reconciliation', receiptInbox: 'Receipt inbox', hstFilings: 'GST/HST filing',
  company: 'Company settings', accessUsers: 'User access', recurringTemplates: 'Recurring template', fixedAssets: 'Fixed asset', paymentReminder: 'Payment reminder', customerStatements: 'Customer statement',
};

/** Who changed what, and when, for the company file that is open. Every saved change the app
 * makes goes through one door and lands here with the signed-in person's name, so this is the
 * list an auditor asks for and the one to read when a figure has moved and nobody knows why. */
export function ActivityLogPage() {
  const [periodStart, setPeriodStart] = useState(monthStart());
  const [periodEnd, setPeriodEnd] = useState(localIsoDate());
  const [actor, setActor] = useState('');
  const [topic, setTopic] = useState('');
  const { data, loading, error } = useIpcQuery(() => window.api.reports.activityLog({ periodStart, periodEnd }), [periodStart, periodEnd]);

  const actors = useMemo(() => [...new Set((data ?? []).map((r) => r.actorName))].sort(), [data]);
  const topics = useMemo(() => [...new Set((data ?? []).map((r) => r.topic))].sort(), [data]);
  const rows = useMemo(() => (data ?? []).filter((r) => (!actor || r.actorName === actor) && (!topic || r.topic === topic)), [data, actor, topic]);

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">From</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <span className="text-sm text-gray-400">to</span>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
        <select className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm" value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Who">
          <option value="">Everyone</option>
          {actors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="What">
          <option value="">Every kind of change</option>
          {topics.map((t) => <option key={t} value={t}>{TOPIC_LABELS[t] ?? t}</option>)}
        </select>
        <span className="text-xs text-gray-500">{rows.length} change{rows.length === 1 ? '' : 's'}</span>
      </div>
      <p className="text-xs text-gray-500">
        Every save in this company file, with the person signed in at the time. Times are when the change was made on this computer. The Entered column on each sheet shows the same time without the name, so exports to clients never carry staff names.
      </p>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {data && rows.length === 0 && <p className="text-sm text-gray-500">No changes in this range.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Who</th><th className="px-3 py-2">What</th><th className="px-3 py-2">Reference</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-3 py-1.5 tabular-nums text-gray-600">{formatEnteredAt(r.changedAt)}</td>
                  <td className="px-3 py-1.5 text-gray-800">{r.actorName}{r.actorEmail ? <span className="ml-1 text-xs text-gray-400">{r.actorEmail}</span> : null}</td>
                  <td className="px-3 py-1.5 text-gray-800">{TOPIC_LABELS[r.topic] ?? r.topic}</td>
                  <td className="px-3 py-1.5 text-gray-600">{r.targetReference ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
