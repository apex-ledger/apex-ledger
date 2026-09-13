import { useState } from 'react';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';

type Result = { ok: true; data: unknown } | { ok: false; error: string };

/** A click-to-edit date on a posted document (invoice, bill, sales receipt, credit note). The
 * caller supplies what a change means; the server decides whether it is safe and answers with
 * the reason when it is not. Looks the same everywhere: dotted underline, click, pick, done. */
export function DocumentDateCell({ value, onChange, title, className, note: noteFromServer }: {
  value: string;
  onChange: (next: string) => Promise<Result & { note?: string }>;
  title?: string;
  className?: string;
  note?: (result: unknown) => string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function commit(next: string) {
    if (!next || next === value) { setEditing(false); return; }
    setSaving(true); setNote(null); setFailed(false);
    const r = await onChange(next);
    setSaving(false);
    if (!r.ok) { setNote(r.error); setFailed(true); return; }
    setEditing(false);
    setNote(noteFromServer ? noteFromServer(r.data) : null);
  }

  if (!editing) {
    return (
      <span className={`inline-flex flex-col ${className ?? ''}`}>
        <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(true); }} className="whitespace-nowrap text-left underline decoration-dotted decoration-gray-300 underline-offset-2 hover:decoration-brand-500" title={title ?? 'Click to change the date'}>{value}</button>
        {note && <span className={`text-[10px] ${failed ? 'text-red-600' : 'text-brand-700'}`}>{note}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
      <input type="date" min={DATE_MIN} max={DATE_MAX} autoFocus defaultValue={value} disabled={saving} className="rounded border border-brand-300 px-1 py-0.5 text-xs"
        onBlur={(e) => void commit(clampIsoDate(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); if (e.key === 'Enter') void commit((e.target as HTMLInputElement).value); }} />
      {note && <span className="text-[10px] text-red-600">{note}</span>}
    </span>
  );
}
