import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { AccessPermission, AccessRole, AccessSessionUser, CompanyUser } from '@shared/domain/access';
import { ALL_ACCESS_PERMISSIONS, ROLE_PERMISSIONS } from '@shared/domain/access';
import { getCurrentDb } from '../companyFile';
import { setAccessIdentity, setAccessRole } from '../accessSession';
import { getLicenseStatus } from '../licensing/license';
import { billedSeats } from '@shared/domain/licensing/seatPlans';
import { listStaffSessions, recordStaffSignIn } from '../staffSessions';

const roleSchema = z.enum(['administrator', 'accountant', 'bookkeeper', 'payroll', 'accountsReceivable', 'accountsPayable', 'readOnly', 'custom']);
const permissionSchema = z.enum(['company', 'users', 'sales', 'purchases', 'banking', 'accounting', 'payroll', 'tax', 'inventory']);
const inviteSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  role: roleSchema,
  permissions: z.array(permissionSchema).optional(),
});

function safePermissions(raw: string, role: AccessRole): AccessPermission[] {
  try {
    const parsed = z.array(permissionSchema).parse(JSON.parse(raw));
    return parsed;
  } catch {
    return ROLE_PERMISSIONS[role] ?? [];
  }
}

function mapUser(row: {
  id: number; firstName: string; lastName: string; email: string; role: string; permissionsJson: string;
  status: string; invitationToken: string | null; invitedAt: string; acceptedAt: string | null; createdAt: string;
}): CompanyUser {
  const role = roleSchema.parse(row.role);
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    role,
    permissions: safePermissions(row.permissionsJson, role),
    status: z.enum(['pending', 'active', 'suspended']).parse(row.status),
    invitedAt: row.invitedAt,
    acceptedAt: row.acceptedAt,
    createdAt: row.createdAt,
  };
}

function permissionsFor(role: AccessRole, requested?: AccessPermission[]): AccessPermission[] {
  if (role !== 'custom') return ROLE_PERMISSIONS[role];
  const unique = [...new Set(requested ?? [])].filter((permission) => ALL_ACCESS_PERMISSIONS.includes(permission));
  if (unique.length === 0) throw new Error('Choose at least one permission for a custom role.');
  return unique;
}

