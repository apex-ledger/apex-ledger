/** Apex Ledger web server: the same handlers the desktop app runs, reached over HTTPS.
 *
 * Every screen in the browser calls `window.api.<group>.<method>(...)` exactly as it does on the
 * desktop; here that becomes POST /api/<channel> with the arguments as JSON, dispatched into the
 * same registered handler. Each signed-in person gets their own session: their own opened company
 * connection (a SQLite file in their organisation's folder on the server's data disk) and their
 * own access identity, kept on async-local storage so requests from different people never see
 * each other's books.
 *
 * Organisations and seats: src/server/admin.ts. Five firms with two seats each is the starting
 * shape; seats and organisations are rows, not code, so it scales by adding rows.
 *
 * Environment:
 *   APEX_DATA_DIR         folder holding organisations' company files and app data (default ./web-data)
 *   APEX_ADMIN_EMAIL/APEX_ADMIN_PASSWORD   first platform admin (created on first start)
 *   APEX_SEED_ORGS        optional "Firm One:2,Firm Two:2" starter organisations
 *   PORT                  listen port (default 8787)
 *   APEX_SMTP_HOST/APEX_SMTP_FROM (+ USER/PASSWORD/PORT/SECURITY), APEX_NOTIFY_EMAIL
 *   APEX_ANTHROPIC_API_KEY, APEX_CHAT_MODEL   the website's question-and-answer assistant (off until the key is set)
 *                         emails each website trial request to the administrator (src/server/notify.ts)
 */
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';
import { handlerRegistry, BrowserWindow, DOWNLOAD_DIR, UPLOAD_DIR, uploadContext, downloadContext } from './electronStub';
import { authenticate, bootstrap, companiesDirFor, createFeedback, createSiteFeedback, recordAgreement, signInPaused, setSetting, deleteSessionsOfNonPlatformUsers, createOrg, createTrialRequest, createUser, seatRates, setSeatRate, setUserSeatType, setOrgFounding, foundingFirmsCount, FOUNDING, type SeatType, listFeedback, setFeedbackStatus, deleteSession, findSession, getOrg, getUser, listOrgs, listTrialRequests, listUsers, openAdminStore, purgeSessions, recentFailures, saveSession, SESSION_DAYS, setTrialRequestStatus, setUserActive, setUserPassword, signInByVerifiedEmail, touchSession, updateOrgSeats, type Org, type WebUser } from './admin';
import { registerIpcHandlers } from '../main/ipc/registerHandlers';
import { runWithAccessSession, clearAccessSession, setAccessIdentity, applySeatAccess, getAccessRole, SEAT_ACCESS } from '../main/accessSession';
import { runWithCompanyContext, type CompanyContext, closeCompany, createCompanyAt, openCompany, getCurrentFilePath } from '../main/companyFile';
import { setBroadcastSink } from '../main/windows';
import { companyGet } from '../main/ipc/company.handlers';
import { seedFirmServices } from '../main/db/seeds/firmServices.seed';
import { getCurrentDb } from '../main/companyFile';
import { companyCreateSchema } from '@shared/validation/schemas';
import { WEB_LICENSE } from '../main/licensing/license';
import { authorizeUrl, exchangeCode, providersFromEnv, signingKeys, verifyIdToken } from './oidc';
import { notifySiteQuestion, notifyTrialRequest } from './notify';
import { IpLimiter, answerSiteQuestion, limitTurns } from './siteChat';
import { answerFromSite } from './siteAnswers';
import { addPayment, deletePayment, lastActivityFor, listPayments, setOrgBilling } from './admin';
import { billingTotals, computeOrgBilling } from './billing';
import { SITE_KNOWLEDGE } from './siteKnowledge.generated';
import { seatAllowsChannel, filterResultForSeat, SEAT_LABELS } from '@shared/domain/seatScope';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = process.env.APEX_DATA_DIR ? path.resolve(process.env.APEX_DATA_DIR) : path.resolve(process.cwd(), 'web-data');
const STATIC_DIR = process.env.APEX_WEB_STATIC ?? path.resolve(__dirname, '../dist-web');
fs.mkdirSync(DATA_DIR, { recursive: true });
openAdminStore(DATA_DIR);
const boot = bootstrap(process.env);
if (boot.created.length) console.log('[web] created:', boot.created.join(', '));
if (!listUsers().some((u) => u.isActive)) console.warn('[web] No sign-ins exist yet. Set APEX_ADMIN_EMAIL and APEX_ADMIN_PASSWORD and restart.');

interface Session {
  id: number;
  token: string;
  user: WebUser;
  org: Org;
  company: CompanyContext;
  createdAt: number;
  lastSeen: number;
  listeners: Set<express.Response>;
  /** The company file this session had open when the row was saved; reopened on the next request after a restart. */
  pendingCompany: string | null;
  savedCompany: string | null;
  persistedAt: number;
}
const sessions = new Map<string, Session>();
const sessionContext = new AsyncLocalStorage<Session>();
let nextSessionId = 1;
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('base64url');
const cleaned = purgeSessions();
if (cleaned) console.log(`[web] removed ${cleaned} expired sessions`);

function buildSession(token: string, user: WebUser, org: Org, pendingCompany: string | null): Session {
  const s: Session = { id: nextSessionId++, token, user, org, company: { connection: null }, createdAt: Date.now(), lastSeen: Date.now(), listeners: new Set(), pendingCompany, savedCompany: pendingCompany, persistedAt: Date.now() };
  sessions.set(token, s);
  runWithAccessSession(s.id, () => { setAccessIdentity({ key: `web:${user.id}`, name: user.name, email: user.email }); applySeatAccess(user.seatType); });
  return s;
}

