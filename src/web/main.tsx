import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { buildWebApi, webSession, webSignIn } from './api';
import '../renderer/index.css';

// The screens read window.api at import time in places, so it exists before App is loaded.
(window as unknown as { api: unknown }).api = buildWebApi();

/** The sign-in gate for the web: one password for the server (Entra ID comes in the next phase),
 * then the same App the desktop shows. Staff sign-ins inside the app work as they do on the desktop. */
function Gate() {
  const [state, setState] = useState<'checking' | 'signedOut' | 'signedIn'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [App, setApp] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    void webSession().then((info) => { if (info) (window as unknown as { __apexWeb?: unknown }).__apexWeb = info; setState(info ? 'signedIn' : 'signedOut'); });
    const onSignedOut = () => setState('signedOut');
    window.addEventListener('apex:signed-out', onSignedOut);
    return () => window.removeEventListener('apex:signed-out', onSignedOut);
  }, []);
  useEffect(() => {
    if (state !== 'signedIn' || App) return;
    void import('../renderer/App').then((m) => setApp(() => m.default));
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
  if (!App) return <div className="flex h-screen items-center justify-center text-sm text-gray-500">Loading…</div>;
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Gate />
  </React.StrictMode>,
);
