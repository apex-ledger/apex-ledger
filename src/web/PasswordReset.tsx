import { useState } from 'react';

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return (await res.json()) as { ok: true; data: T } | { ok: false; error: string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const field = 'mt-1 w-full rounded border border-gray-300 px-2 py-1.5';
const primary = 'mt-4 w-full rounded-full bg-brand-700 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50';

/** "Forgot password?": ask for the email, and a one-hour reset link goes to it. */
export function ForgotPasswordForm({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    const r = await post<{ message: string }>('/api/password-reset/request', { email });
    setBusy(false);
    if (!r.ok) setError(r.error); else setMessage(r.data.message);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="relative w-80 rounded-lg bg-white p-6 shadow-xl">
      <div className="text-lg font-semibold text-brand-900">Forgot your password?</div>
      <p className="mb-3 text-xs text-gray-500">Enter the email you sign in with. We will send a link to set a new password.</p>
      <label className="block text-sm"><span className="text-gray-600">Email</span>
        <input type="email" autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
      </label>
      {error && <div className="mt-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mt-2 text-sm text-emerald-800">{message}</div>}
      <button type="submit" disabled={busy || !email.trim()} className={primary}>{busy ? 'Sending…' : 'Send reset link'}</button>
      <button type="button" onClick={onBack} className="mt-3 w-full text-center text-xs text-brand-700 hover:underline">Back to sign in</button>
    </form>
  );
}

/** The page a reset link opens: choose the new password, twice. */
export function ResetPasswordForm({ token, onDone }: { token: string; onDone: (message: string) => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('The two passwords are not the same.'); return; }
    setBusy(true);
    const r = await post<{ email: string }>('/api/password-reset/complete', { token, password });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onDone(`Your password is changed. Sign in as ${r.data.email} with the new password.`);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="relative w-80 rounded-lg bg-white p-6 shadow-xl">
      <div className="text-lg font-semibold text-brand-900">Set a new password</div>
      <p className="mb-3 text-xs text-gray-500">At least 8 characters.</p>
      <label className="block text-sm"><span className="text-gray-600">New password</span>
        <input type="password" autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
      </label>
      <label className="mt-2 block text-sm"><span className="text-gray-600">Type it again</span>
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
      </label>
      {error && <div className="mt-2 text-sm text-red-700">{error}</div>}
      <button type="submit" disabled={busy || password.length < 8 || confirm.length < 8} className={primary}>{busy ? 'Saving…' : 'Save new password'}</button>
    </form>
  );
}
