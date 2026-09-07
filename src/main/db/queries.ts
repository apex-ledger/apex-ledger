import type { Account, BankImportExclusion, BankImportRowProgress, BankReconciliation, Bill, BillLine, Contact, Deposit, Employee, FiscalPeriod, GifiCode, Invoice, InvoiceLine, JournalEntry, JournalEntryLine, PayrollRun, SalesReceipt, SalesReceiptLine, Shareholder, T5Payment } from '@shared/domain/types';
import type { PayrollYtdTotals } from '@shared/domain/payroll/calculatePay';
import type { AppDb } from './schema';
import {
  mapAccountRow,
  mapBankImportExclusionRow,
  mapBankImportRowProgressRow,
  mapBankReconciliationRow,
  mapBillLineRow,
  mapBillRow,
  mapContactRow,
  mapDepositRow,
  mapEmployeeRow,
  mapFiscalPeriodRow,
  mapGifiCodeRow,
  mapInvoiceLineRow,
  mapInvoiceRow,
  mapJournalEntryLineRow,
  mapJournalEntryRow,
  mapPayrollRunRow,
  mapSalesReceiptLineRow,
  mapSalesReceiptRow,
  mapShareholderRow,
  mapT5PaymentRow,
} from './mappers';

export async function getAllAccounts(db: AppDb): Promise<Account[]> {
  const rows = await db.selectFrom('accounts').selectAll().orderBy('code').execute();
  return rows.map(mapAccountRow);
}

export async function getAllGifiCodes(db: AppDb): Promise<GifiCode[]> {
  const rows = await db.selectFrom('gifiCodes').selectAll().orderBy('code').execute();
  return rows.map(mapGifiCodeRow);
}

export async function getAllFiscalPeriods(db: AppDb): Promise<FiscalPeriod[]> {
  const rows = await db.selectFrom('fiscalPeriods').selectAll().orderBy('periodStart').execute();
  return rows.map(mapFiscalPeriodRow);
}

/**
 * Loads every journal entry with its lines attached. Report generation (trial balance, GL,
 * income statement, balance sheet, GIFI export) all run against this same in-memory snapshot,
 * so a screen and its CSV export can never disagree.
 */
export async function getAllJournalEntriesWithLines(db: AppDb): Promise<JournalEntry[]> {
  const entryRows = await db.selectFrom('journalEntries').selectAll().orderBy('entryDate').execute();
  const lineRows = await db.selectFrom('journalEntryLines').selectAll().orderBy('lineOrder').execute();

  const linesByEntry = new Map<number, JournalEntryLine[]>();
  for (const lineRow of lineRows) {
    const list = linesByEntry.get(lineRow.journalEntryId) ?? [];
    list.push(mapJournalEntryLineRow(lineRow));
    linesByEntry.set(lineRow.journalEntryId, list);
  }

  return entryRows.map((row) => mapJournalEntryRow(row, linesByEntry.get(row.id) ?? []));
}

export async function getJournalEntryById(db: AppDb, id: number): Promise<JournalEntry | undefined> {
  const entryRow = await db.selectFrom('journalEntries').selectAll().where('id', '=', id).executeTakeFirst();
  if (!entryRow) return undefined;
  const lineRows = await db
    .selectFrom('journalEntryLines')
    .selectAll()
    .where('journalEntryId', '=', id)
    .orderBy('lineOrder')
    .execute();
  return mapJournalEntryRow(entryRow, lineRows.map(mapJournalEntryLineRow));
}

export async function getAllEmployees(db: AppDb): Promise<Employee[]> {
  const rows = await db.selectFrom('employees').selectAll().orderBy('name').execute();
  return rows.map(mapEmployeeRow);
}

export async function getEmployeeById(db: AppDb, id: number): Promise<Employee | undefined> {
  const row = await db.selectFrom('employees').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? mapEmployeeRow(row) : undefined;
}

export async function getAllPayrollRuns(db: AppDb, employeeId?: number): Promise<PayrollRun[]> {
  let query = db.selectFrom('payrollRuns').selectAll().orderBy('payDate', 'desc').orderBy('id', 'desc');
  if (employeeId !== undefined) query = query.where('employeeId', '=', employeeId);
  const rows = await query.execute();
  return rows.map(mapPayrollRunRow);
}

