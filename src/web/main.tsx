import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { buildWebApi, webSession, webSignIn } from './api';
import '../renderer/index.css';

// The screens read window.api at import time in places, so it exists before App is loaded.
(window as unknown as { api: unknown }).api = buildWebApi();

interface Provider { id: string; label: string }

const ProviderMark = ({ id }: { id: string }) => id === 'microsoft'
  ? <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="0" y="0" width="7" height="7" fill="#f25022"/><rect x="9" y="0" width="7" height="7" fill="#7fba00"/><rect x="0" y="9" width="7" height="7" fill="#00a4ef"/><rect x="9" y="9" width="7" height="7" fill="#ffb900"/></svg>
  : <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z"/><path fill="#34a853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#fbbc05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z"/><path fill="#ea4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z"/></svg>;

/** The sign-in gate for the web: Microsoft or Google when the server has them set up, or email
 * and password; then the same App the desktop shows. */
function Gate() {
  const [state, setState] = useState<'checking' | 'signedOut' | 'signedIn'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [App, setApp] = useState<React.ComponentType | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    // A failed provider sign-in comes back as ?signin=<reason>; show it and clean the address.
    const q = new URLSearchParams(window.location.search);
    const reason = q.get('signin');
    if (reason) { setError(reason); window.history.replaceState(null, '', window.location.pathname); }
    void fetch('/api/auth/options', { credentials: 'same-origin' }).then((r) => r.json()).then((b: { ok: boolean; data?: { providers: Provider[] } }) => { if (b.ok && b.data) setProviders(b.data.providers); }).catch(() => undefined);
    void webSession().then((info) => { if (info) (window as unknown as { __apexWeb?: unknown }).__apexWeb = info; setState(info ? 'signedIn' : 'signedOut'); });
    const onSignedOut = () => setState('signedOut');
    window.addEventListener('apex:signed-out', onSignedOut);
    return () => window.removeEventListener('apex:signed-out', onSignedOut);
  }, []);
  useEffect(() => {
    if (state !== 'signedIn' || App) return;
    // The application is one download of about 600 KB. Say so if it is slow, and say what went
    // wrong if it fails, rather than showing "Loading…" for ever.
    const slowTimer = window.setTimeout(() => setSlow(true), 8000);
    import('../renderer/App')
      .then((m) => setApp(() => m.default))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => window.clearTimeout(slowTimer));
    return () => window.clearTimeout(slowTimer);
  }, [state, App]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await webSignIn(email, password);
    if (!r.ok) { setError(r.error); return; }
    (window as unknown as { __apexWeb?: unknown }).__apexWeb = r.data;
    setPassword('');
    setState('signedIn');
  }

  if (state === 'checking') return <div className="flex h-screen items-center justify-center text-sm text-gray-500">Connecting…</div>;
  if (state === 'signedOut') {
    return (
      <div className="flex h-screen items-center justify-center bg-brand-900">
        <form onSubmit={(e) => void submit(e)} className="w-80 rounded-lg bg-white p-6 shadow-xl">
          <div className="text-lg font-semibold text-brand-900">Apex Ledger</div>
          <div className="mb-4 text-xs text-gray-500">Canadian accounting software · web</div>
          {providers.length > 0 && (
            <div className="mb-4">
              {providers.map((p) => (
                <a key={p.id} href={`/api/auth/${p.id}`} className="mb-2 flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">
                  <ProviderMark id={p.id} /> Sign in with {p.label}
                </a>
              ))}
              <div className="my-3 flex items-center gap-2 text-[11px] uppercase tracking-wide text-gray-400"><span className="h-px flex-1 bg-gray-200" />or with your password<span className="h-px flex-1 bg-gray-200" /></div>
            </div>
          )}
          <label className="block text-sm">
            <span className="text-gray-600">Email</span>
            <input type="email" autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
          </label>
          <label className="mt-2 block text-sm">
            <span className="text-gray-600">Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
          </label>
          {error && <div className="mt-2 text-sm text-red-700">{error}</div>}
          <button type="submit" className="mt-4 w-full rounded-full bg-brand-700 py-2 text-sm font-medium text-white hover:bg-brand-800">Sign in</button>
          <p className="mt-3 text-[11px] text-gray-400">Your books stay on this server in Canada. Nothing is sent anywhere else.</p>
        </form>
      </div>
    );
  }
  if (!App) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-brand-900 text-sm text-white">
        {loadError ? (
          <>
            <div className="max-w-md rounded-lg bg-white p-5 text-gray-800 shadow-xl">
              <div className="font-semibold text-brand-900">The application did not load</div>
              <p className="mt-1 text-xs text-gray-600">{loadError}</p>
              <p className="mt-2 text-xs text-gray-600">This is usually a dropped download. Reloading fixes it; if it keeps happening, try another browser and tell us.</p>
              <button type="button" onClick={() => window.location.reload()} className="mt-3 rounded-full bg-brand-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-800">Reload</button>
            </div>
          </>
        ) : (
          <>
            <div>Loading Apex Ledger…</div>
            {slow && <div className="text-xs text-brand-100">Still downloading the application (about 600 KB). If this takes more than a minute, press Ctrl+F5 to reload.</div>}
          </>
        )}
      </div>
    );
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Gate />
  </React.StrictMode>,
);
