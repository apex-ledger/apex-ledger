import { useState } from 'react';
import type { EarningsTotals, EmployeeEarningsRecord } from '@shared/domain/payroll/employeeEarnings';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';

/** Employee earnings record: each employee's posted pay for the period, run by run, with the
 * year-to-date column beside it and vacation owing — the sheet a T4, an ROE or a CRA query gets
 * checked against. Employer costs are on the right so the total cost of each employee is visible. */
export function EmployeeEarningsPage() {
  const setView = useUiStore((s) => s.setView);
  const today = localIsoDate();
  const [periodStart, setPeriodStart] = useState(`${today.slice(0, 4)}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const { data, loading, error } = useIpcQuery(() => window.api.reports.employeeEarnings({ periodStart, periodEnd }), [periodStart, periodEnd]);

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="w-full space-y-3" data-testid="employee-earnings">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">From</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <label className="text-sm text-gray-600">To</label>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
        <span className="text-xs text-gray-400">Posted pay runs by pay date. Year-to-date runs from January 1 of the To year through the To date.</span>
        <button type="button" onClick={() => setExpanded(new Set((data?.employees ?? []).map((e) => e.employeeId)))} className="ml-auto text-xs text-brand-600 hover:underline">Expand all</button>
        <button type="button" onClick={() => setExpanded(new Set())} className="text-xs text-brand-600 hover:underline">Collapse all</button>
      </div>
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {data && data.employees.length === 0 && !loading && (
        <div className="rounded border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">No posted pay runs in this period.</div>
      )}
      {data && data.employees.length > 0 && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
              <tr>
                <th className="min-w-[18rem] px-2 py-2">Employee / pay date</th>
                <th className="px-2 py-2 text-right">Hours</th>
                <th className="px-2 py-2 text-right">Regular</th>
                <th className="px-2 py-2 text-right">Overtime</th>
                <th className="px-2 py-2 text-right">Other earnings</th>
                <th className="px-2 py-2 text-right">Vacation</th>
                <th className="px-2 py-2 text-right">Gross</th>
                <th className="px-2 py-2 text-right">Benefits</th>
                <th className="px-2 py-2 text-right">CPP</th>
                <th className="px-2 py-2 text-right">EI</th>
                <th className="px-2 py-2 text-right">Income tax</th>
                <th className="px-2 py-2 text-right">Other ded.</th>
                <th className="px-2 py-2 text-right">Reimb.</th>
                <th className="px-2 py-2 text-right">Net pay</th>
                <th className="px-2 py-2 text-right">Employer CPP/EI</th>
                <th className="px-2 py-2 text-right">WSIB</th>
                <th className="px-2 py-2 text-right">Employer benefits</th>
                <th className="px-2 py-2 text-right">Employer cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.employees.map((e) => (
                <EmployeeBlock key={e.employeeId} record={e} open={expanded.has(e.employeeId)} onToggle={() => toggle(e.employeeId)} onOpenRun={(id) => setView({ kind: 'paystub', runId: id })} />
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-800 font-semibold">
              <TotalsRow label={`All employees — ${data.periodStart} to ${data.periodEnd}`} t={data.grand} />
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function Cells({ t, muted = false }: { t: EarningsTotals; muted?: boolean }) {
  const c = `px-2 py-1 text-right tabular-nums ${muted ? 'text-gray-500' : ''}`;
  return (
    <>
      <td className={c}>{t.hours ? t.hours : ''}</td>
      <td className={c}><Money cents={t.regularPayCents} /></td>
      <td className={c}><Money cents={t.overtimePayCents} /></td>
      <td className={c}><Money cents={t.otherEarningsCents} /></td>
      <td className={c}><Money cents={t.vacationPayCents} /></td>
      <td className={`${c} font-medium`}><Money cents={t.grossCents} /></td>
      <td className={c}><Money cents={t.taxableBenefitsCents} /></td>
      <td className={c}><Money cents={t.cppCents} /></td>
      <td className={c}><Money cents={t.eiCents} /></td>
      <td className={c}><Money cents={t.incomeTaxCents} /></td>
      <td className={c}><Money cents={t.otherDeductionsCents} /></td>
      <td className={c}><Money cents={t.reimbursementsCents} /></td>
      <td className={`${c} font-medium`}><Money cents={t.netPayCents} /></td>
      <td className={c}><Money cents={t.employerCppCents + t.employerEiCents} /></td>
      <td className={c}><Money cents={t.wsibCents} /></td>
      <td className={c}><Money cents={t.employerBenefitsCents} /></td>
      <td className={`${c} font-medium`}><Money cents={t.employerCostCents} /></td>
    </>
  );
}

function TotalsRow({ label, t, muted = false }: { label: string; t: EarningsTotals; muted?: boolean }) {
  return (
    <tr className={muted ? 'bg-gray-50' : ''}>
      <td className={`whitespace-nowrap px-2 py-1 ${muted ? 'text-gray-500' : ''}`}>{label}</td>
      <Cells t={t} muted={muted} />
    </tr>
  );
}

function EmployeeBlock({ record, open, onToggle, onOpenRun }: { record: EmployeeEarningsRecord; open: boolean; onToggle: () => void; onOpenRun: (runId: number) => void }) {
  return (
    <>
      <tr className="bg-brand-50/60 font-semibold">
        <td className="whitespace-nowrap px-2 py-1.5">
          <button type="button" onClick={onToggle} className="mr-1 text-gray-500" aria-label={open ? 'Collapse' : 'Expand'}>{open ? '▾' : '▸'}</button>
          {record.employeeName}
          <span className="ml-2 text-[10px] font-normal text-gray-500">{record.payType} · {record.province}{record.sinLastFour ? ` · SIN ***${record.sinLastFour}` : ''} · {record.period.runs} run{record.period.runs === 1 ? '' : 's'}{record.vacationOwingCents > 0 ? <> · vacation owing <Money cents={record.vacationOwingCents} /></> : null}</span>
        </td>
        <Cells t={record.period} />
      </tr>
      {open && record.runs.map((r) => (
        <tr key={r.runId} className="text-gray-700">
          <td className="px-2 py-1 pl-7">
            <button type="button" onClick={() => onOpenRun(r.runId)} className="text-brand-600 hover:underline">{r.payDate}</button>
            <span className="ml-1 text-gray-400">{r.payPeriodStart} – {r.payPeriodEnd}{r.isVacationPayout ? ' · vacation payout' : ''}{r.itemNames ? ` · ${r.itemNames}` : ''}</span>
          </td>
          <Cells t={r} />
        </tr>
      ))}
      <TotalsRow label={`Year to date — ${record.employeeName}`} t={record.yearToDate} muted />
    </>
  );
}
