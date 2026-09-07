import { useEffect, useMemo, useState } from 'react';
import { DateInput } from '../../components/DateInput';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { Money } from '../../components/Money';
import { PeriodPresetSelect } from '../../components/PeriodPresetSelect';
import { computeQuickMethodRemittance } from '@shared/domain/ledger/hstQuickMethod';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

export function HstQuickMethodPage() {
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [rate, setRate] = useState(8.5);

  const { data: hst, loading, error } = useIpcQuery(() => window.api.reports.hstSummary({ periodStart, periodEnd }), [periodStart, periodEnd]);

  useEffect(() => {
    window.api.company.get().then((r) => {
      if (r.ok && r.data.hstQuickMethodRate !== null) setRate(r.data.hstQuickMethodRate);
    });
  }, []);

  const result = useMemo(() => {
    if (!hst) return null;
    const collectedCents = hst.monthly.reduce((s, m) => s + m.collectedCents, 0);
    const taxableSalesBaseCents = hst.byAccount.filter((r) => r.direction === 'collected').reduce((s, r) => s + r.baseAmountCents, 0);
    return computeQuickMethodRemittance(taxableSalesBaseCents, collectedCents, rate);
  }, [hst, rate]);

  return (
    <div className="w-full">
      <div className="mb-3 rounded border border-gold-200 bg-gold-50 px-3 py-2 text-sm text-gold-800">
        Under the Quick Method, you charge customers the normal HST rate but remit a flat percentage of tax-included sales to CRA
        instead of tracking input tax credits — you keep the difference. The rate depends on your province and business category
        (plus a 1% credit on the first $30,000 of eligible sales in your first year, not modelled here). This is an estimate — confirm
        your exact rate and eligibility with CRA or your accountant before remitting.
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">Period</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <span className="text-sm text-gray-400">to</span>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
        <PeriodPresetSelect
          referenceDateIso={periodStart}
          onSelect={(range) => {
            setPeriodStart(range.from);
            setPeriodEnd(range.to);
          }}
        />
        <label className="ml-4 text-sm text-gray-600">Remittance Rate (%)</label>
        <input
          type="number"
          min={0}
          max={100}
          step={0.1}
          className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        />
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {result && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="text-xs uppercase tracking-wide text-gray-400">Tax-Included Sales</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">
              <Money cents={result.taxIncludedSalesCents} />
            </div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="text-xs uppercase tracking-wide text-gray-400">HST Actually Collected</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">
              <Money cents={result.hstCollectedCents} />
            </div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="text-xs uppercase tracking-wide text-gray-400">Remit to CRA ({rate}%)</div>
            <div className="mt-1 text-lg font-semibold text-brand-900">
              <Money cents={result.remittanceCents} />
            </div>
          </div>
          <div className="rounded border border-green-200 bg-green-50 p-3">
            <div className="text-xs uppercase tracking-wide text-green-700">You Keep</div>
            <div className="mt-1 text-lg font-semibold text-green-700">
              <Money cents={result.keptCents} />
            </div>
            <div className="mt-1 text-xs text-green-700">Instead of tracking input tax credits on every purchase.</div>
          </div>
        </div>
      )}
    </div>
  );
}
