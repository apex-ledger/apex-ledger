import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { computeRoe, type RoeInput } from '@shared/domain/payroll/recordOfEmployment';
import { generateRoePdf } from './generateRoePdf';

describe('generateRoePdf', () => {
  it('renders the worksheet with the block 15 period table and warnings', async () => {
    const runs = Array.from({ length: 30 }, (_, i) => {
      const end = new Date(Date.UTC(2026, 7, 28) - i * 14 * 86400000);
      const start = new Date(end.getTime() - 13 * 86400000);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      return { payPeriodStart: iso(start), payPeriodEnd: iso(end), payDate: iso(end), regularHours: 80, overtimeHours: 0, grossPayCents: 200000, vacationPayCents: 8000, isVacationPayout: false };
    });
    const input: RoeInput = {
      employee: { name: 'Priya Shah', sin: null, payPeriodsPerYear: 26, payType: 'Hourly', addressLines: ['1 Main St', 'Toronto ON'] },
      employer: { legalName: 'Northwind Ltd', payrollNumber: '123456789RP0001', addressLines: ['9 Bay St'], contactName: 'Nisha', contactPhone: '416-555-0100' },
      runs, reasonCode: 'A', lastDayPaid: '2026-08-28', expectedRecall: 'unknown', comments: 'Seasonal',
    };
    const roe = computeRoe(input);
    expect(roe.periods).toHaveLength(27);
    const bytes = await generateRoePdf(input, roe, '2026-09-04');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
    expect(bytes.byteLength).toBeGreaterThan(3000);
  });
});
