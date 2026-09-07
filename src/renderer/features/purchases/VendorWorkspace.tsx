import { useEffect, useMemo, useState } from 'react';
import type { Bill, Contact } from '@shared/domain/types';
import { Money } from '../../components/Money';
import { buttonClass } from '../../components/Button';
import { ContactFormModal } from '../contacts/ContactFormModal';
import { useUiStore } from '../../app/store/uiStore';
import { ContactPaymentHistory } from '../../components/ContactPaymentHistory';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { MergeContactModal } from '../../components/MergeContactModal';

interface PurchaseOrderSummary {
  createdAt?: string;
  id: number;
  vendorId: number;
  poNumber: string;
  orderDate: string;
  totalCents: number;
  status: string;
}

type ActivityRow =
  | { key: string; date: string; createdAt: string | null; kind: 'Bill'; reference: string; amountCents: number; status: string; billId: number }
  | { key: string; date: string; createdAt: string | null; kind: 'Purchase order'; reference: string; amountCents: number; status: string; purchaseOrderId: number };

export function VendorWorkspace({
  vendors,
  bills,
  requestedVendorId,
  onNewBill,
  onRefresh,
  onPayBill,
}: {
  vendors: Contact[];
  bills: Bill[];
  requestedVendorId?: number;
  onNewBill: () => void;
  onRefresh: () => void;
  /** Opens Pay Bill for one bill straight from its row in the payment history. */
  onPayBill?: (billId: number) => void;
}) {
  const setView = useUiStore((state) => state.setView);
  const [orders, setOrders] = useState<PurchaseOrderSummary[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(requestedVendorId ?? vendors[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'bills' | 'orders'>('all');
  const [editing, setEditing] = useState<Contact | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);

  useEffect(() => {
    window.api.purchaseOrders.list().then((result) => {
      if (result.ok) setOrders(result.data);
    });
  }, []);

  useEffect(() => {
    if (requestedVendorId !== undefined) setSelectedVendorId(requestedVendorId);
  }, [requestedVendorId]);

  useEffect(() => {
    if (selectedVendorId === null && vendors.length > 0) setSelectedVendorId(vendors[0].id);
    if (selectedVendorId !== null && !vendors.some((vendor) => vendor.id === selectedVendorId)) setSelectedVendorId(vendors[0]?.id ?? null);
  }, [vendors, selectedVendorId]);

  const filteredVendors = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return vendors;
    return vendors.filter((vendor) => [vendor.name, vendor.email, vendor.phone, vendor.address]
      .some((value) => value?.toLowerCase().includes(term)));
  }, [search, vendors]);

  const selected = vendors.find((vendor) => vendor.id === selectedVendorId) ?? null;
  const vendorBills = bills.filter((bill) => bill.vendorId === selectedVendorId);
  const vendorOrders = orders.filter((order) => order.vendorId === selectedVendorId);
  const today = localIsoDate();
  const openBalanceCents = vendorBills.reduce((sum, bill) => sum + bill.balanceDueCents, 0);
  const overdueCents = vendorBills.filter((bill) => bill.balanceDueCents > 0 && bill.dueDate < today).reduce((sum, bill) => sum + bill.balanceDueCents, 0);
  const paidCents = vendorBills.reduce((sum, bill) => sum + bill.paidCents, 0);

  const activity = useMemo<ActivityRow[]>(() => {
    const billRows: ActivityRow[] = vendorBills.map((bill) => ({
      key: `bill-${bill.id}`,
      date: bill.billDate,
      createdAt: bill.createdAt ?? null,
      kind: 'Bill',
      reference: bill.billNumber ?? `Bill #${bill.id}`,
      amountCents: bill.amountCents,
      status: bill.balanceDueCents === 0 ? 'Paid' : bill.paidCents > 0 ? 'Part paid' : 'Unpaid',
      billId: bill.id,
    }));
    const orderRows: ActivityRow[] = vendorOrders.map((order) => ({
      key: `order-${order.id}`,
      date: order.orderDate,
      createdAt: order.createdAt ?? null,
      kind: 'Purchase order',
      reference: order.poNumber,
      amountCents: order.totalCents,
      status: order.status,
      purchaseOrderId: order.id,
    }));
    return [...billRows, ...orderRows]
      .filter((row) => activityFilter === 'all' || (activityFilter === 'bills' ? row.kind === 'Bill' : row.kind === 'Purchase order'))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [activityFilter, vendorBills, vendorOrders]);

  return (
    <div className="grid min-h-[34rem] grid-cols-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="border-b border-gray-200 bg-gray-50 lg:border-b-0 lg:border-r">
        <div className="border-b border-gray-200 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vendors</div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or details…"
            className="mt-2 w-full rounded border border-gray-300 bg-white px-2.5 py-2 text-sm"
          />
        </div>
        <div className="max-h-[40rem] overflow-y-auto p-2">
          {filteredVendors.map((vendor) => {
            const balance = bills.filter((bill) => bill.vendorId === vendor.id).reduce((sum, bill) => sum + bill.balanceDueCents, 0);
            return (
              <button
                key={vendor.id}
                type="button"
                onClick={() => setSelectedVendorId(vendor.id)}
                className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${selectedVendorId === vendor.id ? 'bg-brand-100 text-brand-900 ring-1 ring-brand-200' : 'hover:bg-white'}`}
              >
                <div className="truncate font-semibold">{vendor.name}</div>
                <div className="mt-0.5 text-xs text-gray-500"><Money cents={balance} /> open</div>
              </button>
            );
          })}
          {filteredVendors.length === 0 && <p className="p-3 text-sm text-gray-400">No matching vendor.</p>}
        </div>
      </aside>

      <section className="min-w-0 p-3">
        {!selected ? (
          <div className="py-5 text-center text-sm text-gray-400">Select a vendor to see its complete history.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-brand-900">{selected.name}</h2>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                  {selected.email && <span>{selected.email}</span>}
                  {selected.phone && <span>{selected.phone}</span>}
                  {selected.address && <span>{selected.address}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setEditing(selected)} className={buttonClass('secondary')}>Edit vendor</button>
                <button type="button" onClick={() => setMergeOpen(true)} className={buttonClass('secondary')} title="Fold a duplicate vendor into this one">Merge duplicate…</button>
                <button type="button" onClick={onNewBill} className={buttonClass('primary')}>New bill</button>
                <button type="button" onClick={() => setView({ kind: 'purchaseOrderEditor', id: 'new' })} className={buttonClass('secondary')}>New purchase order</button>
              </div>
            </div>

            {selected.notes && <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600"><span className="font-medium text-gray-700">Notes:</span> {selected.notes}</div>}

            <div>
              <ContactPaymentHistory kind="vendor" contactId={selected.id} contactName={selected.name} onPay={onPayBill} />
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-2">
              {(['all', 'bills', 'orders'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setActivityFilter(value)}
                  className={`rounded-full px-3 py-1 text-sm ${activityFilter === value ? 'bg-brand-100 font-medium text-brand-800' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {value === 'all' ? 'All activity' : value === 'bills' ? 'Bills' : 'Purchase orders'}
                </button>
              ))}
            </div>

            {activity.length === 0 ? <p className="py-5 text-center text-sm text-gray-400">No transactions for this vendor.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400"><th className="pb-2">Date</th><EnteredTh className="pb-2" /><th className="pb-2">Type</th><th className="pb-2">Reference</th><th className="pb-2">Status</th><th className="pb-2 text-right">Total</th><th className="pb-2" /></tr></thead>
                  <tbody>{activity.map((row) => (
                    <tr key={row.key} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 tabular-nums text-gray-600">{row.date}</td><EnteredTd at={row.createdAt} className="py-2" />
                      <td className="py-2">{row.kind}</td>
                      <td className="py-2 font-medium">{row.reference}</td>
                      <td className="py-2 capitalize text-gray-600">{row.status}</td>
                      <td className="py-2 text-right font-medium"><Money cents={row.amountCents} /></td>
                      <td className="py-2 text-right"><button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => row.kind === 'Bill' ? setView({ kind: 'purchases', tab: row.status === 'Paid' ? 'paid' : 'unpaid', billId: row.billId }) : setView({ kind: 'purchaseOrderEditor', id: row.purchaseOrderId })}>View entry</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <MergeContactModal kind="vendor" keep={selected} others={vendors} open={mergeOpen} onClose={() => setMergeOpen(false)} onMerged={onRefresh} />
      <ContactFormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); onRefresh(); }}
        editing={editing}
        kind="vendor"
      />
    </div>
  );
}

