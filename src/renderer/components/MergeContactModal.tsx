import { useState } from 'react';
import type { Contact } from '@shared/domain/types';
import { Modal } from './Modal';
import { buttonClass } from './Button';

/** Fold a duplicate customer or vendor into the one being kept. Every invoice, bill, payment,
 * estimate, order, credit and journal line moves to the kept record; the duplicate is made
 * inactive with a note saying where it went. Nothing is deleted. */
export function MergeContactModal({ kind, keep, others, open, onClose, onMerged }: { kind: 'customer' | 'vendor'; keep: Contact | null; others: Contact[]; open: boolean; onClose: () => void; onMerged: () => void }) {
  const [mergeId, setMergeId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const word = kind === 'customer' ? 'customer' : 'vendor';
  const candidates = others.filter((c) => c.id !== keep?.id && c.isActive);
  const merging = candidates.find((c) => c.id === mergeId) ?? null;

  async function merge() {
    if (!keep || mergeId === null) return;
    if (!window.confirm(`Merge "${merging?.name}" into "${keep.name}"?\n\nEverything recorded against ${merging?.name} — invoices, bills, payments, estimates, orders, credits, journal lines — will show under ${keep.name}. ${merging?.name} becomes inactive. This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    const api = kind === 'customer' ? window.api.customers : window.api.vendors;
    const r = await api.merge({ keepId: keep.id, mergeId });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setMergeId(null);
    onMerged();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Merge a duplicate ${word} into ${keep?.name ?? ''}`} footer={<><button type="button" onClick={onClose} className={buttonClass('secondary')}>Cancel</button><button type="button" disabled={busy || mergeId === null} onClick={() => void merge()} className={buttonClass('primary')}>{busy ? 'Merging…' : 'Merge'}</button></>}>
      <p className="mb-3 text-sm text-gray-600">
        Same {word} entered twice, a bit differently? Pick the duplicate below. Its history moves under <span className="font-semibold">{keep?.name}</span> and the duplicate is made inactive. Example: "Bell Canada" and "BELL CANADA INC" become one vendor with all the bills together, and the ageing report stops showing two.
      </p>
      {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <label className="block text-sm">
        <span className="text-gray-600">Duplicate to merge into {keep?.name}</span>
        <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={mergeId ?? ''} onChange={(e) => setMergeId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Choose…</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ''}</option>)}
        </select>
      </label>
    </Modal>
  );
}
