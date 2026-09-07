import { useMemo, useState } from 'react';
import type { JournalEntryRevisionRow } from '../../../preload/index';
import { DateInput } from '../../components/DateInput';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';
import { openOriginalEntry } from '../../utils/openOriginalEntry';
import { OpenEntryButton } from '../../components/OpenEntryButton';
import { userAuditStyle } from '../../utils/userAuditColor';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Every correction the accountant made to data somebody else supplied.
 *
 * The client sends a spreadsheet, it gets imported, and then the accountant fixes what is wrong
 * with it — a repair booked as rent, an amount that doesn't match the invoice, a missing tax code.
 * Those corrections ARE the adjusting entries, and this is the report of them: what was changed, on
 * which entry, from what to what.
 *
 * Colour carries the kind of change, so the shape of a year's adjustments is readable at a glance
 * without having to read every row:
 *   amber  — a value was corrected (the common case)
 *   green  — a line the accountant added
 *   rose   — a line the accountant removed
 * Amounts are shown as "old → new" rather than only the result, because the point of the report is
 * the difference.
 */

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

const KIND_STYLES: Record<string, { row: string; chip: string; label: string }> = {
  changed: { row: 'bg-amber-50/60', chip: 'bg-amber-100 text-amber-800', label: 'Changed' },
  added: { row: 'bg-emerald-50/60', chip: 'bg-emerald-100 text-emerald-800', label: 'Added' },
  removed: { row: 'bg-rose-50/60', chip: 'bg-rose-100 text-rose-800', label: 'Removed' },
};

const SOURCE_LABELS: Record<string, string> = {
  clientImport: 'Client spreadsheet',
  bankImport: 'Bank import',
  manual: 'Entered here',
};

export function AdjustingEntriesPage() {
  const setView = useUiStore((s) => s.setView);
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [kindFilter, setKindFilter] = useState<'all' | 'changed' | 'added' | 'removed'>('all');
  const { data: identity } = useIpcQuery(() => window.api.access.getIdentity(), []);

  const { data, loading, error } = useIpcQuery(
    () => window.api.journal.revisions({ periodStart, periodEnd }),
    [periodStart, periodEnd],
  );

  const rows = useMemo(
    () => (data ?? []).filter((r) => kindFilter === 'all' || r.kind === kindFilter),
    [data, kindFilter],
  );

  /** Grouped by entry, because an accountant reviews an entry as a whole — three corrections to one
   * entry is one decision, not three. */
  const grouped = useMemo(() => {
    const map = new Map<number, { entry: JournalEntryRevisionRow; changes: JournalEntryRevisionRow[] }>();
    for (const row of rows) {
      if (!map.has(row.journalEntryId)) map.set(row.journalEntryId, { entry: row, changes: [] });
      map.get(row.journalEntryId)!.changes.push(row);
    }
    return [...map.values()];
  }, [rows]);

  const counts = useMemo(() => {
    const all = data ?? [];
    return {
      entries: new Set(all.map((r) => r.journalEntryId)).size,
      changed: all.filter((r) => r.kind === 'changed').length,
      added: all.filter((r) => r.kind === 'added').length,
      removed: all.filter((r) => r.kind === 'removed').length,
    };
  }, [data]);

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">From</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <label className="text-sm text-gray-600">To</label>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
        <select
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
        >
          <option value="all">All changes</option>
          <option value="changed">Corrected values only</option>
          <option value="added">Lines added only</option>
          <option value="removed">Lines removed only</option>
        </select>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {data && data.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-gray-100 px-2 py-1 text-gray-700">
            {counts.entries} entr{counts.entries === 1 ? 'y' : 'ies'} adjusted
          </span>
          <span className="rounded bg-amber-100 px-2 py-1 text-amber-800">{counts.changed} corrected</span>
          <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-800">{counts.added} added</span>
          <span className="rounded bg-rose-100 px-2 py-1 text-rose-800">{counts.removed} removed</span>
        </div>
      )}

      {data && data.length === 0 && !loading && (
        <div className="rounded border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
          No adjustments recorded in this period. Changes are tracked on entries that came from somewhere else — a client
          spreadsheet or a bank import — so that the corrections made to them can be reported. Entries typed directly into this app
          are not tracked, since editing your own draft is not an adjustment.
        </div>
      )}

      {grouped.map(({ entry, changes }) => (
        <div key={entry.journalEntryId} className="rounded border border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
            <div className="text-sm">
              <button
                type="button"
                className="font-medium text-brand-700 hover:underline"
                onClick={() => void openOriginalEntry(entry.journalEntryId, setView)}
                title="Open original entry"
              >
                {entry.entryDate} · Entry #{entry.journalEntryId}
              </button>
              {entry.memo && <span className="ml-2 text-gray-600">{entry.memo}</span>}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <OpenEntryButton entryId={entry.journalEntryId} />
              {entry.status === 'void' && <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-800">Voided</span>}
              {entry.status === 'draft' && <span className="rounded bg-gray-200 px-2 py-0.5 text-gray-700">Draft</span>}
              {entry.isAdjustingEntry && (
                <span className="rounded bg-violet-100 px-2 py-0.5 text-violet-800">Flagged adjusting</span>
              )}
              <span className="rounded bg-sky-100 px-2 py-0.5 text-sky-800">
                {SOURCE_LABELS[entry.source] ?? entry.source}
              </span>
              {entry.sourceReference && <span className="text-gray-400">{entry.sourceReference}</span>}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-3 py-1.5 font-medium">What</th>
                <th className="px-3 py-1.5 font-medium">Line</th>
                <th className="px-3 py-1.5 font-medium">Was</th>
                <th className="px-3 py-1.5 font-medium">Now</th>
                <th className="px-3 py-1.5 font-medium">Changed</th>
                <th className="px-3 py-1.5 font-medium">User</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => {
                const style = KIND_STYLES[c.kind] ?? KIND_STYLES.changed;
                return (
                  <tr key={c.id} className={`border-b border-gray-100 last:border-0 ${style.row}`}>
                    <td className="px-3 py-1.5">
                      <span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${style.chip}`}>{style.label}</span>
                      {c.label}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-gray-500">{c.lineLabel ?? '—'}</td>
                    <td className="px-3 py-1.5 tabular-nums text-gray-500">
                      {c.oldValue === null ? <span className="text-gray-300">—</span> : <s>{c.oldValue}</s>}
                    </td>
                    <td className="px-3 py-1.5 font-medium tabular-nums">
                      {c.newValue === null ? <span className="text-gray-300">—</span> : c.newValue}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-gray-400">{c.changedAt.slice(0, 16).replace('T', ' ')}</td>
                    <td className="px-3 py-1.5"><span className={`rounded px-2 py-0.5 text-xs ring-1 ${userAuditStyle(c.changedBy, identity?.name).badge}`}>{c.changedBy ?? 'Legacy/local'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      <p className="text-xs text-gray-400">
        Filtered on the entry's own date, not on when the correction was made — a March entry fixed in June belongs to March. Click
        an entry number to open it.
      </p>
    </div>
  );
}
