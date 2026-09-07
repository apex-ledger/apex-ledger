import { useEffect, useState } from 'react';
import { APPROVAL_STATUS_LABELS, canApprove, type ApprovalQueueItem } from '@shared/domain/workflow/approvals';
import { useUiStore } from '../../app/store/uiStore';
import { Money } from '../../components/Money';
import { useAccessRole } from '../../utils/accessRole';

/** The approver's queue: journals and purchase orders above the threshold, and bills marked
 * pending, each with Approve or Reject (with a note). Preparers see the same list read-only. */
export function ApprovalsPage() {
  const setView = useUiStore((s) => s.setView);
  const refreshNonce = useUiStore((s) => s.refreshNonce);
  const role = useAccessRole();
  const approver = canApprove(role);
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ApprovalQueueItem | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  function reload() {
    window.api.approvals.pending().then((r) => (r.ok ? setItems(r.data) : setError(r.error)));
  }
  useEffect(reload, [refreshNonce]);

  async function decide(item: ApprovalQueueItem, approvalStatus: 'approved' | 'rejected', text?: string) {
    setBusy(true);
    setError(null);
    const r = item.kind === 'journal'
      ? await window.api.approvals.setJournal({ id: item.id, approvalStatus, note: text ?? null })
      : item.kind === 'purchaseOrder'
        ? await window.api.approvals.setPurchaseOrder({ id: item.id, approvalStatus, note: text ?? null })
        : await window.api.bills.setApproval({ id: item.id, approvalStatus, note: text ?? undefined });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setRejecting(null);
    setNote('');
    reload();
  }

  function open(item: ApprovalQueueItem) {
    if (item.kind === 'journal') setView({ kind: 'journalForm', id: item.id });
    else if (item.kind === 'purchaseOrder') setView({ kind: 'purchaseOrderEditor', id: item.id });
    else setView({ kind: 'purchases', tab: 'unpaid', billId: item.id });
  }

  return (
    <div className="space-y-3 p-3" data-testid="approvals">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Approvals</h1>
        <p className="text-sm text-gray-500">
          {approver ? 'Items waiting for your decision. Approve, or reject with a note that says what to change.' : 'Items waiting for an administrator or accountant. You can open each one; deciding is theirs.'}
          {' '}Thresholds are set in Company Settings.
        </p>
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {items.length === 0 && <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">Nothing waiting for approval.</div>}
      {items.length > 0 && (
        <div className="rounded border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Prepared by</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={`${item.kind}-${item.id}`} className={item.status === 'rejected' ? 'bg-red-50' : 'bg-amber-50'}>
                  <td className="px-3 py-2 tabular-nums text-gray-600">{item.date}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => open(item)} className="font-medium text-brand-700 hover:underline">{item.title}</button>
                    <div className="text-xs text-gray-500">{item.detail}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{item.requestedBy ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{APPROVAL_STATUS_LABELS[item.status]}</td>
                  <td className="px-3 py-2 text-right tabular-nums"><Money cents={item.amountCents} /></td>
                  <td className="px-3 py-2 text-right">
                    {approver && item.status === 'pending' && (
                      <>
                        <button type="button" disabled={busy} onClick={() => decide(item, 'approved')} className="mr-2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">Approve</button>
                        <button type="button" disabled={busy} onClick={() => { setRejecting(item); setNote(''); }} className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Reject</button>
                      </>
                    )}
                    {approver && item.status === 'rejected' && (
                      <button type="button" disabled={busy} onClick={() => decide(item, 'approved')} className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">Approve after all</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rejecting && (
        <div className="rounded border border-red-200 bg-white p-3 text-sm" data-testid="reject-form">
          <div className="mb-1 font-semibold text-gray-800">Reject {rejecting.title}</div>
          <textarea rows={2} className="w-full rounded border border-gray-300 px-2 py-1.5" placeholder="What needs to change?" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setRejecting(null)} className="rounded-full px-3 py-1 text-xs text-gray-600 hover:bg-gray-100">Cancel</button>
            <button type="button" disabled={busy || !note.trim()} onClick={() => decide(rejecting, 'rejected', note)} className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50">Reject with note</button>
          </div>
        </div>
      )}
    </div>
  );
}
