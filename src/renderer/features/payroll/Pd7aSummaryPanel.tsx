import { useMemo, useState, useEffect } from 'react';
import type { PayrollRun } from '@shared/domain/types';
import { computePd7aMonthlyBreakdown, computePd7aSummary } from '@shared/domain/payroll/computePd7aSummary';
import {
  computeRemittanceObligations,
  type PayrollRemitterType,
} from '@shared/domain/payroll/computeRemittanceObligations';
import { Money } from '../../components/Money';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
}
function monthStartIso(): string {
  return `${todayIso().slice(0, 7)}-01`;
}

const REMITTER_LABELS: Record<PayrollRemitterType, string> = {
  quarterly: 'Quarterly — only when CRA-eligible',
  regular: 'Regular — monthly',
  accelerated1: 'Accelerated Threshold 1 — twice monthly',
  accelerated2: 'Accelerated Threshold 2 — four times monthly',
};

export function Pd7aSummaryPanel({ runs, employerName }: { runs: PayrollRun[]; employerName: string | null }) {
  const [payDateFrom, setPayDateFrom] = useState(monthStartIso());
  const [payDateTo, setPayDateTo] = useState(todayIso());
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [remitterType, setRemitterType] = useState<PayrollRemitterType>('regular');
  useEffect(() => {
    window.api.company.get().then((r) => {
      if (r.ok && r.data.payrollRemitterType) setRemitterType(r.data.payrollRemitterType);
    });
  }, []);

  const summary = useMemo(() => computePd7aSummary(runs, payDateFrom, payDateTo), [runs, payDateFrom, payDateTo]);
  const monthly = useMemo(() => computePd7aMonthlyBreakdown(runs), [runs]);
  const obligations = useMemo(
    () => computeRemittanceObligations(runs, payDateFrom, payDateTo, remitterType),
    [runs, payDateFrom, payDateTo, remitterType],
  );

  async function handleDownloadPdf() {
    setDownloading(true);
    setDownloadError(null);
    const result = await window.api.payroll.generatePd7aPdf({ payDateFrom, payDateTo });
    setDownloading(false);
    if (!result.ok) return setDownloadError(result.error);
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-900">PD7A Remittance Summary</h2>
        <span className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">Confirm exact amount &amp; due date on your CRA PD7A / My Business Account</span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <span className="text-gray-600">CRA Remitter Type</span>
          <select
            className="ml-2 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            value={remitterType}
            onChange={(e) => setRemitterType(e.target.value as PayrollRemitterType)}
          >
            {(Object.keys(REMITTER_LABELS) as PayrollRemitterType[]).map((type) => (
              <option key={type} value={type}>{REMITTER_LABELS[type]}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-gray-600">Pay Date From</span>
          <input type="date" min={DATE_MIN} max={DATE_MAX} className="ml-2 rounded border border-gray-300 px-2 py-1.5 text-sm" value={payDateFrom} onChange={(e) => setPayDateFrom(clampIsoDate(e.target.value))} />
        </label>
        <label className="text-sm">
          <span className="text-gray-600">To</span>
          <input type="date" min={DATE_MIN} max={DATE_MAX} className="ml-2 rounded border border-gray-300 px-2 py-1.5 text-sm" value={payDateTo} onChange={(e) => setPayDateTo(clampIsoDate(e.target.value))} />
        </label>
        <button
          type="button"
          disabled={downloading || summary.payRunCount === 0}
          onClick={handleDownloadPdf}
          className="rounded-full bg-brand-100 px-4 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
        >
          {downloading ? 'Generating…' : 'Save PD7A as PDF'}
        </button>
        {downloadError && <span className="text-sm text-red-600">{downloadError}</span>}
      </div>

      <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-amber-800">Payroll remittance alert</div>
            <div className="font-semibold">Responsible employer: {employerName || 'Company legal name not entered'}</div>
          </div>
          <div className="text-xs text-amber-800">{REMITTER_LABELS[remitterType]}</div>
        </div>
        {obligations.length === 0 ? (
          <p className="mt-2 text-amber-800">No calculated remittance in the selected pay-date range because there are no posted pay runs.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {obligations.map((obligation) => (
              <div key={`${obligation.periodStart}:${obligation.periodEnd}`} className="grid gap-1 rounded border border-amber-200 bg-white/70 px-3 py-2 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-3">
                <div>
                  <div className="font-medium">Remitting period {obligation.periodLabel}</div>
                  <div className="text-xs text-gray-600">
                    {obligation.payRunCount} posted run{obligation.payRunCount === 1 ? '' : 's'} · {obligation.employeeCount} employee{obligation.employeeCount === 1 ? '' : 's'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Calculated amount</div>
                  <div className="font-bold text-brand-900"><Money cents={obligation.totalRemittanceCents} /></div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Due date{obligation.dueDateEstimate ? ' (estimate)' : ''}</div>
                  <div className="font-bold text-red-700">{obligation.dueDate}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-amber-800">
          Confirm the employer's assigned remitter type, exact balance, statutory-holiday treatment, and due date in CRA My Business Account before payment.
          Threshold 2 dates are estimates because CRA-recognized public holidays affect the three-working-day calculation.
        </p>
      </div>

      {summary.payRunCount === 0 ? (
        <p className="text-sm text-gray-400">No posted pay runs with a pay date in this range.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Gross Payroll" cents={summary.grossPayrollCents} />
          <Stat label="CPP Remittance" cents={summary.cppEmployeeCents + summary.cppEmployerCents} />
          <Stat label="EI Remittance" cents={summary.eiEmployeeCents + summary.eiEmployerCents} />
          <Stat label="Income Tax Withheld" cents={summary.incomeTaxCents} />
          <div className="col-span-2 rounded border border-brand-200 bg-brand-50 p-3 sm:col-span-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-brand-900">Total Remittance Due</span>
              <span className="text-lg font-bold text-brand-900">
                <Money cents={summary.totalRemittanceCents} />
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {summary.payRunCount} pay run{summary.payRunCount === 1 ? '' : 's'}, {summary.employeeCount} employee{summary.employeeCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      )}

      {monthly.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Monthly Breakdown</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-1.5">Month</th>
                <th className="pb-1.5 text-right">Gross</th>
                <th className="pb-1.5 text-right">CPP</th>
                <th className="pb-1.5 text-right">EI</th>
                <th className="pb-1.5 text-right">Income Tax</th>
                <th className="pb-1.5 text-right">Total Remittance</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.payDateFrom} className="border-b border-gray-100">
                  <td className="py-1.5 text-gray-700">{m.payDateFrom.slice(0, 7)}</td>
                  <td className="py-1.5 text-right">
                    <Money cents={m.grossPayrollCents} />
                  </td>
                  <td className="py-1.5 text-right">
                    <Money cents={m.cppEmployeeCents + m.cppEmployerCents} />
                  </td>
                  <td className="py-1.5 text-right">
                    <Money cents={m.eiEmployeeCents + m.eiEmployerCents} />
                  </td>
                  <td className="py-1.5 text-right">
                    <Money cents={m.incomeTaxCents} />
                  </td>
                  <td className="py-1.5 text-right font-medium">
                    <Money cents={m.totalRemittanceCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        Verify the payment amount and due date in your CRA My Business Account before remitting.
      </p>
    </section>
  );
}

function Stat({ label, cents }: { label: string; cents: number }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-base font-semibold text-gray-900">
        <Money cents={cents} />
      </div>
    </div>
  );
}
