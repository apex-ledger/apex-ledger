import { useEffect, useMemo, useState } from 'react';
import { CustomerLink } from '../../components/DrillLinks';
import type { Invoice, SalesReceipt, Contact } from '@shared/domain/types';
import { Money } from '../../components/Money';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Sales totalled per customer for a period, from invoices and sales receipts together — a
 * receipted counter sale is as much that customer's revenue as an invoiced one, and reporting only
 * invoices would understate anyone who pays on the spot. Amounts are what was billed, so this is a
 * sales report and not a collections one; unpaid invoices still count here and appear again on the
 * receivables ageing until they are settled. */

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

interface Row {
  customer: string;
  invoiced: number;
  receipted: number;
  docs: number;
}

export function SalesByCustomerPage() {
  const [from, setFrom] = useState(yearStartIso());
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<Row[]>([]);
  const [customerIds, setCustomerIds] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [invRes, recRes, custRes] = await Promise.all([
        window.api.invoices.list({}),
        window.api.salesReceipts.list({}),
        window.api.customers.list({}),
      ]);
      if (cancelled) return;
      setLoading(false);
      if (!invRes.ok) return setError(invRes.error);
      if (!custRes.ok) return setError(custRes.error);
      setError(null);
      const names = new Map<number, string>((custRes.data as Contact[]).map((c) => [c.id, c.name]));
      setCustomerIds(new Map((custRes.data as Contact[]).map((c) => [c.name, c.id])));
      const acc = new Map<string, Row>();
      const bump = (name: string, field: 'invoiced' | 'receipted', cents: number) => {
        if (!acc.has(name)) acc.set(name, { customer: name, invoiced: 0, receipted: 0, docs: 0 });
        const r = acc.get(name)!;
        r[field] += cents;
        r.docs += 1;
      };
      for (const i of invRes.data as Invoice[]) {
        if (i.invoiceDate < from || i.invoiceDate > to) continue;
        bump(names.get(i.customerId) ?? 'Unknown customer', 'invoiced', i.totalCents);
      }
      if (recRes.ok) {
        for (const s of recRes.data as SalesReceipt[]) {
          const d = (s as unknown as { receiptDate?: string; date?: string }).receiptDate
            ?? (s as unknown as { date?: string }).date;
          if (!d || d < from || d > to) continue;
          const cid = (s as unknown as { customerId?: number }).customerId;
          const cents = (s as unknown as { totalCents?: number }).totalCents ?? 0;
          bump(cid != null ? names.get(cid) ?? 'Unknown customer' : 'Cash / walk-in', 'receipted', cents);
        }
      }
      setRows([...acc.values()].sort((a, b) => (b.invoiced + b.receipted) - (a.invoiced + a.receipted)));
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const totals = useMemo(
    () => rows.reduce((t, r) => ({ invoiced: t.invoiced + r.invoiced, receipted: t.receipted + r.receipted, docs: t.docs + r.docs }),
      { invoiced: 0, receipted: 0, docs: 0 }),
    [rows],
  );
  const grand = totals.invoiced + totals.receipted;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-gray-600">From</span>
          <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 rounded border border-gray-300 px-2 py-1.5" value={from} onChange={(e) => setFrom(clampIsoDate(e.target.value))} />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">To</span>
          <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 rounded border border-gray-300 px-2 py-1.5" value={to} onChange={(e) => setTo(clampIsoDate(e.target.value))} />
        </label>
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-gray-500">No invoices or sales receipts fall in this period.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 text-left font-medium">Customer</th>
              <th className="px-3 py-2 text-right font-medium">Documents</th>
              <th className="px-3 py-2 text-right font-medium">Invoiced</th>
              <th className="px-3 py-2 text-right font-medium">Receipted</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">% of sales</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const t = r.invoiced + r.receipted;
              return (
                <tr key={r.customer} className="border-b border-gray-100">
                  <td className="px-3 py-1.5"><CustomerLink id={customerIds.get(r.customer)} name={r.customer} /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{r.docs}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.invoiced ? <Money cents={r.invoiced} /> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.receipted ? <Money cents={r.receipted} /> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums"><Money cents={t} /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{grand ? ((t / grand) * 100).toFixed(1) + '%' : '—'}</td>
                </tr>
              );
            })}
            <tr className="border-t border-gray-300 font-semibold">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{totals.docs}</td>
              <td className="px-3 py-2 text-right tabular-nums"><Money cents={totals.invoiced} /></td>
              <td className="px-3 py-2 text-right tabular-nums"><Money cents={totals.receipted} /></td>
              <td className="px-3 py-2 text-right tabular-nums"><Money cents={grand} /></td>
              <td className="px-3 py-2 text-right tabular-nums">100.0%</td>
            </tr>
          </tbody>
        </table>
      )}

      <p className="text-xs text-gray-400">
        Amounts are what was billed in the period, whether or not it has been paid. Sales receipts with no customer
        attached are grouped as "Cash / walk-in". Transactions posted straight to the ledger without an invoice or
        receipt do not appear here — see the income statement for total revenue.
      </p>
    </div>
  );
}
