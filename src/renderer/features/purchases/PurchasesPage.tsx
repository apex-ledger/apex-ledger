import { useEffect, useMemo, useState } from 'react';
import type { Bill, BillPayment, BillStatus, Contact } from '@shared/domain/types';
import { BillFormModal } from './BillFormModal';
import { PayBillModal } from './PayBillModal';
import { BulkPayBillsModal } from './BulkPayBillsModal';
import { Money } from '../../components/Money';
import { CommandCentreSection, FlowArrow, FlowBox, FlowRow } from '../../components/CommandCentreFlow';
import { useUiStore } from '../../app/store/uiStore';
import { APPROVAL_LABELS, canTransition, isPayable, type ApprovalStatus } from '@shared/domain/purchases/billApproval';
import { buttonClass } from '../../components/Button';
import { JournalEntryLink } from '../../components/JournalEntryLink';
import { VendorWorkspace } from './VendorWorkspace';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';

// QuickBooks' Bills screen has a third "For Review" tab for bills a bank feed or OCR scan pulled
// in but hasn't been confirmed yet. There's no equivalent stage here — every bill in this app is
// only ever created already-confirmed via "+ Enter Purchase Invoice" or Receipt Inbox — so Unpaid/Paid is the
// full set, not a subset of a larger review queue.
type BillTab = BillStatus | 'vendors';

/** See the note on InvoicesPage: `embedded` drops the heading and workflow strip that the Expenses
 * hub already provides. */
