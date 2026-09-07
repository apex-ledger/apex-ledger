import { describe, expect, it } from 'vitest';
import { computeNextPayPeriod, defaultFirstPayPeriod, followingFridayIso, mostRecentPayPeriod } from './computeNextPayPeriod';

describe('followingFridayIso', () => {
  it('selects the upcoming Friday from a weekday', () => {
    expect(followingFridayIso('2026-08-05')).toBe('2026-08-07');
  });

  it('moves a Friday to the following week', () => {
    expect(followingFridayIso('2026-08-07')).toBe('2026-08-14');
  });
});

describe('computeNextPayPeriod', () => {
  it('continues a biweekly cadence with pay date same-day as period end', () => {
    const next = computeNextPayPeriod({ payPeriodStart: '2026-07-15', payPeriodEnd: '2026-07-28', payDate: '2026-07-28' }, '2026-08-01');
    expect(next).toEqual({ payPeriodStart: '2026-07-29', payPeriodEnd: '2026-08-11', payDate: '2026-08-11' });
  });

  it('preserves a pay date that lags the period end by a fixed number of days', () => {
    const next = computeNextPayPeriod({ payPeriodStart: '2026-07-01', payPeriodEnd: '2026-07-14', payDate: '2026-07-18' }, '2026-08-01');
    expect(next).toEqual({ payPeriodStart: '2026-07-15', payPeriodEnd: '2026-07-28', payDate: '2026-08-01' });
  });

  it('continues a weekly cadence', () => {
    const next = computeNextPayPeriod({ payPeriodStart: '2026-07-20', payPeriodEnd: '2026-07-26', payDate: '2026-07-26' }, '2026-08-01');
    expect(next).toEqual({ payPeriodStart: '2026-07-27', payPeriodEnd: '2026-08-02', payDate: '2026-08-02' });
  });

  it('handles a period that crosses a month boundary', () => {
    const next = computeNextPayPeriod({ payPeriodStart: '2026-01-19', payPeriodEnd: '2026-02-01', payDate: '2026-02-01' }, '2026-08-01');
    expect(next.payPeriodStart).toBe('2026-02-02');
    expect(next.payPeriodEnd).toBe('2026-02-15');
  });

  it('falls back to a single day on the given date when there is no prior run and no pay frequency is known', () => {
    expect(computeNextPayPeriod(null, '2026-08-01')).toEqual({ payPeriodStart: '2026-08-01', payPeriodEnd: '2026-08-01', payDate: '2026-08-01' });
  });

  it('defaults a brand-new biweekly employee to a real calendar period instead of a same-day one', () => {
    expect(computeNextPayPeriod(null, '2026-08-05', 26)).toEqual({ payPeriodStart: '2026-08-01', payPeriodEnd: '2026-08-14', payDate: '2026-08-15' });
  });

  it('continues semi-monthly from the first half into the second half', () => {
    expect(computeNextPayPeriod({ payPeriodStart: '2026-04-01', payPeriodEnd: '2026-04-15', payDate: '2026-04-20' }, '2026-04-20', 24)).toEqual({
      payPeriodStart: '2026-04-16',
      payPeriodEnd: '2026-04-30',
      payDate: '2026-05-05',
    });
  });

  it('continues semi-monthly from month-end into the next first half', () => {
    expect(computeNextPayPeriod({ payPeriodStart: '2026-12-16', payPeriodEnd: '2026-12-31', payDate: '2027-01-05' }, '2027-01-01', 24)).toEqual({
      payPeriodStart: '2027-01-01',
      payPeriodEnd: '2027-01-15',
      payDate: '2027-01-20',
    });
  });

  it('continues monthly by calendar month without drifting after February', () => {
    expect(computeNextPayPeriod({ payPeriodStart: '2028-02-01', payPeriodEnd: '2028-02-29', payDate: '2028-03-05' }, '2028-03-01', 12)).toEqual({
      payPeriodStart: '2028-03-01',
      payPeriodEnd: '2028-03-31',
      payDate: '2028-04-05',
    });
  });
});

describe('defaultFirstPayPeriod', () => {
  it('biweekly: gives the 1st-14th (paid the 15th) when today is in the first half of the month', () => {
    expect(defaultFirstPayPeriod(26, '2026-08-05')).toEqual({ payPeriodStart: '2026-08-01', payPeriodEnd: '2026-08-14', payDate: '2026-08-15' });
  });

  it('biweekly: gives the 15th-end of month (paid the 1st of next month) when today is in the second half', () => {
    expect(defaultFirstPayPeriod(26, '2026-08-20')).toEqual({ payPeriodStart: '2026-08-15', payPeriodEnd: '2026-08-31', payDate: '2026-09-01' });
  });

  it('biweekly: rolls the pay date into January when the second half falls in December', () => {
    expect(defaultFirstPayPeriod(26, '2026-12-20')).toEqual({ payPeriodStart: '2026-12-15', payPeriodEnd: '2026-12-31', payDate: '2027-01-01' });
  });

  it('semi-monthly first half runs 1st-15th and pays on the 20th', () => {
    expect(defaultFirstPayPeriod(24, '2026-02-03')).toEqual({ payPeriodStart: '2026-02-01', payPeriodEnd: '2026-02-15', payDate: '2026-02-20' });
  });

  it('semi-monthly second half runs 16th-month-end and pays on the following 5th', () => {
    expect(defaultFirstPayPeriod(24, '2026-02-20')).toEqual({ payPeriodStart: '2026-02-16', payPeriodEnd: '2026-02-28', payDate: '2026-03-05' });
  });

  it('semi-monthly rolls December second-half payday into January', () => {
    expect(defaultFirstPayPeriod(24, '2026-12-20')).toEqual({ payPeriodStart: '2026-12-16', payPeriodEnd: '2026-12-31', payDate: '2027-01-05' });
  });

  it('monthly gives the full current calendar month, paid on the following 5th', () => {
    expect(defaultFirstPayPeriod(12, '2026-02-10')).toEqual({ payPeriodStart: '2026-02-01', payPeriodEnd: '2026-02-28', payDate: '2026-03-05' });
  });

  it('an unrecognized frequency (e.g. weekly) falls back to a single day on the given date', () => {
    expect(defaultFirstPayPeriod(52, '2026-08-05')).toEqual({ payPeriodStart: '2026-08-05', payPeriodEnd: '2026-08-05', payDate: '2026-08-05' });
  });
});

describe('mostRecentPayPeriod', () => {
  it('picks the run with the latest period end, not the last one in the array', () => {
    const runs = [
      { payPeriodStart: '2026-07-01', payPeriodEnd: '2026-07-14', payDate: '2026-07-14' },
      { payPeriodStart: '2026-08-01', payPeriodEnd: '2026-08-14', payDate: '2026-08-14' },
      { payPeriodStart: '2026-07-15', payPeriodEnd: '2026-07-28', payDate: '2026-07-28' },
    ];
    expect(mostRecentPayPeriod(runs)?.payPeriodStart).toBe('2026-08-01');
  });

  it('returns null for an empty list', () => {
    expect(mostRecentPayPeriod([])).toBeNull();
  });
});
