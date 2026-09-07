import { useState } from 'react';
import type { ExceptionRow, ExceptionSeverity, ExceptionTest } from '@shared/domain/audit/auditExceptions';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';

const SEV: Record<ExceptionSeverity, { chip: string; row: string; label: string }> = {
  high: { chip: 'bg-red-100 text-red-800', row: 'bg-red-50', label: 'High' },
  medium: { chip: 'bg-amber-100 text-amber-800', row: 'bg-amber-50', label: 'Medium' },
  low: { chip: 'bg-yellow-100 text-yellow-800', row: 'bg-yellow-50', label: 'Low' },
};

/** Audit exceptions: the tests an auditor runs before asking questions, each listing the rows that
 * fail it with a button to open the item. A clean run is a short page. */
export function AuditExceptionsPage() {
  const setView = useUiStore((s) => s.setView);
  const today = localIsoDate();
  const [periodStart, setPeriodStart] = useState(`${today.slice(0, 4)}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [threshold, setThreshold] = useState(1000);
  const [showClean, setShowClean] = useState(false);
  const { data, loading, error } = useIpcQuery(() => window.api.reports.auditExceptions({ periodStart, periodEnd, supportThresholdCents: Math.round(threshold * 100) }), [periodStart, periodEnd, threshold]);

  function open(row: ExceptionRow) {
    if (row.ref.kind === 'journal') setView({ kind: 'journalForm', id: row.ref.id });
    else if (row.ref.kind === 'invoice' && row.ref.id > 0) setView({ kind: 'invoiceEditor', id: row.ref.id });
    else if (row.ref.kind === 'invoice') setView({ kind: 'invoices' });
    else if (row.ref.kind === 'bill') setView({ kind: 'purchases', tab: 'unpaid', billId: row.ref.id });
    else setView({ kind: 'report', report: 'generalLedger' });
  }

  const tests = (data?.tests ?? []).filter((t) => showClean || t.rows.length > 0);

  return (
    <div className="w-full space-y-3" data-testid="audit-exceptions">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">From</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <label className="text-sm text-gray-600">To</label>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
        <label className="text-sm text-gray-600">Support threshold $<input type="number" min={0} step={100} className="ml-1 w-24 rounded border border-gray-300 px-2 py-1 text-sm" value={threshold} onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0))} /></label>
        <label className="flex items-center gap-1 text-xs text-gray-500"><input type="checkbox" checked={showClean} onChange={(e) => setShowClean(e.target.checked)} /> Show tests that passed</label>
        {data && (
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-800">{data.counts.high} high</span>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">{data.counts.medium} medium</span>
            <span className="rounded-full bg-yellow-100 px-2.5 py-1 font-medium text-yellow-800">{data.counts.low} low</span>
          </div>
        )}
      </div>
      {loading && <p className="text-sm text-gray-500">Running tests…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {data && data.counts.total === 0 && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800">Every test passed for this period. Nothing an auditor would flag from the books alone.</div>
      )}
      {tests.map((t) => <TestBlock key={t.id} test={t} onOpen={open} />)}
    </div>
  );
}

function TestBlock({ test, onOpen }: { test: ExceptionTest; onOpen: (row: ExceptionRow) => void }) {
  const sev = SEV[test.severity];
  const clean = test.rows.length === 0;
  return (
    <section className={`rounded border ${clean ? 'border-emerald-200 bg-white' : 'border-gray-200 bg-white'}`} data-testid={`audit-test-${test.id}`}>
      <div className="flex flex-wrap items-start gap-2 border-b border-gray-100 px-3 py-2">
        <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${clean ? 'bg-emerald-100 text-emerald-800' : sev.chip}`}>{clean ? 'Passed' : sev.label}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-800">{test.title} {!clean && <span className="ml-1 text-xs font-normal text-gray-400">{test.rows.length}</span>}</div>
          <div className="text-xs text-gray-500">{test.why}</div>
          {!clean && <div className="mt-1 rounded bg-brand-50 px-2 py-1 text-xs text-brand-900"><span className="font-semibold">How to fix: </span>{test.howToFix}</div>}
          {test.comparison && (
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-700">
              <span>{test.comparison.left}: <strong><Money cents={test.comparison.leftCents} /></strong></span>
              <span>{test.comparison.right}: <strong><Money cents={test.comparison.rightCents} /></strong></span>
              <span className={test.comparison.leftCents === test.comparison.rightCents ? 'text-emerald-700' : 'text-red-700'}>Difference: <strong><Money cents={Math.abs(test.comparison.leftCents - test.comparison.rightCents)} /></strong></span>
            </div>
          )}
        </div>
      </div>
      {!clean && (
        <table className="w-full text-xs">
          <tbody className="divide-y divide-gray-100">
            {test.rows.map((r, i) => (
              <tr key={`${r.ref.kind}-${r.ref.id}-${i}`} className={sev.row}>
                <td className="w-24 px-3 py-1 tabular-nums text-gray-600">{r.date}</td>
                <td className="px-3 py-1 font-medium text-gray-900">{r.label}</td>
                <td className="px-3 py-1 text-gray-600">{r.detail}</td>
                <td className="w-28 px-3 py-1 text-right tabular-nums">{r.amountCents > 0 ? <Money cents={r.amountCents} /> : ''}</td>
                <td className="w-16 px-3 py-1 text-right"><button type="button" onClick={() => onOpen(r)} className="text-brand-600 hover:underline">Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
