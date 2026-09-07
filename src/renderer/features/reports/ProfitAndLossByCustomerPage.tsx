import { useState } from 'react';
import { CustomerLink } from '../../components/DrillLinks';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Revenue, and any directly-attributed cost, per customer.
 *
 * Deliberately not called a profit figure per customer. Only costs actually tagged to a customer
 * are counted; rent, insurance and the rest of the overhead belong to the business and are not
 * spread across whoever happens to appear here. What this gives is revenue and contribution, which
 * is what the books can actually support. */

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

export function ProfitAndLossByCustomerPage() {
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());

  const { data, loading, error } = useIpcQuery(
    () => window.api.reports.profitAndLossByCustomer({ periodStart, periodEnd }),
    [periodStart, periodEnd],
  );

  const hasAnyCost = (data?.totalDirectCostCents ?? 0) !== 0;

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
      {data && data.rows.length === 0 && !loading && (
        <p className="text-sm text-gray-500">No posted revenue in this period.</p>
      )}

      {data && data.rows.length > 0 && (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left font-medium">Customer</th>
                <th className="px-3 py-2 text-right font-medium">Revenue</th>
                {hasAnyCost && <th className="px-3 py-2 text-right font-medium">Direct cost</th>}
                {hasAnyCost && <th className="px-3 py-2 text-right font-medium">Contribution</th>}
                <th className="px-3 py-2 text-right font-medium">% of revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.customerId ?? 'none'} className="border-b border-gray-100">
                  <td className={`px-3 py-1.5 ${row.customerId === null ? 'text-gray-500 italic' : ''}`}><CustomerLink id={row.customerId} name={row.customerName} /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    <Money cents={row.revenueCents} />
                  </td>
                  {hasAnyCost && (
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                      {row.directCostCents ? <Money cents={row.directCostCents} /> : <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  {hasAnyCost && (
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                      <Money cents={row.marginCents} />
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                    {data.totalRevenueCents ? `${((row.revenueCents / data.totalRevenueCents) * 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-gray-300 font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money cents={data.totalRevenueCents} />
                </td>
                {hasAnyCost && (
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Money cents={data.totalDirectCostCents} />
                  </td>
                )}
                {hasAnyCost && (
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Money cents={data.totalRevenueCents - data.totalDirectCostCents} />
                  </td>
                )}
                <td className="px-3 py-2 text-right tabular-nums">100.0%</td>
              </tr>
            </tbody>
          </table>

          {data.untaggedRevenueCents !== 0 && (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Money cents={data.untaggedRevenueCents} /> of revenue has no customer recorded against it. It is shown as its own row
              rather than shared out, since the books do not say who it belongs to. Setting the Name on a journal line, or invoicing
              through Invoices, is what attributes it.
            </p>
          )}

          <p className="text-xs text-gray-400">
            {hasAnyCost
              ? 'Direct cost counts only expenses tagged to that customer. Overheads such as rent and insurance are not allocated, so contribution is revenue less traceable cost — not profit after overhead.'
              : 'No expenses are tagged to a customer, so only revenue is shown. Tag an expense line with a Name to see contribution per customer.'}
          </p>
        </>
      )}
    </div>
  );
}
