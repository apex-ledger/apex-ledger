import { useEffect, useState } from 'react';
import type { Employee, PayrollRun } from '@shared/domain/types';
import { PayrollCommandCentre } from './PayrollCommandCentre';
import { EmployeeFormModal } from './EmployeeFormModal';
import { PayRunFormModal } from './PayRunFormModal';
import { PostRunModal } from './PostRunModal';
import { Pd7aSummaryPanel } from './Pd7aSummaryPanel';
import { YearEndSlipsPanel } from './YearEndSlipsPanel';
import { EhtPanel } from './EhtPanel';
import { YearEndChecklistPanel } from './YearEndChecklistPanel';
import { ShareholdersPanel } from './ShareholdersPanel';
import { Money } from '../../components/Money';
import { useUiStore } from '../../app/store/uiStore';
import { JournalEntryLink } from '../../components/JournalEntryLink';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { DirectDepositPanel } from './DirectDepositPanel';
import { PayrollItemsPanel } from './PayrollItemsPanel';
import { RoeModal } from './RoeModal';

export function PayrollPage() {
  const setView = useUiStore((s) => s.setView);
  const employerName = useUiStore((s) => s.companyLegalName);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showRunModal, setShowRunModal] = useState(false);
  const [postingRunId, setPostingRunId] = useState<number | null>(null);
  const [roeEmployee, setRoeEmployee] = useState<Employee | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [employeesResult, runsResult] = await Promise.all([window.api.employees.list(), window.api.payrollRuns.list()]);
    if (employeesResult.ok) setEmployees(employeesResult.data);
    if (runsResult.ok) setRuns(runsResult.data);
  }

  useEffect(() => {
    refresh();
  }, []);

  const employeeNameById = new Map(employees.map((e) => [e.id, e.name]));
  const activeEmployees = employees.filter((e) => e.isActive);

  async function handleDeleteRun(run: PayrollRun) {
    const employeeName = employeeNameById.get(run.employeeId) ?? 'this employee';
    if (!window.confirm(`Delete the ${run.payDate} payroll run for ${employeeName}? This cannot be undone.`)) return;
    setError(null);
    const result = await window.api.payrollRuns.delete(run.id);
    if (!result.ok) return setError(result.error);
    refresh();
  }

  async function handleReverseRun(run: PayrollRun) {
    if (!window.confirm(`Reverse this ${run.payDate} payroll run to Draft? Its journal entry will be voided so you can delete and recreate the corrected run.`)) return;
    setError(null);
    const result = await window.api.payrollRuns.reverse(run.id);
    if (!result.ok) return setError(result.error);
    refresh();
  }

  async function handleDeactivate(id: number) {
    const employeeName = employeeNameById.get(id) ?? 'this employee';
    if (!window.confirm(`Deactivate ${employeeName}? The employee will be removed from new payroll selections but their payroll history will be retained.`)) return;
    await window.api.employees.deactivate(id);
    refresh();
  }

  function scrollToId(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-brand-900">Payroll</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage employees, run payroll, review paystubs, and prepare payroll remittances and year-end slips.
        </p>
      </div>

      <PayrollCommandCentre
        onAddEmployee={() => {
          setEditingEmployee(null);
          setShowEmployeeModal(true);
        }}
        onRunPayroll={() => setShowRunModal(true)}
        onScrollToRuns={() => scrollToId('payroll-runs-section')}
        onScrollToRemittance={() => scrollToId('payroll-pd7a-section')}
        onScrollToYearEndSlips={() => scrollToId('payroll-year-end-section')}
        onScrollToShareholders={() => scrollToId('payroll-shareholders-section')}
        hasActiveEmployees={activeEmployees.length > 0}
      />

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="mb-3">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-900">Employees</h2>
          <button
            type="button"
            onClick={() => {
              setEditingEmployee(null);
              setShowEmployeeModal(true);
            }}
            className="rounded-full bg-brand-100 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-200"
          >
            + Add Employee
          </button>
        </div>
        {employees.length === 0 ? (
          <p className="text-sm text-gray-400">No employees yet. Add one to run their first pay period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-2">Name</th>
                <th className="pb-2">Province</th>
                <th className="pb-2">Pay Type</th>
                <th className="pb-2">Rate</th>
                <th className="pb-2">Status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-b border-gray-100">
                  <td className="py-2 font-medium text-gray-800">{e.name}</td>
                  <td className="py-2 text-gray-600">{e.province}</td>
                  <td className="py-2 text-gray-600">{e.payType}</td>
                  <td className="py-2 text-gray-600">
                    {e.payType === 'Hourly' ? <>{e.hourlyRateCents !== null && <Money cents={e.hourlyRateCents} />}/hr</> : e.annualSalaryCents !== null && <Money cents={e.annualSalaryCents} />}
                  </td>
                  <td className="py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${e.isActive ? 'bg-green-100 text-green-800 ring-1 ring-green-200' : 'bg-gray-200 text-gray-500'}`}>
                      {e.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEmployee(e);
                        setShowEmployeeModal(true);
                      }}
                      className="mr-2 text-xs font-medium text-brand-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => setRoeEmployee(e)} className="mr-2 text-xs font-medium text-brand-600 hover:underline" title="Record of Employment">
                      ROE
                    </button>
                    {e.isActive && (
                      <button type="button" onClick={() => handleDeactivate(e.id)} className="text-xs font-medium text-gray-400 hover:underline">
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <PayrollItemsPanel />
      <DirectDepositPanel />
      <section id="payroll-runs-section" className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="mb-3">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-900">Pay Runs</h2>
          <button
            type="button"
            disabled={activeEmployees.length === 0}
            onClick={() => setShowRunModal(true)}
            className="rounded-full bg-gold-100 px-3 py-1.5 text-xs font-medium text-gold-700 hover:bg-gold-200 disabled:opacity-50"
          >
            + Run Payroll
          </button>
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-gray-400">No pay runs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-2">Employee</th>
                <th className="pb-2">Period</th>
                <th className="pb-2">Pay Date</th><EnteredTh className="pb-2" />
                <th className="pb-2 text-right">Gross</th>
                <th className="pb-2 text-right">Net Pay</th>
                <th className="pb-2">Status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 font-medium text-gray-800">{employeeNameById.get(r.employeeId) ?? '—'}</td>
                  <td className="py-2 text-gray-600">
                    {r.payPeriodStart} – {r.payPeriodEnd}
                  </td>
                  <td className="py-2 text-gray-600">{r.payDate}</td><EnteredTd at={r.createdAt} className="py-2" />
                  <td className="py-2 text-right">
                    <Money cents={r.grossPayCents + r.vacationPayCents} />
                  </td>
                  <td className="py-2 text-right font-medium">
                    <Money cents={r.netPayCents} />
                  </td>
                  <td className="py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${r.status === 'posted' ? 'bg-green-100 text-green-800 ring-1 ring-green-200' : 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'}`} title={r.status === 'posted' ? 'Posted runs are locked: the period cannot be run again. Reverse the run to correct it.' : undefined}>{r.status === 'posted' ? 'posted · locked' : r.status}</span>
                  </td>
                  <td className="py-2 text-right">
                    {r.status === 'draft' ? (
                      <>
                        <button type="button" onClick={() => setPostingRunId(r.id)} className="mr-2 text-xs font-medium text-brand-600 hover:underline">
                          Post
                        </button>
                        <button type="button" onClick={() => handleDeleteRun(r)} className="text-xs font-medium text-red-500 hover:underline">
                          Delete
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setView({ kind: 'paystub', runId: r.id })}
                          className="mr-2 text-xs font-medium text-brand-600 hover:underline"
                        >
                          Print Paystub
                        </button>
                        <button
                          type="button"
                          onClick={() => window.api.payrollRuns.savePaystubPdf(r.id)}
                          className="mr-2 text-xs font-medium text-brand-600 hover:underline"
                        >
                          Save PDF
                        </button>
                        <JournalEntryLink id={r.journalEntryId} />
                        <button type="button" onClick={() => handleReverseRun(r)} className="ml-2 text-xs font-medium text-amber-700 hover:underline">
                          Reverse to Draft
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div id="payroll-pd7a-section">
        <Pd7aSummaryPanel runs={runs} employerName={employerName} />
      </div>
      <div id="payroll-eht-section">
        <EhtPanel runs={runs} employees={employees} />
      </div>

      <div id="payroll-year-end-checklist">
        <YearEndChecklistPanel runs={runs} employees={employees} scrollToId={scrollToId} />
      </div>

      <div id="payroll-year-end-section">
        <YearEndSlipsPanel />
      </div>

      <div id="payroll-shareholders-section">
        <ShareholdersPanel />
      </div>

      <RoeModal open={roeEmployee !== null} onClose={() => setRoeEmployee(null)} employee={roeEmployee} />
      <EmployeeFormModal open={showEmployeeModal} onClose={() => setShowEmployeeModal(false)} onSaved={refresh} editing={editingEmployee} />
      <PayRunFormModal open={showRunModal} onClose={() => setShowRunModal(false)} onSaved={refresh} employees={activeEmployees} />
      <PostRunModal open={postingRunId !== null} onClose={() => setPostingRunId(null)} onPosted={refresh} runId={postingRunId} />
    </div>
  );
}