function newSession(user: WebUser, org: Org): Session {
  const token = crypto.randomBytes(32).toString('base64url');
  saveSession(hashToken(token), user.id);
  return buildSession(token, user, org, null);
}

/** After a restart (or after an idle session was dropped from memory) the cookie still names a
 * saved session: rebuild it from the row and reopen its company on the next request. */
function restoreSession(token: string): Session | null {
  const row = findSession(hashToken(token));
  if (!row) return null;
  const user = getUser(row.userId);
  const org = user ? getOrg(user.orgId) : null;
  if (!user || !user.isActive || !org) { deleteSession(hashToken(token)); return null; }
  const pending = row.companyPath && fs.existsSync(row.companyPath) ? row.companyPath : null;
  return buildSession(token, user, org, pending);
}

/** Writes last-seen and the open company to the row, at most every few minutes unless the company changed. */
function persistSession(s: Session, force = false): void {
  const open = runWithCompanyContext(s.company, () => getCurrentFilePath()) ?? s.pendingCompany;
  const changed = open !== s.savedCompany;
  if (!force && !changed && Date.now() - s.persistedAt < 5 * 60_000) return;
  touchSession(hashToken(s.token), open);
  s.savedCompany = open;
  s.persistedAt = Date.now();
}

async function reopenPendingCompany(s: Session): Promise<void> {
  const file = s.pendingCompany;
  if (!file) return;
  s.pendingCompany = null;
  try {
    await runWithCompanyContext(s.company, () => openCompany(new BrowserWindow() as never, file));
  } catch (e) {
    console.warn('[web] could not reopen', file, e instanceof Error ? e.message : e);
  }
}

function readCookie(req: express.Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const PAUSED_MESSAGE = 'Sign-in is paused for a short time while we complete a check. Please try again later.';
function sessionOf(req: express.Request): Session | null {
  const token = readCookie(req, 'apex_session');
  if (!token || !/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const s = sessions.get(token) ?? restoreSession(token);
  if (s && !s.org.isPlatform && signInPaused()) { endSession(s, true); return null; }
  if (s) { s.lastSeen = Date.now(); persistSession(s); }
  return s;
}

/** Drops a session from memory (closing its company) and, when signing out, from the store too. */
function endSession(s: Session, forget: boolean): void {
  if (!forget) persistSession(s, true);
  runWithCompanyContext(s.company, () => { try { closeCompany(); } catch { /* already closed */ } });
  clearAccessSession(s.id);
  for (const res of s.listeners) res.end();
  sessions.delete(s.token);
  if (forget) deleteSession(hashToken(s.token));
}

/** Idle sessions close their company and leave memory after two hours; the person is still
 * signed in and comes back to the same company on their next request. */
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const s of [...sessions.values()]) if (s.lastSeen < cutoff) endSession(s, false);
}, 60_000).unref();

function sendToSession(s: Session, channel: string, payload: unknown): void {
  const line = `event: ${channel}\ndata: ${JSON.stringify(payload ?? null)}\n\n`;
  for (const res of s.listeners) res.write(line);
}

// On the web the licence is the organisation's seats; every handler sees a licensed install.
WEB_LICENSE.status = { licensed: true, customer: 'Apex Ledger web', expires: null, edition: 'full', plan: null, seats: null };

// The handlers register themselves into the stub's registry, exactly as they would into ipcMain.
registerIpcHandlers(new BrowserWindow() as never);
// Window-level sends (company:changed after an open) reach the session that made the request.
(globalThis as { __apexSend?: (channel: string, payload: unknown) => void }).__apexSend = (channel, payload) => {
  const s = sessionContext.getStore();
  if (s) sendToSession(s, channel, payload);
};
// Desktop broadcasts (data:changed) reach every session on the same organisation's books.
setBroadcastSink((channel, payload) => {
  const from = sessionContext.getStore();
  const file = from ? runWithCompanyContext(from.company, () => getCurrentFilePath()) : null;
  for (const s of sessions.values()) {
    if (!from || s === from || (file && runWithCompanyContext(s.company, () => getCurrentFilePath()) === file)) sendToSession(s, channel, payload);
  }
});

