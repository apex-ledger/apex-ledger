import { useEffect, useMemo, useState } from 'react';
import type { Contact, CreditNote, Invoice, SalesReceipt } from '@shared/domain/types';
import type { EstimateRow } from '../../../preload/index';
import { ESTIMATE_LABELS, isSalesOrder } from '@shared/domain/sales/commitmentDocuments';
import { Money } from '../../components/Money';
import { buttonClass } from '../../components/Button';
import { ContactFormModal } from '../contacts/ContactFormModal';
import { ReceivePaymentModal } from '../invoices/ReceivePaymentModal';
import { useUiStore } from '../../app/store/uiStore';
import { useDataChangeStore } from '../../app/store/dataChangeStore';
import { ContactPaymentHistory } from '../../components/ContactPaymentHistory';
import { EnteredTd, EnteredTh } from '../../components/EnteredCell';
import { CustomerStatementsModal } from './CustomerStatementsModal';
import { MergeContactModal } from '../../components/MergeContactModal';

type ActivityKind = 'Invoice' | 'Estimate' | 'Sales order' | 'Sales receipt' | 'Credit note';
type ActivityFilter = 'all' | 'invoices' | 'estimates' | 'receipts' | 'credits';

interface ActivityRow {
  key: string;
  date: string;
  createdAt: string | null;
  kind: ActivityKind;
  reference: string;
  amountCents: number;
  status: string;
  open: () => void;
}

const FILTERS: Array<{ id: ActivityFilter; label: string; kinds: ActivityKind[] }> = [
  { id: 'all', label: 'All activity', kinds: ['Invoice', 'Estimate', 'Sales order', 'Sales receipt', 'Credit note'] },
  { id: 'invoices', label: 'Invoices', kinds: ['Invoice'] },
  { id: 'estimates', label: 'Estimates & orders', kinds: ['Estimate', 'Sales order'] },
  { id: 'receipts', label: 'Sales receipts', kinds: ['Sales receipt'] },
  { id: 'credits', label: 'Credit notes', kinds: ['Credit note'] },
];

/** The customer side of the vendor workspace: every customer down the left, and for the one
 * picked, what they owe, every invoice with its payments, and the full activity trail — invoices,
 * estimates, sales orders, receipts and credit notes — with a way to open each. Same shape as
 * the vendor page so nobody has to learn two layouts. */
