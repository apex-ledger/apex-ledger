import type { PayCalculationResult } from './calculatePay';

export interface PayrollJournalAccountIds {
  wagesExpenseAccountId: number;
  remittancesPayableAccountId: number;
  bankAccountId: number;
  /** Only needed when pay.wsibEmployerCents > 0 — WSIB is remitted separately from CRA's PD7A, so
   * it gets its own liability account rather than folding into remittancesPayableAccountId. */
  wsibPayableAccountId?: number | null;
  /** Only needed when pay.rrspEmployerMatchCents > 0 — owed to the RRSP provider, not CRA. */
  rrspPayableAccountId?: number | null;
  /** Only needed when pay.healthBenefitCents > 0 — owed to the benefits provider, not CRA. */
  benefitsPayableAccountId?: number | null;
  /** Needed when the employee accrues vacation (pay.vacationAccruedCents > 0), and again on the
   * payout run that releases it. */
  vacationPayableAccountId?: number | null;
  /** Where payroll items post when the item names no account of its own. */
  deductionsPayableAccountId?: number | null;
  reimbursementsExpenseAccountId?: number | null;
}

export interface PayrollJournalLine {
  accountId: number;
  debitCents: number;
  creditCents: number;
  description: string;
}

export interface PayrollPostingAmounts {
  grossPayCents: number;
  vacationPayCents: number;
  cpp1EmployerCents: number;
  cpp2EmployerCents: number;
  eiEmployerCents: number;
  wsibEmployerCents: number;
  rrspEmployerMatchCents: number;
  healthBenefitCents: number;
}

/** Returns the real employer cost that can produce payroll journal lines. This catches an empty
 * zero-hour draft before it reaches the journal validator, while still allowing benefit-only runs. */
export function payrollPostingTotalCents(pay: PayrollPostingAmounts): number {
  return (
    pay.grossPayCents +
    pay.vacationPayCents +
    pay.cpp1EmployerCents +
    pay.cpp2EmployerCents +
    pay.eiEmployerCents +
    pay.wsibEmployerCents +
    pay.rrspEmployerMatchCents +
    pay.healthBenefitCents
  );
}

export function hasPostablePayrollAmount(pay: PayrollPostingAmounts): boolean {
  return payrollPostingTotalCents(pay) > 0;
}

/**
 * Builds the GL lines for one posted pay run. Uses a single combined "Payroll Remittances
 * Payable" liability (matching how CRA actually collects it — CPP + EI + income tax, employee
 * and employer portions together, in one PD7A remittance) rather than separate CPP/EI/tax
 * payable accounts, and a single "Salaries, Wages & Benefits" expense covering gross + vacation
 * pay + the employer's own CPP/EI share. Balances by construction: see calculatePay.test.ts /
 * this file's own tests for the identity that makes debits always equal credits.
 */
export function buildPayrollJournalLines(
  pay: PayCalculationResult,
  accounts: PayrollJournalAccountIds,
  employeeName: string,
  options: {
    /**
     * True when this run pays out previously accrued vacation. The wage expense was already
     * recognized in the periods it accrued, so the debit clears Vacation Pay Payable instead of
     * hitting the expense account twice — the whole point of accruing in the first place. Source
     * deductions still come off normally, because the money is being paid now.
     */
    isVacationPayout?: boolean;
  } = {},
): PayrollJournalLine[] {
  const remittancesCents =
    pay.cpp1EmployeeCents +
    pay.cpp2EmployeeCents +
    pay.eiEmployeeCents +
    pay.incomeTaxCents +
    pay.cpp1EmployerCents +
    pay.cpp2EmployerCents +
    pay.eiEmployerCents;

  const isVacationPayout = options.isVacationPayout ?? false;
  // On a payout, only the gross being released was accrued — the employer's CPP/EI/WSIB share on
  // that payment is incurred now, so it's a fresh expense rather than a draw against the liability.
  const liabilityDrawCents = isVacationPayout ? pay.grossPayCents : 0;
  const wageExpenseCents = pay.totalEmployerCostCents - liabilityDrawCents;

  const lines: PayrollJournalLine[] = [
    {
      accountId: accounts.vacationPayableAccountId ?? 0,
      debitCents: liabilityDrawCents,
      creditCents: 0,
      description: `Vacation pay out — ${employeeName} (releasing accrued vacation)`,
    },
    {
      accountId: accounts.wagesExpenseAccountId,
      debitCents: wageExpenseCents,
      creditCents: 0,
      description: isVacationPayout
        ? `Employer contributions on vacation payout — ${employeeName}`
        : `Payroll — ${employeeName} (gross, vacation pay, employer CPP/EI/WSIB/benefits)`,
    },
    {
      // Vacation earned but held back this period — an amount owed to the employee, not yet paid,
      // so it sits as a liability until a payout run releases it.
      accountId: accounts.vacationPayableAccountId ?? 0,
      debitCents: 0,
      creditCents: pay.vacationAccruedCents,
      description: `Vacation pay accrued — ${employeeName}`,
    },
    {
      accountId: accounts.remittancesPayableAccountId,
      debitCents: 0,
      creditCents: remittancesCents,
      description: `Payroll remittances — ${employeeName} (CPP, EI, income tax)`,
    },
    {
      accountId: accounts.wsibPayableAccountId ?? 0,
      debitCents: 0,
      creditCents: pay.wsibEmployerCents,
      description: `WSIB premium — ${employeeName}`,
    },
    {
      accountId: accounts.rrspPayableAccountId ?? 0,
      debitCents: 0,
      creditCents: pay.rrspEmployerMatchCents,
      description: `RRSP employer match — ${employeeName}`,
    },
    {
      accountId: accounts.benefitsPayableAccountId ?? 0,
      debitCents: 0,
      creditCents: pay.healthBenefitCents,
      description: `Health/dental benefit — ${employeeName}`,
    },
    // Payroll items. The wages debit above is the total employer cost, which already includes cash
    // earnings, non-cash benefits, reimbursements and employer contributions — so these lines only
    // add the matching credits (a payable per item) or move an amount to the item's own account.
    ...pay.items.flatMap((item) => {
      const a = Math.round(item.amountCents);
      if (a <= 0) return [];
      const label = `${item.name} — ${employeeName}`;
      const reclass = (toAccountId: number) => [
        { accountId: toAccountId, debitCents: a, creditCents: 0, description: label },
        { accountId: accounts.wagesExpenseAccountId, debitCents: 0, creditCents: a, description: `${label} (moved from wages expense)` },
      ];
      if (item.kind === 'earning') return item.accountId ? reclass(item.accountId) : [];
      if (item.kind === 'reimbursement') {
        const to = item.accountId ?? accounts.reimbursementsExpenseAccountId;
        return to ? reclass(to) : [];
      }
      if (item.kind === 'employerContribution' || item.kind === 'taxableBenefit') {
        return [{ accountId: item.accountId ?? accounts.benefitsPayableAccountId ?? accounts.remittancesPayableAccountId, debitCents: 0, creditCents: a, description: label }];
      }
      // Deduction: came off the cheque, owed to the union / court / plan / charity.
      return [{ accountId: item.accountId ?? accounts.deductionsPayableAccountId ?? accounts.remittancesPayableAccountId, debitCents: 0, creditCents: a, description: label }];
    }),
    {
      accountId: accounts.bankAccountId,
      debitCents: 0,
      creditCents: pay.netPayCents,
      description: `Net pay — ${employeeName}`,
    },
  ];

  return lines.filter((line) => line.debitCents > 0 || line.creditCents > 0);
}