/** Channels the web answers itself, where the desktop would open a file dialog. */
const overrides: Record<string, (s: Session, args: unknown[]) => Promise<unknown>> = {
  // The seat decides the role on the web; a screen asking for another role gets the seat's role back.
  'access:setRole': async (s) => (s.user.seatType === 'full' ? applySeatAccess('full') : getAccessRole()),
  'company:listRecent': async (s) => {
    const dir = companiesDirFor(s.org);
    fs.mkdirSync(dir, { recursive: true });
    return fs.readdirSync(dir).filter((f) => f.endsWith('.company')).sort().map((f) => path.join(dir, f));
  },
  'company:create': async (s, args) => {
    const payload = companyCreateSchema.parse(args[0]);
    const dir = companiesDirFor(s.org);
    fs.mkdirSync(dir, { recursive: true });
    const safe = payload.legalName.replace(/[<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim();
    const filePath = path.join(dir, `${safe}.company`);
    const result = await createCompanyAt(filePath, payload);
    await seedFirmServices(getCurrentDb(), payload.businessType);
    sendToSession(s, 'company:changed', { filePath: result.filePath });
    return { created: true, filePath: result.filePath, company: await companyGet() };
  },
  'company:open': async (s, args) => {
    const requested = typeof args[0] === 'string' ? args[0] : null;
    const dir = path.resolve(companiesDirFor(s.org));
    if (!requested) throw new Error('Choose a company from the list.');
    const target = path.resolve(requested);
    if (!target.toLowerCase().startsWith(dir.toLowerCase())) throw new Error('That company does not belong to your organisation.');
    const result = await openCompany(new BrowserWindow() as never, target);
    if (!result) throw new Error('That company could not be opened.');
    sendToSession(s, 'company:changed', { filePath: result.filePath });
    return { opened: true, filePath: result.filePath, company: await companyGet() };
  },
  'license:status': async (s) => ({ licensed: true, customer: s.org.name, expires: null, edition: 'full', plan: null, seats: s.org.isPlatform ? null : s.org.seats }),
  'license:activate': async () => { throw new Error('On the web, seats are managed by your organisation; no key is needed.'); },
  'company:installDemo': async () => { throw new Error('The demo company is on the desktop app. On the web, create a company or ask your administrator to upload one.'); },
  'company:installTestCompany': async () => { throw new Error('The test company is on the desktop app.'); },
};

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
// Browser-side guard rails on every answer: scripts only from this origin, no framing by other
// sites, no content sniffing. The web bundle has no inline scripts, so the policy is strict.
const CSP = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:", "connect-src 'self'", "media-src 'self' blob:", "worker-src 'self' blob:", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join('; ');
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)');
  next();
});
// For a monitor or load balancer: no sign-in, no details beyond "up" and the version.
app.get('/api/health', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ ok: true, data: { status: 'ok', version: process.env.APEX_VERSION ?? null, uptimeSeconds: Math.round(process.uptime()) } }); });
app.use(express.json({ limit: '50mb' }));
// A body that is not JSON (or too large) gets a JSON answer, not Express's HTML stack trace.
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!err) { next(); return; }
  const e = err as { type?: string; status?: number; message?: string };
  res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 400).json({ ok: false, error: e.type === 'entity.too.large' ? 'That request is too large.' : 'The request body could not be read.' });
});

// ---- trial requests from the public website ----
// The marketing site lives on another host, so this one route answers cross-origin for it.
const SITE_ORIGINS = new Set((process.env.APEX_SITE_ORIGINS ?? 'https://apexledger.ca,https://www.apexledger.ca').split(',').map((o) => o.trim()).filter(Boolean));
function siteCors(req: express.Request, res: express.Response): void {
  const origin = String(req.headers.origin ?? '');
  if (SITE_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
}
app.options('/api/trial-request', (req, res) => { siteCors(req, res); res.status(204).end(); });
app.options('/api/site-feedback', (req, res) => { siteCors(req, res); res.status(204).end(); });
app.options('/api/site-chat', (req, res) => { siteCors(req, res); res.status(204).end(); });
app.options('/api/site-chat/handoff', (req, res) => { siteCors(req, res); res.status(204).end(); });
// The question-and-answer assistant on the website (see siteChat.ts). Off until APEX_ANTHROPIC_API_KEY is set.
const chatLimiter = new IpLimiter(30, 10 * 60 * 1000);
app.post('/api/site-chat', async (req, res) => {
  siteCors(req, res);
  const apiKey = (process.env.APEX_ANTHROPIC_API_KEY ?? '').trim();
  if (!chatLimiter.allow(req.ip ?? 'unknown')) { res.status(429).json({ ok: false, error: 'That is a lot of questions in a short time. Email admin@apexledger.ca and we will answer.' }); return; }
  let turns;
  try { turns = limitTurns((req.body ?? {}).messages); } catch (e) { res.status(400).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); return; }
  if (!apiKey) {
    // No outside service: the answer is a passage quoted from the website itself.
    const a = answerFromSite(turns[turns.length - 1].content, SITE_KNOWLEDGE);
    console.log(`[site-chat] ${req.ip} q="${turns[turns.length - 1].content.slice(0, 80)}" local handoff=${a.handoff}`);
    res.json({ ok: true, data: { configured: true, ...a } });
    return;
  }
  try {
    const a = await answerSiteQuestion(turns, { apiKey, model: (process.env.APEX_CHAT_MODEL ?? '').trim() || undefined });
    console.log(`[site-chat] ${req.ip} q="${turns[turns.length - 1].content.slice(0, 80)}" handoff=${a.handoff}`);
    res.json({ ok: true, data: { configured: true, ...a } });
  } catch (e) {
    console.error(`[site-chat] ${e instanceof Error ? e.message : String(e)}`);
    res.status(502).json({ ok: false, error: 'The assistant is unavailable right now. Leave your question and we will answer by email.' });
  }
});
app.post('/api/site-chat/handoff', (req, res) => {
  siteCors(req, res);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const transcript = Array.isArray(body.transcript) ? (body.transcript as { role?: unknown; content?: unknown }[]).filter((t) => typeof t.content === 'string').map((t) => `${t.role === 'assistant' ? 'Assistant' : 'Visitor'}: ${String(t.content).slice(0, 600)}`).join('\n') : '';
  const question = String(body.question ?? '').trim().slice(0, 2000);
  const message = transcript ? `${question}\n\n--- conversation with the assistant ---\n${transcript}` : question;
  const r = wrap(() => { const n = createSiteFeedback({ name: body.name, email: body.email, page: `Website chat ${String(body.page ?? '')}`.trim(), message }, req.ip ?? null); console.log(`[site-chat] hand-off from ${n.userName} <${n.email}>`); notifySiteQuestion(n); return { received: true }; });
  res.status(r.ok ? 200 : 400).json(r);
});
app.post('/api/site-feedback', (req, res) => {
  siteCors(req, res);
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (String(body.website ?? '').trim()) { res.json({ ok: true, data: { received: true } }); return; }
  const r = wrap(() => { const n = createSiteFeedback(body, req.ip ?? null); console.log(`[site-feedback] ${n.userName} <${n.email}>: ${n.message.slice(0, 120)}`); return { received: true }; });
  res.status(r.ok ? 200 : 400).json(r);
});
app.post('/api/trial-request', (req, res) => {
  siteCors(req, res);
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (String(body.website ?? '').trim()) { res.json({ ok: true, data: { received: true } }); return; } // honeypot field: bots fill it, people never see it
  const r = wrap(() => { const t = createTrialRequest(body, req.ip ?? null); console.log(`[trial] ${t.firm} <${t.email}> ${t.edition} x${t.seats}`); notifyTrialRequest(t); return { received: true }; });
  res.status(r.ok ? 200 : 400).json(r);
});
app.get('/api/admin/trial-requests', (req, res) => { const s = requirePlatform(req, res); if (!s || !s.org.isPlatform) { if (s) res.status(403).json({ ok: false, error: 'Platform administrator only.' }); return; } res.json(wrap(() => listTrialRequests())); });
app.post('/api/admin/trial-requests/:id/status', (req, res) => { const s = requirePlatform(req, res); if (!s || !s.org.isPlatform) { if (s) res.status(403).json({ ok: false, error: 'Platform administrator only.' }); return; } res.json(wrap(() => setTrialRequestStatus(Number(req.params.id), (req.body ?? {}).status === 'done' ? 'done' : 'new'))); });

