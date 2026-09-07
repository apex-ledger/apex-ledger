import { useEffect, useState } from 'react';
import { paymentSourceAccounts } from '../../utils/bankAccounts';
import type { Account, Bill } from '@shared/domain/types';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { buttonClass } from '../../components/Button';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

function today(): string {
  return localIsoDate();
}

/** Pays several bills in one action, same convention as QuickBooks' "Pay bills" batch button —
 * one payment date and one bank account applied to every selected bill. Under the hood this still
 * posts one journal entry per bill (via the same billsPay endpoint PayBillModal uses), just
 * looped, so each payment stays its own individually-voidable transaction rather than a single
 * combined entry that would be awkward to partially reverse later. */
export function BulkPayBillsModal({
  open,
  onClose,
  onPaid,
  bills,
}: {
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
  bills: Bill[];
}) {
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [bankAccountId, setBankAccountId] = useState<number | null>(null);
  const [paymentDate, setPaymentDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setProgress(null);
    setPaymentDate(today());
    window.api.accounts.list({ activeOnly: true }).then((r) => {
      if (!r.ok) return;
      const banks = paymentSourceAccounts(r.data);
      setBankAccounts(banks);
      setBankAccountId(banks[0]?.id ?? null);
    });
  }, [open]);

  const totalCents = bills.reduce((sum, b) => sum + b.balanceDueCents, 0);

  async function handlePay() {
    if (bankAccountId === null) return;
    setBusy(true);
    setError(null);
    const errors: string[] = [];
    for (const [i, bill] of bills.entries()) {
      setProgress(`Paying bill ${i + 1} of ${bills.length}…`);
      const result = await window.api.bills.pay({ id: bill.id, bankAccountId, paymentDate, amountCents: bill.balanceDueCents });
      if (!result.ok) {
        const documentLabel = bill.billNumber ? `Vendor invoice ${bill.billNumber}` : 'Vendor bill';
        errors.push(`${documentLabel}: ${result.error}`);
      }
    }
    setBusy(false);
    setProgress(null);
    onPaid();
    if (errors.length > 0) {
      setError(`Paid ${bills.length - errors.length} of ${bills.length} bills. ${errors.join(' ')}`);
      return;
    }
    onClose();
  }

  return (
    <Modal fullScreen
      open={open}
      onClose={onClose}
      title={`Pay ${bills.length} Bill${bills.length === 1 ? '' : 's'}`}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass('secondary')}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || bankAccountId === null || bills.length === 0}
            onClick={handlePay}
            className={buttonClass('primary')}
          >
            {busy ? 'Paying…' : `Pay ${bills.length === 1 ? 'Bill' : `All ${bills.length}`}`}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {progress && <p className="text-sm text-gray-400">{progress}</p>}
        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          Total: <Money cents={totalCents} className="font-semibold" />
        </div>
        <label className="block text-sm">
          <span className="text-gray-600">Payment Date</span>
          <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={paymentDate} onChange={(e) => setPaymentDate(clampIsoDate(e.target.value))} />
        </label>
        {bankAccounts.length === 0 ? (
          <p className="text-sm text-gray-500">No bank/cash accounts found. Add one in Chart of Accounts first.</p>
        ) : (
          <label className="block text-sm">
            <span className="text-gray-600">Pay from</span>
            <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={bankAccountId ?? ''} onChange={(e) => setBankAccountId(Number(e.target.value))}>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </Modal>
  );
}