export async function getPayrollRunById(db: AppDb, id: number): Promise<PayrollRun | undefined> {
  const row = await db.selectFrom('payrollRuns').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? mapPayrollRunRow(row) : undefined;
}

/**
 * Sums every POSTED pay run for this employee earlier in the same calendar year, so a new run's
 * CPP/EI calculation correctly tapers off near the annual maximums instead of restarting from
 * zero on every pay period. Draft runs are excluded since they may still be edited or discarded.
 */
export async function getYtdPayrollTotals(db: AppDb, employeeId: number, payPeriodStart: string): Promise<PayrollYtdTotals> {
  const year = payPeriodStart.slice(0, 4);
  const rows = await db
    .selectFrom('payrollRuns')
    .select(['grossPayCents', 'vacationPayCents', 'rrspEmployerMatchCents', 'cpp1EmployeeCents', 'cpp2EmployeeCents', 'eiEmployeeCents'])
    .where('employeeId', '=', employeeId)
    .where('status', '=', 'posted')
    .where('payPeriodStart', '>=', `${year}-01-01`)
    .where('payPeriodStart', '<', payPeriodStart)
    .execute();

  return rows.reduce<PayrollYtdTotals>(
    (acc, row) => ({
      pensionableInsurableEarningsCents:
        acc.pensionableInsurableEarningsCents + row.grossPayCents + row.vacationPayCents + row.rrspEmployerMatchCents,
      cpp1EmployeeCents: acc.cpp1EmployeeCents + row.cpp1EmployeeCents,
      cpp2EmployeeCents: acc.cpp2EmployeeCents + row.cpp2EmployeeCents,
      eiEmployeeCents: acc.eiEmployeeCents + row.eiEmployeeCents,
    }),
    { pensionableInsurableEarningsCents: 0, cpp1EmployeeCents: 0, cpp2EmployeeCents: 0, eiEmployeeCents: 0 },
  );
}

export async function getAllShareholders(db: AppDb): Promise<Shareholder[]> {
  const rows = await db.selectFrom('shareholders').selectAll().orderBy('name').execute();
  return rows.map(mapShareholderRow);
}

export async function getShareholderById(db: AppDb, id: number): Promise<Shareholder | undefined> {
  const row = await db.selectFrom('shareholders').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? mapShareholderRow(row) : undefined;
}

export async function getAllT5Payments(db: AppDb, shareholderId?: number): Promise<T5Payment[]> {
  let query = db.selectFrom('t5Payments').selectAll().orderBy('paymentDate', 'desc').orderBy('id', 'desc');
  if (shareholderId !== undefined) query = query.where('shareholderId', '=', shareholderId);
  const rows = await query.execute();
  return rows.map(mapT5PaymentRow);
}

export async function getAllCustomers(db: AppDb): Promise<Contact[]> {
  const rows = await db.selectFrom('customers').selectAll().orderBy('name').execute();
  return rows.map(mapContactRow);
}

export async function getAllVendors(db: AppDb): Promise<Contact[]> {
  const rows = await db.selectFrom('vendors').selectAll().orderBy('name').execute();
  return rows.map(mapContactRow);
}

/** Every bill with its lines attached, in two queries rather than one per bill. */
export async function getAllBills(db: AppDb): Promise<Bill[]> {
  const rows = await db.selectFrom('bills').selectAll().orderBy('billDate', 'desc').orderBy('id', 'desc').execute();
  const lineRows = await db.selectFrom('billLines').selectAll().orderBy('lineOrder').execute();
  const linesByBill = new Map<number, BillLine[]>();
  for (const lineRow of lineRows) {
    const list = linesByBill.get(lineRow.billId) ?? [];
    list.push(mapBillLineRow(lineRow));
    linesByBill.set(lineRow.billId, list);
  }
  return rows.map((row) => mapBillRow(row, linesByBill.get(row.id) ?? []));
}

export async function getBillById(db: AppDb, id: number): Promise<Bill | undefined> {
  const row = await db.selectFrom('bills').selectAll().where('id', '=', id).executeTakeFirst();
  if (!row) return undefined;
  const lineRows = await db.selectFrom('billLines').selectAll().where('billId', '=', id).orderBy('lineOrder').execute();
  return mapBillRow(row, lineRows.map(mapBillLineRow));
}

