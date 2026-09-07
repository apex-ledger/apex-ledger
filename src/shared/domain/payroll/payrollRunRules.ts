/** What makes a pay run impossible before any tax is calculated.
 *
 * Payroll is the one place a duplicate is expensive twice: the employee is overpaid, and the
 * remittance to the CRA is overstated with it. A second run for a period that already has one is
 * almost always the same run entered again — so it is refused rather than allowed and later found
 * on the PD7A. Dates that run backwards are the same class of mistake caught at the door.
 */

export interface PayrollPeriod {
  employeeId: number;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
}

export interface ExistingPayrollRun {
  id: number;
  employeeId: number;
  payPeriodStart: string;
  payPeriodEnd: string;
  /** A vacation payout is paid on top of a regular run for the same period, so it never counts
   * as a duplicate of one. */
  isVacationPayout: boolean;
  /** When known, a posted run is reported as locked: it is on the books and in the remittance. */
  status?: 'draft' | 'posted' | string;
  payDate?: string;
}

/** Why these dates cannot be a pay period, or null if they can. */
export function payrollDatesRefusalReason(period: Pick<PayrollPeriod, 'payPeriodStart' | 'payPeriodEnd' | 'payDate'>): string | null {
  if (period.payPeriodEnd < period.payPeriodStart) {
    return `The pay period ends on ${period.payPeriodEnd}, before it starts on ${period.payPeriodStart}. Check the period dates.`;
  }
  if (period.payDate < period.payPeriodStart) {
    return `The pay date ${period.payDate} is before the pay period starts on ${period.payPeriodStart}. An employee cannot be paid for work not yet begun — check the pay date.`;
  }
  return null;
}

/** Why this run would double up an existing one, or null if it stands alone. `excludeRunId` is the
 * run being edited, which is allowed to overlap itself. */
export function duplicatePayrollPeriodRefusalReason(
  period: PayrollPeriod & { isVacationPayout?: boolean },
  existing: ExistingPayrollRun[],
  employeeName: string,
  excludeRunId: number | null = null,
): string | null {
  if (period.isVacationPayout) return null;
  const clash = existing.find(
    (run) =>
      run.id !== excludeRunId &&
      run.employeeId === period.employeeId &&
      !run.isVacationPayout &&
      run.payPeriodStart <= period.payPeriodEnd &&
      run.payPeriodEnd >= period.payPeriodStart,
  );
  if (!clash) return null;
  if (clash.status === 'posted') {
    return `${employeeName} already has a pay run covering ${clash.payPeriodStart} to ${clash.payPeriodEnd}, posted${clash.payDate ? ` on ${clash.payDate}` : ''} and locked. It cannot be run again — reverse that run first if it was wrong.`;
  }
  return `${employeeName} already has a pay run covering ${clash.payPeriodStart} to ${clash.payPeriodEnd}. Open that run instead of entering the period again, or reverse it first if it was wrong.`;
}
