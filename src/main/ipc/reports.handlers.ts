import type { BrowserWindow } from 'electron';
import {
  balanceSheetQuerySchema,
  periodReportQuerySchema,
  generalLedgerQuerySchema,
  gifiExportQuerySchema,
  hstSummaryQuerySchema,
  incomeStatementQuerySchema,
  projectionsQuerySchema,
  trialBalanceQuerySchema,
} from '@shared/validation/schemas';
import { trialBalance } from '@shared/domain/ledger/trialBalance';
import { generalLedger } from '@shared/domain/ledger/generalLedger';
import { balanceSheet } from '@shared/domain/ledger/balanceSheet';
import { cashFlowStatement } from '@shared/domain/ledger/cashFlowStatement';
import { changesInEquity } from '@shared/domain/ledger/changesInEquity';
import { profitAndLossByCustomer, profitAndLossDetail } from '@shared/domain/ledger/profitAndLossDetail';
import { invalidTransactions, journalReport } from '@shared/domain/ledger/transactionLists';
import { workingTrialBalance } from '@shared/domain/ledger/workingTrialBalance';
import { customerStatement, expensesByVendor } from '@shared/domain/ledger/contactActivity';
import { chequeRegister } from '@shared/domain/ledger/chequeRegister';
import { salesTaxDetail } from '@shared/domain/ledger/salesTaxDetail';
import { reconciliationReport } from '@shared/domain/ledger/reconciliationReport';
import { computeT2125, type T2125Input } from '@shared/domain/tax/t2125';
import { gifiExport } from '@shared/domain/ledger/gifiExport';
import { computeMonthlyProjection } from '@shared/domain/ledger/projections';
import { computeHstSummary } from '@shared/domain/ledger/hstSummary';
import { computeAccountBalances, filterEntriesByDateRange } from '@shared/domain/ledger/computeAccountBalances';
import { incomeStatement } from '@shared/domain/ledger/incomeStatement';
import { toCashBasisEntries } from '@shared/domain/ledger/cashBasis';
import { inventoryStatus, valueProduct, type InventoryMovement } from '@shared/domain/inventory/inventoryValuation';
import {
  classifyBankDeposit,
  closingUccCents,
  type CompliancePackageResult,
  type SourceDocumentReportRow,
} from '@shared/domain/reporting/compliancePackage';
import { profitAndLossByTag } from '@shared/domain/ledger/profitAndLossByTag';
import { tagsAllLineAssignments } from './tags.handlers';
import { getCurrentDb } from '../companyFile';
import { getAllAccounts, getAllGifiCodes, getAllJournalEntriesWithLines, getAllEmployees, getAllPayrollRuns, getAllInvoices, getAllBills, getAllCustomers, getAllVendors, getAllFiscalPeriods } from '../db/queries';
import { appSaveExcelFile } from './app.handlers';
import { buildCustomCompanyReportRows, type ComprehensiveCompanyReportResult } from '@shared/domain/reporting/comprehensiveCompanyReport';
import { computeSalesTaxByProvince } from '@shared/domain/ledger/salesTaxByProvince';
import { computeProvincialSalesTax } from '@shared/domain/ledger/provincialSalesTax';
import { computeEmployeeEarnings } from '@shared/domain/payroll/employeeEarnings';
import { loadRunItems } from './payroll.handlers';
import { runAuditExceptions } from '@shared/domain/audit/auditExceptions';
import { z } from 'zod';

export async function reportsTrialBalance(input: unknown) {
  const { asOfDate } = trialBalanceQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries] = await Promise.all([getAllAccounts(db), getAllJournalEntriesWithLines(db)]);
  return trialBalance(accounts, entries, asOfDate);
}

export async function reportsGeneralLedger(input: unknown) {
  const { accountId, dateFrom, dateTo } = generalLedgerQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries, customers, vendors, transactionTypes] = await Promise.all([
    getAllAccounts(db),
    getAllJournalEntriesWithLines(db),
    db.selectFrom('customers').select(['id', 'name']).execute(),
    db.selectFrom('vendors').select(['id', 'name']).execute(),
    generalLedgerTransactionTypes(db),
  ]);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new Error(`Account ${accountId} not found.`);
  return generalLedger(account, entries, dateFrom, dateTo, {
    allAccounts: accounts,
    customerNames: new Map(customers.map((customer) => [customer.id, customer.name])),
    vendorNames: new Map(vendors.map((vendor) => [vendor.id, vendor.name])),
    transactionTypes,
  });
}

