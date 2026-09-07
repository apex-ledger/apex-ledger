import { describe, expect, it } from 'vitest';
import { localIsoDate } from './localDate';

describe('localIsoDate', () => {
  it('uses the local calendar date, not the UTC one', () => {
    // 11:30 p.m. local on Sept 3 — whatever the zone, the local date must read Sept 3.
    const evening = new Date(2026, 8, 3, 23, 30, 0);
    expect(localIsoDate(evening)).toBe('2026-09-03');
    expect(localIsoDate(new Date(2026, 0, 1, 0, 5, 0))).toBe('2026-01-01');
  });
});
