import { useMemo, useState } from 'react';
import { useUiStore } from '../../app/store/uiStore';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { daysUntilDue } from '@shared/domain/contacts/paymentTerms';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Invoices and sales receipts in one list.
 *
 * They are separate screens because they are different documents — one is a promise to pay, the
 * other is money already taken — but "what did we sell in March" is a question about both, and
 * answering it meant opening two screens and adding them up by hand.
 *
 * Sorted newest first and filtered by type and status, which is what the two separate lists could
 * not do together.
 */

type TypeFilter = 'all' | 'invoice' | 'receipt';
type StatusFilter = 'all' | 'unpaid' | 'paid' | 'overdue';

interface SaleRow {
  key: string;
  kind: 'Invoice' | 'Sales receipt';
  number: string;
  date: string;
  createdAt: string | null;
  dueDate: string | null;
  customerId: number | null;
  totalCents: number;
  status: 'paid' | 'unpaid';
  daysLate: number;
  open: () => void;
}

function todayIso(): string {
  return localIsoDate();
}

export function AllSalesTab() {
  const setView = useUiStore((s) => s.setView);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const today = todayIso();

  const invoices = useIpcQuery(() => window.api.invoices.list({}), []);
  const receipts = useIpcQuery(() => window.api.salesReceipts.list({}), []);
  const customers = useIpcQuery(() => window.api.customers.list({}), []);

  const nameById = useMemo(() => new Map((customers.data ?? []).map((c) => [c.id, c.name])), [customers.data]);

  const rows = useMemo<SaleRow[]>(() => {
    const built: SaleRow[] = [];

    for (const invoice of invoices.data ?? []) {
      const remaining = daysUntilDue(invoice.dueDate, today);
      built.push({
        key: `inv-${invoice.id}`,
        kind: 'Invoice',
        number: invoice.invoiceNumber,
        date: invoice.invoiceDate,
        createdAt: invoice.createdAt ?? null,
        dueDate: invoice.dueDate,
        customerId: invoice.customerId,
        totalCents: invoice.totalCents,
        status: invoice.status,
        daysLate: invoice.status === 'unpaid' && remaining !== null ? Math.max(0, -remaining) : 0,
        open: () => setView({ kind: 'invoiceEditor', id: invoice.id }),
      });
    }

    for (const receipt of receipts.data ?? []) {
      built.push({
        key: `rcp-${receipt.id}`,
        kind: 'Sales receipt',
        number: receipt.receiptNumber,
        date: receipt.receiptDate,
        createdAt: receipt.createdAt ?? null,
        // A sales receipt is money already taken, so it has no due date and can never be late.
        dueDate: null,
        customerId: receipt.customerId,
        totalCents: receipt.totalCents,
        status: 'paid',
        daysLate: 0,
        open: () => setView({ kind: 'salesReceiptEditor', id: receipt.id }),
      });
    }

    return built.sort((a, b) => b.date.localeCompare(a.date) || a.number.localeCompare(b.number));
  }, [invoices.data, receipts.data, today, setView]);

  const visible = rows.filter((row) => {
    if (typeFilter === 'invoice' && row.kind !== 'Invoice') return false;
    if (typeFilter === 'receipt' && row.kind !== 'Sales receipt') return false;
    if (statusFilter === 'unpaid' && row.status !== 'unpaid') return false;
    if (statusFilter === 'paid' && row.status !== 'paid') return false;
    if (statusFilter === 'overdue' && row.daysLate === 0) return false;

    const term = search.trim().toLowerCase();
    if (!term) return true;
    const name = (row.customerId !== null ? nameById.get(row.customerId) : '') ?? '';
    return name.toLowerCase().includes(term) || row.number.toLowerCase().includes(term);
  });

  const totalCents = visible.reduce((sum, row) => sum + row.totalCents, 0);
  const loading = invoices.loading || receipts.loading;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="all">All types</option>
          <option value="invoice">Invoices</option>
          <option value="receipt">Sales receipts</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="all">Any status</option>
          <option value="unpaid">Unpaid</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
        </select>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer or number…"
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {invoices.error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{invoices.error}</div>}

      {!loading && visible.length === 0 && <p className="text-sm text-gray-500">Nothing matches those filters.</p>}

      {visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Number</th>
                <th className="px-3 py-2 text-left font-medium">Date</th><EnteredTh className="px-3 py-2 text-left font-medium" />
                <th className="px-3 py-2 text-left font-medium">Customer</th>
                <th className="px-3 py-2 text-left font-medium">Due</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.key}
                  onClick={row.open}
                  className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-1.5 text-gray-500">{row.kind}</td>
                  <td className="px-3 py-1.5 font-medium text-gray-800">{row.number}</td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-600">{row.date}</td><EnteredTd at={row.createdAt} className="px-3 py-1.5" />
                  <td className="px-3 py-1.5">{(row.customerId !== null ? nameById.get(row.customerId) : null) ?? '—'}</td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-600">{row.dueDate ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    <Money cents={row.totalCents} />
                  </td>
                  <td className="px-3 py-1.5">
                    {row.daysLate > 0 ? (
                      <span className="rounded bg-rose-50 px-1.5 py-0.5 text-xs text-rose-800">{row.daysLate}d overdue</span>
                    ) : row.status === 'paid' ? (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800">Paid</span>
                    ) : (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">Unpaid</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-gray-300 font-semibold">
                <td className="px-3 py-2" colSpan={6}>
                  {visible.length} {visible.length === 1 ? 'document' : 'documents'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money cents={totalCents} />
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
