import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { Combobox } from '../../components/Combobox';
import { CurrencyInput } from '../../components/CurrencyInput';
import type { Account, Contact, Invoice } from '@shared/domain/types';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { foreignOutstandingCents, settleForeignPayment } from '@shared/domain/currency/fxSettlement';

function today(): string {
  return localIsoDate();
}

/** Receive money against an invoice.
 *
 * Opened from an invoice it is already about that invoice. Opened from the toolbar it starts
 * with the customer, then lists only that customer's unpaid invoices — number, date and what is
 * still owed — so the right one is a pick, not a search. The amount defaults to the balance and
 * cannot exceed it; the rest stays open for a later payment.
 *
 * A foreign-currency invoice is received in its own currency: the amount box is in that
 * currency, the rate it converted at is asked for (Bank of Canada's rate for the payment date is
 * one click away), and the CAD that lands plus the exchange gain or loss are shown before saving. */
export function ReceivePaymentModal({
  open,
  onClose,
  onReceived,
  invoiceId,
}: {
  open: boolean;
  onClose: () => void;
  onReceived: () => void;
  /** The invoice to receive against, or null to choose one. */
  invoiceId: number | null;
}) {
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(invoiceId);
  const [paymentDate, setPaymentDate] = useState(today());
  const [amountCents, setAmountCents] = useState(0);
  const [foreignCents, setForeignCents] = useState(0);
  const [paymentRate, setPaymentRate] = useState<number | null>(null);
  const [rateNote, setRateNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [depositToAccountId, setDepositToAccountId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPaymentDate(today());
    setDepositToAccountId(null);
    setSelectedInvoiceId(invoiceId);
    setAmountCents(0);
    setForeignCents(0);
    setPaymentRate(null);
    setRateNote(null);
    Promise.all([window.api.accounts.list({ activeOnly: true }), window.api.invoices.list(), window.api.customers.list()]).then(([a, inv, cust]) => {
      if (a.ok) setAccounts(a.data.filter((x) => x.accountSubtype === 'Cash and Bank'));
      if (cust.ok) setCustomers(cust.data);
      if (inv.ok) {
        setInvoices(inv.data);
        const preset = invoiceId === null ? undefined : inv.data.find((row) => row.id === invoiceId);
        setCustomerId(preset?.customerId ?? null);
        if (preset) presetAmounts(preset);
      }
    });
  }, [open, invoiceId]);

  const unpaidForCustomer = useMemo(
    () => invoices.filter((row) => row.customerId === customerId && row.balanceDueCents > 0).sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate)),
    [invoices, customerId],
  );
  const invoice = invoices.find((row) => row.id === selectedInvoiceId) ?? null;
  const balanceCents = invoice?.balanceDueCents ?? 0;
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const customersWithBalance = customers.filter((c) => c.isActive && invoices.some((row) => row.customerId === c.id && row.balanceDueCents > 0));

  const isForeign = Boolean(invoice && invoice.foreignCurrency && invoice.foreignAmountCents !== null && invoice.exchangeRate !== null);
  const foreignOutstanding = invoice && isForeign ? foreignOutstandingCents(invoice.foreignAmountCents!, invoice.totalCents, invoice.balanceDueCents) : 0;
  const settlement = useMemo(() => {
    if (!invoice || !isForeign || paymentRate === null || foreignCents <= 0 || foreignCents > foreignOutstanding) return null;
    try {
      return settleForeignPayment({ foreignPaidCents: foreignCents, foreignOutstandingCents: foreignOutstanding, cadOutstandingCents: invoice.balanceDueCents, documentRate: invoice.exchangeRate!, paymentRate, side: 'receivable' });
    } catch {
      return null;
    }
  }, [invoice, isForeign, paymentRate, foreignCents, foreignOutstanding]);

  function presetAmounts(row: Invoice) {
    setAmountCents(row.balanceDueCents);
    if (row.foreignCurrency && row.foreignAmountCents !== null && row.exchangeRate !== null) {
      setForeignCents(foreignOutstandingCents(row.foreignAmountCents, row.totalCents, row.balanceDueCents));
      setPaymentRate(row.exchangeRate);
      setRateNote(`Invoice rate ${row.exchangeRate} pre-filled — change it to the rate the money actually converted at.`);
    } else {
      setForeignCents(0);
      setPaymentRate(null);
      setRateNote(null);
    }
  }

  function chooseInvoice(id: number | null) {
    setSelectedInvoiceId(id);
    const chosen = invoices.find((row) => row.id === id);
    if (chosen) presetAmounts(chosen);
    else { setAmountCents(0); setForeignCents(0); setPaymentRate(null); }
  }

  async function fetchRate() {
    if (!invoice?.foreignCurrency) return;
    setRateNote('Fetching the Bank of Canada rate…');
    const result = await window.api.fxRates.getOnDate(invoice.foreignCurrency, paymentDate);
    if (!result.ok) return setRateNote(result.error);
    setPaymentRate(result.data.rate);
    setRateNote(`Bank of Canada ${invoice.foreignCurrency}/CAD on ${result.data.date}: ${result.data.rate}`);
  }

  const canSubmit = invoice !== null && (isForeign ? settlement !== null : amountCents > 0 && amountCents <= balanceCents);

  async function handleReceive() {
    if (selectedInvoiceId === null || !canSubmit) return;
    setBusy(true);
    setError(null);
    const result = await window.api.invoices.receivePayment({
      id: selectedInvoiceId,
      paymentDate,
      bankAccountId: depositToAccountId,
      amountCents: isForeign && settlement ? settlement.cadRelievedCents : amountCents,
      foreignAmountCents: isForeign ? foreignCents : null,
      exchangeRate: isForeign ? paymentRate : null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onReceived();
    onClose();
  }

  return (
    <Modal fullScreen
      open={open}
      onClose={onClose}
      title="Receive Payment"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          <button type="button" disabled={busy || !canSubmit} onClick={handleReceive} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50">Receive Payment</button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <label className="block text-sm">
          <span className="text-gray-600">Customer</span>
          <Combobox
            options={(customersWithBalance.length > 0 ? customersWithBalance : customers.filter((c) => c.isActive)).map((c) => ({ value: String(c.id), label: c.name }))}
            value={customerId === null ? null : String(customerId)}
            onChange={(v) => {
              setCustomerId(v ? Number(v) : null);
              chooseInvoice(null);
            }}
            placeholder="Who is paying?"
          />
          {customersWithBalance.length === 0 && customers.length > 0 && <span className="mt-1 block text-xs text-gray-400">No customer has an unpaid invoice right now.</span>}
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Invoice</span>
          <select
            aria-label="Invoice"
            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            value={selectedInvoiceId === null ? '' : String(selectedInvoiceId)}
            onChange={(e) => chooseInvoice(e.target.value ? Number(e.target.value) : null)}
            disabled={customerId === null}
          >
            <option value="">{customerId === null ? 'Choose the customer first' : unpaidForCustomer.length === 0 ? 'No unpaid invoices for this customer' : 'Choose an unpaid invoice…'}</option>
            {unpaidForCustomer.map((row) => (
              <option key={row.id} value={row.id}>
                {row.invoiceNumber} — {row.invoiceDate} — {row.foreignCurrency ? `${row.foreignCurrency} ` : '$'}{row.foreignCurrency && row.foreignAmountCents !== null && row.exchangeRate !== null ? (foreignOutstandingCents(row.foreignAmountCents, row.totalCents, row.balanceDueCents) / 100).toFixed(2) : (row.balanceDueCents / 100).toFixed(2)} due{row.balanceDueCents < row.totalCents ? ` of ${row.foreignCurrency ? `${row.foreignCurrency} ${((row.foreignAmountCents ?? 0) / 100).toFixed(2)}` : `$${(row.totalCents / 100).toFixed(2)}`}` : ''}
              </option>
            ))}
          </select>
        </label>
        {invoice && (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {invoice.invoiceNumber} for {customerName.get(invoice.customerId) ?? 'customer'} · outstanding <span className="font-semibold text-gray-800"><Money cents={balanceCents} /></span>
            {isForeign && <span className="ml-1 text-gray-500">({invoice.foreignCurrency} {(foreignOutstanding / 100).toFixed(2)} at {invoice.exchangeRate})</span>}
            {invoice.dueDate < today() && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">overdue since {invoice.dueDate}</span>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Payment Date</span>
            <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={paymentDate} onChange={(e) => setPaymentDate(clampIsoDate(e.target.value))} />
          </label>
          {isForeign ? (
            <label className="block text-sm">
              <span className="text-gray-600">Amount Received ({invoice?.foreignCurrency})</span>
              <div className="mt-1"><CurrencyInput valueCents={foreignCents} onChange={setForeignCents} aria-label={`Amount received in ${invoice?.foreignCurrency}`} /></div>
              {foreignCents > foreignOutstanding && <span className="mt-1 block text-xs text-rose-700">More than is owed on this invoice.</span>}
            </label>
          ) : (
            <label className="block text-sm">
              <span className="text-gray-600">Amount Received</span>
              <div className="mt-1"><CurrencyInput valueCents={amountCents} onChange={setAmountCents} disabled={invoice === null} /></div>
              {invoice && amountCents > balanceCents && <span className="mt-1 block text-xs text-rose-700">More than is owed on this invoice.</span>}
            </label>
          )}
        </div>
        {isForeign && invoice && (
          <div className="rounded-lg border border-brand-100 bg-brand-50/40 p-3 text-sm">
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <label className="block">
                <span className="text-gray-600">Exchange rate the money converted at (CAD per 1 {invoice.foreignCurrency})</span>
                <input
                  type="number" step="0.0001" min="0.0001" aria-label="Payment exchange rate"
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 tabular-nums"
                  value={paymentRate ?? ''}
                  onChange={(e) => setPaymentRate(e.target.value ? Number(e.target.value) : null)}
                />
              </label>
              <button type="button" onClick={() => void fetchRate()} className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50">Bank of Canada rate for this date</button>
            </div>
            {rateNote && <p className="mt-1 text-xs text-gray-500">{rateNote}</p>}
            {settlement && (
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-gray-500">Applied to invoice (at {invoice.exchangeRate})</dt><dd className="font-semibold text-gray-800"><Money cents={settlement.cadRelievedCents} /></dd></div>
                <div><dt className="text-gray-500">Cash into bank (at {paymentRate})</dt><dd className="font-semibold text-gray-800"><Money cents={settlement.cadCashCents} /></dd></div>
                <div>
                  <dt className="text-gray-500">Exchange {settlement.gainLossCents >= 0 ? 'gain' : 'loss'}</dt>
                  <dd className={`font-semibold ${settlement.gainLossCents > 0 ? 'text-emerald-700' : settlement.gainLossCents < 0 ? 'text-rose-700' : 'text-gray-800'}`}><Money cents={Math.abs(settlement.gainLossCents)} /></dd>
                </div>
              </dl>
            )}
            <p className="mt-2 text-[11px] text-gray-500">The invoice is relieved at the rate it was issued; the bank gets what actually arrived; the difference posts to Exchange Gain/Loss automatically.</p>
          </div>
        )}
        <label className="block text-sm">
          <span className="text-gray-600">Deposit To</span>
          <select className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={depositToAccountId === null ? '' : String(depositToAccountId)} onChange={(e) => setDepositToAccountId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Undeposited Funds (bank it later)</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.currency && a.currency !== 'CAD' ? ` (${a.currency})` : ''}</option>)}
          </select>
        </label>
        <p className="text-xs text-gray-400">You can receive part of an invoice now and the remainder later. Payments sent to Undeposited Funds appear in Make Deposit.</p>
      </div>
    </Modal>
  );
}
