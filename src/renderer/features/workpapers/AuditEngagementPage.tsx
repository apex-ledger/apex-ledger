import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { useEffect, useMemo, useState } from 'react';
import {
  AUDIT_PHASE_LABELS,
  type AuditDocument,
  type AuditDocumentStatus,
  type AuditEngagement,
  type AuditPhase,
} from '@shared/domain/audit/auditEngagement';

function defaultPeriodEnd(): string {
  const year = new Date().getFullYear();
  return `${year}-12-31`;
}

function dollars(cents: number | null): string {
  return cents == null ? '' : (cents / 100).toFixed(2);
}

function cents(value: string): number {
  const parsed = Number(value.replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

const STATUS_STYLES: Record<AuditDocumentStatus, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-sky-100 text-sky-800',
  prepared: 'bg-indigo-100 text-indigo-800',
  reviewed: 'bg-emerald-100 text-emerald-800',
  query: 'bg-amber-100 text-amber-900',
};

const STATUS_LABELS: Record<AuditDocumentStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  prepared: 'Prepared',
  reviewed: 'Reviewed',
  query: 'Query',
};

export function AuditEngagementPage() {
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd());
  const [engagement, setEngagement] = useState<AuditEngagement | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [content, setContent] = useState('');
  const [preparer, setPreparer] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [materiality, setMateriality] = useState({ basis: '', basisAmount: '', percent: '1.00', overall: '', performance: '', trivial: '', rationale: '' });

  const selected = engagement?.documents.find((document) => document.id === selectedId) ?? engagement?.documents[0] ?? null;
  const locked = engagement?.status === 'locked';

  function apply(next: AuditEngagement) {
    setEngagement(next);
    const document = next.documents.find((item) => item.id === selectedId) ?? next.documents[0];
    if (document) {
      setSelectedId(document.id);
      setContent(document.content);
    }
    setMateriality({
      basis: next.materialityBasis ?? '',
      basisAmount: dollars(next.materialityBasisCents),
      percent: next.materialityPercent == null ? '1.00' : String(next.materialityPercent),
      overall: dollars(next.overallMaterialityCents),
      performance: dollars(next.performanceMaterialityCents),
      trivial: dollars(next.trivialMisstatementCents),
      rationale: next.materialityRationale ?? '',
    });
  }

  useEffect(() => {
    setBusy(true);
    setError(null);
    window.api.auditEngagement.get({ periodEnd }).then((result) => {
      setBusy(false);
      if (!result.ok) return setError(result.error);
      apply(result.data);
    });
  }, [periodEnd]);

  useEffect(() => {
    if (selected) setContent(selected.content);
  }, [selected?.id]);

  async function run(action: () => ReturnType<typeof window.api.auditEngagement.get>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) return setError(result.error);
    apply(result.data);
  }

  const byPhase = useMemo(() => {
    const phases = Object.keys(AUDIT_PHASE_LABELS) as AuditPhase[];
    return phases.map((phase) => ({ phase, documents: engagement?.documents.filter((document) => document.phase === phase) ?? [] }));
  }, [engagement]);

  function selectDocument(document: AuditDocument) {
    setSelectedId(document.id);
    setContent(document.content);
    setReviewNote('');
    setError(null);
  }

  function calculateOverall() {
    const amount = cents(materiality.basisAmount);
    const percent = Number(materiality.percent) || 0;
    setMateriality((current) => ({ ...current, overall: dollars(Math.round(amount * percent / 100)) }));
  }

  if (!engagement) return <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-500">{error ?? 'Loading audit engagement…'}</div>;

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-soft">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Audit engagement file</h2>
            <p className="text-xs text-gray-500">Indexed workpapers with separate preparer and reviewer sign-off.</p>
          </div>
          <label className="ml-auto text-xs font-medium text-gray-600">Year end
            <input type="date" min={DATE_MIN} max={DATE_MAX} value={periodEnd} onChange={(event) => setPeriodEnd(clampIsoDate(event.target.value))} className="ml-2 rounded-lg border border-gray-300 px-2 py-1.5" />
          </label>
          <label className="text-xs font-medium text-gray-600">Stage
            <select disabled={locked || busy} value={engagement.status} onChange={(event) => run(() => window.api.auditEngagement.setStatus({ engagementId: engagement.id, status: event.target.value }))} className="ml-2 rounded-lg border border-gray-300 px-2 py-1.5">
              <option value="planning">Planning</option><option value="fieldwork">Fieldwork</option><option value="completion">Completion</option>{locked && <option value="locked">Locked</option>}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">{engagement.progress.reviewed} reviewed</span>
          <span className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-800">{engagement.progress.prepared} prepared</span>
          <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">{engagement.progress.queries} queries</span>
          <span className="text-gray-500">{engagement.progress.total} documents</span>
          <div className="h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-emerald-500" style={{ width: `${engagement.progress.total ? engagement.progress.reviewed / engagement.progress.total * 100 : 0}%` }} /></div>
          {locked ? <span className="font-semibold text-emerald-800">Locked by {engagement.lockedBy} on {engagement.lockedAt?.slice(0, 10)}</span> : (
            <button type="button" disabled={busy} onClick={() => {
              if (!reviewer.trim()) return setError('Enter the reviewer/partner name before locking.');
              void run(() => window.api.auditEngagement.lock({ engagementId: engagement.id, confirmedBy: reviewer.trim() }));
            }} className="rounded-lg border border-gray-300 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50">Lock final file</button>
          )}
        </div>
      </section>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid min-h-[560px] grid-cols-1 gap-3 xl:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-500">Document index</div>
          <div className="max-h-[720px] overflow-y-auto p-2">
            {byPhase.map(({ phase, documents }) => <div key={phase} className="mb-3">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{AUDIT_PHASE_LABELS[phase]}</div>
              {documents.map((document) => <button key={document.id} type="button" onClick={() => selectDocument(document)} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${selected?.id === document.id ? 'bg-brand-100 text-brand-900 ring-1 ring-brand-300' : 'hover:bg-gray-50'}`}>
                <span className="w-11 flex-none font-bold">{document.indexCode}</span><span className="min-w-0 flex-1 truncate">{document.title}</span><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_STYLES[document.status]}`}>{STATUS_LABELS[document.status]}</span>
              </button>)}
            </div>)}
          </div>
        </aside>

        {selected && <main className="rounded-xl border border-gray-200 bg-white p-3 shadow-soft">
          <div className="flex flex-wrap items-start gap-3 border-b border-gray-100 pb-3">
            <div><div className="text-xs font-bold text-brand-700">{selected.indexCode}</div><h3 className="text-lg font-semibold text-gray-900">{selected.title}</h3></div>
            <span className={`ml-auto rounded-full px-2 py-1 text-xs font-semibold ${STATUS_STYLES[selected.status]}`}>{STATUS_LABELS[selected.status]}</span>
          </div>

          {selected.indexCode === 'A-400' && <section className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
            <h4 className="text-sm font-semibold text-indigo-950">Materiality calculation</h4>
            <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <label className="text-xs text-gray-600">Benchmark<input disabled={locked} value={materiality.basis} onChange={(e) => setMateriality({ ...materiality, basis: e.target.value })} placeholder="e.g. Revenue" className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5" /></label>
              <label className="text-xs text-gray-600">Benchmark amount<input disabled={locked} inputMode="decimal" value={materiality.basisAmount} onChange={(e) => setMateriality({ ...materiality, basisAmount: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-right" /></label>
              <label className="text-xs text-gray-600">Benchmark %<input disabled={locked} inputMode="decimal" value={materiality.percent} onChange={(e) => setMateriality({ ...materiality, percent: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-right" /></label>
              <button type="button" disabled={locked} onClick={calculateOverall} className="self-end rounded-lg border border-indigo-300 bg-white px-2 py-1.5 text-xs font-semibold text-indigo-800">Calculate overall</button>
              <label className="text-xs text-gray-600">Overall materiality<input disabled={locked} inputMode="decimal" value={materiality.overall} onChange={(e) => setMateriality({ ...materiality, overall: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-right" /></label>
              <label className="text-xs text-gray-600">Performance materiality<input disabled={locked} inputMode="decimal" value={materiality.performance} onChange={(e) => setMateriality({ ...materiality, performance: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-right" /></label>
              <label className="text-xs text-gray-600">Clearly trivial<input disabled={locked} inputMode="decimal" value={materiality.trivial} onChange={(e) => setMateriality({ ...materiality, trivial: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-right" /></label>
            </div>
            <textarea disabled={locked} rows={2} value={materiality.rationale} onChange={(e) => setMateriality({ ...materiality, rationale: e.target.value })} placeholder="Benchmark selection, users of the statements, qualitative considerations and rationale…" className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" />
            {!locked && <button type="button" disabled={busy || !materiality.basis.trim()} onClick={() => run(() => window.api.auditEngagement.saveMateriality({ engagementId: engagement.id, materialityBasis: materiality.basis, materialityBasisCents: cents(materiality.basisAmount), materialityPercent: Number(materiality.percent), overallMaterialityCents: cents(materiality.overall), performanceMaterialityCents: cents(materiality.performance), trivialMisstatementCents: cents(materiality.trivial), materialityRationale: materiality.rationale.trim() || null }))} className="mt-2 rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Save materiality</button>}
          </section>}

          <label className="mt-3 block text-xs font-medium text-gray-600">Purpose, procedures, evidence, results and conclusion
            <textarea disabled={locked} rows={12} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Document the objective, work performed, evidence inspected, exceptions, professional judgments and conclusion. Add cross-references to supporting documents and ledger reports." className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm leading-6" />
          </label>
          {!locked && <div className="mt-2 flex flex-wrap items-end gap-2">
            <button type="button" disabled={busy || content === selected.content} onClick={() => run(() => window.api.auditEngagement.saveDocument({ documentId: selected.id, content }))} className="rounded-lg bg-brand-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Save workpaper</button>
            <label className="text-xs text-gray-600">Preparer<input value={preparer} onChange={(e) => setPreparer(e.target.value)} className="ml-1 rounded-lg border border-gray-300 px-2 py-1.5" /></label>
            <button type="button" disabled={busy || !preparer.trim()} onClick={() => run(() => window.api.auditEngagement.signDocument({ documentId: selected.id, role: 'preparer', name: preparer.trim() }))} className="rounded-lg border border-indigo-300 px-3 py-1.5 text-xs font-semibold text-indigo-800 disabled:opacity-40">Sign as prepared</button>
            <label className="text-xs text-gray-600">Reviewer<input value={reviewer} onChange={(e) => setReviewer(e.target.value)} className="ml-1 rounded-lg border border-gray-300 px-2 py-1.5" /></label>
            <button type="button" disabled={busy || !reviewer.trim() || selected.status !== 'prepared'} onClick={() => run(() => window.api.auditEngagement.signDocument({ documentId: selected.id, role: 'reviewer', name: reviewer.trim() }))} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-40">Reviewer sign-off</button>
          </div>}

          <section className="mt-3 border-t border-gray-100 pt-3">
            <h4 className="text-sm font-semibold text-gray-800">Review notes</h4>
            <div className="mt-2 space-y-2">{selected.reviewNotes.length === 0 ? <p className="text-xs text-gray-400">No review notes.</p> : selected.reviewNotes.map((note) => <div key={note.id} className={`rounded-lg border p-2 text-xs ${note.status === 'open' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50 text-gray-500'}`}><div>{note.note}</div><div className="mt-1 flex items-center gap-2 text-[10px]"><span>{note.createdBy ?? 'Reviewer'} · {note.createdAt.slice(0, 10)}</span>{note.status === 'open' && !locked && <button type="button" disabled={!preparer.trim()} onClick={() => run(() => window.api.auditEngagement.resolveReviewNote({ noteId: note.id, resolvedBy: preparer.trim() }))} className="font-semibold text-emerald-700 underline">Resolve</button>}</div></div>)}</div>
            {!locked && <div className="mt-2 flex gap-2"><input value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Reviewer query or required correction…" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" /><button type="button" disabled={busy || !reviewer.trim() || !reviewNote.trim()} onClick={async () => { await run(() => window.api.auditEngagement.addReviewNote({ documentId: selected.id, note: reviewNote.trim(), createdBy: reviewer.trim() })); setReviewNote(''); }} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-40">Raise query</button></div>}
          </section>
        </main>}
      </div>
    </div>
  );
}
