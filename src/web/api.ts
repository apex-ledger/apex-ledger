/** `window.api` for the browser: the same groups and methods the desktop preload exposes, each one
 * a POST to the web server, and the same event subscriptions fed by server-sent events. The
 * screens are unchanged; only this file knows it is talking over HTTP. */
import apiMap from './apiMap.json';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Requests that open a file picker on the desktop. In the browser the picker is an <input type=file>
 * opened here, in the same click, and the chosen files are uploaded before the request is sent;
 * the server hands them to the handler as if a dialog had returned them. Cancelling sends the
 * request with no files, so the handler answers exactly as it does for a cancelled dialog. */
const PICKERS: Record<string, { accept: string; multiple: boolean }> = {
  'bankImport:readCsvFile': { accept: '.csv,.txt,.ofx,.qfx,.qbo', multiple: false },
  'bankImport:readPdfFile': { accept: '.pdf', multiple: true },
  'qbImport:readIifFile': { accept: '.iif,.txt', multiple: false },
  'qbImport:readCsvFile': { accept: '.xlsx,.xls,.csv,.txt', multiple: false },
  'clients:importCsv': { accept: '.csv', multiple: false },
  'company:pickLogo': { accept: '.png,.jpg,.jpeg', multiple: false },
  'receiptInbox:importFiles': { accept: '.pdf,.png,.jpg,.jpeg', multiple: true },
  'receiptInbox:pickAndExtract': { accept: '.pdf,.png,.jpg,.jpeg', multiple: false },
  'workpapers:addAttachment': { accept: '.pdf,.png,.jpg,.jpeg,.csv,.xlsx,.docx,.txt', multiple: true },
  'attachments:add': { accept: '*/*', multiple: true },
};

function pickFiles(spec: { accept: string; multiple: boolean }): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = spec.accept;
    input.multiple = spec.multiple;
    input.style.display = 'none';
    let done = false;
    const finish = (files: File[]) => { if (done) return; done = true; input.remove(); resolve(files); };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => finish([]));
    // Older browsers fire no cancel event: when the window regains focus and nothing was chosen, give up.
    window.addEventListener('focus', () => { setTimeout(() => { if (!done) finish(Array.from(input.files ?? [])); }, 1500); }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

async function uploadFiles(files: File[]): Promise<string[]> {
  const tokens: string[] = [];
  for (const file of files) {
    const res = await fetch('/api/upload', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
    const body = (await res.json()) as Result<{ token: string }>;
    if (!body.ok) throw new Error(body.error);
    tokens.push(body.data.token);
  }
  return tokens;
}

async function call<T>(channel: string, args: unknown[]): Promise<Result<T>> {
  try {
    let uploads: string[] = [];
    const picker = PICKERS[channel];
    if (picker) uploads = await uploadFiles(await pickFiles(picker));
    const res = await fetch(`/api/${encodeURIComponent(channel)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ args, uploads }) });
    if (res.status === 401) {
      window.dispatchEvent(new Event('apex:signed-out'));
      return { ok: false, error: 'Please sign in.' };
    }
    const body = (await res.json()) as Result<T>;
    // A "saved" file on the server is handed to the browser as a download, so Save as PDF and
    // Export Excel behave like the desktop's save dialog.
    const data = body.ok ? (body.data as { download?: boolean; filePath?: string } | null) : null;
    if (data && data.download && typeof data.filePath === 'string') {
      const a = document.createElement('a');
      a.href = data.filePath;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    return body;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `The server could not be reached: ${error.message}` : String(error) };
  }
}

let source: EventSource | null = null;
const listeners = new Map<string, Set<(payload: unknown) => void>>();

function ensureEvents(): void {
  if (source) return;
  source = new EventSource('/api/events', { withCredentials: true });
  for (const group of Object.values(apiMap.events as Record<string, Record<string, string>>)) {
    for (const channel of Object.values(group)) {
      source.addEventListener(channel, (e) => {
        let payload: unknown = null;
        try { payload = JSON.parse((e as MessageEvent).data); } catch { /* keep null */ }
        for (const fn of listeners.get(channel) ?? []) fn(payload);
      });
    }
  }
  source.onerror = () => { /* the browser reconnects on its own */ };
}

function subscribe(channel: string) {
  return (callback: (payload: unknown) => void): (() => void) => {
    ensureEvents();
    const set = listeners.get(channel) ?? new Set();
    set.add(callback);
    listeners.set(channel, set);
    return () => { set.delete(callback); };
  };
}

/** Builds the api object from the map: unknown methods fail with a clear message rather than a blank screen. */
export function buildWebApi(): Record<string, Record<string, unknown>> {
  const api: Record<string, Record<string, unknown>> = {};
  for (const [group, methods] of Object.entries(apiMap.groups as Record<string, Record<string, string>>)) {
    api[group] = {};
    for (const [method, channel] of Object.entries(methods)) api[group][method] = (...args: unknown[]) => call(channel, args);
  }
  for (const [group, evs] of Object.entries(apiMap.events as Record<string, Record<string, string>>)) {
    api[group] ??= {};
    for (const [method, channel] of Object.entries(evs)) api[group][method] = subscribe(channel);
  }
  // Desktop-only helpers the screens may touch; harmless no-ops here.
  api.window ??= {};
  api.window.close ??= async () => ({ ok: true, data: null });
  api.window.minimize ??= async () => ({ ok: true, data: null });
  api.window.toggleMaximize ??= async () => ({ ok: true, data: null });
  api.zoom ??= {};
  api.zoom.set ??= async () => ({ ok: true, data: null });
  api.zoom.get ??= async () => ({ ok: true, data: 1 });
  return api;
}

export interface WebSignIn { sessionId: number; user: { name: string; email: string; role: string }; org: { name: string; seats: number; isPlatform: boolean } }

export async function webSignIn(email: string, password: string): Promise<Result<WebSignIn>> {
  const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ email, password }) });
  return (await res.json()) as Result<WebSignIn>;
}

export async function webSession(): Promise<WebSignIn | null> {
  try {
    const res = await fetch('/api/session', { credentials: 'same-origin' });
    const body = (await res.json()) as Result<{ signedIn: boolean } & Partial<WebSignIn>>;
    return body.ok && body.data.signedIn ? (body.data as WebSignIn) : null;
  } catch {
    return null;
  }
}
