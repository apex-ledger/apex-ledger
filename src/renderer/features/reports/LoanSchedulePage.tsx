import { useState } from 'react';
import { PAYMENTS_PER_YEAR } from '@shared/domain/tax/loanAmortization';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';

/** Loan amortization — how much of each payment is interest and how much repays the debt.
 *
 * The bank statement shows one payment leaving the account; the books need it split. Posting the
 * whole thing to interest overstates expenses and leaves the loan on the balance sheet forever. */

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  semiMonthly: 'Twice a month',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Yearly',
};

const BLANK = {
  name: '',
  lender: '',
  principal: '',
  ratePercent: '',
  frequency: 'monthly',
  years: '5',
  compounding: 'perPayment',
};

export function LoanSchedulePage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const { data: loans, reload } = useIpcQuery(() => window.api.loans.list({}), []);
  const { data: schedule } = useIpcQuery(
    () => (selectedId ? window.api.loans.schedule({ loanId: selectedId }) : Promise.resolve({ ok: true as const, data: undefined })),
    [selectedId],
  );

  async function addLoan() {
    const perYear = PAYMENTS_PER_YEAR[draft.frequency as keyof typeof PAYMENTS_PER_YEAR] ?? 12;
    setBusy(true);
    const result = await window.api.loans.save({
      name: draft.name,
      lender: draft.lender || null,
      principalCents: Math.round((Number(draft.principal.replace(/[^0-9.]/g, '')) || 0) * 100),
      annualRate: (Number(draft.ratePercent) || 0) / 100,
      frequency: draft.frequency,
      numberOfPayments: Math.round((Number(draft.years) || 0) * perYear),
      compounding: draft.compounding,
      startDate: null,
      liabilityAccountId: null,
      interestAccountId: null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setError(null);
    setDraft(BLANK);
    setSelectedId(result.data.id);
    reload();
  }

  async function removeLoan(id: number) {
    if (!window.confirm('Delete this loan and its saved amortization schedule? This cannot be undone.')) return;
    const result = await window.api.loans.delete(id);
    if (!result.ok) return setError(result.error);
    if (selectedId === id) setSelectedId(null);
    reload();
  }

  const rows = schedule ? (showAll ? schedule.rows : schedule.rows.slice(0, 24)) : [];

  return (
    <div className="w-full space-y-3">
      {error && (
        <div className="flex items-start justify-between gap-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 text-red-500 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="rounded border border-gray-200 bg-gray-50 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Add a loan</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-gray-600">Name</span>
            <input
              className="mt-1 w-44 rounded border border-gray-300 px-2 py-1.5"
              placeholder="Equipment loan"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600">Lender</span>
            <input
              className="mt-1 w-36 rounded border border-gray-300 px-2 py-1.5"
              value={draft.lender}
              onChange={(e) => setDraft({ ...draft, lender: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600">Amount borrowed</span>
            <input
              className="mt-1 w-32 rounded border border-gray-300 px-2 py-1.5 text-right tabular-nums"
              value={draft.principal}
              onChange={(e) => setDraft({ ...draft, principal: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600">Rate %</span>
            <input
              className="mt-1 w-20 rounded border border-gray-300 px-2 py-1.5 text-right tabular-nums"
              value={draft.ratePercent}
              onChange={(e) => setDraft({ ...draft, ratePercent: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600">Paid</span>
            <select
              className="mt-1 w-36 rounded border border-gray-300 px-2 py-1.5"
              value={draft.frequency}
              onChange={(e) => setDraft({ ...draft, frequency: e.target.value })}
            >
              {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-600">Years</span>
            <input
              className="mt-1 w-20 rounded border border-gray-300 px-2 py-1.5 text-right tabular-nums"
              value={draft.years}
              onChange={(e) => setDraft({ ...draft, years: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600">Compounding</span>
            <select
              className="mt-1 w-52 rounded border border-gray-300 px-2 py-1.5"
              value={draft.compounding}
              onChange={(e) => setDraft({ ...draft, compounding: e.target.value })}
            >
              <option value="perPayment">Each payment (most loans)</option>
              <option value="semiAnnual">Semi-annually (Canadian mortgage)</option>
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !draft.name.trim()}
            onClick={() => void addLoan()}
            className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          A Canadian mortgage compounds semi-annually however often it is paid — that is a real difference in money and the usual
          reason a hand-built schedule disagrees with the lender.
        </p>
      </div>

      {(loans ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(loans ?? []).map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setSelectedId(l.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                selectedId === l.id ? 'bg-brand-100 text-brand-900 ring-1 ring-brand-300' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {l.name}
              <span className="ml-2 text-xs opacity-60">
                {(l.annualRate * 100).toFixed(2)}% · {FREQUENCY_LABELS[l.frequency] ?? l.frequency}
              </span>
            </button>
          ))}
        </div>
      )}

      {!selectedId && <p className="text-sm text-gray-400">Add a loan, or pick one above to see its schedule.</p>}

      {schedule && (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Payment', cents: schedule.paymentCents },
              { label: 'Total interest', cents: schedule.totalInterestCents },
              { label: 'Total repaid', cents: schedule.totalPaidCents },
              { label: 'Borrowed', cents: schedule.loan.principalCents },
            ].map((tile) => (
              <div key={tile.label} className="rounded border border-gray-200 bg-white px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-gray-500">{tile.label}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  <Money cents={tile.cents} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {schedule.rows.length} payments{' '}
              {!showAll && schedule.rows.length > 24 && <span className="text-gray-400">— showing the first 24</span>}
            </p>
            <div className="flex gap-2">
              {schedule.rows.length > 24 && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                >
                  {showAll ? 'Show first 24' : 'Show all'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void removeLoan(schedule.loan.id)}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                Delete loan
              </button>
            </div>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-right font-medium">Opening</th>
                <th className="px-3 py-2 text-right font-medium">Payment</th>
                <th className="px-3 py-2 text-right font-medium">Interest</th>
                <th className="px-3 py-2 text-right font-medium">Principal</th>
                <th className="px-3 py-2 text-right font-medium">Closing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.paymentNumber} className="border-b border-gray-100">
                  <td className="px-3 py-1 text-gray-500">{r.paymentNumber}</td>
                  <td className="px-3 py-1 text-right tabular-nums text-gray-500">
                    <Money cents={r.openingBalanceCents} />
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums">
                    <Money cents={r.paymentCents} />
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums text-rose-700">
                    <Money cents={r.interestCents} />
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums text-emerald-700">
                    <Money cents={r.principalCents} />
                  </td>
                  <td className="px-3 py-1 text-right font-medium tabular-nums">
                    <Money cents={r.closingBalanceCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-xs text-gray-400">
            Interest is the expense; principal reduces the loan on the balance sheet. Only the interest column belongs in the income
            statement — posting the whole payment there overstates expenses and leaves the debt outstanding forever.
          </p>
        </>
      )}
    </div>
  );
}