async function generalLedgerTransactionTypes(db: ReturnType<typeof getCurrentDb>): Promise<Map<number, string>> {
  const [invoices, invoicePayments, bills, billPayments, receipts, deposits, credits, payrollRuns, filings, t5Payments, purchaseReceipts, mileageTrips, inventoryMovements] = await Promise.all([
    db.selectFrom('invoices').select(['invoiceJournalEntryId', 'paymentJournalEntryId']).execute(),
    db.selectFrom('invoicePayments').select('journalEntryId').execute(),
    db.selectFrom('bills').select(['billJournalEntryId', 'paymentJournalEntryId']).execute(),
    db.selectFrom('billPayments').select('journalEntryId').execute(),
    db.selectFrom('salesReceipts').select('journalEntryId').execute(),
    db.selectFrom('deposits').select('journalEntryId').execute(),
    db.selectFrom('creditNotes').select(['kind', 'creditJournalEntryId', 'refundJournalEntryId']).execute(),
    db.selectFrom('payrollRuns').select('journalEntryId').execute(),
    db.selectFrom('hstFilings').select('journalEntryId').execute(),
    db.selectFrom('t5Payments').select('journalEntryId').execute(),
    db.selectFrom('purchaseOrderReceipts').select('journalEntryId').execute(),
    db.selectFrom('mileageTrips').select('journalEntryId').execute(),
    db.selectFrom('inventoryMovements').select('journalEntryId').execute(),
  ]);

  const result = new Map<number, string>();
  const put = (id: number | null, label: string, overwrite = false) => {
    if (id !== null && (overwrite || !result.has(id))) result.set(id, label);
  };
  for (const row of invoices) put(row.invoiceJournalEntryId, 'Invoice');
  for (const row of invoicePayments) put(row.journalEntryId, 'Customer Payment');
  for (const row of bills) put(row.billJournalEntryId, 'Bill');
  for (const row of billPayments) put(row.journalEntryId, 'Bill Payment');
  for (const row of receipts) put(row.journalEntryId, 'Sales Receipt');
  for (const row of deposits) put(row.journalEntryId, 'Deposit');
  for (const row of payrollRuns) put(row.journalEntryId, 'Payroll');
  for (const row of filings) put(row.journalEntryId, 'GST/HST Filing');
  for (const row of t5Payments) put(row.journalEntryId, 'T5 Payment');
  for (const row of purchaseReceipts) put(row.journalEntryId, 'Inventory Receipt');
  for (const row of mileageTrips) put(row.journalEntryId, 'Mileage Claim');
  for (const row of inventoryMovements) put(row.journalEntryId, 'Inventory Adjustment');
  for (const row of credits) {
    put(row.creditJournalEntryId, row.kind === 'customer' ? 'Customer Credit' : 'Vendor Credit', true);
    put(row.refundJournalEntryId, row.kind === 'customer' ? 'Customer Refund' : 'Vendor Refund', true);
  }
  // Older company files kept only the most recent payment link on the document itself.
  for (const row of invoices) put(row.paymentJournalEntryId, 'Customer Payment');
  for (const row of bills) put(row.paymentJournalEntryId, 'Bill Payment');
  return result;
}

/** The journal as the cash basis sees it: invoices and bills recognised on their payment dates. */
async function cashBasisEntries(db: ReturnType<typeof getCurrentDb>, accounts: Awaited<ReturnType<typeof getAllAccounts>>, entries: Awaited<ReturnType<typeof getAllJournalEntriesWithLines>>) {
  const [invoices, bills, invoicePayments, billPayments] = await Promise.all([
    db.selectFrom('invoices').select(['id', 'invoiceJournalEntryId', 'totalCents']).execute(),
    db.selectFrom('bills').select(['id', 'billJournalEntryId', 'amountCents']).execute(),
    db.selectFrom('invoicePayments').select(['invoiceId', 'paymentDate', 'amountCents']).execute(),
    db.selectFrom('billPayments').select(['billId', 'paymentDate', 'amountCents']).execute(),
  ]);
  const invoiceEntry = new Map(invoices.map((i) => [i.id, i.invoiceJournalEntryId]));
  const billEntry = new Map(bills.map((b) => [b.id, b.billJournalEntryId]));
  return toCashBasisEntries(entries, accounts, {
    invoices: invoices.map((i) => ({ journalEntryId: i.invoiceJournalEntryId, totalCents: i.totalCents })),
    bills: bills.map((b) => ({ journalEntryId: b.billJournalEntryId, totalCents: b.amountCents })),
    invoicePayments: invoicePayments.map((p) => ({ documentJournalEntryId: invoiceEntry.get(p.invoiceId) ?? null, paymentDate: p.paymentDate, amountCents: p.amountCents })),
    billPayments: billPayments.map((p) => ({ documentJournalEntryId: billEntry.get(p.billId) ?? null, paymentDate: p.paymentDate, amountCents: p.amountCents })),
  });
}

export async function reportsIncomeStatement(input: unknown) {
  const { periodStart, periodEnd, comparativeStart, comparativeEnd, basis } = incomeStatementQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, posted] = await Promise.all([getAllAccounts(db), getAllJournalEntriesWithLines(db)]);
  const entries = basis === 'cash' ? await cashBasisEntries(db, accounts, posted) : posted;
  return incomeStatement(
    accounts,
    entries,
    periodStart,
    periodEnd,
    comparativeStart ?? undefined,
    comparativeEnd ?? undefined,
  );
}

export async function reportsBalanceSheet(input: unknown) {
  const { asOfDate, comparativeDate } = balanceSheetQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries] = await Promise.all([getAllAccounts(db), getAllJournalEntriesWithLines(db)]);
  return balanceSheet(accounts, entries, asOfDate, comparativeDate ?? undefined);
}

export async function reportsCashFlow(input: unknown) {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries] = await Promise.all([getAllAccounts(db), getAllJournalEntriesWithLines(db)]);
  return cashFlowStatement(accounts, entries, periodStart, periodEnd);
}

export async function reportsChangesInEquity(input: unknown) {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries] = await Promise.all([getAllAccounts(db), getAllJournalEntriesWithLines(db)]);
  return changesInEquity(accounts, entries, periodStart, periodEnd);
}

/** One company-wide reporting snapshot. Its tables are rendered together and therefore export to
 * one Excel worksheet. The customizable rows deliberately start at journal-line level: every
 * chosen field remains traceable to one entry and one account rather than joining unrelated
 * report totals together by position. */
