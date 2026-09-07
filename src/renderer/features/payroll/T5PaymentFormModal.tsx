import { useEffect, useState } from 'react';
import { paymentSourceAccounts } from '../../utils/bankAccounts';
import type { Account, Shareholder, T5PaymentType } from '@shared/domain/types';
import { Modal } from '../../components/Modal';
import { CurrencyInput } from '../../components/CurrencyInput';
import { capitalizeWords, suggestOnBlur } from '../../utils/textCase';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { suggestionListId } from '../../utils/textSuggestions';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

function today(): string {
  return localIsoDate();
}

const PAYMENT_TYPE_LABELS: Record<T5PaymentType, string> = {
  eligible_dividend: 'Eligible Dividend',
  non_eligible_dividend: 'Non-Eligible Dividend',
  interest: 'Interest (Shareholder Loan)',
};

export function T5PaymentFormModal({
  open,
  onClose,
  onSaved,
  shareholders,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  shareholders: Shareholder[];
}) {
  const [shareholderId, setShareholderId] = useState<number | null>(null);
  const [paymentType, setPaymentType] = useState<T5PaymentType>('eligible_dividend');
  const [amountCents, setAmountCents] = useState(0);
  const [paymentDate, setPaymentDate] = useState(today());
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [bankAccountId, setBankAccountId] = useState<number | null>(null);
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setShareholderId(shareholders[0]?.id ?? null);
    setPaymentType('eligible_dividend');
    setAmountCents(0);
    setPaymentDate(today());
    setMemo('');
    window.api.accounts.list({ activeOnly: true }).then((r) => {
      if (!r.ok) return;
      const banks = paymentSourceAccounts(r.data);
      setBankAccounts(banks);
      setBankAccountId(banks[0]?.id ?? null);
    });
  }, [open, shareholders]);

  async function handleSave(after: 'close' | 'next') {
    if (shareholderId === null || bankAccountId === null) return;
    setBusy(true);
    setError(null);
    const result = await window.api.t5Payments.record({
      shareholderId,
      paymentDate,
      paymentType,
      amountCents,
      bankAccountId,
      memo: memo ? capitalizeWords(memo) : null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onSaved();
    if (after === 'close') return onClose();
    setAmountCents(0); setPaymentDate(today()); setMemo('');
  }

  return (
    <Modal fullScreen
      open={open}
      onClose={onClose}
      title="Record Dividend / Interest Payment"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || shareholderId === null || bankAccountId === null || amountCents <= 0}
            onClick={() => handleSave('close')}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Save &amp; Close
          </button>
          <button type="button" disabled={busy || shareholderId === null || bankAccountId === null || amountCents <= 0} onClick={() => handleSave('next')} className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Save &amp; Next</button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {shareholders.length === 0 ? (
          <p className="text-sm text-gray-500">Add a shareholder first.</p>
        ) : (
          <label className="block text-sm">
            <span className="text-gray-600">Shareholder</span>
            <select
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5"
              value={shareholderId ?? ''}
              onChange={(e) => setShareholderId(Number(e.target.value))}
            >
              {shareholders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm">
          <span className="text-gray-600">Payment Type</span>
          <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={paymentType} onChange={(e) => setPaymentType(e.target.value as T5PaymentType)}>
            {(Object.keys(PAYMENT_TYPE_LABELS) as T5PaymentType[]).map((t) => (
              <option key={t} value={t}>
                {PAYMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Amount</span>
            <CurrencyInput valueCents={amountCents} onChange={setAmountCents} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Payment Date</span>
            <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={paymentDate} onChange={(e) => setPaymentDate(clampIsoDate(e.target.value))} />
          </label>
        </div>
        {bankAccounts.length === 0 ? (
          <p className="text-sm text-gray-500">No bank/cash accounts found. Add one in Chart of Accounts first.</p>
        ) : (
          <label className="block text-sm">
            <span className="text-gray-600">Pay From</span>
            <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={bankAccountId ?? ''} onChange={(e) => setBankAccountId(Number(e.target.value))}>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm">
          <span className="text-gray-600">Memo (optional)</span>
          <input
            list={suggestionListId('transaction-memo')}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={suggestOnBlur('transaction-memo', setMemo)}
          />
          <SuggestionDatalist fieldKey="transaction-memo" />
        </label>
        <p className="text-xs text-gray-400">
          {paymentType === 'interest'
            ? 'Posts a debit to "Interest Expense — Shareholder Loans" and a credit to the account above.'
            : 'Posts a debit to "Dividends Declared" and a credit to the account above.'}
        </p>
      </div>
    </Modal>
  );
}
