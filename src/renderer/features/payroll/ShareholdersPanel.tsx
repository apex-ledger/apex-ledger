import { useEffect, useState } from 'react';
import type { Shareholder, T5Payment } from '@shared/domain/types';
import type { T5SlipResult } from '@shared/domain/payroll/computeT5Slip';
import { Money } from '../../components/Money';
import { ShareholderFormModal } from './ShareholderFormModal';
import { T5PaymentFormModal } from './T5PaymentFormModal';
import { JournalEntryLink } from '../../components/JournalEntryLink';

function currentTaxYear(): number {
  return new Date().getFullYear();
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  eligible_dividend: 'Eligible Dividend',
  non_eligible_dividend: 'Non-Eligible Dividend',
  interest: 'Interest',
};

export function ShareholdersPanel() {
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [payments, setPayments] = useState<T5Payment[]>([]);
  const [taxYear, setTaxYear] = useState(currentTaxYear());
  const [t5Preview, setT5Preview] = useState<T5SlipResult[]>([]);
  const [showShareholderModal, setShowShareholderModal] = useState(false);
  const [editingShareholder, setEditingShareholder] = useState<Shareholder | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [t5Downloading, setT5Downloading] = useState(false);
  const [t5Error, setT5Error] = useState<string | null>(null);

  async function refresh() {
    const [shareholdersResult, paymentsResult] = await Promise.all([window.api.shareholders.list(), window.api.t5Payments.list()]);
    if (shareholdersResult.ok) setShareholders(shareholdersResult.data);
    if (paymentsResult.ok) setPayments(paymentsResult.data);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    window.api.shareholders.getT5Preview(taxYear).then((r) => setT5Preview(r.ok ? r.data : []));
  }, [taxYear, payments]);

  const activeShareholders = shareholders.filter((s) => s.isActive);
  const shareholderNameById = new Map(shareholders.map((s) => [s.id, s.name]));

  async function handleDeletePayment(id: number) {
    if (!window.confirm('Delete this shareholder payment? This cannot be undone.')) return;
    setDeletingId(id);
    await window.api.t5Payments.delete(id);
    setDeletingId(null);
    refresh();
  }

  async function handleDownloadT5() {
    setT5Downloading(true);
    setT5Error(null);
    const result = await window.api.shareholders.generateT5Slips({ taxYear });
    setT5Downloading(false);
    if (!result.ok) setT5Error(result.error);
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-900">Shareholders &amp; Dividends (T5)</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEditingShareholder(null);
              setShowShareholderModal(true);
            }}
            className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            Add Shareholder
          </button>
          <button
            type="button"
            disabled={activeShareholders.length === 0}
            onClick={() => setShowPaymentModal(true)}
            className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Record Payment
          </button>
        </div>
      </div>

      {shareholders.length === 0 ? (
        <p className="text-sm text-gray-400">No shareholders yet. Add one to start recording dividend or interest payments.</p>
      ) : (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {shareholders.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setEditingShareholder(s);
                setShowShareholderModal(true);
              }}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.isActive ? 'bg-brand-50 text-brand-800 hover:bg-brand-100' : 'bg-gray-100 text-gray-400'}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {payments.length > 0 && (
        <table className="mb-3 w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="pb-1.5">Date</th>
              <th className="pb-1.5">Shareholder</th>
              <th className="pb-1.5">Type</th>
              <th className="pb-1.5 text-right">Amount</th>
              <th className="pb-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {payments.slice(0, 10).map((p) => (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="py-1.5 text-gray-700">{p.paymentDate}</td>
                <td className="py-1.5 text-gray-700">{shareholderNameById.get(p.shareholderId) ?? 'Unknown shareholder'}</td>
                <td className="py-1.5 text-gray-500">{PAYMENT_TYPE_LABELS[p.paymentType] ?? p.paymentType}</td>
                <td className="py-1.5 text-right">
                  <Money cents={p.amountCents} />
                </td>
                <td className="py-1.5 text-right">
                  <JournalEntryLink id={p.journalEntryId} label="View GL" className="mr-3" />
                  <button
                    type="button"
                    disabled={deletingId === p.id}
                    onClick={() => handleDeletePayment(p.id)}
                    className="text-xs text-red-500 hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-between border-t border-gray-100 pt-3">
        <label className="text-sm">
          <span className="text-gray-600">T5 Tax Year</span>
          <input
            type="number"
            className="ml-2 w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={taxYear}
            onChange={(e) => setTaxYear(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          disabled={t5Downloading || t5Preview.length === 0}
          onClick={handleDownloadT5}
          className="rounded-full bg-brand-100 px-4 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
        >
          {t5Downloading ? 'Generating…' : 'Download T5 Slips (PDF)'}
        </button>
      </div>
      {t5Error && <p className="mt-2 text-xs text-red-600">{t5Error}</p>}
      {t5Preview.length === 0 && <p className="mt-2 text-sm text-gray-400">No shareholder payments dated in {taxYear}.</p>}

      <p className="mt-3 text-xs text-gray-400">
        Working copies only — verify the information and amounts before filing.
      </p>

      <ShareholderFormModal
        open={showShareholderModal}
        onClose={() => setShowShareholderModal(false)}
        onSaved={refresh}
        editing={editingShareholder}
      />
      <T5PaymentFormModal open={showPaymentModal} onClose={() => setShowPaymentModal(false)} onSaved={refresh} shareholders={activeShareholders} />
    </section>
  );
}
