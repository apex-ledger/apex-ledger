import { useState } from 'react';
import { CCA_CLASSES } from '@shared/domain/tax/capitalCostAllowance';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Capital cost allowance — the schedule 8 working paper, kept in the file rather than a spreadsheet.
 *
 * The reason it is stored at all is the roll-forward: this year's closing UCC is next year's
 * opening, and re-keying that by hand every year is where errors come from. */

function todayIso(): string {
  return localIsoDate();
}
function defaultYearEnd(): string {
  return `${todayIso().slice(0, 4)}-12-31`;
}

const BLANK = { classCode: '8', openingUccCents: 0, additionsCents: 0, dispositionsCents: 0 };

function parseMoney(text: string): number {
  return Math.round((Number(text.replace(/[^0-9.-]/g, '')) || 0) * 100);
}

export function CcaSchedulePage() {
  const [fiscalYearEnd, setFiscalYearEnd] = useState(defaultYearEnd());
  const [draft, setDraft] = useState(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error: loadError, reload } = useIpcQuery(
    () => window.api.cca.schedule({ fiscalYearEnd }),
    [fiscalYearEnd],
  );

  async function addPool() {
    setBusy(true);
    const result = await window.api.cca.save({
      fiscalYearEnd,
      classCode: draft.classCode,
      openingUccCents: draft.openingUccCents,
      additionsCents: draft.additionsCents,
      dispositionsCents: draft.dispositionsCents,
      availableForUseYear: Number(fiscalYearEnd.slice(0, 4)),
      rateOverride: null,
      claimCents: null,
      note: null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setError(null);
    setDraft(BLANK);
    reload();
  }

  async function patchPool(poolId: number, patch: Record<string, unknown>) {
    const existing = await window.api.cca.pools({ fiscalYearEnd });
    if (!existing.ok) return setError(existing.error);
    const row = existing.data.find((p) => p.id === poolId);
    if (!row) return;
    const result = await window.api.cca.save({ ...row, ...patch });
    if (!result.ok) return setError(result.error);
    setError(null);
    reload();
  }

  async function removePool(poolId: number) {
    if (!window.confirm('Delete this CCA class pool from the schedule? This cannot be undone.')) return;
    const result = await window.api.cca.delete(poolId);
    if (!result.ok) return setError(result.error);
    reload();
  }

  async function rollForward() {
    const nextYear = `${Number(fiscalYearEnd.slice(0, 4)) + 1}${fiscalYearEnd.slice(4)}`;
    setBusy(true);
    const result = await window.api.cca.rollForward({ fromFiscalYearEnd: fiscalYearEnd, toFiscalYearEnd: nextYear });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setError(null);
    setFiscalYearEnd(nextYear);
  }

  const cell =
    'w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-right text-sm tabular-nums hover:border-gray-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500';

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">Fiscal year end</label>
        <DateInput value={fiscalYearEnd} onChange={setFiscalYearEnd} className="w-32" />
        {data && data.rows.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void rollForward()}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            title="Create next year's pools from this year's closing balances"
          >
            Roll forward to next year →
          </button>
        )}
      </div>

      {(error || loadError) && (
        <div className="flex items-start justify-between gap-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error ?? loadError}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 text-red-500 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="px-3 py-2">Class</th>
              <th className="px-3 py-2">Rate</th>
              <th className="px-3 py-2 text-right">Opening UCC</th>
              <th className="px-3 py-2 text-right">Additions</th>
              <th className="px-3 py-2 text-right">Dispositions</th>
              <th className="px-3 py-2 text-right" title="The first-year restriction on net additions">
                1st-yr adj.
              </th>
              <th className="px-3 py-2 text-right">Base</th>
              <th className="px-3 py-2 text-right">Max CCA</th>
              <th className="px-3 py-2 text-right">Claimed</th>
              <th className="px-3 py-2 text-right">Closing UCC</th>
              <th className="w-16 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-200 bg-brand-50/40">
              <td className="px-3 py-1.5">
                <select
                  className="w-full rounded border border-gray-300 px-1.5 py-0.5 text-sm"
                  value={draft.classCode}
                  onChange={(e) => setDraft({ ...draft, classCode: e.target.value })}
                >
                  {CCA_CLASSES.map((c) => (
                    <option key={c.code} value={c.code} title={c.description}>
                      {c.code} — {c.description.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-1.5 text-xs text-gray-500">
                {((CCA_CLASSES.find((c) => c.code === draft.classCode)?.rate ?? 0) * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-1.5">
                <input className={cell} defaultValue="0.00" onBlur={(e) => setDraft({ ...draft, openingUccCents: parseMoney(e.target.value) })} />
              </td>
              <td className="px-3 py-1.5">
                <input className={cell} defaultValue="0.00" onBlur={(e) => setDraft({ ...draft, additionsCents: parseMoney(e.target.value) })} />
              </td>
              <td className="px-3 py-1.5">
                <input className={cell} defaultValue="0.00" onBlur={(e) => setDraft({ ...draft, dispositionsCents: parseMoney(e.target.value) })} />
              </td>
              <td colSpan={5} />
              <td className="px-3 py-1.5 text-right">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void addPool()}
                  className="rounded bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Add
                </button>
              </td>
            </tr>

            {loading && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}

            {!loading && data && data.rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-5 text-center text-sm text-gray-400">
                  No CCA pools for this year yet. Add a class above with its opening undepreciated capital cost, or roll forward
                  from the previous year.
                </td>
              </tr>
            )}

            {(data?.rows ?? []).map((r) => (
              <tr key={r.code} className={`border-b border-gray-100 last:border-0 ${r.recaptureCents > 0 ? 'bg-rose-50/50' : ''}`}>
                <td className="px-3 py-1.5">
                  <div className="font-medium">Class {r.code}</div>
                  <div className="text-xs text-gray-400">{r.description}</div>
                </td>
                <td className="px-3 py-1.5 text-gray-500">{(r.rate * 100).toFixed(0)}%</td>
                <td className="px-3 py-1.5">
                  <input
                    className={cell}
                    defaultValue={(r.openingUccCents / 100).toFixed(2)}
                    onBlur={(e) => r.poolId && void patchPool(r.poolId, { openingUccCents: parseMoney(e.target.value) })}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    className={cell}
                    defaultValue={(r.additionsCents / 100).toFixed(2)}
                    onBlur={(e) => r.poolId && void patchPool(r.poolId, { additionsCents: parseMoney(e.target.value) })}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    className={cell}
                    defaultValue={(r.dispositionsCents / 100).toFixed(2)}
                    onBlur={(e) => r.poolId && void patchPool(r.poolId, { dispositionsCents: parseMoney(e.target.value) })}
                  />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                  {r.firstYearAdjustmentCents ? <Money cents={r.firstYearAdjustmentCents} /> : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                  <Money cents={r.baseForCcaCents} />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                  <Money cents={r.maximumCcaCents} />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    className={`${cell} font-medium`}
                    defaultValue={(r.claimedCcaCents / 100).toFixed(2)}
                    title="Claim less than the maximum to preserve the pool in a loss year"
                    onBlur={(e) => r.poolId && void patchPool(r.poolId, { claimCents: parseMoney(e.target.value) })}
                  />
                </td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                  <Money cents={r.closingUccCents} />
                  {r.recaptureCents > 0 && (
                    <div className="text-xs text-rose-700" title="Sold for more than remained in the pool — this is taxable income">
                      recapture <Money cents={r.recaptureCents} />
                    </div>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => r.poolId && void removePool(r.poolId)}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {data && data.rows.length > 0 && (
              <tr className="border-t border-gray-300 bg-gray-50 font-semibold">
                <td className="px-3 py-2" colSpan={2}>
                  Total
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money cents={data.totalOpeningUccCents} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money cents={data.totalAdditionsCents} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money cents={data.totalDispositionsCents} />
                </td>
                <td colSpan={3} />
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money cents={data.totalClaimedCents} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money cents={data.totalClosingUccCents} />
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.totalRecaptureCents > 0 && (
        <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <Money cents={data.totalRecaptureCents} /> of recapture: a class was sold for more than remained in its pool. That excess
          is taxable income this year, not a negative asset.
        </div>
      )}

      <p className="text-xs text-gray-400">
        CCA runs on a pool per class, not per asset. Additions in their first year are restricted — the accelerated investment
        incentive is phasing out, so property available for use in 2024–2027 gets twice the ordinary first-year deduction, and from
        2028 the half-year rule returns. Claim less than the maximum in a loss year to keep the pool for later. Total CCA claimed
        this year: <Money cents={data?.totalClaimedCents ?? 0} />.
      </p>
    </div>
  );
}
