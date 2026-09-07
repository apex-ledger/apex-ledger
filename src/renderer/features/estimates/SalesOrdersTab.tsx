import { useMemo, useState } from 'react';
import { useUiStore } from '../../app/store/uiStore';
import { Money } from '../../components/Money';
import { Modal } from '../../components/Modal';
import { buttonClass } from '../../components/Button';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { ESTIMATE_LABELS, FULFILLMENT_LABELS, isSalesOrder, orderInvoiceStatus, orderStatusLabel, type FulfillmentStatus } from '@shared/domain/sales/commitmentDocuments';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Sales orders — estimates the customer has accepted, and what has happened to them since.
 *
 * Still nothing in the ledger: an order is a promise in both directions, not a sale. It becomes a
 * sale when it is invoiced. What this screen adds over the estimates list is the order's life
 * after acceptance: fulfilled or not, wanted by when, sourced through which purchase order, and
 * closed when it will never be invoiced. */

function todayIso(): string {
  return localIsoDate();
}

type Filter = 'open' | 'all';

export function SalesOrdersTab() {
  const setView = useUiStore((s) => s.setView);
  const [filter, setFilter] = useState<Filter>('open');
  const [customerFilter, setCustomerFilter] = useState<number | 'all'>('all');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [poFor, setPoFor] = useState<number | null>(null);
  const [poVendorId, setPoVendorId] = useState<number | null>(null);
  const [requiredByFor, setRequiredByFor] = useState<number | null>(null);
  const [requiredByDate, setRequiredByDate] = useState('');

  const estimates = useIpcQuery(() => window.api.estimates.list(), []);
  const customers = useIpcQuery(() => window.api.customers.list({}), []);
  const vendors = useIpcQuery(() => window.api.vendors.list({}), []);
  const nameById = useMemo(() => new Map((customers.data ?? []).map((c) => [c.id, c.name])), [customers.data]);

  const orders = (estimates.data ?? []).filter((e) => isSalesOrder(e.status));
  const visible = orders
    .filter((o) => (filter === 'all' ? true : o.status === 'accepted'))
    .filter((o) => (customerFilter === 'all' ? true : o.customerId === customerFilter));
  const openValueCents = orders.filter((o) => o.status === 'accepted').reduce((sum, o) => sum + o.totalCents, 0);

  async function run(id: number, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setActionError(null);
    setBusyId(id);
    setMenuFor(null);
    const result = await fn();
    setBusyId(null);
    if (!result.ok) setActionError(result.error ?? 'Something went wrong.');
    else estimates.reload();
  }

  const poVendors = (vendors.data ?? []).filter((v) => v.isActive);

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setView({ kind: 'estimateEditor', id: 'new', asOrder: true })} className={buttonClass('primary')}>
          New sales order
        </button>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Order status" className="rounded border border-gray-300 px-2 py-1 text-sm">
          <option value="open">Open orders</option>
          <option value="all">All orders</option>
        </select>
        <select
          value={customerFilter === 'all' ? 'all' : String(customerFilter)}
          onChange={(e) => setCustomerFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          aria-label="Customer"
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="all">All customers</option>
          {(customers.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {openValueCents > 0 && (
          <span className="rounded bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800">
            <Money cents={openValueCents} /> on open orders, not yet invoiced
          </span>
        )}
      </div>

      {estimates.loading && <p className="text-sm text-gray-500">Loading…</p>}
      {estimates.error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estimates.error}</div>}
      {actionError && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>}

      {estimates.data && visible.length === 0 && (
        <p className="text-sm text-gray-500">
          {orders.length === 0
            ? 'No sales orders yet. Create one, or mark an estimate Accepted — an accepted estimate is a sales order.'
            : 'No open orders.'}
        </p>
      )}

      {visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left font-medium">Order no.</th>
                <th className="px-3 py-2 text-left font-medium">Order date</th>
                <th className="px-3 py-2 text-left font-medium">Customer</th>
                <th className="px-3 py-2 text-right font-medium">Order total</th>
                <th className="px-3 py-2 text-left font-medium">Order status</th>
                <th className="px-3 py-2 text-left font-medium">Invoice status</th>
                <th className="px-3 py-2 text-left font-medium">Fulfillment</th>
                <th className="px-3 py-2 text-left font-medium">Required by</th>
                <th className="px-3 py-2 text-left font-medium">Ship date</th>
                <th className="px-3 py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const fulfillment = (row.fulfillmentStatus ?? 'pending') as FulfillmentStatus;
                const open = row.status === 'accepted';
                return (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="cursor-pointer px-3 py-1.5 font-medium text-brand-700 hover:underline" onClick={() => setView({ kind: 'estimateEditor', id: row.id })}>
                      {row.estimateNumber}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums text-gray-600">{row.estimateDate}</td>
                    <td className="px-3 py-1.5">{nameById.get(row.customerId) ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums"><Money cents={row.totalCents} /></td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded px-2 py-0.5 text-xs ${open ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>{orderStatusLabel(row.status)}</span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-600">
                      {row.convertedInvoiceId !== null ? (
                        <button type="button" onClick={() => setView({ kind: 'invoiceEditor', id: row.convertedInvoiceId as number })} className="text-brand-700 hover:underline">
                          {orderInvoiceStatus(row.status, row.convertedInvoiceId)}
                        </button>
                      ) : (
                        orderInvoiceStatus(row.status, row.convertedInvoiceId)
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded px-2 py-0.5 text-xs ${fulfillment === 'shipped' ? 'bg-sky-50 text-sky-800' : 'bg-amber-50 text-amber-800'}`}>{FULFILLMENT_LABELS[fulfillment]}</span>
                    </td>
                    <td className="px-3 py-1.5 tabular-nums text-gray-600">{row.requiredByDate ?? '—'}</td>
                    <td className="px-3 py-1.5 tabular-nums text-gray-600">{row.shipDate ?? '—'}</td>
                    <td className="relative px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setView({ kind: 'estimateEditor', id: row.id })} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50">
                          Edit
                        </button>
                        <button
                          type="button"
                          aria-label={`Actions for ${row.estimateNumber}`}
                          aria-expanded={menuFor === row.id}
                          disabled={busyId === row.id}
                          onClick={() => setMenuFor(menuFor === row.id ? null : row.id)}
                          className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          ▾
                        </button>
                      </div>
                      {menuFor === row.id && (
                        <div role="menu" className="absolute right-3 z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg">
                          {open && row.convertedInvoiceId === null && (
                            <MenuItem
                              label="Convert to invoice"
                              onClick={() =>
                                void run(row.id, async () => {
                                  const r = await window.api.estimates.convertToInvoice({ id: row.id });
                                  if (r.ok) setView({ kind: 'invoiceEditor', id: r.data.invoice.id });
                                  return r;
                                })
                              }
                            />
                          )}
                          {open && row.convertedPurchaseOrderId === null && (
                            <MenuItem label="Convert to purchase order" onClick={() => { setMenuFor(null); setPoVendorId(poVendors[0]?.id ?? null); setPoFor(row.id); }} />
                          )}
                          {row.convertedPurchaseOrderId !== null && (
                            <MenuItem label="Open purchase order" onClick={() => setView({ kind: 'purchaseOrderEditor', id: row.convertedPurchaseOrderId as number })} />
                          )}
                          {fulfillment === 'pending' ? (
                            <MenuItem label="Mark as shipped" onClick={() => void run(row.id, () => window.api.estimates.setFulfillment({ id: row.id, fulfillmentStatus: 'shipped', shipDate: todayIso() }))} />
                          ) : (
                            <MenuItem label="Mark as not shipped" onClick={() => void run(row.id, () => window.api.estimates.setFulfillment({ id: row.id, fulfillmentStatus: 'pending', shipDate: null }))} />
                          )}
                          <MenuItem label="Set required-by date" onClick={() => { setMenuFor(null); setRequiredByDate(row.requiredByDate ?? ''); setRequiredByFor(row.id); }} />
                          {open && <MenuItem label="Close order" onClick={() => void run(row.id, () => window.api.estimates.setStatus({ id: row.id, status: 'closed' }))} />}
                          {row.status === 'closed' && <MenuItem label="Reopen order" onClick={() => void run(row.id, () => window.api.estimates.setStatus({ id: row.id, status: 'accepted' }))} />}
                          {row.convertedInvoiceId === null && (
                            <MenuItem
                              label="Delete"
                              tone="danger"
                              onClick={() => {
                                if (window.confirm(`Delete sales order ${row.estimateNumber}? It has not been invoiced, so nothing in the books changes.`)) {
                                  void run(row.id, () => window.api.estimates.delete(row.id));
                                }
                              }}
                            />
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        A sales order is an accepted estimate — nothing here is in the books until it is invoiced. Closing an order records that it
        will not be invoiced; it can be reopened. Status labels: {Object.values(ESTIMATE_LABELS).join(', ')}.
      </p>

      <Modal open={poFor !== null} onClose={() => setPoFor(null)} title="Convert to purchase order">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Raise a purchase order for the goods on this sales order. Each line is priced at the product's purchase price where one is set; adjust on the purchase order afterwards.</p>
          <label className="block text-sm">
            <span className="text-gray-600">Vendor</span>
            <select value={poVendorId ?? ''} onChange={(e) => setPoVendorId(e.target.value ? Number(e.target.value) : null)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5">
              <option value="">— Select —</option>
              {poVendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPoFor(null)} className={buttonClass('secondary')}>Cancel</button>
            <button
              type="button"
              disabled={poVendorId === null || poFor === null}
              onClick={() => {
                const id = poFor as number;
                setPoFor(null);
                void run(id, async () => {
                  const r = await window.api.estimates.convertToPurchaseOrder({ id, vendorId: poVendorId as number });
                  if (r.ok) setView({ kind: 'purchaseOrderEditor', id: r.data.purchaseOrder.id });
                  return r;
                });
              }}
              className={buttonClass('primary')}
            >
              Create purchase order
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={requiredByFor !== null} onClose={() => setRequiredByFor(null)} title="Required-by date">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-600">The customer needs this by</span>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={requiredByDate} onChange={(e) => setRequiredByDate(clampIsoDate(e.target.value))} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRequiredByFor(null)} className={buttonClass('secondary')}>Cancel</button>
            <button
              type="button"
              onClick={() => {
                const id = requiredByFor as number;
                setRequiredByFor(null);
                void run(id, () => window.api.estimates.setRequiredBy({ id, requiredByDate: requiredByDate || null }));
              }}
              className={buttonClass('primary')}
            >
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MenuItem({ label, onClick, tone = 'normal' }: { label: string; onClick: () => void; tone?: 'normal' | 'danger' }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`block w-full px-3 py-1.5 text-left hover:bg-gray-50 ${tone === 'danger' ? 'text-red-700' : 'text-gray-800'}`}>
      {label}
    </button>
  );
}
