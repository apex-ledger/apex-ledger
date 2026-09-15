import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { buttonClass } from '../../components/Button';
import { EmailComposeModal } from '../../components/EmailComposeModal';
import { webContext } from '../company-settings/WebOrganisationSection';

export type SlipKind = 't4' | 't4a' | 't5018' | 't5';
const LABEL: Record<SlipKind, string> = { t4: 'T4', t4a: 'T4A', t5018: 'T5018', t5: 'T5' };
const WHO: Record<SlipKind, string> = { t4: 'employee', t4a: 'contractor', t5018: 'subcontractor', t5: 'shareholder' };

interface Recipient { key: number; name: string; email: string | null; amountCents: number; subject: string; body: string }

const CONSENT = (kind: SlipKind) => `This ${WHO[kind]} has agreed to receive their ${LABEL[kind]} slip electronically. (The CRA requires the recipient's consent before a slip is given by email.)`;

/** Emailing a year's slips, each to the person it describes: their own slip only — never the
 * summary — with the SIN masked to its last three digits, and only once the sender confirms the
 * recipient agreed to electronic delivery. */
export function SlipEmailModal({ kind, taxYear, open, onClose }: { kind: SlipKind; taxYear: number; open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [consentAll, setConsentAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState<Recipient | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setNotice(null); setError(null); setConsentAll(false);
    window.api.slips.recipients({ kind, taxYear }).then((r) => {
      setLoading(false);
      if (!r.ok) return setError(r.error);
      setRows(r.data);
    });
  }, [open, kind, taxYear]);

  const withEmail = rows.filter((r) => r.email);

  async function sendAll() {
    setBusy(true); setError(null); setNotice(null);
    const r = await window.api.slips.sendAll({ kind, taxYear, replyTo: webContext()?.user.email, consentConfirmed: consentAll });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const { sent, skipped, failed } = r.data;
    setNotice(`Sent ${sent.length} ${LABEL[kind]} slip${sent.length === 1 ? '' : 's'}.${skipped.length ? ` Skipped (no email on file): ${skipped.join(', ')}.` : ''}`);
    if (failed.length) setError(`Not sent: ${failed.map((f) => `${f.name} — ${f.error}`).join('; ')}`);
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Email ${LABEL[kind]} slips — ${taxYear}`}
        wide
        footer={
          <>
            <button type="button" onClick={onClose} className={buttonClass('secondary')}>Close</button>
            <button type="button" disabled={busy || withEmail.length === 0 || !consentAll} onClick={() => void sendAll()} className={buttonClass('primary')} title={consentAll ? undefined : 'Tick the consent confirmation first'}>
              {busy ? 'Sending…' : `Email all ${withEmail.length}`}
            </button>
          </>
        }
      >
        <p className="mb-2 text-sm text-gray-600">
          Each {WHO[kind]} gets their own slip — never anyone else's, and never the summary. On the emailed copy the SIN shows only its last three digits; the slip you file with the CRA keeps it in full.
        </p>
        <label className="mb-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-sm text-amber-900">
          <input type="checkbox" className="mt-0.5" checked={consentAll} onChange={(e) => setConsentAll(e.target.checked)} />
          <span>Everyone emailed with <strong>Email all</strong> has agreed to receive their {LABEL[kind]} slip electronically. (The CRA requires the recipient's consent.)</span>
        </label>
        {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {notice && <div className="mb-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400">No {LABEL[kind]} slips for {taxYear}.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-2">Name</th>
                <th className="pb-2">Email</th>
                <th className="pb-2 text-right">Amount</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-gray-100">
                  <td className="py-2 font-medium text-gray-800">{row.name}</td>
                  <td className="py-2 text-gray-600">{row.email ?? <span className="text-amber-700">no email on file</span>}</td>
                  <td className="py-2 text-right tabular-nums"><Money cents={row.amountCents} /></td>
                  <td className="py-2 text-right">
                    <button type="button" disabled={busy} onClick={() => setComposing(row)} className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800 hover:bg-brand-200 disabled:opacity-40">Email</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
      {composing && (
        <EmailComposeModal
          open
          onClose={() => setComposing(null)}
          title={`${LABEL[kind]} slip ${taxYear} to ${composing.name}`}
          defaultTo={composing.email ?? ''}
          defaultSubject={composing.subject}
          defaultBody={composing.body}
          defaultReplyTo={webContext()?.user.email}
          attachmentNote={`Their ${LABEL[kind]} slip is attached, with the SIN masked to its last three digits.`}
          requireConfirmation={CONSENT(kind)}
          onSend={async ({ confirmed, ...fields }) => {
            const r = await window.api.slips.sendOne({ kind, taxYear, key: composing.key, ...fields, consentConfirmed: confirmed });
            if (r.ok) setNotice(`${LABEL[kind]} slip sent to ${composing.name} (${fields.to}).`);
            return r;
          }}
        />
      )}
    </>
  );
}
