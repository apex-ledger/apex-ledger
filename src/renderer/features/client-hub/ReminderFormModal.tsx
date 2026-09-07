import { useEffect, useState } from 'react';
import type { ClientRecord } from '@shared/domain/types';
import { Modal } from '../../components/Modal';
import { capitalizeWords, suggestOnBlur } from '../../utils/textCase';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { recordSuggestion, suggestionListId } from '../../utils/textSuggestions';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

function today(): string {
  return localIsoDate();
}

export function ReminderFormModal({
  open,
  onClose,
  onSaved,
  clients,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  clients: ClientRecord[];
}) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(today());
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDueDate(today());
    setClientId('');
    setNotes('');
    setError(null);
  }, [open]);

  async function handleSave(after: 'close' | 'next') {
    setBusy(true);
    setError(null);
    const result = await window.api.reminders.save({
      title: capitalizeWords(title),
      dueDate,
      clientId: clientId || null,
      completed: false,
      notes,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onSaved();
    if (after === 'close') return onClose();
    setTitle(''); setDueDate(today()); setClientId(''); setNotes('');
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Reminder"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !title.trim() || !dueDate}
            onClick={() => handleSave('close')}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Save &amp; Close
          </button>
          <button type="button" disabled={busy || !title.trim() || !dueDate} onClick={() => handleSave('next')} className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Save &amp; Next</button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <label className="block text-sm">
          <span className="text-gray-600">Title</span>
          <input
            list={suggestionListId('event-title')}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={suggestOnBlur('event-title', setTitle)}
            placeholder="Call client re: missing receipts"
          />
          <SuggestionDatalist fieldKey="event-title" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Due Date</span>
          <input
            type="date" min={DATE_MIN} max={DATE_MAX}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            value={dueDate}
            onChange={(e) => setDueDate(clampIsoDate(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Client (optional)</span>
          <select
            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">Not linked to a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.clientName}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Notes (optional)</span>
          <textarea
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={(e) => recordSuggestion('reminder-notes', capitalizeWords(e.target.value))}
          />
        </label>
      </div>
    </Modal>
  );
}
