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

export interface Org { id: number; name: string; slug: string; seats: number; isPlatform: boolean; createdAt: string; discountPct: number; discountUntil: string | null; billingEmail: string; billingStart: string | null; billingCycle: 'monthly' | 'yearly'; billingStatus: 'active' | 'paused' | 'cancelled'; billingEnd: string | null; billingNotes: string; referralCode: string; /** For trying seats out: never billed, never counted in subscriptions or founding places. */ isTest: boolean }
/** The founding-firms offer: half price for six months, for the first firms that sign up. */
export const FOUNDING = { pct: 50, months: 6, maxFirms: 20, signUpBy: '2026-12-31' };
export type SeatType = 'business' | 'payroll' | 'bookkeeper' | 'full';
/** Lowest to highest price. */
export const SEAT_TYPES: SeatType[] = ['business', 'payroll', 'bookkeeper', 'full'];
export const SEAT_TYPE_LABELS: Record<SeatType, string> = { business: 'Business', payroll: 'Payroll Unlimited', bookkeeper: 'Bookkeeper', full: 'Full accountant' };
export interface WebUser { id: number; orgId: number; email: string; name: string; role: 'owner' | 'member'; seatType: SeatType; isActive: boolean; agreedAt: string | null; agreedName: string | null; createdAt: string; lastSignIn: string | null; /** Company files (names) this person may open; null means every company of the organisation. */ companyScope: string[] | null; /** A client of the firm on a firm-paid Business seat, billed at the client seat rate. */ isClient: boolean }

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
export interface TrialRequest { id: number; firm: string; name: string; email: string; phone: string; edition: string; seats: number; message: string; status: 'new' | 'done'; createdAt: string; /** The name typed as signature under the Subscription Agreement on the website, and when. */ agreedName: string | null; agreedAt: string | null; /** The CPA firm whose referral link the visitor followed, if any. */ referralOrgId: number | null; referralOrgName: string | null }
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
  if (!input.agreed) throw new Error('Please read and accept the terms and subscription agreement first.');
  const agreedName = text('agreedName', 160) || null;
  const recent = Number((store().prepare("SELECT COUNT(*) AS n FROM trial_requests WHERE ip = ? AND created_at > strftime('%Y-%m-%d %H:%M:%S', 'now', '-1 hour')").get(ip ?? '') as { n: number }).n);
  if (ip && recent >= 5) throw new Error('Too many requests from this address. Please email admin@apexledger.ca instead.');
  const referrer = orgByReferralCode(String(input.ref ?? ''));
  const r = store().prepare("INSERT INTO trial_requests (firm, name, email, phone, edition, seats, message, ip, agreed, agreed_name, agreed_at, referral_org_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, strftime('%Y-%m-%d %H:%M:%S', 'now'), ?)").run(firm, name, email, phone, edition, seats, message, ip, agreedName, referrer?.id ?? null);
  return getTrialRequest(Number(r.lastInsertRowid))!;
}

