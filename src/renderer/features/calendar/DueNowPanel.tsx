import { useState } from 'react';
import type { AppointmentRecord } from '@shared/domain/types';
import { URGENCY_DOT } from './urgencyColors';

function isDueNow(a: AppointmentRecord, now: Date): boolean {
  if (a.completed) return false;
  if (a.snoozedUntil && new Date(a.snoozedUntil) > now) return false;
  return new Date(`${a.date}T${a.time}:00`) <= now;
}

const SNOOZE_OPTIONS: { label: string; minutesFromNow: number | 'tomorrow' }[] = [
  { label: '15 min', minutesFromNow: 15 },
  { label: '1 hour', minutesFromNow: 60 },
  { label: 'Tomorrow', minutesFromNow: 'tomorrow' },
];

function snoozeUntil(option: (typeof SNOOZE_OPTIONS)[number]): string {
  if (option.minutesFromNow === 'tomorrow') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  return new Date(Date.now() + option.minutesFromNow * 60_000).toISOString();
}

export function DueNowPanel({
  appointments,
  clientNameById,
  now,
  onRefresh,
}: {
  appointments: AppointmentRecord[];
  clientNameById: Map<string, string>;
  now: Date;
  onRefresh: () => void;
}) {
  const [snoozeMenuFor, setSnoozeMenuFor] = useState<string | null>(null);
  const due = appointments.filter((a) => isDueNow(a, now)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  if (due.length === 0) return null;

  async function handleSnooze(id: string, option: (typeof SNOOZE_OPTIONS)[number]) {
    setSnoozeMenuFor(null);
    await window.api.appointments.snooze({ id, snoozedUntil: snoozeUntil(option) });
    onRefresh();
  }

  async function handleComplete(a: AppointmentRecord) {
    await window.api.appointments.save({ ...a, completed: true });
    onRefresh();
  }

  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-3 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-red-800">
        Due Now / Overdue ({due.length})
      </h2>
      <div className="space-y-1.5">
        {due.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 flex-shrink-0 rounded-full ${URGENCY_DOT[a.urgency]}`} />
              <span className="font-medium">{a.title}</span>
              <span className="text-xs text-gray-500">
                {a.date} {a.time}
                {a.clientId && clientNameById.get(a.clientId) ? ` — ${clientNameById.get(a.clientId)}` : ''}
              </span>
            </div>
            <div className="relative flex items-center gap-2">
              <button type="button" onClick={() => handleComplete(a)} className="text-xs font-medium text-green-700 hover:underline">
                Complete
              </button>
              <button type="button" onClick={() => setSnoozeMenuFor(snoozeMenuFor === a.id ? null : a.id)} className="text-xs font-medium text-brand-700 hover:underline">
                Snooze
              </button>
              {snoozeMenuFor === a.id && (
                <div className="absolute right-0 top-6 z-20 w-32 rounded border border-gray-200 bg-white py-1 shadow-lg">
                  {SNOOZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => handleSnooze(a.id, opt)}
                      className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
