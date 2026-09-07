import { useCallback, useEffect, useState } from 'react';
import type { WorkpaperGroup, WorkpaperRow } from '@shared/domain/ledger/workpapers';
import type { WorkpaperAccountState, WorkpaperSheet } from '../../../main/ipc/workpapers.handlers';
import { Money } from '../../components/Money';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useUiStore } from '../../app/store/uiStore';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

/**
 * Two views of the same sheet, mirroring how QuickBooks Online Accountant splits its workpapers:
 *  - review: prior year first, with the sign-off, notes and attachments — the working view
 *  - grouping: current year first with each account's reference code (GIFI here, since that's the
 *    code Canadian statements and the T2 actually group by), for checking the statement mapping
 */
type WorkpaperTab = 'review' | 'grouping';

const TAB_LABELS: Record<WorkpaperTab, string> = {
  review: 'Review & adjust',
  grouping: 'Grouping & statements',
};

function todayIso(): string {
  return localIsoDate();
}

/** Dec 31 of the year that has most recently ended — the period a year-end review is normally for. */
function defaultPeriodEnd(): string {
  const now = new Date();
  return `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-12-31`;
}

function percent(value: number | null): string {
  if (value === null) return '—';
  return `${value >= 0 ? '' : '-'}${Math.abs(value).toFixed(2)}%`;
}

function changeClass(changeCents: number): string {
  if (changeCents === 0) return 'text-gray-400';
  return changeCents > 0 ? 'text-emerald-700' : 'text-red-600';
}

const STATUS_TITLES: Record<WorkpaperAccountState['status'], string> = {
  pending: 'Not yet reviewed — click to mark reviewed',
  reviewed: 'Reviewed — click to raise a query',
  query: 'Query outstanding — click to clear back to not reviewed',
};

/** Cycles pending → reviewed → query → pending, so one control covers the whole review state. */
function nextStatus(status: WorkpaperAccountState['status']): WorkpaperAccountState['status'] {
  if (status === 'pending') return 'reviewed';
  if (status === 'reviewed') return 'query';
  return 'pending';
}

