import { useEffect, useMemo, useState } from 'react';
import type { FiscalPeriod } from '@shared/domain/types';
import { useUiStore, type View } from '../../app/store/uiStore';
import { confirmDialog } from '../../app/store/confirmStore';
import { clampIsoMonth } from '@shared/domain/forms/fieldMasks';
import { ForeignRevaluationCard } from './ForeignRevaluationCard';

interface Step { key: string; title: string; description: string; view: View; liveComplete?: boolean; attention?: string }

function monthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return { start: `${month}-01`, end: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10) };
}

function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function MonthEndClosePage() {
  const setView = useUiStore((s) => s.setView);
  const companyPath = useUiStore((s) => s.companyPath) ?? 'company';
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [receipts, setReceipts] = useState(0);
  const [drafts, setDrafts] = useState(0);
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [periodMessage, setPeriodMessage] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const storageKey = `northLedger.monthEnd.${companyPath}.${month}`;
  const [reviewed, setReviewed] = useState<Set<string>>(() => new Set());
  const range = monthRange(month);
  const exactPeriod = periods.find((period) => period.periodStart === range.start && period.periodEnd === range.end);
  const overlappingPeriod = periods.find((period) => period.periodStart <= range.end && period.periodEnd >= range.start && period !== exactPeriod);

  function reloadStatus() {
    Promise.all([window.api.receiptInbox.list(), window.api.journal.list({ status: 'draft' }), window.api.fiscalPeriods.list()]).then(([receiptResult, draftResult, periodResult]) => {
      setReceipts(receiptResult.ok ? receiptResult.data.length : 0);
      setDrafts(draftResult.ok ? draftResult.data.length : 0);
      setPeriods(periodResult.ok ? periodResult.data : []);
    });
  }
  useEffect(reloadStatus, []);
  useEffect(() => {
    try { setReviewed(new Set(JSON.parse(localStorage.getItem(storageKey) ?? '[]') as string[])); }
    catch { setReviewed(new Set()); }
    setPeriodMessage(null);
  }, [storageKey]);

  function toggle(key: string) {
    setReviewed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
  }

  const steps = useMemo<Step[]>(() => [
    { key: 'receipts', title: 'Clear the receipt inbox', description: 'Post or dismiss every receipt waiting for review.', view: { kind: 'receiptInbox' }, liveComplete: receipts === 0, attention: receipts ? `${receipts} waiting` : 'Clear' },
    { key: 'drafts', title: 'Finish draft journals', description: 'Complete or remove unfinished journal entries.', view: { kind: 'journalList' }, liveComplete: drafts === 0, attention: drafts ? `${drafts} drafts` : 'Clear' },
    { key: 'reconcile', title: 'Reconcile bank and credit cards', description: 'Match each account to its statement ending balance.', view: { kind: 'banking', tab: 'reconcile' } },
    { key: 'hst', title: 'Review GST/HST', description: 'Confirm tax collected, input tax credits and filing-period totals.', view: { kind: 'hstCentre' } },
    { key: 'income', title: 'Review Income Statement', description: 'Look for unusual revenue, expense or negative balances.', view: { kind: 'report', report: 'incomeStatement' } },
    { key: 'balance', title: 'Review Balance Sheet', description: 'Confirm bank, receivables, payables, tax and equity balances.', view: { kind: 'report', report: 'balanceSheet' } },
  ], [drafts, receipts]);
  const completeCount = steps.filter((step) => step.liveComplete || reviewed.has(step.key)).length;
  const allComplete = completeCount === steps.length;

  async function lockMonth() {
    if (!allComplete || exactPeriod?.isLocked || overlappingPeriod) return;
    if (!(await confirmDialog(`Lock ${month}? Entries dated ${range.start} through ${range.end} will require an explicit override to change.`))) return;
    setLocking(true);
    setPeriodMessage(null);
    let period = exactPeriod;
    if (!period) {
      const created = await window.api.fiscalPeriods.create({ label: month, periodStart: range.start, periodEnd: range.end });
      if (!created.ok) { setLocking(false); return setPeriodMessage(created.error); }
      period = created.data;
    }
    const result = await window.api.fiscalPeriods.lock(period.id);
    setLocking(false);
    if (!result.ok) return setPeriodMessage(result.error);
    setPeriodMessage(`${month} is locked. Reports remain available; later transaction changes require an override.`);
    reloadStatus();
  }

  return <div className="w-full space-y-3"><div className="rounded-xl border border-brand-200 bg-brand-50 p-3"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-gold-700">Guided close</div><h1 className="mt-1 text-lg font-semibold text-brand-900">Month-End Close Assistant</h1><p className="mt-2 text-sm text-brand-800">Review in order; corrections always happen on the original transaction page.</p></div><label className="text-sm text-brand-800">Month<input type="month" min="1900-01" max="2100-12" value={month} onChange={(event) => setMonth(clampIsoMonth(event.target.value))} className="ml-2 rounded-lg border border-brand-200 bg-white px-3 py-2" /></label></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${(completeCount / steps.length) * 100}%` }} /></div><div className="mt-1 text-xs text-brand-700">{completeCount} of {steps.length} steps complete</div></div><div className="space-y-3">{steps.map((step, index) => { const done = step.liveComplete || reviewed.has(step.key); return <div key={step.key} className={`rounded-xl border p-3 ${done ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'}`}><div className="flex items-center gap-3"><div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-bold ${done ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{done ? '✓' : index + 1}</div><button type="button" onClick={() => setView(step.view)} className="min-w-0 flex-1 text-left"><div className="font-semibold text-gray-900">{step.title}</div><div className="text-sm text-gray-500">{step.description}</div></button>{step.attention && <span className={`rounded-full px-2 py-1 text-xs font-bold ${done ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{step.attention}</span>}{step.liveComplete === undefined && <button type="button" onClick={() => toggle(step.key)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${done ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{done ? 'Reviewed' : 'Mark reviewed'}</button>}</div></div>; })}</div><ForeignRevaluationCard asOfDate={monthEnd(month)} /><div className={`rounded-xl border p-3 ${exactPeriod?.isLocked ? 'border-emerald-300 bg-emerald-50' : 'border-indigo-200 bg-indigo-50'}`}><h2 className="font-semibold text-gray-900">Protect the completed month</h2>{exactPeriod?.isLocked ? <p className="mt-1 text-sm text-emerald-800">✓ {month} is locked.</p> : overlappingPeriod ? <p className="mt-1 text-sm text-amber-800">This month overlaps fiscal period “{overlappingPeriod.label}”. Manage that period in Settings instead of creating a duplicate.</p> : <><p className="mt-1 text-sm text-gray-600">Locking prevents accidental edits after the close. It is optional and can be reversed from Settings.</p><button type="button" disabled={!allComplete || locking} onClick={lockMonth} className="mt-3 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-40">{locking ? 'Locking…' : allComplete ? 'Lock This Month' : 'Complete all steps to lock'}</button></>}{periodMessage && <p className="mt-2 text-sm text-indigo-800">{periodMessage}</p>}</div></div>;
}
