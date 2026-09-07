import { useMemo, useState } from 'react';
import { DECISION_LABELS, type SignoffCheck, type SignoffLight, type SignoffTarget, type YearEndSignoffReport } from '@shared/domain/audit/yearEndSignoff';
import type { ReportKind } from '../../app/store/uiStore';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { DateInput } from '../../components/DateInput';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';

const LIGHT: Record<SignoffLight, { dot: string; row: string; word: string }> = {
  green: { dot: 'bg-emerald-500', row: '', word: 'Pass' },
  amber: { dot: 'bg-amber-400', row: 'bg-amber-50', word: 'Review' },
  red: { dot: 'bg-red-500', row: 'bg-red-50', word: 'Fix' },
};

const DECISION_TONE = {
  ready: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  readyWithNotes: 'border-amber-300 bg-amber-50 text-amber-900',
  notReady: 'border-red-300 bg-red-50 text-red-900',
} as const;

/** The traffic light: three lamps, the live one lit. Reads the same at a glance as the paper form. */
function TrafficLight({ light }: { light: SignoffLight }) {
  return (
    <span className="inline-flex flex-col items-center gap-0.5 rounded bg-gray-800 px-1 py-1" aria-label={LIGHT[light].word} title={LIGHT[light].word}>
      {(['red', 'amber', 'green'] as SignoffLight[]).map((lamp) => (
        <span key={lamp} className={`block h-2.5 w-2.5 rounded-full ${lamp === light ? LIGHT[lamp].dot : 'bg-gray-600'}`} />
      ))}
    </span>
  );
}

/** Year-End Sign-off: the clipboard. Every check is a row with its light, the reason, and a way
 * in; the decision at the bottom follows from the lights and is recorded under the reviewer's
 * name. Re-run after each correction and watch the reds turn green. */
