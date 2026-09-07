/** Year-End Sign-off: gathers every record the clipboard judges, runs the checks, and keeps the
 * reviewer's decision on the company file so the next person sees who signed and when. */
import { z } from 'zod';
import { periodReportQuerySchema } from '@shared/validation/schemas';
import { runYearEndSignoff, type YearEndSignoffReport } from '@shared/domain/audit/yearEndSignoff';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { getCurrentDb } from '../companyFile';
import { getAllAccounts, getAllBankReconciliations, getAllBills, getAllCustomers, getAllFiscalPeriods, getAllInvoices, getAllJournalEntriesWithLines, getAllPayrollRuns, getAllVendors } from '../db/queries';
import { getAccessIdentity } from '../accessSession';
import { companyGet } from './company.handlers';
import { hstFilingsList } from './hstFilings.handlers';
import { inventoryStatusReport } from './inventory.handlers';
import { reportsAuditExceptions } from './reports.handlers';
import { salesReceiptsUndepositedFundsAccountId } from './salesReceipts.handlers';

export interface YearEndSignoffRecord {
  id: number;
  periodStart: string;
  periodEnd: string;
  reviewer: string;
  decision: 'ready' | 'readyWithNotes' | 'notReady';
  greenCount: number;
  amberCount: number;
  redCount: number;
  note: string | null;
  signedAt: string;
}

export async function yearEndSignoffReport(input: unknown): Promise<YearEndSignoffReport> {
  const { periodStart, periodEnd } = periodReportQuerySchema.parse(input);
  const db = getCurrentDb();
  const [accounts, entries, invoices, bills, fiscalPeriods, reconciliations, hstFilings, payrollRuns, customers, vendors, company, undepositedFundsAccountId, stock, auditExceptions] = await Promise.all([
    getAllAccounts(db), getAllJournalEntriesWithLines(db), getAllInvoices(db), getAllBills(db), getAllFiscalPeriods(db), getAllBankReconciliations(db), hstFilingsList(), getAllPayrollRuns(db), getAllCustomers(db), getAllVendors(db), companyGet(), salesReceiptsUndepositedFundsAccountId(), inventoryStatusReport({ asOfDate: periodEnd }), reportsAuditExceptions({ periodStart, periodEnd }),
  ]);
  return runYearEndSignoff({
    periodStart, periodEnd, today: localIsoDate(), accounts, entries, invoices, bills, fiscalPeriods, reconciliations, hstFilings,
    hstFilingFrequency: company.hstFilingFrequency ?? 'Quarterly',
    payrollRuns, undepositedFundsAccountId,
    inventory: stock.rows.map((r) => ({ name: r.name, quantityOnHand: r.quantityOnHand })),
    vendorNames: vendors.filter((v) => v.isActive).map((v) => v.name),
    customerNames: customers.filter((c) => c.isActive).map((c) => c.name),
    auditExceptions,
  });
}

const signSchema = periodReportQuerySchema.extend({
  reviewer: z.string().trim().min(1).max(200).optional(),
  note: z.string().trim().max(2000).nullable().optional().default(null),
});

/** Records the decision the checks produced at this moment, under the reviewer's name. The lights
 * are recomputed here rather than trusted from the screen, so a stale page cannot sign a period
 * that has changed underneath it. */
export async function yearEndSignoffSign(input: unknown): Promise<YearEndSignoffRecord> {
  const payload = signSchema.parse(input);
  const report = await yearEndSignoffReport({ periodStart: payload.periodStart, periodEnd: payload.periodEnd });
  const reviewer = payload.reviewer ?? getAccessIdentity().name;
  const db = getCurrentDb();
  const row = await db
    .insertInto('yearEndSignoffs')
    .values({ periodStart: payload.periodStart, periodEnd: payload.periodEnd, reviewer, decision: report.decision, greenCount: report.counts.green, amberCount: report.counts.amber, redCount: report.counts.red, note: payload.note })
    .returningAll()
    .executeTakeFirstOrThrow();
  return row as YearEndSignoffRecord;
}

export async function yearEndSignoffHistory(): Promise<YearEndSignoffRecord[]> {
  const db = getCurrentDb();
  const rows = await db.selectFrom('yearEndSignoffs').selectAll().orderBy('signedAt', 'desc').orderBy('id', 'desc').execute();
  return rows as YearEndSignoffRecord[];
}
