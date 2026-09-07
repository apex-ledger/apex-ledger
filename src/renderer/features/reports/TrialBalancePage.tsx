import { useState } from 'react';
import { AccountLink } from '../../components/DrillLinks';
import { DateInput } from '../../components/DateInput';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { Money } from '../../components/Money';
import { useUiStore } from '../../app/store/uiStore';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
}

// A trial balance is cumulative since the account's inception, not just the current year — passed
// as General Ledger's dateFrom on drill-down so every transaction behind the clicked number is
// shown, not just this calendar year's (which is General Ledger's own default range).
const SINCE_INCEPTION = '2000-01-01';

export function TrialBalancePage() {
  const setView = useUiStore((s) => s.setView);
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const { data, loading, error } = useIpcQuery(() => window.api.reports.trialBalance({ asOfDate }), [asOfDate]);

  function drillDown(accountId: number) {
    setView({ kind: 'report', report: 'generalLedger', drillDown: { accountId, dateFrom: SINCE_INCEPTION, dateTo: asOfDate } });
  }

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-2">
        <label className="text-sm text-gray-600">As of</label>
        <DateInput value={asOfDate} onChange={setAsOfDate} className="w-32" />
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {data && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Account</th>
                <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Debit</th>
                <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Credit</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr
                  key={row.account.id}
                  onClick={() => drillDown(row.account.id)}
                  className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-brand-50"
                  title="See every posted transaction behind this balance — click through to correct one"
                >
                  <td className="px-3 py-1.5"><AccountLink id={row.account.id} name={row.account.name} dateTo={asOfDate} /></td>
                  <td className="px-3 py-1.5 text-right">{row.debitCents > 0 && <Money cents={row.debitCents} />}</td>
                  <td className="px-3 py-1.5 text-right">{row.creditCents > 0 && <Money cents={row.creditCents} />}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className="px-3 py-2">
                  Total
                </td>
                <td className="px-3 py-2 text-right">
                  <Money cents={data.totalDebitCents} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Money cents={data.totalCreditCents} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {data && (
        <p className={`mt-2 text-sm ${data.isBalanced ? 'text-green-600' : 'text-red-600'}`}>
          {data.isBalanced ? 'Debits equal credits.' : 'Debits and credits do not match — investigate before filing.'}
        </p>
      )}
    </div>
  );
}
