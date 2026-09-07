import { useState } from 'react';
import type { CashFlowSection } from '@shared/domain/ledger/cashFlowStatement';
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

function Section({ section, onDrillDown }: { section: CashFlowSection; onDrillDown: (accountId: number) => void }) {
  return (
    <div className="mb-5">
      <h3 className="mb-1 text-sm font-semibold text-gray-900">{section.label}</h3>
      {section.lines.length === 0 ? (
        <p className="px-3 py-1.5 text-sm text-gray-400">Nothing in this period.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <tbody>
            {section.lines.map((line, i) => (
              <tr
                key={`${line.accountId ?? 'derived'}-${i}`}
                onClick={line.accountId !== null ? () => onDrillDown(line.accountId!) : undefined}
                className={`border-b border-gray-100 last:border-0 ${line.accountId !== null ? 'cursor-pointer hover:bg-brand-50' : ''}`}
                title={line.accountId !== null ? 'See every posted transaction behind this movement' : undefined}
              >
                <td className={`px-3 py-1.5 ${line.accountId === null ? 'text-gray-600' : ''}`}>{line.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  <Money cents={line.amountCents} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-300 font-semibold">
              <td className="px-3 py-1.5">Net cash from {section.label.toLowerCase()}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                <Money cents={section.totalCents} />
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

const SINCE_INCEPTION = '2000-01-01';

export function CashFlowStatementPage() {
  const setView = useUiStore((s) => s.setView);
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());

  const { data, loading, error } = useIpcQuery(
    () => window.api.reports.cashFlow({ periodStart, periodEnd }),
    [periodStart, periodEnd],
  );

  function drillDown(accountId: number) {
    setView({ kind: 'report', report: 'generalLedger', drillDown: { accountId, dateFrom: periodStart, dateTo: periodEnd } });
  }

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

      {data?.hasNoCashAccounts && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No account in the chart of accounts is marked as "Cash and Bank", so there is no cash balance for this statement to explain.
          Set the subtype on your bank and cash accounts in the Chart of Accounts and this report will fill in.
        </div>
      )}

      {data && !data.hasNoCashAccounts && (
        <>
          <Section section={data.operating} onDrillDown={drillDown} />
          <Section section={data.investing} onDrillDown={drillDown} />
          <Section section={data.financing} onDrillDown={drillDown} />

          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="border-t-2 border-gray-400 font-semibold">
                <td className="px-3 py-2">Net change in cash</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money cents={data.netChangeCents} />
                </td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-3 py-1.5 text-gray-600">Cash at start of period</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  <Money cents={data.openingCashCents} />
                </td>
              </tr>
              <tr className="border-t border-gray-300 font-semibold">
                <td className="px-3 py-2">Cash at end of period</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money cents={data.closingCashCents} />
                </td>
              </tr>
            </tbody>
          </table>

          {/* The sections are built so this can't drift, but a visible tick is worth more than the
              claim — and if it ever did break, silence would be the worst outcome. */}
          {data.isReconciled ? (
            <p className="mt-3 rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              ✓ Ties to the bank: the movements above total exactly the change in your cash and bank accounts over this period.
            </p>
          ) : (
            <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
              This statement totals <Money cents={data.netChangeCents} /> but the cash and bank accounts moved by{' '}
              <Money cents={data.actualCashChangeCents} />. That should be impossible — please report it.
            </p>
          )}

          <p className="mt-3 text-xs text-gray-400">
            Indirect method: starts from net income and adjusts for everything that changed on the balance sheet, rather than tracing
            individual receipts and payments. Depreciation and amortization are identified by account name and added back. Click any
            line to see the transactions behind it.
          </p>
        </>
      )}
    </div>
  );
}
