import { describe, expect, it } from 'vitest';
import { buildHstFilingJournalLines, computeHstFilingFigures, hstFilingTimingError, latestCompletedCalendarQuarter, periodsOverlap } from './hstFiling';

const ACCOUNTS = { gstHstPayableAccountId: 10, gstHstRecoverableAccountId: 11, filedPayableAccountId: 12, refundReceivableAccountId: 13 };
const PERIOD = '2026-01-01 to 2026-03-31';

describe('computeHstFilingFigures', () => {
  it('computes net payable and refund', () => {
    expect(computeHstFilingFigures(130000, 45000).netPayableCents).toBe(85000);
    expect(computeHstFilingFigures(45000, 130000).netPayableCents).toBe(-85000);
  });
});

describe('buildHstFilingJournalLines', () => {
  it('reclassifies a net payable without touching cash', () => {
    const lines = buildHstFilingJournalLines(computeHstFilingFigures(130000, 45000), ACCOUNTS, PERIOD);
    expect(lines).toEqual([
      expect.objectContaining({ accountId: 10, debitCents: 130000, creditCents: 0 }),
      expect.objectContaining({ accountId: 11, debitCents: 0, creditCents: 45000 }),
      expect.objectContaining({ accountId: 12, debitCents: 0, creditCents: 85000 }),
    ]);
  });

  it('reclassifies a net refund to a receivable without touching cash', () => {
    const lines = buildHstFilingJournalLines(computeHstFilingFigures(45000, 130000), ACCOUNTS, PERIOD);
    expect(lines).toEqual([
      expect.objectContaining({ accountId: 10, debitCents: 45000, creditCents: 0 }),
      expect.objectContaining({ accountId: 11, debitCents: 0, creditCents: 130000 }),
      expect.objectContaining({ accountId: 13, debitCents: 85000, creditCents: 0 }),
    ]);
  });

  it('clears equal collected and ITCs with two lines', () => {
    expect(buildHstFilingJournalLines(computeHstFilingFigures(50000, 50000), ACCOUNTS, PERIOD)).toHaveLength(2);
  });

  it('rejects an empty filing', () => {
    expect(() => buildHstFilingJournalLines(computeHstFilingFigures(0, 0), ACCOUNTS, PERIOD)).toThrow('no GST/HST activity');
  });

  it('rejects negative source totals', () => {
    expect(() => buildHstFilingJournalLines({ collectedCents: -1, itcCents: 0, netPayableCents: -1 }, ACCOUNTS, PERIOD)).toThrow('non-negative');
  });
});

describe('periodsOverlap', () => {
  it('detects overlap including shared boundary dates', () => {
    expect(periodsOverlap('2026-01-01', '2026-03-31', '2026-03-31', '2026-06-30')).toBe(true);
    expect(periodsOverlap('2026-01-01', '2026-03-31', '2026-04-01', '2026-06-30')).toBe(false);
  });
});

describe('filing period timing', () => {
  it('defaults to the latest fully completed quarter, including across a year boundary', () => {
    expect(latestCompletedCalendarQuarter('2026-08-29')).toEqual({ start: '2026-04-01', end: '2026-06-30' });
    expect(latestCompletedCalendarQuarter('2026-01-15')).toEqual({ start: '2025-10-01', end: '2025-12-31' });
  });

  it('blocks incomplete periods and impossible filing dates', () => {
    expect(hstFilingTimingError('2026-09-30', '2026-08-29', '2026-08-29')).toMatch(/has not ended/i);
    expect(hstFilingTimingError('2026-06-30', '2026-06-29', '2026-08-29')).toMatch(/cannot be before/i);
    expect(hstFilingTimingError('2026-06-30', '2026-08-30', '2026-08-29')).toMatch(/future/i);
    expect(hstFilingTimingError('2026-06-30', '2026-08-29', '2026-08-29')).toBeNull();
  });
});
