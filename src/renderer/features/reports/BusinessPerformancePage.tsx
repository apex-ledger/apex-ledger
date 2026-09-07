import { useMemo, useState } from 'react';
import { DateInput } from '../../components/DateInput';
import { computePeriodPresets, type PeriodPresetId } from '@shared/domain/ledger/periodPresets';
import { computeBusinessPerformance, type PerformanceMover } from '@shared/domain/ledger/businessPerformance';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { Money, formatCents } from '../../components/Money';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
}

function formatPercentLabel(p: number | null): string {
  if (p === null) return 'new';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

function ChangeBadge({ percent }: { percent: number | null }) {
  const positive = percent !== null && percent > 0;
  const negative = percent !== null && percent < 0;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        positive ? 'bg-green-100 text-green-700' : negative ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {formatPercentLabel(percent)}
    </span>
  );
}

function MetricCard({ label, currentCents, comparativeCents, changePercent }: { label: string; currentCents: number; comparativeCents: number; changePercent: number | null }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
        <ChangeBadge percent={changePercent} />
      </div>
      <div className="mt-1 text-lg font-semibold text-gray-900">
        <Money cents={currentCents} />
      </div>
      <div className="mt-0.5 text-xs text-gray-400">
        Prior period: <Money cents={comparativeCents} className="text-gray-400" />
      </div>
    </div>
  );
}

function MoversTable({ title, movers }: { title: string; movers: PerformanceMover[] }) {
  if (movers.length === 0) return null;
  return (
    <div className="rounded border border-gray-200 bg-white">
      <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">{title}</h3>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="px-3 py-1.5">Account</th>
            <th className="px-3 py-1.5 text-right">Current</th>
            <th className="px-3 py-1.5 text-right">Prior Period</th>
            <th className="px-3 py-1.5 text-right">Change</th>
          </tr>
        </thead>
        <tbody>
          {movers.map((m) => (
            <tr key={m.accountName} className="border-b border-gray-100 last:border-0">
              <td className="px-3 py-1.5">{m.accountName}</td>
              <td className="px-3 py-1.5 text-right">
                <Money cents={m.currentCents} />
              </td>
              <td className="px-3 py-1.5 text-right text-gray-500">
                <Money cents={m.comparativeCents} />
              </td>
              <td className="px-3 py-1.5 text-right">
                <span className={m.changeCents >= 0 ? 'text-green-700' : 'text-red-700'}>
                  {m.changeCents >= 0 ? '+' : ''}
                  {formatCents(m.changeCents)} ({formatPercentLabel(m.changePercent)})
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const VERDICT_COPY: Record<'growing' | 'declining' | 'flat', { label: string; bg: string; text: string }> = {
  growing: { label: 'Growing', bg: 'bg-green-50 border-green-200', text: 'text-green-800' },
  declining: { label: 'Declining', bg: 'bg-red-50 border-red-200', text: 'text-red-800' },
  flat: { label: 'Holding Steady', bg: 'bg-gray-50 border-gray-200', text: 'text-gray-700' },
};

export function BusinessPerformancePage() {
  const presets = useMemo(() => computePeriodPresets(todayIso()), []);
  const [selectedPreset, setSelectedPreset] = useState<PeriodPresetId>('thisQuarter');
  const [customRange, setCustomRange] = useState(false);
  const [periodStart, setPeriodStart] = useState(presets[0].periodStart);
  const [periodEnd, setPeriodEnd] = useState(presets[0].periodEnd);
  const [comparativeStart, setComparativeStart] = useState(presets[0].comparativeStart);
  const [comparativeEnd, setComparativeEnd] = useState(presets[0].comparativeEnd);

  function applyPreset(id: PeriodPresetId) {
    const preset = presets.find((p) => p.id === id)!;
    setSelectedPreset(id);
    setCustomRange(false);
    setPeriodStart(preset.periodStart);
    setPeriodEnd(preset.periodEnd);
    setComparativeStart(preset.comparativeStart);
    setComparativeEnd(preset.comparativeEnd);
  }

  const { data, loading, error } = useIpcQuery(
    () => window.api.reports.incomeStatement({ periodStart, periodEnd, comparativeStart, comparativeEnd }),
    [periodStart, periodEnd, comparativeStart, comparativeEnd],
  );

  const performance = useMemo(() => (data ? computeBusinessPerformance(data) : null), [data]);

  return (
    <div className="w-full">
      <div>
        <h1 className="text-lg font-semibold text-brand-900">Business Performance</h1>
        <p className="mt-1 text-sm text-gray-500">
          Compares real posted figures between two periods — no predictions, just what already happened in your books — to show whether
          the business is growing or declining and what's driving it.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              !customRange && selectedPreset === p.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomRange(true)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${customRange ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Custom Range…
        </button>
      </div>

      {customRange && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
          <span className="text-gray-500">Period:</span>
          <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
          <span className="text-gray-400">to</span>
          <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
          <span className="ml-3 text-gray-500">Compared to:</span>
          <DateInput value={comparativeStart} onChange={setComparativeStart} className="w-32" />
          <span className="text-gray-400">to</span>
          <DateInput value={comparativeEnd} onChange={setComparativeEnd} className="w-32" />
        </div>
      )}

      {error && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="mt-3 text-sm text-gray-400">Loading…</p>}

      {performance && (
        <div className="mt-3 space-y-3">
          <div className={`rounded-lg border p-3 ${VERDICT_COPY[performance.verdict].bg}`}>
            <div className={`text-lg font-bold ${VERDICT_COPY[performance.verdict].text}`}>
              {VERDICT_COPY[performance.verdict].label}
              {performance.netIncomeChangePercent !== null && ` — net income ${formatPercentLabel(performance.netIncomeChangePercent)}`}
            </div>
            <div className="mt-1 text-sm text-gray-600">
              {periodStart} to {periodEnd}, compared to {comparativeStart} to {comparativeEnd}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Revenue" currentCents={performance.revenueCurrentCents} comparativeCents={performance.revenueComparativeCents} changePercent={performance.revenueChangePercent} />
            <MetricCard label="Expenses" currentCents={performance.expenseCurrentCents} comparativeCents={performance.expenseComparativeCents} changePercent={performance.expenseChangePercent} />
            <MetricCard label="Net Income" currentCents={performance.netIncomeCurrentCents} comparativeCents={performance.netIncomeComparativeCents} changePercent={performance.netIncomeChangePercent} />
          </div>

          {performance.marginCurrentPercent !== null && (
            <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-700">
              Profit margin: <span className="font-semibold">{performance.marginCurrentPercent.toFixed(1)}%</span> of revenue
              {performance.marginComparativePercent !== null && (
                <span className="text-gray-400"> (prior period: {performance.marginComparativePercent.toFixed(1)}%)</span>
              )}
            </div>
          )}

          <div className="rounded border border-gray-200 bg-white p-3">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">What's Driving This</h3>
            <ul className="space-y-1.5 text-sm text-gray-700">
              {performance.insights.map((insight, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-brand-500">•</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>

          <MoversTable title="Revenue — Biggest Changes" movers={performance.topRevenueMovers} />
          <MoversTable title="Expenses — Biggest Changes" movers={performance.topExpenseMovers} />
        </div>
      )}

      {data && !performance && (
        <p className="mt-3 text-sm text-amber-600">No prior-period figures found for the comparison range — pick a different period, or post some transactions in it first.</p>
      )}
    </div>
  );
}
