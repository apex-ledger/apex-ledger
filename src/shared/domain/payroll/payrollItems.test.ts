import { describe, expect, it } from 'vitest';
import { DEFAULT_PAYROLL_ITEMS, summarizePayRunItems, type PayRunItem } from './payrollItems';

const item = (partial: Partial<PayRunItem> & Pick<PayRunItem, 'name' | 'kind' | 'amountCents'>): PayRunItem => ({ itemId: null, cppApplies: false, eiApplies: false, taxApplies: false, t4Box: null, accountId: null, ...partial });

describe('payroll items', () => {
  it('ships a catalogue covering every kind', () => {
    const kinds = new Set(DEFAULT_PAYROLL_ITEMS.map((i) => i.kind));
    expect([...kinds].sort()).toEqual(['deduction', 'earning', 'employerContribution', 'reimbursement', 'taxableBenefit']);
    expect(DEFAULT_PAYROLL_ITEMS.find((i) => i.name === 'Union dues')?.t4Box).toBe('unionDues44');
  });

  it('summarises a run: earnings by tax flag, benefits, deductions with T4 boxes, reimbursements, employer cost', () => {
    const s = summarizePayRunItems([
      item({ name: 'Bonus', kind: 'earning', amountCents: 50_000, cppApplies: true, eiApplies: true, taxApplies: true }),
      item({ name: 'Car allowance', kind: 'earning', amountCents: 30_000, cppApplies: true, eiApplies: false, taxApplies: true }),
      item({ name: 'Group life', kind: 'taxableBenefit', amountCents: 2_500, cppApplies: true, taxApplies: true }),
      item({ name: 'Union dues', kind: 'deduction', amountCents: 4_000, t4Box: 'unionDues44' }),
      item({ name: 'RPP', kind: 'deduction', amountCents: 10_000, t4Box: 'rpp20' }),
      item({ name: 'Garnishment', kind: 'deduction', amountCents: 15_000 }),
      item({ name: 'Mileage', kind: 'reimbursement', amountCents: 6_250 }),
      item({ name: 'Employer pension', kind: 'employerContribution', amountCents: 10_000 }),
      item({ name: 'Zero', kind: 'earning', amountCents: 0, cppApplies: true, eiApplies: true, taxApplies: true }),
    ]);
    expect(s).toMatchObject({
      earningsCents: 80_000, pensionableEarningsCents: 80_000, insurableEarningsCents: 50_000, taxableEarningsCents: 80_000,
      benefitsCents: 2_500, pensionableBenefitsCents: 2_500, insurableBenefitsCents: 0, taxableBenefitsCents: 2_500,
      deductionsCents: 29_000, rppContributionsCents: 10_000, unionDuesCents: 4_000, charitableDonationsCents: 0,
      reimbursementsCents: 6_250, employerContributionsCents: 10_000,
    });
  });
});