// ---- feedback from the Feedback button ----
app.post('/api/feedback', (req, res) => {
  const s = sessionOf(req);
  if (!s) { res.status(401).json({ ok: false, error: 'Please sign in.' }); return; }
  const r = wrap(() => { const n = createFeedback(s.user, s.org, (req.body ?? {}) as { message?: unknown; page?: unknown }); console.log(`[feedback] ${n.orgName} / ${n.userName} on ${n.page}: ${n.message.slice(0, 120)}`); return { received: true }; });
  res.status(r.ok ? 200 : 400).json(r);
});
app.get('/api/admin/feedback', (req, res) => { const s = requirePlatform(req, res); if (!s) return; res.json(wrap(() => listFeedback(s.org.isPlatform ? undefined : s.org.id))); });
app.post('/api/admin/feedback/:id/status', (req, res) => { const s = requirePlatform(req, res); if (!s || !s.org.isPlatform) { if (s) res.status(403).json({ ok: false, error: 'Platform administrator only.' }); return; } res.json(wrap(() => setFeedbackStatus(Number(req.params.id), (req.body ?? {}).status === 'done' ? 'done' : 'new'))); });

app.post('/api/login', (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  const ip = req.ip ?? null;
  if (recentFailures(ip) >= 8) { res.status(429).json({ ok: false, error: 'Too many failed sign-ins. Try again in 15 minutes.' }); return; }
  const user = email && password ? authenticate(email, password, ip) : null;
  if (!user) { res.status(401).json({ ok: false, error: 'Wrong email or password.' }); return; }
  const org = getOrg(user.orgId)!;
  if (!org.isPlatform && signInPaused()) { res.status(403).json({ ok: false, error: PAUSED_MESSAGE }); return; }
  const s = newSession(user, org);
  res.setHeader('Set-Cookie', sessionCookie(req, s));
  res.json({ ok: true, data: { sessionId: s.id, user: { name: user.name, email: user.email, role: user.role, seatType: user.seatType, accessRole: SEAT_ACCESS[user.seatType].role, agreementAccepted: Boolean(user.agreedAt) || org.isPlatform }, org: { name: org.name, seats: org.seats, isPlatform: org.isPlatform } } });
});

