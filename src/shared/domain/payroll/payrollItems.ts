/**
 * Payroll items — everything on a pay stub beyond regular pay, overtime and vacation.
 *
 * Five kinds, because they behave differently in the books and on the T4:
 *   - earning: cash paid this period (bonus, commission, stat holiday pay, sick pay, retro pay,
 *     taxable allowance). Added to gross; CPP/EI/tax apply per the item's flags.
 *   - taxableBenefit: value the employee receives but not as cash (group life premium, company
 *     car). Added to the tax base (and CPP by default), never to net pay. T4 box 40 and box 14.
 *   - deduction: taken off after source deductions (union dues, garnishment, employee RRSP or
 *     pension contribution, health premium share, charity, advance repayment). Reduces net pay;
 *     union dues, RPP contributions and donations have their own T4 boxes.
 *   - reimbursement: money the company owes back (mileage, phone, expenses). Added to net pay,
 *     no tax, not earnings.
 *   - employerContribution: the company's own cost (pension match, extended health). Expense and
 *     liability only; no effect on the employee's cheque.
 */
export type PayrollItemKind = 'earning' | 'taxableBenefit' | 'deduction' | 'reimbursement' | 'employerContribution';

export const PAYROLL_ITEM_KIND_LABELS: Record<PayrollItemKind, string> = {
  earning: 'Earning (cash)',
  taxableBenefit: 'Taxable benefit (non-cash)',
  deduction: 'Deduction (after tax)',
  reimbursement: 'Reimbursement (non-taxable)',
  employerContribution: 'Employer contribution',
};

/** Where a deduction lands on the T4, when it has a box. */
export type T4DeductionBox = 'rpp20' | 'unionDues44' | 'charity46' | null;

export interface PayrollItemDefinition {
  id?: number;
  name: string;
  kind: PayrollItemKind;
  /** Earnings and benefits: does CPP apply, does EI apply, is it income-taxed. Ignored for other kinds. */
  cppApplies: boolean;
  eiApplies: boolean;
  taxApplies: boolean;
  /** Deductions: which T4 box, if any. */
  t4Box: T4DeductionBox;
  /** Default amount offered on each run; the run can change it. */
  defaultAmountCents: number;
  /** GL account this item posts to; null uses the payroll defaults (wages expense / a payable). */
  accountId: number | null;
  isActive: boolean;
}

