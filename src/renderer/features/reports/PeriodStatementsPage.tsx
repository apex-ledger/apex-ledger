import { YearInput } from '../../components/YearInput';
import { useEffect, useMemo, useState } from 'react';
import type { IncomeStatementResult } from '@shared/domain/ledger/incomeStatement';
import type { Account } from '@shared/domain/types';
import { Money, formatCents } from '../../components/Money';
import { ReportDateRange } from '../../components/ReportDateRange';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** One Profit & Loss screen covering the four period-shaped variants an accountant asks for —
 * by month, by quarter, as a percentage of income, and this year against last. QuickBooks ships
 * these as four separate reports; they are the same computation over different date ranges, so
 * splitting them into four pages would be four copies of the same fetch-and-total code. The
 * period columns are built by calling the existing reports:incomeStatement handler once per
 * column, so nothing new is needed in the main process. */

type Mode = 'custom' | 'byMonth' | 'byQuarter' | 'percentOfIncome' | 'ytdComparison';

const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: 'custom', label: 'Custom date range', blurb: 'One profit and loss column for the exact From and To dates selected.' },
  { id: 'byMonth', label: 'By month', blurb: 'Twelve columns, one per month of the year.' },
  { id: 'byQuarter', label: 'Quarterly summary', blurb: 'Four columns, one per quarter, plus the year.' },
  { id: 'percentOfIncome', label: '% of total income', blurb: 'Every line as a share of revenue.' },
  { id: 'ytdComparison', label: 'Year-to-date comparison', blurb: 'This year to date against the same period last year.' },
];

function todayIso(): string {
  return localIsoDate();
}

function monthEnd(year: number, month1: number): string {
  const d = new Date(Date.UTC(year, month1, 0));
  return d.toISOString().slice(0, 10);
}

interface Column {
  key: string;
  label: string;
  from: string;
  to: string;
}

function buildColumns(mode: Mode, year: number, fyEndMonth: number, customFrom: string, customTo: string): Column[] {
  if (mode === 'custom') return [{ key: 'custom', label: `${customFrom} to ${customTo}`, from: customFrom, to: customTo }];
  // Columns follow the company's own fiscal year, not the calendar, so a September year-end
  // reads Oct..Sep rather than Jan..Dec.
  const startMonth = (fyEndMonth % 12) + 1;
  const startYear = fyEndMonth === 12 ? year : year - 1;
  if (mode === 'byMonth') {
    return Array.from({ length: 12 }, (_, i) => {
      const m0 = startMonth - 1 + i;
      const y = startYear + Math.floor(m0 / 12);
      const m = (m0 % 12) + 1;
      return {
        key: `${y}-${String(m).padStart(2, '0')}`,
        label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
        from: `${y}-${String(m).padStart(2, '0')}-01`,
        to: monthEnd(y, m),
      };
    });
  }
  if (mode === 'byQuarter') {
    return Array.from({ length: 4 }, (_, q) => {
      const m0 = startMonth - 1 + q * 3;
      const y = startYear + Math.floor(m0 / 12);
      const m = (m0 % 12) + 1;
      const em0 = m0 + 2;
      const ey = startYear + Math.floor(em0 / 12);
      const em = (em0 % 12) + 1;
      return {
        key: `q${q + 1}`,
        label: `Q${q + 1}`,
        from: `${y}-${String(m).padStart(2, '0')}-01`,
        to: monthEnd(ey, em),
      };
    });
  }
  const fyStart = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
  const fyEnd = monthEnd(year, fyEndMonth);
  if (mode === 'percentOfIncome') {
    return [{ key: 'fy', label: 'This year', from: fyStart, to: fyEnd }];
  }
  const priorStart = `${startYear - 1}-${String(startMonth).padStart(2, '0')}-01`;
  const today = todayIso();
  const ytdEnd = today < fyEnd ? today : fyEnd;
  const priorYtdEnd = `${Number(ytdEnd.slice(0, 4)) - 1}${ytdEnd.slice(4)}`;
  return [
    { key: 'ytd', label: 'This year to date', from: fyStart, to: ytdEnd },
    { key: 'prior', label: 'Same period last year', from: priorStart, to: priorYtdEnd },
  ];
}

