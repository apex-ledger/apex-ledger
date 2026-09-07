import { useEffect, useMemo, useState } from 'react';
import { BackupRecoveryPanel } from '../bookkeeping-checklist/BackupRecoveryPanel';
import { BookkeepingChecklistContent } from '../bookkeeping-checklist/BookkeepingChecklistPage';
import type { ActionCentreData, ActionItem, ActionSection, ActionSeverity } from '@shared/domain/workflow/actionCentre';
import { useUiStore, type View } from '../../app/store/uiStore';
import { Money } from '../../components/Money';

const SECTION_TITLES: Record<ActionSection, { title: string; blurb: string }> = {
  due: { title: 'Due & overdue', blurb: 'Money to pay, money to collect, and government deadlines.' },
  post: { title: 'To post or clear', blurb: 'Drafts and queues that are not in the books yet.' },
  suggest: { title: 'Suggestions', blurb: 'Things the books point to; do them when convenient.' },
};

const SEVERITY_STYLE: Record<ActionSeverity, { row: string; chip: string; label: string }> = {
  overdue: { row: 'bg-red-50', chip: 'bg-red-100 text-red-800', label: 'Overdue' },
  today: { row: 'bg-amber-50', chip: 'bg-amber-100 text-amber-800', label: 'Today' },
  soon: { row: 'bg-yellow-50', chip: 'bg-yellow-100 text-yellow-800', label: 'Soon' },
  info: { row: 'bg-white', chip: 'bg-gray-100 text-gray-600', label: '' },
};

/** The one screen to open first each morning: everything waiting, most urgent first, each with a
 * button to the screen that clears it. */
export function ActionCentrePage() {
  const setView = useUiStore((s) => s.setView);
  const setActionCentreCount = useUiStore((s) => s.setActionCentreCount);
  const refreshNonce = useUiStore((s) => s.refreshNonce);
  const [data, setData] = useState<ActionCentreData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActionSection | 'all'>('all');
  const [routineOpen, setRoutineOpen] = useState(false);
  const [showHow, setShowHow] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem('actionCentre.dismissed');
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    let cancelled = false;
    window.api.actionCentre.items().then((r) => {
      if (cancelled) return;
      if (!r.ok) return setError(r.error);
      setData(r.data);
      setActionCentreCount(r.data.counts.overdue + r.data.counts.today + r.data.counts.soon);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshNonce, setActionCentreCount]);

  const visible = useMemo(() => (data?.items ?? []).filter((i) => !dismissed.has(i.id)).filter((i) => filter === 'all' || i.section === filter), [data, dismissed, filter]);
  const grouped = useMemo(() => {
    const out: Record<ActionSection, ActionItem[]> = { due: [], post: [], suggest: [] };
    for (const i of visible) out[i.section].push(i);
    return out;
  }, [visible]);

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        sessionStorage.setItem('actionCentre.dismissed', JSON.stringify([...next]));
      } catch {
        /* storage unavailable: the item simply reappears next time */
      }
      return next;
    });
  }

  const counts = data?.counts ?? { overdue: 0, today: 0, soon: 0, total: 0 };

  return (
    <div className="relative space-y-3 p-3" data-testid="action-centre">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Action Centre</h1>
          <p className="text-sm text-gray-500">What needs doing, most urgent first. Built from the books as of {data?.generatedAt ?? '…'}.</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <Stat label="Overdue" value={counts.overdue} className="bg-red-100 text-red-800" />
          <Stat label="Today" value={counts.today} className="bg-amber-100 text-amber-800" />
          <Stat label="Soon" value={counts.soon} className="bg-yellow-100 text-yellow-800" />
          <Stat label="All items" value={counts.total} className="bg-gray-100 text-gray-700" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        {(['all', 'due', 'post', 'suggest'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 ${filter === f ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {f === 'all' ? 'Everything' : SECTION_TITLES[f].title}
          </button>
        ))}
        {dismissed.size > 0 && (
          <button type="button" onClick={() => { setDismissed(new Set()); try { sessionStorage.removeItem('actionCentre.dismissed'); } catch { /* ignore */ } }} className="ml-auto text-gray-400 hover:underline">
            Show {dismissed.size} hidden
          </button>
        )}
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {data && visible.length === 0 && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">Nothing waiting. The books are caught up.</div>
      )}
      {(['due', 'post', 'suggest'] as ActionSection[]).map((section) =>
        grouped[section].length === 0 ? null : (
          <section key={section} className="rounded border border-gray-200 bg-white" data-testid={`action-section-${section}`}>
            <div className="border-b border-gray-100 px-3 py-2">
              <h2 className="text-sm font-semibold text-gray-800">{SECTION_TITLES[section].title} <span className="ml-1 text-xs font-normal text-gray-400">{grouped[section].length}</span></h2>
              <p className="text-xs text-gray-400">{SECTION_TITLES[section].blurb}</p>
            </div>
            <ul className="divide-y divide-gray-100">
              {grouped[section].map((item) => {
                const style = SEVERITY_STYLE[item.severity];
                return (
                  <li key={item.id} className={`flex items-center gap-3 px-3 py-2 ${style.row}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {style.label && <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.chip}`}>{style.label}</span>}
                        <span className="truncate text-sm font-medium text-gray-900">{item.title}</span>
                      </div>
                      <div className="text-xs text-gray-500">{item.detail}{item.dueDate ? ` · ${item.dueDate}` : ''}
                        {item.howTo.length > 0 && (
                          <button type="button" onClick={() => setShowHow((prev) => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} className="ml-2 text-brand-600 hover:underline">
                            {showHow.has(item.id) ? 'Hide steps' : 'How to complete'}
                          </button>
                        )}
                      </div>
                      {showHow.has(item.id) && (
                        <div className="mt-1 rounded bg-white/70 px-3 py-2 text-xs text-gray-700">
                          <ol className="list-decimal space-y-0.5 pl-6">
                            {item.howTo.map((step, i) => <li key={i}>{step}</li>)}
                          </ol>
                          {item.example && <p className="mt-1.5 border-t border-gray-100 pt-1.5 text-gray-600"><span className="font-semibold text-gray-700">Example: </span>{item.example}</p>}
                        </div>
                      )}
                    </div>
                    {item.amountCents !== undefined && <div className="w-28 text-right text-sm tabular-nums text-gray-800"><Money cents={item.amountCents} /></div>}
                    <button type="button" onClick={() => setView(item.target as unknown as View)} className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-200">
                      {item.actionLabel}
                    </button>
                    <button type="button" onClick={() => dismiss(item.id)} title="Hide until next sign-in" className="text-xs text-gray-400 hover:text-gray-700">
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ),
      )}
      <section className="rounded border border-gray-200 bg-white" data-testid="month-end-routine">
        <button type="button" onClick={() => setRoutineOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 text-left" aria-expanded={routineOpen}>
          <span>
            <span className="text-sm font-semibold text-gray-800">Month-end routine</span>
            <span className="ml-2 text-xs text-gray-400">Backups, company health check, cash outlook and the step-by-step checklist. The items above are what is due; this is the routine to run every month whether or not anything is due.</span>
          </span>
          <span className="text-xs text-brand-700">{routineOpen ? 'Hide' : 'Show'}</span>
        </button>
        {routineOpen && (
          <div className="space-y-3 border-t border-gray-100 p-3">
            <BackupRecoveryPanel />
            <BookkeepingChecklistContent />
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 font-medium ${className}`}>
      {value} {label}
    </span>
  );
}
