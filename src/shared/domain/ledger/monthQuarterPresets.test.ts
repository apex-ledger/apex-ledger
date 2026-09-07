import { describe, expect, it } from 'vitest';
import { periodPresetRange, periodPresetRangeForDate } from './monthQuarterPresets';

describe('periodPresetRange', () => {
  it('returns the full calendar range for a named month', () => {
    expect(periodPresetRange('February', 2024)).toEqual({ from: '2024-02-01', to: '2024-02-29' }); // leap year
    expect(periodPresetRange('February', 2023)).toEqual({ from: '2023-02-01', to: '2023-02-28' });
    expect(periodPresetRange('December', 2025)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('returns the correct three-month span for each quarter', () => {
    expect(periodPresetRange('Q1', 2025)).toEqual({ from: '2025-01-01', to: '2025-03-31' });
    expect(periodPresetRange('Q2', 2025)).toEqual({ from: '2025-04-01', to: '2025-06-30' });
    expect(periodPresetRange('Q3', 2025)).toEqual({ from: '2025-07-01', to: '2025-09-30' });
    expect(periodPresetRange('Q4', 2025)).toEqual({ from: '2025-10-01', to: '2025-12-31' });
  });

  it('returns the full year for "Year"', () => {
    expect(periodPresetRange('Year', 2025)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('returns null for an unrecognized preset', () => {
    expect(periodPresetRange('Not a preset', 2025)).toBeNull();
  });
});

describe('periodPresetRangeForDate', () => {
  it('uses the year from the reference ISO date', () => {
    expect(periodPresetRangeForDate('Q1', '2026-08-07')).toEqual({ from: '2026-01-01', to: '2026-03-31' });
  });
});