export async function reportsComprehensiveCompany(input: unknown): Promise<ComprehensiveCompanyReportResult> {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries, customers, vendors, transactionTypes, invoices, bills, salesReceipts] = await Promise.all([
    getAllAccounts(db),
    getAllJournalEntriesWithLines(db),
    db.selectFrom('customers').select(['id', 'name']).execute(),
    db.selectFrom('vendors').select(['id', 'name']).execute(),
    generalLedgerTransactionTypes(db),
    db.selectFrom('invoices').selectAll().execute(),
    db.selectFrom('bills').selectAll().execute(),
    db.selectFrom('salesReceipts').selectAll().execute(),
  ]);
  const customerById = new Map(customers.map((contact) => [contact.id, contact.name]));
  const vendorById = new Map(vendors.map((contact) => [contact.id, contact.name]));
  const customRows = buildCustomCompanyReportRows(accounts, entries, periodStart, periodEnd, customerById, vendorById, transactionTypes);
  const daysOverdue = (dueDate: string) => Math.floor((Date.parse(periodEnd) - Date.parse(dueDate)) / 86_400_000);
  const agingBucket = (days: number): 'Current' | '1–30' | '31–60' | '61–90' | '90+' => days <= 0 ? 'Current' : days <= 30 ? '1–30' : days <= 60 ? '31–60' : days <= 90 ? '61–90' : '90+';
  const receivables = invoices.filter((row) => row.invoiceDate <= periodEnd && row.totalCents - row.paidCents > 0).map((row) => {
    const overdue = daysOverdue(row.dueDate);
    return { party: customerById.get(row.customerId) ?? 'Unknown customer', documentNumber: row.invoiceNumber, documentDate: row.invoiceDate, dueDate: row.dueDate, balanceCents: row.totalCents - row.paidCents, daysOverdue: overdue, bucket: agingBucket(overdue) };
  });
  const payables = bills.filter((row) => row.billDate <= periodEnd && row.amountCents - row.paidCents > 0).map((row) => {
    const overdue = daysOverdue(row.dueDate);
    return { party: vendorById.get(row.vendorId) ?? 'Unknown vendor', documentNumber: row.billNumber ?? `Bill ${row.id}`, documentDate: row.billDate, dueDate: row.dueDate, balanceCents: row.amountCents - row.paidCents, daysOverdue: overdue, bucket: agingBucket(overdue) };
  });
  const sales = new Map<number, { customer: string; invoicedCents: number; receiptedCents: number; documentCount: number }>();
  const saleRow = (customerId: number) => {
    if (!sales.has(customerId)) sales.set(customerId, { customer: customerById.get(customerId) ?? 'Unknown customer', invoicedCents: 0, receiptedCents: 0, documentCount: 0 });
    return sales.get(customerId)!;
  };
  for (const row of invoices.filter((item) => item.invoiceDate >= periodStart && item.invoiceDate <= periodEnd)) { const target = saleRow(row.customerId); target.invoicedCents += row.totalCents; target.documentCount += 1; }
  for (const row of salesReceipts.filter((item) => item.receiptDate >= periodStart && item.receiptDate <= periodEnd)) { const target = saleRow(row.customerId); target.receiptedCents += row.totalCents; target.documentCount += 1; }

  return {
    periodStart,
    periodEnd,
    trialBalance: trialBalance(accounts, entries, periodEnd),
    incomeStatement: incomeStatement(accounts, entries, periodStart, periodEnd),
    balanceSheet: balanceSheet(accounts, entries, periodEnd),
    cashFlow: cashFlowStatement(accounts, entries, periodStart, periodEnd),
    compliance: await reportsCompliancePackage({ periodStart, periodEnd }),
    receivables: receivables.sort((left, right) => right.daysOverdue - left.daysOverdue),
    payables: payables.sort((left, right) => right.daysOverdue - left.daysOverdue),
    salesByCustomer: [...sales.values()].sort((left, right) => (right.invoicedCents + right.receiptedCents) - (left.invoicedCents + left.receiptedCents)),
    expensesByVendor: expensesByVendor(accounts, entries, periodStart, periodEnd, vendorById),
    customRows,
  };
}

/** Names for the customer/vendor ids carried on journal lines, so the reports can label rows
 * without every caller having to join contacts itself. */
async function contactNameMap(db: ReturnType<typeof getCurrentDb>): Promise<Map<number, string>> {
  const [customers, vendors] = await Promise.all([
    db.selectFrom('customers').select(['id', 'name']).execute(),
    db.selectFrom('vendors').select(['id', 'name']).execute(),
  ]);
  return new Map([...customers, ...vendors].map((c) => [c.id, c.name]));
}

export async function reportsProfitAndLossDetail(input: unknown) {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries, names] = await Promise.all([
    getAllAccounts(db),
    getAllJournalEntriesWithLines(db),
    contactNameMap(db),
  ]);
  return profitAndLossDetail(accounts, entries, periodStart, periodEnd, names);
}

export async function reportsProfitAndLossByCustomer(input: unknown) {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries, names] = await Promise.all([
    getAllAccounts(db),
    getAllJournalEntriesWithLines(db),
    contactNameMap(db),
  ]);
  return profitAndLossByCustomer(accounts, entries, periodStart, periodEnd, names);
}

export async function reportsJournal(input: unknown) {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const postedOnly = Boolean((input as { postedOnly?: boolean })?.postedOnly);
  const db = getCurrentDb();
  const [accounts, entries, names] = await Promise.all([
    getAllAccounts(db),
    getAllJournalEntriesWithLines(db),
    contactNameMap(db),
  ]);
  return journalReport(accounts, entries, periodStart, periodEnd, names, { postedOnly });
}

export async function reportsInvalidTransactions(input: unknown) {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries] = await Promise.all([getAllAccounts(db), getAllJournalEntriesWithLines(db)]);
  return invalidTransactions(accounts, entries, periodStart, periodEnd);
}

export async function reportsWorkingTrialBalance(input: unknown) {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries] = await Promise.all([getAllAccounts(db), getAllJournalEntriesWithLines(db)]);
  return workingTrialBalance(accounts, entries, periodStart, periodEnd);
}

export async function reportsExpensesByVendor(input: unknown) {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries, names] = await Promise.all([
    getAllAccounts(db),
    getAllJournalEntriesWithLines(db),
    contactNameMap(db),
  ]);
  return expensesByVendor(accounts, entries, periodStart, periodEnd, names);
}

