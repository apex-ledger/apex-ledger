import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUiStore } from '../app/store/uiStore';
import { titleForView } from './pageTitles';

/** Feedback on the web: a note typed here goes to the server with the person's name, their firm
 * and the screen they were on, and shows on the Administration page. No email client needed. */
export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const view = useUiStore((s) => s.view);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const page = titleForView(view as { kind: string; report?: string; group?: string }) ?? view.kind;

  useEffect(() => { if (open) { setState('idle'); setError(null); } }, [open]);
  if (!open) return null;

  async function send() {
    setState('sending'); setError(null);
    try {
      const res = await fetch('/api/feedback', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, page }) });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!body.ok) throw new Error(body.error ?? 'Could not send.');
      setState('sent'); setMessage('');
    } catch (e) {
      setState('error'); setError(e instanceof Error ? e.message : String(e));
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30" onClick={onClose} role="dialog" aria-label="Send feedback">
      <div className="w-[28rem] max-w-[92vw] rounded-lg bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-base font-semibold text-brand-900">Send feedback</div>
        <p className="mt-1 text-xs text-gray-600">Something wrong, confusing or missing? Say what you were doing and what you expected. It goes straight to Apex Ledger with your name and the screen you are on: <b>{page}</b>.</p>
        {state === 'sent' ? (
          <div className="mt-4 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Thank you. Your note is in; we read every one.</div>
        ) : (
          <textarea autoFocus value={message} onChange={(e) => setMessage(e.target.value)} rows={6} placeholder="For example: on Import Bank the PDF from RBC shows the dates in the wrong column." className="mt-3 w-full rounded border border-gray-300 px-3 py-2 text-sm" maxLength={4000} />
        )}
        {error && <div className="mt-2 text-xs text-red-700">{error}</div>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{state === 'sent' ? 'Close' : 'Cancel'}</button>
          {state !== 'sent' && <button type="button" onClick={() => void send()} disabled={message.trim().length < 5 || state === 'sending'} className="rounded-full bg-brand-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50">{state === 'sending' ? 'Sending…' : 'Send'}</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