export function PeriodStatementsPage() {
  const [mode, setMode] = useState<Mode>('custom');
  const [year, setYear] = useState(() => Number(todayIso().slice(0, 4)));
  const [fyEndMonth, setFyEndMonth] = useState(12);
  const [customFrom, setCustomFrom] = useState(() => `${todayIso().slice(0, 4)}-01-01`);
  const [customTo, setCustomTo] = useState(todayIso());
  const [results, setResults] = useState<Record<string, IncomeStatementResult>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(
    () => buildColumns(mode, year, fyEndMonth, customFrom, customTo),
    [mode, year, fyEndMonth, customFrom, customTo],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const out: Record<string, IncomeStatementResult> = {};
      for (const col of columns) {
        const res = await window.api.reports.incomeStatement({ periodStart: col.from, periodEnd: col.to });
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
          setLoading(false);
          return;
        }
        out[col.key] = res.data;
      }
      if (cancelled) return;
      setResults(out);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [columns]);

  // Every account that appears in any column, so a line absent from one month still gets a row.
  const rows = useMemo(() => {
    const rev = new Map<number, Account>();
    const exp = new Map<number, Account>();
    for (const col of columns) {
      const r = results[col.key];
      if (!r) continue;
      for (const l of r.revenue.lines) rev.set(l.account.id, l.account);
      for (const l of r.expenses.lines) exp.set(l.account.id, l.account);
    }
    const sort = (m: Map<number, Account>) => [...m.values()].sort((a, b) => a.code.localeCompare(b.code));
    return { revenue: sort(rev), expenses: sort(exp) };
  }, [columns, results]);

  function cell(colKey: string, accountId: number, kind: 'revenue' | 'expenses'): number {
    const r = results[colKey];
    if (!r) return 0;
    const line = r[kind].lines.find((l) => l.account.id === accountId);
    return line ? line.amountCents : 0;
  }

  const showPercent = mode === 'percentOfIncome';
  function pct(colKey: string, cents: number): string {
    const r = results[colKey];
    if (!r || r.revenue.totalCents === 0) return '—';
    return ((cents / r.revenue.totalCents) * 100).toFixed(1) + '%';
  }

  const activeMode = MODES.find((m) => m.id === mode)!;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-gray-600">View</span>
          <select className="mt-1 rounded border border-gray-300 px-2 py-1.5" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
        {mode === 'custom' && (
          <ReportDateRange from={customFrom} to={customTo} onFromChange={setCustomFrom} onToChange={setCustomTo} />
        )}
        {mode !== 'custom' && (
          <>
        <label className="text-sm">
          <span className="block text-gray-600">Fiscal year ending</span>
          <select className="mt-1 rounded border border-gray-300 px-2 py-1.5" value={fyEndMonth} onChange={(e) => setFyEndMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString(undefined, { month: 'long' })}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">Year</span>
          <YearInput value={year} onChange={setYear} className="mt-1 w-24 rounded border border-gray-300 px-2 py-1.5" />
        </label>
          </>
        )}
      </div>

      <p className="text-sm text-gray-500">{activeMode.blurb}</p>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-500">Building {columns.length} period{columns.length === 1 ? '' : 's'}…</p>}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left font-medium">Account</th>
                {columns.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-right font-medium">{c.label}</th>
                ))}
                {showPercent && <th className="px-3 py-2 text-right font-medium">% of income</th>}
              </tr>
            </thead>
            <tbody>
              <tr><td className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500" colSpan={columns.length + 2}>Revenue</td></tr>
              {rows.revenue.map((a) => (
                <tr key={`r${a.id}`} className="border-b border-gray-100">
                  <td className="px-3 py-1.5">{a.name}</td>
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-1.5 text-right tabular-nums"><Money cents={cell(c.key, a.id, 'revenue')} /></td>
                  ))}
                  {showPercent && <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{pct(columns[0].key, cell(columns[0].key, a.id, 'revenue'))}</td>}
                </tr>
              ))}
              <tr className="border-b border-gray-300 font-medium">
                <td className="px-3 py-1.5">Total revenue</td>
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-1.5 text-right tabular-nums"><Money cents={results[c.key]?.revenue.totalCents ?? 0} /></td>
                ))}
                {showPercent && <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">100.0%</td>}
              </tr>

              <tr><td className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500" colSpan={columns.length + 2}>Expenses</td></tr>
              {rows.expenses.map((a) => (
                <tr key={`e${a.id}`} className="border-b border-gray-100">
                  <td className="px-3 py-1.5">{a.name}</td>
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-1.5 text-right tabular-nums"><Money cents={cell(c.key, a.id, 'expenses')} /></td>
                  ))}
                  {showPercent && <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{pct(columns[0].key, cell(columns[0].key, a.id, 'expenses'))}</td>}
                </tr>
              ))}
              <tr className="border-b border-gray-300 font-medium">
                <td className="px-3 py-1.5">Total expenses</td>
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-1.5 text-right tabular-nums"><Money cents={results[c.key]?.expenses.totalCents ?? 0} /></td>
                ))}
                {showPercent && <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{pct(columns[0].key, results[columns[0].key]?.expenses.totalCents ?? 0)}</td>}
              </tr>

              <tr className="font-semibold">
                <td className="px-3 py-2">Net income</td>
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2 text-right tabular-nums"><Money cents={results[c.key]?.netIncomeCents ?? 0} /></td>
                ))}
                {showPercent && <td className="px-3 py-2 text-right tabular-nums text-gray-500">{pct(columns[0].key, results[columns[0].key]?.netIncomeCents ?? 0)}</td>}
              </tr>

              {mode === 'ytdComparison' && columns.length === 2 && (
                <tr className="font-medium text-gray-600">
                  <td className="px-3 py-2">Change</td>
                  <td className="px-3 py-2 text-right tabular-nums" colSpan={2}>
                    {formatCents((results[columns[0].key]?.netIncomeCents ?? 0) - (results[columns[1].key]?.netIncomeCents ?? 0))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Columns follow the fiscal year selected above, not the calendar year — a September year-end reads October
        through September. Each column is the same income statement calculation run over that period.
      </p>
    </div>
  );
}