export async function reportsCustomerStatement(input: unknown) {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const { customerId } = input as { customerId: number };
  const db = getCurrentDb();
  const [accounts, entries, names] = await Promise.all([
    getAllAccounts(db),
    getAllJournalEntriesWithLines(db),
    contactNameMap(db),
  ]);
  return customerStatement(accounts, entries, customerId, names.get(customerId) ?? 'Unknown customer', periodStart, periodEnd);
}

/** Employee earnings record: posted runs by employee for the period, with payroll items folded
 * in, year-to-date beside each employee, and vacation owing. */
export async function reportsEmployeeEarnings(input: unknown) {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const db = getCurrentDb();
  const [employees, runs] = await Promise.all([getAllEmployees(db), getAllPayrollRuns(db)]);
  const withItems = await Promise.all(runs.map(async (r) => ({ ...r, items: await loadRunItems(db, r.id) })));
  return computeEmployeeEarnings(employees, withItems, periodStart, periodEnd);
}

/** Audit exceptions: control-account reconciliations, suspense balances, post-lock and backdated
 * entries, manual cash/revenue entries, round and weekend amounts, missing support, duplicates,
 * sequence gaps, voids and stale open items. */
export async function reportsAuditExceptions(input: unknown) {
  const { periodStart, periodEnd, supportThresholdCents } = periodReportQuerySchema.extend({ supportThresholdCents: z.number().int().min(0).optional() }).parse(input);
  const db = getCurrentDb();
  const [accounts, entries, invoices, bills, customers, vendors, fiscalPeriods] = await Promise.all([
    getAllAccounts(db), getAllJournalEntriesWithLines(db), getAllInvoices(db), getAllBills(db), getAllCustomers(db), getAllVendors(db), getAllFiscalPeriods(db),
  ]);
  const attachments = await db.selectFrom('attachments').select(['entityType', 'entityId']).execute().catch(() => [] as Array<{ entityType: string; entityId: number }>);
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const vendorName = new Map(vendors.map((v) => [v.id, v.name]));
  return runAuditExceptions({
    periodStart, periodEnd, accounts, entries,
    invoices: invoices.map((i) => ({ id: i.id, customerId: i.customerId, customerName: customerName.get(i.customerId) ?? 'Customer', invoiceNumber: i.invoiceNumber, invoiceDate: i.invoiceDate, dueDate: i.dueDate, totalCents: i.totalCents, paidCents: i.paidCents, status: i.status })),
    bills: bills.map((b) => ({ id: b.id, vendorId: b.vendorId, vendorName: vendorName.get(b.vendorId) ?? 'Vendor', billNumber: b.billNumber, billDate: b.billDate, dueDate: b.dueDate, amountCents: b.amountCents, paidCents: b.paidCents, status: b.status, billJournalEntryId: b.billJournalEntryId })),
    fiscalPeriods,
    attachedJournalIds: new Set(attachments.filter((a) => /journal/i.test(a.entityType)).map((a) => a.entityId)),
    attachedBillIds: new Set(attachments.filter((a) => /^bill$/i.test(a.entityType)).map((a) => a.entityId)),
    supportThresholdCents,
  });
}

export interface ActivityLogRow {
  id: number;
  changedAt: string;
  actorName: string;
  actorEmail: string | null;
  topic: string;
  action: string;
  targetReference: string | null;
}

/** Who changed what in this company file, newest first. */
export async function reportsActivityLog(input: unknown): Promise<ActivityLogRow[]> {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const db = getCurrentDb();
  const rows = await db
    .selectFrom('userActivityLog')
    .select(['id', 'changedAt', 'actorName', 'actorEmail', 'topic', 'action', 'targetReference'])
    .where('changedAt', '>=', `${periodStart} 00:00:00`)
    .where('changedAt', '<=', `${periodEnd} 23:59:59`)
    .orderBy('changedAt', 'desc')
    .orderBy('id', 'desc')
    .limit(5000)
    .execute();
  return rows;
}

export async function reportsChequeRegister(input: unknown) {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries, names] = await Promise.all([
    getAllAccounts(db),
    getAllJournalEntriesWithLines(db),
    contactNameMap(db),
  ]);
  return chequeRegister(accounts, entries, periodStart, periodEnd, names);
}

export async function reportsSalesTaxDetail(input: unknown) {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries, names] = await Promise.all([
    getAllAccounts(db),
    getAllJournalEntriesWithLines(db),
    contactNameMap(db),
  ]);
  return salesTaxDetail(accounts, entries, periodStart, periodEnd, names);
}

export async function reportsReconciliation(input: unknown) {
  const { reconciliationId } = input as { reconciliationId: number };
  const db = getCurrentDb();
  const reconciliation = await db
    .selectFrom('bankReconciliations')
    .selectAll()
    .where('id', '=', reconciliationId)
    .executeTakeFirstOrThrow();
  const [accounts, entries] = await Promise.all([getAllAccounts(db), getAllJournalEntriesWithLines(db)]);
  const account = accounts.find((a) => a.id === reconciliation.accountId);
  if (!account) throw new Error('The account this reconciliation belongs to no longer exists.');
  return reconciliationReport(reconciliation as never, account, entries);
}

export async function reportsReconciliationList(input: unknown) {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const db = getCurrentDb();
  return db
    .selectFrom('bankReconciliations')
    .selectAll()
    .where('statementDate', '>=', periodStart)
    .where('statementDate', '<=', periodEnd)
    .orderBy('statementDate', 'desc')
    .execute();
}

