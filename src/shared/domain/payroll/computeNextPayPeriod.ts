export interface PayPeriodDates {
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function lastDayOfMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function calendarParts(iso: string): { year: number; month: number; day: number; yearStr: string; monthStr: string } {
  const [yearStr, monthStr, dayStr] = iso.split('-');
  return { year: Number(yearStr), month: Number(monthStr), day: Number(dayStr), yearStr, monthStr };
}

function fifthOfNextMonth(year: number, month: number): string {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${pad2(nextMonth)}-05`;
}

/** The first Friday strictly after the supplied date. A Friday therefore advances seven days,
 * matching "the following Friday" rather than silently selecting today. */
export function followingFridayIso(fromIso: string): string {
  const date = new Date(`${fromIso}T00:00:00Z`);
  const daysAhead = ((5 - date.getUTCDay() + 7) % 7) || 7;
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

/**
 * A sensible starting period for an employee's very first pay run, based on their pay frequency —
 * used only when there's no prior run to continue a cadence from (see computeNextPayPeriod below).
 * Existing biweekly behavior is preserved. Semi-monthly employees use fixed calendar halves:
 * 1st–15th paid on the 20th, then 16th–month-end paid on the following month's 5th. Monthly
 * employees use the full calendar month and are paid on the following month's 5th. Anything else
 * falls back to one day on `today`, since there is no safe schedule to infer.
 */
export function defaultFirstPayPeriod(payPeriodsPerYear: number, today: string): PayPeriodDates {
  const [yearStr, monthStr, dayStr] = today.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;

  if (payPeriodsPerYear === 26) {
    if (day <= 14) {
      return { payPeriodStart: `${yearStr}-${monthStr}-01`, payPeriodEnd: `${yearStr}-${monthStr}-14`, payDate: `${yearStr}-${monthStr}-15` };
    }
    return {
      payPeriodStart: `${yearStr}-${monthStr}-15`,
      payPeriodEnd: `${yearStr}-${monthStr}-${pad2(lastDayOfMonth(year, month))}`,
      payDate: `${nextMonthYear}-${pad2(nextMonth)}-01`,
    };
  }

  if (payPeriodsPerYear === 24) {
    if (day <= 15) {
      return { payPeriodStart: `${yearStr}-${monthStr}-01`, payPeriodEnd: `${yearStr}-${monthStr}-15`, payDate: `${yearStr}-${monthStr}-20` };
    }
    return {
      payPeriodStart: `${yearStr}-${monthStr}-16`,
      payPeriodEnd: `${yearStr}-${monthStr}-${pad2(lastDayOfMonth(year, month))}`,
      payDate: fifthOfNextMonth(year, month),
    };
  }

  if (payPeriodsPerYear === 12) {
    return {
      payPeriodStart: `${yearStr}-${monthStr}-01`,
      payPeriodEnd: `${yearStr}-${monthStr}-${pad2(lastDayOfMonth(year, month))}`,
      payDate: fifthOfNextMonth(year, month),
    };
  }

  return { payPeriodStart: today, payPeriodEnd: today, payDate: today };
}

/**
 * Defaults a new pay run's dates to continue the employee's existing cadence — period start the
 * day after the last run's period end. Semi-monthly and monthly schedules then snap the end/pay
 * dates to their calendar rules so short months never make the cadence drift. Other frequencies
 * preserve the prior period length and pay-date gap. Falls back to `defaultFirstPayPeriod` when
 * there is no prior run.
 */
export function computeNextPayPeriod(lastRun: PayPeriodDates | null, fallbackDate: string, payPeriodsPerYear?: number): PayPeriodDates {
  if (!lastRun) {
    return defaultFirstPayPeriod(payPeriodsPerYear ?? 0, fallbackDate);
  }
  const payPeriodStart = addDaysIso(lastRun.payPeriodEnd, 1);
  const { year, month, day, yearStr, monthStr } = calendarParts(payPeriodStart);

  if (payPeriodsPerYear === 24) {
    if (day <= 15) {
      return { payPeriodStart, payPeriodEnd: `${yearStr}-${monthStr}-15`, payDate: `${yearStr}-${monthStr}-20` };
    }
    return {
      payPeriodStart,
      payPeriodEnd: `${yearStr}-${monthStr}-${pad2(lastDayOfMonth(year, month))}`,
      payDate: fifthOfNextMonth(year, month),
    };
  }

  if (payPeriodsPerYear === 12) {
    return {
      payPeriodStart,
      payPeriodEnd: `${yearStr}-${monthStr}-${pad2(lastDayOfMonth(year, month))}`,
      payDate: fifthOfNextMonth(year, month),
    };
  }

  const periodLengthDays = daysBetweenIso(lastRun.payPeriodStart, lastRun.payPeriodEnd);
  const payDateOffsetDays = daysBetweenIso(lastRun.payPeriodEnd, lastRun.payDate);
  const payPeriodEnd = addDaysIso(payPeriodStart, periodLengthDays);
  const payDate = addDaysIso(payPeriodEnd, payDateOffsetDays);
  return { payPeriodStart, payPeriodEnd, payDate };
}

/** Picks the most recent run by period end (not insertion order, in case runs were entered out
 * of chronological order) — the one whose cadence the next run should continue from. */
export function mostRecentPayPeriod<T extends PayPeriodDates>(runs: T[]): T | null {
  if (runs.length === 0) return null;
  return runs.reduce((latest, run) => (run.payPeriodEnd > latest.payPeriodEnd ? run : latest));
}
