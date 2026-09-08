import { useCallback, useEffect, useState } from 'react';
import { webContext } from './WebOrganisationSection';

/** Feedback people sent from the Feedback button, newest first. The platform administrator sees
 * every firm's and can mark notes done; a firm's owner sees their own firm's notes. */
interface Note { id: number; orgName: string; userName: string; email: string; page: string; message: string; status: 'new' | 'done'; createdAt: string }

export function WebFeedbackSection() {
  const ctx = webContext();
  const [notes, setNotes] = useState<Note[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = (await (await fetch('/api/admin/feedback', { credentials: 'same-origin' })).json()) as { ok: boolean; data?: Note[]; error?: string };
      if (r.ok && r.data) setNotes(r.data); else setError(r.error ?? 'Could not load feedback.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  if (!ctx) return null;

  async function setStatus(n: Note, status: 'new' | 'done') {
    const r = (await (await fetch(`/api/admin/feedback/${n.id}/status`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })).json()) as { ok: boolean; error?: string };
    if (!r.ok) setError(r.error ?? 'Could not update.'); else void reload();
  }

  const shown = notes.filter((n) => showDone || n.status === 'new');
  const copyAll = () => {
    const text = shown.map((n) => `${n.createdAt.slice(0, 16)} · ${n.orgName} · ${n.userName} · ${n.page}\n${n.message}`).join('\n\n');
    void navigator.clipboard?.writeText(text);
  };

  return (
    <section className="mt-2 rounded border border-gray-200 bg-white p-3" data-testid="web-feedback">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-gray-800">Feedback from users</h2>
        <span className="text-xs text-gray-500">{notes.filter((n) => n.status === 'new').length} new</span>
        <label className="ml-auto flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show done</label>
        {shown.length > 0 && <button type="button" onClick={copyAll} className="text-xs text-brand-700 hover:underline" title="Copy the notes shown, to paste into a message">Copy all</button>}
      </div>
      <p className="mt-1 text-xs text-gray-600">Every note sent from the Feedback button in the header, with who sent it and the screen they were on. Copy a note and send it on when something needs fixing.</p>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <ul className="mt-2 divide-y divide-gray-100 text-sm">
        {shown.map((n) => (
          <li key={n.id} className={`py-2 ${n.status === 'done' ? 'text-gray-400' : ''}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              <span className={`font-medium ${n.status === 'done' ? '' : 'text-gray-900'}`}>{n.userName}</span>
              <span>{n.orgName} · <a href={`mailto:${n.email}`} className="text-brand-700 hover:underline">{n.email}</a></span>
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-800">{n.page}</span>
              <span>{n.createdAt.slice(0, 16)}</span>
              {ctx.org.isPlatform && <button type="button" onClick={() => void setStatus(n, n.status === 'new' ? 'done' : 'new')} className="ml-auto text-gray-600 hover:underline">{n.status === 'new' ? 'Mark done' : 'Reopen'}</button>}
            </div>
            <div className={`mt-1 whitespace-pre-wrap ${n.status === 'done' ? '' : 'text-gray-800'}`}>{n.message}</div>
          </li>
        ))}
        {shown.length === 0 && <li className="py-1 text-xs text-gray-400">Nothing new. Notes sent from the Feedback button appear here.</li>}
      </ul>
    </section>
  );
}
