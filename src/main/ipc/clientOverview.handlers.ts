import { getCurrentDb } from '../companyFile';
import { getAllAccounts, getAllJournalEntriesWithLines } from '../db/queries';
import { computeHstSummary } from '@shared/domain/ledger/hstSummary';
import { bankingActivity, commonIssues, type BankingActivityRow, type OverviewIssue } from '@shared/domain/review/clientOverview';
import { companyGet } from './company.handlers';
import { invoicesList } from './invoices.handlers';
import { billsList } from './bills.handlers';
import { hstFilingsList } from './hstFilings.handlers';
import { receiptInboxList } from './receiptInbox.handlers';
import { localIsoDate } from '@shared/domain/dates/localDate';

export interface ClientOverview {
  asOf: string;
  setup: {
    legalName: string;
    businessType: string | null;
    fiscalYearEnd: string;
    province: string | null;
    hstNumber: string | null;
    businessNumber: string | null;
    accountCount: number;
    firstEntryDate: string | null;
    lastEntryDate: string | null;
    postedEntryCount: number;
  };
  banking: BankingActivityRow[];
  issues: OverviewIssue[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function quarterBounds(period: string): { start: string; end: string } | null {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!match) return null;
  const year = Number(match[1]);
  const q = Number(match[2]);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const endDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return { start: `${year}-${String(startMonth).padStart(2, '0')}-01`, end: `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}` };
}

/** Everything an accountant checks first on a client file, computed from the books as they stand. */
export async function clientOverviewGet(input?: unknown): Promise<ClientOverview> {
  const { asOf: requested } = (input ?? {}) as { asOf?: string };
  const asOf = requested ?? localIsoDate();
  const db = getCurrentDb();
  const [company, accounts, entries, reconciliations, invoices, bills, filings, receipts] = await Promise.all([
    companyGet(),
    getAllAccounts(db),
    getAllJournalEntriesWithLines(db),
    db.selectFrom('bankReconciliations').select(['accountId', 'statementDate', 'status']).execute(),
    invoicesList(),
    billsList(),
    hstFilingsList(),
    receiptInboxList().catch(() => []),
  ]);

  const posted = entries.filter((entry) => entry.status === 'posted' && entry.entryDate <= asOf);
  const dates = posted.map((entry) => entry.entryDate).sort();

  // GST/HST periods with activity that no filing covers, leaving out the quarter still running.
  const summary = computeHstSummary(accounts, entries, '1900-01-01', asOf);
  const unfiledPeriods = summary.quarterly
    .filter((quarter) => quarter.collectedCents !== 0 || quarter.itcCents !== 0)
    .map((quarter) => ({ quarter, bounds: quarterBounds(quarter.period) }))
    .filter(({ bounds }) => bounds !== null && bounds.end < asOf)
    .filter(({ bounds }) => !filings.some((filing) => filing.periodStart <= bounds!.start && filing.periodEnd >= bounds!.end))
    .map(({ quarter }) => ({ period: quarter.period, netCents: quarter.collectedCents - quarter.itcCents }));

  const overviewAccounts = accounts.map((account) => ({ id: account.id, name: account.name, accountType: account.accountType, accountSubtype: account.accountSubtype, isActive: account.isActive }));
  const overviewEntries = entries.map((entry) => ({ entryDate: entry.entryDate, status: entry.status, lines: entry.lines.map((line) => ({ accountId: line.accountId, debitCents: line.debitCents, creditCents: line.creditCents, reconciliationId: line.reconciliationId })) }));

  const issuesInput = {
    accounts: overviewAccounts,
    entries: overviewEntries,
    reconciliations,
    openInvoices: invoices.filter((invoice) => invoice.balanceDueCents > 0).map((invoice) => ({ dueDate: invoice.dueDate, balanceDueCents: invoice.balanceDueCents })),
    openBills: bills.filter((bill) => bill.balanceDueCents > 0).map((bill) => ({ dueDate: bill.dueDate, balanceDueCents: bill.balanceDueCents })),
    draftJournalCount: entries.filter((entry) => entry.status === 'draft').length,
    receiptsWaiting: receipts.length,
    unfiledPeriods,
    asOf,
  };

  return {
    asOf,
    setup: {
      legalName: company.displayName ?? company.legalName,
      businessType: company.businessType,
      fiscalYearEnd: `${MONTHS[company.fiscalYearEndMonth - 1] ?? company.fiscalYearEndMonth} ${company.fiscalYearEndDay}`,
      province: company.businessProvince,
      hstNumber: company.hstNumber,
      businessNumber: company.businessNumber,
      accountCount: accounts.filter((account) => account.isActive).length,
      firstEntryDate: dates[0] ?? null,
      lastEntryDate: dates[dates.length - 1] ?? null,
      postedEntryCount: posted.length,
    },
    banking: bankingActivity(overviewAccounts, overviewEntries, reconciliations, asOf),
    issues: commonIssues(issuesInput),
  };
}
