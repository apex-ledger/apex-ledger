import type { AccessIdentity, AccessPermission, AccessRole } from '@shared/domain/access';
import { ROLE_PERMISSIONS } from '@shared/domain/access';
import { AsyncLocalStorage } from 'node:async_hooks';

const ROLES = new Set<AccessRole>(['administrator', 'accountant', 'bookkeeper', 'payroll', 'accountsReceivable', 'accountsPayable', 'readOnly', 'custom']);
interface AccessSessionState { role: AccessRole; permissions: AccessPermission[]; identity: AccessIdentity }
const accessContext = new AsyncLocalStorage<number>();
const sessions = new Map<number, AccessSessionState>();

function sessionState(): AccessSessionState {
  const sessionId = accessContext.getStore() ?? 0;
  let state = sessions.get(sessionId);
  if (!state) {
    state = { role: 'administrator', permissions: [...ROLE_PERMISSIONS.administrator], identity: { key: 'local:administrator', name: 'Local Administrator', email: null } };
    sessions.set(sessionId, state);
  }
  return state;
}

/** Runs one IPC request inside the calling window's access session. AsyncLocalStorage keeps the
 * actor attached through database transactions and awaited handler calls, so simultaneous windows
 * cannot overwrite one another's identity. */
export function runWithAccessSession<T>(sessionId: number, fn: () => T): T {
  return accessContext.run(sessionId, fn);
}

export function clearAccessSession(sessionId: number): void {
  sessions.delete(sessionId);
}

/** The window this request came from — 0 outside any IPC request (startup, quit). */
export function getAccessSessionId(): number {
  return accessContext.getStore() ?? 0;
}

export function setAccessIdentity(value: unknown): AccessIdentity {
  if (!value || typeof value !== 'object') throw new Error('A signed-in user identity is required.');
  const candidate = value as Partial<AccessIdentity>;
  const key = typeof candidate.key === 'string' ? candidate.key.trim() : '';
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  const email = typeof candidate.email === 'string' ? candidate.email.trim().toLowerCase() || null : null;
  if (!key || key.length > 254 || !name || name.length > 160) throw new Error('The signed-in user identity is invalid.');
  const identity = { key, name, email };
  sessionState().identity = identity;
  return { ...identity };
}

export function getAccessIdentity(): AccessIdentity {
  return { ...sessionState().identity };
}

export function setAccessRole(value: unknown): AccessRole {
  if (typeof value !== 'string' || !ROLES.has(value as AccessRole)) throw new Error('Unknown access role.');
  const state = sessionState();
  state.role = value as AccessRole;
  state.permissions = [...ROLE_PERMISSIONS[state.role]];
  return state.role;
}

export function getAccessRole(): AccessRole {
  return sessionState().role;
}

/** On the web the seat a person was given decides what they can reach, and nothing inside the
 * application can raise it. Full accountant: everything. Bookkeeper: the daily books, HST and
 * payroll. Payroll Unlimited: payroll alone. Business: its own books, HST and inventory, without
 * the accountant's tools. The desktop keeps letting the local user pick a role. */
export type WebSeatType = 'business' | 'payroll' | 'bookkeeper' | 'full';
export const SEAT_ACCESS: Record<WebSeatType, { role: AccessRole; permissions: AccessPermission[] }> = {
  full: { role: 'administrator', permissions: [...ROLE_PERMISSIONS.administrator] },
  bookkeeper: { role: 'bookkeeper', permissions: ['sales', 'purchases', 'banking', 'inventory', 'tax', 'payroll'] },
  payroll: { role: 'payroll', permissions: ['payroll'] },
  business: { role: 'bookkeeper', permissions: ['sales', 'purchases', 'banking', 'inventory', 'tax', 'company'] },
};
export function applySeatAccess(seat: WebSeatType): AccessRole {
  const profile = SEAT_ACCESS[seat] ?? SEAT_ACCESS.full;
  const state = sessionState();
  state.role = profile.role;
  state.permissions = [...profile.permissions];
  return state.role;
}

const SALES_TOPICS = new Set(['customers', 'invoices', 'salesReceipts', 'estimates', 'deposits']);
const PURCHASE_TOPICS = new Set(['vendors', 'bills', 'purchaseOrders']);
const BANKING_TOPICS = new Set(['bankImport', 'bankReconciliation', 'receiptInbox']);
const PAYROLL_TOPICS = new Set(['employees', 'payrollRuns', 'shareholders', 'mileage', 'mileageTrips']);
const TAX_TOPICS = new Set(['hstFilings', 'gifi', 'ccaPools']);
const INVENTORY_TOPICS = new Set(['products', 'inventoryMovements']);

export function permissionForMutationTopic(topic: string): AccessPermission {
  if (SALES_TOPICS.has(topic)) return 'sales';
  if (PURCHASE_TOPICS.has(topic)) return 'purchases';
  if (BANKING_TOPICS.has(topic)) return 'banking';
  if (PAYROLL_TOPICS.has(topic)) return 'payroll';
  if (TAX_TOPICS.has(topic)) return 'tax';
  if (INVENTORY_TOPICS.has(topic)) return 'inventory';
  if (topic === 'company') return 'company';
  if (topic === 'accessUsers') return 'users';
  return 'accounting';
}

/** Reading sensitive data — payroll above all — needs the same permission as changing it. An
 * administrator sees everything; a read-only reviewer (the accountant checking the file) does
 * too, since seeing is exactly what that role is for. Everyone else needs the permission. */
export function requirePermission(permission: AccessPermission): void {
  const state = sessionState();
  if (state.role === 'administrator' || state.role === 'readOnly') return;
  if (!state.permissions.includes(permission)) throw new Error(`Access denied: this role cannot see ${permission} information. Ask an administrator to change your access.`);
}

export function requireWriteAccess(topic = 'accounting'): void {
  const state = sessionState();
  if (state.role === 'readOnly') throw new Error('Read-only access: changes are not permitted. Ask an administrator to change your access.');
  const required = permissionForMutationTopic(topic);
  if (!state.permissions.includes(required)) throw new Error(`Access denied: this role does not have ${required} permission.`);
}
