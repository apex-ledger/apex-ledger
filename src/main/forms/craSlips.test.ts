import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { CompanyInfo } from '@shared/domain/types';
import { generateT4Pdf } from './generateT4Pdf';
import { generateT4APdf } from './generateT4APdf';
import { generateT5Pdf } from './generateT5Pdf';
import { generateT5018Pdf } from './generateT5018Pdf';

const company = {
  legalName: 'Northwind Bookkeeping Test Co.',
  displayName: null,
  fiscalYearEndMonth: 12,
  fiscalYearEndDay: 31,
  baseCurrency: 'CAD',
  businessNumber: '123456789',
  businessType: 'bookkeeping_accounting',
  hstQuickMethodEnabled: false,
  hstQuickMethodRate: null,
  hstNumber: '123456789RT0001',
  payrollNumber: '123456789RP0001',
  numberOfEmployees: 2,
  businessAddressLine1: '200 Test Avenue',
  businessAddressLine2: null,
  businessCity: 'Toronto',
  businessProvince: 'ON',
  businessPostalCode: 'M5V 1J2',
  mailingSameAsBusinessAddress: true,
} as unknown as CompanyInfo;

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

describe('CRA-style slips', () => {
  it('prints a T4 as two copies per employee plus the summary', async () => {
    const bytes = await generateT4Pdf(
      company,
      [
        { employeeId: 1, employeeName: 'Sam Patel', addressLines: ['12 Elm St', 'Toronto ON  M4C 1A1'], sin: '046454286', province: 'ON', employmentIncomeCents: 5460000, cpp1Cents: 300000, cpp2Cents: 18800, eiPremiumsCents: 89000, incomeTaxDeductedCents: 900000, eiInsurableEarningsCents: 5460000, cppPensionableEarningsCents: 5460000, otherTaxableBenefitsCents: 120000, rppContributionsCents: 0, unionDuesCents: 0, charitableDonationsCents: 0 },
        { employeeId: 2, employeeName: 'Kim Nguyen', addressLines: [], sin: null, province: 'ON', employmentIncomeCents: 6000000, cpp1Cents: 0, cpp2Cents: 0, eiPremiumsCents: 0, incomeTaxDeductedCents: 0, eiInsurableEarningsCents: 0, cppPensionableEarningsCents: 0, otherTaxableBenefitsCents: 0, rppContributionsCents: 0, unionDuesCents: 0, charitableDonationsCents: 0 },
      ],
      { taxYear: 2026, employeeCount: 2, employmentIncomeCents: 11460000, cpp1Cents: 300000, cpp2Cents: 18800, cppEmployerCents: 318800, eiPremiumsCents: 89000, eiEmployerCents: 124600, incomeTaxDeductedCents: 900000 },
      2026,
    );
    expect(await pageCount(bytes)).toBe(3);
  });

  it('prints T4A, T5 and T5018 slips two to a page, and a notice page when there are none', async () => {
    expect(await pageCount(await generateT4APdf(company, [{ vendorId: 1, vendorName: 'Fixit Contracting', sin: null, businessNumber: '987654321RT0001', feesForServicesCents: 250000 }], 2026))).toBe(1);
    expect(await pageCount(await generateT5Pdf(company, [{ shareholderId: 1, shareholderName: 'Patel, Sam', sin: '046454286', businessNumber: null, nonEligibleDividendsCents: 1000000, nonEligibleTaxableCents: 1150000, nonEligibleDtcCents: 103850, interestCents: 0, eligibleDividendsCents: 0, eligibleTaxableCents: 0, eligibleDtcCents: 0 }], 2026))).toBe(1);
    expect(await pageCount(await generateT5018Pdf(company, [{ vendorId: 1, vendorName: 'Grizzley Custom Fabrication', sin: null, businessNumber: '555555555RT0001', totalPaymentsCents: 1234500 }], 2026))).toBe(1);
    expect(await pageCount(await generateT5018Pdf(company, [], 2026))).toBe(1);
  });
});