// ---- sign in with Microsoft or Google ----
// The browser is sent to the provider with a random state and nonce kept in a short-lived cookie;
// the provider sends it back with a code; the code becomes an ID token, checked in oidc.ts; the
// email in it must belong to an active person here. Errors go back to the sign-in page as text.
const providers = providersFromEnv(process.env);
if (providers.length) console.log('[web] sign in with:', providers.map((p) => p.label).join(', '));
const sessionCookie = (req: express.Request, s: Session) => `apex_session=${s.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}${req.secure ? '; Secure' : ''}`;
function publicOrigin(req: express.Request): string {
  const configured = (process.env.APEX_PUBLIC_URL ?? '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  return `${req.secure ? 'https' : 'http'}://${req.headers.host ?? 'localhost'}`;
}
const toSignIn = (res: express.Response, error: string) => res.redirect(`/?signin=${encodeURIComponent(error)}`);
app.get('/api/auth/options', (_req, res) => { res.json({ ok: true, data: { providers: providers.map((p) => ({ id: p.id, label: p.label })) } }); });
app.get('/api/auth/:provider', (req, res) => {
  const p = providers.find((x) => x.id === req.params.provider);
  if (!p) { res.status(404).json({ ok: false, error: 'That sign-in method is not set up on this server.' }); return; }
  const state = crypto.randomBytes(16).toString('base64url');
  const nonce = crypto.randomBytes(16).toString('base64url');
  res.setHeader('Set-Cookie', `apex_oauth=${p.id}.${state}.${nonce}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=600${req.secure ? '; Secure' : ''}`);
  res.redirect(authorizeUrl(p, `${publicOrigin(req)}/api/auth/${p.id}/callback`, state, nonce));
});
app.get('/api/auth/:provider/callback', async (req, res) => {
  const p = providers.find((x) => x.id === req.params.provider);
  if (!p) { toSignIn(res, 'That sign-in method is not set up on this server.'); return; }
  const clear = `apex_oauth=; Max-Age=0; Path=/api/auth`;
  try {
    const [cookieProvider, state, nonce] = (readCookie(req, 'apex_oauth') ?? '').split('.');
    if (cookieProvider !== p.id || !state || !nonce || String(req.query.state ?? '') !== state) throw new Error('The sign-in did not start from this browser. Please try again.');
    if (req.query.error) throw new Error(String(req.query.error_description ?? req.query.error));
    const code = String(req.query.code ?? '');
    if (!code) throw new Error(`${p.label} did not return a sign-in code.`);
    const idToken = await exchangeCode(p, code, `${publicOrigin(req)}/api/auth/${p.id}/callback`);
    const claims = verifyIdToken(idToken, await signingKeys(p), { clientId: p.clientId, nonce, issuerOk: p.issuerOk });
    const ip = req.ip ?? null;
    if (recentFailures(ip) >= 8) throw new Error('Too many failed sign-ins. Try again in 15 minutes.');
    const user = signInByVerifiedEmail(claims.email, p.id, ip);
    if (!user) throw new Error(`${claims.email} has no seat here yet. Ask your organisation's owner to add you with this email, then sign in with ${p.label} again.`);
    const org = getOrg(user.orgId)!;
    if (!org.isPlatform && signInPaused()) throw new Error(PAUSED_MESSAGE);
    const s = newSession(user, org);
    res.setHeader('Set-Cookie', [clear, sessionCookie(req, s)]);
    res.redirect('/');
  } catch (e) {
    res.setHeader('Set-Cookie', clear);
    toSignIn(res, e instanceof Error ? e.message : String(e));
  }
});

// ---- the subscription agreement: accepted once per person before the books open ----
app.post('/api/me/agree', (req, res) => {
  const s = sessionOf(req);
  if (!s) { res.status(401).json({ ok: false, error: 'Please sign in.' }); return; }
  res.json(wrap(() => { s.user = recordAgreement(s.user.id, String((req.body ?? {}).name ?? '')); console.log(`[agreement] ${s.user.email} accepted at ${s.user.agreedAt} signed ${s.user.agreedName}`); return { agreedAt: s.user.agreedAt, agreedName: s.user.agreedName }; }));
});

app.post('/api/logout', (req, res) => {
  const s = sessionOf(req);
  if (s) endSession(s, true);
  res.setHeader('Set-Cookie', 'apex_session=; Max-Age=0; Path=/');
  res.json({ ok: true, data: null });
});

app.get('/api/session', (req, res) => {
  const s = sessionOf(req);
  res.json({ ok: true, data: s ? { signedIn: true, user: { name: s.user.name, email: s.user.email, role: s.user.role, seatType: s.user.seatType, accessRole: SEAT_ACCESS[s.user.seatType].role, agreementAccepted: Boolean(s.user.agreedAt) || s.org.isPlatform }, org: { name: s.org.name, seats: s.org.seats, isPlatform: s.org.isPlatform } } : { signedIn: false } });
});

app.get('/api/events', (req, res) => {
  const s = sessionOf(req);
  if (!s) { res.status(401).end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(': connected\n\n');
  s.listeners.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => { clearInterval(ping); s.listeners.delete(res); });
});

// ---- platform administration: organisations, seats, people ----
function requirePlatform(req: express.Request, res: express.Response): Session | null {
  const s = sessionOf(req);
  if (!s) { res.status(401).json({ ok: false, error: 'Please sign in.' }); return null; }
  if (!s.org.isPlatform && s.user.role !== 'owner') { res.status(403).json({ ok: false, error: 'Only an organisation owner or the platform administrator can do this.' }); return null; }
  return s;
}
const wrap = (fn: () => unknown) => { try { return { ok: true, data: fn() }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } };
// ---- the administrator's subscriptions dashboard ----
function orgBillingRow(o: ReturnType<typeof listOrgs>[number], today: string) {
  const users = listUsers(o.id);
  const payments = listPayments(o.id);
  const billing = computeOrgBilling(o, users.map((u) => ({ seatType: u.seatType, isActive: u.isActive })), seatRates(), payments, today);
  let companies = 0;
  try { companies = fs.readdirSync(companiesDirFor(o)).filter((n) => n.endsWith('.company')).length; } catch { companies = 0; }
  const agreed = users.filter((u) => u.isActive && u.agreedAt).length;
  return { org: o, billing, people: users, payments, companies, agreedCount: agreed, activeCount: users.filter((u) => u.isActive).length, lastActivity: lastActivityFor(o.id) };
}
app.get('/api/admin/subscriptions', (req, res) => {
  const s = requirePlatform(req, res); if (!s) return;
  if (!s.org.isPlatform) { res.status(403).json({ ok: false, error: 'Platform administrator only.' }); return; }
  res.json(wrap(() => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = listOrgs().filter((o) => !o.isPlatform).map((o) => orgBillingRow(o, today));
    return { today, rates: seatRates(), totals: billingTotals(rows.map((r) => r.billing)), rows };
  }));
});
app.post('/api/admin/orgs/:id/billing', (req, res) => {
  const s = requirePlatform(req, res); if (!s || !s.org.isPlatform) { if (s) res.status(403).json({ ok: false, error: 'Platform administrator only.' }); return; }
  res.json(wrap(() => setOrgBilling(Number(req.params.id), (req.body ?? {}) as Record<string, unknown>)));
});
app.post('/api/admin/orgs/:id/payments', (req, res) => {
  const s = requirePlatform(req, res); if (!s || !s.org.isPlatform) { if (s) res.status(403).json({ ok: false, error: 'Platform administrator only.' }); return; }
  res.json(wrap(() => addPayment(Number(req.params.id), (req.body ?? {}) as Record<string, unknown>)));
});
app.post('/api/admin/payments/:id/delete', (req, res) => {
  const s = requirePlatform(req, res); if (!s || !s.org.isPlatform) { if (s) res.status(403).json({ ok: false, error: 'Platform administrator only.' }); return; }
  res.json(wrap(() => { deletePayment(Number(req.params.id)); return { deleted: true }; }));
});
app.get('/api/admin/orgs', (req, res) => { const s = requirePlatform(req, res); if (!s) return; res.json(wrap(() => (s.org.isPlatform ? listOrgs() : [s.org]).map((o) => ({ ...o, activeSeats: listUsers(o.id).filter((u) => u.isActive).length })))); });
app.post('/api/admin/orgs', (req, res) => { const s = requirePlatform(req, res); if (!s || !s.org.isPlatform) { if (s) res.status(403).json({ ok: false, error: 'Platform administrator only.' }); return; } res.json(wrap(() => { const b = (req.body ?? {}) as { name?: string; seats?: number; founding?: boolean }; if (b.founding && foundingFirmsCount() >= FOUNDING.maxFirms) throw new Error(`All ${FOUNDING.maxFirms} founding-firm places are taken.`); return createOrg({ name: String(b.name ?? ''), seats: b.seats, founding: Boolean(b.founding) }); })); });
app.get('/api/admin/signin-pause', (req, res) => { const s = requirePlatform(req, res); if (!s) return; res.json({ ok: true, data: { paused: signInPaused() } }); });
app.post('/api/admin/signin-pause', (req, res) => {
  const s = requirePlatform(req, res); if (!s || !s.org.isPlatform) { if (s) res.status(403).json({ ok: false, error: 'Platform administrator only.' }); return; }
  const paused = Boolean((req.body ?? {}).paused);
  setSetting('signin_paused', paused ? '1' : '0');
  let ended = 0;
  if (paused) { for (const x of [...sessions.values()]) if (!x.org.isPlatform) { endSession(x, true); ended++; } ended += deleteSessionsOfNonPlatformUsers(); }
  console.log(`[web] sign-in ${paused ? 'PAUSED' : 'resumed'} by ${s.user.email}${paused ? `, ${ended} firm sessions ended` : ''}`);
  res.json({ ok: true, data: { paused, ended } });
});
app.get('/api/admin/founding', (req, res) => { const s = requirePlatform(req, res); if (!s) return; res.json({ ok: true, data: { ...FOUNDING, used: foundingFirmsCount() } }); });
app.post('/api/admin/orgs/:id/founding', (req, res) => { const s = requirePlatform(req, res); if (!s || !s.org.isPlatform) { if (s) res.status(403).json({ ok: false, error: 'Platform administrator only.' }); return; } res.json(wrap(() => { const on = Boolean((req.body ?? {}).on); if (on && foundingFirmsCount() >= FOUNDING.maxFirms) throw new Error(`All ${FOUNDING.maxFirms} founding-firm places are taken.`); return setOrgFounding(Number(req.params.id), on); })); });
app.post('/api/admin/orgs/:id/seats', (req, res) => { const s = requirePlatform(req, res); if (!s || !s.org.isPlatform) { if (s) res.status(403).json({ ok: false, error: 'Platform administrator only.' }); return; } res.json(wrap(() => updateOrgSeats(Number(req.params.id), Number((req.body ?? {}).seats)))); });
app.get('/api/admin/users', (req, res) => { const s = requirePlatform(req, res); if (!s) return; res.json(wrap(() => listUsers(s.org.isPlatform ? undefined : s.org.id))); });
app.post('/api/admin/users', (req, res) => {
  const s = requirePlatform(req, res); if (!s) return;
  const body = (req.body ?? {}) as { orgId?: number; email?: string; name?: string; password?: string; role?: 'owner' | 'member'; seatType?: SeatType };
  const orgId = s.org.isPlatform ? Number(body.orgId ?? s.org.id) : s.org.id;
  res.json(wrap(() => createUser({ orgId, email: body.email ?? '', name: body.name ?? '', password: body.password ?? '', role: body.role, seatType: body.seatType })));
});
// Seat types and their monthly rates: the platform administrator sets the rates; an owner may
// change the type of their own people (it changes what the firm is billed).
app.get('/api/admin/seat-rates', (req, res) => { const s = requirePlatform(req, res); if (!s) return; res.json(wrap(() => seatRates())); });
app.post('/api/admin/seat-rates', (req, res) => { const s = requirePlatform(req, res); if (!s || !s.org.isPlatform) { if (s) res.status(403).json({ ok: false, error: 'Platform administrator only.' }); return; } const b = (req.body ?? {}) as { seatType?: SeatType; dollars?: number }; res.json(wrap(() => setSeatRate(b.seatType as SeatType, Math.round(Number(b.dollars) * 100)))); });
app.post('/api/admin/users/:id/seat-type', (req, res) => { const s = requirePlatform(req, res); if (!s) return; res.json(wrap(() => { const u = listUsers().find((x) => x.id === Number(req.params.id)); if (!u || (!s.org.isPlatform && u.orgId !== s.org.id)) throw new Error('Person not found.'); return setUserSeatType(u.id, (req.body ?? {}).seatType as SeatType); })); });
app.post('/api/admin/users/:id/active', (req, res) => { const s = requirePlatform(req, res); if (!s) return; res.json(wrap(() => { const u = listUsers().find((x) => x.id === Number(req.params.id)); if (!u || (!s.org.isPlatform && u.orgId !== s.org.id)) throw new Error('Person not found.'); return setUserActive(u.id, Boolean((req.body ?? {}).active)); })); });
app.post('/api/admin/users/:id/password', (req, res) => { const s = requirePlatform(req, res); if (!s) return; res.json(wrap(() => { const u = listUsers().find((x) => x.id === Number(req.params.id)); if (!u || (!s.org.isPlatform && u.orgId !== s.org.id)) throw new Error('Person not found.'); setUserPassword(u.id, String((req.body ?? {}).password ?? '')); return true; })); });
app.post('/api/me/password', (req, res) => { const s = sessionOf(req); if (!s) { res.status(401).json({ ok: false, error: 'Please sign in.' }); return; } res.json(wrap(() => { setUserPassword(s.user.id, String((req.body ?? {}).password ?? '')); return true; })); });

