import { describe, expect, it } from 'vitest';
import { filterStaffSessions, formatDuration, sessionDurationMinutes, summariseStaffSessions, type StaffSession } from './staffSessions';

const session = (overrides: Partial<StaffSession>): StaffSession => ({
  id: 1, actorKey: 'company-user:1', actorName: 'Sam', actorEmail: null, role: 'bookkeeper', windowId: 1,
  signedInAt: '2026-03-02T09:00:00.000Z', signedOutAt: '2026-03-02T11:05:00.000Z', endReason: 'switched', ...overrides,
});

describe('session length', () => {
  it('is measured between sign-in and sign-out', () => {
    expect(sessionDurationMinutes(session({}))).toBe(125);
  });

  it('is measured to now while still open', () => {
    expect(sessionDurationMinutes(session({ signedOutAt: null }), new Date('2026-03-02T09:30:00.000Z'))).toBe(30);
  });

  it('is never negative and never NaN', () => {
    expect(sessionDurationMinutes(session({ signedOutAt: '2026-03-02T08:00:00.000Z' }))).toBe(0);
    expect(sessionDurationMinutes(session({ signedInAt: 'garbage' }))).toBe(0);
  });

  it('formats as hours and minutes', () => {
    expect(formatDuration(125)).toBe('2h 05m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(0)).toBe('0m');
  });
});

describe('filtering', () => {
  const sessions = [
    session({ id: 1, signedInAt: '2026-03-01T09:00:00.000Z' }),
    session({ id: 2, signedInAt: '2026-03-05T09:00:00.000Z', actorKey: 'company-user:2', actorName: 'Kim' }),
    session({ id: 3, signedInAt: '2026-03-09T09:00:00.000Z' }),
  ];

  it('keeps sessions that began inside the date range, inclusive', () => {
    expect(filterStaffSessions(sessions, { from: '2026-03-05', to: '2026-03-09' }).map((s) => s.id)).toEqual([2, 3]);
  });

  it('narrows to one person', () => {
    expect(filterStaffSessions(sessions, { actorKey: 'company-user:2' }).map((s) => s.id)).toEqual([2]);
  });

  it('applies no filter when nothing is given', () => {
    expect(filterStaffSessions(sessions, {})).toHaveLength(3);
  });
});

describe('per-person totals', () => {
  it('adds up sessions and minutes, flags who is signed in now, most recent first', () => {
    const now = new Date('2026-03-09T10:00:00.000Z');
    const totals = summariseStaffSessions([
      session({ id: 1, signedInAt: '2026-03-01T09:00:00.000Z', signedOutAt: '2026-03-01T10:00:00.000Z' }),
      session({ id: 2, signedInAt: '2026-03-05T09:00:00.000Z', signedOutAt: '2026-03-05T09:30:00.000Z', actorKey: 'company-user:2', actorName: 'Kim' }),
      session({ id: 3, signedInAt: '2026-03-09T09:00:00.000Z', signedOutAt: null, endReason: null }),
    ], now);
    expect(totals).toEqual([
      { actorKey: 'company-user:1', actorName: 'Sam', sessions: 2, minutes: 120, lastSignedInAt: '2026-03-09T09:00:00.000Z', openNow: true },
      { actorKey: 'company-user:2', actorName: 'Kim', sessions: 1, minutes: 30, lastSignedInAt: '2026-03-05T09:00:00.000Z', openNow: false },
    ]);
  });
});
