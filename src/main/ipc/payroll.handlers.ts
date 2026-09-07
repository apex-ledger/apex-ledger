import type { BrowserWindow } from 'electron';
import { calculatePayrollRunSchema, newEmployeeSchema, postPayrollRunSchema, savePayrollRunSchema, updateEmployeeSchema } from '@shared/validation/schemas';
import { calculatePay, type PayCalculationResult } from '@shared/domain/payroll/calculatePay';
import { buildPayrollJournalLines, hasPostablePayrollAmount } from '@shared/domain/payroll/buildPayrollJournalLines';
import { computePd7aMonthlyBreakdown, computePd7aSummary } from '@shared/domain/payroll/computePd7aSummary';
import { duplicatePayrollPeriodRefusalReason, payrollDatesRefusalReason } from '@shared/domain/payroll/payrollRunRules';
import { moneyAccountRefusalReason } from '@shared/domain/banking/bankAccountRules';
import { computeT4SlipsForYear, computeT4SummaryForYear } from '@shared/domain/payroll/computeT4Slip';
import { computeT4ASlipsForYear } from '@shared/domain/payroll/computeT4ASlip';
import { computeT5018SlipsForYear } from '@shared/domain/payroll/computeT5018Slip';
import { getCurrentDb } from '../companyFile';
import { getAllBills, getAllEmployees, getAllPayrollRuns, getAllVendors, getEmployeeById, getPayrollRunById, getYtdPayrollTotals, getYtdPaystubTotals, type YtdPaystubTotals } from '../db/queries';
import { mapEmployeeRow, mapPayrollRunRow } from '../db/mappers';
import { ensureAccountByName } from '../db/ensureAccount';
import { computeEht, EHT_DEFAULT_EXEMPTION_CENTS, ontarioRemunerationCents } from '@shared/domain/payroll/employerHealthTax';
import { journalCreate, journalPost, journalVoid } from './journal.handlers';
import { companyGet } from './company.handlers';
import { generatePd7aPdf } from '../forms/generatePd7aPdf';
import { generatePaystubPdf } from '../forms/generatePaystubPdf';
import { generateT4Pdf } from '../forms/generateT4Pdf';
import { generateT4APdf } from '../forms/generateT4APdf';
import { generateT5018Pdf } from '../forms/generateT5018Pdf';
import { safeFileNamePart, savePdfAndOpen } from '../forms/savePdfAndOpen';
import type { AppDb } from '../db/schema';
import type { CompanyInfo, Employee, PayrollRun } from '@shared/domain/types';
import { DEFAULT_PAYROLL_ITEMS, type PayRunItem, type PayrollItemDefinition } from '@shared/domain/payroll/payrollItems';
import { payrollItemDefinitionSchema } from '@shared/validation/schemas';
import { summarizePayRunItems } from '@shared/domain/payroll/payrollItems';

export async function employeesList() {
  const db = getCurrentDb();
  return getAllEmployees(db);
}

export async function employeesGet(id: number) {
  const db = getCurrentDb();
  const employee = await getEmployeeById(db, id);
  if (!employee) throw new Error(`Employee ${id} not found.`);
  return employee;
}

