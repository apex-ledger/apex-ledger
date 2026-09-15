import { useEffect, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { buttonClass } from './Button';

/** A small "compose and send" box for documents that generate a PDF (invoices today) — sent
 * straight out through the platform's mail relay, so it works the same on the web app as on
 * desktop without Outlook or per-firm mail setup. Fields are pre-filled but editable; Reply-To
 * defaults to whoever is sending it, so the client's reply reaches the right inbox. */
export function EmailComposeModal({
  open,
  onClose,
  title,
  defaultTo,
  defaultSubject,
  defaultBody,
  defaultReplyTo,
  onSend,
  summary,
  attachmentNote = 'The PDF is attached automatically.',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  defaultTo: string;
  defaultSubject: string;
  defaultBody: string;
  defaultReplyTo?: string;
  onSend: (fields: { to: string; subject: string; body: string; replyTo: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Anything the sender should see before sending, above the fields — a reminder's tier and balance. */
  summary?: ReactNode;
  /** What travels with the message, said in the footnote. */
  attachmentNote?: string;
}) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [replyTo, setReplyTo] = useState(defaultReplyTo ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTo(defaultTo);
    setSubject(defaultSubject);
    setBody(defaultBody);
    setReplyTo(defaultReplyTo ?? '');
    setError(null);
    // Only reset when the box opens — the caller's defaults can change out from under an edit in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function send() {
    if (!to.trim()) return setError('Enter an email address to send to.');
    setBusy(true);
    setError(null);
    const r = await onSend({ to: to.trim(), subject, body, replyTo: replyTo.trim() });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass('secondary')}>Cancel</button>
          <button type="button" disabled={busy} onClick={() => void send()} className={buttonClass('primary')}>{busy ? 'Sending…' : 'Send'}</button>
        </>
      }
    >
      {summary && <div className="mb-3">{summary}</div>}
      {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <label className="block text-sm">
        <span className="text-gray-600">To</span>
        <input type="email" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" placeholder="client@example.com" />
      </label>
      <label className="mt-3 block text-sm">
        <span className="text-gray-600">Subject</span>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
      </label>
      <label className="mt-3 block text-sm">
        <span className="text-gray-600">Message</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
      </label>
      <label className="mt-3 block text-sm">
        <span className="text-gray-600">Reply-To (optional — where the client's reply should go)</span>
        <input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" placeholder="you@yourfirm.com" />
      </label>
      <p className="mt-2 text-xs text-gray-400">{attachmentNote} Sent from Apex Ledger's own mail server — no Outlook or mail setup needed.</p>
    </Modal>
  );
}
