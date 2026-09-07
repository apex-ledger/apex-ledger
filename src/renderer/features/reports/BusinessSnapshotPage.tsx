import { useState } from 'react';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';
import type { ReportKind } from '../../app/store/uiStore';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** One page answering "how is the business doing" — the figures a client asks for on the phone.
 *
 * Deliberately no new arithmetic: every number here is read from a report that already exists, so
 * the snapshot cannot quietly disagree with the statements it summarises. Each tile is a link into
 * the report it came from, because the next question is always "where does that come from".
 */

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}
/** Same span, one year earlier, for the comparison column. */
function shiftYear(iso: string, years: number): string {
  return `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;
}

function Tile({
  label,
  cents,
  hint,
  tone = 'plain',
  onClick,
}: {
  label: string;
  cents: number;
  hint?: string;
  tone?: 'plain' | 'good' | 'bad';
  onClick?: () => void;
}) {
  const toneClass = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-700' : 'text-gray-900';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`rounded border border-gray-200 bg-white px-3 py-2 text-left ${onClick ? 'hover:border-brand-300 hover:bg-brand-50' : ''}`}
    >
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${toneClass}`}>
        <Money cents={cents} />
      </div>
      {hint && <div className="mt-0.5 text-xs text-gray-400">{hint}</div>}
    </button>
  );
}

export function BusinessSnapshotPage() {
  const setView = useUiStore((s) => s.setView);
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());

  const income = useIpcQuery(
    () =>
      window.api.reports.incomeStatement({
        periodStart,
        periodEnd,
        comparativeStart: shiftYear(periodStart, -1),
        comparativeEnd: shiftYear(periodEnd, -1),
      }),
    [periodStart, periodEnd],
  );
  const balance = useIpcQuery(() => window.api.reports.balanceSheet({ asOfDate: periodEnd }), [periodEnd]);
  const cash = useIpcQuery(() => window.api.reports.cashFlow({ periodStart, periodEnd }), [periodStart, periodEnd]);

  const go = (report: ReportKind) => () => setView({ kind: 'report', report });

  const revenue = income.data?.revenue.totalCents ?? 0;
  const expenses = income.data?.expenses.totalCents ?? 0;
  const net = income.data?.netIncomeCents ?? 0;
  const lastYearNet = income.data?.comparativeNetIncomeCents;
  const margin = revenue !== 0 ? (net / revenue) * 100 : null;

  const loading = income.loading || balance.loading || cash.loading;
  const error = income.error ?? balance.error ?? cash.error;

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

      {income.data && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">This period</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Revenue" cents={revenue} onClick={go('incomeStatement')} />
            <Tile label="Expenses" cents={expenses} onClick={go('profitAndLossDetail')} hint="see what's in it" />
            <Tile
              label={net < 0 ? 'Net loss' : 'Net income'}
              cents={net}
              tone={net < 0 ? 'bad' : 'good'}
              hint={margin === null ? undefined : `${margin.toFixed(1)}% of revenue`}
              onClick={go('incomeStatement')}
            />
            {lastYearNet !== undefined && (
              <Tile
                label="Same period last year"
                cents={lastYearNet}
                tone={lastYearNet < 0 ? 'bad' : 'plain'}
                hint={
                  lastYearNet === 0
                    ? 'no comparison'
                    : `${net >= lastYearNet ? 'up' : 'down'} ${Math.abs(((net - lastYearNet) / Math.abs(lastYearNet)) * 100).toFixed(0)}%`
                }
                onClick={go('periodStatements')}
              />
            )}
          </div>
        </section>
      )}

      {balance.data && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Position at {periodEnd}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Assets" cents={balance.data.assets.totalCents} onClick={go('balanceSheet')} />
            <Tile label="Liabilities" cents={balance.data.liabilities.totalCents} onClick={go('balanceSheet')} />
            <Tile label="Equity" cents={balance.data.equity.totalCents} onClick={go('changesInEquity')} />
            {cash.data && !cash.data.hasNoCashAccounts && (
              <Tile
                label="Cash on hand"
                cents={cash.data.closingCashCents}
                hint={`${cash.data.netChangeCents >= 0 ? 'up' : 'down'} this period`}
                tone={cash.data.closingCashCents < 0 ? 'bad' : 'plain'}
                onClick={go('cashFlow')}
              />
            )}
          </div>
        </section>
      )}

      {cash.data && !cash.data.hasNoCashAccounts && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Where the cash moved</h2>
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Operating" cents={cash.data.operating.totalCents} tone={cash.data.operating.totalCents < 0 ? 'bad' : 'good'} onClick={go('cashFlow')} />
            <Tile label="Investing" cents={cash.data.investing.totalCents} onClick={go('cashFlow')} />
            <Tile label="Financing" cents={cash.data.financing.totalCents} onClick={go('cashFlow')} />
          </div>
          {cash.data.operating.totalCents < 0 && net > 0 && (
            <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Profitable on paper, but operating activities used cash this period — usually money tied up in receivables or
              inventory, or vendors being paid faster than customers pay you.
            </p>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Who owes what</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={go('agingReceivable')}
            className="rounded border border-gray-200 bg-white px-3 py-2 text-left hover:border-brand-300 hover:bg-brand-50"
          >
            <div className="text-xs uppercase tracking-wide text-gray-500">Owed to you</div>
            <div className="mt-1 text-sm text-brand-700">Open the receivables ageing →</div>
          </button>
          <button
            type="button"
            onClick={go('agingPayable')}
            className="rounded border border-gray-200 bg-white px-3 py-2 text-left hover:border-brand-300 hover:bg-brand-50"
          >
            <div className="text-xs uppercase tracking-wide text-gray-500">You owe</div>
            <div className="mt-1 text-sm text-brand-700">Open the payables ageing →</div>
          </button>
        </div>
      </section>

      <p className="text-xs text-gray-400">
        Every figure here is read from the report behind it rather than recalculated, so this cannot disagree with your statements.
        Click any tile to open the report it came from. The comparison is the same span one year earlier.
      </p>
    </div>
  );
}