/** The catalogue a new company starts with — the items a Canadian small-business payroll meets. */
export const DEFAULT_PAYROLL_ITEMS: Omit<PayrollItemDefinition, 'id'>[] = [
  { name: 'Bonus', kind: 'earning', cppApplies: true, eiApplies: true, taxApplies: true, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Commission', kind: 'earning', cppApplies: true, eiApplies: true, taxApplies: true, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Statutory holiday pay', kind: 'earning', cppApplies: true, eiApplies: true, taxApplies: true, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Sick pay', kind: 'earning', cppApplies: true, eiApplies: true, taxApplies: true, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Retroactive pay', kind: 'earning', cppApplies: true, eiApplies: true, taxApplies: true, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Car allowance (taxable)', kind: 'earning', cppApplies: true, eiApplies: true, taxApplies: true, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Group life insurance premium (taxable benefit)', kind: 'taxableBenefit', cppApplies: true, eiApplies: false, taxApplies: true, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Company vehicle (taxable benefit)', kind: 'taxableBenefit', cppApplies: true, eiApplies: false, taxApplies: true, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Union dues', kind: 'deduction', cppApplies: false, eiApplies: false, taxApplies: false, t4Box: 'unionDues44', defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Garnishment', kind: 'deduction', cppApplies: false, eiApplies: false, taxApplies: false, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Employee RRSP contribution', kind: 'deduction', cppApplies: false, eiApplies: false, taxApplies: false, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Employee pension (RPP) contribution', kind: 'deduction', cppApplies: false, eiApplies: false, taxApplies: false, t4Box: 'rpp20', defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Health premium (employee share)', kind: 'deduction', cppApplies: false, eiApplies: false, taxApplies: false, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Charitable donation', kind: 'deduction', cppApplies: false, eiApplies: false, taxApplies: false, t4Box: 'charity46', defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Advance repayment', kind: 'deduction', cppApplies: false, eiApplies: false, taxApplies: false, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Expense reimbursement', kind: 'reimbursement', cppApplies: false, eiApplies: false, taxApplies: false, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Mileage reimbursement', kind: 'reimbursement', cppApplies: false, eiApplies: false, taxApplies: false, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Employer pension contribution', kind: 'employerContribution', cppApplies: false, eiApplies: false, taxApplies: false, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
  { name: 'Extended health (employer)', kind: 'employerContribution', cppApplies: false, eiApplies: false, taxApplies: false, t4Box: null, defaultAmountCents: 0, accountId: null, isActive: true },
];

/** One item on one pay run, with the treatment snapshotted so a later catalogue edit cannot
 * change history. */
export interface PayRunItem {
  itemId: number | null;
  name: string;
  kind: PayrollItemKind;
  cppApplies: boolean;
  eiApplies: boolean;
  taxApplies: boolean;
  t4Box: T4DeductionBox;
  amountCents: number;
  accountId: number | null;
}

export interface PayRunItemsSummary {
  /** Cash earnings added to gross pay. */
  earningsCents: number;
  /** Earnings that are CPP-pensionable / EI-insurable / income-taxable. */
  pensionableEarningsCents: number;
  insurableEarningsCents: number;
  taxableEarningsCents: number;
  /** Non-cash benefits: in the tax base (and pensionable per flags), never in net pay. */
  benefitsCents: number;
  pensionableBenefitsCents: number;
  insurableBenefitsCents: number;
  taxableBenefitsCents: number;
  deductionsCents: number;
  reimbursementsCents: number;
  employerContributionsCents: number;
  /** T4 box amounts from deductions. */
  rppContributionsCents: number;
  unionDuesCents: number;
  charitableDonationsCents: number;
}

export function summarizePayRunItems(items: PayRunItem[]): PayRunItemsSummary {
  const s: PayRunItemsSummary = { earningsCents: 0, pensionableEarningsCents: 0, insurableEarningsCents: 0, taxableEarningsCents: 0, benefitsCents: 0, pensionableBenefitsCents: 0, insurableBenefitsCents: 0, taxableBenefitsCents: 0, deductionsCents: 0, reimbursementsCents: 0, employerContributionsCents: 0, rppContributionsCents: 0, unionDuesCents: 0, charitableDonationsCents: 0 };
  for (const item of items) {
    const a = Math.max(0, Math.round(item.amountCents));
    if (a === 0) continue;
    switch (item.kind) {
      case 'earning':
        s.earningsCents += a;
        if (item.cppApplies) s.pensionableEarningsCents += a;
        if (item.eiApplies) s.insurableEarningsCents += a;
        if (item.taxApplies) s.taxableEarningsCents += a;
        break;
      case 'taxableBenefit':
        s.benefitsCents += a;
        if (item.cppApplies) s.pensionableBenefitsCents += a;
        if (item.eiApplies) s.insurableBenefitsCents += a;
        if (item.taxApplies) s.taxableBenefitsCents += a;
        break;
      case 'deduction':
        s.deductionsCents += a;
        if (item.t4Box === 'rpp20') s.rppContributionsCents += a;
        if (item.t4Box === 'unionDues44') s.unionDuesCents += a;
        if (item.t4Box === 'charity46') s.charitableDonationsCents += a;
        break;
      case 'reimbursement':
        s.reimbursementsCents += a;
        break;
      case 'employerContribution':
        s.employerContributionsCents += a;
        break;
    }
  }
  return s;
}
