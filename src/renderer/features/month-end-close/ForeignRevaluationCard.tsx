import { useEffect, useState } from 'react';
import type { ForeignCurrencyCode } from '@shared/domain/types';
import type { RevaluationPreview } from '../../../main/ipc/fx.handlers';
import { Money } from '../../components/Money';
import { JournalEntryLink } from '../../components/JournalEntryLink';

/** Period-end revaluation of foreign balances — the "home currency adjustment" a firm with US
 * clients expects at every month end. One closing rate per currency (Bank of Canada's for the
 * date is one click), a preview of what moves, one Post. The adjustment is dated the period end
 * and reversed the next day, so realized gains on later payments still measure against the rate
 * each document was booked at. */
export function ForeignRevaluationCard({ asOfDate }: { asOfDate: string }) {
  const [rates, setRates] = useState<Record<string, number | ''>>({});
  const [preview, setPreview] = useState<RevaluationPreview | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const numericRates = () => Object.fromEntries(Object.entries(rates).filter(([, v]) => typeof v === 'number' && v > 0)) as Record<ForeignCurrencyCode, number>;

  async function refresh(next = rates) {
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, v]) => typeof v === 'number' && v > 0)) as Record<ForeignCurrencyCode, number>;
    const result = await window.api.fx.revaluationPreview({ asOfDate, rates: cleaned });
    if (result.ok) setPreview(result.data);
    else setStatus(result.error);
  }

  useEffect(() => {
    setRates({});
    setStatus(null);
    void refresh({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOfDate]);

  if (!preview || preview.currencies.length === 0) return null;

  async function fetchRate(code: string) {
    setStatus(`Fetching Bank of Canada ${code}/CAD for ${asOfDate}…`);
    const result = await window.api.fxRates.getOnDate(code as ForeignCurrencyCode, asOfDate);
    if (!result.ok) return setStatus(result.error);
    const next = { ...rates, [code]: result.data.rate };
    setRates(next);
    setStatus(`Bank of Canada ${code}/CAD on ${result.data.date}: ${result.data.rate}`);
    await refresh(next);
  }

  async function post() {
    setBusy(true);
    setStatus(null);
    const result = await window.api.fx.revaluationPost({ asOfDate, rates: numericRates() });
    setBusy(false);
    if (!result.ok) return setStatus(result.error);
    setStatus(`Posted. Unrealized ${result.data.totalGainLossCents >= 0 ? 'gain' : 'loss'} of $${(Math.abs(result.data.totalGainLossCents) / 100).toFixed(2)} as at ${asOfDate}, reversed the next day.`);
    await refresh();
  }

  const ready = preview.missingRates.length === 0 && preview.lines.some((l) => l.gainLossCents !== 0) && !preview.alreadyPosted;

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
      <h2 className="font-semibold text-gray-900">Revalue foreign-currency balances</h2>
      <p className="mt-1 text-sm text-gray-600">Restates USD (and other) bank balances, receivables and payables at the closing rate for {asOfDate}. Posts one adjusting entry for the unrealized gain or loss and reverses it the next day.</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {preview.currencies.map((code) => (
          <label key={code} className="flex items-center gap-2 text-sm">
            <span className="w-12 font-semibold text-gray-700">{code}</span>
            <input
              type="number" step="0.0001" min="0.0001" aria-label={`Closing rate ${code}`}
              className="w-32 rounded border border-gray-300 px-2 py-1 tabular-nums"
              value={rates[code] ?? ''}
              onChange={(e) => {
                const next: Record<string, number | ''> = { ...rates, [code]: e.target.value ? Number(e.target.value) : '' };
                setRates(next);
                void refresh(next);
              }}
              placeholder="CAD per 1"
            />
            <button type="button" onClick={() => void fetchRate(code)} className="rounded-full border border-sky-300 bg-white px-3 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100">Bank of Canada rate</button>
          </label>
        ))}
      </div>
      {preview.lines.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500"><th className="py-1">Balance</th><th className="py-1 text-right">Foreign</th><th className="py-1 text-right">Booked CAD</th><th className="py-1 text-right">At closing rate</th><th className="py-1 text-right">Unrealized</th></tr></thead>
          <tbody>
            {preview.lines.map((line) => (
              <tr key={`${line.kind}-${line.accountId}-${line.currency}`} className="border-t border-sky-100">
                <td className="py-1">{line.label}</td>
                <td className="py-1 text-right tabular-nums">{line.currency} {(line.foreignCents / 100).toFixed(2)}</td>
                <td className="py-1 text-right"><Money cents={line.bookedCadCents} /></td>
                <td className="py-1 text-right"><Money cents={line.revaluedCadCents} /></td>
                <td className={`py-1 text-right font-semibold ${line.gainLossCents > 0 ? 'text-emerald-700' : line.gainLossCents < 0 ? 'text-rose-700' : 'text-gray-500'}`}>{line.gainLossCents >= 0 ? 'gain ' : 'loss '}<Money cents={Math.abs(line.gainLossCents)} /></td>
              </tr>
            ))}
            <tr className="border-t border-sky-200 font-semibold"><td className="py-1" colSpan={4}>Net unrealized {preview.totalGainLossCents >= 0 ? 'gain' : 'loss'}</td><td className="py-1 text-right"><Money cents={Math.abs(preview.totalGainLossCents)} /></td></tr>
          </tbody>
        </table>
      )}
      {preview.missingRates.length > 0 && <p className="mt-2 text-xs text-amber-800">Enter a closing rate for {preview.missingRates.join(', ')} to see the full picture.</p>}
      {preview.alreadyPosted && (
        <p className="mt-2 text-sm text-emerald-800">✓ Already posted for {asOfDate}: <JournalEntryLink id={preview.alreadyPosted.journalEntryId} label="adjustment" />{preview.alreadyPosted.reversalEntryId !== null && <> · <JournalEntryLink id={preview.alreadyPosted.reversalEntryId} label="reversal" /></>}</p>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" disabled={!ready || busy} onClick={() => void post()} className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-40">{busy ? 'Posting…' : 'Post revaluation'}</button>
        {status && <span className="text-xs text-gray-600">{status}</span>}
      </div>
    </div>
  );
}
