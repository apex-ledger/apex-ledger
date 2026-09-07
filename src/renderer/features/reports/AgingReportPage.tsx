import { useEffect, useMemo, useState } from 'react';
import { CustomerLink, VendorLink } from '../../components/DrillLinks';
import type { Invoice, Bill, Contact } from '@shared/domain/types';
import { Money } from '../../components/Money';
import { useUiStore } from '../../app/store/uiStore';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { SendReminderButton } from '../../components/SendReminderButton';
import { CustomerStatementsModal } from '../sales/CustomerStatementsModal';

/** Aged receivables and aged payables from one component — "who owes you" and "what you owe" are
 * the same bucketing of an unpaid document by how far past its due date it sits, differing only in
 * which table it reads and whose name is on it. Buckets follow the 30/60/90 convention every
 * accountant and lender expects, so the output can be handed over without explanation. */

type Direction = 'receivable' | 'payable';

const BUCKETS = [
  { key: 'current', label: 'Current', lo: -Infinity, hi: 0 },
  { key: 'd1', label: '1 – 30', lo: 1, hi: 30 },
  { key: 'd31', label: '31 – 60', lo: 31, hi: 60 },
  { key: 'd61', label: '61 – 90', lo: 61, hi: 90 },
  { key: 'd91', label: '90+', lo: 91, hi: Infinity },
];

function todayIso(): string {
  return localIsoDate();
}

function daysOverdue(dueDate: string, asOf: string): number {
  const ms = Date.parse(asOf) - Date.parse(dueDate);
  return Math.floor(ms / 86400000);
}

interface Row {
  documentId: number;
  party: string;
  docNumber: string;
  date: string;
  createdAt: string | null;
  partyId: number;
  dueDate: string;
  amountCents: number;
  overdue: number;
  bucket: string;
}