/** Loads every invoice with its line items attached, mirroring getAllJournalEntriesWithLines so
 * list and edit views can never see a header/lines mismatch. */
export async function getAllInvoices(db: AppDb): Promise<Invoice[]> {
  const invoiceRows = await db.selectFrom('invoices').selectAll().orderBy('invoiceDate', 'desc').orderBy('id', 'desc').execute();
  const lineRows = await db.selectFrom('invoiceLines').selectAll().orderBy('lineOrder').execute();

  const linesByInvoice = new Map<number, InvoiceLine[]>();
  for (const lineRow of lineRows) {
    const list = linesByInvoice.get(lineRow.invoiceId) ?? [];
    list.push(mapInvoiceLineRow(lineRow));
    linesByInvoice.set(lineRow.invoiceId, list);
  }

  return invoiceRows.map((row) => mapInvoiceRow(row, linesByInvoice.get(row.id) ?? []));
}

export async function getInvoiceById(db: AppDb, id: number): Promise<Invoice | undefined> {
  const row = await db.selectFrom('invoices').selectAll().where('id', '=', id).executeTakeFirst();
  if (!row) return undefined;
  const lineRows = await db.selectFrom('invoiceLines').selectAll().where('invoiceId', '=', id).orderBy('lineOrder').execute();
  return mapInvoiceRow(row, lineRows.map(mapInvoiceLineRow));
}

export async function getAllSalesReceipts(db: AppDb): Promise<SalesReceipt[]> {
  const receiptRows = await db.selectFrom('salesReceipts').selectAll().orderBy('receiptDate', 'desc').orderBy('id', 'desc').execute();
  const lineRows = await db.selectFrom('salesReceiptLines').selectAll().orderBy('lineOrder').execute();

  const linesByReceipt = new Map<number, SalesReceiptLine[]>();
  for (const lineRow of lineRows) {
    const list = linesByReceipt.get(lineRow.salesReceiptId) ?? [];
    list.push(mapSalesReceiptLineRow(lineRow));
    linesByReceipt.set(lineRow.salesReceiptId, list);
  }

  return receiptRows.map((row) => mapSalesReceiptRow(row, linesByReceipt.get(row.id) ?? []));
}

export async function getSalesReceiptById(db: AppDb, id: number): Promise<SalesReceipt | undefined> {
  const row = await db.selectFrom('salesReceipts').selectAll().where('id', '=', id).executeTakeFirst();
  if (!row) return undefined;
  const lineRows = await db.selectFrom('salesReceiptLines').selectAll().where('salesReceiptId', '=', id).orderBy('lineOrder').execute();
  return mapSalesReceiptRow(row, lineRows.map(mapSalesReceiptLineRow));
}

export async function getBankImportExclusions(db: AppDb, accountId: number): Promise<BankImportExclusion[]> {
  const rows = await db.selectFrom('bankImportExclusions').selectAll().where('accountId', '=', accountId).execute();
  return rows.map(mapBankImportExclusionRow);
}

export async function getBankImportRowProgress(db: AppDb, accountId: number): Promise<BankImportRowProgress[]> {
  const rows = await db.selectFrom('bankImportRowProgress').selectAll().where('accountId', '=', accountId).execute();
  return rows.map(mapBankImportRowProgressRow);
}

export async function getAllDeposits(db: AppDb): Promise<Deposit[]> {
  const rows = await db.selectFrom('deposits').selectAll().orderBy('depositDate', 'desc').orderBy('id', 'desc').execute();
  return rows.map(mapDepositRow);
}

export async function getAllBankReconciliations(db: AppDb, accountId?: number): Promise<BankReconciliation[]> {
  let query = db.selectFrom('bankReconciliations').selectAll().orderBy('statementDate', 'desc').orderBy('id', 'desc');
  if (accountId !== undefined) query = query.where('accountId', '=', accountId);
  const rows = await query.execute();
  return rows.map(mapBankReconciliationRow);
}

export async function getBankReconciliationById(db: AppDb, id: number): Promise<BankReconciliation | undefined> {
  const row = await db.selectFrom('bankReconciliations').selectAll().where('id', '=', id).executeTakeFirst();
  return row ? mapBankReconciliationRow(row) : undefined;
}

