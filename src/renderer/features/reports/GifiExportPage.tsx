import { useState } from 'react';
import { DateInput } from '../../components/DateInput';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { Money } from '../../components/Money';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
}

export function GifiExportPage() {
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [periodStart, setPeriodStart] = useState(`${todayIso().slice(0, 4)}-01-01`);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const { data, loading, error } = useIpcQuery(() => window.api.reports.gifiExport({ periodStart, asOfDate }), [periodStart, asOfDate]);

  async function handleExportExcel() {
    setExportMessage(null);
    const result = await window.api.reports.gifiExportExcel({ periodStart, asOfDate });
    if (!result.ok) return setExportMessage(result.error);
    setExportMessage(result.data.saved ? `Saved to ${result.data.filePath}` : 'Export cancelled.');
  }

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-3">
        <button type="button" onClick={handleExportExcel} className="rounded-full bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-200">
          Export Excel
        </button>
        <label className="text-sm text-gray-600">Fiscal period</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <span className="text-sm text-gray-400">to</span>
        <DateInput value={asOfDate} onChange={setAsOfDate} className="w-32" />
      </div>

      {exportMessage && <p className="mb-3 text-sm text-gray-600">{exportMessage}</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      <p className="mb-3 text-xs text-gray-400">
        Use the Excel workbook as the GIFI review and transfer workpaper for your T2 tax software. Need the software itself?{' '}
        <a href="https://profile.intuit.ca/" target="_blank" rel="noreferrer" className="text-brand-600 underline">
          Download ProFile
        </a>
        .
      </p>

      {data && data.unmappedAccounts.length > 0 && (
        <div className="mb-3 rounded border border-amber-300 bg-amber-50 p-3">
          <h3 className="text-sm font-semibold text-amber-800">Unmapped Accounts (no GIFI code)</h3>
          <p className="mb-2 text-xs text-amber-700">These accounts have activity but no GIFI code assigned. Assign one on the Chart of Accounts page before filing.</p>
          <ul className="space-y-1 text-sm text-amber-800">
            {data.unmappedAccounts.map((a) => (
              <li key={a.id}>
                {a.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && data.statementTypeMismatches.length > 0 && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 p-3">
          <h3 className="text-sm font-semibold text-red-800">GIFI mapping issues</h3>
          <p className="mb-2 text-xs text-red-700">Fix these before using the export for a T2 return.</p>
          <ul className="space-y-1 text-sm text-red-800">
            {data.statementTypeMismatches.map((m) => (
              <li key={`${m.account.id}-${m.gifiCode}`}>{m.account.name} → {m.gifiCode}: {m.actual}</li>
            ))}
          </ul>
        </div>
      )}

      {data && (
        <div className={`mb-3 rounded border p-3 ${data.filingReady ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-semibold ${data.filingReady ? 'text-green-800' : 'text-amber-800'}`}>
              {data.filingReady ? 'CRA validity checks passed' : 'Not filing-ready yet'}
            </h3>
            <span className="text-xs text-gray-500">{data.periodStart} to {data.asOfDate}</span>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            {data.validityChecks.map((check) => (
              <div key={check.key} className="flex justify-between">
                <span>{check.label}</span>
                <span className={check.balanced ? 'text-green-700' : 'font-semibold text-red-700'}>
                  {check.balanced ? 'Balanced' : `Difference $${(check.differenceCents / 100).toFixed(2)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">GIFI Code</th>
                <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Description</th>
                <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Statement</th>
                <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.gifiCode} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-1.5 tabular-nums">{row.gifiCode}</td>
                  <td className="px-3 py-1.5">
                    {row.description}
                    {row.isComputedTotal ? (
                      <div className="text-xs font-medium text-brand-600">System-computed CRA total</div>
                    ) : (
                      <div className="text-xs text-gray-400">{row.accounts.map((a) => a.account.name).join(', ')}</div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500">{row.statementType}</td>
                  <td className="px-3 py-1.5 text-right">
                    <Money cents={row.amountCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
