function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Builds a 6x7 (42-cell) grid of ISO date strings for a calendar month view, starting on Sunday.
 * Cells outside the month (leading/trailing padding) are null. Always 42 cells so every month
 * renders the same fixed grid height regardless of how many weeks it actually spans.
 */
export function buildMonthGrid(year: number, month1to12: number): (string | null)[] {
  const firstOfMonth = new Date(year, month1to12 - 1, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month1to12, 0).getDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad2(month1to12)}-${pad2(d)}`);
  while (cells.length < 42) cells.push(null);
  return cells;
}
