import { useState } from 'react';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

export function ChangesInEquityPage() {
  const setView = useUiStore((s) => s.setView);
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());

  const { data, loading, error } = useIpcQuery(
    () => window.api.reports.changesInEquity({ periodStart, periodEnd }),
    [periodStart, periodEnd],
  );

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">From</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <label className="text-sm text-gray-600">To</label>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {data && data.rows.length === 0 && (
        <p className="text-sm text-gray-500">No equity accounts carry a balance in this period.</p>
      )}

      {data && data.rows.length > 0 && (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left font-medium">Component</th>
                <th className="px-3 py-2 text-right font-medium">Opening</th>
                <th className="px-3 py-2 text-right font-medium">Movement</th>
                <th className="px-3 py-2 text-right font-medium">Closing</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr
                  key={row.accountId ?? 'retained'}
                  onClick={
                    row.accountId !== null
                      ? () =>
                          setView({
                            kind: 'report',
                            report: 'generalLedger',
                            drillDown: { accountId: row.accountId!, dateFrom: periodStart, dateTo: periodEnd },
                          })
                      : undefined
                  }
                  className={`border-b border-gray-100 last:border-0 ${row.accountId !== null ? 'cursor-pointer hover:bg-brand-50' : ''}`}
                  title={row.accountId !== null ? 'See every posted transaction behind this movement' : undefined}
                >
                  <td className="px-3 py-1.5">
                    {row.label}
                    {row.isDerived && <span className="ml-2 text-xs text-gray-400">derived</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                    <Money cents={row.openingCents} />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    <Money cents={row.movementCents} />
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    <Money cents={row.closingCents} />
                  </td>
                </tr>
              ))}
              <tr className="border-t border-gray-300 font-semibold">
                <td className="px-3 py-2">Total equity</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money cents={data.totalOpeningCents} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money cents={data.totalMovementCents} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money cents={data.totalClosingCents} />
                </td>
              </tr>
            </tbody>
          </table>

          <p className="mt-3 text-xs text-gray-400">
            No year-end closing entry is posted in this ledger, so profit stays in the revenue and expense accounts rather than moving
            into an equity account. Retained earnings is therefore shown as a derived row: profit earned before this period opened is
            the opening balance, and this period's profit of <Money cents={data.netIncomeCents} /> is the movement. Click any account
            row to see the transactions behind it.
          </p>
        </>
      )}
    </div>
  );
}
