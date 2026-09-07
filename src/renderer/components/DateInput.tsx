import { useEffect, useRef, useState } from 'react';
import { IconCalendar } from './icons';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';

interface DateInputProps {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
}

/** Turns "2026-3-5" or "3/5/2026" into a real ISO date — same forgiving-but-unambiguous parsing
 * spirit as CurrencyInput's typed-amount handling. Kept ISO-first (not locale MM/DD) since that's
 * what this app already prints everywhere and reading it back the same way avoids the MM/DD vs
 * DD/MM ambiguity that caused real bugs earlier in bank-statement date parsing. */
function normalizeTypedDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const mm = m.padStart(2, '0');
    const dd = d.padStart(2, '0');
    if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) return `${y}-${mm}-${dd}`;
    return null;
  }
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, mm, dd, y] = slashMatch;
    const month = mm.padStart(2, '0');
    const day = dd.padStart(2, '0');
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) return `${y}-${month}-${day}`;
    return null;
  }
  return null;
}

/** A directly-typable date field (type "2026-03-05" or "3/5/2026" and tab away) with a calendar
 * button alongside for anyone who'd rather click a date than type one — native <input
 * type="date" min={DATE_MIN} max={DATE_MAX}> forces every edit through its segmented picker UI, which is exactly the friction
 * this replaces; the calendar option stays available, just as a second way in rather than the
 * only one. */
export function DateInput({ value, onChange, className = '' }: DateInputProps) {
  const [text, setText] = useState(value);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        className="w-full rounded border border-gray-300 py-1.5 pl-2 pr-7 text-sm"
        placeholder="YYYY-MM-DD"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const normalized = normalizeTypedDate(text);
          if (normalized) {
            setText(normalized);
            if (normalized !== value) onChange(normalized);
          } else {
            setText(value);
          }
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        title="Pick a date"
        onClick={() => {
          const picker = pickerRef.current;
          if (!picker) return;
          if ('showPicker' in picker && typeof picker.showPicker === 'function') picker.showPicker();
          else picker.focus();
        }}
        className="absolute inset-y-0 right-1 flex items-center text-gray-400 hover:text-gray-600"
      >
        <IconCalendar className="h-4 w-4" />
      </button>
      {/* Visually hidden but still a real, focusable native date input — showPicker() opens its
          OS/browser calendar UI, and picking a date there flows back through the same onChange
          the typed path uses. */}
      <input
        ref={pickerRef}
        type="date" min={DATE_MIN} max={DATE_MAX}
        value={value}
        onChange={(e) => {
          if (!clampIsoDate(e.target.value)) return;
          setText(clampIsoDate(e.target.value));
          onChange(clampIsoDate(e.target.value));
        }}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
    </div>
  );
}
