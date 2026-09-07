import { describe, expect, it } from 'vitest';
import { quickReportPeriod } from './ReportPeriodControls';

describe('report period quick fill', () => {
  const anchor = new Date('2026-08-31T12:00:00');
  it('fills month, quarter and year boundaries exactly', () => {
    expect(quickReportPeriod('thisMonth', anchor)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(quickReportPeriod('lastMonth', anchor)).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    expect(quickReportPeriod('thisQuarter', anchor)).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(quickReportPeriod('thisYear', anchor)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
});
