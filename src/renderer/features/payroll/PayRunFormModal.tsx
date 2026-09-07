import { useEffect, useState } from 'react';
import type { Employee } from '@shared/domain/types';
import type { PayCalculationResult } from '@shared/domain/payroll/calculatePay';
import { computeNextPayPeriod, followingFridayIso, mostRecentPayPeriod } from '@shared/domain/payroll/computeNextPayPeriod';
import { isSupportedAutoTaxProvince } from '@shared/domain/payroll/calculateIncomeTax';
import { hasPostablePayrollAmount } from '@shared/domain/payroll/buildPayrollJournalLines';
import { duplicatePayrollPeriodRefusalReason, payrollDatesRefusalReason } from '@shared/domain/payroll/payrollRunRules';
import { Modal } from '../../components/Modal';
import { CurrencyInput } from '../../components/CurrencyInput';
import { Money } from '../../components/Money';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { PAYROLL_ITEM_KIND_LABELS, type PayRunItem, type PayrollItemDefinition } from '@shared/domain/payroll/payrollItems';

function today(): string {
  return localIsoDate();
}

function automaticPayDate(next: { payDate: string }, payPeriodsPerYear?: number): string {
  // Preserve the established following-Friday behavior for biweekly (and any legacy weekly
  // employee). Calendar-based schedules use the exact payday calculated by their rules.
  return payPeriodsPerYear === 24 || payPeriodsPerYear === 12 ? next.payDate : followingFridayIso(today());
}