// ---- downloads: a file a handler "saved" through the stub dialog, streamed once to the browser ----
/** A download belongs to the session whose request produced it; nobody else can fetch it. */
const downloadOwner = new Map<string, number>();
app.get('/api/download/:file', (req, res) => {
  const s = sessionOf(req);
  if (!s) { res.status(401).end(); return; }
  const file = path.basename(req.params.file);
  if (downloadOwner.get(file) !== s.id) { res.status(404).json({ ok: false, error: 'That download is not yours or has expired.' }); return; }
  downloadOwner.delete(file);
  const full = path.join(DOWNLOAD_DIR, file);
  if (!full.startsWith(DOWNLOAD_DIR) || !fs.existsSync(full)) { res.status(404).end(); return; }
  const shown = file.includes('__') ? file.slice(file.indexOf('__') + 2) : file;
  res.setHeader('Content-Disposition', `attachment; filename="${shown.replace(/"/g, '')}"`);
  res.sendFile(full, (err) => { if (!err) fs.rm(full, { force: true }, () => undefined); });
});

/** A handler result that names a file under the downloads folder becomes a download link. */
function asDownload(result: unknown, owner?: Session): unknown {
  const r = result as { ok?: boolean; data?: { filePath?: unknown } } | null;
  const fp = r && r.ok && r.data && typeof r.data === 'object' ? r.data.filePath : undefined;
  if (typeof fp !== 'string' || !path.resolve(fp).startsWith(DOWNLOAD_DIR)) return result;
  const file = path.basename(fp);
  if (owner) downloadOwner.set(file, owner.id);
  return { ...r, data: { ...(r!.data as object), filePath: `/api/download/${encodeURIComponent(file)}`, download: true, fileName: file.includes('__') ? file.slice(file.indexOf('__') + 2) : file } };
}

