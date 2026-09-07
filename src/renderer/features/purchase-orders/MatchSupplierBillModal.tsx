import { useEffect, useMemo, useState } from 'react';
import type { TaxCode } from '@shared/domain/types';
import { suggestTaxCents } from '@shared/domain/ledger/computeTaxSplit';
import { taxCodeOptions } from '@shared/domain/ledger/taxCodes';
import { dueDateFor, type PaymentTerm } from '@shared/domain/contacts/paymentTerms';
import { Modal } from '../../components/Modal';
import { CurrencyInput } from '../../components/CurrencyInput';
import { PaymentTermsSelect } from '../../components/PaymentTermsSelect';
import { useCompanyTaxDefault } from '../../hooks/useCompanyTaxDefault';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

function today(): string {
  return localIsoDate();
}

export function MatchSupplierBillModal({
  purchaseOrderId,
  onClose,
  onMatched,
}: {
  purchaseOrderId: number | null;
  onClose: () => void;
  onMatched: (varianceCents: number) => void;
}) {
  const { province, defaultTaxCode } = useCompanyTaxDefault();
  const options = useMemo(() => taxCodeOptions('expense', province, { includeBlank: true }), [province]);
  const [billDate, setBillDate] = useState(today());
  const [dueDate, setDueDate] = useState(today());
  const [terms, setTerms] = useState<PaymentTerm>('net30');
  const [baseCents, setBaseCents] = useState(0);
  const [taxCode, setTaxCode] = useState<TaxCode | null>(null);
  const [taxCents, setTaxCents] = useState(0);
  const [taxTouched, setTaxTouched] = useState(false);
  const [poNumber, setPoNumber] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (purchaseOrderId === null) return;
    setError(null);
    const date = today();
    setBillDate(date);
    const due = dueDateFor(date, 'net30') ?? date;
    setDueDate(due);
    setTerms('net30');
    setTaxTouched(false);
    setBillNumber('');
    window.api.purchaseOrders.get(purchaseOrderId).then((r) => {
      if (!r.ok) return setError(r.error);
      setPoNumber(r.data.poNumber);
      const base = r.data.lines.reduce((sum, line) => sum + line.amountCents, 0);
      setBaseCents(base);
      const codes = new Set(r.data.lines.map((line) => line.taxCode));
      const code = codes.size === 1 ? (r.data.lines[0]?.taxCode as TaxCode | null) : (defaultTaxCode ?? 'Manual');
      setTaxCode(code);
      const exactPoTax = r.data.lines.reduce((sum, line) => {
        const c = line.taxCode as TaxCode | null;
        return sum + (c === 'Manual' ? Math.max(0, line.manualHstCents ?? 0) : suggestTaxCents(c, line.amountCents));
      }, 0);
      setTaxCents(exactPoTax);
    });
  }, [purchaseOrderId, defaultTaxCode]);

  useEffect(() => {
    if (purchaseOrderId === null || taxTouched) return;
    setTaxCents(suggestTaxCents(taxCode, baseCents));
  }, [purchaseOrderId, taxCode, baseCents, taxTouched]);

  async function save() {
    if (purchaseOrderId === null || baseCents <= 0) return;
    setBusy(true);
    setError(null);
    const result = await window.api.purchaseOrders.matchSupplierBill({
      id: purchaseOrderId,
      billNumber: billNumber.trim(),
      billDate,
      dueDate,
      paymentTerms: terms,
      invoiceBaseCents: baseCents,
      taxCode,
      taxCents: taxCode ? taxCents : 0,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onMatched(result.data.baseVarianceCents);
    onClose();
  }

  return (
    <Modal fullScreen
      open={purchaseOrderId !== null}
      onClose={onClose}
      title={poNumber ? `Match Vendor Invoice — ${poNumber}` : 'Match Vendor Invoice'}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          <button type="button" disabled={busy || baseCents <= 0 || !billNumber.trim()} onClick={() => void save()} className="rounded-full bg-violet-100 px-4 py-2 text-sm font-medium text-violet-800 hover:bg-violet-200 disabled:opacity-50">
            Match & Create Bill
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <p className="text-xs text-gray-500">Enter the amounts exactly as shown on the vendor invoice. Inventory already received will not be posted a second time.</p>
        <label className="block text-sm">
          <span className="text-gray-600">Vendor Invoice Number</span>
          <input autoFocus type="text" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" placeholder="e.g. INV-10482" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Bill Date</span>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={billDate} onChange={(e) => { setBillDate(clampIsoDate(e.target.value)); const d = dueDateFor(clampIsoDate(e.target.value), terms); if (d) setDueDate(d); }} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Due Date</span>
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={dueDate} onChange={(e) => setDueDate(clampIsoDate(e.target.value))} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-gray-600">Payment Terms</span>
          <PaymentTermsSelect value={terms} documentDate={billDate} onChange={(t, due) => { setTerms(t); if (due) setDueDate(due); }} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Vendor Invoice — Base Amount</span>
          <CurrencyInput valueCents={baseCents} onChange={(v) => { setBaseCents(v); setTaxTouched(false); }} className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Tax Treatment</span>
          <select value={taxCode ?? ''} onChange={(e) => { setTaxCode((e.target.value || null) as TaxCode | null); setTaxTouched(false); }} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5">
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Tax Amount</span>
          <CurrencyInput valueCents={taxCents} onChange={(v) => { setTaxCents(v); setTaxTouched(true); }} disabled={!taxCode} className="mt-1" />
        </label>
        <div className="rounded bg-gray-50 px-3 py-2 text-sm">
          <div className="flex justify-between"><span>Invoice total</span><strong>${((baseCents + (taxCode ? taxCents : 0)) / 100).toFixed(2)}</strong></div>
        </div>
      </div>
    </Modal>
  );
}
