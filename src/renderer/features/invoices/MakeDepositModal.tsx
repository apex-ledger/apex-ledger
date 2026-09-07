import { useEffect, useState } from 'react';
import { allDepositTargets } from '../../utils/bankAccounts';
import type { Account, Contact, UndepositedItem } from '@shared/domain/types';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

function today(): string {
  return localIsoDate();
}

export function MakeDepositModal({
  open,
  onClose,
  onDeposited,
  customers,
}: {
  open: boolean;
  onClose: () => void;
  onDeposited: () => void;
  customers: Contact[];
}) {
  const [undeposited, setUndeposited] = useState<UndepositedItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [bankAccountId, setBankAccountId] = useState<number | null>(null);
  const [depositDate, setDepositDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function itemKey(item: UndepositedItem): string {
    return `${item.kind}-${item.id}`;
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDepositDate(today());
    window.api.deposits.getUndeposited().then((r) => {
      if (!r.ok) return;
      setUndeposited(r.data);
      setSelectedKeys(new Set(r.data.map(itemKey)));
    });
    window.api.accounts.list({ activeOnly: true }).then((r) => {
      if (!r.ok) return;
      const banks = allDepositTargets(r.data);
      setBankAccounts(banks);
      setBankAccountId(banks[0]?.id ?? null);
    });
  }, [open]);

  const customerNameById = new Map(customers.map((c) => [c.id, c.name]));
  const selectedItems = undeposited.filter((item) => selectedKeys.has(itemKey(item)));
  const totalCents = selectedItems.reduce((sum, item) => sum + item.totalCents, 0);

  function toggle(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleDeposit() {
    if (bankAccountId === null || selectedItems.length === 0) return;
    setBusy(true);
    setError(null);
    const result = await window.api.deposits.create({
      invoiceIds: selectedItems.filter((i) => i.kind === 'invoice').map((i) => i.id),
      invoicePaymentIds: selectedItems.filter((i) => i.kind === 'invoicePayment').map((i) => i.id),
      salesReceiptIds: selectedItems.filter((i) => i.kind === 'salesReceipt').map((i) => i.id),
      bankAccountId,
      depositDate,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onDeposited();
    onClose();
  }

  return (
    <Modal fullScreen
      open={open}
      onClose={onClose}
      title="Make Deposit"
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || bankAccountId === null || selectedItems.length === 0}
            onClick={handleDeposit}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Deposit <Money cents={totalCents} />
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <p className="text-sm text-gray-500">
          Select the payments that were deposited together in one bank transaction — the combined total below should match your bank
          statement.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Deposit Date</span>
            <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={depositDate} onChange={(e) => setDepositDate(clampIsoDate(e.target.value))} />
          </label>
          {bankAccounts.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No bank/cash accounts found. Add one in Chart of Accounts first.</p>
          ) : (
            <label className="block text-sm">
              <span className="text-gray-600">Deposit To</span>
              <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={bankAccountId ?? ''} onChange={(e) => setBankAccountId(Number(e.target.value))}>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.currency && a.currency !== 'CAD' ? ` (${a.currency})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {undeposited.length === 0 ? (
          <p className="text-sm text-gray-400">No undeposited payments — everything received has already been deposited.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-1.5"></th>
                <th className="pb-1.5">Source</th>
                <th className="pb-1.5">Number</th>
                <th className="pb-1.5">Customer</th>
                <th className="pb-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {undeposited.map((item) => (
                <tr key={itemKey(item)} className="border-b border-gray-100">
                  <td className="py-1.5">
                    <input type="checkbox" checked={selectedKeys.has(itemKey(item))} onChange={() => toggle(itemKey(item))} />
                  </td>
                  <td className="py-1.5 text-gray-500">{item.kind === 'salesReceipt' ? 'Sales Receipt' : item.kind === 'invoicePayment' ? 'Invoice Payment' : 'Invoice'}</td>
                  <td className="py-1.5 text-gray-700">{item.number}</td>
                  <td className="py-1.5 text-gray-600">{customerNameById.get(item.customerId) ?? '—'}</td>
                  <td className="py-1.5 text-right">
                    <Money cents={item.totalCents} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="pt-2 text-right text-sm font-semibold text-gray-700">
                  Total Selected
                </td>
                <td className="pt-2 text-right font-semibold">
                  <Money cents={totalCents} />
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </Modal>
  );
}
