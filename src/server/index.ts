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
 */
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';
import { handlerRegistry, BrowserWindow, DOWNLOAD_DIR, UPLOAD_DIR, uploadContext } from './electronStub';
import { authenticate, bootstrap, companiesDirFor, createOrg, createUser, getOrg, listOrgs, listUsers, openAdminStore, recentFailures, setUserActive, setUserPassword, updateOrgSeats, type Org, type WebUser } from './admin';
import { registerIpcHandlers } from '../main/ipc/registerHandlers';
import { runWithAccessSession, clearAccessSession, setAccessIdentity } from '../main/accessSession';
import { runWithCompanyContext, type CompanyContext, closeCompany, createCompanyAt, openCompany, getCurrentFilePath } from '../main/companyFile';
import { setBroadcastSink } from '../main/windows';
import { companyGet } from '../main/ipc/company.handlers';
import { seedFirmServices } from '../main/db/seeds/firmServices.seed';
import { getCurrentDb } from '../main/companyFile';
import { companyCreateSchema } from '@shared/validation/schemas';
import { WEB_LICENSE } from '../main/licensing/license';

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
}
const sessions = new Map<string, Session>();
const sessionContext = new AsyncLocalStorage<Session>();
let nextSessionId = 1;

function newSession(user: WebUser, org: Org): Session {
  const token = crypto.randomBytes(32).toString('base64url');
  const s: Session = { id: nextSessionId++, token, user, org, company: { connection: null }, createdAt: Date.now(), lastSeen: Date.now(), listeners: new Set() };
  sessions.set(token, s);
  return s;
}

function readCookie(req: express.Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function sessionOf(req: express.Request): Session | null {
  const token = readCookie(req, 'apex_session');
  const s = token ? sessions.get(token) ?? null : null;
  if (s) s.lastSeen = Date.now();
  return s;
}

function endSession(s: Session): void {
  runWithCompanyContext(s.company, () => { try { closeCompany(); } catch { /* already closed */ } });
  clearAccessSession(s.id);
  for (const res of s.listeners) res.end();
  sessions.delete(s.token);
}

/** Idle sessions close their company and go away after two hours. */
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const s of [...sessions.values()]) if (s.lastSeen < cutoff) endSession(s);
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
app.use(express.json({ limit: '50mb' }));

app.post('/api/login', (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  const ip = req.ip ?? null;
  if (recentFailures(ip) >= 8) { res.status(429).json({ ok: false, error: 'Too many failed sign-ins. Try again in 15 minutes.' }); return; }
  const user = email && password ? authenticate(email, password, ip) : null;
  if (!user) { res.status(401).json({ ok: false, error: 'Wrong email or password.' }); return; }
  const org = getOrg(user.orgId)!;
  const s = newSession(user, org);
  runWithAccessSession(s.id, () => setAccessIdentity({ key: `web:${user.id}`, name: user.name, email: user.email }));
  res.setHeader('Set-Cookie', `apex_session=${s.token}; HttpOnly; SameSite=Strict; Path=/${req.secure ? '; Secure' : ''}`);
  res.json({ ok: true, data: { sessionId: s.id, user: { name: user.name, email: user.email, role: user.role }, org: { name: org.name, seats: org.seats, isPlatform: org.isPlatform } } });
});

app.post('/api/logout', (req, res) => {
  const s = sessionOf(req);
  if (s) endSession(s);
  res.setHeader('Set-Cookie', 'apex_session=; Max-Age=0; Path=/');
  res.json({ ok: true, data: null });
});

