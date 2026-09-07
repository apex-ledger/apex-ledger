import { useEffect, useState } from 'react';
import type { StatementRow } from '../../../main/ipc/customerStatements.handlers';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { buttonClass } from '../../components/Button';

/** Month-end statements: every customer with a balance, tick the ones to send, save them all as
 * PDFs into one folder or email them one at a time through Outlook. */
export function CustomerStatementsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function saveAll() {
    setBusy('save');
    setError(null);
    const r = await window.api.customerStatements.saveAll({ customerIds: [...selected] });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    if (r.data.saved) setNotice(`${r.data.count} statement${r.data.count === 1 ? '' : 's'} saved to ${r.data.folder}.`);
  }

  async function email(row: StatementRow) {
    setBusy(`email-${row.customerId}`);
    setError(null);
    const r = await window.api.customerStatements.email({ customerId: row.customerId });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setNotice(`Outlook opened with the statement for ${row.customerName}. Review it and press Send.`);
  }

  const total = rows.filter((r) => selected.has(r.customerId)).reduce((s, r) => s + r.totalCents, 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customer statements"
      wide
      footer={
        <>
          <span className="mr-auto text-xs text-gray-500">{selected.size} of {rows.length} customers · <Money cents={total} /> outstanding</span>
          <button type="button" onClick={onClose} className={buttonClass('secondary')}>Close</button>
          <button type="button" disabled={selected.size === 0 || busy !== null} onClick={() => void saveAll()} className={buttonClass('primary')}>
            {busy === 'save' ? 'Saving…' : `Save ${selected.size} PDF${selected.size === 1 ? '' : 's'} to a folder`}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-gray-600">
        Every active customer with an open balance. Each statement lists the customer's open invoices, days overdue and the total, the same sheet a payment reminder attaches.
        Save them all as PDFs to print or upload, or email one at a time through Outlook so each goes out after a look.
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
                  <button type="button" disabled={!row.customerEmail || busy !== null} onClick={() => void email(row)} className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800 hover:bg-brand-200 disabled:opacity-40" title={row.customerEmail ? 'Open in Outlook with the statement attached' : 'Add an email address on the customer record first'}>
                    {busy === `email-${row.customerId}` ? 'Opening…' : 'Email'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
