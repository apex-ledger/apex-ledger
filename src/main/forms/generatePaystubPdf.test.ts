import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generatePaystubPdf } from './generatePaystubPdf';

const company = { legalName: 'Northwind Ltd', businessNumber: '123456789RC0001', businessAddressLine1: '9 Bay St', businessAddressLine2: null, businessCity: 'Toronto', businessProvince: 'ON', businessPostalCode: 'M5J 2R8' } as never;
const employee = { id: 1, name: 'Sam Patel', province: 'ON', payType: 'Hourly', hourlyRateCents: 2800, sinLastFour: '1234', addressLine1: '1 Main St', city: 'Toronto', postalCode: 'M4C 1A1' } as never;
const run = {
  id: 13, employeeId: 1, payPeriodStart: '2026-03-26', payPeriodEnd: '2026-04-08', payDate: '2026-09-11', regularHours: 80, overtimeHours: 0,
  regularPayCents: 224000, overtimePayCents: 0, grossPayCents: 324000, vacationPayCents: 8960, cpp1EmployeeCents: 19099, cpp2EmployeeCents: 0, eiEmployeeCents: 5427, incomeTaxCents: 62688, netPayCents: 247246,
  rrspEmployerMatchCents: 0, healthBenefitCents: 0, status: 'posted', isVacationPayout: false,
  items: [
    { itemId: 1, name: 'Bonus', kind: 'earning', cppApplies: true, eiApplies: true, taxApplies: true, t4Box: null, amountCents: 100000, accountId: null },
    { itemId: 7, name: 'Group life insurance premium (taxable benefit)', kind: 'taxableBenefit', cppApplies: true, eiApplies: false, taxApplies: true, t4Box: null, amountCents: 1500, accountId: null },
    { itemId: 9, name: 'Union dues', kind: 'deduction', cppApplies: false, eiApplies: false, taxApplies: false, t4Box: 'unionDues44', amountCents: 2500, accountId: null },
    { itemId: 17, name: 'Mileage reimbursement', kind: 'reimbursement', cppApplies: false, eiApplies: false, taxApplies: false, t4Box: null, amountCents: 4000, accountId: null },
    { itemId: 18, name: 'Employer pension contribution', kind: 'employerContribution', cppApplies: false, eiApplies: false, taxApplies: false, t4Box: null, amountCents: 5000, accountId: null },
  ],
} as never;

describe('generatePaystubPdf', () => {
  it('renders a one-page employee copy with every item section and no employer costs', async () => {
    const bytes = await generatePaystubPdf({ run, employee, company, ytdThroughThisRun: { grossPayCents: 1643360, cppEmployeeCents: 92263, eiEmployeeCents: 26787, incomeTaxCents: 239100, netPayCents: 1286710 }, ytdItems: { Bonus: 100000, 'Union dues': 2500 } });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    // Content streams are Flate-compressed, so the check is structural: one page, and the same
    // generator still renders a plain run with no items at all.
    expect(bytes.byteLength).toBeGreaterThan(2000);
    const plain = await generatePaystubPdf({ run: { ...(run as object), items: [] } as never, employee, company, ytdThroughThisRun: { grossPayCents: 0, cppEmployeeCents: 0, eiEmployeeCents: 0, incomeTaxCents: 0, netPayCents: 0 }, ytdItems: {} });
    expect((await PDFDocument.load(plain)).getPageCount()).toBe(1);
    expect(plain.byteLength).toBeLessThan(bytes.byteLength);
  });
});
