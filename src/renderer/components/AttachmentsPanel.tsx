import { useEffect, useState } from 'react';
import type { AttachmentEntityType, AttachmentRow } from '../../main/ipc/attachments.handlers';
import { formatEnteredAt } from '@shared/domain/audit/enteredStamp';

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The paperclip on any transaction: attach a PDF, photo, spreadsheet or email to the record so
 * the evidence lives with the entry. Files are copied into the app's documents folder and opened
 * with the OS viewer. Shown on posted documents and journal entries. */
export function AttachmentsPanel({ entityType, entityId, compact = false }: { entityType: AttachmentEntityType; entityId: number; compact?: boolean }) {
  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const result = await window.api.attachments.list({ entityType, entityId });
    if (result.ok) setRows(result.data);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entityType, entityId]);

  async function add() {
    setBusy(true); setError(null);
    const result = await window.api.attachments.add({ entityType, entityId });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    await reload();
  }
  async function open(id: number) {
    const result = await window.api.attachments.open(id);
    if (!result.ok) setError(result.error);
  }
  async function remove(id: number) {
    if (!window.confirm('Remove this attachment? The copy kept with the books is deleted; your original file is not touched.')) return;
    const result = await window.api.attachments.remove(id);
    if (!result.ok) return setError(result.error);
    await reload();
  }

  return (
    <div className={compact ? 'text-sm' : 'rounded border border-gray-200 bg-white p-3 text-sm'}>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-gray-800">📎 Attachments{rows.length > 0 ? ` (${rows.length})` : ''}</span>
        <button type="button" disabled={busy} onClick={() => void add()} className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50" title="Attach a PDF, photo, spreadsheet or email to this record">{busy ? 'Attaching…' : '+ Attach file'}</button>
        {error && <span className="text-xs text-rose-700">{error}</span>}
      </div>
      {rows.length > 0 && (
        <ul className="mt-1 divide-y divide-gray-100">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 py-1">
              <button type="button" onClick={() => void open(row.id)} className="text-brand-700 hover:underline" title="Open in the default viewer">{row.originalName}</button>
              <span className="text-xs text-gray-400">{sizeLabel(row.sizeBytes)} · {formatEnteredAt(row.createdAt)}{row.addedBy ? ` · ${row.addedBy}` : ''}</span>
              {row.note && <span className="text-xs text-gray-500">— {row.note}</span>}
              <button type="button" onClick={() => void remove(row.id)} className="ml-auto text-xs text-gray-400 hover:text-rose-600" title="Remove">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
