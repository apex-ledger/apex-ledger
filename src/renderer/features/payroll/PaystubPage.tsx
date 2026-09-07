import { useEffect, useState } from 'react';
import { BackButton } from '../../components/BackButton';
import { employeeAddressLines } from '@shared/domain/payroll/employeeAddress';
import { Money } from '../../components/Money';
import { useUiStore } from '../../app/store/uiStore';

type PaystubResult = Extract<Awaited<ReturnType<typeof window.api.payrollRuns.getPaystub>>, { ok: true }>['data'];

function Row({ label, current, ytd, bold = false }: { label: string; current: number; ytd?: number; bold?: boolean }) {
  return (
    <tr className={bold ? 'font-semibold' : ''}>
      <td className="py-1 pr-4 text-gray-700">{label}</td>
      <td className="py-1 pr-4 text-right">
        <Money cents={current} />
      </td>
      <td className="py-1 text-right text-gray-500">{ytd !== undefined ? <Money cents={ytd} /> : ''}</td>
    </tr>
  );
}

export function PaystubPage({ runId }: { runId: number }) {
  const setView = useUiStore((s) => s.setView);
  const [data, setData] = useState<PaystubResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSavePdf() {
    setSaving(true);
    setSaveError(null);
    const r = await window.api.payrollRuns.savePaystubPdf(runId);
    setSaving(false);
    if (!r.ok) setSaveError(r.error);
  }

  useEffect(() => {
    window.api.payrollRuns.getPaystub(runId).then((r) => {
      if (!r.ok) return setError(r.error);
      setData(r.data);
    });
  }, [runId]);

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    );
  }

  const { run, employee, company, ytdThroughThisRun, ytdItems } = data;
  const items = (run.items ?? []).filter((i) => i.amountCents > 0);
  const byKind = (kind: string) => items.filter((i) => i.kind === kind);
  const sum = (list: { amountCents: number }[]) => list.reduce((t, i) => t + i.amountCents, 0);
  const earningsItems = byKind('earning'); const benefitItems = byKind('taxableBenefit'); const deductionItems = byKind('deduction'); const reimbursementItems = byKind('reimbursement');
  const cppEmployee = run.cpp1EmployeeCents + run.cpp2EmployeeCents;
  const totalDeductions = cppEmployee + run.eiEmployeeCents + run.incomeTaxCents + sum(deductionItems);
  const grossPay = run.grossPayCents + run.vacationPayCents;
  const hasOvertime = (run.overtimeHours ?? 0) > 0;
  const hourlyRate = employee.hourlyRateCents ?? 0;
  const overtimeRate = hourlyRate * 1.5;
  const addressLines = employeeAddressLines(employee);
  // Pay runs created before Regular/Overtime were split out and stored separately (see the 0.1.50
  // migration) have regularPayCents/overtimePayCents defaulted to 0 even though grossPayCents is
  // correct — showing the split for those would print "Regular Pay: $0.00" next to a real Gross
  // Pay total. Fall back to the single combined line for any run missing that breakdown.
  const hasStoredPaySplit = run.regularPayCents > 0 || run.overtimePayCents > 0;

  return (
    <div className="min-h-screen bg-gray-100 py-5">
      <div className="mx-auto mb-3 flex max-w-2xl items-center gap-3 print:hidden">
        <BackButton fallback={{ kind: 'payroll' }} fallbackLabel="Payroll" />
        {saveError && <span className="ml-auto text-sm text-red-600">{saveError}</span>}
        <button type="button" disabled={saving} onClick={handleSavePdf} className={`${saveError ? '' : 'ml-auto '}rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50`}>
          {saving ? 'Saving…' : 'Save as PDF'}
        </button>
        <button type="button" onClick={() => window.print()} className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Print
        </button>
      </div>

      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-gray-300 pb-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{company.legalName}</h1>
            {company.businessAddressLine1 && <p className="text-xs text-gray-500">{[company.businessAddressLine1, company.businessAddressLine2].filter(Boolean).join(', ')}</p>}
            {(company.businessCity || company.businessProvince || company.businessPostalCode) && (
              <p className="text-xs text-gray-500">{[company.businessCity, [company.businessProvince, company.businessPostalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</p>
            )}
          </div>
          <div className="text-right">
            <h2 className="text-base font-semibold text-gray-900">Pay Statement</h2>
            <p className="text-xs text-gray-500">Pay Date: {run.payDate}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-400">Employee</div>
            <div className="font-medium text-gray-900">{employee.name}</div>
            {/* The address already names the province, so the bare province-of-employment line is
                only shown as a fallback for employees with no address on file. */}
            {addressLines.length > 0 ? (
              addressLines.map((line) => (
                <div key={line} className="text-gray-500">
                  {line}
                </div>
              ))
            ) : (
              <div className="text-gray-500">{employee.province}</div>
            )}
            {employee.sinLastFour && <div className="text-gray-500">SIN: ***-***-{employee.sinLastFour}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-gray-400">Pay Period</div>
            <div className="text-gray-900">
              {run.payPeriodStart} to {run.payPeriodEnd}
            </div>
            {employee.payType === 'Hourly' && (
              <div className="text-gray-500">
                {run.regularHours ?? 0} reg hrs @ <Money cents={hourlyRate} />
                {hasOvertime && (
                  <>
                    {' '}
                    + {run.overtimeHours} OT hrs @ <Money cents={overtimeRate} />
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-xs uppercase tracking-wide text-gray-400">
              <th className="pb-1 text-left">Earnings &amp; Deductions</th>
              <th className="pb-1 text-right">Current</th>
              <th className="pb-1 text-right">Year to Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {hasStoredPaySplit ? (
              <>
                <Row label="Regular Pay" current={run.regularPayCents} />
                {hasOvertime && <Row label="Overtime Pay" current={run.overtimePayCents} />}
              </>
            ) : (
              <Row label="Regular / Vacation Pay" current={grossPay} />
            )}
            {hasStoredPaySplit && run.vacationPayCents > 0 && <Row label="Vacation Pay" current={run.vacationPayCents} />}
            {earningsItems.map((i) => <Row key={i.name} label={i.name} current={i.amountCents} ytd={ytdItems[i.name]} />)}
            <Row label="Gross Pay" current={grossPay} ytd={ytdThroughThisRun.grossPayCents} bold />
          </tbody>
          {benefitItems.length > 0 && (
            <tbody className="divide-y divide-gray-100 border-t border-gray-300">
              <tr><td colSpan={3} className="pt-2 text-[10px] uppercase tracking-wide text-gray-400">Taxable Benefits (non-cash)</td></tr>
              {benefitItems.map((i) => <Row key={i.name} label={i.name} current={i.amountCents} ytd={ytdItems[i.name]} />)}
            </tbody>
          )}
          <tbody className="divide-y divide-gray-100 border-t border-gray-300">
            {benefitItems.length > 0 && <tr><td colSpan={3} className="pt-2 text-[10px] uppercase tracking-wide text-gray-400">Deductions</td></tr>}
            <Row label="CPP" current={cppEmployee} ytd={ytdThroughThisRun.cppEmployeeCents} />
            <Row label="EI" current={run.eiEmployeeCents} ytd={ytdThroughThisRun.eiEmployeeCents} />
            <Row label="Income Tax" current={run.incomeTaxCents} ytd={ytdThroughThisRun.incomeTaxCents} />
            {deductionItems.map((i) => <Row key={i.name} label={i.name} current={i.amountCents} ytd={ytdItems[i.name]} />)}
            <Row label="Total Deductions" current={totalDeductions} bold />
          </tbody>
          {reimbursementItems.length > 0 && (
            <tbody className="divide-y divide-gray-100 border-t border-gray-300">
              <tr><td colSpan={3} className="pt-2 text-[10px] uppercase tracking-wide text-gray-400">Reimbursements (non-taxable)</td></tr>
              {reimbursementItems.map((i) => <Row key={i.name} label={i.name} current={i.amountCents} ytd={ytdItems[i.name]} />)}
            </tbody>
          )}
          <tbody className="border-t-2 border-gray-800">
            <Row label="Net Pay" current={run.netPayCents} ytd={ytdThroughThisRun.netPayCents} bold />
          </tbody>
        </table>

        <p className="mt-3 text-center text-[10px] text-gray-400">Retain for your records.</p>
      </div>
    </div>
  );
}