function inviteUrl(token: string): string {
  return `apex-ledger://invite/${token}`;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function accessUsersList(): Promise<CompanyUser[]> {
  const rows = await getCurrentDb().selectFrom('companyUsers').selectAll().orderBy('firstName').orderBy('lastName').execute();
  return rows.map(mapUser);
}

/** A seat is what is being paid for, so the limit is enforced here rather than only in the screen
 * that draws the button. A licence with no seat count predates seat billing and is unlimited. */
async function assertSeatAvailable(db: ReturnType<typeof getCurrentDb>): Promise<void> {
  const licensedSeatCount = getLicenseStatus().seats;
  if (typeof licensedSeatCount !== 'number') return;
  const rows = await db.selectFrom('companyUsers').select(['status']).execute();
  const used = billedSeats(rows.map((row) => ({ status: z.enum(['pending', 'active', 'suspended']).parse(row.status) })));
  if (used >= licensedSeatCount) {
    throw new Error(`This licence covers ${licensedSeatCount} seat${licensedSeatCount === 1 ? '' : 's'} and all of them are in use. Suspend a user or add seats to the subscription before inviting another.`);
  }
}

export async function accessUsersInvite(input: unknown): Promise<{ user: CompanyUser; inviteUrl: string }> {
  const payload = inviteSchema.parse(input);
  const db = getCurrentDb();
  const existing = await db.selectFrom('companyUsers').select(['id', 'status']).where('email', '=', payload.email.toLowerCase()).executeTakeFirst();
  if (existing) throw new Error(`A ${existing.status} user already exists with this email address.`);
  await assertSeatAvailable(db);
  const token = randomBytes(32).toString('hex');
  const permissions = permissionsFor(payload.role, payload.permissions);
  const row = await db.insertInto('companyUsers').values({
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email.toLowerCase(),
    role: payload.role,
    permissionsJson: JSON.stringify(permissions),
    status: 'pending',
    invitationToken: tokenHash(token),
    acceptedAt: null,
  }).returningAll().executeTakeFirstOrThrow();
  return { user: mapUser(row), inviteUrl: inviteUrl(token) };
}

export async function accessUsersUpdateRole(input: unknown): Promise<CompanyUser> {
  const payload = z.object({ id: z.number().int().positive(), role: roleSchema, permissions: z.array(permissionSchema).optional() }).parse(input);
  const permissions = permissionsFor(payload.role, payload.permissions);
  const row = await getCurrentDb().updateTable('companyUsers').set({ role: payload.role, permissionsJson: JSON.stringify(permissions) }).where('id', '=', payload.id).returningAll().executeTakeFirst();
  if (!row) throw new Error('User not found.');
  return mapUser(row);
}

export async function accessUsersSetStatus(input: unknown): Promise<CompanyUser> {
  const payload = z.object({ id: z.number().int().positive(), status: z.enum(['active', 'suspended']) }).parse(input);
  // Restoring someone consumes a seat just as inviting them does, so it goes through the same gate.
  if (payload.status === 'active') await assertSeatAvailable(getCurrentDb());
  const row = await getCurrentDb().updateTable('companyUsers').set({ status: payload.status }).where('id', '=', payload.id).returningAll().executeTakeFirst();
  if (!row) throw new Error('User not found.');
  return mapUser(row);
}

export async function accessUsersResendInvite(idInput: unknown): Promise<{ user: CompanyUser; inviteUrl: string }> {
  const id = z.number().int().positive().parse(idInput);
  const token = randomBytes(32).toString('hex');
  const row = await getCurrentDb().updateTable('companyUsers').set({ invitationToken: tokenHash(token), invitedAt: new Date().toISOString(), status: 'pending' }).where('id', '=', id).returningAll().executeTakeFirst();
  if (!row) throw new Error('User not found.');
  return { user: mapUser(row), inviteUrl: inviteUrl(token) };
}

export async function accessUsersCancelInvite(idInput: unknown): Promise<{ id: number }> {
  const id = z.number().int().positive().parse(idInput);
  const row = await getCurrentDb().selectFrom('companyUsers').select(['id', 'status']).where('id', '=', id).executeTakeFirst();
  if (!row) throw new Error('User not found.');
  if (row.status !== 'pending') throw new Error('Only a pending invitation can be cancelled. Suspend an active user instead.');
  await getCurrentDb().deleteFrom('companyUsers').where('id', '=', id).execute();
  return { id };
}

/** The workstation's own administrator, always offered so that switching to a named user is never
 * a one-way door: without it, getting back to administrator meant closing the company. */
const LOCAL_ADMINISTRATOR: AccessSessionUser = { key: 'local:administrator', name: 'Local Administrator', email: null, role: 'administrator' };

export async function accessSessionUsersList(): Promise<AccessSessionUser[]> {
  const rows = await getCurrentDb().selectFrom('companyUsers').selectAll().where('status', '=', 'active').orderBy('firstName').orderBy('lastName').execute();
  return [LOCAL_ADMINISTRATOR, ...rows.map((row) => ({ key: `company-user:${row.id}`, name: `${row.firstName} ${row.lastName}`.trim(), email: row.email, role: roleSchema.parse(row.role) }))];
}

export async function accessSwitchUser(input: unknown): Promise<AccessSessionUser> {
  const request = z.union([z.object({ id: z.number().int().positive() }), z.object({ key: z.literal(LOCAL_ADMINISTRATOR.key) })]).parse(input);
  if ('key' in request) {
    setAccessIdentity({ key: LOCAL_ADMINISTRATOR.key, name: LOCAL_ADMINISTRATOR.name, email: null });
    setAccessRole('administrator');
    await recordStaffSignIn();
    return { ...LOCAL_ADMINISTRATOR };
  }
  const { id } = request;
  const row = await getCurrentDb().selectFrom('companyUsers').selectAll().where('id', '=', id).where('status', '=', 'active').executeTakeFirst();
  if (!row) throw new Error('This user is not active in the open company.');
  const role = roleSchema.parse(row.role);
  const identity = setAccessIdentity({ key: `company-user:${row.id}`, name: `${row.firstName} ${row.lastName}`.trim(), email: row.email });
  setAccessRole(role);
  // The previous person's session in this window closes as "switched"; the new one opens.
  await recordStaffSignIn();
  return { ...identity, role };
}

/** Administrator only — enforced in listStaffSessions, not just by which screen shows the button. */
export async function accessSignInHistory() {
  return listStaffSessions();
}

/** Creates a repeatable three-person team for testing simultaneous local windows. It never
 * touches accounting transactions and uses reserved example.test addresses so no email can be
 * delivered accidentally. */
export async function accessSetupThreeUserDemo(): Promise<CompanyUser[]> {
  const db = getCurrentDb();
  const now = new Date().toISOString();
  const demo = [
    { firstName: 'Alex', lastName: 'Admin', email: 'alex.admin@example.test', role: 'administrator' as AccessRole },
    { firstName: 'Priya', lastName: 'Accountant', email: 'priya.accountant@example.test', role: 'accountant' as AccessRole },
    { firstName: 'Jordan', lastName: 'Bookkeeper', email: 'jordan.bookkeeper@example.test', role: 'bookkeeper' as AccessRole },
  ];
  for (const user of demo) {
    const existing = await db.selectFrom('companyUsers').select('id').where('email', '=', user.email).executeTakeFirst();
    const values = { firstName: user.firstName, lastName: user.lastName, role: user.role, permissionsJson: JSON.stringify(ROLE_PERMISSIONS[user.role]), status: 'active' as const, invitationToken: null, acceptedAt: now };
    if (existing) await db.updateTable('companyUsers').set(values).where('id', '=', existing.id).execute();
    else await db.insertInto('companyUsers').values({ ...values, email: user.email, invitedAt: now }).execute();
  }
  return accessUsersList();
}
