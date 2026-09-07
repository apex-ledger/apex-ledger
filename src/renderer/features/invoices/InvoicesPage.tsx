import { useEffect, useState } from 'react';
import type { Contact, Invoice } from '@shared/domain/types';
import { Money } from '../../components/Money';
import { CommandCentreSection, FlowArrow, FlowBox, FlowRow } from '../../components/CommandCentreFlow';
import { useUiStore } from '../../app/store/uiStore';
import { ReceivePaymentModal } from './ReceivePaymentModal';
import { MakeDepositModal } from './MakeDepositModal';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';

/** `embedded` is set when this screen is shown inside the Sales hub, which already prints the
 * section title and description in its own panel header. Without it the page repeats them, and the
 * workflow strip repeats the rail underneath the rail — two headings and two sets of navigation for
 * one screen. The actions stay; only the duplication goes. */
export function InvoicesPage({ embedded }: { embedded?: boolean } = {}) {
  const setView = useUiStore((s) => s.setView);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [receivingInvoiceId, setReceivingInvoiceId] = useState<number | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undepositedCount, setUndepositedCount] = useState(0);

  async function refresh() {
    const [invoicesResult, customersResult, undepositedResult] = await Promise.all([window.api.invoices.list(), window.api.customers.list(), window.api.deposits.getUndeposited()]);
    if (invoicesResult.ok) setInvoices(invoicesResult.data);
    if (customersResult.ok) setCustomers(customersResult.data.filter((c) => c.isActive));
    if (undepositedResult.ok) setUndepositedCount(undepositedResult.data.length);
  }

  useEffect(() => {
    refresh();
  }, []);

  const customerNameById = new Map(customers.map((c) => [c.id, c.name]));

  async function handleDelete(invoice: Invoice) {
    const customerName = customerNameById.get(invoice.customerId) ?? 'this customer';
    if (!window.confirm(`Delete invoice ${invoice.invoiceNumber} for ${customerName}? This permanently removes the invoice and voids its linked accounting entry. This cannot be undone.`)) return;
    setError(null);
    const result = await window.api.invoices.delete(invoice.id);
    if (!result.ok) return setError(result.error);
    refresh();
  }

  return (
    <div className="space-y-3">
      {!embedded && (
        <CommandCentreSection title="Sales Workflow">
          <FlowRow nowrap>
            <FlowBox label="New Invoice" tone="sky" onClick={() => setView({ kind: 'invoiceEditor', id: 'new' })} />
            <FlowArrow />
            <FlowBox label="Receive Payment" onClick={() => {}} current />
            <FlowBox label="New Sales Receipt" tone="emerald" onClick={() => setView({ kind: 'salesReceiptEditor', id: 'new' })} />
            <FlowArrow />
            <FlowBox label="General Ledger" tone="amber" onClick={() => setView({ kind: 'report', report: 'generalLedger' })} />
          </FlowRow>
        </CommandCentreSection>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {!embedded && (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-lg font-semibold text-brand-900">Invoices</h1>
                <p className="text-sm text-gray-500">Bill customers and mark invoices paid when they settle.</p>
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setView({ kind: 'invoiceEditor', id: 'new' })}
            className="rounded-full bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            + New Invoice
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
        {invoices.length === 0 ? (
          <p className="text-sm text-gray-400">No invoices yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-2">Invoice #</th>
                <th className="pb-2">Customer</th>
                <th className="pb-2">Invoice Date</th><EnteredTh className="pb-2" />
                <th className="pb-2">Due Date</th>
                <th className="pb-2 text-right">Total</th>
                <th className="pb-2 text-right">Balance</th>
                <th className="pb-2">Status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-100">
                  <td className="py-2 font-medium text-gray-800">
                    <button type="button" onClick={() => setView({ kind: 'invoiceEditor', id: inv.id })} className="hover:underline">
                      {inv.invoiceNumber}
                    </button>
                  </td>
                  <td className="py-2 text-gray-600">
                    <button type="button" onClick={() => setView({ kind: 'sales', tab: 'customers', customerId: inv.customerId })} className="text-left text-brand-700 hover:underline" title="Open customer history">
                      {customerNameById.get(inv.customerId) ?? '—'}
                    </button>
                  </td>
                  <td className="py-2 text-gray-600">{inv.invoiceDate}</td><EnteredTd at={inv.createdAt} className="py-2" />
                  <td className="py-2 text-gray-600">{inv.dueDate}</td>
                  <td className="py-2 text-right">
                    <Money cents={inv.totalCents} />
                    {inv.foreignCurrency && (
                      <div className="text-xs text-gray-400">
                        {inv.foreignCurrency} ${((inv.foreignAmountCents ?? 0) / 100).toFixed(2)} @ {inv.exchangeRate}
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-right font-medium"><Money cents={inv.balanceDueCents} /></td>
                  <td className="py-2">
                    {inv.balanceDueCents === 0 ? (
                      <span className="rounded bg-green-300 px-1.5 py-0.5 text-xs text-green-900">paid</span>
                    ) : inv.paidCents > 0 ? (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">partial</span>
                    ) : (
                      <span className="rounded bg-amber-300 px-1.5 py-0.5 text-xs text-amber-900">unpaid</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {inv.balanceDueCents > 0 ? (
                      <>
                        <button type="button" onClick={() => setReceivingInvoiceId(inv.id)} className="mr-2 text-xs font-medium text-brand-600 hover:underline">
                          Receive Payment
                        </button>
                        {inv.paidCents === 0 && <button type="button" onClick={() => handleDelete(inv)} className="text-xs font-medium text-red-500 hover:underline">Delete</button>}
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
      </div>

      <ReceivePaymentModal open={receivingInvoiceId !== null} onClose={() => setReceivingInvoiceId(null)} onReceived={refresh} invoiceId={receivingInvoiceId} />
      <MakeDepositModal open={showDepositModal} onClose={() => setShowDepositModal(false)} onDeposited={refresh} customers={customers} />
    </div>
  );
}
