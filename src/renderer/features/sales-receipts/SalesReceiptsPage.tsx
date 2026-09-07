import { useEffect, useState } from 'react';
import type { Contact, SalesReceipt } from '@shared/domain/types';
import { Money } from '../../components/Money';
import { useUiStore } from '../../app/store/uiStore';
import { MakeDepositModal } from '../invoices/MakeDepositModal';
import { JournalEntryLink } from '../../components/JournalEntryLink';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';

export function SalesReceiptsPage() {
  const setView = useUiStore((s) => s.setView);
  const [receipts, setReceipts] = useState<SalesReceipt[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [undepositedFundsId, setUndepositedFundsId] = useState<number | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [receiptsResult, customersResult, undepositedResult] = await Promise.all([
      window.api.salesReceipts.list(),
      window.api.customers.list(),
      window.api.salesReceipts.undepositedFundsAccountId(),
    ]);
    if (receiptsResult.ok) setReceipts(receiptsResult.data);
    if (customersResult.ok) setCustomers(customersResult.data.filter((c) => c.isActive));
    if (undepositedResult.ok) setUndepositedFundsId(undepositedResult.data);
  }

  useEffect(() => {
    refresh();
  }, []);

  const customerNameById = new Map(customers.map((c) => [c.id, c.name]));
  const undepositedCount = receipts.filter((r) => r.depositId === null && r.depositToAccountId === undepositedFundsId).length;

  async function handleDelete(id: number) {
    if (!window.confirm('Delete this sales receipt? Its linked accounting entry will be voided. This cannot be undone.')) return;
    setError(null);
    const result = await window.api.salesReceipts.delete(id);
    if (!result.ok) return setError(result.error);
    refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold text-brand-900">Sales Receipts</h1>
            <p className="text-sm text-gray-500">Record money received in full at the time of sale — no unpaid state, no invoice to chase.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setView({ kind: 'salesReceiptEditor', id: 'new' })}
            className="rounded-full bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-200"
          >
            + New Sales Receipt
          </button>
          <button
            type="button"
            disabled={undepositedCount === 0}
            onClick={() => setShowDepositModal(true)}
            className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            Make Deposit{undepositedCount > 0 ? ` (${undepositedCount})` : ''}
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        {receipts.length === 0 ? (
          <p className="text-sm text-gray-400">No sales receipts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-2">Receipt #</th>
                <th className="pb-2">Customer</th>
                <th className="pb-2">Date</th><EnteredTh className="pb-2" />
                <th className="pb-2 text-right">Total</th>
                <th className="pb-2">Status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 font-medium text-gray-800">
                    <button type="button" onClick={() => setView({ kind: 'salesReceiptEditor', id: r.id })} className="hover:underline">
                      {r.receiptNumber}
                    </button>
                  </td>
                  <td className="py-2 text-gray-600">{customerNameById.get(r.customerId) ?? '—'}</td>
                  <td className="py-2 text-gray-600">{r.receiptDate}</td><EnteredTd at={r.createdAt} className="py-2" />
                  <td className="py-2 text-right">
                    <Money cents={r.totalCents} />
                    {r.foreignCurrency && (
                      <div className="text-xs text-gray-400">
                        {r.foreignCurrency} ${((r.foreignAmountCents ?? 0) / 100).toFixed(2)} @ {r.exchangeRate}
                      </div>
                    )}
                  </td>
                  <td className="py-2">
                    {r.depositId !== null ? (
                      <span className="rounded bg-green-300 px-1.5 py-0.5 text-xs text-green-900">deposited</span>
                    ) : r.depositToAccountId === undepositedFundsId ? (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800" title="Received, sitting in Undeposited Funds until deposited">
                        undeposited
                      </span>
                    ) : (
                      <span className="rounded bg-green-300 px-1.5 py-0.5 text-xs text-green-900">paid</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <JournalEntryLink id={r.journalEntryId} className="mr-2" />
                    {r.depositId === null ? (
                      <button type="button" onClick={() => handleDelete(r.id)} className="text-xs font-medium text-red-500 hover:underline">
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <MakeDepositModal open={showDepositModal} onClose={() => setShowDepositModal(false)} onDeposited={refresh} customers={customers} />
    </div>
  );
}