app.get('/api/session', (req, res) => {
  const s = sessionOf(req);
  res.json({ ok: true, data: s ? { signedIn: true, user: { name: s.user.name, email: s.user.email, role: s.user.role }, org: { name: s.org.name, seats: s.org.seats, isPlatform: s.org.isPlatform } } : { signedIn: false } });
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
app.get('/api/admin/orgs', (req, res) => { const s = requirePlatform(req, res); if (!s) return; res.json(wrap(() => (s.org.isPlatform ? listOrgs() : [s.org]).map((o) => ({ ...o, activeSeats: listUsers(o.id).filter((u) => u.isActive).length })))); });
app.post('/api/admin/orgs', (req, res) => { const s = requirePlatform(req, res); if (!s || !s.org.isPlatform) { if (s) res.status(403).json({ ok: false, error: 'Platform administrator only.' }); return; } res.json(wrap(() => createOrg(req.body ?? {}))); });
app.post('/api/admin/orgs/:id/seats', (req, res) => { const s = requirePlatform(req, res); if (!s || !s.org.isPlatform) { if (s) res.status(403).json({ ok: false, error: 'Platform administrator only.' }); return; } res.json(wrap(() => updateOrgSeats(Number(req.params.id), Number((req.body ?? {}).seats)))); });
app.get('/api/admin/users', (req, res) => { const s = requirePlatform(req, res); if (!s) return; res.json(wrap(() => listUsers(s.org.isPlatform ? undefined : s.org.id))); });
app.post('/api/admin/users', (req, res) => {
  const s = requirePlatform(req, res); if (!s) return;
  const body = (req.body ?? {}) as { orgId?: number; email?: string; name?: string; password?: string; role?: 'owner' | 'member' };
  const orgId = s.org.isPlatform ? Number(body.orgId ?? s.org.id) : s.org.id;
  res.json(wrap(() => createUser({ orgId, email: body.email ?? '', name: body.name ?? '', password: body.password ?? '', role: body.role })));
});
app.post('/api/admin/users/:id/active', (req, res) => { const s = requirePlatform(req, res); if (!s) return; res.json(wrap(() => { const u = listUsers().find((x) => x.id === Number(req.params.id)); if (!u || (!s.org.isPlatform && u.orgId !== s.org.id)) throw new Error('Person not found.'); return setUserActive(u.id, Boolean((req.body ?? {}).active)); })); });
app.post('/api/admin/users/:id/password', (req, res) => { const s = requirePlatform(req, res); if (!s) return; res.json(wrap(() => { const u = listUsers().find((x) => x.id === Number(req.params.id)); if (!u || (!s.org.isPlatform && u.orgId !== s.org.id)) throw new Error('Person not found.'); setUserPassword(u.id, String((req.body ?? {}).password ?? '')); return true; })); });
app.post('/api/me/password', (req, res) => { const s = sessionOf(req); if (!s) { res.status(401).json({ ok: false, error: 'Please sign in.' }); return; } res.json(wrap(() => { setUserPassword(s.user.id, String((req.body ?? {}).password ?? '')); return true; })); });

// ---- downloads: a file a handler "saved" through the stub dialog, streamed once to the browser ----
app.get('/api/download/:file', (req, res) => {
  const s = sessionOf(req);
  if (!s) { res.status(401).end(); return; }
  const file = path.basename(req.params.file);
  const full = path.join(DOWNLOAD_DIR, file);
  if (!full.startsWith(DOWNLOAD_DIR) || !fs.existsSync(full)) { res.status(404).end(); return; }
  const shown = file.includes('__') ? file.slice(file.indexOf('__') + 2) : file;
  res.setHeader('Content-Disposition', `attachment; filename="${shown.replace(/"/g, '')}"`);
  res.sendFile(full, (err) => { if (!err) fs.rm(full, { force: true }, () => undefined); });
});

/** A handler result that names a file under the downloads folder becomes a download link. */
function asDownload(result: unknown): unknown {
  const r = result as { ok?: boolean; data?: { filePath?: unknown } } | null;
  const fp = r && r.ok && r.data && typeof r.data === 'object' ? r.data.filePath : undefined;
  if (typeof fp !== 'string' || !path.resolve(fp).startsWith(DOWNLOAD_DIR)) return result;
  const file = path.basename(fp);
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
  const args = Array.isArray((req.body ?? {}).args) ? (req.body.args as unknown[]) : [];
  const files = uploadedFiles(s, (req.body ?? {}).uploads);
  res.on('finish', () => { for (const f of files) fs.rm(path.dirname(f), { recursive: true, force: true }, () => undefined); });
  try {
    const result = await uploadContext.run(files, () => sessionContext.run(s, () => runWithCompanyContext(s.company, () => runWithAccessSession(s.id, async () => {
      const override = overrides[channel];
      if (override) { try { return { ok: true, data: await override(s, args) }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; } }
      const handler = handlerRegistry.get(channel);
      if (!handler) return { ok: false, error: `Unknown request: ${channel}` };
      return handler({ sender: { id: s.id } }, ...args);
    }))));
    res.json(asDownload(result) ?? { ok: true, data: null });
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
