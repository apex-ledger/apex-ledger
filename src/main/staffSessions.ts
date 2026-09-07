import type { StaffSession, StaffSessionEndReason } from '@shared/domain/access/staffSessions';
import { getCurrentDb, isCompanyOpen } from './companyFile';
import { getAccessIdentity, getAccessRole, getAccessSessionId } from './accessSession';
import type { AppDb } from './db/schema';

/** Records who is signed in, from when until when.
 *
 * Every write here is best-effort: a person's sign-in must never fail because the log could not
 * be written, and neither must closing the app. Failures are logged and swallowed, the same way
 * the activity log treats them.
 */

function nowIso(): string {
  return new Date().toISOString();
}

async function closeOpenRows(db: AppDb, windowId: number | null, reason: StaffSessionEndReason): Promise<void> {
  let query = db.updateTable('staffSessions').set({ signedOutAt: nowIso(), endReason: reason }).where('signedOutAt', 'is', null);
  if (windowId !== null) query = query.where('windowId', '=', windowId);
  await query.execute();
}

/** The current identity in the current window became the signed-in user. Any session still open
 * for this window is closed first, so a window only ever has one open session. */
export async function recordStaffSignIn(): Promise<void> {
  if (!isCompanyOpen()) return;
  try {
    const db = getCurrentDb();
    const identity = getAccessIdentity();
    await closeOpenRows(db, getAccessSessionId(), 'switched');
    await db.insertInto('staffSessions').values({
      actorKey: identity.key,
      actorName: identity.name,
      actorEmail: identity.email,
      role: getAccessRole(),
      windowId: getAccessSessionId(),
      signedInAt: nowIso(),
      signedOutAt: null,
      endReason: null,
    }).execute();
  } catch (error) {
    console.warn('[staff-sessions] sign-in not recorded:', error instanceof Error ? error.message : String(error));
  }
}

/** The current window's signed-in user stopped: they locked the screen or switched away. */
export async function recordStaffSignOut(reason: StaffSessionEndReason): Promise<void> {
  if (!isCompanyOpen()) return;
  try {
    await closeOpenRows(getCurrentDb(), getAccessSessionId(), reason);
  } catch (error) {
    console.warn('[staff-sessions] sign-out not recorded:', error instanceof Error ? error.message : String(error));
  }
}

/** A window closed — called from the window lifecycle, outside any IPC request, so the window id
 * is passed in rather than read from the request context. */
export async function recordWindowClosed(windowId: number): Promise<void> {
  if (!isCompanyOpen()) return;
  try {
    await closeOpenRows(getCurrentDb(), windowId, 'window_closed');
  } catch (error) {
    console.warn('[staff-sessions] window close not recorded:', error instanceof Error ? error.message : String(error));
  }
}

/** Everything still open in this company is closed — the company is being closed or the app is
 * quitting. Must run BEFORE the connection is closed. */
export async function recordAllSignedOut(reason: Extract<StaffSessionEndReason, 'app_closed' | 'company_closed'>): Promise<void> {
  if (!isCompanyOpen()) return;
  try {
    await closeOpenRows(getCurrentDb(), null, reason);
  } catch (error) {
    console.warn('[staff-sessions] sign-out on close not recorded:', error instanceof Error ? error.message : String(error));
  }
}

/** The history, newest first. Only an administrator may read it: it is about people, not about
 * the books, and a bookkeeper has no business knowing when the accountant was working. */
export async function listStaffSessions(): Promise<StaffSession[]> {
  if (getAccessRole() !== 'administrator') throw new Error('Only an administrator can view sign-in history.');
  const rows = await getCurrentDb().selectFrom('staffSessions').selectAll().orderBy('signedInAt', 'desc').orderBy('id', 'desc').limit(5_000).execute();
  return rows.map((row) => ({
    id: row.id,
    actorKey: row.actorKey,
    actorName: row.actorName,
    actorEmail: row.actorEmail,
    role: row.role,
    windowId: row.windowId,
    signedInAt: row.signedInAt,
    signedOutAt: row.signedOutAt,
    endReason: (row.endReason as StaffSessionEndReason | null) ?? null,
  }));
}