export function PurchasesPage({ embedded, requestedTab, requestedBillId, requestedVendorId }: { embedded?: boolean; requestedTab?: BillTab; requestedBillId?: number; requestedVendorId?: number } = {}) {
  const setView = useUiStore((s) => s.setView);
  const [bills, setBills] = useState<Bill[]>([]);
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [showBillModal, setShowBillModal] = useState(false);
  const [payingBillId, setPayingBillId] = useState<number | null>(null);
  const [tab, setTab] = useState<BillTab>(requestedTab ?? 'unpaid');
  const [search, setSearch] = useState('');
  const pendingSearchTerm = useUiStore((s) => s.pendingSearchTerm);
  const setPendingSearchTerm = useUiStore((s) => s.setPendingSearchTerm);
  useEffect(() => {
    if (!pendingSearchTerm) return;
    setSearch(pendingSearchTerm);
    setPendingSearchTerm(null);
  }, [pendingSearchTerm, setPendingSearchTerm]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkPay, setShowBulkPay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [billsResult, vendorsResult, paymentsResult] = await Promise.all([window.api.bills.list(), window.api.vendors.list(), window.api.bills.payments()]);
    if (billsResult.ok) setBills(billsResult.data);
    if (vendorsResult.ok) setVendors(vendorsResult.data.filter((v) => v.isActive));
    if (paymentsResult.ok) setPayments(paymentsResult.data);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab]);

  useEffect(() => {
    if (requestedTab) setTab(requestedTab);
  }, [requestedTab]);

  // Inside the Expenses hub the row of tabs above this component owns the choice; a bill row that
  // asks for the paid list must move that row, not just this component's state.
  useEffect(() => {
    if (embedded && requestedTab && tab !== requestedTab) setView({ kind: 'purchases', tab, billId: requestedBillId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (requestedVendorId !== undefined) setTab('vendors');
  }, [requestedVendorId]);

  useEffect(() => {
    if (requestedBillId === undefined) return;
    setSearch('');
    const bill = bills.find((row) => row.id === requestedBillId);
    if (bill) setTab(bill.status);
    const timer = window.setTimeout(() => document.getElementById(`vendor-bill-${requestedBillId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
    return () => window.clearTimeout(timer);
  }, [requestedBillId, bills]);

  const vendorNameById = new Map(vendors.map((v) => [v.id, v.name]));

  const tabBills = useMemo(() => bills.filter((b) => b.status === tab), [bills, tab]);
  const visibleBills = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tabBills;
    return tabBills.filter((b) => (vendorNameById.get(b.vendorId) ?? '').toLowerCase().includes(term) || (b.billNumber ?? '').toLowerCase().includes(term));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabBills, search, vendors]);

  /** Approval, changed in place. The report screen has the same controls; this is where somebody
   * already looking at the bill list can act without going and finding another screen. */
  async function setApproval(id: number, next: ApprovalStatus) {
    let note: string | null = null;
    if (next === 'rejected') {
      // A rejection nobody can explain later is worse than no record of it at all.
      note = window.prompt('Why is this bill being rejected?')?.trim() || null;
      if (!note) return;
    }
    const result = await window.api.bills.setApproval({ id, approvalStatus: next, note });
    if (!result.ok) window.alert(result.error);
    else refresh();
  }

  const unpaidCount = bills.filter((b) => b.status === 'unpaid').length;
  const paidCount = bills.filter((b) => b.status === 'paid').length;
  const selectedBills = bills.filter((b) => selectedIds.has(b.id));

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === visibleBills.length ? new Set() : new Set(visibleBills.map((b) => b.id))));
  }

  async function handleDelete(bill: Bill) {
    const vendorName = vendorNameById.get(bill.vendorId) ?? 'this vendor';
    const documentLabel = bill.billNumber ? `vendor invoice ${bill.billNumber}` : `the vendor bill from ${vendorName}`;
    if (
      !window.confirm(
        `Delete ${documentLabel}? This permanently removes the vendor transaction and voids its linked accounting entry. This cannot be undone.`,
      )
    ) return;
    setError(null);
    const result = await window.api.bills.delete(bill.id);
    if (!result.ok) return setError(result.error);
    refresh();
  }

  async function reverseLastPayment(bill: Bill) {
    const vendorName = vendorNameById.get(bill.vendorId) ?? 'this vendor';
    const documentLabel = bill.billNumber ? `vendor invoice ${bill.billNumber}` : `the vendor bill from ${vendorName}`;
    if (!window.confirm(`Reverse the newest payment on ${documentLabel}? The payment journal entry will be voided and the balance reopened.`)) return;
    setError(null);
    const result = await window.api.bills.reverseLastPayment(bill.id);
    if (!result.ok) return setError(result.error);
    refresh();
  }

  return (
    <div className="space-y-2">
      {!embedded && (
        <CommandCentreSection title="Purchase workflow">
          <FlowRow nowrap>
            <FlowBox label="Enter Purchase Invoice" tone="rose" onClick={() => setShowBillModal(true)} />
            <FlowArrow />
            <FlowBox label="Pay Bills" tone="cyan" onClick={() => setTab('unpaid')} />
            <FlowArrow />
            <FlowBox label="General Ledger" tone="amber" onClick={() => setView({ kind: 'report', report: 'generalLedger' })} />
            <span className="mx-1 text-gray-300" aria-hidden>·</span>
            <FlowBox label="Purchase Orders — order → receive → match bill" tone="violet" onClick={() => setView({ kind: 'purchaseOrders' })} />
          </FlowRow>
        </CommandCentreSection>
      )}

      {tab !== 'vendors' && <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {!embedded && (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-lg font-semibold text-brand-900">Purchase Invoices</h1>
                <p className="text-sm text-gray-500">Enter vendor bills and mark them paid when settled.</p>
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowBillModal(true)}
            className={buttonClass('primary')}
          >
            + Enter Bill
          </button>
        </div>
      </div>}

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
        {!embedded && <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setTab('unpaid')}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === 'unpaid' ? 'bg-brand-300 text-brand-900' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
          >
            Unpaid ({unpaidCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('paid')}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === 'paid' ? 'bg-brand-300 text-brand-900' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
          >
            Paid ({paidCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('vendors')}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === 'vendors' ? 'bg-teal-200 text-teal-900 ring-1 ring-teal-300' : 'bg-teal-50 text-teal-800 hover:bg-teal-100'}`}
          >
            Vendors ({vendors.length})
          </button>
        </div>}
        {tab !== 'vendors' && <input
          className="w-56 rounded border border-gray-300 px-3 py-1.5 text-sm"
          placeholder="Search vendor or invoice #…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />}
        {tab === 'unpaid' && selectedIds.size > 0 && (
          <button
            type="button"
            onClick={() => setShowBulkPay(true)}
            className={buttonClass('primary')}
          >
            Pay Selected ({selectedIds.size})
          </button>
        )}
      </div>

      {tab === 'vendors' ? (
        <VendorWorkspace onPayBill={(id) => setPayingBillId(id)}
          vendors={vendors}
          bills={bills}
          requestedVendorId={requestedVendorId}
          onNewBill={() => setShowBillModal(true)}
          onRefresh={refresh}
        />
      ) : <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        {visibleBills.length === 0 ? (
          <p className="text-sm text-gray-400">{tab === 'unpaid' ? 'No unpaid bills.' : 'No paid bills yet.'}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                {tab === 'unpaid' && (
                  <th className="w-8 pb-2">
                    <input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === visibleBills.length} onChange={toggleSelectAll} />
                  </th>
                )}
                <th className="pb-2">Vendor</th>
                <th className="pb-2">Invoice #</th>
                <th className="pb-2">Bill Date</th><EnteredTh className="pb-2" />
                <th className="pb-2">Due Date</th>
                <th className="pb-2 text-right">Amount</th>
                <th className="pb-2 text-right">Balance</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Approval</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {visibleBills.map((b) => (
                <tr id={`vendor-bill-${b.id}`} key={b.id} className={`border-b border-gray-100 ${requestedBillId === b.id ? 'bg-amber-100 ring-2 ring-inset ring-amber-300' : ''}`}>
                  {tab === 'unpaid' && (
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(b.id)}
                        disabled={!isPayable(b.approvalStatus)}
                        title={isPayable(b.approvalStatus) ? undefined : 'Only an approved bill can be paid.'}
                        onChange={() => toggleSelected(b.id)}
                      />
                    </td>
                  )}
                  <td className="py-2 font-medium text-gray-800">
                    <button
                      type="button"
                      onClick={() => setView({ kind: 'purchases', tab: 'vendors', vendorId: b.vendorId })}
                      className="text-left text-brand-700 hover:underline"
                      title="Open vendor history"
                    >
                      {vendorNameById.get(b.vendorId) ?? '—'}
                    </button>
                  </td>
                  <td className="py-2 text-gray-600">
                    {b.billNumber ?? 'No vendor invoice number'}
                    {(b.lines?.length ?? 0) > 1 && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">Split · {b.lines!.length} lines</span>}
                  </td>
                  <td className="py-2 text-gray-600">{b.billDate}</td><EnteredTd at={b.createdAt} className="py-2" />
                  <td className="py-2 text-gray-600">{b.dueDate}</td>
                  <td className="py-2 text-right">
                    <Money cents={b.amountCents} />
                    {b.foreignCurrency && (
                      <div className="text-xs text-gray-400">
                        {b.foreignCurrency} ${((b.foreignAmountCents ?? 0) / 100).toFixed(2)} @ {b.exchangeRate}
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-right font-medium"><Money cents={b.balanceDueCents} /></td>
                  <td className="py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${b.balanceDueCents === 0 ? 'bg-green-100 text-green-800 ring-1 ring-green-200' : b.paidCents > 0 ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-200' : 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'}`}>{b.balanceDueCents === 0 ? 'paid' : b.paidCents > 0 ? 'partial' : 'unpaid'}</span>
                  </td>
                  <td className="py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        b.approvalStatus === 'approved'
                          ? 'bg-emerald-50 text-emerald-800'
                          : b.approvalStatus === 'rejected'
                            ? 'bg-rose-50 text-rose-800'
                            : b.approvalStatus === 'onHold'
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-amber-50 text-amber-800'
                      }`}
                      title={b.approvalNote ?? undefined}
                    >
                      {APPROVAL_LABELS[b.approvalStatus]}
                    </span>
                    <div className="mt-1 flex gap-1">
                      {(['approved', 'onHold', 'rejected'] as ApprovalStatus[])
                        .filter((next) => canTransition(b.approvalStatus, next))
                        .map((next) => (
                          <button
                            key={next}
                            type="button"
                            onClick={() => void setApproval(b.id, next)}
                            className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                          >
                            {next === 'approved' ? 'Approve' : next === 'onHold' ? 'Hold' : 'Reject'}
                          </button>
                        ))}
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    <JournalEntryLink id={b.billJournalEntryId} label="Bill GL" className="mr-2" />
                    {b.paymentJournalEntryId && <JournalEntryLink id={b.paymentJournalEntryId} label="Payment GL" className="mr-2" />}
                    {b.paidCents > 0 && (
                      <button type="button" onClick={() => reverseLastPayment(b)} className="mr-2 text-xs font-medium text-amber-700 hover:underline">
                        Reverse Last Payment
                      </button>
                    )}
                    {payments.filter((payment) => payment.billId === b.id).map((payment) => (
                      <div key={payment.id} className="mt-1 text-[11px] text-gray-500">
                        {payment.paymentDate} · <Money cents={payment.amountCents} /> · <JournalEntryLink id={payment.journalEntryId} label="Open GL" />
                      </div>
                    ))}
                    {b.receiptFilePath && (
                      <button
                        type="button"
                        onClick={() => window.api.receiptInbox.openFile(b.receiptFilePath as string)}
                        className="mr-2 text-xs font-medium text-gray-500 hover:underline"
                      >
                        View Receipt
                      </button>
                    )}
                    {b.balanceDueCents > 0 ? (
                      <>
                        {isPayable(b.approvalStatus) ? (
                          <button type="button" onClick={() => setPayingBillId(b.id)} className="mr-2 text-xs font-medium text-brand-600 hover:underline">
                            Pay
                          </button>
                        ) : (
                          // Hidden rather than shown-and-refused: the payment screen would only turn
                          // it away, after the work of filling it in.
                          <span className="mr-2 text-xs text-gray-400" title="Only an approved bill can be paid.">
                            Needs approval
                          </span>
                        )}
                        {b.paidCents === 0 && <button type="button" onClick={() => handleDelete(b)} className="text-xs font-medium text-red-500 hover:underline">Delete</button>}
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">Paid in full</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>}

      <BillFormModal open={showBillModal} onClose={() => setShowBillModal(false)} onSaved={refresh} vendors={vendors} />
      <PayBillModal open={payingBillId !== null} onClose={() => setPayingBillId(null)} onPaid={refresh} billId={payingBillId} />
      <BulkPayBillsModal
        open={showBulkPay}
        onClose={() => setShowBulkPay(false)}
        onPaid={() => {
          setSelectedIds(new Set());
          refresh();
        }}
        bills={selectedBills}
      />
    </div>
  );
}
