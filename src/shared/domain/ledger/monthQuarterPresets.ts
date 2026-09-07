export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Lets an accountant pick "March" or "Q1" instead of typing exact From/To dates by hand, for any
 * date-period picker in the app (Quick Entry's "Period covered", every report's Period range) —
 * one shared preset list and calculation so every "months/quarters dropdown" behaves identically.
 * Returns the ISO From/To pair for the given calendar year. */
export function periodPresetRange(preset: string, year: number): { from: string; to: string } | null {
  const lastDayOfMonth = (y: number, monthIndex: number) => new Date(y, monthIndex + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const monthIndex = MONTH_NAMES.indexOf(preset);
  if (monthIndex !== -1) {
    return { from: `${year}-${pad(monthIndex + 1)}-01`, to: `${year}-${pad(monthIndex + 1)}-${pad(lastDayOfMonth(year, monthIndex))}` };
  }
  const quarterStartMonth: Record<string, number> = { Q1: 0, Q2: 3, Q3: 6, Q4: 9 };
  if (preset in quarterStartMonth) {
    const startMonth = quarterStartMonth[preset];
    const endMonth = startMonth + 2;
    return { from: `${year}-${pad(startMonth + 1)}-01`, to: `${year}-${pad(endMonth + 1)}-${pad(lastDayOfMonth(year, endMonth))}` };
  }
  if (preset === 'Year') {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  return null;
}

/** Same as periodPresetRange but takes a reference ISO date (e.g. an existing "From" field or
 * today) and uses its year — the common case for a period-picker next to an existing date field. */
export function periodPresetRangeForDate(preset: string, referenceDateIso: string): { from: string; to: string } | null {
  const year = Number(referenceDateIso.slice(0, 4)) || new Date().getFullYear();
  return periodPresetRange(preset, year);
}