export function YearEndSignoffPage() {
  const setView = useUiStore((s) => s.setView);
  const today = localIsoDate();
  const [periodStart, setPeriodStart] = useState(`${today.slice(0, 4)}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [showPassed, setShowPassed] = useState(true);
  const [reviewer, setReviewer] = useState('');
  const [note, setNote] = useState('');
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useIpcQuery(() => window.api.reports.yearEndSignoff({ periodStart, periodEnd }), [periodStart, periodEnd, refresh]);
  const history = useIpcQuery(() => window.api.reports.yearEndSignoffHistory(), [refresh]);

  const sections = useMemo(() => {
    const out = new Map<string, SignoffCheck[]>();
    for (const c of data?.checks ?? []) {
      if (!showPassed && c.light === 'green') continue;
      out.set(c.section, [...(out.get(c.section) ?? []), c]);
    }
    return [...out.entries()];
  }, [data, showPassed]);

  function open(target: SignoffTarget | undefined) {
    if (!target) return;
    if (target.kind === 'report') {
      if (target.report === 'generalLedger' && target.accountId) setView({ kind: 'report', report: 'generalLedger', drillDown: { accountId: target.accountId, dateFrom: periodStart, dateTo: periodEnd } });
      else setView({ kind: 'report', report: target.report as ReportKind });
      return;
    }
    switch (target.page) {
      case 'bankReconciliation': setView({ kind: 'bankReconciliation' }); break;
      case 'hstCentre': setView({ kind: 'hstCentre' }); break;
      case 'payroll': setView({ kind: 'payroll' }); break;
      case 'journalList': setView({ kind: 'journalList' }); break;
      case 'chartOfAccounts': setView({ kind: 'chartOfAccounts' }); break;
      case 'vendors': setView({ kind: 'expenses', tab: 'vendors' }); break;
      case 'customers': setView({ kind: 'sales', tab: 'customers' }); break;
      case 'inventory': setView({ kind: 'products' }); break;
      case 'monthEndClose': setView({ kind: 'monthEndClose' }); break;
      case 'deposits': setView({ kind: 'sales', tab: 'deposits' }); break;
    }
  }

  async function sign() {
    setSigning(true);
    setSignError(null);
    const result = await window.api.reports.yearEndSignoffSign({ periodStart, periodEnd, reviewer: reviewer.trim() || undefined, note: note.trim() || null });
    setSigning(false);
    if (!result.ok) { setSignError(result.error); return; }
    setNote('');
    setRefresh((n) => n + 1);
  }

  return (
    <div className="w-full space-y-4" data-testid="year-end-signoff">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">From</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <label className="text-sm text-gray-600">To</label>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
        <button type="button" onClick={() => setRefresh((n) => n + 1)} className="rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700 hover:bg-brand-200">Re-run checks</button>
        <label className="flex items-center gap-1 text-xs text-gray-500"><input type="checkbox" checked={showPassed} onChange={(e) => setShowPassed(e.target.checked)} /> Show checks that passed</label>
        {data && (
          <div className="ml-auto flex items-center gap-2 text-xs" data-export-skip>
            <span className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-800">{data.counts.red} to fix</span>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">{data.counts.amber} to review</span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">{data.counts.green} passed</span>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500">
        Red must change before the period is signed. Amber is worth a look and a note. Click a row's Open button to go to the screen that fixes it, then come back and re-run.
      </p>

      {loading && <p className="text-sm text-gray-500">Running checks…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {data && sections.map(([section, checks]) => (
        <section key={section} className="overflow-hidden rounded border border-gray-200">
          <h3 className="bg-gray-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">{section}</h3>
          <table className="w-full text-sm">
            <thead className="sr-only"><tr><th>Light</th><th>Check</th><th>Result</th><th>Open</th></tr></thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id} className={`border-t border-gray-100 align-top ${LIGHT[c.light].row}`}>
                  <td className="w-10 px-3 py-2"><TrafficLight light={c.light} /></td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${c.light === 'green' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-400 text-transparent'}`}>✓</span>
                      <span className="font-medium text-gray-900">{c.title}</span>
                    </div>
                    <div className="mt-0.5 pl-6 text-gray-700">{c.summary}</div>
                    {c.action && c.light !== 'green' && <div className="mt-0.5 pl-6 text-xs text-gray-500">{c.action}</div>}
                  </td>
                  <td className="w-12 px-2 py-2 text-right text-xs font-medium text-gray-500">{LIGHT[c.light].word}</td>
                  <td className="w-16 px-2 py-2 text-right" data-export-skip>
                    {c.target && <button type="button" onClick={() => open(c.target)} className="text-brand-700 hover:underline">Open →</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {data && <DecisionBox report={data} reviewer={reviewer} note={note} signing={signing} signError={signError} onReviewer={setReviewer} onNote={setNote} onSign={() => void sign()} />}

      {history.data && history.data.length > 0 && (
        <section className="rounded border border-gray-200">
          <h3 className="bg-gray-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">Previous sign-offs</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 text-left text-xs text-gray-500"><th className="px-3 py-1.5">Signed</th><th className="px-3 py-1.5">Period</th><th className="px-3 py-1.5">Reviewer</th><th className="px-3 py-1.5">Decision</th><th className="px-3 py-1.5 text-right">Fix / Review / Pass</th><th className="px-3 py-1.5">Note</th></tr></thead>
            <tbody>
              {history.data.map((h) => (
                <tr key={h.id} className="border-b border-gray-100">
                  <td className="px-3 py-1.5 tabular-nums text-gray-600">{h.signedAt.slice(0, 16)}</td>
                  <td className="px-3 py-1.5 tabular-nums">{h.periodStart} to {h.periodEnd}</td>
                  <td className="px-3 py-1.5">{h.reviewer}</td>
                  <td className="px-3 py-1.5"><span className={`rounded-full border px-2 py-0.5 text-xs ${DECISION_TONE[h.decision]}`}>{DECISION_LABELS[h.decision]}</span></td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{h.redCount} / {h.amberCount} / {h.greenCount}</td>
                  <td className="px-3 py-1.5 text-gray-600">{h.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function DecisionBox({ report, reviewer, note, signing, signError, onReviewer, onNote, onSign }: { report: YearEndSignoffReport; reviewer: string; note: string; signing: boolean; signError: string | null; onReviewer: (v: string) => void; onNote: (v: string) => void; onSign: () => void }) {
  const tone = DECISION_TONE[report.decision];
  const text = report.decision === 'ready'
    ? 'Every check is green. The period can be signed off and locked.'
    : report.decision === 'readyWithNotes'
      ? `${report.counts.amber} ${report.counts.amber === 1 ? 'item is' : 'items are'} amber. Sign with a note explaining each, or clear them first.`
      : `${report.counts.red} ${report.counts.red === 1 ? 'item' : 'items'} must be fixed before this period is signed. The decision is recorded as it stands.`;
  return (
    <section className={`rounded border-2 p-4 ${tone}`} data-testid="signoff-decision">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[16rem] flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-70">Final report &amp; decision</div>
          <div className="mt-1 text-2xl font-bold">{DECISION_LABELS[report.decision]}</div>
          <p className="mt-1 text-sm">{text}</p>
        </div>
        <div className="flex w-full max-w-md flex-col gap-2 text-sm" data-export-skip>
          <label className="flex items-center gap-2">
            <span className="w-20 text-xs font-medium">Reviewer</span>
            <input value={reviewer} onChange={(e) => onReviewer(e.target.value)} placeholder="Your name (defaults to the signed-in user)" className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-gray-900" />
          </label>
          <label className="flex items-start gap-2">
            <span className="w-20 pt-1 text-xs font-medium">Note</span>
            <textarea value={note} onChange={(e) => onNote(e.target.value)} rows={2} placeholder="What was reviewed, what stays open and why" className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-gray-900" />
          </label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onSign} disabled={signing} className="rounded-full bg-brand-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50">
              {signing ? 'Recording…' : `Record decision: ${DECISION_LABELS[report.decision]}`}
            </button>
            {signError && <span className="text-xs text-red-700">{signError}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