export function CustomerWorkspace({ requestedCustomerId }: { requestedCustomerId?: number }) {
  const setView = useUiStore((state) => state.setView);
  const dataVersion = useDataChangeStore((state) => state.version);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [estimates, setEstimates] = useState<EstimateRow[]>([]);
  const [receipts, setReceipts] = useState<SalesReceipt[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(requestedCustomerId ?? null);
  const [search, setSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [editing, setEditing] = useState<Contact | null>(null);
  const [adding, setAdding] = useState(false);
  const [receivingInvoiceId, setReceivingInvoiceId] = useState<number | null>(null);
  const [statementsOpen, setStatementsOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [interestNotice, setInterestNotice] = useState<string | null>(null);

  async function refresh() {
    const [c, i, e, r, n] = await Promise.all([
      window.api.customers.list(),
      window.api.invoices.list({}),
      window.api.estimates.list(),
      window.api.salesReceipts.list(),
      window.api.creditNotes.list(),
    ]);
    if (c.ok) setCustomers(c.data.filter((row) => row.isActive));
    if (i.ok) setInvoices(i.data);
    if (e.ok) setEstimates(e.data);
    if (r.ok) setReceipts(r.data);
    if (n.ok) setCreditNotes(n.data.filter((row) => row.kind === 'customer'));
  }

  useEffect(() => {
    void refresh();
  }, [dataVersion]);

  useEffect(() => {
    if (requestedCustomerId !== undefined) setSelectedCustomerId(requestedCustomerId);
  }, [requestedCustomerId]);

  useEffect(() => {
    if (selectedCustomerId === null && customers.length > 0) setSelectedCustomerId(customers[0].id);
    if (selectedCustomerId !== null && customers.length > 0 && !customers.some((customer) => customer.id === selectedCustomerId)) setSelectedCustomerId(customers[0].id);
  }, [customers, selectedCustomerId]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) => [customer.name, customer.companyName, customer.contactName, customer.email, customer.phone, customer.address]
      .some((value) => value?.toLowerCase().includes(term)));
  }, [search, customers]);

  const selected = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  /** Credit notes not yet applied to an invoice or refunded: money the customer can put against the next bill. */
  const creditAvailableCents = creditNotes.filter((n) => n.contactId === selectedCustomerId && n.status === 'open').reduce((s, n) => s + Math.max(0, n.totalCents - n.appliedCents), 0);
  const overdueOpen = invoices.some((inv) => inv.customerId === selectedCustomerId && inv.balanceDueCents > 0 && inv.dueDate < new Date().toISOString().slice(0, 10));

  async function chargeInterest() {
    if (!selected) return;
    setInterestNotice(null);
    const preview = await window.api.invoices.lateInterestPreview({ customerId: selected.id });
    if (!preview.ok) return setInterestNotice(preview.error);
    if (preview.data.lines.length === 0) return setInterestNotice('Nothing to charge: no overdue balance beyond the last interest date.');
    const detail = preview.data.lines.map((l) => `${l.invoiceNumber}: ${l.days} days on $${(l.balanceDueCents / 100).toFixed(2)} = $${(l.interestCents / 100).toFixed(2)}`).join('\n');
    if (!window.confirm(`Charge ${selected.name} late-payment interest at ${preview.data.ratePercent}% a year, as a new invoice for $${(preview.data.totalCents / 100).toFixed(2)}?\n\n${detail}`)) return;
    const result = await window.api.invoices.chargeLateInterest({ customerId: selected.id });
    if (!result.ok) return setInterestNotice(result.error);
    setInterestNotice(`Invoice ${result.data.invoiceNumber} raised for $${(result.data.totalCents / 100).toFixed(2)} of interest. Each overdue invoice is marked to ${preview.data.asOf}, so those days will not be charged again.`);
    await refresh();
  }

  const activity = useMemo<ActivityRow[]>(() => {
    if (selectedCustomerId === null) return [];
    const rows: ActivityRow[] = [];
    for (const invoice of invoices.filter((row) => row.customerId === selectedCustomerId)) {
      rows.push({ key: `inv-${invoice.id}`, date: invoice.invoiceDate, createdAt: invoice.createdAt ?? null, kind: 'Invoice', reference: invoice.invoiceNumber, amountCents: invoice.totalCents, status: invoice.balanceDueCents === 0 ? 'Paid' : invoice.paidCents > 0 ? 'Part paid' : 'Unpaid', open: () => setView({ kind: 'invoiceEditor', id: invoice.id }) });
    }
    for (const estimate of estimates.filter((row) => row.customerId === selectedCustomerId)) {
      const isOrder = isSalesOrder(estimate.status);
      rows.push({ key: `est-${estimate.id}`, date: estimate.estimateDate, createdAt: estimate.createdAt ?? null, kind: isOrder ? 'Sales order' : 'Estimate', reference: estimate.estimateNumber, amountCents: estimate.totalCents, status: estimate.convertedInvoiceId ? 'Invoiced' : ESTIMATE_LABELS[estimate.status] ?? estimate.status, open: () => setView({ kind: 'estimateEditor', id: estimate.id, asOrder: isOrder }) });
    }
    for (const receipt of receipts.filter((row) => row.customerId === selectedCustomerId)) {
      rows.push({ key: `rcpt-${receipt.id}`, date: receipt.receiptDate, createdAt: receipt.createdAt ?? null, kind: 'Sales receipt', reference: receipt.receiptNumber, amountCents: receipt.totalCents, status: receipt.depositId ? 'Deposited' : 'Received', open: () => setView({ kind: 'salesReceiptEditor', id: receipt.id }) });
    }
    for (const note of creditNotes.filter((row) => row.contactId === selectedCustomerId)) {
      rows.push({ key: `cn-${note.id}`, date: note.creditNoteDate, createdAt: note.createdAt ?? null, kind: 'Credit note', reference: note.creditNoteNumber, amountCents: -note.totalCents, status: note.status, open: () => setView({ kind: 'sales', tab: 'creditNotes' }) });
    }
    const kinds = FILTERS.find((f) => f.id === activityFilter)?.kinds ?? [];
    return rows.filter((row) => kinds.includes(row.kind)).sort((a, b) => b.date.localeCompare(a.date));
  }, [activityFilter, selectedCustomerId, invoices, estimates, receipts, creditNotes, setView]);

  return (
    <div className="grid min-h-[34rem] grid-cols-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:grid-cols-[16rem_minmax(0,1fr)]" data-testid="customer-workspace">
      <aside className="border-b border-gray-200 bg-gray-50 lg:border-b-0 lg:border-r">
        <div className="border-b border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Customers</div>
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => setStatementsOpen(true)} className="text-xs font-medium text-brand-700 hover:underline" title="Month-end statements for every customer with a balance">Statements</button>
              <button type="button" onClick={() => setAdding(true)} className="text-xs font-medium text-brand-700 hover:underline">+ Add</button>
            </span>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or details…"
            className="mt-2 w-full rounded border border-gray-300 bg-white px-2.5 py-2 text-sm"
          />
        </div>
        <div className="max-h-[40rem] overflow-y-auto p-2">
          {filteredCustomers.map((customer) => {
            const balance = invoices.filter((invoice) => invoice.customerId === customer.id).reduce((sum, invoice) => sum + invoice.balanceDueCents, 0);
            return (
              <button
                key={customer.id}
                type="button"
                onClick={() => setSelectedCustomerId(customer.id)}
                className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${selectedCustomerId === customer.id ? 'bg-brand-100 text-brand-900 ring-1 ring-brand-200' : 'hover:bg-white'}`}
              >
                <div className="truncate font-semibold">{customer.name}</div>
                <div className="mt-0.5 text-xs text-gray-500"><Money cents={balance} /> owing</div>
              </button>
            );
          })}
          {filteredCustomers.length === 0 && <p className="p-3 text-sm text-gray-400">{customers.length === 0 ? 'No customers yet.' : 'No matching customer.'}</p>}
        </div>
      </aside>

      <section className="min-w-0 p-3">
        {!selected ? (
          <div className="py-5 text-center text-sm text-gray-400">Select a customer to see their complete history.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-brand-900">{selected.name}</h2>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                  {(selected.companyName || selected.contactName) && <span>{[selected.companyName, selected.contactName].filter(Boolean).join(' · ')}</span>}
                  {selected.email && <span>{selected.email}</span>}
                  {selected.phone && <span>{selected.phone}</span>}
                  {selected.address && <span>{selected.address}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setEditing(selected)} className={buttonClass('secondary')}>Edit customer</button>
                <button type="button" onClick={() => setMergeOpen(true)} className={buttonClass('secondary')} title="Fold a duplicate customer into this one">Merge duplicate…</button>
                <button type="button" onClick={() => setView({ kind: 'invoiceEditor', id: 'new', customerId: selected.id })} className={buttonClass('primary')}>New invoice</button>
                <button type="button" onClick={() => setView({ kind: 'estimateEditor', id: 'new', customerId: selected.id })} className={buttonClass('secondary')}>New estimate</button>
                <button type="button" onClick={() => setView({ kind: 'salesReceiptEditor', id: 'new', customerId: selected.id })} className={buttonClass('secondary')}>New sales receipt</button>
                {selected.lateInterestRatePercent ? (
                  <button type="button" disabled={!overdueOpen} onClick={() => void chargeInterest()} className={buttonClass('secondary')} title={overdueOpen ? `Bill interest at ${selected.lateInterestRatePercent}% a year on the overdue balance, as its own invoice` : 'Nothing overdue'}>
                    Charge late interest
                  </button>
                ) : null}
              </div>
            </div>
            {interestNotice && <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">{interestNotice}</div>}
            {creditAvailableCents > 0 && (
              <div className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                <span className="font-semibold">Credit available: <Money cents={creditAvailableCents} /></span> from credit notes not yet applied. Apply it to an open invoice from Sales → Credit notes, or refund it, before chasing the balance.
              </div>
            )}

            {selected.notes && <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600"><span className="font-medium text-gray-700">Notes:</span> {selected.notes}</div>}

            <ContactPaymentHistory kind="customer" contactId={selected.id} contactName={selected.name} onPay={(id) => setReceivingInvoiceId(id)} />

            <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-2">
              {FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setActivityFilter(filter.id)}
                  className={`rounded-full px-3 py-1 text-sm ${activityFilter === filter.id ? 'bg-brand-100 font-medium text-brand-800' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {activity.length === 0 ? <p className="py-5 text-center text-sm text-gray-400">No transactions for this customer.</p> : (
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
                      <td className="py-2 text-right"><button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={row.open}>View entry</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <ContactFormModal
        open={editing !== null || adding}
        onClose={() => { setEditing(null); setAdding(false); }}
        onSaved={() => { setEditing(null); setAdding(false); void refresh(); }}
        editing={editing}
        kind="customer"
      />
      <CustomerStatementsModal open={statementsOpen} onClose={() => setStatementsOpen(false)} />
      <MergeContactModal kind="customer" keep={selected} others={customers} open={mergeOpen} onClose={() => setMergeOpen(false)} onMerged={() => void refresh()} />
      <ReceivePaymentModal open={receivingInvoiceId !== null} onClose={() => setReceivingInvoiceId(null)} onReceived={() => { setReceivingInvoiceId(null); void refresh(); }} invoiceId={receivingInvoiceId} />
    </div>
  );
}
