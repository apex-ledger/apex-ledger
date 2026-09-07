import { useState } from 'react';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';

/** A Date column cell that's a plain click-to-edit date field — changing just the date doesn't
 * affect whether an entry balances, so it's allowed directly (via journal:updateDate) without the
 * void-then-repost dance Amount corrections need. Shared by every ledger table with a Date column
 * (Quick Entry's range view, the Journal Entries list) so date correction works the same way
 * everywhere in the app. */
export function EditableDateCell({ entryId, value, onSaved }: { entryId: number; value: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="whitespace-nowrap underline decoration-dotted decoration-gray-300 underline-offset-2 hover:decoration-brand-500"
        title="Click to edit the date"
      >
        {value}
      </button>
    );
  }

  async function commit(next: string) {
    if (!next || next === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await window.api.journal.updateDate({ id: entryId, entryDate: next });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(false);
    onSaved();
  }

  return (
    <span className="inline-flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
      <input
        type="date" min={DATE_MIN} max={DATE_MAX}
        autoFocus
        defaultValue={value}
        disabled={saving}
        className="rounded border border-brand-300 px-1 py-0.5 text-xs"
        onBlur={(e) => commit(clampIsoDate(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false);
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        }}
      />
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </span>
  );
}