function StatusDot({ status, onClick, disabled }: { status: WorkpaperAccountState['status']; onClick: () => void; disabled: boolean }) {
  const styles: Record<WorkpaperAccountState['status'], string> = {
    pending: 'border-gray-300 text-transparent hover:border-brand-400',
    reviewed: 'border-emerald-500 bg-emerald-500 text-white',
    query: 'border-amber-500 bg-amber-500 text-white',
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={STATUS_TITLES[status]}
      className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold leading-none ${styles[status]}`}
    >
      {status === 'query' ? '?' : '✓'}
    </button>
  );
}

interface TableProps {
  title: string;
  groups: WorkpaperGroup[];
  footer?: { label: string; current: number; prior: number };
}

/**
 * The working trial balance an accountant signs off at year end: prior year beside current year, the
 * change in dollars and percent, the adjusting-entry portion broken out, and a per-account review
 * state with notes and supporting documents attached.
 *
 * Review state is stored per year end, so starting a new year's review leaves last year's sign-offs
 * untouched.
 */
export function WorkpapersPage() {
  const setView = useUiStore((s) => s.setView);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd());
  const [tab, setTab] = useState<WorkpaperTab>('review');
  const [sheet, setSheet] = useState<WorkpaperSheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const reload = useCallback(() => {
    window.api.workpapers.sheet({ periodEnd, priorPeriodEnd: null }).then((r) => {
      if (r.ok) setSheet(r.data);
      else setError(r.error);
    });
  }, [periodEnd]);

  useEffect(reload, [reload]);

  function stateFor(accountId: number): WorkpaperAccountState {
    return sheet?.states.find((s) => s.accountId === accountId) ?? { accountId, status: 'pending', note: null, reviewedAt: null, attachments: [] };
  }

  async function run(action: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) return setError(result.error);
    reload();
  }

  function ReviewRow({ row }: { row: WorkpaperRow }) {
    const state = stateFor(row.account.id);
    const isEditingNote = noteFor === row.account.id;
    return (
      <>
        <tr className="border-t border-gray-100 hover:bg-brand-50/40">
          <td className="py-1.5 pl-2">
            <StatusDot
              status={state.status}
              disabled={busy}
              onClick={() => run(() => window.api.workpapers.setStatus({ periodEnd, accountId: row.account.id, status: nextStatus(state.status) }))}
            />
          </td>
          <td className="py-1.5 pl-2">
            {/* The reviewer's next question after "why did this move" is always "show me the
                transactions", so the account name is the drill-down. */}
            <button type="button" onClick={() => setView({ kind: 'report', report: 'generalLedger' })} className="text-left text-gray-700 hover:text-brand-700 hover:underline">
              {row.account.name}
            </button>
          </td>
          <td className="py-1.5 text-right text-gray-600">
            <Money cents={row.priorCents} />
          </td>
          <td className={`py-1.5 text-right ${changeClass(row.changeCents)}`}>{percent(row.changePercent)}</td>
          <td className={`py-1.5 text-right ${row.changeCents === 0 ? 'text-gray-400' : ''}`}>
            <Money cents={row.changeCents} />
          </td>
          <td className={`py-1.5 text-right ${row.adjustingCents === 0 ? 'text-gray-400' : 'font-medium text-brand-700'}`}>
            <Money cents={row.adjustingCents} />
          </td>
          <td className="py-1.5 text-right font-medium text-gray-800">
            <Money cents={row.currentCents} />
          </td>
          <td className="py-1.5 text-center">
            <button
              type="button"
              title={state.note ?? 'Add a note'}
              onClick={() => {
                setNoteFor(isEditingNote ? null : row.account.id);
                setNoteDraft(state.note ?? '');
              }}
              className={state.note ? 'text-brand-600' : 'text-gray-300 hover:text-gray-500'}
            >
              ✎
            </button>
          </td>
          <td className="py-1.5 text-center">
            <button
              type="button"
              disabled={busy}
              title="Attach supporting documents"
              onClick={() => run(() => window.api.workpapers.addAttachment({ periodEnd, accountId: row.account.id }))}
              className={state.attachments.length > 0 ? 'text-brand-600' : 'text-gray-300 hover:text-gray-500'}
            >
              📎{state.attachments.length > 0 ? <span className="ml-0.5 text-[10px]">{state.attachments.length}</span> : null}
            </button>
          </td>
        </tr>
        {state.attachments.length > 0 && (
          <tr className="bg-gray-50/60">
            <td />
            <td colSpan={8} className="pb-1.5 pl-2">
              <div className="flex flex-wrap gap-2">
                {state.attachments.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-gray-600 ring-1 ring-gray-200">
                    <button type="button" onClick={() => run(() => window.api.workpapers.openAttachment(a.id))} className="hover:text-brand-700 hover:underline">
                      {a.fileName}
                    </button>
                    <button type="button" disabled={busy} onClick={() => run(() => window.api.workpapers.removeAttachment(a.id))} className="text-gray-400 hover:text-red-600">
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </td>
          </tr>
        )}
        {isEditingNote && (
          <tr className="bg-brand-50/40">
            <td />
            <td colSpan={8} className="py-2 pl-2 pr-2">
              <textarea
                rows={2}
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                placeholder="What you checked, what still needs answering…"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    await run(() => window.api.workpapers.setNote({ periodEnd, accountId: row.account.id, note: noteDraft.trim() || null }));
                    setNoteFor(null);
                  }}
                  className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-200"
                >
                  Save note
                </button>
                <button type="button" onClick={() => setNoteFor(null)} className="rounded-full px-3 py-1 text-xs text-gray-600 hover:bg-gray-100">
                  Cancel
                </button>
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }

  function ReviewTable({ title, groups, footer }: TableProps) {
    return (
      <section className="rounded-xl2 border border-gray-200/80 bg-white shadow-soft">
        <div className="flex items-baseline justify-between border-b border-gray-100 px-4 py-2.5">
          <h2 className="text-sm font-bold text-gray-800">{title}</h2>
          <span className="text-xs text-gray-400">
            {sheet?.trialBalance.priorPeriodEnd} vs {sheet?.trialBalance.periodEnd}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-400">
                <th className="w-8 py-2 pl-2" />
                <th className="py-2 pl-2 text-left">Accounts</th>
                <th className="py-2 text-right">Ending balance {sheet?.trialBalance.priorPeriodEnd.slice(0, 4)}</th>
                <th className="py-2 text-right">% change</th>
                <th className="py-2 text-right">$ change</th>
                <th className="py-2 text-right">Adjusting entries</th>
                <th className="py-2 text-right">Year {sheet?.trialBalance.periodEnd.slice(0, 4)}</th>
                <th className="w-8 py-2 text-center">✎</th>
                <th className="w-10 py-2 text-center">📎</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <>
                  <tr key={g.label} className="bg-gray-50">
                    <td />
                    <td className="py-1.5 pl-2 text-xs font-bold uppercase tracking-wide text-gray-700">{g.label}</td>
                    <td className="py-1.5 text-right text-xs font-bold text-gray-700">
                      <Money cents={g.priorTotalCents} />
                    </td>
                    <td className="py-1.5 text-right text-xs font-bold text-gray-700">{percent(g.changePercent)}</td>
                    <td className="py-1.5 text-right text-xs font-bold text-gray-700">
                      <Money cents={g.changeCents} />
                    </td>
                    <td className="py-1.5 text-right text-xs font-bold text-gray-700">
                      <Money cents={g.adjustingTotalCents} />
                    </td>
                    <td className="py-1.5 text-right text-xs font-bold text-gray-700">
                      <Money cents={g.currentTotalCents} />
                    </td>
                    <td colSpan={2} />
                  </tr>
                  {g.rows.length === 0 ? (
                    <tr key={`${g.label}-empty`} className="border-t border-gray-100">
                      <td />
                      <td colSpan={8} className="py-1.5 pl-4 text-xs text-gray-400">
                        Nothing in this section for either period.
                      </td>
                    </tr>
                  ) : (
                    g.rows.map((row) => <ReviewRow key={row.account.id} row={row} />)
                  )}
                </>
              ))}
              {footer && (
                <tr className="border-t-2 border-gray-200 bg-gray-50/80">
                  <td />
                  <td className="py-2 pl-2 text-xs font-bold uppercase tracking-wide text-gray-800">{footer.label}</td>
                  <td className="py-2 text-right text-xs font-bold text-gray-800">
                    <Money cents={footer.prior} />
                  </td>
                  <td colSpan={3} />
                  <td className="py-2 text-right text-xs font-bold text-gray-800">
                    <Money cents={footer.current} />
                  </td>
                  <td colSpan={2} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  /** Current-year-first with the reference code, and no review controls — this tab is for confirming
   *  each account rolls into the right statement line, not for sign-off. */
  function GroupingTable({ title, groups, footer }: TableProps) {
    return (
      <section className="rounded-xl2 border border-gray-200/80 bg-white shadow-soft">
        <div className="flex items-baseline justify-between border-b border-gray-100 px-4 py-2.5">
          <h2 className="text-sm font-bold text-gray-800">{title}</h2>
          <span className="text-xs text-gray-400">Reference code = GIFI</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-400">
                <th className="py-2 pl-2 text-left">Accounts</th>
                <th className="py-2 text-left">Reference code</th>
                <th className="py-2 text-right">Year {sheet?.trialBalance.periodEnd.slice(0, 4)}</th>
                <th className="py-2 text-right">Year {sheet?.trialBalance.priorPeriodEnd.slice(0, 4)}</th>
                <th className="py-2 text-right">% change</th>
                <th className="py-2 text-right">$ change</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <>
                  <tr key={g.label} className="bg-gray-50">
                    <td className="py-1.5 pl-2 text-xs font-bold uppercase tracking-wide text-gray-700">{g.label}</td>
                    <td />
                    <td className="py-1.5 text-right text-xs font-bold text-gray-700">
                      <Money cents={g.currentTotalCents} />
                    </td>
                    <td className="py-1.5 text-right text-xs font-bold text-gray-700">
                      <Money cents={g.priorTotalCents} />
                    </td>
                    <td className="py-1.5 text-right text-xs font-bold text-gray-700">{percent(g.changePercent)}</td>
                    <td className="py-1.5 text-right text-xs font-bold text-gray-700">
                      <Money cents={g.changeCents} />
                    </td>
                  </tr>
                  {g.rows.map((row) => (
                    <tr key={row.account.id} className="border-t border-gray-100 hover:bg-brand-50/40">
                      <td className="py-1.5 pl-4 text-gray-700">
                        {row.account.name}
                      </td>
                      <td className={`py-1.5 ${row.account.gifiCode ? 'text-gray-600' : 'text-amber-600'}`}>{row.account.gifiCode ?? 'unmapped'}</td>
                      <td className="py-1.5 text-right font-medium text-gray-800">
                        <Money cents={row.currentCents} />
                      </td>
                      <td className="py-1.5 text-right text-gray-600">
                        <Money cents={row.priorCents} />
                      </td>
                      <td className={`py-1.5 text-right ${changeClass(row.changeCents)}`}>{percent(row.changePercent)}</td>
                      <td className={`py-1.5 text-right ${row.changeCents === 0 ? 'text-gray-400' : ''}`}>
                        <Money cents={row.changeCents} />
                      </td>
                    </tr>
                  ))}
                </>
              ))}
              {footer && (
                <tr className="border-t-2 border-gray-200 bg-gray-50/80">
                  <td className="py-2 pl-2 text-xs font-bold uppercase tracking-wide text-gray-800">{footer.label}</td>
                  <td />
                  <td className="py-2 text-right text-xs font-bold text-gray-800">
                    <Money cents={footer.current} />
                  </td>
                  <td className="py-2 text-right text-xs font-bold text-gray-800">
                    <Money cents={footer.prior} />
                  </td>
                  <td colSpan={2} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function Sheet(props: TableProps) {
    return tab === 'grouping' ? <GroupingTable {...props} /> : <ReviewTable {...props} />;
  }

  const progress = sheet?.progress;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="text-gray-600">Year end</span>
          <input type="date" max={todayIso()} className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5" value={periodEnd} onChange={(e) => setPeriodEnd(clampIsoDate(e.target.value))} />
        </label>
        {progress && (
          <div className="flex items-center gap-3 pb-1 text-xs">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">{progress.reviewed} reviewed</span>
            {progress.queries > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">{progress.queries} queries</span>}
            <span className="text-gray-500">
              {progress.reviewed} of {progress.total} accounts signed off
            </span>
          </div>
        )}
      </div>

      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={(['review', 'grouping'] as WorkpaperTab[]).map((t) => ({ value: t, label: TAB_LABELS[t] }))}
      />

      {tab === 'grouping' ? (
        <p className="text-sm text-gray-500">
          Which statement line each account rolls into, by GIFI reference code — the grouping your statements and the T2 are built from. Accounts marked
          <span className="mx-1 text-amber-600">unmapped</span> have no GIFI code yet and fall outside the grouped totals on a GIFI export.
        </p>
      ) : (
        <p className="text-sm text-gray-500">
          Prior year beside the current year, with the change in dollars and percent and the adjusting-entry portion broken out. Click the circle to cycle an
          account through reviewed → query → not reviewed; the pencil adds a note and the clip attaches supporting documents. Sign-offs are saved per year end.
        </p>
      )}

      {error && <div className="rounded-xl2 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {sheet && (
        <>
          <Sheet
            title="Balance sheet"
            groups={sheet.statements.balanceSheet}
            footer={{
              label: 'Total liabilities and equity',
              current: sheet.statements.balanceSheet[1].currentTotalCents + sheet.statements.balanceSheet[2].currentTotalCents,
              prior: sheet.statements.balanceSheet[1].priorTotalCents + sheet.statements.balanceSheet[2].priorTotalCents,
            }}
          />

          {sheet.statements.balanceSheetDifferenceCents !== 0 && (
            <p className="text-xs text-amber-600">
              Assets exceed liabilities plus equity by <Money cents={sheet.statements.balanceSheetDifferenceCents} />. Until closing entries are posted this is
              expected to equal net income for the year (<Money cents={sheet.statements.netIncomeCurrentCents} />) — investigate only if the two differ.
            </p>
          )}

          <Sheet
            title="Profit and loss"
            groups={sheet.statements.profitAndLoss}
            footer={{ label: 'Net income', current: sheet.statements.netIncomeCurrentCents, prior: sheet.statements.netIncomePriorCents }}
          />
        </>
      )}
    </div>
  );
}