// ---- company files: upload an existing .company, download a copy ----
// An owner (or the platform administrator, for any organisation) can bring a company file made on
// the desktop or in another organisation into their folder, and take a consistent copy out again.
// Uploads must be real SQLite files with the .company extension; a name already in the folder is
// refused unless ?replace=1, and a file that a session currently has open is never replaced.
const SQLITE_HEADER = 'SQLite format 3\u0000';
function orgForFiles(s: Session, req: express.Request): Org {
  const requested = Number(req.query.org ?? s.org.id);
  if (!s.org.isPlatform && requested !== s.org.id) throw new Error('That organisation is not yours.');
  const org = getOrg(requested);
  if (!org) throw new Error('Organisation not found.');
  return org;
}
function safeCompanyName(name: string): string {
  const base = path.basename(name).replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const withExt = base.toLowerCase().endsWith('.company') ? base : `${base}.company`;
  if (withExt.length < 9 || withExt.startsWith('.')) throw new Error('Give the file a name, ending in .company.');
  return withExt;
}
function isOpenAnywhere(filePath: string): boolean {
  for (const other of sessions.values()) {
    const open = runWithCompanyContext(other.company, () => getCurrentFilePath());
    if (open && path.resolve(open).toLowerCase() === path.resolve(filePath).toLowerCase()) return true;
  }
  return false;
}
app.get('/api/org/companies', (req, res) => {
  const s = requirePlatform(req, res); if (!s) return;
  res.json(wrap(() => {
    const org = orgForFiles(s, req);
    const dir = companiesDirFor(org);
    fs.mkdirSync(dir, { recursive: true });
    return fs.readdirSync(dir).filter((f) => f.endsWith('.company')).sort().map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { name: f, bytes: st.size, modified: st.mtime.toISOString(), open: isOpenAnywhere(path.join(dir, f)) };
    });
  }));
});
app.put('/api/org/companies', express.raw({ type: () => true, limit: '2gb' }), (req, res) => {
  const s = requirePlatform(req, res); if (!s) return;
  res.json(wrap(() => {
    const org = orgForFiles(s, req);
    const name = safeCompanyName(decodeURIComponent(String(req.headers['x-file-name'] ?? '')));
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (body.length < 512 || body.subarray(0, 16).toString('latin1') !== SQLITE_HEADER) throw new Error('That is not an Apex Ledger company file.');
    const dir = companiesDirFor(org);
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, name);
    if (fs.existsSync(target)) {
      if (String(req.query.replace ?? '') !== '1') throw new Error(`${name} is already in ${org.name}. Tick "replace" to overwrite it, or rename the file first.`);
      if (isOpenAnywhere(target)) throw new Error(`${name} is open right now. Ask everyone to close it, then try again.`);
      for (const suffix of ['-wal', '-shm']) fs.rmSync(`${target}${suffix}`, { force: true });
    }
    fs.writeFileSync(`${target}.uploading`, body);
    fs.renameSync(`${target}.uploading`, target);
    return { name, bytes: body.length, org: org.name };
  }));
});
app.get('/api/org/companies/download', async (req, res) => {
  const s = requirePlatform(req, res); if (!s) return;
  try {
    const org = orgForFiles(s, req);
    const name = safeCompanyName(String(req.query.name ?? ''));
    const source = path.join(companiesDirFor(org), name);
    if (!fs.existsSync(source)) { res.status(404).json({ ok: false, error: 'Company file not found.' }); return; }
    // A consistent copy even while someone has it open: SQLite's online backup folds in the WAL.
    const copy = path.join(DOWNLOAD_DIR, `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}__${name}`);
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(source, { readonly: true });
    try { await db.backup(copy); } finally { db.close(); }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
    res.sendFile(copy, (err) => { if (!err) fs.rm(copy, { force: true }, () => undefined); });
  } catch (e) {
    res.status(400).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// ---- uploads: the browser's side of a file picker ----
// The screen sends each chosen file here first (raw body, name in a header) and gets a token; the
// request that follows names the tokens, and the stub's file picker hands the handler those files.
// Files live only for that one request, in a folder per session, and are removed afterwards.
const uploadDirFor = (s: Session) => path.join(UPLOAD_DIR, `s${s.id}`);
app.put('/api/upload', express.raw({ type: () => true, limit: '200mb' }), (req, res) => {
  const s = sessionOf(req);
  if (!s) { res.status(401).json({ ok: false, error: 'Please sign in.' }); return; }
  const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'upload')).replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').slice(-180) || 'upload';
  const token = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
  // One folder per file so the handler sees the file under its own name, as a dialog would give it.
  const dir = path.join(uploadDirFor(s), token);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
  res.json({ ok: true, data: { token } });
});
function uploadedFiles(s: Session, tokens: unknown): string[] {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];
  const base = uploadDirFor(s);
  return tokens.flatMap((t) => {
    const dir = path.join(base, String(t).replace(/[^a-z0-9-]/gi, ''));
    if (!dir.startsWith(base) || !fs.existsSync(dir)) return [];
    const n = fs.readdirSync(dir)[0];
    return n ? [path.join(dir, n)] : [];
  });
}

