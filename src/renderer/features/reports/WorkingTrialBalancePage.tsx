import { useState } from 'react';
import { AccountLink } from '../../components/DrillLinks';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** The sheet an accountant closes a year from: opening balance, the period's movement, the
 * adjustments made to it, and the closing balance, for every account.
 *
 * The plain Trial Balance gives closing balances only — "what does it say now". This adds "what did
 * I change to get here", which is the whole of a file review. */

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

export function WorkingTrialBalancePage() {
  const setView = useUiStore((s) => s.setView);
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [adjustedOnly, setAdjustedOnly] = useState(false);

  const { data, loading, error } = useIpcQuery(
    () => window.api.reports.workingTrialBalance({ periodStart, periodEnd }),
    [periodStart, periodEnd],
  );

  const rows = (data?.rows ?? []).filter((r) => !adjustedOnly || r.adjustmentCents !== 0);

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">From</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <label className="text-sm text-gray-600">To</label>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={adjustedOnly} onChange={(e) => setAdjustedOnly(e.target.checked)} />
          Only accounts I adjusted
        </label>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {data && data.rows.length === 0 && !loading && (
        <p className="text-sm text-gray-500">No account has a balance or any activity in this period.</p>
      )}

      {data && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Opening</th>
                <th className="px-3 py-2 text-right font-medium">Movement</th>
                <th className="px-3 py-2 text-right font-medium">Unadjusted</th>
                <th className="px-3 py-2 text-right font-medium">Adjustments</th>
                <th className="px-3 py-2 text-right font-medium">Closing Dr</th>
                <th className="px-3 py-2 text-right font-medium">Closing Cr</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.account.id}
                  onClick={() =>
                    setView({
                      kind: 'report',
                      report: 'generalLedger',
                      drillDown: { accountId: r.account.id, dateFrom: periodStart, dateTo: periodEnd },
                    })
                  }
                  className={`cursor-pointer border-b border-gray-100 hover:bg-brand-50 ${r.adjustmentCents !== 0 ? 'bg-amber-50/50' : ''}`}
                  title="See every posted transaction behind this account"
                >
                  <td className="px-3 py-1.5"><AccountLink id={r.account.id} name={r.account.name} dateFrom={periodStart} dateTo={periodEnd} /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                    <Money cents={r.openingCents} />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    <Money cents={r.movementCents} />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                    <Money cents={r.unadjustedCents} />
                  </td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${r.adjustmentCents !== 0 ? 'font-medium text-amber-800' : 'text-gray-300'}`}>
                    {r.adjustmentCents !== 0 ? <Money cents={r.adjustmentCents} /> : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    {r.closingDebitCents ? <Money cents={r.closingDebitCents} /> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    {r.closingCreditCents ? <Money cents={r.closingCreditCents} /> : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-gray-300 font-semibold">
                <td className="px-3 py-2" colSpan={4}>
                  Total
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-800">
                  <Money cents={data.totalAdjustmentCents} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money cents={data.totalClosingDebitCents} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money cents={data.totalClosingCreditCents} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <p className={`text-xs ${data.isBalanced ? 'text-gray-400' : 'text-red-600'}`}>
          {data.isBalanced
            ? 'Debits equal credits at the close. Adjusted rows are tinted; the Adjustments column is already inside the closing balance, and Unadjusted is what the books said before you touched them. Click any row for its transactions.'
            : 'This trial balance does not balance — please report it.'}
        </p>
      )}
    </div>
  );
}
