import { DateInput } from './DateInput';

/** One compact period control shared by reports that previously had no date filter. */
export function ReportDateRange({
  from,
  to,
  onFromChange,
  onToChange,
  fromLabel = 'From',
  toLabel = 'To',
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  fromLabel?: string;
  toLabel?: string;
}) {
  const invalid = Boolean(from && to && from > to);
  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-gray-600">{fromLabel}</span>
          <DateInput value={from} onChange={onFromChange} className="mt-1 w-32" />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">{toLabel}</span>
          <DateInput value={to} onChange={onToChange} className="mt-1 w-32" />
        </label>
      </div>
      {invalid && <p className="mt-1 text-xs text-red-600">From date must not be after To date.</p>}
    </div>
  );
}
