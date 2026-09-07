import { describe, expect, it } from 'vitest';
import { currentFiscalYearDates, fiscalYearEndFromStart, fiscalYearEndParts } from './fiscalYearDates';

describe('fiscal year date pairing', () => {
  it('automatically ends a July 1 fiscal year on June 30 of the next year', () => {
    expect(fiscalYearEndFromStart('2026-07-01')).toBe('2027-06-30');
  });

  it('handles a calendar fiscal year', () => {
    expect(fiscalYearEndFromStart('2026-01-01')).toBe('2026-12-31');
  });

  it('reconstructs the fiscal period containing the reference date', () => {
    expect(currentFiscalYearDates(6, 30, '2026-08-25')).toEqual({ startDate: '2026-07-01', endDate: '2027-06-30' });
    expect(currentFiscalYearDates(6, 30, '2026-02-10')).toEqual({ startDate: '2025-07-01', endDate: '2026-06-30' });
  });

  it('extracts the recurring year-end and rejects an end before the start', () => {
    expect(fiscalYearEndParts('2026-07-01', '2027-06-30')).toEqual({ month: 6, day: 30 });
    expect(fiscalYearEndParts('2026-07-01', '2026-06-30')).toBeNull();
  });
});
