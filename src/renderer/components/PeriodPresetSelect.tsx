import { MONTH_NAMES, periodPresetRangeForDate } from '@shared/domain/ledger/monthQuarterPresets';

/** A "Quick fill" dropdown for any Period From/To picker — pick a month or quarter instead of
 * typing exact dates by hand. Uses the year from referenceDateIso (typically whatever's already
 * in the From field). Shared by every report's period picker and Quick Entry's "Period covered"
 * fields, so date-range pickers behave identically everywhere in the app. */
export function PeriodPresetSelect({
  referenceDateIso,
  onSelect,
  className,
}: {
  referenceDateIso: string;
  onSelect: (range: { from: string; to: string }) => void;
  className?: string;
}) {
  return (
    <select
      className={className ?? 'rounded border border-gray-300 bg-white px-2 py-1.5 text-sm'}
      value=""
      onChange={(e) => {
        if (!e.target.value) return;
        const range = periodPresetRangeForDate(e.target.value, referenceDateIso);
        if (range) onSelect(range);
        e.target.value = '';
      }}
    >
      <option value="">Quick fill: month/quarter…</option>
      <optgroup label="Month">
        {MONTH_NAMES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </optgroup>
      <optgroup label="Quarter">
        <option value="Q1">Q1 (Jan – Mar)</option>
        <option value="Q2">Q2 (Apr – Jun)</option>
        <option value="Q3">Q3 (Jul – Sep)</option>
        <option value="Q4">Q4 (Oct – Dec)</option>
      </optgroup>
      <option value="Year">Full Year</option>
    </select>
  );
}
