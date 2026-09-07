import { useState } from 'react';
import { VendorLink } from '../../components/DrillLinks';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** What was spent with each vendor over a period, and what it was spent on.
 *
 * Counts what was BOUGHT, not what was paid — the cost belongs to the year the purchase was made,
 * not the year the cheque happened to clear. The money side of each transaction is excluded, so
 * paying a bill does not show up as a second helping of spend. */

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

export function ExpensesByVendorPage() {
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());

  const { data, loading, error } = useIpcQuery(
    () => window.api.reports.expensesByVendor({ periodStart, periodEnd }),
    [periodStart, periodEnd],
  );

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">From</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <label className="text-sm text-gray-600">To</label>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {data && data.rows.length === 0 && !loading && <p className="text-sm text-gray-500">No purchases in this period.</p>}

      {data && data.rows.length > 0 && (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left font-medium">Vendor</th>
                <th className="px-3 py-2 text-left font-medium">Mostly spent on</th>
                <th className="px-3 py-2 text-right font-medium">Transactions</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">% of spend</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.vendorId ?? 'none'} className="border-b border-gray-100">
                  <td className={`px-3 py-1.5 ${r.vendorId === null ? 'italic text-gray-500' : ''}`}><VendorLink id={r.vendorId} name={r.vendorName} /></td>
                  <td className="px-3 py-1.5 text-xs text-gray-500">
                    {r.topAccounts.map((a) => a.accountName).join(' · ') || '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{r.transactionCount}</td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    <Money cents={r.amountCents} />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                    {data.totalCents ? `${((r.amountCents / data.totalCents) * 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-gray-300 font-semibold">
                <td className="px-3 py-2" colSpan={3}>
                  Total
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money cents={data.totalCents} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">100.0%</td>
              </tr>
            </tbody>
          </table>

          {data.untaggedCents !== 0 && (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Money cents={data.untaggedCents} /> of spend has no vendor recorded against it. Setting the Name on a journal line,
              or entering purchases as bills, is what attributes it.
            </p>
          )}

          <p className="text-xs text-gray-400">
            Counts what was bought in the period, not what was paid — so a bill settled next year still belongs to this one. Bank and
            card accounts are excluded, otherwise paying for something would count as spending again.
          </p>
        </>
      )}
    </div>
  );
}
