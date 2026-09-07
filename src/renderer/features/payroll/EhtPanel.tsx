import { useEffect, useMemo, useState } from 'react';
import type { Employee, PayrollRun } from '@shared/domain/types';
import { computeEht, ehtByMonth, EHT_DEFAULT_EXEMPTION_CENTS, ontarioRemunerationCents } from '@shared/domain/payroll/employerHealthTax';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { Money } from '../../components/Money';
import { useUiStore } from '../../app/store/uiStore';

/** Ontario Employer Health Tax: what the year's Ontario payroll has attracted so far, what has
 * been accrued in the books, and one button to post the difference. Shown only when someone on
 * payroll reports to work in Ontario. */
export function EhtPanel({ runs, employees }: { runs: PayrollRun[]; employees: Employee[] }) {
  const setView = useUiStore((s) => s.setView);
  const today = localIsoDate();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [eligible, setEligible] = useState(true);
  const [exemptionCents, setExemptionCents] = useState(EHT_DEFAULT_EXEMPTION_CENTS);
  const [accruedCents, setAccruedCents] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasOntario = employees.some((e) => e.isActive && e.province === 'ON');

  async function refresh() {
    const [company, accrued] = await Promise.all([window.api.company.get(), window.api.payroll.ehtAccrued({ taxYear: year })]);
    if (company.ok) {
      setEligible(company.data.ehtExemptionEligible ?? true);
      setExemptionCents(company.data.ehtExemptionCents ?? EHT_DEFAULT_EXEMPTION_CENTS);
    }
    if (accrued.ok) setAccruedCents(accrued.data.accruedCents);
  }

  useEffect(() => {
    if (hasOntario) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, hasOntario]);

  const remuneration = useMemo(() => ontarioRemunerationCents(runs, employees, `${year}-01-01`, `${year}-12-31`), [runs, employees, year]);
  const result = useMemo(() => computeEht({ remunerationCents: remuneration, exemptionEligible: eligible, exemptionCents }), [remuneration, eligible, exemptionCents]);
  const months = useMemo(() => ehtByMonth(runs, employees, year, eligible, exemptionCents).filter((m) => m.remunerationCents > 0 || m.taxCents !== 0), [runs, employees, year, eligible, exemptionCents]);
  const toAccrue = result.taxCents - accruedCents;

  if (!hasOntario) return null;

  async function accrue() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const r = await window.api.payroll.ehtAccrue({ taxYear: year, throughDate: today <= `${year}-12-31` ? today : `${year}-12-31` });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setNotice(`Posted ${(r.data.amountCents / 100).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })} to Employer Health Tax, owing in Employer Health Tax Payable.`);
    await refresh();
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm" data-testid="eht-panel">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-900">Ontario Employer Health Tax (EHT)</h2>
        <div className="flex items-center gap-2 text-xs">
          <label className="text-gray-600">Year</label>
          <select className="rounded border border-gray-300 bg-white px-2 py-1" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[0, 1, 2].map((back) => { const y = Number(today.slice(0, 4)) - back; return <option key={y} value={y}>{y}</option>; })}
          </select>
          <span className="rounded bg-red-50 px-2 py-1 font-medium text-red-700">Confirm rates and your exemption share on the Ontario Ministry of Finance site before filing</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-5">
        {[
          ['Ontario remuneration', result.remunerationCents, 'bg-gray-50 text-gray-800'],
          ['Exemption applied', result.exemptionAppliedCents, 'bg-emerald-50 text-emerald-900'],
          ['Taxable', result.taxableCents, 'bg-gray-50 text-gray-800'],
          [`EHT at ${(result.rate * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%`, result.taxCents, 'bg-amber-50 text-amber-900'],
          ['Accrued in books', accruedCents, accruedCents >= result.taxCents ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'],
        ].map(([label, cents, tone]) => (
          <div key={label as string} className={`rounded-md px-2 py-1 ${tone}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
            <div className="text-base font-semibold tabular-nums"><Money cents={cents as number} /></div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
        {result.taxCents === 0 ? (
          <span>Nothing owing yet: Ontario payroll this year is inside the {eligible ? 'exemption' : 'zero band'}. The annual return is still due March 15 if the company is registered for EHT.</span>
        ) : toAccrue > 0 ? (
          <>
            <span><Money cents={toAccrue} /> of this year's EHT is not yet in the books.</span>
            <button type="button" disabled={busy} onClick={() => void accrue()} className="rounded-full bg-brand-100 px-3 py-1 font-semibold text-brand-800 hover:bg-brand-200 disabled:opacity-50">
              {busy ? 'Posting…' : 'Record accrual to date'}
            </button>
          </>
        ) : (
          <span>Accrual is up to date. Pay Ontario through your bank and record the payment from the bank to Employer Health Tax Payable.</span>
        )}
        {result.instalmentsRequired && <span className="rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-800">Over $1.2M: monthly instalments due the 15th</span>}
        <button type="button" onClick={() => setView({ kind: 'companySettings' })} className="ml-auto text-brand-700 hover:underline">
          Exemption: {eligible ? <Money cents={exemptionCents} /> : 'not eligible'} · change in Company Settings
        </button>
      </div>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-700">{error}</div>}
      {notice && <div className="mt-2 rounded bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">{notice}</div>}
      {months.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-gray-600">Month by month</summary>
          <table className="mt-1 w-full text-xs">
            <thead><tr className="border-b text-left uppercase tracking-wide text-gray-400"><th className="py-1">Month</th><th className="py-1 text-right">Ontario pay</th><th className="py-1 text-right">EHT for the month</th></tr></thead>
            <tbody>{months.map((m) => <tr key={m.month} className="border-b border-gray-100"><td className="py-1">{m.month}</td><td className="py-1 text-right tabular-nums"><Money cents={m.remunerationCents} /></td><td className="py-1 text-right tabular-nums"><Money cents={m.taxCents} /></td></tr>)}</tbody>
          </table>
          <p className="mt-1 text-gray-500">Example: $150,000 of Ontario pay a month uses up the $1,000,000 exemption in July, so EHT starts in July at 1.95% of the pay above it, and the year ends at $15,600 on $1,800,000.</p>
        </details>
      )}
    </section>
  );
}