export async function getLatestCompletedReconciliation(db: AppDb, accountId: number): Promise<BankReconciliation | undefined> {
  const row = await db
    .selectFrom('bankReconciliations')
    .selectAll()
    .where('accountId', '=', accountId)
    .where('status', '=', 'completed')
    .orderBy('statementDate', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst();
  return row ? mapBankReconciliationRow(row) : undefined;
}

export interface ReconciliationCandidateLine {
  line: JournalEntryLine;
  entryDate: string;
  /** When the entry was keyed in (stored UTC) — the Entered column beside Date. */
  createdAt: string;
  memo: string | null;
  journalEntryId: number;
}

/** Every POSTED, not-yet-cleared line on this account up to (and including) the statement date —
 * the checklist a reconciliation is built from. Reuses getAllJournalEntriesWithLines rather than a
 * raw SQL join, matching how journalList's accountId filter already works. */
export async function getUnclearedPostedLinesForAccount(db: AppDb, accountId: number, throughDate: string): Promise<ReconciliationCandidateLine[]> {
  const entries = await getAllJournalEntriesWithLines(db);
  const result: ReconciliationCandidateLine[] = [];
  for (const entry of entries) {
    if (entry.status !== 'posted' || entry.entryDate > throughDate) continue;
    for (const line of entry.lines) {
      if (line.accountId === accountId && line.clearedAt === null) {
        result.push({ line, entryDate: entry.entryDate, createdAt: entry.createdAt, memo: line.description ?? entry.memo, journalEntryId: entry.id });
      }
    }
  }
  return result.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.line.id - b.line.id);
}

/** Every line already cleared against a specific reconciliation (including a completed one),
 * regardless of statement date — used to redisplay a reconciliation's own checklist state. */
export async function getClearedLinesForReconciliation(db: AppDb, reconciliationId: number): Promise<ReconciliationCandidateLine[]> {
  const entries = await getAllJournalEntriesWithLines(db);
  const result: ReconciliationCandidateLine[] = [];
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.reconciliationId === reconciliationId) {
        result.push({ line, entryDate: entry.entryDate, createdAt: entry.createdAt, memo: line.description ?? entry.memo, journalEntryId: entry.id });
      }
    }
  }
  return result.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.line.id - b.line.id);
}

export interface YtdPaystubTotals {
  grossPayCents: number;
  cppEmployeeCents: number;
  eiEmployeeCents: number;
  incomeTaxCents: number;
  netPayCents: number;
}

/** Year-to-date totals for the paystub's YTD column — accumulated by PAY DATE (not period-start),
 * matching how a real paystub's YTD figures build up, and covering fields calculatePay's own
 * PayrollYtdTotals doesn't track (income tax, net pay). */
export async function getYtdPaystubTotals(db: AppDb, employeeId: number, throughPayDate: string): Promise<YtdPaystubTotals> {
  const year = throughPayDate.slice(0, 4);
  const rows = await db
    .selectFrom('payrollRuns')
    .select(['grossPayCents', 'vacationPayCents', 'cpp1EmployeeCents', 'cpp2EmployeeCents', 'eiEmployeeCents', 'incomeTaxCents', 'netPayCents'])
    .where('employeeId', '=', employeeId)
    .where('status', '=', 'posted')
    .where('payDate', '>=', `${year}-01-01`)
    .where('payDate', '<=', throughPayDate)
    .execute();

  return rows.reduce<YtdPaystubTotals>(
    (acc, r) => ({
      grossPayCents: acc.grossPayCents + r.grossPayCents + r.vacationPayCents,
      cppEmployeeCents: acc.cppEmployeeCents + r.cpp1EmployeeCents + r.cpp2EmployeeCents,
      eiEmployeeCents: acc.eiEmployeeCents + r.eiEmployeeCents,
      incomeTaxCents: acc.incomeTaxCents + r.incomeTaxCents,
      netPayCents: acc.netPayCents + r.netPayCents,
    }),
    { grossPayCents: 0, cppEmployeeCents: 0, eiEmployeeCents: 0, incomeTaxCents: 0, netPayCents: 0 },
  );
}
