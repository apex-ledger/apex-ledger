import { useEffect, useState } from 'react';
import type { AppointmentRecord, AppointmentUrgency, ClientRecord } from '@shared/domain/types';
import { Modal } from '../../components/Modal';
import { capitalizeWords, suggestOnBlur } from '../../utils/textCase';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { recordSuggestion, suggestionListId } from '../../utils/textSuggestions';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';

const URGENCIES: { value: AppointmentUrgency; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'normal', label: 'Normal' },
  { value: 'mild', label: 'Mild' },
];

export function AppointmentFormModal({
  open,
  onClose,
  onSaved,
  editing,
  defaultDate,
  clients,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: AppointmentRecord | null;
  defaultDate: string;
  clients: ClientRecord[];
}) {
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('09:00');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [urgency, setUrgency] = useState<AppointmentUrgency>('normal');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTitle(editing?.title ?? '');
    setClientId(editing?.clientId ?? '');
    setDate(editing?.date ?? defaultDate);
    setTime(editing?.time ?? '09:00');
    setDurationMinutes(editing?.durationMinutes ?? 30);
    setUrgency(editing?.urgency ?? 'normal');
    setNotes(editing?.notes ?? '');
  }, [open, editing, defaultDate]);

  async function handleSave() {
    setBusy(true);
    setError(null);
    const result = await window.api.appointments.save({
      id: editing?.id,
      clientId: clientId || null,
      title: capitalizeWords(title),
      date,
      time,
      durationMinutes,
      urgency,
      notes,
      completed: editing?.completed ?? false,
      snoozedUntil: editing?.snoozedUntil ?? null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onSaved();
    onClose();
  }

  return (
    <Modal fullScreen
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Appointment' : 'New Appointment'}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !title.trim()}
            onClick={handleSave}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Save
          </button>
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
            placeholder="e.g. Review T2 return with client"
          />
          <SuggestionDatalist fieldKey="event-title" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Client (optional)</span>
          <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">No client linked</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.clientName}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Date</span>
            <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={date} onChange={(e) => setDate(clampIsoDate(e.target.value))} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Time</span>
            <input type="time" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Duration (min)</span>
            <input
              type="number"
              min={5}
              max={480}
              step={5}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-gray-600">Urgency</span>
          <div className="mt-1 flex gap-2">
            {URGENCIES.map((u) => (
              <button
                key={u.value}
                type="button"
                onClick={() => setUrgency(u.value)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  urgency === u.value
                    ? u.value === 'urgent'
                      ? 'bg-red-100 text-red-800 ring-1 ring-red-200'
                      : u.value === 'normal'
                      ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-200'
                      : 'bg-green-100 text-green-800 ring-1 ring-green-200'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Notes (optional)</span>
          <textarea
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={(e) => {
              const capitalized = capitalizeWords(e.target.value);
              setNotes(capitalized);
              recordSuggestion('appointment-notes', capitalized);
            }}
          />
        </label>
      </div>
    </Modal>
  );
}
