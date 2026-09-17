import { useState } from 'react';
import { isWeb } from '../../utils/platform';

/** App Settings → Your password, on the web: every person, owner or not, can change their own. */
export function MyPasswordSection() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (!isWeb()) return null;

  async function save() {
    setMessage(null);
    if (password !== confirm) return setMessage({ ok: false, text: 'The two passwords are not the same.' });
    try {
      const res = await fetch('/api/me/password', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const r = (await res.json()) as { ok: boolean; error?: string };
      if (!r.ok) return setMessage({ ok: false, text: r.error ?? 'Could not change the password.' });
      setPassword(''); setConfirm('');
      setMessage({ ok: true, text: 'Your password is changed. Use it next time you sign in.' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">Your password</h2>
      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-3 text-sm">
        <input type="password" autoComplete="new-password" aria-label="New password" placeholder="New password, 8+ characters" value={password} onChange={(e) => setPassword(e.target.value)} className="w-60 rounded border border-gray-300 px-2 py-1.5" />
        <input type="password" autoComplete="new-password" aria-label="Type it again" placeholder="Type it again" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-60 rounded border border-gray-300 px-2 py-1.5" />
        <button type="button" onClick={() => void save()} disabled={password.length < 8 || confirm.length < 8} className="rounded-full bg-brand-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50">Change password</button>
        {message && <span role="status" className={message.ok ? 'text-emerald-700' : 'text-red-700'}>{message.text}</span>}
      </div>
    </section>
  );
}
