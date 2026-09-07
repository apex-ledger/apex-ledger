import { useState } from 'react';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { FIRST_TIER_KM } from '@shared/domain/tax/mileage';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** The mileage log and what it is worth.
 *
 * Trips are recorded here and claimed once for the year, not one entry per trip. The CRA rate steps
 * down after the first 5,000 km, so what a trip is worth depends on every trip before it — posting
 * each one as it is logged would be wrong for any trip that later turns out to sit past the step.
 */

function todayIso(): string {
  return localIsoDate();
}

export function MileagePage() {
  const [year, setYear] = useState(Number(todayIso().slice(0, 4)));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tripDate, setTripDate] = useState(todayIso());
  const [kilometres, setKilometres] = useState('');
  const [purpose, setPurpose] = useState('');
  const [vehicle, setVehicle] = useState('');

  const claim = useIpcQuery(() => window.api.mileage.claim({ year }), [year]);
  const claimed = new Set(claim.data?.alreadyClaimedTripIds ?? []);

  async function addTrip(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    const result = await window.api.mileage.create({
      tripDate,
      kilometres: Number(kilometres),
      purpose,
      vehicle: vehicle || null,
      startLocation: null,
      endLocation: null,
    });

    setBusy(false);
    if (!result.ok) return setError(result.error);
    setKilometres('');
    setPurpose('');
    claim.reload();
  }

  async function postClaim() {
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await window.api.mileage.postClaim({ year });
    setBusy(false);

    if (!result.ok) return setError(result.error);
    setNotice(
      `Claimed ${result.data.kilometres.toLocaleString('en-CA')} km across ${result.data.tripCount} trip${
        result.data.tripCount === 1 ? '' : 's'
      } at ${result.data.rateYear} rates — the journal entry is ready.`,
    );
    claim.reload();
  }

  async function reverseLatestClaim() {
    if (!window.confirm(`Reverse the latest ${year} mileage claim? Its GL entry will be voided and those trips will become editable/unclaimed again.`)) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await window.api.mileage.reverseLatestClaim({ year });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setNotice(`Reversed the journal entry; ${result.data.releasedTrips} trip${result.data.releasedTrips === 1 ? '' : 's'} released for correction.`);
    claim.reload();
  }

  const data = claim.data;
  const years = [year + 1, year, year - 1, year - 2];

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">Year</label>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {[...new Set(years)]
            .sort((a, b) => b - a)
            .map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
        </select>

        {data && data.unclaimedCount > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={postClaim}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Claim {data.unclaimedCount} unclaimed trip{data.unclaimedCount === 1 ? '' : 's'}
          </button>
        )}
        {claimed.size > 0 && (
          <button type="button" disabled={busy} onClick={reverseLatestClaim} className="rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50">
            Reverse Latest Claim
          </button>
        )}
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}

      {data?.rateFellBack && (
        <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          There is no published CRA rate for {year} yet, so {data.rate.year} rates are being used. Check the figure before filing.
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Figure label="Kilometres" value={(data?.totalKm ?? 0).toLocaleString('en-CA')} tone="bg-sky-50 text-sky-800" />
        <Figure label="Claim" money={data?.totalCents ?? 0} tone="bg-emerald-50 text-emerald-800" />
        <Figure
          label={`Rate (${data?.rate.year ?? '—'})`}
          value={
            data
              ? `${data.rate.firstTierCentsPerKm + (data.isTerritory ? data.rate.territorySupplementCentsPerKm : 0)}¢ / ${
                  data.rate.afterFirstTierCentsPerKm + (data.isTerritory ? data.rate.territorySupplementCentsPerKm : 0)
                }¢`
              : '—'
          }
          tone="bg-violet-50 text-violet-800"
        />
        {(data?.kmAtLowerRate ?? 0) > 0 && (
          <Figure
            label="Past 5,000 km"
            value={(data?.kmAtLowerRate ?? 0).toLocaleString('en-CA')}
            tone="bg-amber-50 text-amber-800"
          />
        )}
      </div>

      <form onSubmit={addTrip} className="flex flex-wrap items-end gap-2 rounded border border-gray-200 p-3">
        <label className="text-sm">
          <span className="block text-gray-600">Date</span>
          <input
            type="date" min={DATE_MIN} max={DATE_MAX}
            value={tripDate}
            onChange={(e) => setTripDate(clampIsoDate(e.target.value))}
            className="mt-1 rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">Kilometres</span>
          <input
            type="number"
            step="any"
            min="0"
            value={kilometres}
            onChange={(e) => setKilometres(e.target.value)}
            className="mt-1 w-28 rounded border border-gray-300 px-2 py-1 text-right"
          />
        </label>
        <label className="flex-1 text-sm">
          <span className="block text-gray-600">Purpose</span>
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Who you saw and why"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">Vehicle</span>
          <input
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-32 rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Add trip
        </button>
      </form>

      {claim.loading && <p className="text-sm text-gray-500">Loading…</p>}
      {data && data.trips.length === 0 && <p className="text-sm text-gray-500">No trips logged for {year} yet.</p>}

      {data && data.trips.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left font-medium">Date</th><EnteredTh className="px-3 py-2 text-left font-medium" />
                <th className="px-3 py-2 text-left font-medium">Purpose</th>
                <th className="px-3 py-2 text-left font-medium">Vehicle</th>
                <th className="px-3 py-2 text-right font-medium">Km</th>
                <th className="px-3 py-2 text-right font-medium">Running total</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-left font-medium">Claimed</th>
              </tr>
            </thead>
            <tbody>
              {data.trips.map((t) => (
                <tr key={t.id} className="border-b border-gray-100">
                  <td className="px-3 py-1.5 tabular-nums text-gray-600">{t.tripDate}</td><EnteredTd at={t.createdAt} className="px-3 py-1.5" />
                  <td className="px-3 py-1.5">{t.purpose}</td>
                  <td className="px-3 py-1.5 text-gray-500">{t.vehicle ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{t.kilometres.toLocaleString('en-CA')}</td>
                  <td
                    className={`px-3 py-1.5 text-right tabular-nums ${
                      t.cumulativeKm > FIRST_TIER_KM ? 'text-amber-700' : 'text-gray-500'
                    }`}
                    title={t.afterFirstTierKm > 0 ? `${t.afterFirstTierKm} km of this trip is past the 5,000 km step` : undefined}
                  >
                    {t.cumulativeKm.toLocaleString('en-CA')}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    <Money cents={t.amountCents} />
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {claimed.has(t.id) ? (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">On the books</span>
                    ) : (
                      <span className="text-gray-400">Not yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        The CRA rate drops after the first 5,000 km each calendar year and resets in January, so a trip is worth less late in a busy
        year. Claiming posts one entry for the year: Debit Motor Vehicle Expenses, Credit Due to Shareholder — the allowance is owed
        to whoever drove their own car. Each trip is stamped once claimed, so the same kilometres cannot be deducted twice.
      </p>
    </div>
  );
}

function Figure({ label, value, money, tone }: { label: string; value?: string; money?: number; tone: string }) {
  return (
    <div className={`min-w-[9rem] rounded px-3 py-2 ${tone}`}>
      <div className="text-xs uppercase tracking-wide opacity-75">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{money !== undefined ? <Money cents={money} /> : value}</div>
    </div>
  );
}
