import { useEffect, useState } from 'react';
import type { HistoryEvent } from '../../main/ipc/documentHistory.handlers';
import { formatEnteredAt } from '@shared/domain/audit/enteredStamp';
import { JournalEntryLink } from './JournalEntryLink';

const KIND_STYLE: Record<HistoryEvent['kind'], string> = {
  created: 'bg-gray-100 text-gray-700',
  posted: 'bg-emerald-100 text-emerald-800',
  edited: 'bg-amber-100 text-amber-800',
  payment: 'bg-sky-100 text-sky-800',
  reversal: 'bg-orange-100 text-orange-800',
  void: 'bg-rose-100 text-rose-800',
  attachment: 'bg-violet-100 text-violet-800',
  reminder: 'bg-indigo-100 text-indigo-800',
  activity: 'bg-gray-100 text-gray-600',
};

/** Who did what to this document and when — created, posted, edited (with before → after),
 * paid, reversed, voided, files attached, reminders sent. Read from the trails the app already
 * keeps; shown on the document so nobody has to open the audit report to answer "who changed
 * this?". Collapsed by default with the count in the heading. */
export function DocumentHistoryPanel({ entityType, entityId }: { entityType: 'invoice' | 'bill' | 'salesReceipt' | 'journalEntry'; entityId: number }) {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    window.api.documentHistory.get({ entityType, entityId }).then((r) => {
      if (!alive) return;
      if (r.ok) setEvents(r.data); else setError(r.error);
    });
    return () => { alive = false; };
  }, [entityType, entityId]);

  return (
    <div className="rounded border border-gray-200 bg-white p-3 text-sm" data-export-skip>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <span className="font-semibold text-gray-800">{open ? '▾' : '▸'} History{events.length > 0 ? ` (${events.length})` : ''}</span>
        {!open && events.length > 0 && <span className="text-xs text-gray-500">last: {events[events.length - 1].summary} · {formatEnteredAt(events[events.length - 1].at)}</span>}
        {error && <span className="text-xs text-rose-700">{error}</span>}
      </button>
      {open && (
        <ol className="mt-2 divide-y divide-gray-100">
          {events.map((e, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-2 py-1">
              <span className="w-36 whitespace-nowrap text-xs tabular-nums text-gray-500">{formatEnteredAt(e.at)}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${KIND_STYLE[e.kind]}`}>{e.kind}</span>
              <span className="text-gray-800">{e.summary}</span>
              {e.detail && <span className="text-xs text-gray-500">{e.detail}</span>}
              {e.who && <span className="text-xs text-gray-400">by {e.who}</span>}
              {e.journalEntryId ? <JournalEntryLink id={e.journalEntryId} label="GL" /> : null}
            </li>
          ))}
          {events.length === 0 && <li className="py-1 text-xs text-gray-400">Nothing recorded yet.</li>}
        </ol>
      )}
    </div>
  );
}
