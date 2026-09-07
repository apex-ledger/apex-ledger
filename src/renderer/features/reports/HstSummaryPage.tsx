import { useMemo, useState } from 'react';
import { AccountLink } from '../../components/DrillLinks';
import { DateInput } from '../../components/DateInput';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { Money, formatCents } from '../../components/Money';
import { PeriodPresetSelect } from '../../components/PeriodPresetSelect';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

function PeriodTable({ title, rows }: { title: string; rows: { period: string; collectedCents: number; itcCents: number; netPayableCents: number }[] }) {
  return (
    <div className="rounded border border-gray-200 bg-white">
      <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">{title}</h3>
      <table className="w-full border-collapse text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium text-gray-600">Period</th>
            <th className="px-3 py-1.5 text-right font-medium text-gray-600">HST Collected</th>
            <th className="px-3 py-1.5 text-right font-medium text-gray-600">ITC (Paid)</th>
            <th className="px-3 py-1.5 text-right font-medium text-gray-600">Net Payable</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-4 text-center text-gray-400">
                No HST-tagged activity in this range.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.period} className="border-b border-gray-100 last:border-0">
              <td className="px-3 py-1.5">{row.period}</td>
              <td className="px-3 py-1.5 text-right">
                <Money cents={row.collectedCents} />
              </td>
              <td className="px-3 py-1.5 text-right">
                <Money cents={row.itcCents} />
              </td>
              <td className={`px-3 py-1.5 text-right font-medium ${row.netPayableCents < 0 ? 'text-green-600' : ''}`}>
                <Money cents={row.netPayableCents} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HstSummaryPage() {
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());

  const { data, loading, error } = useIpcQuery(() => window.api.reports.hstSummary({ periodStart, periodEnd }), [periodStart, periodEnd]);

  const totals = useMemo(() => {
    if (!data) return null;
    const collectedCents = data.monthly.reduce((s, m) => s + m.collectedCents, 0);
    const itcCents = data.monthly.reduce((s, m) => s + m.itcCents, 0);
    const revenueCents = data.byAccount.filter((row) => row.direction === 'collected').reduce((sum, row) => sum + row.baseAmountCents, 0);
    const purchaseCents = data.byAccount.filter((row) => row.direction === 'itc').reduce((sum, row) => sum + row.baseAmountCents, 0);
    return { revenueCents, purchaseCents, collectedCents, itcCents, netPayableCents: collectedCents - itcCents };
  }, [data]);

  const collectedRows = data?.byAccount.filter((r) => r.direction === 'collected') ?? [];
  const itcRows = data?.byAccount.filter((r) => r.direction === 'itc') ?? [];

  return (
    <div className="w-full">
      <div className="mb-3 rounded border border-gold-200 bg-gold-50 px-3 py-2 text-sm text-gold-800">
        Figures come from posted sales-tax lines and their linked revenue, purchase, expense, or asset categories for the selected period.
        Lines tagged "Manual HST" with no entered amount are <strong>excluded</strong> and listed below for completion. Confirm the final
        return against source documents and CRA My Business Account before remitting.
      </div>

      <div className="mb-3 flex items-center gap-3">
        <label className="text-sm text-gray-600">Period</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <span className="text-sm text-gray-400">to</span>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
        <PeriodPresetSelect
          referenceDateIso={periodStart}
          onSelect={(range) => {
            setPeriodStart(range.from);
            setPeriodEnd(range.to);
          }}
        />
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {data && totals && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">Taxable Revenue</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                <Money cents={totals.revenueCents} />
              </div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">HST Collected (Sales)</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                <Money cents={totals.collectedCents} />
              </div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">Taxable Purchases / Expenses</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                <Money cents={totals.purchaseCents} />
              </div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">ITC (HST Paid on Purchases)</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                <Money cents={totals.itcCents} />
              </div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">Net HST Payable</div>
              <div className={`mt-1 text-lg font-semibold ${totals.netPayableCents < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                <Money cents={totals.netPayableCents} />
              </div>
              {totals.netPayableCents < 0 && <div className="text-xs text-green-600">Refund position</div>}
            </div>
          </div>

          {data.manualReviewLines.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3">
              <h3 className="text-sm font-semibold text-amber-800">Needs Manual HST Calculation ({data.manualReviewLines.length})</h3>
              <p className="mb-2 text-xs text-amber-700">
                These transactions were tagged "Manual HST" — often mixed-supply purchases (e.g. wholesale/cash-and-carry
                invoices with both taxable and zero-rated items). Calculate the actual HST from the source invoice and
                record it separately.
              </p>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs text-amber-700">
                    <th className="py-1 pr-3">Date</th><EnteredTh className="py-1 pr-3" />
                    <th className="py-1 pr-3">Account</th>
                    <th className="py-1 pr-3">Description</th>
                    <th className="py-1 pr-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.manualReviewLines.map((line, i) => (
                    <tr key={i} className="border-t border-amber-200">
                      <td className="py-1 pr-3 tabular-nums">{line.entryDate}</td><EnteredTd at={line.createdAt} className="py-1 pr-3" />
                      <td className="py-1 pr-3"><AccountLink id={line.account.id} name={line.account.name} dateFrom={periodStart} dateTo={periodEnd} /></td>
                      <td className="py-1 pr-3">{line.description ?? '—'}</td>
                      <td className="py-1 pr-3 text-right">
                        <Money cents={line.baseAmountCents} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded border border-gray-200 bg-white p-3" style={{ height: 320 }}>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Monthly Trend</h3>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={data.monthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => `$${Math.round(v / 100)}`} tick={{ fontSize: 12 }} width={56} />
                <Tooltip formatter={(value) => formatCents(Number(value))} />
                <Legend />
                <Bar dataKey="collectedCents" name="HST Collected" fill="#2f9d5c" radius={[3, 3, 0, 0]} />
                <Bar dataKey="itcCents" name="ITC (Paid)" fill="#e9c25c" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <PeriodTable title="Quarterly Summary" rows={data.quarterly} />
          <PeriodTable title="Annual Summary" rows={data.annual} />

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="rounded border border-gray-200 bg-white">
              <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">HST Collected — by Account (Sales)</h3>
              <table className="w-full border-collapse text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Revenue category</th>
                    <th className="px-3 py-1.5 text-right font-medium">Revenue amount</th>
                    <th className="px-3 py-1.5 text-right font-medium">HST collected</th>
                  </tr>
                </thead>
                <tbody>
                  {collectedRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-center text-gray-400">None in this range.</td>
                    </tr>
                  )}
                  {collectedRows.map((row) => (
                    <tr key={row.account.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-1.5"><AccountLink id={row.account.id} name={row.account.name} dateFrom={periodStart} dateTo={periodEnd} /></td>
                      <td className="px-3 py-1.5 text-right">
                        <Money cents={row.baseAmountCents} />
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium">
                        <Money cents={row.hstCents} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {collectedRows.length > 0 && (
                  <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold">
                    <tr>
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right"><Money cents={totals.revenueCents} /></td>
                      <td className="px-3 py-2 text-right"><Money cents={totals.collectedCents} /></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="rounded border border-gray-200 bg-white">
              <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">ITC — by Account (Purchases/Invoices)</h3>
              <table className="w-full border-collapse text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Purchase / expense category</th>
                    <th className="px-3 py-1.5 text-right font-medium">Purchase amount</th>
                    <th className="px-3 py-1.5 text-right font-medium">ITC paid</th>
                  </tr>
                </thead>
                <tbody>
                  {itcRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-center text-gray-400">None in this range.</td>
                    </tr>
                  )}
                  {itcRows.map((row) => (
                    <tr key={row.account.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-1.5"><AccountLink id={row.account.id} name={row.account.name} dateFrom={periodStart} dateTo={periodEnd} /></td>
                      <td className="px-3 py-1.5 text-right">
                        <Money cents={row.baseAmountCents} />
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium">
                        <Money cents={row.hstCents} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {itcRows.length > 0 && (
                  <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold">
                    <tr>
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right"><Money cents={totals.purchaseCents} /></td>
                      <td className="px-3 py-2 text-right"><Money cents={totals.itcCents} /></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
