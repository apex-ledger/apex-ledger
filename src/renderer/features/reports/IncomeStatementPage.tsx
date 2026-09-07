import { grossMarginPercent } from '@shared/domain/ledger/costOfSales';
import { useMemo, useState } from 'react';
import { DateInput } from '../../components/DateInput';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Section } from '@shared/domain/ledger/sectionHelpers';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { Money, formatCents } from '../../components/Money';
import { PeriodPresetSelect } from '../../components/PeriodPresetSelect';
import { useUiStore } from '../../app/store/uiStore';
import { localIsoDate } from '@shared/domain/dates/localDate';

const EXPENSE_BAR_COLORS = ['#217d48', '#4fb877', '#82d29e', '#c98f1f', '#dfa931', '#e9c25c', '#875417', '#194f33'];

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

function SectionTable({
  section,
  showComparative,
  showAdjusting,
  onDrillDown,
}: {
  section: Section;
  showComparative: boolean;
  showAdjusting: boolean;
  onDrillDown: (accountId: number) => void;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      {showAdjusting && (
        <thead>
          <tr className="text-xs uppercase tracking-wide text-gray-400">
            <th className="px-3 pb-1 text-left" />
            {showComparative && <th className="px-3 pb-1 text-right font-medium">Comparative</th>}
            <th className="px-3 pb-1 text-right font-medium">Adjusting Entries</th>
            <th className="px-3 pb-1 text-right font-medium">Final</th>
          </tr>
        </thead>
      )}
      <tbody>
        {section.lines.map((line) => (
          <tr
            key={line.account.id}
            onClick={() => onDrillDown(line.account.id)}
            className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-brand-50"
            title="See every posted transaction behind this amount — click through to correct one"
          >
            <td className="px-3 py-1.5">{line.account.name}</td>
            {!showAdjusting && (
              <td className="px-3 py-1.5 text-right">
                <Money cents={line.amountCents} />
              </td>
            )}
            {showComparative && (
              <td className="px-3 py-1.5 text-right text-gray-500">
                <Money cents={line.comparativeAmountCents ?? 0} />
              </td>
            )}
            {showAdjusting && (
              <>
                <td className="px-3 py-1.5 text-right text-amber-700">
                  {line.adjustingAmountCents ? <Money cents={line.adjustingAmountCents} /> : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-1.5 text-right font-medium">
                  <Money cents={line.amountCents} />
                </td>
              </>
            )}
          </tr>
        ))}
        <tr className="bg-gray-50 font-semibold">
          <td className="px-3 py-2">
            Total {section.label}
          </td>
          {!showAdjusting && (
            <td className="px-3 py-2 text-right">
              <Money cents={section.totalCents} />
            </td>
          )}
          {showComparative && (
            <td className="px-3 py-2 text-right">
              <Money cents={section.comparativeTotalCents ?? 0} />
            </td>
          )}
          {showAdjusting && (
            <>
              <td className="px-3 py-2 text-right text-amber-700">
                <Money cents={section.adjustingTotalCents ?? 0} />
              </td>
              <td className="px-3 py-2 text-right">
                <Money cents={section.totalCents} />
              </td>
            </>
          )}
        </tr>
      </tbody>
    </table>
  );
}

export function IncomeStatementPage() {
  const setView = useUiStore((s) => s.setView);
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [compare, setCompare] = useState(false);
  const [basis, setBasis] = useState<'accrual' | 'cash'>('accrual');
  const [comparativeStart, setComparativeStart] = useState('');
  const [comparativeEnd, setComparativeEnd] = useState('');
  const [showAdjusting, setShowAdjusting] = useState(false);

  function drillDown(accountId: number) {
    setView({ kind: 'report', report: 'generalLedger', drillDown: { accountId, dateFrom: periodStart, dateTo: periodEnd } });
  }

  const { data, loading, error } = useIpcQuery(
    () =>
      window.api.reports.incomeStatement({
        periodStart,
        periodEnd,
        comparativeStart: compare ? comparativeStart || undefined : undefined,
        comparativeEnd: compare ? comparativeEnd || undefined : undefined,
        basis,
      }),
    [periodStart, periodEnd, compare, comparativeStart, comparativeEnd, basis],
  );

  const showComparative = compare && !!data?.comparativeStart;

  const expenseChartData = useMemo(() => {
    if (!data) return [];
    return [...data.expenses.lines]
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 8)
      .map((line) => ({ name: line.account.name, amountCents: line.amountCents }));
  }, [data]);

  // Null when there is no revenue: 0% would read as "everything sold at cost" rather than
  // "nothing was sold".
  const grossMargin = data ? grossMarginPercent(data.revenue.totalCents, data.grossProfitCents) : null;

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-3">
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
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
          Compare to
        </label>
        {compare && (
          <>
            <DateInput value={comparativeStart} onChange={setComparativeStart} className="w-32" />
            <span className="text-sm text-gray-400">to</span>
            <DateInput value={comparativeEnd} onChange={setComparativeEnd} className="w-32" />
          </>
        )}
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={showAdjusting} onChange={(e) => setShowAdjusting(e.target.checked)} />
          Show adjusting entries
        </label>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs" role="radiogroup" aria-label="Accounting basis">
          {(['accrual', 'cash'] as const).map((b) => (
            <button key={b} type="button" role="radio" aria-checked={basis === b} onClick={() => setBasis(b)} className={`rounded-md px-2.5 py-1 ${basis === b ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`} title={b === 'cash' ? 'Invoices and bills count when paid, not when raised' : 'Invoices and bills count on their own date'}>
              {b === 'accrual' ? 'Accrual' : 'Cash basis'}
            </button>
          ))}
        </div>
      </div>
      {basis === 'cash' && (
        <p className="mb-3 rounded bg-sky-50 px-3 py-1.5 text-xs text-sky-900">
          Cash basis: an invoice counts as income on the day the customer pays it, a bill counts as an expense on the day you pay it, each in proportion to the amount paid. Unpaid ones are left out. Sales receipts, expenses paid from the bank, payroll and journal entries are unchanged. Example: a $1,130 invoice raised in March and half paid in April shows $500 of income in April, none in March.
        </p>
      )}

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {data && (
        <div className="space-y-3">
          {expenseChartData.length > 0 && (
            <div className="rounded border border-gray-200 bg-white p-3">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Top Expense Categories</h3>
              <div style={{ height: Math.max(120, expenseChartData.length * 32) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expenseChartData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v: number) => `$${Math.round(v / 100)}`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => formatCents(Number(value))} />
                    <Bar dataKey="amountCents" radius={[0, 3, 3, 0]}>
                      {expenseChartData.map((_, i) => (
                        <Cell key={i} fill={EXPENSE_BAR_COLORS[i % EXPENSE_BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <div className="rounded border border-gray-200 bg-white">
            <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Revenue</h3>
            <SectionTable section={data.revenue} showComparative={showComparative} showAdjusting={showAdjusting} onDrillDown={drillDown} />
          </div>
          {/* Cost of sales and gross profit only appear when the business has any. A consultancy
              with no direct costs would otherwise get an empty section and a gross profit line
              identical to its revenue, which says nothing. */}
          {data.costOfSales.lines.length > 0 && (
            <>
              <div className="rounded border border-gray-200 bg-white">
                <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Cost of Sales</h3>
                <SectionTable section={data.costOfSales} showComparative={showComparative} showAdjusting={showAdjusting} onDrillDown={drillDown} />
              </div>
              <div className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 p-3 text-sm font-semibold">
                <span>
                  Gross Profit
                  {grossMargin !== null && (
                    <span className="ml-2 font-normal text-gray-500">{grossMargin.toFixed(1)}% margin</span>
                  )}
                </span>
                <Money cents={data.grossProfitCents} />
              </div>
            </>
          )}

          <div className="rounded border border-gray-200 bg-white">
            <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">
              {data.costOfSales.lines.length > 0 ? 'Operating Expenses' : 'Expenses'}
            </h3>
            <SectionTable
              section={data.costOfSales.lines.length > 0 ? data.operatingExpenses : data.expenses}
              showComparative={showComparative}
              showAdjusting={showAdjusting}
              onDrillDown={drillDown}
            />
          </div>
          <div className="rounded border border-gray-200 bg-white p-3 text-right text-base font-semibold">
            Net Income: <Money cents={data.netIncomeCents} />
          </div>
        </div>
      )}
    </div>
  );
}
