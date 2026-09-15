import { useEffect, useState } from 'react';
import type { Employee, PayrollRun } from '@shared/domain/types';
import type { ReportKind } from '../../app/store/uiStore';
import { useUiStore } from '../../app/store/uiStore';
import { YearEndSignoffPage } from '../reports/YearEndSignoffPage';
import { YearEndChecklistPanel } from '../payroll/YearEndChecklistPanel';

interface FinalCard { title: string; description: string; report: ReportKind }

const FINAL_REPORTS: FinalCard[] = [
  { title: 'Balance Sheet', description: 'Financial position at the period end.', report: 'balanceSheet' },
  { title: 'Profit and Loss', description: 'Results for the period, with comparatives.', report: 'incomeStatement' },
  { title: 'Fixed Asset / CCA Continuity', description: 'Cost, additions, disposals and depreciation for the year.', report: 'fixedAssetContinuity' },
  { title: 'Comprehensive Company Report', description: 'Financial statements, tax, payroll, evidence and continuity, in one Excel sheet.', report: 'comprehensiveCompany' },
];

/** One screen for the accountant who only opens the file once a year: the client entered
 * everything through the year, and this is where it is checked and closed out — no hunting
 * through the sidebar's day-to-day pages first. Three sections, no sub-tabs: the sign-off
 * checklist (data entry quality through to the balance sheet equation, sales tax and bank
 * reconciliation), the payroll info-slip and remittance deadlines that fall outside it (T4/T4A/
 * T5018, Ontario EHT, WSIB — regional filings that only apply when they apply), and the final
 * statements one click away. Scroll, don't click through pages. */
export function YearEndWorkspacePage() {
  const setView = useUiStore((s) => s.setView);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    window.api.payrollRuns.list().then((r) => r.ok && setRuns(r.data));
    window.api.employees.list().then((r) => r.ok && setEmployees(r.data));
  }, []);

  return (
    <div className="w-full space-y-4" data-testid="year-end-workspace">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Year-End Workspace</h1>
        <p className="text-sm text-gray-500">
          For a once-a-year review of a file the client keeps themselves: what the books show, what still needs fixing, what's due where, and the final statements — one page, top to bottom.
        </p>
      </div>

      <section id="year-end-signoff-section">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Sign-off checklist — data entry through to the balance sheet</h2>
        <YearEndSignoffPage />
      </section>

      {(runs.length > 0 || employees.length > 0) && (
        <section id="year-end-payroll-section">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Payroll info slips and regional filings</h2>
          <YearEndChecklistPanel runs={runs} employees={employees} scrollToId={() => setView({ kind: 'payroll' })} />
        </section>
      )}

      <section id="year-end-statements-section">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Final statements</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          {FINAL_REPORTS.map((c) => (
            <button key={c.report} type="button" onClick={() => setView({ kind: 'report', report: c.report })} className="rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-brand-300 hover:bg-brand-50">
              <div className="text-sm font-semibold text-gray-900">{c.title}</div>
              <div className="text-xs text-gray-500">{c.description}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
