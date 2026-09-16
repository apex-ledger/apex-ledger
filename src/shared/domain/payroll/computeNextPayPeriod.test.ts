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

  it('defaults a brand-new biweekly employee to the two weeks ending last Saturday, paid the following Friday', () => {
    // 2026-08-05 is a Wednesday: the last whole week ended Saturday 2026-08-01.
    expect(computeNextPayPeriod(null, '2026-08-05', 26)).toEqual({ payPeriodStart: '2026-07-19', payPeriodEnd: '2026-08-01', payDate: '2026-08-07' });
  });

  it('continues biweekly two weeks from the last period, paid the Friday after it ends', () => {
    expect(computeNextPayPeriod({ payPeriodStart: '2026-08-30', payPeriodEnd: '2026-09-12', payDate: '2026-09-18' }, '2026-09-16', 26)).toEqual({ payPeriodStart: '2026-09-13', payPeriodEnd: '2026-09-26', payDate: '2026-10-02' });
  });

  it('puts a drifted biweekly schedule back on whole two-week periods', () => {
    // The old default made a 15th-to-31st run; the next one is still two weeks, paid on a Friday.
    expect(computeNextPayPeriod({ payPeriodStart: '2026-08-15', payPeriodEnd: '2026-08-31', payDate: '2026-09-01' }, '2026-09-16', 26)).toEqual({ payPeriodStart: '2026-09-01', payPeriodEnd: '2026-09-14', payDate: '2026-09-18' });
  });

  it('continues weekly one week at a time, paid the following Friday', () => {
    expect(computeNextPayPeriod({ payPeriodStart: '2026-09-06', payPeriodEnd: '2026-09-12', payDate: '2026-09-18' }, '2026-09-16', 52)).toEqual({ payPeriodStart: '2026-09-13', payPeriodEnd: '2026-09-19', payDate: '2026-09-25' });
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
  it('biweekly: the two weeks ending the most recent Saturday, paid the following Friday', () => {
    expect(defaultFirstPayPeriod(26, '2026-09-16')).toEqual({ payPeriodStart: '2026-08-30', payPeriodEnd: '2026-09-12', payDate: '2026-09-18' });
  });

  it('biweekly: on a Saturday that Saturday ends the period', () => {
    expect(defaultFirstPayPeriod(26, '2026-09-12')).toEqual({ payPeriodStart: '2026-08-30', payPeriodEnd: '2026-09-12', payDate: '2026-09-18' });
  });

  it('biweekly: a period ending late December is paid in January', () => {
    expect(defaultFirstPayPeriod(26, '2026-12-28')).toEqual({ payPeriodStart: '2026-12-13', payPeriodEnd: '2026-12-26', payDate: '2027-01-01' });
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

  it('weekly: the week ending the most recent Saturday, paid the following Friday', () => {
    expect(defaultFirstPayPeriod(52, '2026-09-16')).toEqual({ payPeriodStart: '2026-09-06', payPeriodEnd: '2026-09-12', payDate: '2026-09-18' });
  });

  it('an unrecognized frequency falls back to a single day on the given date', () => {
    expect(defaultFirstPayPeriod(4, '2026-08-05')).toEqual({ payPeriodStart: '2026-08-05', payPeriodEnd: '2026-08-05', payDate: '2026-08-05' });
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
