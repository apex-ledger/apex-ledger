import { useMemo, useState } from 'react';
import { DateInput } from '../../components/DateInput';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Section } from '@shared/domain/ledger/sectionHelpers';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { Money, formatCents } from '../../components/Money';
import { useUiStore } from '../../app/store/uiStore';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
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
        {section.lines.map((line) => {
          // The synthetic "Net Income to Date" line (see balanceSheet.ts) isn't a real account —
          // it's Revenue minus Expense, so there's no single account ledger to drill into here.
          const isRealAccount = line.account.id !== -1;
          return (
            <tr
              key={line.account.id}
              onClick={isRealAccount ? () => onDrillDown(line.account.id) : undefined}
              className={`border-b border-gray-100 last:border-0 ${isRealAccount ? 'cursor-pointer hover:bg-brand-50' : ''}`}
              title={isRealAccount ? 'See every posted transaction behind this balance — click through to correct one' : undefined}
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
          );
        })}
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

// A balance sheet's Asset/Liability/Equity balances are cumulative since inception, not just the
// current year — passed as General Ledger's dateFrom on drill-down so every transaction behind the
// clicked number is shown, not just this calendar year's (General Ledger's own default range).
const SINCE_INCEPTION = '2000-01-01';

export function BalanceSheetPage() {
  const setView = useUiStore((s) => s.setView);
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [compare, setCompare] = useState(false);
  const [comparativeDate, setComparativeDate] = useState('');
  const [showAdjusting, setShowAdjusting] = useState(false);

  const { data, loading, error } = useIpcQuery(
    () => window.api.reports.balanceSheet({ asOfDate, comparativeDate: compare ? comparativeDate || undefined : undefined }),
    [asOfDate, compare, comparativeDate],
  );

  const showComparative = compare && !!data?.comparativeDate;

  function drillDown(accountId: number) {
    setView({ kind: 'report', report: 'generalLedger', drillDown: { accountId, dateFrom: SINCE_INCEPTION, dateTo: asOfDate } });
  }

  const compositionData = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Assets', amountCents: data.assets.totalCents, fill: '#2f9d5c' },
      { name: 'Liabilities', amountCents: data.liabilities.totalCents, fill: '#e9c25c' },
      { name: 'Equity', amountCents: data.equity.totalCents, fill: '#875417' },
    ];
  }, [data]);

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">As of</label>
        <DateInput value={asOfDate} onChange={setAsOfDate} className="w-32" />
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
          Compare to
        </label>
        {compare && (
          <DateInput value={comparativeDate} onChange={setComparativeDate} className="w-32" />
        )}
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={showAdjusting} onChange={(e) => setShowAdjusting(e.target.checked)} />
          Show adjusting entries
        </label>
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {data && (
        <div className="space-y-3">
          <div className="rounded border border-gray-200 bg-white p-3">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Composition</h3>
            <div style={{ height: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={compositionData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v: number) => `$${Math.round(v / 100)}`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => formatCents(Number(value))} />
                  <Bar dataKey="amountCents" radius={[0, 3, 3, 0]}>
                    {compositionData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded border border-gray-200 bg-white">
            <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Assets</h3>
            <SectionTable section={data.assets} showComparative={showComparative} showAdjusting={showAdjusting} onDrillDown={drillDown} />
          </div>
          <div className="rounded border border-gray-200 bg-white">
            <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Liabilities</h3>
            <SectionTable section={data.liabilities} showComparative={showComparative} showAdjusting={showAdjusting} onDrillDown={drillDown} />
          </div>
          <div className="rounded border border-gray-200 bg-white">
            <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Equity</h3>
            <SectionTable section={data.equity} showComparative={showComparative} showAdjusting={showAdjusting} onDrillDown={drillDown} />
          </div>
          <div className="rounded border border-gray-200 bg-white p-3 text-right text-base font-semibold">
            Total Liabilities &amp; Equity: <Money cents={data.totalLiabilitiesAndEquityCents} />
          </div>
          <p className={`text-sm ${data.isBalanced ? 'text-green-600' : 'text-red-600'}`}>
            {data.isBalanced ? 'Assets = Liabilities + Equity.' : 'Balance sheet does not balance — investigate before filing.'}
          </p>
        </div>
      )}
    </div>
  );
}
