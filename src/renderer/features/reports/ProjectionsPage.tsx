import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { Money, formatCents } from '../../components/Money';
import { ReportDateRange } from '../../components/ReportDateRange';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
}

const PROJECT_OPTIONS = [1, 3, 6];

function historyStartIso(months: number): string {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months + 1, 1);
  return date.toISOString().slice(0, 10);
}

function monthsInRange(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 1;
  return Math.max(1, Math.min(24, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1));
}

export function ProjectionsPage() {
  const [historyFrom, setHistoryFrom] = useState(() => historyStartIso(6));
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [monthsToProject, setMonthsToProject] = useState(3);
  const monthsOfHistory = monthsInRange(historyFrom, asOfDate);

  const { data, loading, error } = useIpcQuery(
    () => window.api.reports.projections({ asOfDate, monthsOfHistory, monthsToProject }),
    [asOfDate, monthsOfHistory, monthsToProject],
  );

  const chartData = useMemo(() => {
    if (!data) return [];
    return [...data.history, ...data.projected];
  }, [data]);

  const lastHistoryMonth = data?.history[data.history.length - 1]?.month;

  return (
    <div className="w-full">
      <div className="mb-3 rounded border border-gold-200 bg-gold-50 px-3 py-2 text-sm text-gold-800">
        These are simple estimates based on your trailing average revenue and expenses — a planning tool, not a financial
        forecast or professional advice. Review with your accountant before relying on them.
      </div>

      <div className="mb-3 flex items-center gap-3">
        <ReportDateRange
          from={historyFrom}
          to={asOfDate}
          onFromChange={setHistoryFrom}
          onToChange={setAsOfDate}
          fromLabel="History from"
          toLabel="Actuals through"
        />
        <label className="text-sm text-gray-600">
          Project Forward
          <select
            className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
            value={monthsToProject}
            onChange={(e) => setMonthsToProject(Number(e.target.value))}
          >
            {PROJECT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} months
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {data && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-3">
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">Avg Monthly Revenue</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                <Money cents={data.averageMonthlyRevenueCents} />
              </div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">Avg Monthly Expenses</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                <Money cents={data.averageMonthlyExpenseCents} />
              </div>
            </div>
            <div className="rounded border border-gray-200 bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-400">Avg Monthly Net Income</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                <Money cents={data.averageMonthlyNetIncomeCents} />
              </div>
            </div>
          </div>

          <div className="rounded border border-gray-200 bg-white p-3" style={{ height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v: number) => `$${Math.round(v / 100000)}k`} tick={{ fontSize: 12 }} width={48} />
                <Tooltip formatter={(value) => formatCents(Number(value))} />
                <Legend />
                {lastHistoryMonth && (
                  <ReferenceLine
                    x={lastHistoryMonth}
                    stroke="#a86f18"
                    strokeDasharray="4 4"
                    label={{ value: 'Actual → Projected', position: 'insideTopRight', fontSize: 11, fill: '#a86f18' }}
                  />
                )}
                <Bar dataKey="revenueCents" name="Revenue" fill="#2f9d5c" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expenseCents" name="Expenses" fill="#e9c25c" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="netIncomeCents" name="Net Income" stroke="#15422b" strokeWidth={2} dot />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Months after the dashed line are projected using your trailing average — actual results will vary.
          </p>
        </>
      )}
    </div>
  );
}