export async function reportsT2125(input: unknown) {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const extras = input as Partial<T2125Input>;
  const db = getCurrentDb();
  const [accounts, entries] = await Promise.all([getAllAccounts(db), getAllJournalEntriesWithLines(db)]);
  return computeT2125(accounts, entries, periodStart, periodEnd, {
    homeUsePercent: extras.homeUsePercent ?? 0,
    homeCostsCents: extras.homeCostsCents ?? 0,
    vehicleUsePercent: extras.vehicleUsePercent ?? 0,
    vehicleCostsCents: extras.vehicleCostsCents ?? 0,
    homeCarryForwardInCents: extras.homeCarryForwardInCents ?? 0,
    ccaClaimedCents: extras.ccaClaimedCents ?? 0,
  });
}

export async function reportsGifiExport(input: unknown) {
  const { periodStart, asOfDate } = gifiExportQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries, gifiCodes] = await Promise.all([
    getAllAccounts(db),
    getAllJournalEntriesWithLines(db),
    getAllGifiCodes(db),
  ]);
  return gifiExport(accounts, entries, gifiCodes, periodStart, asOfDate);
}

export async function reportsProjections(input: unknown) {
  const { asOfDate, monthsOfHistory, monthsToProject } = projectionsQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries] = await Promise.all([getAllAccounts(db), getAllJournalEntriesWithLines(db)]);
  return computeMonthlyProjection(accounts, entries, asOfDate, monthsOfHistory, monthsToProject);
}

export async function reportsSalesTaxByProvince(input: unknown) {
  const { periodStart, periodEnd } = hstSummaryQuerySchema.parse(input);
  const entries = await getAllJournalEntriesWithLines(getCurrentDb());
  return computeSalesTaxByProvince(entries, periodStart, periodEnd);
}

export async function reportsProvincialSalesTax(input: unknown) {
  const { periodStart, periodEnd } = hstSummaryQuerySchema.parse(input);
  const entries = await getAllJournalEntriesWithLines(getCurrentDb());
  return computeProvincialSalesTax(entries, periodStart, periodEnd);
}

export async function reportsHstSummary(input: unknown) {
  const { periodStart, periodEnd } = hstSummaryQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries] = await Promise.all([getAllAccounts(db), getAllJournalEntriesWithLines(db)]);
  return computeHstSummary(accounts, entries, periodStart, periodEnd);
}

export async function reportsGifiExportExcel(window: BrowserWindow, input: unknown) {
  const result = await reportsGifiExport(input);

  const rows: string[][] = [['GIFI Code', 'Description', 'Statement Type', 'Amount']];
  for (const row of result.rows) {
    rows.push([row.gifiCode, row.description, row.statementType, (row.amountCents / 100).toFixed(2)]);
  }
  if (result.unmappedAccounts.length > 0) {
    rows.push([]);
    rows.push(['Unmapped accounts (no GIFI code assigned)']);
    rows.push(['Account Name']);
    for (const account of result.unmappedAccounts) {
      rows.push([account.name]);
    }
  }
  return appSaveExcelFile(window, { suggestedName: `GIFI Export ${result.asOfDate}`, rows });
}


/** P&L with one column per tag in a group.
 *
 * The group is the unit, not individual tags: its tags are mutually exclusive on a line, so the
 * columns add up to the total. Untagged is shown as its own column rather than spread across the
 * others — allocating head-office rent over five stores would invent a decision nobody made.
 */
export async function reportsProfitAndLossByTag(input: unknown) {
  const { tagGroupId, periodStart, periodEnd } = input as {
    tagGroupId: number;
    periodStart: string;
    periodEnd: string;
  };

  const db = getCurrentDb();
  const [accounts, entries, group, tags, assignments] = await Promise.all([
    getAllAccounts(db),
    getAllJournalEntriesWithLines(db),
    db.selectFrom('tagGroups').selectAll().where('id', '=', tagGroupId).executeTakeFirst(),
    db.selectFrom('tags').selectAll().where('tagGroupId', '=', tagGroupId).orderBy('name').execute(),
    tagsAllLineAssignments(),
  ]);

  if (!group) throw new Error(`Tag group ${tagGroupId} not found.`);

  const tagIds = tags.map((t) => t.id);
  const tagsByLineId = new Map<number, number[]>(
    Object.entries(assignments).map(([lineId, ids]) => [Number(lineId), ids]),
  );

  const result = profitAndLossByTag(accounts, entries, tagIds, tagsByLineId, periodStart, periodEnd);

  return {
    ...result,
    groupName: group.name,
    tags: tags.map((t) => ({ id: t.id, name: t.name })),
  };
}

/** One read-only snapshot behind the CRA Audit Package and CPA Year-End reports. Keeping these
 * sections on the same ledger snapshot is deliberate: figures exported together cannot disagree
 * because one report refreshed between queries and another did not. */