export function PayRunFormModal({
  open,
  onClose,
  onSaved,
  employees,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  employees: Employee[];
}) {
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [payPeriodStart, setPayPeriodStart] = useState(today());
  const [payPeriodEnd, setPayPeriodEnd] = useState(today());
  const [payDate, setPayDate] = useState(today());
  const [regularHours, setRegularHours] = useState('');
  const [overtimeHours, setOvertimeHours] = useState('');
  const [incomeTaxCents, setIncomeTaxCents] = useState(0);
  const [rrspEmployerMatchCents, setRrspEmployerMatchCents] = useState(0);
  const [manualOverride, setManualOverride] = useState(true);
  const [catalogue, setCatalogue] = useState<PayrollItemDefinition[]>([]);
  const [runItems, setRunItems] = useState<PayRunItem[]>([]);
  const [pickItemId, setPickItemId] = useState('');
  const [existingRuns, setExistingRuns] = useState<Array<{ id: number; employeeId: number; payPeriodStart: string; payPeriodEnd: string; isVacationPayout: boolean; status: string; payDate: string }>>([]);
  const [preview, setPreview] = useState<PayCalculationResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const employee = employees.find((e) => e.id === employeeId) ?? null;
  const supportsAutoTax = isSupportedAutoTaxProvince(employee?.province ?? '');
  // The same rule the server applies on save, checked live so the warning shows while the dates
  // are being chosen — a posted period is locked; a draft one should be opened instead.
  const periodClash =
    employeeId === null
      ? null
      : payrollDatesRefusalReason({ payPeriodStart, payPeriodEnd, payDate }) ??
        duplicatePayrollPeriodRefusalReason({ employeeId, payPeriodStart, payPeriodEnd, payDate }, existingRuns, employee?.name ?? 'This employee');
  const clashIsPosted = periodClash !== null && /locked/.test(periodClash);

  useEffect(() => {
    if (!open || employeeId === null) return;
    let cancelled = false;
    window.api.payrollRuns.list(employeeId).then((r) => {
      if (!cancelled && r.ok) setExistingRuns(r.data.map((run) => ({ id: run.id, employeeId: run.employeeId, payPeriodStart: run.payPeriodStart, payPeriodEnd: run.payPeriodEnd, isVacationPayout: run.isVacationPayout, status: run.status, payDate: run.payDate })));
    });
    return () => {
      cancelled = true;
    };
  }, [open, employeeId]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setEmployeeId(employees[0]?.id ?? null);
    setRegularHours('');
    setOvertimeHours('');
    setIncomeTaxCents(0);
    setRrspEmployerMatchCents(employees[0]?.rrspEmployerMatchCents ?? 0);
    setPreview(null);
    setRunItems([]);
    window.api.payrollItems.list().then((r) => { if (r.ok) setCatalogue(r.data.filter((i) => i.isActive)); });
  }, [open, employees]);

  function addItem(def: PayrollItemDefinition) {
    setRunItems((prev) => [...prev, { itemId: def.id ?? null, name: def.name, kind: def.kind, cppApplies: def.cppApplies, eiApplies: def.eiApplies, taxApplies: def.taxApplies, t4Box: def.t4Box, amountCents: def.defaultAmountCents, accountId: def.accountId }]);
  }

  // Continue the employee's selected schedule. Biweekly retains its established following-Friday
  // payday; semi-monthly and monthly use their fixed 20th/5th calendar paydays.
  useEffect(() => {
    if (!open || employeeId === null) {
      if (open) {
        setPayPeriodStart(today());
        setPayPeriodEnd(today());
        setPayDate(today());
      }
      return;
    }
    let cancelled = false;
    const emp = employees.find((e) => e.id === employeeId);
    window.api.payrollRuns.list(employeeId).then((r) => {
      if (cancelled) return;
      const lastRun = r.ok ? mostRecentPayPeriod(r.data) : null;
      const next = computeNextPayPeriod(lastRun, today(), emp?.payPeriodsPerYear);
      setPayPeriodStart(next.payPeriodStart);
      setPayPeriodEnd(next.payPeriodEnd);
      setPayDate(automaticPayDate(next, emp?.payPeriodsPerYear));
    });
    return () => {
      cancelled = true;
    };
  }, [open, employeeId, employees]);

  // Employees in a supported province default to the auto-calculated CRA figure; every other
  // province still needs a manual PDOC entry (see SUPPORTED_AUTO_TAX_PROVINCES in calculateIncomeTax.ts).
  useEffect(() => {
    setManualOverride(!supportsAutoTax);
    setRrspEmployerMatchCents(employee?.rrspEmployerMatchCents ?? 0);
  }, [employeeId, supportsAutoTax, employee?.rrspEmployerMatchCents]);

  useEffect(() => {
    if (!open || employeeId === null) return;
    let cancelled = false;
    setPreviewError(null);
    window.api.payrollRuns
      .calculate({
        employeeId,
        payPeriodStart,
        payPeriodEnd,
        payDate,
        regularHours: regularHours ? Number(regularHours) : null,
        overtimeHours: overtimeHours ? Number(overtimeHours) : null,
        incomeTaxCents: manualOverride ? incomeTaxCents : null,
        rrspEmployerMatchCents,
        items: runItems,
      })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) return setPreviewError(result.error);
        setPreview(result.data);
      });
    return () => {
      cancelled = true;
    };
  }, [open, employeeId, payPeriodStart, payPeriodEnd, payDate, regularHours, overtimeHours, incomeTaxCents, manualOverride, rrspEmployerMatchCents, runItems]);

  async function prepareNextPayroll() {
    setRegularHours('');
    setOvertimeHours('');
    setIncomeTaxCents(0);
    setRunItems([]);
    setPreview(null);
    const currentIndex = employees.findIndex((entry) => entry.id === employeeId);
    const nextEmployee = employees.length > 1 ? employees[(currentIndex + 1) % employees.length] : employee;
    if (!nextEmployee) return;
    if (nextEmployee.id !== employeeId) {
      setEmployeeId(nextEmployee.id);
      return;
    }
    const result = await window.api.payrollRuns.list(nextEmployee.id);
    const lastRun = result.ok ? mostRecentPayPeriod(result.data) : null;
    const next = computeNextPayPeriod(lastRun, today(), nextEmployee.payPeriodsPerYear);
    setPayPeriodStart(next.payPeriodStart);
    setPayPeriodEnd(next.payPeriodEnd);
    setPayDate(automaticPayDate(next, nextEmployee.payPeriodsPerYear));
    setRrspEmployerMatchCents(nextEmployee.rrspEmployerMatchCents ?? 0);
  }

  async function handleSave(after: 'close' | 'next') {
    if (employeeId === null) return;
    setBusy(true);
    setError(null);
    const result = await window.api.payrollRuns.create({
      employeeId,
      payPeriodStart,
      payPeriodEnd,
      payDate,
      regularHours: regularHours ? Number(regularHours) : null,
      overtimeHours: overtimeHours ? Number(overtimeHours) : null,
      incomeTaxCents: manualOverride ? incomeTaxCents : null,
      rrspEmployerMatchCents,
      items: runItems,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onSaved();
    if (after === 'close') return onClose();
    await prepareNextPayroll();
  }

  return (
    <Modal fullScreen
      open={open}
      onClose={onClose}
      title="Run Payroll"
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || employeeId === null || !preview || preview.netPayCents < 0 || !hasPostablePayrollAmount(preview) || periodClash !== null}
            onClick={() => handleSave('close')}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Save &amp; Close
          </button>
          <button
            type="button"
            disabled={busy || employeeId === null || !preview || preview.netPayCents < 0 || !hasPostablePayrollAmount(preview) || periodClash !== null}
            onClick={() => handleSave('next')}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Save &amp; Next
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-3">
          {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {periodClash && (
            <div className={`rounded px-3 py-2 text-sm ${clashIsPosted ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`} data-testid="pay-run-period-warning">
              <span className="font-semibold">{clashIsPosted ? 'Period locked. ' : 'Period already entered. '}</span>
              {periodClash}
            </div>
          )}
          <label className="block text-sm">
            <span className="text-gray-600">Employee</span>
            <select
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5"
              value={employeeId ?? ''}
              onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : null)}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block text-sm">
              <span className="text-gray-600">Period Start</span>
              <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={payPeriodStart} onChange={(e) => setPayPeriodStart(clampIsoDate(e.target.value))} />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Period End</span>
              <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={payPeriodEnd} onChange={(e) => setPayPeriodEnd(clampIsoDate(e.target.value))} />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Pay Date</span>
              <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={payDate} onChange={(e) => setPayDate(clampIsoDate(e.target.value))} />
              <span className="mt-1 block text-xs text-gray-400">
                {employee?.payPeriodsPerYear === 24
                  ? '1st–15th pays on the 20th; 16th–month-end pays on the following 5th.'
                  : employee?.payPeriodsPerYear === 12
                    ? 'The full calendar month pays on the following month’s 5th.'
                    : 'Biweekly defaults to the following Friday; edit it when the actual payday differs.'}
              </span>
            </label>
          </div>
          {employee?.payType === 'Hourly' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="text-gray-600">Regular Hours</span>
                <input type="number" min={0} step="0.25" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={regularHours} onChange={(e) => setRegularHours(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Overtime Hours</span>
                <input type="number" min={0} step="0.25" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={overtimeHours} onChange={(e) => setOvertimeHours(e.target.value)} />
              </label>
            </div>
          ) : (
            <p className="text-xs text-gray-400">Salaried employee — gross pay is annual salary ÷ pay periods per year.</p>
          )}
          <div className="block text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Income Tax</span>
              {supportsAutoTax && (
                <label className="flex items-center gap-1 text-xs text-gray-500">
                  <input type="checkbox" checked={manualOverride} onChange={(e) => setManualOverride(e.target.checked)} />
                  Manual override
                </label>
              )}
            </div>
            {manualOverride ? (
              <>
                <CurrencyInput valueCents={incomeTaxCents} onChange={setIncomeTaxCents} />
                <p className="mt-1 text-xs text-gray-400">Enter the income tax deduction for this pay period.</p>
              </>
            ) : (
              <>
                <CurrencyInput valueCents={preview?.incomeTaxCents ?? 0} onChange={() => {}} disabled />
              </>
            )}
          </div>
          <label className="block text-sm">
            <span className="text-gray-600">Employer RRSP Contribution (optional)</span>
            <CurrencyInput valueCents={rrspEmployerMatchCents} onChange={setRrspEmployerMatchCents} />
            <p className="mt-1 text-xs text-amber-700">
              Paid by the employer directly to the employee's RRSP. Confirm the employee has enough RRSP deduction room.
            </p>
          </label>
          <div className="block text-sm" data-testid="pay-run-items">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Additional Items</span>
              <span className="flex items-center gap-1">
                <select className="rounded border border-gray-300 bg-white px-2 py-1 text-xs" value={pickItemId} onChange={(e) => setPickItemId(e.target.value)}>
                  <option value="">Add bonus, benefit, deduction…</option>
                  {catalogue.map((def) => (
                    <option key={def.id} value={def.id}>{def.name} — {PAYROLL_ITEM_KIND_LABELS[def.kind]}</option>
                  ))}
                </select>
                <button type="button" disabled={!pickItemId} onClick={() => { const def = catalogue.find((d) => String(d.id) === pickItemId); if (def) addItem(def); setPickItemId(''); }} className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-50">Add</button>
              </span>
            </div>
            {runItems.length > 0 && (
              <table className="mt-1 w-full text-xs">
                <tbody className="divide-y divide-gray-100">
                  {runItems.map((item, index) => (
                    <tr key={index}>
                      <td className="py-1 pr-2 text-gray-700">{item.name}</td>
                      <td className="py-1 pr-2 text-gray-400">{PAYROLL_ITEM_KIND_LABELS[item.kind]}</td>
                      <td className="py-1 w-32"><CurrencyInput valueCents={item.amountCents} onChange={(c) => setRunItems((prev) => prev.map((it, i) => (i === index ? { ...it, amountCents: c } : it)))} /></td>
                      <td className="py-1 pl-2 text-right"><button type="button" onClick={() => setRunItems((prev) => prev.filter((_, i) => i !== index))} className="text-gray-400 hover:text-red-600">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-1 text-xs text-gray-400">Cash earnings add to gross; benefits are taxed but not paid; deductions come off net; reimbursements are added to net tax-free.</p>
          </div>
        </div>

        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Pay Summary</h3>
          {previewError && <p className="text-sm text-red-600">{previewError}</p>}
          {preview && (
            <dl className="space-y-1 text-sm">
              <Row label="Regular Pay" cents={preview.regularPayCents} />
              <Row label="Overtime Pay" cents={preview.overtimePayCents} />
              <Row label="Vacation Pay" cents={preview.vacationPayCents} />
              {preview.items.filter((i) => i.kind === 'earning' && i.amountCents > 0).map((i, k) => <Row key={`e${k}`} label={i.name} cents={i.amountCents} />)}
              <Row label="Gross Pay" cents={preview.grossPayCents + preview.vacationPayCents} bold />
              {preview.itemsSummary.benefitsCents > 0 && <Row label="Taxable benefits (non-cash)" cents={preview.itemsSummary.benefitsCents} muted />}
              <div className="my-2 border-t border-gray-200" />
              <Row label="CPP" cents={-(preview.cpp1EmployeeCents + preview.cpp2EmployeeCents)} />
              <Row label="EI" cents={-preview.eiEmployeeCents} />
              <Row label="Income Tax" cents={-preview.incomeTaxCents} />
              {preview.items.filter((i) => i.kind === 'deduction' && i.amountCents > 0).map((i, k) => <Row key={`d${k}`} label={i.name} cents={-i.amountCents} />)}
              {preview.items.filter((i) => i.kind === 'reimbursement' && i.amountCents > 0).map((i, k) => <Row key={`r${k}`} label={`${i.name} (reimbursement)`} cents={i.amountCents} />)}
              <div className="my-2 border-t border-gray-200" />
              <Row label="Net Pay" cents={preview.netPayCents} bold />
              <div className="my-2 border-t border-gray-200" />
              <Row label="Employer CPP" cents={preview.cpp1EmployerCents + preview.cpp2EmployerCents} muted />
              <Row label="Employer EI" cents={preview.eiEmployerCents} muted />
              {preview.wsibEmployerCents > 0 && <Row label="WSIB Premium" cents={preview.wsibEmployerCents} muted />}
              {preview.rrspEmployerMatchCents > 0 && <Row label="Employer RRSP Contribution" cents={preview.rrspEmployerMatchCents} muted />}
              {preview.healthBenefitCents > 0 && <Row label="Health/Dental Benefit" cents={preview.healthBenefitCents} muted />}
              {preview.items.filter((i) => i.kind === 'employerContribution' && i.amountCents > 0).map((i, k) => <Row key={`c${k}`} label={i.name} cents={i.amountCents} muted />)}
              <Row label="Total Employer Cost" cents={preview.totalEmployerCostCents} muted bold />
            </dl>
          )}
          {preview && preview.netPayCents < 0 && (
            <p className="mt-2 text-xs font-medium text-red-600">Net pay is negative — review the income tax amount and payroll deductions.</p>
          )}
          {preview && !hasPostablePayrollAmount(preview) && (
            <p className="mt-2 text-xs font-medium text-amber-700">Enter regular hours, overtime, salary, or an employer benefit before saving this pay run.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, cents, bold = false, muted = false }: { label: string; cents: number; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-semibold' : ''} ${muted ? 'text-gray-400' : 'text-gray-700'}`}>
      <span>{label}</span>
      <Money cents={cents} />
    </div>
  );
}
