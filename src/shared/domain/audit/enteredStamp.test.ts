import { describe, expect, it } from 'vitest';
import { formatEnteredAt, parseStoredTimestamp } from './enteredStamp';

describe('entered stamp', () => {
  it('reads SQLite UTC timestamps and shows them in the reader’s zone', () => {
    expect(formatEnteredAt('2026-09-04 01:18:05', 'America/Toronto')).toBe('2026-09-03 9:18 p.m.');
    expect(formatEnteredAt('2026-09-04 01:18:05', 'UTC')).toBe('2026-09-04 1:18 a.m.');
    expect(formatEnteredAt('2026-03-10T14:05:00.000Z', 'America/Vancouver')).toBe('2026-03-10 7:05 a.m.');
  });

  it('is blank when nothing is stored or the value is not a timestamp', () => {
    expect(formatEnteredAt(null)).toBe('');
    expect(formatEnteredAt('not a date')).toBe('');
    expect(parseStoredTimestamp('')).toBeNull();
  });
});
