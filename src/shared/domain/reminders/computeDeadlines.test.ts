import { describe, expect, it } from 'vitest';
import { computeAllDeadlines, computeHstFilingDeadline, computeTaxFilingDeadline, computeYearEndDeadline, colorForDueDate } from './computeDeadlines';

describe('computeYearEndDeadline', () => {
  it('returns this year end when still upcoming', () => {
    const d = computeYearEndDeadline({ fiscalYearEndMonth: 12, fiscalYearEndDay: 31, hstFilingFrequency: 'None' }, '2026-06-01');
    expect(d.dueDate).toBe('2026-12-31');
  });

  it('rolls to next year once the anchor date has passed', () => {
    const d = computeYearEndDeadline({ fiscalYearEndMonth: 3, fiscalYearEndDay: 31, hstFilingFrequency: 'None' }, '2026-06-01');
    expect(d.dueDate).toBe('2027-03-31');
  });

  it('clamps Feb 29 anchor to Feb 28 in a non-leap year', () => {
    const d = computeYearEndDeadline({ fiscalYearEndMonth: 2, fiscalYearEndDay: 29, hstFilingFrequency: 'None' }, '2026-01-01');
    expect(d.dueDate).toBe('2026-02-28');
  });
});

describe('computeTaxFilingDeadline', () => {
  it('is 6 months after fiscal year end, still upcoming', () => {
    const d = computeTaxFilingDeadline({ fiscalYearEndMonth: 12, fiscalYearEndDay: 31, hstFilingFrequency: 'None' }, '2026-03-01');
    expect(d.dueDate).toBe('2026-06-30');
  });

  it('rolls to next cycle once this cycle deadline has passed', () => {
    const d = computeTaxFilingDeadline({ fiscalYearEndMonth: 12, fiscalYearEndDay: 31, hstFilingFrequency: 'None' }, '2026-07-15');
    expect(d.dueDate).toBe('2027-06-30');
  });
});

describe('computeHstFilingDeadline', () => {
  it('returns null for None frequency', () => {
    expect(computeHstFilingDeadline({ fiscalYearEndMonth: 12, fiscalYearEndDay: 31, hstFilingFrequency: 'None' }, '2026-06-01')).toBeNull();
  });

  it('monthly: next month-end from mid-month', () => {
    const d = computeHstFilingDeadline({ fiscalYearEndMonth: 12, fiscalYearEndDay: 31, hstFilingFrequency: 'Monthly' }, '2026-06-15');
    expect(d?.dueDate).toBe('2026-06-30');
  });

  it('monthly: rolls to next month when reference date is the last day', () => {
    const d = computeHstFilingDeadline({ fiscalYearEndMonth: 12, fiscalYearEndDay: 31, hstFilingFrequency: 'Monthly' }, '2026-07-01');
    expect(d?.dueDate).toBe('2026-07-31');
  });

  it('quarterly: picks the next quarter-end+1month deadline', () => {
    const d = computeHstFilingDeadline({ fiscalYearEndMonth: 12, fiscalYearEndDay: 31, hstFilingFrequency: 'Quarterly' }, '2026-02-01');
    expect(d?.dueDate).toBe('2026-04-30');
  });

  it('quarterly: wraps into next year from December', () => {
    const d = computeHstFilingDeadline({ fiscalYearEndMonth: 12, fiscalYearEndDay: 31, hstFilingFrequency: 'Quarterly' }, '2026-12-01');
    expect(d?.dueDate).toBe('2027-01-31');
  });

  it('annually: 3 months after fiscal year end', () => {
    const d = computeHstFilingDeadline({ fiscalYearEndMonth: 12, fiscalYearEndDay: 31, hstFilingFrequency: 'Annually' }, '2026-01-15');
    expect(d?.dueDate).toBe('2026-03-31');
  });
});

describe('colorForDueDate', () => {
  it('is red when overdue', () => {
    expect(colorForDueDate('2026-01-01', '2026-02-01')).toBe('red');
  });
  it('is red when due within 2 weeks', () => {
    expect(colorForDueDate('2026-02-10', '2026-02-01')).toBe('red');
  });
  it('is amber when due within a month', () => {
    expect(colorForDueDate('2026-02-25', '2026-02-01')).toBe('amber');
  });
  it('is green when far out', () => {
    expect(colorForDueDate('2026-06-01', '2026-02-01')).toBe('green');
  });
});

describe('computeAllDeadlines', () => {
  it('returns 3 deadlines sorted by date when HST filing is active', () => {
    const deadlines = computeAllDeadlines(
      { fiscalYearEndMonth: 12, fiscalYearEndDay: 31, hstFilingFrequency: 'Quarterly' },
      '2026-02-01'
    );
    expect(deadlines).toHaveLength(3);
    for (let i = 1; i < deadlines.length; i++) {
      expect(deadlines[i].dueDate >= deadlines[i - 1].dueDate).toBe(true);
    }
  });

  it('returns only 2 deadlines when HST filing frequency is None', () => {
    const deadlines = computeAllDeadlines({ fiscalYearEndMonth: 12, fiscalYearEndDay: 31, hstFilingFrequency: 'None' }, '2026-02-01');
    expect(deadlines).toHaveLength(2);
    expect(deadlines.map((d) => d.category)).toEqual(expect.arrayContaining(['TaxFiling', 'YearEnd']));
  });
});