// ---- the application itself ----
app.post('/api/:channel', async (req, res) => {
  const s = sessionOf(req);
  if (!s) { res.status(401).json({ ok: false, error: 'Please sign in.' }); return; }
  const channel = req.params.channel;
  if (!s.org.isPlatform && !s.user.agreedAt) { res.json({ ok: false, error: 'Please accept the subscription agreement first.' }); return; }
  if (!seatAllowsChannel(s.user.seatType, channel)) { res.json({ ok: false, error: `Your ${SEAT_LABELS[s.user.seatType]} seat does not include this part of Apex Ledger. Ask your organisation's owner if you need it.` }); return; }
  const args = Array.isArray((req.body ?? {}).args) ? (req.body.args as unknown[]) : [];
  const files = uploadedFiles(s, (req.body ?? {}).uploads);
  res.on('finish', () => { for (const f of files) fs.rm(path.dirname(f), { recursive: true, force: true }, () => undefined); });
  if (s.pendingCompany) await reopenPendingCompany(s);
  const opened: { filePath?: string } = {};
  try {
    let result = await downloadContext.run(opened, () => uploadContext.run(files, () => sessionContext.run(s, () => runWithCompanyContext(s.company, () => runWithAccessSession(s.id, async () => {
      const override = overrides[channel];
      if (override) { try { return { ok: true, data: await override(s, args) }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } }
      const handler = handlerRegistry.get(channel);
      if (!handler) return { ok: false, error: `Unknown request: ${channel}` };
      return handler({ sender: { id: s.id } }, ...args);
    })))));
    // A handler that "opened" a file on the web has copied it for download: hand the link back.
    const r = result as { ok?: boolean; data?: unknown } | null;
    if (opened.filePath && r && r.ok) result = { ...r, data: { ...(r.data && typeof r.data === 'object' ? (r.data as object) : {}), filePath: opened.filePath } };
    const filtered = result as { ok?: boolean; data?: unknown } | null;
    if (filtered && filtered.ok) result = { ...filtered, data: filterResultForSeat(s.user.seatType, channel, filtered.data) };
    res.json(asDownload(result, s) ?? { ok: true, data: null });
    if (channel.startsWith('company:')) persistSession(s);
  } catch (error) {
    res.json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

// The browser build of the same screens.
if (fs.existsSync(STATIC_DIR)) {
  // Hashed assets can be cached for a long time; the page itself never, so a new build shows on the next load.
  app.use(express.static(STATIC_DIR, { index: false, maxAge: '30d', setHeaders: (res, file) => { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.get(/^(?!\/api\/).*/, (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(STATIC_DIR, 'index.html')); });
} else {
  app.get('/', (_req, res) => res.status(503).send('The web build is missing. Run: npm run build:web'));
}

app.listen(PORT, () => {
  console.log(`[web] Apex Ledger listening on http://localhost:${PORT}  data: ${DATA_DIR}  organisations: ${listOrgs().length}  handlers: ${handlerRegistry.size}`);
});
