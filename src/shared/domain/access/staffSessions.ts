/** Sign-in history: who was in the books, and for how long.
 *
 * A session starts when a person becomes the active user in a window and ends when they switch to
 * someone else, lock the screen, close the window, or the application closes. The reason the
 * session ended is kept, because "signed out at 17:02 — window closed" and "signed out at 17:02 —
 * switched to Sam" answer different questions when something needs explaining.
 *
 * Only an administrator may read this. It is about people, not about the accounts.
 */

export type StaffSessionEndReason = 'switched' | 'locked' | 'window_closed' | 'app_closed' | 'company_closed';

export interface StaffSession {
  id: number;
  actorKey: string;
  actorName: string;
  actorEmail: string | null;
  role: string;
  windowId: number;
  /** ISO timestamp, UTC. */
  signedInAt: string;
  /** Null while the session is still open. */
  signedOutAt: string | null;
  endReason: StaffSessionEndReason | null;
}

export const END_REASON_LABELS: Record<StaffSessionEndReason, string> = {
  switched: 'Switched user',
  locked: 'Locked the screen',
  window_closed: 'Closed the window',
  app_closed: 'Closed Apex Ledger',
  company_closed: 'Closed the company',
};

/** Minutes the session lasted, measured to `now` when it is still open. Never negative: a clock
 * that went backwards is reported as zero rather than as a lie. */
export function sessionDurationMinutes(session: Pick<StaffSession, 'signedInAt' | 'signedOutAt'>, now = new Date()): number {
  const start = Date.parse(session.signedInAt);
  const end = session.signedOutAt ? Date.parse(session.signedOutAt) : now.getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60_000));
}

/** "2h 05m", "45m", "0m". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${rest}m`;
}

export interface StaffSessionFilter {
  /** Inclusive ISO date (YYYY-MM-DD); sessions that began on or after it. */
  from?: string | null;
  /** Inclusive ISO date; sessions that began on or before it. */
  to?: string | null;
  actorKey?: string | null;
}

export function filterStaffSessions(sessions: StaffSession[], filter: StaffSessionFilter): StaffSession[] {
  return sessions.filter((session) => {
    const day = session.signedInAt.slice(0, 10);
    if (filter.from && day < filter.from) return false;
    if (filter.to && day > filter.to) return false;
    if (filter.actorKey && session.actorKey !== filter.actorKey) return false;
    return true;
  });
}

export interface StaffSessionTotal {
  actorKey: string;
  actorName: string;
  sessions: number;
  minutes: number;
  /** ISO timestamp of the most recent sign-in. */
  lastSignedInAt: string;
  openNow: boolean;
}

/** One line per person: how often and how long, most recent first. */
export function summariseStaffSessions(sessions: StaffSession[], now = new Date()): StaffSessionTotal[] {
  const byActor = new Map<string, StaffSessionTotal>();
  for (const session of sessions) {
    const total = byActor.get(session.actorKey) ?? { actorKey: session.actorKey, actorName: session.actorName, sessions: 0, minutes: 0, lastSignedInAt: session.signedInAt, openNow: false };
    total.sessions += 1;
    total.minutes += sessionDurationMinutes(session, now);
    if (session.signedInAt > total.lastSignedInAt) total.lastSignedInAt = session.signedInAt;
    if (session.signedOutAt === null) total.openNow = true;
    byActor.set(session.actorKey, total);
  }
  return [...byActor.values()].sort((a, b) => b.lastSignedInAt.localeCompare(a.lastSignedInAt));
}