function rowToTrial(r: Record<string, unknown>): TrialRequest {
  return { id: Number(r.id), firm: String(r.firm), name: String(r.name), email: String(r.email), phone: String(r.phone), edition: String(r.edition), seats: Number(r.seats), message: String(r.message), status: r.status === 'done' ? 'done' : 'new', createdAt: String(r.created_at), agreedName: r.agreed_name ? String(r.agreed_name) : null, agreedAt: r.agreed_at ? String(r.agreed_at) : null, referralOrgId: r.referral_org_id ? Number(r.referral_org_id) : null, referralOrgName: r.referral_org_id ? getOrg(Number(r.referral_org_id))?.name ?? null : null };
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
  if (!trialCols.includes('agreed_name')) store().exec('ALTER TABLE trial_requests ADD COLUMN agreed_name TEXT');
  if (!trialCols.includes('agreed_at')) store().exec('ALTER TABLE trial_requests ADD COLUMN agreed_at TEXT');
  const orgCols = (store().prepare('PRAGMA table_info(orgs)').all() as { name: string }[]).map((c) => c.name);
  if (!orgCols.includes('discount_pct')) store().exec('ALTER TABLE orgs ADD COLUMN discount_pct INTEGER NOT NULL DEFAULT 0');
  if (!orgCols.includes('discount_until')) store().exec('ALTER TABLE orgs ADD COLUMN discount_until TEXT');
  // Subscription details the administrator keeps by hand: who is billed, from when, how often, and whether it is still running.
  if (!orgCols.includes('billing_email')) store().exec("ALTER TABLE orgs ADD COLUMN billing_email TEXT NOT NULL DEFAULT ''");
  if (!orgCols.includes('billing_start')) store().exec('ALTER TABLE orgs ADD COLUMN billing_start TEXT');
  if (!orgCols.includes('billing_cycle')) store().exec("ALTER TABLE orgs ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly'");
  if (!orgCols.includes('billing_status')) store().exec("ALTER TABLE orgs ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'active'");
  if (!orgCols.includes('billing_end')) store().exec('ALTER TABLE orgs ADD COLUMN billing_end TEXT');
  if (!orgCols.includes('billing_notes')) store().exec("ALTER TABLE orgs ADD COLUMN billing_notes TEXT NOT NULL DEFAULT ''");
  store().exec(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES orgs(id),
    paid_on TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    method TEXT NOT NULL DEFAULT 'etransfer',
    reference TEXT NOT NULL DEFAULT '',
    period_from TEXT,
    period_to TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
  )`);
  // Client access and referrals: a person may be limited to named company files; a firm-paid
  // client seat is billed at its own rate; a business paying for itself can be linked to the CPA
  // firm that referred it, which earns a monthly credit while the link lasts.
  if (!cols.includes('company_scope')) store().exec('ALTER TABLE users ADD COLUMN company_scope TEXT');
  if (!cols.includes('is_client')) store().exec('ALTER TABLE users ADD COLUMN is_client INTEGER NOT NULL DEFAULT 0');
  if (!orgCols.includes('referral_code')) store().exec('ALTER TABLE orgs ADD COLUMN referral_code TEXT');
  if (!orgCols.includes('is_test')) store().exec('ALTER TABLE orgs ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0');
  if (!trialCols.includes('referral_org_id')) store().exec('ALTER TABLE trial_requests ADD COLUMN referral_org_id INTEGER');
  store().exec(`CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_org_id INTEGER NOT NULL REFERENCES orgs(id),
    firm_org_id INTEGER NOT NULL REFERENCES orgs(id),
    started_on TEXT NOT NULL,
    ended_on TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
  )`);
  store().exec(`INSERT OR IGNORE INTO seat_rates (seat_type, cents) VALUES ('${CLIENT_RATE_KEY}', 2400)`);
  for (const o of store().prepare("SELECT id FROM orgs WHERE referral_code IS NULL OR referral_code = ''").all() as { id: number }[]) {
    store().prepare('UPDATE orgs SET referral_code = ? WHERE id = ?').run(newReferralCode(), o.id);
  }
  // Earlier names for the same idea, before the owner settled on Full accountant / Bookkeeper / Business.
  store().exec("UPDATE users SET seat_type = 'bookkeeper' WHERE seat_type = 'accountant'; UPDATE users SET seat_type = 'business' WHERE seat_type = 'readonly'; DELETE FROM seat_rates WHERE seat_type IN ('accountant', 'readonly')");
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'org';
}

function hash(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
}

const mapOrg = (r: Record<string, unknown>): Org => ({ id: Number(r.id), name: String(r.name), slug: String(r.slug), seats: Number(r.seats), isPlatform: Boolean(r.is_platform), createdAt: String(r.created_at), discountPct: Number(r.discount_pct ?? 0), discountUntil: r.discount_until ? String(r.discount_until) : null, billingEmail: String(r.billing_email ?? ''), billingStart: r.billing_start ? String(r.billing_start) : null, billingCycle: r.billing_cycle === 'yearly' ? 'yearly' : 'monthly', billingStatus: r.billing_status === 'paused' || r.billing_status === 'cancelled' ? (r.billing_status as 'paused' | 'cancelled') : 'active', billingEnd: r.billing_end ? String(r.billing_end) : null, billingNotes: String(r.billing_notes ?? ''), referralCode: String(r.referral_code ?? ''), isTest: Boolean(r.is_test) });

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
  return Number((store().prepare('SELECT COUNT(*) AS n FROM orgs WHERE discount_pct > 0 AND is_platform = 0 AND is_test = 0').get() as { n: number }).n);
}
const mapUser = (r: Record<string, unknown>): WebUser => ({ id: Number(r.id), orgId: Number(r.org_id), email: String(r.email), name: String(r.name), role: r.role === 'owner' ? 'owner' : 'member', seatType: SEAT_TYPES.includes(r.seat_type as SeatType) ? (r.seat_type as SeatType) : 'full', agreedAt: r.agreed_at ? String(r.agreed_at) : null, agreedName: r.agreed_name ? String(r.agreed_name) : null, isActive: Boolean(r.is_active), createdAt: String(r.created_at), lastSignIn: r.last_sign_in ? String(r.last_sign_in) : null, companyScope: parseScope(r.company_scope), isClient: Boolean(r.is_client) });

export function listOrgs(): Org[] {
  return (store().prepare('SELECT * FROM orgs ORDER BY is_platform DESC, name').all() as Record<string, unknown>[]).map(mapOrg);
}

export function getOrg(id: number): Org | null {
  const r = store().prepare('SELECT * FROM orgs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? mapOrg(r) : null;
}

export function createOrg(input: { name: string; seats?: number; isPlatform?: boolean; founding?: boolean; isTest?: boolean }): Org {
  const name = input.name.trim();
  if (!name) throw new Error('The organisation needs a name.');
  const seats = Math.max(1, Math.floor(input.seats ?? 2));
  let slug = slugify(name);
  const taken = store().prepare('SELECT 1 FROM orgs WHERE slug = ?');
  for (let i = 2; taken.get(slug); i += 1) slug = `${slugify(name)}-${i}`;
  const r = store().prepare('INSERT INTO orgs (name, slug, seats, is_platform, referral_code) VALUES (?, ?, ?, ?, ?) RETURNING *').get(name, slug, seats, input.isPlatform ? 1 : 0, newReferralCode()) as Record<string, unknown>;
  fs.mkdirSync(companiesDirFor(mapOrg(r)), { recursive: true });
  if (input.isTest) store().prepare('UPDATE orgs SET is_test = 1 WHERE id = ?').run(r.id);
  const created = input.isTest ? getOrg(Number(r.id))! : mapOrg(r);
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
export function seatRates(): Record<SeatType | typeof CLIENT_RATE_KEY, number> {
  const out = { business: 3900, payroll: 4500, bookkeeper: 5900, full: 7900, client: 2400 } as Record<SeatType | typeof CLIENT_RATE_KEY, number>;
  for (const r of store().prepare('SELECT seat_type, cents FROM seat_rates').all() as { seat_type: string; cents: number }[]) if (SEAT_TYPES.includes(r.seat_type as SeatType) || r.seat_type === CLIENT_RATE_KEY) out[r.seat_type as SeatType] = Number(r.cents);
  return out;
}
export function setSeatRate(type: SeatType | typeof CLIENT_RATE_KEY, cents: number): Record<SeatType | typeof CLIENT_RATE_KEY, number> {
  if (!SEAT_TYPES.includes(type as SeatType) && type !== CLIENT_RATE_KEY) throw new Error('Unknown seat type.');
  if (!Number.isInteger(cents) || cents < 0 || cents > 100000000) throw new Error('Enter the monthly rate in dollars, 0 or more.');
  store().prepare('INSERT INTO seat_rates (seat_type, cents) VALUES (?, ?) ON CONFLICT(seat_type) DO UPDATE SET cents = excluded.cents').run(type, cents);
  return seatRates();
}
export function setUserSeatType(id: number, type: SeatType): WebUser {
  if (!SEAT_TYPES.includes(type)) throw new Error('Unknown seat type.');
  if (getUser(id)?.isClient && type !== 'business') throw new Error('A client seat is always a Business seat. Change it to a staff seat first.');
  const r = store().prepare('UPDATE users SET seat_type = ? WHERE id = ? RETURNING *').get(type, id) as Record<string, unknown> | undefined;
  if (!r) throw new Error('Person not found.');
  return mapUser(r);
}

export function createUser(input: { orgId: number; email: string; name: string; password: string; role?: 'owner' | 'member'; seatType?: SeatType; companyScope?: string[] | null; isClient?: boolean }): WebUser {
  const org = getOrg(input.orgId);
  if (!org) throw new Error('Organisation not found.');
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (input.password.length < 8) throw new Error('The password needs at least 8 characters.');
  if (!org.isPlatform && countActiveUsers(org.id) >= org.seats) throw new Error(`${org.name} has all ${org.seats} seats in use. Add a seat or deactivate someone first.`);
  const salt = crypto.randomBytes(16).toString('hex');
  const isClient = Boolean(input.isClient);
  const seatType = isClient ? 'business' : input.seatType && SEAT_TYPES.includes(input.seatType) ? input.seatType : 'full';
  const scope = normaliseScope(input.companyScope, isClient);
  if (isClient && (input.role ?? 'member') === 'owner') throw new Error('A client seat cannot be an owner of the firm.');
  const r = store().prepare('INSERT INTO users (org_id, email, name, role, seat_type, password_hash, salt, company_scope, is_client) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *').get(org.id, email, input.name.trim() || email, input.role ?? 'member', seatType, hash(input.password, salt), salt, scope ? JSON.stringify(scope) : null, isClient ? 1 : 0) as Record<string, unknown>;
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

// ---- subscriptions: billing details and payments, kept by the platform administrator ----
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayOrNull = (v: unknown): string | null => { const t = String(v ?? '').trim(); if (!t) return null; if (!ISO_DAY.test(t)) throw new Error('Dates are YYYY-MM-DD.'); return t; };

export function setOrgBilling(id: number, input: Record<string, unknown>): Org {
  const org = getOrg(id);
  if (!org) throw new Error('Organisation not found.');
  const cycle = input.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const status = input.billingStatus === 'paused' || input.billingStatus === 'cancelled' ? String(input.billingStatus) : 'active';
  const end = status === 'active' ? null : (dayOrNull(input.billingEnd) ?? new Date().toISOString().slice(0, 10));
  store().prepare('UPDATE orgs SET billing_email = ?, billing_start = ?, billing_cycle = ?, billing_status = ?, billing_end = ?, billing_notes = ? WHERE id = ?')
    .run(String(input.billingEmail ?? '').trim().slice(0, 200), dayOrNull(input.billingStart), cycle, status, end, String(input.billingNotes ?? '').trim().slice(0, 2000), id);
  return getOrg(id)!;
}

export interface PaymentRow { id: number; orgId: number; paidOn: string; amountCents: number; method: string; reference: string; periodFrom: string | null; periodTo: string | null; note: string; createdAt: string }
const mapPayment = (r: Record<string, unknown>): PaymentRow => ({ id: Number(r.id), orgId: Number(r.org_id), paidOn: String(r.paid_on), amountCents: Number(r.amount_cents), method: String(r.method), reference: String(r.reference ?? ''), periodFrom: r.period_from ? String(r.period_from) : null, periodTo: r.period_to ? String(r.period_to) : null, note: String(r.note ?? ''), createdAt: String(r.created_at) });

export function listPayments(orgId?: number): PaymentRow[] {
  const rows = orgId === undefined ? store().prepare('SELECT * FROM payments ORDER BY paid_on DESC, id DESC').all() : store().prepare('SELECT * FROM payments WHERE org_id = ? ORDER BY paid_on DESC, id DESC').all(orgId);
  return (rows as Record<string, unknown>[]).map(mapPayment);
}

export function addPayment(orgId: number, input: Record<string, unknown>): PaymentRow {
  if (!getOrg(orgId)) throw new Error('Organisation not found.');
  const paidOn = dayOrNull(input.paidOn);
  if (!paidOn) throw new Error('Enter the date the payment was received.');
  const amountCents = Math.round(Number(input.amountCents));
  if (!Number.isFinite(amountCents) || amountCents === 0) throw new Error('Enter the amount received (a refund is a negative amount).');
  const method = ['etransfer', 'cheque', 'card', 'bank', 'cash', 'other'].includes(String(input.method)) ? String(input.method) : 'other';
  const r = store().prepare('INSERT INTO payments (org_id, paid_on, amount_cents, method, reference, period_from, period_to, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *')
    .get(orgId, paidOn, amountCents, method, String(input.reference ?? '').trim().slice(0, 120), dayOrNull(input.periodFrom), dayOrNull(input.periodTo), String(input.note ?? '').trim().slice(0, 500)) as Record<string, unknown>;
  return mapPayment(r);
}

export function deletePayment(id: number): void {
  const n = Number(store().prepare('DELETE FROM payments WHERE id = ?').run(id).changes);
  if (n === 0) throw new Error('Payment not found.');
}

/** When someone from the organisation was last seen: the newest sign-in or session activity. */
export function lastActivityFor(orgId: number): string | null {
  const r = store().prepare('SELECT MAX(m) AS m FROM (SELECT MAX(u.last_sign_in) AS m FROM users u WHERE u.org_id = ? UNION ALL SELECT MAX(s.last_seen) FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.org_id = ?)').get(orgId, orgId) as { m: string | null };
  return r?.m ?? null;
}

// ---- client access and referrals ----
export const CLIENT_RATE_KEY = 'client' as const;
export const DEFAULT_REFERRAL_CREDIT_CENTS = 1500;

function parseScope(v: unknown): string[] | null {
  if (v == null || v === '') return null;
  try {
    const list = JSON.parse(String(v));
    return Array.isArray(list) ? list.map(String) : null;
  } catch {
    return null;
  }
}

/** A company list as stored: bare .company file names, no folders, no duplicates. A client seat
 * must name at least one company, so a client can never see the whole firm by default. */
function normaliseScope(scope: string[] | null | undefined, required: boolean): string[] | null {
  if (scope == null) {
    if (required) throw new Error('Choose the company this client may open.');
    return null;
  }
  const names = [...new Set(scope.map((n) => path.basename(String(n)).trim()).filter((n) => n.toLowerCase().endsWith('.company')))];
  if (names.length === 0) throw new Error('Choose at least one company file.');
  return names;
}

/** Who may open which company files: every company (null) or the named ones; and the client flag. */
export function setUserAccess(id: number, input: { companyScope: string[] | null; isClient: boolean }): WebUser {
  const user = getUser(id);
  if (!user) throw new Error('Person not found.');
  const isClient = Boolean(input.isClient);
  if (isClient && user.role === 'owner') throw new Error('An owner cannot be a client seat.');
  const scope = normaliseScope(input.companyScope, isClient);
  store().prepare('UPDATE users SET company_scope = ?, is_client = ?, seat_type = CASE WHEN ? = 1 THEN \'business\' ELSE seat_type END WHERE id = ?').run(scope ? JSON.stringify(scope) : null, isClient ? 1 : 0, isClient ? 1 : 0, id);
  return getUser(id)!;
}

function newReferralCode(): string {
  // Short, unambiguous, and not guessable from the firm's name.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const bytes = crypto.randomBytes(8);
    const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    if (!db || !store().prepare('SELECT 1 FROM orgs WHERE referral_code = ?').get(code)) return code;
  }
}

export function orgByReferralCode(code: string): Org | null {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,16}$/.test(clean)) return null;
  const r = store().prepare('SELECT * FROM orgs WHERE referral_code = ? AND is_platform = 0').get(clean) as Record<string, unknown> | undefined;
  return r ? mapOrg(r) : null;
}

export function referralCreditCents(): number {
  const v = Number(getSetting('referral_credit_cents'));
  return Number.isInteger(v) && v >= 0 && getSetting('referral_credit_cents') !== null ? v : DEFAULT_REFERRAL_CREDIT_CENTS;
}
export function setReferralCreditCents(cents: number): number {
  if (!Number.isInteger(cents) || cents < 0 || cents > 100000) throw new Error('Enter the monthly referral credit in dollars, 0 or more.');
  setSetting('referral_credit_cents', String(cents));
  return cents;
}

export interface ReferralRow { id: number; clientOrgId: number; firmOrgId: number; startedOn: string; endedOn: string | null }
const mapReferral = (r: Record<string, unknown>): ReferralRow => ({ id: Number(r.id), clientOrgId: Number(r.client_org_id), firmOrgId: Number(r.firm_org_id), startedOn: String(r.started_on), endedOn: r.ended_on ? String(r.ended_on) : null });

export function listReferrals(): ReferralRow[] {
  return (store().prepare('SELECT * FROM referrals ORDER BY id').all() as Record<string, unknown>[]).map(mapReferral);
}

/** The firm a business is linked to today, if any. */
export function activeReferralFor(clientOrgId: number): ReferralRow | null {
  const r = store().prepare('SELECT * FROM referrals WHERE client_org_id = ? AND ended_on IS NULL ORDER BY id DESC LIMIT 1').get(clientOrgId) as Record<string, unknown> | undefined;
  return r ? mapReferral(r) : null;
}

/** Businesses linked to a firm today: the firm's people may open their company files. */
export function linkedClientOrgs(firmOrgId: number): Org[] {
  const rows = store().prepare('SELECT o.* FROM referrals r JOIN orgs o ON o.id = r.client_org_id WHERE r.firm_org_id = ? AND r.ended_on IS NULL ORDER BY o.name').all(firmOrgId) as Record<string, unknown>[];
  return rows.map(mapOrg);
}

/** Links a business to the CPA firm that referred it, from today. A business has one firm at a time. */
export function startReferral(clientOrgId: number, firmOrgId: number, today = new Date().toISOString().slice(0, 10)): ReferralRow {
  const client = getOrg(clientOrgId);
  const firm = getOrg(firmOrgId);
  if (!client || !firm) throw new Error('Organisation not found.');
  if (client.isPlatform || firm.isPlatform) throw new Error('The platform organisation cannot be part of a referral.');
  if (clientOrgId === firmOrgId) throw new Error('A firm cannot refer itself.');
  if (activeReferralFor(firmOrgId)) throw new Error(`${firm.name} is itself a client of another firm, so it cannot take referrals.`);
  const current = activeReferralFor(clientOrgId);
  if (current) {
    if (current.firmOrgId === firmOrgId) return current;
    throw new Error(`${client.name} is already linked to ${getOrg(current.firmOrgId)?.name ?? 'another firm'}. End that link first.`);
  }
  const r = store().prepare('INSERT INTO referrals (client_org_id, firm_org_id, started_on) VALUES (?, ?, ?) RETURNING *').get(clientOrgId, firmOrgId, today) as Record<string, unknown>;
  return mapReferral(r);
}

/** Ends the link: the firm loses access to the business's books and its credit stops. The business
 * keeps its books and its subscription at the same price. */
export function endReferral(clientOrgId: number, today = new Date().toISOString().slice(0, 10)): ReferralRow | null {
  const current = activeReferralFor(clientOrgId);
  if (!current) return null;
  store().prepare('UPDATE referrals SET ended_on = ? WHERE id = ?').run(today, current.id);
  return { ...current, endedOn: today };
}

/**
 * A client of the firm starts paying for its own subscription: a new organisation for the business,
 * the company file moved out of the firm's folder into the business's own, the business owner's
 * Business seat, and the link to the firm. The caller checks that the file is not open.
 */
export function createClientSubscription(input: { firmOrgId: number; companyFile: string; businessName: string; billingEmail: string; personName: string; personEmail: string; password: string }): { org: Org; user: WebUser; referral: ReferralRow } {
  const firm = getOrg(input.firmOrgId);
  if (!firm || firm.isPlatform) throw new Error('Choose the CPA firm.');
  const fileName = path.basename(String(input.companyFile ?? ''));
  const source = path.join(companiesDirFor(firm), fileName);
  if (!fileName.toLowerCase().endsWith('.company') || !fs.existsSync(source)) throw new Error('Choose one of the firm\'s company files.');
  const email = input.personEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter the business owner\'s email address.');
  if (store().prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new Error(`${email} already has a sign-in. Use another email, or remove the existing seat first.`);
  if (input.password.length < 8) throw new Error('The first password needs at least 8 characters.');
  const businessName = input.businessName.trim() || fileName.replace(/\.company$/i, '');

  const run = store().transaction(() => {
    const org = createOrg({ name: businessName, seats: 1 });
    const today = new Date().toISOString().slice(0, 10);
    store().prepare('UPDATE orgs SET billing_email = ?, billing_start = ? WHERE id = ?').run(input.billingEmail.trim().slice(0, 200) || email, today, org.id);
    const user = createUser({ orgId: org.id, email, name: input.personName, password: input.password, role: 'owner', seatType: 'business' });
    const referral = startReferral(org.id, firm.id, today);
    return { org: getOrg(org.id)!, user, referral };
  });
  const result = run();
  // Move the books last, once the records exist; put them back if the move fails.
  const target = path.join(companiesDirFor(result.org), fileName);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);
    for (const suffix of ['-wal', '-shm']) if (fs.existsSync(source + suffix)) fs.renameSync(source + suffix, target + suffix);
    // People at the firm who were limited to this company keep their list; the file is reached through the link now.
  } catch (e) {
    store().prepare('DELETE FROM referrals WHERE id = ?').run(result.referral.id);
    store().prepare('DELETE FROM users WHERE id = ?').run(result.user.id);
    store().prepare('DELETE FROM orgs WHERE id = ?').run(result.org.id);
    throw new Error(`The company file could not be moved: ${e instanceof Error ? e.message : String(e)}`);
  }
  return result;
}

/** Marks an organisation as a test one (not billed, not counted) or back to a real subscriber. */
export function setOrgTest(id: number, isTest: boolean): Org {
  const org = getOrg(id);
  if (!org || org.isPlatform) throw new Error('Organisation not found.');
  store().prepare('UPDATE orgs SET is_test = ?, discount_pct = CASE WHEN ? = 1 THEN 0 ELSE discount_pct END, discount_until = CASE WHEN ? = 1 THEN NULL ELSE discount_until END WHERE id = ?').run(isTest ? 1 : 0, isTest ? 1 : 0, isTest ? 1 : 0, id);
  return getOrg(id)!;
}

// ---- forgot password: a single-use link, valid for an hour ----
const RESET_MINUTES = 60;
const tokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

function ensureResetTable(): void {
  store().exec(`CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
  )`);
}

/**
 * Starts a password reset for an email. Returns the person and a one-time token when an active
 * person has that email, or null when not; the caller answers the same either way, so the page
 * never tells a stranger which emails have a sign-in. Only the token's hash is stored, and any
 * earlier unused link for that person stops working.
 */
export function createPasswordReset(email: string, now = new Date()): { user: WebUser; token: string } | null {
  ensureResetTable();
  const norm = email.trim().toLowerCase();
  const r = store().prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(norm) as Record<string, unknown> | undefined;
  if (!r) return null;
  const user = mapUser(r);
  const recent = Number((store().prepare("SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > strftime('%Y-%m-%d %H:%M:%S', 'now', '-1 hour')").get(user.id) as { n: number }).n);
  if (recent >= 5) return null;
  store().prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(now.getTime() + RESET_MINUTES * 60_000).toISOString();
  store().prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), user.id, expires);
  return { user, token };
}

/** Sets the new password from a reset link, once. The link is spent whether or not it had expired. */
export function completePasswordReset(token: string, password: string, now = new Date()): WebUser {
  ensureResetTable();
  if (password.length < 8) throw new Error('The password needs at least 8 characters.');
  const row = store().prepare('SELECT user_id, expires_at FROM password_resets WHERE token_hash = ?').get(tokenHash(String(token))) as { user_id: number; expires_at: string } | undefined;
  if (!row) throw new Error('This reset link has already been used or is not valid. Ask for a new one.');
  store().prepare('DELETE FROM password_resets WHERE token_hash = ?').run(tokenHash(String(token)));
  if (row.expires_at < now.toISOString()) throw new Error('This reset link has expired. Ask for a new one.');
  const user = getUser(row.user_id);
  if (!user || !user.isActive) throw new Error('This sign-in is no longer active. Ask your organisation’s owner.');
  setUserPassword(user.id, password);
  // Anyone signed in with the old password is signed out.
  store().prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  return user;
}
