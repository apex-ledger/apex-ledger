import { useMemo, useState } from 'react';
import { MatchSupplierBillModal } from './MatchSupplierBillModal';
import { useUiStore } from '../../app/store/uiStore';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import {
  PURCHASE_ORDER_LABELS,
  canTransitionPurchaseOrder,
  type PurchaseOrderStatus,
} from '@shared/domain/sales/commitmentDocuments';

/** Orders placed with vendors, and what became of them.
 *
 * Nothing here is in accounts payable. Ordering goods creates a commercial obligation but not an
 * accounting one — nothing has been delivered and no invoice has arrived. Recording it as payable
 * would overstate what the business owes, and would double up the moment the vendor's invoice
 * actually turns up.
 */

const STATUS_STYLES: Record<PurchaseOrderStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-sky-50 text-sky-800',
  received: 'bg-emerald-50 text-emerald-800',
  cancelled: 'bg-rose-50 text-rose-800',
  converted: 'bg-violet-50 text-violet-800',
};

export function PurchaseOrdersPage() {
  const setView = useUiStore((s) => s.setView);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [search, setSearch] = useState('');
  const [matchOrderId, setMatchOrderId] = useState<number | null>(null);

  const orders = useIpcQuery(() => window.api.purchaseOrders.list(), []);
  const vendors = useIpcQuery(() => window.api.vendors.list({}), []);
  const nameById = useMemo(() => new Map((vendors.data ?? []).map((v) => [v.id, v.name])), [vendors.data]);

  const rows = orders.data ?? [];
  const visible = (filter === 'all' ? rows : rows.filter((r) => r.status !== 'converted' && r.status !== 'cancelled')).filter((row) => {
    const term = search.trim().toLowerCase();
    return !term || row.poNumber.toLowerCase().includes(term) || (nameById.get(row.vendorId) ?? '').toLowerCase().includes(term);
  });

  const onOrderCents = rows
    .filter((r) => r.status === 'draft' || r.status === 'sent' || r.status === 'received')
    .reduce((sum, r) => sum + r.totalCents, 0);

  async function run(id: number, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setActionError(null);
    setNotice(null);
    setBusyId(id);
    const result = await fn();
    setBusyId(null);
    if (!result.ok) setActionError(result.error ?? 'Something went wrong.');
    else orders.reload();
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setView({ kind: 'purchaseOrderEditor', id: 'new' })}
          className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200"
        >
          New Purchase Order
        </button>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'open' | 'all')}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="open">Still open</option>
          <option value="all">All orders</option>
        </select>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search vendor or PO #…"
          className="w-60 rounded border border-gray-300 px-2.5 py-1.5 text-sm"
        />

        {onOrderCents > 0 && (
          <span className="rounded bg-sky-50 px-3 py-1.5 text-sm text-sky-800">
            <Money cents={onOrderCents} /> on order, not yet billed
          </span>
        )}
      </div>

      {orders.loading && <p className="text-sm text-gray-500">Loading…</p>}
      {orders.error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{orders.error}</div>}
      {actionError && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>}
      {notice && <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</div>}

      {orders.data && visible.length === 0 && (
        <p className="text-sm text-gray-500">
          {rows.length === 0
            ? 'No purchase orders yet. Create one to record what you have ordered without it hitting accounts payable.'
            : 'Nothing open.'}
        </p>
      )}

      {visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left font-medium">Number</th>
                <th className="px-3 py-2 text-left font-medium">Ordered</th><EnteredTh className="px-3 py-2 text-left font-medium" />
                <th className="px-3 py-2 text-left font-medium">Vendor</th>
                <th className="px-3 py-2 text-left font-medium">Expected</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td
                    className="cursor-pointer px-3 py-1.5 font-medium text-brand-700 hover:underline"
                    onClick={() => setView({ kind: 'purchaseOrderEditor', id: row.id })}
                  >
                    {row.poNumber}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-600">{row.orderDate}</td><EnteredTd at={row.createdAt} className="px-3 py-1.5" />
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => setView({ kind: 'purchases', tab: 'vendors', vendorId: row.vendorId })}
                      className="font-medium text-brand-700 hover:underline"
                      title="Open vendor history"
                    >
                      {nameById.get(row.vendorId) ?? '—'}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-600">{row.expectedDate ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    <Money cents={row.totalCents} />
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[row.status]}`}>
                      {PURCHASE_ORDER_LABELS[row.status]}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {(['sent', 'cancelled'] as PurchaseOrderStatus[])
                        .filter((next) => canTransitionPurchaseOrder(row.status, next))
                        .map((next) => (
                          <button
                            key={next}
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void run(row.id, () => window.api.purchaseOrders.setStatus({ id: row.id, status: next }))}
                            className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          >
                            {PURCHASE_ORDER_LABELS[next]}
                          </button>
                        ))}

                      {row.status === 'sent' && row.receivedAt === null && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void run(row.id, () => window.api.purchaseOrders.receive({ id: row.id }))}
                          className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
                        >
                          Receive goods
                        </button>
                      )}

                      {row.convertedBillId === null && row.receiptJournalEntryId !== null && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => {
                            if (window.confirm(`Reverse the latest goods receipt for ${row.poNumber}? GRNI and its stock movements will be reversed together.`)) void run(row.id, () => window.api.purchaseOrders.reverseLatestReceipt(row.id));
                          }}
                          className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                        >
                          Reverse latest receipt
                        </button>
                      )}

                      {row.convertedBillId === null && row.status !== 'cancelled' && row.status !== 'received' && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() =>
                            void run(row.id, async () => {
                              const billNumber = window.prompt(`Enter the vendor invoice number for ${row.poNumber}:`)?.trim();
                              if (!billNumber) return { ok: false, error: 'Vendor invoice number is required. No bill was created.' };
                              const r = await window.api.purchaseOrders.convertToBill({ id: row.id, billNumber });
                              if (r.ok && r.data.combinedCategories) {
                                setNotice(
                                  `${r.data.combinedCategories} categories were combined onto one bill, because a bill carries a single category. The order still lists them separately.`,
                                );
                              }
                              return r;
                            })
                          }
                          className="rounded bg-brand-100 px-1.5 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
                        >
                          Enter bill
                        </button>
                      )}

                      {row.convertedBillId === null && row.status === 'received' && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => setMatchOrderId(row.id)}
                          className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 hover:bg-violet-200 disabled:opacity-50"
                        >
                          Match vendor bill
                        </button>
                      )}

                      {row.convertedBillId !== null && (
                        <button type="button" onClick={() => setView({ kind: 'purchases', tab: 'unpaid', billId: row.convertedBillId! })} className="px-1.5 py-0.5 text-[11px] font-medium text-brand-700 hover:underline">Open vendor bill</button>
                      )}
                      {row.matchedBillId !== null && (
                        <button type="button" disabled={busyId === row.id} onClick={() => { if (window.confirm(`Unmatch the vendor bill from ${row.poNumber}? Its AP/GRNI/variance entry will be reversed; received stock stays intact.`)) void run(row.id, () => window.api.purchaseOrders.unmatchSupplierBill(row.id)); }} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50">Unmatch bill</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        A purchase order itself is a commitment. Receiving tracked inventory posts Inventory against Goods Received Not Invoiced; the vendor invoice later moves that GRNI balance into Accounts Payable without debiting Inventory twice.
      </p>

      <MatchSupplierBillModal
        purchaseOrderId={matchOrderId}
        onClose={() => setMatchOrderId(null)}
        onMatched={(varianceCents) => {
          orders.reload();
          setNotice(varianceCents === 0 ? 'Vendor invoice matched to received goods.' : `Vendor invoice matched. Purchase price variance: $${(varianceCents / 100).toFixed(2)}.`);
        }}
      />
    </div>
  );
}
