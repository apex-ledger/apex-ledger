import { useEffect, useState } from 'react';
import type { StatementRow } from '../../../main/ipc/customerStatements.handlers';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { buttonClass } from '../../components/Button';
import { EmailComposeModal } from '../../components/EmailComposeModal';
import { webContext } from '../company-settings/WebOrganisationSection';
import { confirmDialog } from '../../app/store/confirmStore';

/** Month-end statements: every customer with a balance. Tick the ones to include, then download them
 * all as one PDF to print, email them all at once with the standard note, or email one customer at a
 * time after reading and adjusting the note. Everything sends through the platform's own mail
 * server and downloads through the browser, so it works in the web app as well as on desktop. */
export function CustomerStatementsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState<{ row: StatementRow; to: string; subject: string; body: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setNotice(null);
    setError(null);
    window.api.customerStatements.list().then((r) => {
      setLoading(false);
      if (!r.ok) return setError(r.error);
      setRows(r.data);
      setSelected(new Set(r.data.map((row) => row.customerId)));
    });
  }, [open]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function downloadCombined() {
    setBusy('save');
    setError(null);
    setNotice(null);
    const r = await window.api.customerStatements.saveCombined({ customerIds: [...selected] });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setNotice(`${r.data.count} statement${r.data.count === 1 ? '' : 's'} saved as one PDF: ${r.data.filePath}`);
  }

  async function compose(row: StatementRow) {
    setBusy(`email-${row.customerId}`);
    setError(null);
    const r = await window.api.customerStatements.emailDefaults({ customerId: row.customerId });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setComposing({ row, to: r.data.to ?? '', subject: r.data.subject, body: r.data.body });
  }

  const chosen = rows.filter((r) => selected.has(r.customerId));
  const withEmail = chosen.filter((r) => r.customerEmail);

  async function sendAll() {
    const missing = chosen.length - withEmail.length;
    const ok = await confirmDialog(
      `Email ${withEmail.length} statement${withEmail.length === 1 ? '' : 's'} now, each with the standard covering note?` +
        (missing > 0 ? `\n\n${missing} selected customer${missing === 1 ? ' has' : 's have'} no email address and will be skipped.` : ''),
    );
    if (!ok) return;
    setBusy('sendAll');
    setError(null);
    setNotice(null);
    const r = await window.api.customerStatements.sendAll({ customerIds: withEmail.map((row) => row.customerId), replyTo: webContext()?.user.email });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    const { sent, skipped, failed } = r.data;
    setNotice(`Sent ${sent.length} statement${sent.length === 1 ? '' : 's'}.${skipped.length ? ` Skipped (no email): ${skipped.join(', ')}.` : ''}`);
    if (failed.length) setError(`Not sent: ${failed.map((f) => `${f.customerName} — ${f.error}`).join('; ')}`);
  }

  const total = chosen.reduce((s, r) => s + r.totalCents, 0);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Customer statements"
        wide
        footer={
          <>
            <span className="mr-auto text-xs text-gray-500">{selected.size} of {rows.length} customers · <Money cents={total} /> outstanding</span>
            <button type="button" onClick={onClose} className={buttonClass('secondary')}>Close</button>
            <button type="button" disabled={selected.size === 0 || busy !== null} onClick={() => void downloadCombined()} className={buttonClass('secondary')}>
              {busy === 'save' ? 'Preparing…' : `Download ${selected.size} as one PDF`}
            </button>
            <button type="button" disabled={withEmail.length === 0 || busy !== null} onClick={() => void sendAll()} className={buttonClass('primary')} title="Each selected customer with an email address gets their own statement">
              {busy === 'sendAll' ? 'Sending…' : `Email all ${withEmail.length}`}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-gray-600">
          Every active customer with an open balance. Each statement lists the customer's open invoices, days overdue and the total — the same sheet a payment reminder attaches.
          Download them as one PDF to print, email them all with the standard note, or use Email on a row to read and adjust the note first.
        </p>
        {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {notice && <div className="mb-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">No customer has an open balance. Nothing to send.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="w-8 pb-2"><input type="checkbox" checked={selected.size === rows.length} onChange={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.customerId)))} aria-label="Select all" /></th>
                <th className="pb-2">Customer</th>
                <th className="pb-2">Email</th>
                <th className="pb-2 text-right">Open invoices</th>
                <th className="pb-2 text-right">Outstanding</th>
                <th className="pb-2 text-right">Overdue</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.customerId} className="border-b border-gray-100">
                  <td className="py-2"><input type="checkbox" checked={selected.has(row.customerId)} onChange={() => toggle(row.customerId)} aria-label={`Include ${row.customerName}`} /></td>
                  <td className="py-2 font-medium text-gray-800">{row.customerName}</td>
                  <td className="py-2 text-gray-600">{row.customerEmail ?? <span className="text-amber-700">no email on file</span>}</td>
                  <td className="py-2 text-right tabular-nums">{row.openInvoices}</td>
                  <td className="py-2 text-right tabular-nums"><Money cents={row.totalCents} /></td>
                  <td className={`py-2 text-right tabular-nums ${row.overdueCents > 0 ? 'text-rose-700' : 'text-gray-400'}`}><Money cents={row.overdueCents} /></td>
                  <td className="py-2 text-right">
                    <button type="button" disabled={busy !== null} onClick={() => void compose(row)} className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800 hover:bg-brand-200 disabled:opacity-40" title="Read and adjust the covering note, then send with the statement attached">
                      {busy === `email-${row.customerId}` ? 'Opening…' : 'Email'}
                    </button>
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
          title={`Statement to ${composing.row.customerName}`}
          defaultTo={composing.to}
          defaultSubject={composing.subject}
          defaultBody={composing.body}
          defaultReplyTo={webContext()?.user.email}
          attachmentNote="The customer's statement of account is attached automatically."
          onSend={async (fields) => {
            const r = await window.api.customerStatements.sendDirect({ customerId: composing.row.customerId, ...fields });
            if (r.ok) setNotice(`Statement sent to ${composing.row.customerName} (${fields.to}).`);
            return r;
          }}
        />
      )}
    </>
  );
}