export async function employeesCreate(input: unknown) {
  const payload = newEmployeeSchema.parse(input);
  const db = getCurrentDb();
  const inserted = await db
    .insertInto('employees')
    .values({
      name: payload.name,
      province: payload.province,
      payType: payload.payType,
      hourlyRateCents: payload.hourlyRateCents,
      annualSalaryCents: payload.annualSalaryCents,
      payPeriodsPerYear: payload.payPeriodsPerYear,
      vacationPayRate: payload.vacationPayRate,
      sinLastFour: payload.sinLastFour,
      sin: payload.sin,
      isActive: 1,
      federalTotalClaimCents: payload.federalTotalClaimCents,
      provincialTotalClaimCents: payload.provincialTotalClaimCents,
      additionalTaxCents: payload.additionalTaxCents,
      rrspEmployerMatchCents: payload.rrspEmployerMatchCents,
      healthBenefitCents: payload.healthBenefitCents,
      addressLine1: payload.addressLine1,
      addressLine2: payload.addressLine2,
      addressCity: payload.addressCity,
      addressProvince: payload.addressProvince,
      addressPostalCode: payload.addressPostalCode,
      bankInstitution: payload.bankInstitution ?? null,
      bankTransit: payload.bankTransit ?? null,
      bankAccount: payload.bankAccount ?? null,
      vacationPayAccrued: payload.vacationPayAccrued ? 1 : 0,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return mapEmployeeRow(inserted);
}

export async function employeesUpdate(input: unknown) {
  const { id, patch } = updateEmployeeSchema.parse(input);
  const db = getCurrentDb();
  const updateValues: Record<string, unknown> = {};
  if (patch.name !== undefined) updateValues.name = patch.name;
  if (patch.province !== undefined) updateValues.province = patch.province;
  if (patch.payType !== undefined) updateValues.payType = patch.payType;
  if (patch.hourlyRateCents !== undefined) updateValues.hourlyRateCents = patch.hourlyRateCents;
  if (patch.annualSalaryCents !== undefined) updateValues.annualSalaryCents = patch.annualSalaryCents;
  if (patch.payPeriodsPerYear !== undefined) updateValues.payPeriodsPerYear = patch.payPeriodsPerYear;
  if (patch.vacationPayRate !== undefined) updateValues.vacationPayRate = patch.vacationPayRate;
  if (patch.sinLastFour !== undefined) updateValues.sinLastFour = patch.sinLastFour;
  if (patch.sin !== undefined) updateValues.sin = patch.sin;
  if (patch.isActive !== undefined) updateValues.isActive = patch.isActive ? 1 : 0;
  if (patch.federalTotalClaimCents !== undefined) updateValues.federalTotalClaimCents = patch.federalTotalClaimCents;
  if (patch.provincialTotalClaimCents !== undefined) updateValues.provincialTotalClaimCents = patch.provincialTotalClaimCents;
  if (patch.additionalTaxCents !== undefined) updateValues.additionalTaxCents = patch.additionalTaxCents;
  if (patch.rrspEmployerMatchCents !== undefined) updateValues.rrspEmployerMatchCents = patch.rrspEmployerMatchCents;
  if (patch.healthBenefitCents !== undefined) updateValues.healthBenefitCents = patch.healthBenefitCents;
  if (patch.addressLine1 !== undefined) updateValues.addressLine1 = patch.addressLine1;
  if (patch.addressLine2 !== undefined) updateValues.addressLine2 = patch.addressLine2;
  if (patch.addressCity !== undefined) updateValues.addressCity = patch.addressCity;
  if (patch.addressProvince !== undefined) updateValues.addressProvince = patch.addressProvince;
  if (patch.addressPostalCode !== undefined) updateValues.addressPostalCode = patch.addressPostalCode;
  if (patch.bankInstitution !== undefined) updateValues.bankInstitution = patch.bankInstitution;
  if (patch.bankTransit !== undefined) updateValues.bankTransit = patch.bankTransit;
  if (patch.bankAccount !== undefined) updateValues.bankAccount = patch.bankAccount;
  if (patch.vacationPayAccrued !== undefined) updateValues.vacationPayAccrued = patch.vacationPayAccrued ? 1 : 0;
  if (Object.keys(updateValues).length > 0) {
    await db.updateTable('employees').set(updateValues).where('id', '=', id).execute();
  }
  return employeesGet(id);
}

export async function employeesDeactivate(id: number) {
  const db = getCurrentDb();
  await db.updateTable('employees').set({ isActive: 0 }).where('id', '=', id).execute();
  return employeesGet(id);
}

export async function payrollRunsList(employeeId?: number) {
  const db = getCurrentDb();
  return getAllPayrollRuns(db, employeeId);
}

export async function payrollRunsGet(id: number) {
  const db = getCurrentDb();
  const run = await getPayrollRunById(db, id);
  if (!run) throw new Error(`Payroll run ${id} not found.`);
  return run;
}

async function computePayForInput(
  db: AppDb,
  input: ReturnType<typeof calculatePayrollRunSchema.parse>,
): Promise<{ employee: Awaited<ReturnType<typeof getEmployeeById>>; pay: PayCalculationResult }> {
  const employee = await getEmployeeById(db, input.employeeId);
  if (!employee) throw new Error(`Employee ${input.employeeId} not found.`);

  const [ytd, company] = await Promise.all([getYtdPayrollTotals(db, input.employeeId, input.payPeriodStart), companyGet()]);
  const pay = calculatePay({
    profile: {
      payType: employee.payType,
      hourlyRateCents: employee.hourlyRateCents,
      annualSalaryCents: employee.annualSalaryCents,
      payPeriodsPerYear: employee.payPeriodsPerYear,
      vacationPayRate: employee.vacationPayRate,
      province: employee.province,
      federalTotalClaimCents: employee.federalTotalClaimCents,
      provincialTotalClaimCents: employee.provincialTotalClaimCents,
      additionalTaxCents: employee.additionalTaxCents,
      rrspEmployerMatchCents: input.rrspEmployerMatchCents ?? employee.rrspEmployerMatchCents,
      healthBenefitCents: employee.healthBenefitCents,
      vacationPayAccrued: employee.vacationPayAccrued,
    },
    regularHours: input.regularHours ?? undefined,
    overtimeHours: input.overtimeHours ?? undefined,
    overtimeMultiplier: input.overtimeMultiplier,
    incomeTaxCents: input.incomeTaxCents,
    wsibRate: company.wsibRate,
    ytdBeforeThisPeriod: ytd,
    items: (input.items ?? []) as PayRunItem[],
  });
  return { employee, pay };
}

/** Preview-only: computes what a pay run WOULD look like without saving anything, so the UI can
 * show live CPP/EI/net-pay figures as the accountant edits hours or the manual income tax box. */
export async function payrollRunsCalculate(input: unknown) {
  const payload = calculatePayrollRunSchema.parse(input);
  const db = getCurrentDb();
  const { pay } = await computePayForInput(db, payload);
  return pay;
}

/** The checks that make a run impossible regardless of the figures: the employee has left, the
 * dates run backwards, or the period is already on the books. Run at both create and post, so a
 * draft made before the rule existed still cannot be posted twice. */
async function assertRunAllowed(db: AppDb, period: { employeeId: number; payPeriodStart: string; payPeriodEnd: string; payDate: string }, excludeRunId: number | null): Promise<void> {
  const employee = await getEmployeeById(db, period.employeeId);
  if (!employee) throw new Error(`Employee ${period.employeeId} not found.`);
  if (!employee.isActive) throw new Error(`${employee.name} is no longer active. Reactivate the employee before running payroll for them.`);
  const dateRefusal = payrollDatesRefusalReason(period);
  if (dateRefusal) throw new Error(dateRefusal);
  const existing = await getAllPayrollRuns(db, period.employeeId);
  const duplicate = duplicatePayrollPeriodRefusalReason(period, existing, employee.name, excludeRunId);
  if (duplicate) throw new Error(duplicate);
}

export async function payrollRunsCreate(input: unknown) {
  const payload = savePayrollRunSchema.parse(input);
  const db = getCurrentDb();
  await assertRunAllowed(db, payload, null);
  const { pay } = await computePayForInput(db, payload);

  if (pay.netPayCents < 0) {
    throw new Error('Net pay is negative — review the income tax amount and payroll deductions.');
  }
  if (!hasPostablePayrollAmount(pay)) {
    throw new Error('This pay run has no payroll amount. Enter regular hours, overtime, salary, or an employer benefit before saving.');
  }

  const inserted = await db
    .insertInto('payrollRuns')
    .values({
      employeeId: payload.employeeId,
      payPeriodStart: payload.payPeriodStart,
      payPeriodEnd: payload.payPeriodEnd,
      payDate: payload.payDate,
      regularHours: payload.regularHours,
      overtimeHours: payload.overtimeHours,
      regularPayCents: pay.regularPayCents,
      overtimePayCents: pay.overtimePayCents,
      grossPayCents: pay.grossPayCents,
      vacationPayCents: pay.vacationPayCents,
      cpp1EmployeeCents: pay.cpp1EmployeeCents,
      cpp1EmployerCents: pay.cpp1EmployerCents,
      cpp2EmployeeCents: pay.cpp2EmployeeCents,
      cpp2EmployerCents: pay.cpp2EmployerCents,
      eiEmployeeCents: pay.eiEmployeeCents,
      eiEmployerCents: pay.eiEmployerCents,
      wsibEmployerCents: pay.wsibEmployerCents,
      rrspEmployerMatchCents: pay.rrspEmployerMatchCents,
      healthBenefitCents: pay.healthBenefitCents,
      incomeTaxCents: pay.incomeTaxCents,
      netPayCents: pay.netPayCents,
      status: 'draft',
      journalEntryId: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  if (pay.items.length > 0) {
    await db.insertInto('payrollRunItems').values(pay.items.filter((i) => i.amountCents > 0).map((i) => ({ payrollRunId: inserted.id, itemId: i.itemId, name: i.name, kind: i.kind, cppApplies: i.cppApplies ? 1 : 0, eiApplies: i.eiApplies ? 1 : 0, taxApplies: i.taxApplies ? 1 : 0, t4Box: i.t4Box, amountCents: i.amountCents, accountId: i.accountId }))).execute();
  }

  return { ...mapPayrollRunRow(inserted), items: pay.items };
}

export async function payrollRunsDelete(id: number) {
  const db = getCurrentDb();
  const run = await payrollRunsGet(id);
  if (run.status !== 'draft') throw new Error('Only draft pay runs can be deleted.');
  await db.deleteFrom('payrollRuns').where('id', '=', id).execute();
  return { deleted: true } as const;
}

/** Posts a draft pay run: builds the GL journal entry (wages expense, payroll remittances
 * payable, net pay out of the chosen bank account), posts it through the same validated pipeline
 * every other journal entry goes through, then marks the run posted and links the entry. */
export async function payrollRunsPost(input: unknown) {
  const { id, bankAccountId } = postPayrollRunSchema.parse(input);
  const db = getCurrentDb();
  const run = await payrollRunsGet(id);
  if (run.status !== 'draft') throw new Error('Only draft pay runs can be posted.');
  if (!hasPostablePayrollAmount(run)) {
    throw new Error('This pay run has no payroll amount. Delete this zero-value draft and create it again after entering the employee’s hours or other pay.');
  }

  const employee = await getEmployeeById(db, run.employeeId);
  if (!employee) throw new Error(`Employee ${run.employeeId} not found.`);
  if (!run.isVacationPayout) await assertRunAllowed(db, run, run.id);

  const bank = await db.selectFrom('accounts').select(['id', 'name', 'accountSubtype', 'isActive']).where('id', '=', bankAccountId).executeTakeFirst();
  const bankRefusal = moneyAccountRefusalReason(bank && { ...bank, isActive: Boolean(bank.isActive) }, 'pay this run');
  if (bankRefusal) throw new Error(bankRefusal);

  const wagesExpenseAccountId = await ensureAccountByName(db, 'Salaries, Wages & Benefits', 'Expense', 'PAYROLL-WAGES', '9060', 'Operating Expense');
  const remittancesPayableAccountId = await ensureAccountByName(
    db,
    'Payroll Remittances Payable',
    'Liability',
    'PAYROLL-REMIT',
    null,
    'Current Liability',
  );
  const wsibPayableAccountId =
    run.wsibEmployerCents > 0 ? await ensureAccountByName(db, 'WSIB Premiums Payable', 'Liability', 'PAYROLL-WSIB', null, 'Current Liability') : null;
  const rrspPayableAccountId =
    run.rrspEmployerMatchCents > 0 ? await ensureAccountByName(db, 'RRSP Contributions Payable', 'Liability', 'PAYROLL-RRSP', null, 'Current Liability') : null;
  const benefitsPayableAccountId =
    run.healthBenefitCents > 0 ? await ensureAccountByName(db, 'Employee Benefits Payable', 'Liability', 'PAYROLL-BENEFITS', null, 'Current Liability') : null;
  // Needed both when vacation is being held back this period and when a payout run releases it.
  const vacationAccruedCents = employee.vacationPayAccrued && !run.isVacationPayout ? run.vacationPayCents : 0;
  const vacationPayableAccountId =
    vacationAccruedCents > 0 || run.isVacationPayout
      ? await ensureAccountByName(db, 'Vacation Pay Payable', 'Liability', 'PAYROLL-VACATION', null, 'Current Liability')
      : null;

  const runItems = await loadRunItems(db, run.id);
  const itemsSummary = summarizePayRunItems(runItems);
  const deductionsPayableAccountId = itemsSummary.deductionsCents > 0 ? await ensureAccountByName(db, 'Payroll Deductions Payable', 'Liability', 'PAYROLL-DEDUCT', null, 'Current Liability') : null;
  const reimbursementsExpenseAccountId = itemsSummary.reimbursementsCents > 0 ? await ensureAccountByName(db, 'Employee Expense Reimbursements', 'Expense', 'PAYROLL-REIMB', '9060', 'Operating Expense') : null;
  const benefitsPayableForItems = itemsSummary.benefitsCents + itemsSummary.employerContributionsCents > 0 && !benefitsPayableAccountId ? await ensureAccountByName(db, 'Employee Benefits Payable', 'Liability', 'PAYROLL-BENEFITS', null, 'Current Liability') : benefitsPayableAccountId;
  const pay: PayCalculationResult = {
    itemsSummary,
    items: runItems,
    regularPayCents: run.regularPayCents,
    overtimePayCents: run.overtimePayCents,
    grossPayCents: run.grossPayCents,
    vacationPayCents: run.vacationPayCents,
    cpp1EmployeeCents: run.cpp1EmployeeCents,
    cpp1EmployerCents: run.cpp1EmployerCents,
    cpp2EmployeeCents: run.cpp2EmployeeCents,
    cpp2EmployerCents: run.cpp2EmployerCents,
    eiEmployeeCents: run.eiEmployeeCents,
    eiEmployerCents: run.eiEmployerCents,
    wsibEmployerCents: run.wsibEmployerCents,
    rrspEmployerMatchCents: run.rrspEmployerMatchCents,
    healthBenefitCents: run.healthBenefitCents,
    vacationAccruedCents,
    incomeTaxCents: run.incomeTaxCents,
    incomeTaxAutoCalculated: false, // not tracked once saved; irrelevant for posting
    totalEmployeeDeductionsCents: run.cpp1EmployeeCents + run.cpp2EmployeeCents + run.eiEmployeeCents + run.incomeTaxCents + itemsSummary.deductionsCents,
    netPayCents: run.netPayCents,
    totalEmployerCostCents:
      run.grossPayCents +
      run.vacationPayCents +
      run.cpp1EmployerCents +
      run.cpp2EmployerCents +
      run.eiEmployerCents +
      run.wsibEmployerCents +
      run.rrspEmployerMatchCents +
      run.healthBenefitCents +
      itemsSummary.benefitsCents +
      itemsSummary.reimbursementsCents +
      itemsSummary.employerContributionsCents,
    ytdAfterThisPeriod: { pensionableInsurableEarningsCents: 0, cpp1EmployeeCents: 0, cpp2EmployeeCents: 0, eiEmployeeCents: 0 },
  };

  const lines = buildPayrollJournalLines(
    pay,
    { wagesExpenseAccountId, remittancesPayableAccountId, bankAccountId, wsibPayableAccountId, rrspPayableAccountId, benefitsPayableAccountId: benefitsPayableForItems, vacationPayableAccountId, deductionsPayableAccountId, reimbursementsExpenseAccountId },
    employee.name,
    { isVacationPayout: run.isVacationPayout },
  );

  // The GL post and the run's status change commit together — otherwise a failure between them
  // leaves payroll expense on the books with the run still showing as an unposted draft, which
  // double-posts the moment someone retries.
  const updated = await db.transaction().execute(async (trx) => {
    const created = await journalCreate(
      {
        entryDate: run.payDate,
        memo: `Payroll — ${employee.name} (${run.payPeriodStart} to ${run.payPeriodEnd})`,
        reference: `PAYROLL-${run.id}`,
        lines: lines.map((l) => ({ accountId: l.accountId, debitCents: l.debitCents, creditCents: l.creditCents, description: l.description })),
      },
      trx,
    );
    const posted = await journalPost(created.id, trx);

    return trx
      .updateTable('payrollRuns')
      .set({ status: 'posted', journalEntryId: posted.id })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  });

  return mapPayrollRunRow(updated);
}

/** Reopens a posted run for correction. The payroll GL and run status roll back together. */
export async function payrollRunsReverse(id: number) {
  const db = getCurrentDb();
  const run = await payrollRunsGet(id);
  if (run.status !== 'posted' || run.journalEntryId === null) throw new Error('Only a posted payroll run with a linked journal can be reversed.');
  const updated = await db.transaction().execute(async (trx) => {
    await journalVoid(run.journalEntryId!, false, trx, true);
    return trx.updateTable('payrollRuns').set({ status: 'draft', journalEntryId: null }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  });
  return mapPayrollRunRow(updated);
}

export interface PaystubData {
  run: PayrollRun;
  employee: Employee;
  company: CompanyInfo;
  ytdThroughThisRun: YtdPaystubTotals;
  /** Year-to-date amount per payroll item name. */
  ytdItems: Record<string, number>;
}

/** Everything a printable paystub needs in one call — the run itself, the employee it's for, the
 * employer's info for the header, and year-to-date totals accumulated by pay date up through and
 * including this run. */
function rowToItem(r: { itemId: number | null; name: string; kind: string; cppApplies: number; eiApplies: number; taxApplies: number; t4Box: string | null; amountCents: number; accountId: number | null }): PayRunItem {
  return { itemId: r.itemId, name: r.name, kind: r.kind as PayRunItem['kind'], cppApplies: Boolean(r.cppApplies), eiApplies: Boolean(r.eiApplies), taxApplies: Boolean(r.taxApplies), t4Box: (r.t4Box ?? null) as PayRunItem['t4Box'], amountCents: r.amountCents, accountId: r.accountId };
}

export async function loadRunItems(db: AppDb, runId: number): Promise<PayRunItem[]> {
  const rows = await db.selectFrom('payrollRunItems').selectAll().where('payrollRunId', '=', runId).orderBy('id').execute();
  return rows.map(rowToItem);
}

/** Year-to-date by item name for the stub's YTD column (posted runs, same calendar year, through the pay date). */
async function ytdItemTotals(db: AppDb, employeeId: number, payDate: string): Promise<Record<string, number>> {
  const rows = await db.selectFrom('payrollRunItems').innerJoin('payrollRuns', 'payrollRuns.id', 'payrollRunItems.payrollRunId')
    .select(['payrollRunItems.name as name', 'payrollRunItems.amountCents as amountCents'])
    .where('payrollRuns.employeeId', '=', employeeId).where('payrollRuns.status', '=', 'posted').where('payrollRuns.payDate', '<=', payDate).where('payrollRuns.payDate', '>=', `${payDate.slice(0, 4)}-01-01`).execute();
  const out: Record<string, number> = {};
  for (const r of rows) out[r.name] = (out[r.name] ?? 0) + r.amountCents;
  return out;
}

export async function payrollItemsList(): Promise<PayrollItemDefinition[]> {
  const db = getCurrentDb();
  let rows = await db.selectFrom('payrollItems').selectAll().orderBy('kind').orderBy('name').execute();
  if (rows.length === 0) {
    await db.insertInto('payrollItems').values(DEFAULT_PAYROLL_ITEMS.map((i) => ({ name: i.name, kind: i.kind, cppApplies: i.cppApplies ? 1 : 0, eiApplies: i.eiApplies ? 1 : 0, taxApplies: i.taxApplies ? 1 : 0, t4Box: i.t4Box, defaultAmountCents: i.defaultAmountCents, accountId: i.accountId, isActive: 1 }))).execute();
    rows = await db.selectFrom('payrollItems').selectAll().orderBy('kind').orderBy('name').execute();
  }
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind as PayrollItemDefinition['kind'], cppApplies: Boolean(r.cppApplies), eiApplies: Boolean(r.eiApplies), taxApplies: Boolean(r.taxApplies), t4Box: (r.t4Box ?? null) as PayrollItemDefinition['t4Box'], defaultAmountCents: r.defaultAmountCents, accountId: r.accountId, isActive: Boolean(r.isActive) }));
}

export async function payrollItemsSave(input: unknown): Promise<PayrollItemDefinition[]> {
  const { id, ...def } = (input ?? {}) as { id?: number } & Record<string, unknown>;
  const payload = payrollItemDefinitionSchema.parse(def);
  const db = getCurrentDb();
  const values = { name: payload.name, kind: payload.kind, cppApplies: payload.cppApplies ? 1 : 0, eiApplies: payload.eiApplies ? 1 : 0, taxApplies: payload.taxApplies ? 1 : 0, t4Box: payload.t4Box, defaultAmountCents: payload.defaultAmountCents, accountId: payload.accountId, isActive: payload.isActive ? 1 : 0 };
  if (id) await db.updateTable('payrollItems').set(values).where('id', '=', id).execute();
  else await db.insertInto('payrollItems').values(values).execute();
  return payrollItemsList();
}

export async function payrollRunsGetPaystub(id: number): Promise<PaystubData> {
  const db = getCurrentDb();
  const run = await payrollRunsGet(id);
  const employee = await getEmployeeById(db, run.employeeId);
  if (!employee) throw new Error(`Employee ${run.employeeId} not found.`);
  const company = await companyGet();
  const ytdThroughThisRun = await getYtdPaystubTotals(db, run.employeeId, run.payDate);
  const items = await loadRunItems(db, run.id);
  const ytdItems = await ytdItemTotals(db, run.employeeId, run.payDate);
  return { run: { ...run, items }, employee, company, ytdThroughThisRun, ytdItems };
}

/** Generates a printable PD7A remittance summary for the given pay-date range, lets the
 * accountant pick where to save it, then opens it — same save/open pattern as forms.handlers.ts. */
/** The pay stub as a PDF: the employee's copy, saved where the accountant chooses and opened. */
export async function payrollRunsSavePaystubPdf(window: BrowserWindow, id: number) {
  const data = await payrollRunsGetPaystub(id);
  const bytes = await generatePaystubPdf(data);
  return savePdfAndOpen(window, 'Save Pay Stub', `Pay Stub - ${safeFileNamePart(data.employee.name)} - ${data.run.payDate}.pdf`, bytes);
}

/** EHT already accrued for a year: every posted accrual entry carries the reference EHT-<year>-… */
export async function payrollEhtAccrued(input: unknown): Promise<{ accruedCents: number }> {
  const { taxYear } = input as { taxYear: number };
  const db = getCurrentDb();
  const rows = await db
    .selectFrom('journalEntryLines')
    .innerJoin('journalEntries', 'journalEntries.id', 'journalEntryLines.journalEntryId')
    .innerJoin('accounts', 'accounts.id', 'journalEntryLines.accountId')
    .select(['journalEntryLines.debitCents', 'journalEntryLines.creditCents'])
    .where('journalEntries.status', '=', 'posted')
    .where('journalEntries.reference', 'like', `EHT-${taxYear}-%`)
    .where('accounts.accountType', '=', 'Expense')
    .execute();
  return { accruedCents: rows.reduce((sum, r) => sum + r.debitCents - r.creditCents, 0) };
}

/** Posts the EHT owing on the year's Ontario payroll to date, less what is already accrued:
 * Employer Health Tax (expense) against Employer Health Tax Payable. Run monthly or at year end;
 * each run only adds the difference, so it is safe to repeat. */
export async function payrollEhtAccrue(input: unknown): Promise<{ amountCents: number; journalEntryId: number }> {
  const { taxYear, throughDate } = input as { taxYear: number; throughDate: string };
  const db = getCurrentDb();
  const [runs, employees, company, accrued] = await Promise.all([getAllPayrollRuns(db), getAllEmployees(db), companyGet(), payrollEhtAccrued({ taxYear })]);
  const remuneration = ontarioRemunerationCents(runs, employees, `${taxYear}-01-01`, throughDate);
  const eht = computeEht({ remunerationCents: remuneration, exemptionEligible: company.ehtExemptionEligible ?? true, exemptionCents: company.ehtExemptionCents ?? EHT_DEFAULT_EXEMPTION_CENTS });
  const amountCents = eht.taxCents - accrued.accruedCents;
  if (amountCents <= 0) throw new Error('Nothing to accrue: the EHT on Ontario pay to date is already in the books.');
  const expenseId = await ensureAccountByName(db, 'Employer Health Tax', 'Expense', 'EHT-EXP', '9060', 'Operating Expense');
  const payableId = await ensureAccountByName(db, 'Employer Health Tax Payable', 'Liability', 'EHT-PAY', null, 'Current Liability');
  const posted = await db.transaction().execute(async (trx) => {
    const created = await journalCreate(
      {
        entryDate: throughDate,
        memo: `Ontario Employer Health Tax accrual — ${taxYear} to ${throughDate} (${(eht.rate * 100).toFixed(3)}% on remuneration above the exemption)`,
        reference: `EHT-${taxYear}-${throughDate}`,
        lines: [
          { accountId: expenseId, debitCents: amountCents, creditCents: 0, description: 'Employer Health Tax' },
          { accountId: payableId, debitCents: 0, creditCents: amountCents, description: 'Employer Health Tax Payable' },
        ],
      },
      trx,
    );
    return journalPost(created.id, trx);
  });
  return { amountCents, journalEntryId: posted.id };
}

export async function payrollGeneratePd7aPdf(window: BrowserWindow, input: unknown) {
  const { payDateFrom, payDateTo } = input as { payDateFrom: string; payDateTo: string };
  const db = getCurrentDb();
  const [runs, company] = await Promise.all([getAllPayrollRuns(db), companyGet()]);
  const summary = computePd7aSummary(runs, payDateFrom, payDateTo);
  const monthly = computePd7aMonthlyBreakdown(runs.filter((r) => r.payDate >= payDateFrom && r.payDate <= payDateTo));
  const bytes = await generatePd7aPdf(company, summary, monthly);
  return savePdfAndOpen(window, 'Save PD7A Remittance Summary', `PD7A Summary - ${payDateFrom} to ${payDateTo}.pdf`, bytes);
}

/** Generates printable T4 slips (one per employee with posted runs that year) plus a T4 Summary
 * page, lets the accountant pick where to save it, then opens it. */
export async function payrollGenerateT4Slips(window: BrowserWindow, input: unknown) {
  const { taxYear } = input as { taxYear: number };
  const db = getCurrentDb();
  const [runs, employees, company] = await Promise.all([getAllPayrollRuns(db), getAllEmployees(db), companyGet()]);
  const slips = computeT4SlipsForYear(runs, employees, taxYear);
  if (slips.length === 0) throw new Error(`No posted pay runs with a pay date in ${taxYear}.`);
  const summary = computeT4SummaryForYear(runs, employees, taxYear);
  const bytes = await generateT4Pdf(company, slips, summary, taxYear);
  return savePdfAndOpen(window, 'Save T4 Slips', `T4 Slips ${taxYear} - ${safeFileNamePart(company.legalName)}.pdf`, bytes);
}

/** Generates printable T4A slips (Box 048 only, one per T4A-flagged vendor with paid bills that
 * year), lets the accountant pick where to save it, then opens it. */
export async function payrollGenerateT4ASlips(window: BrowserWindow, input: unknown) {
  const { taxYear } = input as { taxYear: number };
  const db = getCurrentDb();
  const [bills, vendors, company, payments] = await Promise.all([getAllBills(db), getAllVendors(db), companyGet(), db.selectFrom('billPayments').selectAll().execute()]);
  const slips = computeT4ASlipsForYear(bills, vendors, taxYear, payments);
  if (slips.length === 0) throw new Error(`No T4A-reportable vendor payments found in ${taxYear}.`);
  const bytes = await generateT4APdf(company, slips, taxYear);
  return savePdfAndOpen(window, 'Save T4A Slips', `T4A Slips ${taxYear} - ${safeFileNamePart(company.legalName)}.pdf`, bytes);
}

/** Lightweight preview data for the Year-End Slips panel — lets the UI show who a run would
 * include and roughly what it totals before generating the actual PDF. */
export async function payrollGetT4Preview(taxYear: number) {
  const db = getCurrentDb();
  const [runs, employees] = await Promise.all([getAllPayrollRuns(db), getAllEmployees(db)]);
  return computeT4SlipsForYear(runs, employees, taxYear);
}

export async function payrollGetT4APreview(taxYear: number) {
  const db = getCurrentDb();
  const [bills, vendors, payments] = await Promise.all([getAllBills(db), getAllVendors(db), db.selectFrom('billPayments').selectAll().execute()]);
  return computeT4ASlipsForYear(bills, vendors, taxYear, payments);
}

/** Generates printable T5018 slips (Box 22 only, one per T5018-flagged vendor with $500+ in paid
 * bills that year), lets the accountant pick where to save it, then opens it. */
export async function payrollGenerateT5018Slips(window: BrowserWindow, input: unknown) {
  const { taxYear } = input as { taxYear: number };
  const db = getCurrentDb();
  const [bills, vendors, company, payments] = await Promise.all([getAllBills(db), getAllVendors(db), companyGet(), db.selectFrom('billPayments').selectAll().execute()]);
  const slips = computeT5018SlipsForYear(bills, vendors, taxYear, payments);
  if (slips.length === 0) throw new Error(`No T5018-reportable subcontractor payments found in ${taxYear}.`);
  const bytes = await generateT5018Pdf(company, slips, taxYear);
  return savePdfAndOpen(window, 'Save T5018 Slips', `T5018 Slips ${taxYear} - ${safeFileNamePart(company.legalName)}.pdf`, bytes);
}

export async function payrollGetT5018Preview(taxYear: number) {
  const db = getCurrentDb();
  const [bills, vendors, payments] = await Promise.all([getAllBills(db), getAllVendors(db), db.selectFrom('billPayments').selectAll().execute()]);
  return computeT5018SlipsForYear(bills, vendors, taxYear, payments);
}
