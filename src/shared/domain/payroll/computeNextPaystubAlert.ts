import type { Employee, PayrollRun } from '../types';
import { computeNextPayPeriod, mostRecentPayPeriod, type PayPeriodDates } from './computeNextPayPeriod';

export interface NextPaystubAlert extends PayPeriodDates {
  employeeId: number;
  employeeName: string;
  daysUntilDue: number;
  draftRunId: number | null;
  employeesDueOnDate: number;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

/** Finds the earliest paystub that needs attention across all active employees.
 *
 * An existing draft wins because that paystub cannot be produced until the run is posted. Otherwise
 * the employee's saved pay frequency and most recent run continue the established payroll cadence.
 */
export function computeNextPaystubAlert(employees: Employee[], runs: PayrollRun[], today: string): NextPaystubAlert | null {
  const candidates = employees.filter((employee) => employee.isActive).map((employee) => {
    const employeeRuns = runs.filter((run) => run.employeeId === employee.id);
    const draft = employeeRuns.filter((run) => run.status === 'draft').sort((a, b) => a.payDate.localeCompare(b.payDate))[0] ?? null;
    const dates = draft ?? computeNextPayPeriod(mostRecentPayPeriod(employeeRuns), today, employee.payPeriodsPerYear);
    return {
      ...dates,
      employeeId: employee.id,
      employeeName: employee.name,
      daysUntilDue: daysBetween(today, dates.payDate),
      draftRunId: draft?.id ?? null,
      employeesDueOnDate: 1,
    };
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.payDate.localeCompare(b.payDate) || a.employeeName.localeCompare(b.employeeName));
  const earliest = candidates[0];
  return { ...earliest, employeesDueOnDate: candidates.filter((candidate) => candidate.payDate === earliest.payDate).length };
}
