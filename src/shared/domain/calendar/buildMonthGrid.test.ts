import { describe, expect, it } from 'vitest';
import { buildMonthGrid } from './buildMonthGrid';

describe('buildMonthGrid', () => {
  it('always returns 42 cells', () => {
    expect(buildMonthGrid(2026, 1)).toHaveLength(42);
    expect(buildMonthGrid(2026, 2)).toHaveLength(42);
  });

  it('pads leading cells up to the month start weekday', () => {
    // January 2026 starts on a Thursday (weekday 4) -> 4 leading nulls.
    const grid = buildMonthGrid(2026, 1);
    expect(grid.slice(0, 4)).toEqual([null, null, null, null]);
    expect(grid[4]).toBe('2026-01-01');
  });

  it('includes every day of the month in order with no gaps', () => {
    const grid = buildMonthGrid(2026, 4); // April has 30 days
    const dates = grid.filter((d): d is string => d !== null);
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe('2026-04-01');
    expect(dates[29]).toBe('2026-04-30');
  });

  it('handles a leap-year February correctly', () => {
    const grid = buildMonthGrid(2028, 2); // 2028 is a leap year
    const dates = grid.filter((d): d is string => d !== null);
    expect(dates).toHaveLength(29);
    expect(dates[28]).toBe('2028-02-29');
  });

  it('handles a non-leap-year February correctly', () => {
    const grid = buildMonthGrid(2026, 2);
    const dates = grid.filter((d): d is string => d !== null);
    expect(dates).toHaveLength(28);
    expect(dates[27]).toBe('2026-02-28');
  });

  it('trailing cells beyond the month are null', () => {
    const grid = buildMonthGrid(2026, 2); // Feb 2026: starts Sunday, 28 days -> exactly 4 weeks (28 cells), rest padding
    expect(grid.slice(28)).toEqual(new Array(14).fill(null));
  });
});
