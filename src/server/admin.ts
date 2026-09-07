/** Organisations, seats and sign-ins for the web server.
 *
 * An organisation is one customer of the service: a bookkeeping firm or a business. It has a
 * number of seats, and each seat is a person with an email and a password. Its company files live
 * in their own folder, so one organisation can never open another's books. The platform admin
 * organisation ("Apex") has no seat limit and can create organisations and people.
 *
 * Kept in a small SQLite file beside the company files (web-admin.db). Passwords are scrypt
 * hashed with a per-user salt and never stored or logged in clear. */
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface Org { id: number; name: string; slug: string; seats: number; isPlatform: boolean; createdAt: string }
export interface WebUser { id: number; orgId: number; email: string; name: string; role: 'owner' | 'member'; isActive: boolean; createdAt: string; lastSignIn: string | null }

let db: Database.Database | null = null;
let dataDir = '';

export function openAdminStore(dir: string): void {
  dataDir = dir;
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, 'web-admin.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS orgs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      seats INTEGER NOT NULL DEFAULT 2,
      is_platform INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL REFERENCES orgs(id),
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
      last_sign_in TEXT
    );
    CREATE TABLE IF NOT EXISTS sign_in_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      ok INTEGER NOT NULL,
      ip TEXT,
      at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    );
  `);
}

function store(): Database.Database {
  if (!db) throw new Error('Admin store not opened.');
  return db;
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'org';
}

function hash(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
}

const mapOrg = (r: Record<string, unknown>): Org => ({ id: Number(r.id), name: String(r.name), slug: String(r.slug), seats: Number(r.seats), isPlatform: Boolean(r.is_platform), createdAt: String(r.created_at) });
const mapUser = (r: Record<string, unknown>): WebUser => ({ id: Number(r.id), orgId: Number(r.org_id), email: String(r.email), name: String(r.name), role: r.role === 'owner' ? 'owner' : 'member', isActive: Boolean(r.is_active), createdAt: String(r.created_at), lastSignIn: r.last_sign_in ? String(r.last_sign_in) : null });

export function listOrgs(): Org[] {
  return (store().prepare('SELECT * FROM orgs ORDER BY is_platform DESC, name').all() as Record<string, unknown>[]).map(mapOrg);
}

export function getOrg(id: number): Org | null {
  const r = store().prepare('SELECT * FROM orgs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? mapOrg(r) : null;
}

export function createOrg(input: { name: string; seats?: number; isPlatform?: boolean }): Org {
  const name = input.name.trim();
  if (!name) throw new Error('The organisation needs a name.');
  const seats = Math.max(1, Math.floor(input.seats ?? 2));
  let slug = slugify(name);
  const taken = store().prepare('SELECT 1 FROM orgs WHERE slug = ?');
  for (let i = 2; taken.get(slug); i += 1) slug = `${slugify(name)}-${i}`;
  const r = store().prepare('INSERT INTO orgs (name, slug, seats, is_platform) VALUES (?, ?, ?, ?) RETURNING *').get(name, slug, seats, input.isPlatform ? 1 : 0) as Record<string, unknown>;
  fs.mkdirSync(companiesDirFor(mapOrg(r)), { recursive: true });
  return mapOrg(r);
}

export function updateOrgSeats(id: number, seats: number): Org {
  const org = getOrg(id);
  if (!org) throw new Error('Organisation not found.');
  const active = countActiveUsers(id);
  const next = Math.max(1, Math.floor(seats));
  if (next < active) throw new Error(`${org.name} has ${active} active people; seats cannot go below that. Deactivate someone first.`);
  store().prepare('UPDATE orgs SET seats = ? WHERE id = ?').run(next, id);
  return getOrg(id)!;
}

export function companiesDirFor(org: Org): string {
  return path.join(dataDir, 'companies', org.slug);
}

export function countActiveUsers(orgId: number): number {
  return Number((store().prepare('SELECT COUNT(*) AS n FROM users WHERE org_id = ? AND is_active = 1').get(orgId) as { n: number }).n);
}

export function listUsers(orgId?: number): WebUser[] {
  const rows = orgId === undefined
    ? store().prepare('SELECT * FROM users ORDER BY org_id, name').all()
    : store().prepare('SELECT * FROM users WHERE org_id = ? ORDER BY name').all(orgId);
  return (rows as Record<string, unknown>[]).map(mapUser);
}

/** Adds a person to an organisation, refusing when every seat is taken. */
export function createUser(input: { orgId: number; email: string; name: string; password: string; role?: 'owner' | 'member' }): WebUser {
  const org = getOrg(input.orgId);
  if (!org) throw new Error('Organisation not found.');
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (input.password.length < 8) throw new Error('The password needs at least 8 characters.');
  if (!org.isPlatform && countActiveUsers(org.id) >= org.seats) throw new Error(`${org.name} has all ${org.seats} seats in use. Add a seat or deactivate someone first.`);
  const salt = crypto.randomBytes(16).toString('hex');
  const r = store().prepare('INSERT INTO users (org_id, email, name, role, password_hash, salt) VALUES (?, ?, ?, ?, ?, ?) RETURNING *').get(org.id, email, input.name.trim() || email, input.role ?? 'member', hash(input.password, salt), salt) as Record<string, unknown>;
  return mapUser(r);
}

export function setUserActive(id: number, active: boolean): WebUser {
  const u = store().prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!u) throw new Error('Person not found.');
  if (active) {
    const org = getOrg(Number(u.org_id))!;
    if (!org.isPlatform && countActiveUsers(org.id) >= org.seats && !u.is_active) throw new Error(`${org.name} has all ${org.seats} seats in use.`);
  }
  store().prepare('UPDATE users SET is_active = ? WHERE id = ?').run(active ? 1 : 0, id);
  return mapUser(store().prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown>);
}

export function setUserPassword(id: number, password: string): void {
  if (password.length < 8) throw new Error('The password needs at least 8 characters.');
  const salt = crypto.randomBytes(16).toString('hex');
  store().prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash(password, salt), salt, id);
}

/** Checks a sign-in. Constant-time compare; failures are logged with the address for lockout later. */
export function authenticate(email: string, password: string, ip: string | null): WebUser | null {
  const norm = email.trim().toLowerCase();
  const r = store().prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(norm) as Record<string, unknown> | undefined;
  let ok = false;
  if (r) {
    const expected = Buffer.from(String(r.password_hash), 'hex');
    const given = Buffer.from(hash(password, String(r.salt)), 'hex');
    ok = expected.length === given.length && crypto.timingSafeEqual(expected, given);
  }
  store().prepare('INSERT INTO sign_in_log (email, ok, ip) VALUES (?, ?, ?)').run(norm, ok ? 1 : 0, ip);
  if (!ok || !r) return null;
  store().prepare("UPDATE users SET last_sign_in = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?").run(r.id);
  return mapUser(r);
}

/** Failed sign-ins from one address in the last 15 minutes; the server refuses above a limit. */
export function recentFailures(ip: string | null): number {
  if (!ip) return 0;
  return Number((store().prepare("SELECT COUNT(*) AS n FROM sign_in_log WHERE ip = ? AND ok = 0 AND at > strftime('%Y-%m-%d %H:%M:%f', 'now', '-15 minutes')").get(ip) as { n: number }).n);
}

/** First run: the platform organisation and its admin from the environment; optional starter
 * organisations from APEX_SEED_ORGS="Firm One:2,Firm Two:2". Safe to run every start. */
export function bootstrap(env: NodeJS.ProcessEnv): { created: string[] } {
  const created: string[] = [];
  let platform = listOrgs().find((o) => o.isPlatform) ?? null;
  if (!platform) { platform = createOrg({ name: env.APEX_PLATFORM_NAME ?? 'Apex Ledger', seats: 999, isPlatform: true }); created.push(`org ${platform.name} (platform)`); }
  if (env.APEX_ADMIN_EMAIL && env.APEX_ADMIN_PASSWORD && !listUsers(platform.id).some((u) => u.email === env.APEX_ADMIN_EMAIL!.toLowerCase())) {
    createUser({ orgId: platform.id, email: env.APEX_ADMIN_EMAIL, name: env.APEX_ADMIN_NAME ?? 'Platform admin', password: env.APEX_ADMIN_PASSWORD, role: 'owner' });
    created.push(`admin ${env.APEX_ADMIN_EMAIL}`);
  }
  for (const spec of (env.APEX_SEED_ORGS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [name, seatsText] = spec.split(':');
    if (!listOrgs().some((o) => o.name === name.trim())) { const org = createOrg({ name: name.trim(), seats: Number(seatsText) || 2 }); created.push(`org ${org.name} (${org.seats} seats)`); }
  }
  return { created };
}
