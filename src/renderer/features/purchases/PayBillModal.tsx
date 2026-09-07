import { useEffect, useMemo, useState } from 'react';
import type { Account, Bill, Contact } from '@shared/domain/types';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { Combobox } from '../../components/Combobox';
import { CurrencyInput } from '../../components/CurrencyInput';
import { buttonClass } from '../../components/Button';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { foreignOutstandingCents, settleForeignPayment } from '@shared/domain/currency/fxSettlement';
import { ErrorNotice } from '../../components/ErrorNotice';

function today(): string {
  return localIsoDate();
}

/** Pay a vendor's bill.
 *
 * From a bill row it is already about that bill. From the toolbar it starts with the vendor,
 * then lists only that vendor's unpaid bills — invoice number, date and what is still owed. The
 * amount defaults to the balance; the rest stays open in payables and ageing.
 *
 * A foreign-currency bill is paid in its own currency: the amount box is in that currency, the
 * rate the payment converted at is asked for (Bank of Canada's rate for the date is one click
 * away), and the CAD leaving the bank plus the exchange gain or loss are shown before saving. */
export function PayBillModal({
  open,
  onClose,
  onPaid,
  billId,
}: {
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
  /** The bill to pay, or null to choose one. */
  billId: number | null;
}) {
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<number | null>(billId);
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [bankAccountId, setBankAccountId] = useState<number | null>(null);
  const [paymentDate, setPaymentDate] = useState(today());
  const [amountCents, setAmountCents] = useState(0);
  const [foreignCents, setForeignCents] = useState(0);
  const [paymentRate, setPaymentRate] = useState<number | null>(null);
  const [rateNote, setRateNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPaymentDate(today());
    setSelectedBillId(billId);
    setAmountCents(0);
    setForeignCents(0);
    setPaymentRate(null);
    setRateNote(null);
    Promise.all([window.api.accounts.list({ activeOnly: true }), window.api.bills.list(), window.api.vendors.list()]).then(([a, b, v]) => {
      if (a.ok) {
        const banks = a.data.filter((x) => x.accountSubtype === 'Cash and Bank');
        setBankAccounts(banks);
        setBankAccountId(banks.length === 1 ? banks[0].id : null);
      }
      if (v.ok) setVendors(v.data);
      if (b.ok) {
        setBills(b.data);
        const preset = billId === null ? undefined : b.data.find((row) => row.id === billId);
        setVendorId(preset?.vendorId ?? null);
        if (preset) presetAmounts(preset);
      }
    });
  }, [open, billId]);

  const unpaidForVendor = useMemo(
    () => bills.filter((row) => row.vendorId === vendorId && row.balanceDueCents > 0).sort((a, b) => a.billDate.localeCompare(b.billDate)),
    [bills, vendorId],
  );
  const bill = bills.find((row) => row.id === selectedBillId) ?? null;
  const balanceCents = bill?.balanceDueCents ?? 0;
  const vendorsWithBalance = vendors.filter((v) => v.isActive && bills.some((row) => row.vendorId === v.id && row.balanceDueCents > 0));
  const billLabel = (row: Bill) => (row.billNumber ? `Invoice ${row.billNumber}` : `Bill ${row.id}`);

  const isForeign = Boolean(bill && bill.foreignCurrency && bill.foreignAmountCents !== null && bill.exchangeRate !== null);
  const foreignOutstanding = bill && isForeign ? foreignOutstandingCents(bill.foreignAmountCents!, bill.amountCents, bill.balanceDueCents) : 0;
  const settlement = useMemo(() => {
    if (!bill || !isForeign || paymentRate === null || foreignCents <= 0 || foreignCents > foreignOutstanding) return null;
    try {
      return settleForeignPayment({ foreignPaidCents: foreignCents, foreignOutstandingCents: foreignOutstanding, cadOutstandingCents: bill.balanceDueCents, documentRate: bill.exchangeRate!, paymentRate, side: 'payable' });
    } catch {
      return null;
    }
  }, [bill, isForeign, paymentRate, foreignCents, foreignOutstanding]);

  function presetAmounts(row: Bill) {
    setAmountCents(row.balanceDueCents);
    if (row.foreignCurrency && row.foreignAmountCents !== null && row.exchangeRate !== null) {
      setForeignCents(foreignOutstandingCents(row.foreignAmountCents, row.amountCents, row.balanceDueCents));
      setPaymentRate(row.exchangeRate);
      setRateNote(`Bill rate ${row.exchangeRate} pre-filled — change it to the rate the payment actually converted at.`);
    } else {
      setForeignCents(0);
      setPaymentRate(null);
      setRateNote(null);
    }
  }

  function chooseBill(id: number | null) {
    setSelectedBillId(id);
    const chosen = bills.find((row) => row.id === id);
    if (chosen) presetAmounts(chosen);
    else { setAmountCents(0); setForeignCents(0); setPaymentRate(null); }
  }

  async function fetchRate() {
    if (!bill?.foreignCurrency) return;
    setRateNote('Fetching the Bank of Canada rate…');
    const result = await window.api.fxRates.getOnDate(bill.foreignCurrency, paymentDate);
    if (!result.ok) return setRateNote(result.error);
    setPaymentRate(result.data.rate);
    setRateNote(`Bank of Canada ${bill.foreignCurrency}/CAD on ${result.data.date}: ${result.data.rate}`);
  }

  const canSubmit = bill !== null && bankAccountId !== null && (isForeign ? settlement !== null : amountCents > 0 && amountCents <= balanceCents);

  async function handlePay() {
    if (selectedBillId === null || bankAccountId === null || !canSubmit) return;
    setBusy(true);
    setError(null);
    const result = await window.api.bills.pay({
      id: selectedBillId,
      bankAccountId,
      paymentDate,
      amountCents: isForeign && settlement ? settlement.cadRelievedCents : amountCents,
      foreignAmountCents: isForeign ? foreignCents : null,
      exchangeRate: isForeign ? paymentRate : null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onPaid();
    onClose();
  }

  return (
    <Modal fullScreen open={open} onClose={onClose} title="Pay Bill" footer={<><button type="button" onClick={onClose} className={buttonClass('secondary')}>Cancel</button><button type="button" disabled={busy || !canSubmit} onClick={handlePay} className={buttonClass('primary')}>Pay</button></>}>
      <div className="space-y-3">
        {error && <ErrorNotice message={error} />}
        <label className="block text-sm">
          <span className="text-gray-600">Vendor</span>
          <Combobox
            options={(vendorsWithBalance.length > 0 ? vendorsWithBalance : vendors.filter((v) => v.isActive)).map((v) => ({ value: String(v.id), label: v.name }))}
            value={vendorId === null ? null : String(vendorId)}
            onChange={(v) => {
              setVendorId(v ? Number(v) : null);
              chooseBill(null);
            }}
            placeholder="Who is being paid?"
          />
          {vendorsWithBalance.length === 0 && vendors.length > 0 && <span className="mt-1 block text-xs text-gray-400">No vendor has an unpaid bill right now.</span>}
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Bill</span>
          <select
            aria-label="Bill"
            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            value={selectedBillId === null ? '' : String(selectedBillId)}
            onChange={(e) => chooseBill(e.target.value ? Number(e.target.value) : null)}
            disabled={vendorId === null}
          >
            <option value="">{vendorId === null ? 'Choose the vendor first' : unpaidForVendor.length === 0 ? 'No unpaid bills for this vendor' : 'Choose an unpaid bill…'}</option>
            {unpaidForVendor.map((row) => (
              <option key={row.id} value={row.id}>
                {billLabel(row)} — {row.billDate} — {row.foreignCurrency ? `${row.foreignCurrency} ` : '$'}{row.foreignCurrency && row.foreignAmountCents !== null && row.exchangeRate !== null ? (foreignOutstandingCents(row.foreignAmountCents, row.amountCents, row.balanceDueCents) / 100).toFixed(2) : (row.balanceDueCents / 100).toFixed(2)} due{row.balanceDueCents < row.amountCents ? ` of ${row.foreignCurrency ? `${row.foreignCurrency} ${((row.foreignAmountCents ?? 0) / 100).toFixed(2)}` : `$${(row.amountCents / 100).toFixed(2)}`}` : ''}
              </option>
            ))}
          </select>
        </label>
        {bill && (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {billLabel(bill)} · outstanding <span className="font-semibold text-gray-800"><Money cents={balanceCents} /></span>
            {isForeign && <span className="ml-1 text-gray-500">({bill.foreignCurrency} {(foreignOutstanding / 100).toFixed(2)} at {bill.exchangeRate})</span>}
            {bill.dueDate < today() && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">overdue since {bill.dueDate}</span>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="text-gray-600">Payment Date</span><input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={paymentDate} onChange={(e) => setPaymentDate(clampIsoDate(e.target.value))} /></label>
          {isForeign ? (
            <label className="block text-sm">
              <span className="text-gray-600">Amount to Pay ({bill?.foreignCurrency})</span>
              <div className="mt-1"><CurrencyInput valueCents={foreignCents} onChange={setForeignCents} aria-label={`Amount to pay in ${bill?.foreignCurrency}`} /></div>
              {foreignCents > foreignOutstanding && <span className="mt-1 block text-xs text-rose-700">More than is owed on this bill.</span>}
            </label>
          ) : (
            <label className="block text-sm">
              <span className="text-gray-600">Amount to Pay</span>
              <div className="mt-1"><CurrencyInput valueCents={amountCents} onChange={setAmountCents} disabled={bill === null} /></div>
              {bill && amountCents > balanceCents && <span className="mt-1 block text-xs text-rose-700">More than is owed on this bill.</span>}
            </label>
          )}
        </div>
        {isForeign && bill && (
          <div className="rounded-lg border border-brand-100 bg-brand-50/40 p-3 text-sm">
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <label className="block">
                <span className="text-gray-600">Exchange rate the payment converted at (CAD per 1 {bill.foreignCurrency})</span>
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
                <div><dt className="text-gray-500">Applied to bill (at {bill.exchangeRate})</dt><dd className="font-semibold text-gray-800"><Money cents={settlement.cadRelievedCents} /></dd></div>
                <div><dt className="text-gray-500">Cash out of bank (at {paymentRate})</dt><dd className="font-semibold text-gray-800"><Money cents={settlement.cadCashCents} /></dd></div>
                <div>
                  <dt className="text-gray-500">Exchange {settlement.gainLossCents >= 0 ? 'gain' : 'loss'}</dt>
                  <dd className={`font-semibold ${settlement.gainLossCents > 0 ? 'text-emerald-700' : settlement.gainLossCents < 0 ? 'text-rose-700' : 'text-gray-800'}`}><Money cents={Math.abs(settlement.gainLossCents)} /></dd>
                </div>
              </dl>
            )}
            <p className="mt-2 text-[11px] text-gray-500">The bill is relieved at the rate it was booked; the bank shows what actually left; the difference posts to Exchange Gain/Loss automatically.</p>
          </div>
        )}
        {bankAccounts.length === 0 ? (
          <p className="text-sm text-gray-500">No bank/cash accounts found. Add one in Chart of Accounts first.</p>
        ) : (
          <label className="block text-sm">
            <span className="text-gray-600">Pay from</span>
            <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={bankAccountId ?? ''} onChange={(e) => setBankAccountId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choose the account the money leaves…</option>
              {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.currency && a.currency !== 'CAD' ? ` (${a.currency})` : ''}</option>)}
            </select>
          </label>
        )}
        <p className="text-xs text-gray-400">Partial payments are supported. The remaining balance stays open in Accounts Payable and aging.</p>
      </div>
    </Modal>
  );
}