export async function reportsCompliancePackage(input: unknown): Promise<CompliancePackageResult> {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries, revisions, activities, bills, vendors, invoices, customers, receiptImports, employees, payrollRuns, filings, pools, loans, shareholders, t5Payments, products, movementRows] = await Promise.all([
    getAllAccounts(db),
    getAllJournalEntriesWithLines(db),
    db.selectFrom('journalEntryRevisions').selectAll().orderBy('changedAt', 'desc').execute(),
    db.selectFrom('userActivityLog').selectAll().orderBy('changedAt', 'desc').execute(),
    db.selectFrom('bills').selectAll().execute(),
    db.selectFrom('vendors').select(['id', 'name']).execute(),
    db.selectFrom('invoices').selectAll().execute(),
    db.selectFrom('customers').select(['id', 'name']).execute(),
    db.selectFrom('receiptImports').selectAll().execute(),
    db.selectFrom('employees').select(['id', 'name']).execute(),
    db.selectFrom('payrollRuns').selectAll().execute(),
    db.selectFrom('hstFilings').selectAll().execute(),
    db.selectFrom('ccaPools').selectAll().execute(),
    db.selectFrom('loans').selectAll().execute(),
    db.selectFrom('shareholders').selectAll().execute(),
    db.selectFrom('t5Payments').selectAll().execute(),
    db.selectFrom('products').selectAll().where('trackQuantity', '=', 1).execute(),
    db.selectFrom('inventoryMovements').selectAll().execute(),
  ]);

  const periodEntries = filterEntriesByDateRange(entries, periodStart, periodEnd);
  const throughEndEntries = entries.filter((entry) => entry.entryDate <= periodEnd);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const periodBalances = computeAccountBalances(accounts, periodEntries);
  const throughEndBalances = computeAccountBalances(accounts, throughEndEntries);
  const journalAuditTrail = periodEntries.flatMap((entry) => {
    const createdBy = entry.createdBy ?? null;
    const created = [{ revisionId: -entry.id, journalEntryId: entry.id, entryDate: entry.entryDate, changedAt: entry.createdAt, action: entry.status === 'void' ? 'Created (now void)' : 'Created', field: 'entry', lineLabel: null, oldValue: null, newValue: entry.status, memo: entry.memo, createdBy }];
    const changes = revisions.filter((revision) => revision.journalEntryId === entry.id).map((revision) => ({ revisionId: revision.id, journalEntryId: entry.id, entryDate: entry.entryDate, changedAt: revision.changedAt, action: revision.label, field: revision.field, lineLabel: revision.lineLabel, oldValue: revision.oldValue, newValue: revision.newValue, memo: entry.memo, createdBy: revision.changedBy ?? createdBy }));
    return [...created, ...changes];
  });
  const activityAuditTrail = activities
    .filter((activity) => activity.changedAt.slice(0, 10) >= periodStart && activity.changedAt.slice(0, 10) <= periodEnd)
    .map((activity) => ({
      revisionId: 1_000_000_000 + activity.id,
      journalEntryId: null,
      entryDate: activity.changedAt.slice(0, 10),
      changedAt: activity.changedAt,
      action: activity.action,
      field: activity.topic,
      lineLabel: activity.targetReference,
      oldValue: null,
      newValue: activity.targetReference,
      memo: null,
      createdBy: activity.actorName,
    }));
  const auditTrail = [...journalAuditTrail, ...activityAuditTrail].sort((a, b) => b.changedAt.localeCompare(a.changedAt));

  const attachmentRows = await db.selectFrom('attachments').select(['entityType', 'entityId', 'originalName']).execute();
  const attachmentEvidence = new Map<string, string>();
  for (const row of attachmentRows) { const key = `${row.entityType}:${row.entityId}`; if (!attachmentEvidence.has(key)) attachmentEvidence.set(key, row.originalName); }
  const vendorName = new Map(vendors.map((vendor) => [vendor.id, vendor.name]));
  const customerName = new Map(customers.map((customer) => [customer.id, customer.name]));
  const importedReceiptByBill = new Map(receiptImports.filter((receipt) => receipt.billId !== null).map((receipt) => [receipt.billId!, receipt]));
  const linkedJournalIds = new Set<number>();
  for (const bill of bills) for (const id of [bill.billJournalEntryId, bill.paymentJournalEntryId]) if (id !== null) linkedJournalIds.add(id);
  for (const invoice of invoices) for (const id of [invoice.invoiceJournalEntryId, invoice.paymentJournalEntryId]) if (id !== null) linkedJournalIds.add(id);
  for (const run of payrollRuns) if (run.journalEntryId !== null) linkedJournalIds.add(run.journalEntryId);
  for (const filing of filings) if (filing.journalEntryId !== null) linkedJournalIds.add(filing.journalEntryId);
  for (const payment of t5Payments) if (payment.journalEntryId !== null) linkedJournalIds.add(payment.journalEntryId);

  const sourceDocuments: SourceDocumentReportRow[] = [];
  for (const bill of bills.filter((row) => row.billDate >= periodStart && row.billDate <= periodEnd)) {
    const imported = importedReceiptByBill.get(bill.id);
    const evidenceName = imported?.sourceFileName ?? (bill.receiptFilePath ? bill.receiptFilePath.split(/[\\/]/).pop() ?? bill.receiptFilePath : null) ?? attachmentEvidence.get(`bill:${bill.id}`) ?? null;
    sourceDocuments.push({ date: bill.billDate, kind: 'Vendor bill', documentNumber: bill.billNumber ?? 'No vendor invoice number', party: vendorName.get(bill.vendorId) ?? 'Unknown vendor', amountCents: bill.amountCents, journalEntryId: bill.billJournalEntryId, evidence: evidenceName ? 'Attached' : 'Missing', evidenceName });
  }
  for (const invoice of invoices.filter((row) => row.invoiceDate >= periodStart && row.invoiceDate <= periodEnd)) {
    sourceDocuments.push({ date: invoice.invoiceDate, kind: 'Customer invoice', documentNumber: invoice.invoiceNumber, party: customerName.get(invoice.customerId) ?? 'Unknown customer', amountCents: invoice.totalCents, journalEntryId: invoice.invoiceJournalEntryId, evidence: attachmentEvidence.has(`invoice:${invoice.id}`) ? 'Attached' : 'Generated in Apex Ledger', evidenceName: attachmentEvidence.get(`invoice:${invoice.id}`) ?? invoice.invoiceNumber });
  }
  for (const entry of periodEntries.filter((row) => row.status === 'posted' && !linkedJournalIds.has(row.id) && row.source === 'manual')) {
    sourceDocuments.push({ date: entry.entryDate, kind: 'Manual journal', documentNumber: entry.reference ?? `Journal ${entry.id}`, party: '—', amountCents: entry.lines.reduce((sum, line) => sum + line.debitCents, 0), journalEntryId: entry.id, evidence: attachmentEvidence.has(`journalEntry:${entry.id}`) ? 'Attached' : entry.sourceReference ? 'Reference only' : 'Missing', evidenceName: attachmentEvidence.get(`journalEntry:${entry.id}`) ?? entry.sourceReference });
  }
  sourceDocuments.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));

  const bankDeposits = periodEntries.flatMap((entry) => entry.status !== 'posted' ? [] : entry.lines.flatMap((line) => {
    const account = accountById.get(line.accountId);
    if (!account || line.debitCents <= line.creditCents || !(account.accountSubtype?.toLowerCase().includes('bank') || account.accountSubtype?.toLowerCase().includes('cash') || account.isTransferEligible)) return [];
    return [{ journalEntryId: entry.id, date: entry.entryDate, bankAccount: account.name, amountCents: line.debitCents - line.creditCents, memo: entry.memo, reference: entry.reference, ...classifyBankDeposit(entry, line.id, accountById) }];
  }));

  const employeeName = new Map(employees.map((employee) => [employee.id, employee.name]));
  const payrollRegister = payrollRuns.filter((run) => run.payDate >= periodStart && run.payDate <= periodEnd).map((run) => ({ payrollRunId: run.id, employee: employeeName.get(run.employeeId) ?? 'Unknown employee', periodStart: run.payPeriodStart, periodEnd: run.payPeriodEnd, payDate: run.payDate, regularHours: run.regularHours, overtimeHours: run.overtimeHours, grossPayCents: run.grossPayCents, vacationPayCents: run.vacationPayCents, cppEmployeeCents: run.cpp1EmployeeCents + run.cpp2EmployeeCents, cppEmployerCents: run.cpp1EmployerCents + run.cpp2EmployerCents, eiEmployeeCents: run.eiEmployeeCents, eiEmployerCents: run.eiEmployerCents, incomeTaxCents: run.incomeTaxCents, netPayCents: run.netPayCents, status: run.status, journalEntryId: run.journalEntryId }));

  const hst = computeHstSummary(accounts, entries, periodStart, periodEnd);
  const collectedCents = hst.byAccount.filter((row) => row.direction === 'collected').reduce((sum, row) => sum + row.hstCents, 0);
  const itcCents = hst.byAccount.filter((row) => row.direction === 'itc').reduce((sum, row) => sum + row.hstCents, 0);
  const totalRevenueCents = accounts.filter((account) => account.accountType === 'Revenue').reduce((sum, account) => sum + (periodBalances.get(account.id)?.balanceCents ?? 0), 0);
  const filed = filings.find((filing) => filing.periodStart === periodStart && filing.periodEnd === periodEnd) ?? null;
  const hstWorkingPaper = {
    boxes: [
      { box: '101', label: 'Sales and other revenue', amountCents: totalRevenueCents },
      { box: '103', label: 'GST/HST collected or collectible', amountCents: collectedCents },
      { box: '104', label: 'Adjustments to tax collected', amountCents: 0 },
      { box: '105', label: 'Total GST/HST and adjustments', amountCents: collectedCents },
      { box: '106', label: 'Input tax credits', amountCents: itcCents },
      { box: '107', label: 'ITC adjustments', amountCents: 0 },
      { box: '108', label: 'Total ITCs and adjustments', amountCents: itcCents },
      { box: '109', label: collectedCents - itcCents >= 0 ? 'Net tax payable' : 'Net refund', amountCents: collectedCents - itcCents },
    ],
    manualItemsPending: hst.manualReviewLines.filter((row) => row.manualHstCents === null).length,
    filedReturn: filed ? { filingDate: filed.filingDate, netPayableCents: filed.netPayableCents, journalEntryId: filed.journalEntryId } : null,
    categories: hst.byAccount.map((row) => ({ account: row.account.name, direction: row.direction, baseAmountCents: row.baseAmountCents, hstCents: row.hstCents })),
  };

  // Book side of the continuity: the fixed asset register with cost, depreciation and disposals in
  // the period. The CCA pools above are the tax side; an auditor reconciles the two.
  const registerRows = await db.selectFrom('fixedAssets').selectAll().execute().catch(() => []);
  const depreciationRows = await db.selectFrom('fixedAssetDepreciation').selectAll().execute().catch(() => []);
  const fixedAssetRegister = registerRows.map((a) => {
    const own = depreciationRows.filter((d) => d.assetId === a.id);
    const monthKey = (iso: string) => iso.slice(0, 7);
    const opening = own.filter((d) => d.periodMonth < monthKey(periodStart)).reduce((t, d) => t + d.amountCents, 0);
    const inPeriod = own.filter((d) => d.periodMonth >= monthKey(periodStart) && d.periodMonth <= monthKey(periodEnd)).reduce((t, d) => t + d.amountCents, 0);
    const disposedInPeriod = a.status === 'disposed' && a.disposedDate !== null && a.disposedDate >= periodStart && a.disposedDate <= periodEnd;
    const acquiredInPeriod = a.acquiredDate >= periodStart && a.acquiredDate <= periodEnd;
    return {
      name: a.name,
      ccaClass: a.ccaClass ?? null,
      acquiredDate: a.acquiredDate,
      openingCostCents: acquiredInPeriod ? 0 : a.costCents,
      additionsCents: acquiredInPeriod ? a.costCents : 0,
      disposalsCents: disposedInPeriod ? a.costCents : 0,
      openingAccumulatedCents: opening,
      depreciationCents: inPeriod,
      closingCostCents: disposedInPeriod ? 0 : a.costCents,
      closingAccumulatedCents: disposedInPeriod ? 0 : opening + inPeriod,
      closingBookValueCents: disposedInPeriod ? 0 : a.costCents - opening - inPeriod,
      proceedsCents: disposedInPeriod ? (a.proceedsCents ?? 0) : 0,
    };
  }).filter((r) => r.openingCostCents > 0 || r.additionsCents > 0 || r.disposalsCents > 0);
  const fixedAssets = pools.filter((pool) => pool.fiscalYearEnd >= periodStart && pool.fiscalYearEnd <= periodEnd).map((pool) => ({ classCode: pool.classCode, fiscalYearEnd: pool.fiscalYearEnd, openingUccCents: pool.openingUccCents, additionsCents: pool.additionsCents, dispositionsCents: pool.dispositionsCents, ccaClaimCents: pool.claimCents ?? 0, closingUccCents: closingUccCents(pool.openingUccCents, pool.additionsCents, pool.dispositionsCents, pool.claimCents ?? 0), note: pool.note }));

  const shareholdersReport = shareholders.map((shareholder) => {
    const payments = t5Payments.filter((payment) => payment.shareholderId === shareholder.id && payment.paymentDate >= periodStart && payment.paymentDate <= periodEnd);
    const loanAccount = shareholder.loanAccountId === null ? undefined : accountById.get(shareholder.loanAccountId);
    return { shareholder: shareholder.name, loanAccount: loanAccount?.name ?? null, loanBalanceCents: shareholder.loanAccountId === null ? null : (throughEndBalances.get(shareholder.loanAccountId)?.balanceCents ?? 0), eligibleDividendsCents: payments.filter((payment) => payment.paymentType === 'eligible_dividend').reduce((sum, payment) => sum + payment.amountCents, 0), nonEligibleDividendsCents: payments.filter((payment) => payment.paymentType === 'non_eligible_dividend').reduce((sum, payment) => sum + payment.amountCents, 0), interestCents: payments.filter((payment) => payment.paymentType === 'interest').reduce((sum, payment) => sum + payment.amountCents, 0), identityComplete: Boolean(shareholder.sin || shareholder.businessNumber) };
  });

  const movements: InventoryMovement[] = movementRows.map((row) => ({ id: row.id, productId: row.productId, movementDate: row.movementDate, quantityDelta: row.quantityDelta, unitCostCents: row.unitCostCents, kind: row.kind as InventoryMovement['kind'], journalEntryId: row.journalEntryId, note: row.note }));
  const asOfStatus = inventoryStatus(products.map((product) => product.id), movements, periodEnd);
  const openingDate = new Date(`${periodStart}T00:00:00Z`); openingDate.setUTCDate(openingDate.getUTCDate() - 1);
  const openingIso = openingDate.toISOString().slice(0, 10);
  const openingStatus = inventoryStatus(products.map((product) => product.id), movements, openingIso);
  const openingById = new Map(openingStatus.rows.map((row) => [row.productId, row]));
  const closingById = new Map(asOfStatus.rows.map((row) => [row.productId, row]));
  const inventory = products.map((product) => {
    const periodMovements = movementRows.filter((movement) => movement.productId === product.id && movement.movementDate >= periodStart && movement.movementDate <= periodEnd);
    const closing = closingById.get(product.id);
    return { product: product.name, sku: product.sku, openingQuantity: openingById.get(product.id)?.quantityOnHand ?? 0, quantityIn: periodMovements.filter((movement) => movement.quantityDelta > 0).reduce((sum, movement) => sum + movement.quantityDelta, 0), quantityOut: Math.abs(periodMovements.filter((movement) => movement.quantityDelta < 0).reduce((sum, movement) => sum + movement.quantityDelta, 0)), closingQuantity: closing?.quantityOnHand ?? 0, closingValueCents: closing?.totalValueCents ?? 0, wentNegative: closing?.wentNegative ?? false, unlinkedMovementCount: periodMovements.filter((movement) => movement.journalEntryId === null && movement.unitCostCents !== 0).length };
  });

  const debt = loans.map((loan) => ({ loan: loan.name, lender: loan.lender, originalPrincipalCents: loan.principalCents, linkedAccount: loan.liabilityAccountId === null ? null : (accountById.get(loan.liabilityAccountId)?.name ?? null), ledgerBalanceCents: loan.liabilityAccountId === null ? null : (throughEndBalances.get(loan.liabilityAccountId)?.balanceCents ?? 0), annualRate: loan.annualRate, startDate: loan.startDate, isActive: loan.isActive === 1 }));

  const statement = incomeStatement(accounts, entries, periodStart, periodEnd);
  const bookDepreciationCents = accounts.filter((account) => account.accountType === 'Expense' && /depreciation|amorti[sz]ation/i.test(account.name)).reduce((sum, account) => sum + (periodBalances.get(account.id)?.balanceCents ?? 0), 0);
  const ccaClaimCents = fixedAssets.reduce((sum, pool) => sum + pool.ccaClaimCents, 0);
  const preliminaryTaxableIncomeCents = statement.netIncomeCents + bookDepreciationCents - ccaClaimCents;
  const unmappedGifiAccountCount = accounts.filter((account) => !account.gifiCode && (throughEndBalances.get(account.id)?.balanceCents ?? 0) !== 0).length;
  const t2Reconciliation = { lines: [{ label: 'Accounting net income', amountCents: statement.netIncomeCents, treatment: 'starting' as const }, { label: 'Add back: book depreciation/amortization', amountCents: bookDepreciationCents, treatment: 'add' as const }, { label: 'Deduct: CCA claimed', amountCents: ccaClaimCents, treatment: 'deduct' as const }, { label: 'Preliminary income for tax review', amountCents: preliminaryTaxableIncomeCents, treatment: 'result' as const }], preliminaryTaxableIncomeCents, unmappedGifiAccountCount, warning: 'Preliminary working paper only. The responsible tax preparer must add all other Schedule 1 adjustments, losses, donations and tax-specific deductions before filing.' };

  return { periodStart, periodEnd, auditTrail, sourceDocuments, bankDeposits, payrollRegister, hstWorkingPaper, fixedAssets, fixedAssetRegister, shareholders: shareholdersReport, inventory, debt, t2Reconciliation };
}
