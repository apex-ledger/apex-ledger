import { describe, expect, it } from 'vitest';
import { buildChartSeries, labelColumn, numericColumns, parseReportNumber } from './chartSeries';

describe('reading figures off a report as they appear on screen', () => {
  it('understands currency, accounting negatives, percentages and minus signs', () => {
    expect(parseReportNumber('$1,234.56')).toBe(1234.56);
    expect(parseReportNumber('(500.00)')).toBe(-500);
    expect(parseReportNumber('-40')).toBe(-40);
    expect(parseReportNumber('−40')).toBe(-40); // a real minus sign, not a hyphen
    expect(parseReportNumber('12.5%')).toBe(12.5);
    expect(parseReportNumber('0.00')).toBe(0);
  });

  it('refuses anything that is not a figure, which is how label columns are spotted', () => {
    expect(parseReportNumber('Rent')).toBeNull();
    expect(parseReportNumber('')).toBeNull();
    expect(parseReportNumber('—')).toBeNull();
    expect(parseReportNumber('2026-01-01')).toBeNull();
    expect(parseReportNumber('INV-2026-0001')).toBeNull();
  });
});

const rows = [
  ['Account', 'Code', 'Amount'],
  ['Rent', '5100', '$2,000.00'],
  ['Wages', '5200', '$5,000.00'],
  ['Insurance', '5300', '(250.00)'],
  ['Total', '', '$6,750.00'],
];

describe('choosing what to chart', () => {
  it('finds the figure columns and labels by the first column that is not one', () => {
    const numeric = numericColumns(rows);
    expect(numeric).toContain(2);
    expect(labelColumn(rows, numeric)).toBe(0);
  });

  it('leaves the total row out, so a pie is not half its true size', () => {
    const series = buildChartSeries(rows, 2)!;
    expect(series.points.map((p) => p.label)).toEqual(['Wages', 'Rent', 'Insurance']);
    expect(series.points.reduce((sum, p) => sum + p.value, 0)).toBe(6750);
    expect(series.valueColumnLabel).toBe('Amount');
  });

  it('keeps accounting negatives negative rather than flipping them positive', () => {
    const series = buildChartSeries(rows, 2)!;
    expect(series.points.find((p) => p.label === 'Insurance')?.value).toBe(-250);
  });

  it('orders by size and folds a long tail into one Other, so the chart stays readable', () => {
    const many = [['Account', 'Amount'], ...Array.from({ length: 20 }, (_, i) => [`Account ${i}`, String((i + 1) * 10)])];
    const series = buildChartSeries(many, 1, { limit: 5 })!;
    expect(series.points.slice(0, 5).map((p) => p.value)).toEqual([200, 190, 180, 170, 160]);
    expect(series.otherCount).toBe(15);
    expect(series.points.at(-1)).toEqual({ label: 'Other (15)', value: 1200 });
  });

  it('has nothing to draw when the report is all words, or all zeros', () => {
    expect(buildChartSeries([['Name', 'Note'], ['Rent', 'monthly']], 1)).toBeNull();
    expect(buildChartSeries([['Account', 'Amount'], ['Rent', '0.00']], 1)).toBeNull();
    expect(buildChartSeries([['Account', 'Amount']], 1)).toBeNull();
  });
});