export function AgingReportPage({ direction }: { direction: Direction }) {
  const setView = useUiStore((state) => state.setView);
  const [rows, setRows] = useState<Row[]>([]);
  const partyIdByName = useMemo(() => new Map(rows.map((r) => [r.party, r.partyId])), [rows]);
  const [asOf, setAsOf] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupByParty, setGroupByParty] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [docsRes, partiesRes] = await Promise.all([
        direction === 'receivable' ? window.api.invoices.list({}) : window.api.bills.list({}),
        direction === 'receivable' ? window.api.customers.list({}) : window.api.vendors.list({}),
      ]);
      if (cancelled) return;
      setLoading(false);
      if (!docsRes.ok) return setError(docsRes.error);
      if (!partiesRes.ok) return setError(partiesRes.error);
      setError(null);
      const names = new Map<number, string>((partiesRes.data as Contact[]).map((c) => [c.id, c.name]));
      const built: Row[] = [];
      for (const d of docsRes.data as (Invoice | Bill)[]) {
        if (d.balanceDueCents <= 0) continue;
        const isInvoice = 'invoiceNumber' in d;
        const partyId = isInvoice ? (d as Invoice).customerId : (d as Bill).vendorId;
        const over = daysOverdue(d.dueDate, asOf);
        built.push({
          documentId: d.id,
          party: names.get(partyId) ?? 'Unknown customer/vendor',
          partyId,
          docNumber: isInvoice ? (d as Invoice).invoiceNumber : `Bill ${d.id}`,
          date: isInvoice ? (d as Invoice).invoiceDate : (d as Bill).billDate,
          createdAt: d.createdAt ?? null,
          dueDate: d.dueDate,
          amountCents: d.balanceDueCents,
          overdue: over,
          bucket: BUCKETS.find((b) => over >= b.lo && over <= b.hi)!.key,
        });
      }
      built.sort((a, b) => b.overdue - a.overdue || a.party.localeCompare(b.party));
      setRows(built);
    })();
    return () => {
      cancelled = true;
    };
  }, [direction, asOf]);

  const byParty = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const r of rows) {
      if (!m.has(r.party)) m.set(r.party, Object.fromEntries(BUCKETS.map((b) => [b.key, 0])));
      m.get(r.party)![r.bucket] += r.amountCents;
    }
    return [...m.entries()]
      .map(([party, b]) => ({ party, buckets: b, total: Object.values(b).reduce((s, v) => s + v, 0) }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const totals = useMemo(() => {
    const t = Object.fromEntries(BUCKETS.map((b) => [b.key, 0])) as Record<string, number>;
    for (const r of rows) t[r.bucket] += r.amountCents;
    return t;
  }, [rows]);

  const grand = Object.values(totals).reduce((s, v) => s + v, 0);
  const noun = direction === 'receivable' ? 'customer' : 'vendor';
  const [statementsOpen, setStatementsOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-gray-600">As of</span>
          <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 rounded border border-gray-300 px-2 py-1.5" value={asOf} onChange={(e) => setAsOf(clampIsoDate(e.target.value))} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-gray-600">
          <input type="checkbox" checked={groupByParty} onChange={(e) => setGroupByParty(e.target.checked)} />
          Summarise by {noun}
        </label>
        {direction === 'receivable' && (
          <button type="button" onClick={() => setStatementsOpen(true)} className="mb-2 ml-auto rounded-full bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-200" data-export-skip title="Statement of account for every customer with a balance: PDFs to a folder, or email one at a time">
            Statements for all customers
          </button>
        )}
      </div>
      {direction === 'receivable' && <CustomerStatementsModal open={statementsOpen} onClose={() => setStatementsOpen(false)} />}

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-gray-500">
          Nothing outstanding — every {direction === 'receivable' ? 'invoice' : 'bill'} is marked paid.
        </p>
      )}

      {!loading && !error && rows.length > 0 && groupByParty && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 text-left font-medium">{direction === 'receivable' ? 'Customer' : 'Vendor'}</th>
              {BUCKETS.map((b) => <th key={b.key} className="px-3 py-2 text-right font-medium">{b.label}</th>)}
              <th className="px-3 py-2 text-right font-medium">Total</th>
              {direction === 'receivable' && <th className="px-3 py-2" data-export-skip />}
            </tr>
          </thead>
          <tbody>
            {byParty.map((p) => (
              <tr key={p.party} className="border-b border-gray-100">
                <td className="px-3 py-1.5">{direction === 'receivable' ? <CustomerLink id={partyIdByName.get(p.party)} name={p.party} /> : <VendorLink id={partyIdByName.get(p.party)} name={p.party} />}</td>
                {BUCKETS.map((b) => (
                  <td key={b.key} className="px-3 py-1.5 text-right tabular-nums">
                    {p.buckets[b.key] ? <Money cents={p.buckets[b.key]} /> : <span className="text-gray-300">—</span>}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right font-medium tabular-nums"><Money cents={p.total} /></td>
                {direction === 'receivable' && <td className="px-3 py-1.5 text-right" data-export-skip><SendReminderButton customerId={partyIdByName.get(p.party) ?? null} /></td>}
              </tr>
            ))}
            <tr className="border-t border-gray-300 font-semibold">
              <td className="px-3 py-2">Total</td>
              {BUCKETS.map((b) => <td key={b.key} className="px-3 py-2 text-right tabular-nums"><Money cents={totals[b.key]} /></td>)}
              <td className="px-3 py-2 text-right tabular-nums"><Money cents={grand} /></td>
              {direction === 'receivable' && <td data-export-skip />}
            </tr>
          </tbody>
        </table>
      )}

      {!loading && !error && rows.length > 0 && !groupByParty && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 text-left font-medium">{direction === 'receivable' ? 'Customer' : 'Vendor'}</th>
              <th className="px-3 py-2 text-left font-medium">Document</th>
              <th className="px-3 py-2 text-left font-medium">Date</th><EnteredTh className="px-3 py-2 text-left font-medium" />
              <th className="px-3 py-2 text-left font-medium">Due</th>
              <th className="px-3 py-2 text-right font-medium">Days overdue</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-right font-medium">Original</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="px-3 py-1.5">{direction === 'receivable' ? <CustomerLink id={r.partyId} name={r.party} /> : <VendorLink id={r.partyId} name={r.party} />}</td>
                <td className="px-3 py-1.5"><button type="button" onClick={() => direction === 'receivable' ? setView({ kind: 'invoiceEditor', id: r.documentId }) : setView({ kind: 'purchases', tab: 'unpaid', billId: r.documentId })} className="text-left text-brand-700 hover:underline" title={direction === 'receivable' ? 'Open this invoice' : 'Open this bill'}>{r.docNumber}</button></td>
                <td className="px-3 py-1.5 tabular-nums text-gray-600">{r.date}</td><EnteredTd at={r.createdAt} className="px-3 py-1.5" />
                <td className="px-3 py-1.5 tabular-nums text-gray-600">{r.dueDate}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${r.overdue > 90 ? 'font-medium text-red-700' : r.overdue > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                  {r.overdue > 0 ? r.overdue : '—'}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums"><Money cents={r.amountCents} /></td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => direction === 'receivable' ? setView({ kind: 'invoiceEditor', id: r.documentId }) : setView({ kind: 'purchases', tab: 'unpaid', billId: r.documentId })}
                    className="whitespace-nowrap text-brand-600 hover:underline"
                  >
                    {direction === 'receivable' ? 'Open invoice' : 'Open vendor bills'}
                  </button>
                </td>
              </tr>
            ))}
            <tr className="border-t border-gray-300 font-semibold">
              <td className="px-3 py-2" colSpan={6}>Total outstanding</td>
              <td className="px-3 py-2 text-right tabular-nums"><Money cents={grand} /></td>
              <td />
            </tr>
          </tbody>
        </table>
      )}

      <p className="text-xs text-gray-400">
        Buckets count days past the due date on each unpaid {direction === 'receivable' ? 'invoice' : 'bill'}, measured
        from the date above. Anything not yet due sits in Current. Paid documents are excluded entirely.
      </p>
      {groupByParty && rows.length > 0 && <p className="text-xs text-brand-600">Turn off “Summarise by {noun}” to open the original invoice or vendor-bill workflow for correction.</p>}
    </div>
  );
}
