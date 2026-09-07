import { useEffect, useState } from 'react';
import { paymentSourceAccounts } from '../../utils/bankAccounts';
import type { Account, PayrollRun } from '@shared/domain/types';
import { hasPostablePayrollAmount } from '@shared/domain/payroll/buildPayrollJournalLines';
import { Modal } from '../../components/Modal';

export function PostRunModal({
  open,
  onClose,
  onPosted,
  runId,
}: {
  open: boolean;
  onClose: () => void;
  onPosted: () => void;
  runId: number | null;
}) {
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [bankAccountId, setBankAccountId] = useState<number | null>(null);
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRun(null);
    window.api.accounts.list({ activeOnly: true }).then((r) => {
      if (!r.ok) return;
      const banks = paymentSourceAccounts(r.data);
      setBankAccounts(banks);
      setBankAccountId(banks[0]?.id ?? null);
    });
    if (runId !== null) {
      window.api.payrollRuns.get(runId).then((r) => {
        if (!r.ok) return setError(r.error);
        setRun(r.data);
      });
    }
  }, [open, runId]);

  async function handlePost() {
    if (runId === null || bankAccountId === null) return;
    setBusy(true);
    setError(null);
    const result = await window.api.payrollRuns.post({ id: runId, bankAccountId });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onPosted();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Post Pay Run to Ledger"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || bankAccountId === null || run === null || !hasPostablePayrollAmount(run)}
            onClick={handlePost}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Post
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {run && !hasPostablePayrollAmount(run) && (
          <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
            This pay run has no payroll amount, so there is nothing to post. Cancel, delete this zero-value draft, and run payroll again after entering the employee’s hours or other pay.
          </div>
        )}
        {bankAccounts.length === 0 ? (
          <p className="text-sm text-gray-500">No bank/cash accounts found. Add one in Chart of Accounts first.</p>
        ) : (
          <label className="block text-sm">
            <span className="text-gray-600">Pay net pay from</span>
            <select
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5"
              value={bankAccountId ?? ''}
              onChange={(e) => setBankAccountId(Number(e.target.value))}
            >
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="text-xs text-gray-400">
          This posts a journal entry: Salaries, Wages &amp; Benefits (debit) against Payroll Remittances Payable and this bank account
          (credits). CPP/EI/income tax remain owing to CRA until remitted separately.
        </p>
      </div>
    </Modal>
  );
}
