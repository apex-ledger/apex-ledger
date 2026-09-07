import { useMemo, useState } from 'react';
import type { Employee, PayrollRun } from '@shared/domain/types';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Last day of February for a year, which is when T4, T4A and T5018 slips and summaries are due. */
function lastDayOfFebruary(year: number): string {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return `${year}-02-${leap ? '29' : '28'}`;
}

interface ChecklistRow {
  id: string;
  title: string;
  dueDate: string;
  detail: string;
  applies: boolean;
  scrollTo: string;
  example: string;
}

/** Everything a Canadian employer must file after the year closes, in due-date order, with what the
 * books already hold for each. Nothing here files anything — every row scrolls to the panel that
 * does — it is the list on the wall that says what is left and when it is due. */
export function YearEndChecklistPanel({ runs, employees, scrollToId }: { runs: PayrollRun[]; employees: Employee[]; scrollToId: (id: string) => void }) {
  const today = localIsoDate();
  const thisYear = Number(today.slice(0, 4));
  // The year being closed: last year until slips are due, then this year.
  const [taxYear, setTaxYear] = useState(today <= lastDayOfFebruary(thisYear) ? thisYear - 1 : thisYear);

  const rows = useMemo<ChecklistRow[]>(() => {
    const yearRuns = runs.filter((r) => r.status === 'posted' && r.payDate.startsWith(String(taxYear)));
    const paidEmployeeIds = new Set(yearRuns.map((r) => r.employeeId));
    const paidEmployees = employees.filter((e) => paidEmployeeIds.has(e.id));
    const ontario = paidEmployees.some((e) => e.province === 'ON');
    const wsib = yearRuns.some((r) => r.wsibEmployerCents > 0);
    const decemberRemittance = yearRuns.some((r) => r.payDate >= `${taxYear}-12-01`);
    const next = taxYear + 1;
    return [
      { id: 'pd7a', title: 'December payroll remittance (PD7A)', dueDate: `${next}-01-15`, detail: decemberRemittance ? `Source deductions on December pay dates go to CRA by January 15.` : 'No December pay dates in this year.', applies: decemberRemittance, scrollTo: 'payroll-pd7a-section', example: 'December pay withheld $1,200 in CPP, EI and tax plus the employer share: pay CRA by January 15 and record it from the bank to Payroll Remittances Payable.' },
      { id: 't4', title: 'T4 slips and T4 Summary', dueDate: lastDayOfFebruary(next), detail: paidEmployees.length > 0 ? `${paidEmployees.length} employee${paidEmployees.length === 1 ? '' : 's'} with pay in ${taxYear}: ${paidEmployees.map((e) => e.name).join(', ')}.` : `No employee was paid in ${taxYear}.`, applies: paidEmployees.length > 0, scrollTo: 'payroll-year-end-section', example: 'Jane earned $52,000 gross with $9,100 tax withheld: box 14 is $52,000, box 22 is $9,100. Give her the slip and file the slips with the summary through CRA My Business Account.' },
      { id: 't4a', title: 'T4A slips for contractors and T5018 for construction subcontractors', dueDate: lastDayOfFebruary(next), detail: 'Any vendor flagged T4A with paid bills, or T5018 with $500 or more, gets a slip. Flag them on the vendor record.', applies: true, scrollTo: 'payroll-year-end-section', example: 'A bookkeeper paid $8,400 across the year as a vendor flagged T4A: box 048 shows $8,400, no tax withheld.' },
      { id: 'eht', title: 'Ontario Employer Health Tax annual return', dueDate: `${next}-03-15`, detail: ontario ? 'Ontario payroll this year. File the annual return even when the exemption covers it all, if the company is registered.' : 'No Ontario employees this year.', applies: ontario, scrollTo: 'payroll-eht-section', example: 'Ontario remuneration $1,300,000 less the $1,000,000 exemption is $300,000 at 1.95%, so $5,850 for the year, less instalments already paid.' },
      { id: 'wsib', title: 'WSIB annual reconciliation', dueDate: `${next}-03-31`, detail: wsib ? 'WSIB premiums were accrued on this year\'s runs. Reconcile the reported insurable earnings with the T4 totals.' : 'No WSIB premiums accrued this year.', applies: wsib, scrollTo: 'payroll-runs-section', example: 'Insurable earnings reported to WSIB during the year were $180,000; the T4 total is $184,000. Report the $4,000 difference and pay the premium on it.' },
      { id: 'roe', title: 'Records of Employment for anyone who left', dueDate: 'within 5 days of the last pay', detail: 'An ROE is due five calendar days after the end of the pay period in which the employee stopped working, whether they quit, were let go, or went on leave.', applies: true, scrollTo: 'payroll-runs-section', example: 'Sam\'s last day was August 29 and the pay period ended September 5: the ROE is due September 10. Use the ROE button on the employee row.' },
      { id: 'vacation', title: 'Vacation pay owing at year end', dueDate: `${taxYear}-12-31`, detail: 'Vacation Pay Payable should equal the unpaid vacation owed to everyone still employed. Pay out or carry forward per the employment standards for the province.', applies: paidEmployees.length > 0, scrollTo: 'payroll-runs-section', example: 'Kim has $1,840 accrued and unused: either a vacation payout run in December, or the liability stays on the balance sheet into the new year.' },
    ];
  }, [runs, employees, taxYear]);

  const [showHow, setShowHow] = useState<Set<string>>(new Set());

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm" data-testid="year-end-checklist">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-900">Payroll year-end checklist</h2>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          Year closed
          <select className="rounded border border-gray-300 bg-white px-2 py-1" value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))}>
            {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
      <ul className="divide-y divide-gray-100">
        {rows.map((row) => {
          const overdue = /^\d{4}-\d{2}-\d{2}$/.test(row.dueDate) && row.dueDate < today && row.applies;
          return (
            <li key={row.id} className={`flex items-start gap-3 py-2 ${row.applies ? '' : 'opacity-50'}`}>
              <div className={`mt-0.5 w-28 shrink-0 rounded px-2 py-0.5 text-center text-xs font-semibold ${!row.applies ? 'bg-gray-100 text-gray-500' : overdue ? 'bg-rose-100 text-rose-800' : 'bg-amber-50 text-amber-800'}`}>{row.dueDate}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-900">{row.title}</div>
                <div className="text-xs text-gray-500">
                  {row.detail}
                  <button type="button" onClick={() => setShowHow((prev) => { const n = new Set(prev); if (n.has(row.id)) n.delete(row.id); else n.add(row.id); return n; })} className="ml-2 text-brand-600 hover:underline">{showHow.has(row.id) ? 'Hide example' : 'Example'}</button>
                </div>
                {showHow.has(row.id) && <p className="mt-1 rounded bg-gray-50 px-2 py-1 text-xs text-gray-700"><span className="font-semibold">Example: </span>{row.example}</p>}
              </div>
              <button type="button" onClick={() => scrollToId(row.scrollTo)} className="shrink-0 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-200">Open</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
