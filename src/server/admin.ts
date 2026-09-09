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

export interface Org { id: number; name: string; slug: string; seats: number; isPlatform: boolean; createdAt: string; discountPct: number; discountUntil: string | null }
/** The founding-firms offer: half price for six months, for the first firms that sign up. */
export const FOUNDING = { pct: 50, months: 6, maxFirms: 20, signUpBy: '2026-12-31' };
export type SeatType = 'business' | 'payroll' | 'bookkeeper' | 'full';
/** Lowest to highest price. */
export const SEAT_TYPES: SeatType[] = ['business', 'payroll', 'bookkeeper', 'full'];
export const SEAT_TYPE_LABELS: Record<SeatType, string> = { business: 'Business', payroll: 'Payroll Unlimited', bookkeeper: 'Bookkeeper', full: 'Full accountant' };
export interface WebUser { id: number; orgId: number; email: string; name: string; role: 'owner' | 'member'; seatType: SeatType; isActive: boolean; agreedAt: string | null; agreedName: string | null; createdAt: string; lastSignIn: string | null }

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
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS seat_rates (
      seat_type TEXT PRIMARY KEY,
      cents INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO seat_rates (seat_type, cents) VALUES ('business', 3900), ('payroll', 4500), ('bookkeeper', 5900), ('full', 7900);
    CREATE TABLE IF NOT EXISTS sign_in_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      ok INTEGER NOT NULL,
      ip TEXT,
      at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      company_path TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
      last_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL,
      org_name TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      email TEXT NOT NULL,
      page TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
    );
    CREATE TABLE IF NOT EXISTS trial_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firm TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      edition TEXT NOT NULL,
      seats INTEGER NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      ip TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
    );
  `);
  ensureColumns();
}

/** Platform-wide switches, e.g. sign-in paused for every firm while something is checked. */
export function getSetting(key: string): string | null {
  const r = store().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return r ? r.value : null;
}
export function setSetting(key: string, value: string): void {
  store().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
export function signInPaused(): boolean { return getSetting('signin_paused') === '1'; }
export function deleteSessionsOfNonPlatformUsers(): number {
  return Number(store().prepare('DELETE FROM sessions WHERE user_id IN (SELECT u.id FROM users u JOIN orgs o ON o.id = u.org_id WHERE o.is_platform = 0)').run().changes);
}

/** Sign-ins outlive the process: a session row holds the hash of the cookie token, the person,
 * and the company they had open, so a restart or a deploy reconnects them where they were. Rows
 * older than SESSION_DAYS without activity are gone; the cookie carries the same lifetime. */
export const SESSION_DAYS = 30;
export interface SessionRow { userId: number; companyPath: string | null; lastSeen: string }
export function saveSession(tokenHash: string, userId: number): void {
  store().prepare('INSERT OR REPLACE INTO sessions (token_hash, user_id) VALUES (?, ?)').run(tokenHash, userId);
}
export function findSession(tokenHash: string): SessionRow | null {
  const r = store().prepare(`SELECT user_id, company_path, last_seen FROM sessions WHERE token_hash = ? AND last_seen > strftime('%Y-%m-%d %H:%M:%S', 'now', '-${SESSION_DAYS} days')`).get(tokenHash) as Record<string, unknown> | undefined;
  return r ? { userId: Number(r.user_id), companyPath: r.company_path ? String(r.company_path) : null, lastSeen: String(r.last_seen) } : null;
}
export function touchSession(tokenHash: string, companyPath: string | null): void {
  store().prepare("UPDATE sessions SET last_seen = strftime('%Y-%m-%d %H:%M:%S', 'now'), company_path = ? WHERE token_hash = ?").run(companyPath, tokenHash);
}
export function deleteSession(tokenHash: string): void {
  store().prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}
export function purgeSessions(): number {
  return Number(store().prepare(`DELETE FROM sessions WHERE last_seen <= strftime('%Y-%m-%d %H:%M:%S', 'now', '-${SESSION_DAYS} days')`).run().changes);
}
/** The person accepted the subscription agreement and terms; recorded once, with the time. */
export function recordAgreement(userId: number, signedName: string): WebUser {
  const name = signedName.trim().slice(0, 160);
  if (name.length < 3) throw new Error('Type your full name as your signature.');
  store().prepare("UPDATE users SET agreed_at = COALESCE(agreed_at, strftime('%Y-%m-%d %H:%M:%S', 'now')), agreed_name = COALESCE(agreed_name, ?) WHERE id = ?").run(name, userId);
  const u = getUser(userId);
  if (!u) throw new Error('Person not found.');
  return u;
}

export function getUser(id: number): WebUser | null {
  const r = store().prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? mapUser(r) : null;
}

/** A note from the Feedback button: who, from which firm, on which screen, and what they said. */
export interface FeedbackNote { id: number; orgId: number; orgName: string; userId: number; userName: string; email: string; page: string; message: string; status: 'new' | 'done'; createdAt: string }
const rowToNote = (r: Record<string, unknown>): FeedbackNote => ({ id: Number(r.id), orgId: Number(r.org_id), orgName: String(r.org_name), userId: Number(r.user_id), userName: String(r.user_name), email: String(r.email), page: String(r.page), message: String(r.message), status: r.status === 'done' ? 'done' : 'new', createdAt: String(r.created_at) });
export function createFeedback(user: WebUser, org: Org, input: { message?: unknown; page?: unknown }): FeedbackNote {
  const message = String(input.message ?? '').trim().slice(0, 4000);
  if (message.length < 5) throw new Error('Say a little more so we can act on it.');
  const page = String(input.page ?? '').trim().slice(0, 120);
  const r = store().prepare('INSERT INTO feedback (org_id, org_name, user_id, user_name, email, page, message) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *').get(org.id, org.name, user.id, user.name, user.email, page, message) as Record<string, unknown>;
  return rowToNote(r);
}
/** Feedback from the public website: no sign-in, so the sender's own name and email are kept.
 * Stored in the same table under the "Website" organisation so it shows with everything else. */
export function createSiteFeedback(input: Record<string, unknown>, ip: string | null): FeedbackNote {
  const message = String(input.message ?? '').trim().slice(0, 4000);
  if (message.length < 5) throw new Error('Say a little more so we can act on it.');
  const name = String(input.name ?? '').trim().slice(0, 120) || 'Website visitor';
  const email = String(input.email ?? '').trim().slice(0, 200);
  const page = String(input.page ?? 'apexledger.ca').trim().slice(0, 120);
  const recent = Number((store().prepare("SELECT COUNT(*) AS n FROM feedback WHERE org_id = 0 AND page LIKE ? AND created_at > strftime('%Y-%m-%d %H:%M:%S', 'now', '-1 hour')").get(`%[${ip ?? ''}]`) as { n: number }).n);
  if (ip && recent >= 5) throw new Error('Too many notes from this address. Please email admin@apexledger.ca instead.');
  const r = store().prepare('INSERT INTO feedback (org_id, org_name, user_id, user_name, email, page, message) VALUES (0, ?, 0, ?, ?, ?, ?) RETURNING *').get('Website', name, email, `${page} [${ip ?? ''}]`, message) as Record<string, unknown>;
  return rowToNote(r);
}
export function listFeedback(orgId?: number): FeedbackNote[] {
  const rows = orgId === undefined
    ? store().prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 300').all()
    : store().prepare('SELECT * FROM feedback WHERE org_id = ? ORDER BY id DESC LIMIT 300').all(orgId);
  return (rows as Record<string, unknown>[]).map(rowToNote);
}
export function setFeedbackStatus(id: number, status: 'new' | 'done'): FeedbackNote {
  store().prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, id);
  const r = store().prepare('SELECT * FROM feedback WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!r) throw new Error('Note not found.');
  return rowToNote(r);
}

/** A trial request from the public website: who they are, which edition, how many seats. The
 * platform administrator reads these in Settings and creates the organisation from them. */
export interface TrialRequest { id: number; firm: string; name: string; email: string; phone: string; edition: string; seats: number; message: string; status: 'new' | 'done'; createdAt: string }
const TRIAL_EDITIONS = ['Business', 'Payroll Unlimited', 'Payroll only', 'Bookkeeper', 'Full accountant', 'Accounting Essential', 'Ultimate Suite', 'Payroll'];

export function createTrialRequest(input: Record<string, unknown>, ip: string | null): TrialRequest {
  const text = (k: string, max: number, required = false) => {
    const v = String(input[k] ?? '').trim().slice(0, max);
    if (required && !v) throw new Error(`Please fill in ${k === 'firm' ? 'the firm or business name' : k === 'name' ? 'your name' : 'your email'}.`);
    return v;
  };
  const firm = text('firm', 200, true);
  const name = text('name', 120, true);
  const email = text('email', 200, true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That email address does not look right.');
  const phone = text('phone', 50);
  const edition = TRIAL_EDITIONS.includes(String(input.edition)) ? String(input.edition) : 'Full accountant';
  const seats = Math.min(100, Math.max(1, Math.round(Number(input.seats) || 2)));
  const message = text('message', 2000);
  if (!input.agreed) throw new Error('Please tick the box to agree to the terms and subscription agreement.');
  const recent = Number((store().prepare("SELECT COUNT(*) AS n FROM trial_requests WHERE ip = ? AND created_at > strftime('%Y-%m-%d %H:%M:%S', 'now', '-1 hour')").get(ip ?? '') as { n: number }).n);
  if (ip && recent >= 5) throw new Error('Too many requests from this address. Please email admin@apexledger.ca instead.');
  const r = store().prepare('INSERT INTO trial_requests (firm, name, email, phone, edition, seats, message, ip, agreed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)').run(firm, name, email, phone, edition, seats, message, ip);
  return getTrialRequest(Number(r.lastInsertRowid))!;
}

function rowToTrial(r: Record<string, unknown>): TrialRequest {
  return { id: Number(r.id), firm: String(r.firm), name: String(r.name), email: String(r.email), phone: String(r.phone), edition: String(r.edition), seats: Number(r.seats), message: String(r.message), status: r.status === 'done' ? 'done' : 'new', createdAt: String(r.created_at) };
}
export function getTrialRequest(id: number): TrialRequest | null {
  const r = store().prepare('SELECT * FROM trial_requests WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? rowToTrial(r) : null;
}
export function listTrialRequests(): TrialRequest[] {
  return (store().prepare('SELECT * FROM trial_requests ORDER BY id DESC LIMIT 200').all() as Record<string, unknown>[]).map(rowToTrial);
}
export function setTrialRequestStatus(id: number, status: 'new' | 'done'): TrialRequest {
  store().prepare('UPDATE trial_requests SET status = ? WHERE id = ?').run(status, id);
  const t = getTrialRequest(id);
  if (!t) throw new Error('Request not found.');
  return t;
}

function store(): Database.Database {
  if (!db) throw new Error('Admin store not opened.');
  return db;
}

/** Columns added after the first release, applied once; older stores gain them on start. */
function ensureColumns(): void {
  const cols = (store().prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes('seat_type')) store().exec("ALTER TABLE users ADD COLUMN seat_type TEXT NOT NULL DEFAULT 'full'");
  if (!cols.includes('agreed_at')) store().exec('ALTER TABLE users ADD COLUMN agreed_at TEXT');
  if (!cols.includes('agreed_name')) store().exec('ALTER TABLE users ADD COLUMN agreed_name TEXT');
  const trialCols = (store().prepare('PRAGMA table_info(trial_requests)').all() as { name: string }[]).map((c) => c.name);
  if (!trialCols.includes('agreed')) store().exec('ALTER TABLE trial_requests ADD COLUMN agreed INTEGER NOT NULL DEFAULT 0');
  const orgCols = (store().prepare('PRAGMA table_info(orgs)').all() as { name: string }[]).map((c) => c.name);
  if (!orgCols.includes('discount_pct')) store().exec('ALTER TABLE orgs ADD COLUMN discount_pct INTEGER NOT NULL DEFAULT 0');
  if (!orgCols.includes('discount_until')) store().exec('ALTER TABLE orgs ADD COLUMN discount_until TEXT');
  // Earlier names for the same idea, before the owner settled on Full accountant / Bookkeeper / Business.
  store().exec("UPDATE users SET seat_type = 'bookkeeper' WHERE seat_type = 'accountant'; UPDATE users SET seat_type = 'business' WHERE seat_type = 'readonly'; DELETE FROM seat_rates WHERE seat_type IN ('accountant', 'readonly')");
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'org';
}

function hash(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
}

const mapOrg = (r: Record<string, unknown>): Org => ({ id: Number(r.id), name: String(r.name), slug: String(r.slug), seats: Number(r.seats), isPlatform: Boolean(r.is_platform), createdAt: String(r.created_at), discountPct: Number(r.discount_pct ?? 0), discountUntil: r.discount_until ? String(r.discount_until) : null });

/** Founding offer on an organisation: 50% off until six months from today, or off. */
export function setOrgFounding(id: number, on: boolean): Org {
  if (on) {
    const until = new Date(); until.setMonth(until.getMonth() + FOUNDING.months);
    store().prepare('UPDATE orgs SET discount_pct = ?, discount_until = ? WHERE id = ?').run(FOUNDING.pct, until.toISOString().slice(0, 10), id);
  } else {
    store().prepare('UPDATE orgs SET discount_pct = 0, discount_until = NULL WHERE id = ?').run(id);
  }
  const o = getOrg(id);
  if (!o) throw new Error('Organisation not found.');
  return o;
}
export function foundingFirmsCount(): number {
  return Number((store().prepare('SELECT COUNT(*) AS n FROM orgs WHERE discount_pct > 0 AND is_platform = 0').get() as { n: number }).n);
}
const mapUser = (r: Record<string, unknown>): WebUser => ({ id: Number(r.id), orgId: Number(r.org_id), email: String(r.email), name: String(r.name), role: r.role === 'owner' ? 'owner' : 'member', seatType: SEAT_TYPES.includes(r.seat_type as SeatType) ? (r.seat_type as SeatType) : 'full', agreedAt: r.agreed_at ? String(r.agreed_at) : null, agreedName: r.agreed_name ? String(r.agreed_name) : null, isActive: Boolean(r.is_active), createdAt: String(r.created_at), lastSignIn: r.last_sign_in ? String(r.last_sign_in) : null });

export function listOrgs(): Org[] {
  return (store().prepare('SELECT * FROM orgs ORDER BY is_platform DESC, name').all() as Record<string, unknown>[]).map(mapOrg);
}

export function getOrg(id: number): Org | null {
  const r = store().prepare('SELECT * FROM orgs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? mapOrg(r) : null;
}

export function createOrg(input: { name: string; seats?: number; isPlatform?: boolean; founding?: boolean }): Org {
  const name = input.name.trim();
  if (!name) throw new Error('The organisation needs a name.');
  const seats = Math.max(1, Math.floor(input.seats ?? 2));
  let slug = slugify(name);
  const taken = store().prepare('SELECT 1 FROM orgs WHERE slug = ?');
  for (let i = 2; taken.get(slug); i += 1) slug = `${slugify(name)}-${i}`;
  const r = store().prepare('INSERT INTO orgs (name, slug, seats, is_platform) VALUES (?, ?, ?, ?) RETURNING *').get(name, slug, seats, input.isPlatform ? 1 : 0) as Record<string, unknown>;
  fs.mkdirSync(companiesDirFor(mapOrg(r)), { recursive: true });
  const created = mapOrg(r);
  return input.founding ? setOrgFounding(created.id, true) : created;
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
/** A seat's type sets what the person is billed at: Business, Payroll Unlimited, Bookkeeper or Full accountant. The role inside
 * each company file is still set there; the type is the commercial label and the rate. */
export function seatRates(): Record<SeatType, number> {
  const out = { business: 3900, payroll: 4500, bookkeeper: 5900, full: 7900 } as Record<SeatType, number>;
  for (const r of store().prepare('SELECT seat_type, cents FROM seat_rates').all() as { seat_type: string; cents: number }[]) if (SEAT_TYPES.includes(r.seat_type as SeatType)) out[r.seat_type as SeatType] = Number(r.cents);
  return out;
}
export function setSeatRate(type: SeatType, cents: number): Record<SeatType, number> {
  if (!SEAT_TYPES.includes(type)) throw new Error('Unknown seat type.');
  if (!Number.isInteger(cents) || cents < 0 || cents > 100000000) throw new Error('Enter the monthly rate in dollars, 0 or more.');
  store().prepare('INSERT INTO seat_rates (seat_type, cents) VALUES (?, ?) ON CONFLICT(seat_type) DO UPDATE SET cents = excluded.cents').run(type, cents);
  return seatRates();
}
export function setUserSeatType(id: number, type: SeatType): WebUser {
  if (!SEAT_TYPES.includes(type)) throw new Error('Unknown seat type.');
  const r = store().prepare('UPDATE users SET seat_type = ? WHERE id = ? RETURNING *').get(type, id) as Record<string, unknown> | undefined;
  if (!r) throw new Error('Person not found.');
  return mapUser(r);
}

export function createUser(input: { orgId: number; email: string; name: string; password: string; role?: 'owner' | 'member'; seatType?: SeatType }): WebUser {
  const org = getOrg(input.orgId);
  if (!org) throw new Error('Organisation not found.');
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (input.password.length < 8) throw new Error('The password needs at least 8 characters.');
  if (!org.isPlatform && countActiveUsers(org.id) >= org.seats) throw new Error(`${org.name} has all ${org.seats} seats in use. Add a seat or deactivate someone first.`);
  const salt = crypto.randomBytes(16).toString('hex');
  const seatType = input.seatType && SEAT_TYPES.includes(input.seatType) ? input.seatType : 'full';
  const r = store().prepare('INSERT INTO users (org_id, email, name, role, seat_type, password_hash, salt) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *').get(org.id, email, input.name.trim() || email, input.role ?? 'member', seatType, hash(input.password, salt), salt) as Record<string, unknown>;
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

/** Sign-in through Microsoft or Google: the provider has verified the email, so the only question
 * is whether an active person with that email exists. No seat is ever created this way. */
export function signInByVerifiedEmail(email: string, provider: string, ip: string | null): WebUser | null {
  const norm = email.trim().toLowerCase();
  const r = store().prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(norm) as Record<string, unknown> | undefined;
  store().prepare('INSERT INTO sign_in_log (email, ok, ip) VALUES (?, ?, ?)').run(`${norm} via ${provider}`, r ? 1 : 0, ip);
  if (!r) return null;
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
