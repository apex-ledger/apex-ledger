import { useState } from 'react';
import { STALE_DAYS, daysOutstanding } from '@shared/domain/ledger/reconciliationReport';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';
import { openOriginalEntry } from '../../utils/openOriginalEntry';
import { OpenEntryButton } from '../../components/OpenEntryButton';
import { ReportDateRange } from '../../components/ReportDateRange';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string { return localIsoDate(); }
function yearStartIso(): string { return `${todayIso().slice(0, 4)}-01-01`; }

/** The page that proves the bank and the books agree.
 *
 * The reconciliation screen is where the ticking happens; this is the statement of the result — the
 * thing that gets printed, filed, and handed to whoever asks how the bank balance was proved.
 * Without it the work is done but leaves no evidence behind. */

export function ReconciliationReportPage() {
  const setView = useUiStore((s) => s.setView);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());

  const { data: list } = useIpcQuery(
    () => window.api.reports.reconciliationList({ periodStart, periodEnd }),
    [periodStart, periodEnd],
  );
  const { data, loading, error } = useIpcQuery(
    () =>
      selectedId
        ? window.api.reports.reconciliation({ reconciliationId: selectedId })
        : Promise.resolve({ ok: true as const, data: undefined }),
    [selectedId],
  );

  return (
    <div className="w-full space-y-3">
      <ReportDateRange from={periodStart} to={periodEnd} onFromChange={setPeriodStart} onToChange={setPeriodEnd} />
      <label className="block text-sm">
        <span className="text-gray-600">Reconciliation</span>
        <select
          className="mt-1 w-72 rounded border border-gray-300 px-2 py-1.5"
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Choose a completed reconciliation…</option>
          {(list ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.statementDate} — closing {(r.endingBalanceCents / 100).toFixed(2)} ({r.status})
            </option>
          ))}
        </select>
      </label>

      {(list ?? []).length === 0 && (
        <p className="text-sm text-gray-500">
          No reconciliations yet. Reconcile an account under Transactions → Reconcile, and its report appears here.
        </p>
      )}

      {loading && selectedId && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {data && (
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Bank reconciliation</h2>
              <p className="text-sm text-gray-600">{data.accountName}</p>
              <p className="text-xs text-gray-400">
                Statement date {data.statementDate}
                {data.completedAt && ` · reconciled ${data.completedAt.slice(0, 10)}`}
              </p>
            </div>
            <span
              className={`rounded px-2 py-1 text-xs font-medium ${
                data.isReconciled ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}
            >
              {data.isReconciled ? '✓ Reconciled' : 'Does not balance'}
            </span>
          </div>

          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="px-2 py-1.5">Closing balance per bank statement</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  <Money cents={data.statementClosingCents} />
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-2 py-1.5">
                  Add: deposits not yet on the statement
                  <span className="ml-2 text-xs text-gray-400">{data.outstandingDeposits.length} item(s)</span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">
                  <Money cents={data.outstandingDepositsCents} />
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-2 py-1.5">
                  Less: cheques not yet cashed
                  <span className="ml-2 text-xs text-gray-400">{data.outstandingPayments.length} item(s)</span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-rose-700">
                  −<Money cents={data.outstandingPaymentsCents} />
                </td>
              </tr>
              <tr className="border-b border-gray-200 font-semibold">
                <td className="px-2 py-2">Adjusted bank balance</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <Money cents={data.adjustedBalanceCents} />
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-2 py-1.5">Balance per the books at {data.statementDate}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  <Money cents={data.bookBalanceCents} />
                </td>
              </tr>
              <tr className={`border-t border-gray-300 font-semibold ${data.isReconciled ? '' : 'text-rose-700'}`}>
                <td className="px-2 py-2">Difference</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <Money cents={data.differenceCents} />
                </td>
              </tr>
            </tbody>
          </table>

          <p className="mt-3 text-xs text-gray-400">{data.clearedCount} transactions cleared against this statement.</p>
        </div>
      )}

      {data &&
        [
          { title: 'Deposits not yet on the statement', items: data.outstandingDeposits },
          { title: 'Cheques not yet cashed', items: data.outstandingPayments },
        ]
          .filter((section) => section.items.length > 0)
          .map((section) => (
            <div key={section.title}>
              <h3 className="mb-1 text-sm font-semibold text-gray-900">{section.title}</h3>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {section.items.map((item, i) => {
                    const age = daysOutstanding(item, data.statementDate);
                    return (
                      <tr
                        key={`${item.entryId}-${i}`}
                        onClick={() => void openOriginalEntry(item.entryId, setView)}
                        className="cursor-pointer border-b border-gray-100 hover:bg-brand-50"
                        title="Open original entry"
                      >
                        <td className="px-3 py-1 text-gray-500">
                          <div className="flex items-center gap-2"><span>{item.entryDate}</span><OpenEntryButton entryId={item.entryId} /></div>
                        </td>
                        <td className="px-3 py-1">{item.description}</td>
                        <td className="px-3 py-1 text-xs">
                          {age > STALE_DAYS ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800" title="A bank will normally refuse a cheque this old">
                              {age} days — stale-dated
                            </span>
                          ) : (
                            <span className="text-gray-400">{age} days</span>
                          )}
                        </td>
                        <td className="px-3 py-1 text-right tabular-nums">
                          <Money cents={item.amountCents} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

      {data && (
        <p className="text-xs text-gray-400">
          Runs from the bank's number to the books', because the statement is the fact and the difference is what the business knows
          that the bank does not yet. Anything outstanding for more than six months is flagged: a Canadian bank will normally refuse
          a cheque that old, so it needs reversing rather than waiting for.
        </p>
      )}
    </div>
  );
}
