import { useState, useEffect } from 'react';
import { useUiStore } from '../../app/store/uiStore';
import { HubCard } from '../../components/HubCard';
import type { ReportKind } from '../../app/store/uiStore';
import type { HubTone } from '../../components/HubCard';
import { FORM_TEMPLATES } from '@shared/domain/forms/formTemplates';
import { loadFavouritePages, toggleFavouritePage, type FavouritePage } from '../../utils/favouritePages';

/** Reports grouped the way an accountant asks for them, rather than one flat grid — the same
 * shape QuickBooks uses (who owes you / whom you owe / sales / expenses / for my accountant), because that is
 * the vocabulary clients already have. Inventory is deliberately present but empty: this app has
 * no stock model, and a heading that quietly disappears is more confusing than one that says why
 * there is nothing under it. */

interface Entry {
  /** Other cuts of the same report, offered as small links under the card instead of separate cards. */
  variants?: Array<{ label: string; report: ReportKind }>;
  title: string;
  description: string;
  tone: HubTone;
  report: ReportKind;
}

interface Group {
  heading: string;
  blurb: string;
  entries: Entry[];
  /** Shown instead of cards when the app has no data model behind the group at all. */
  unavailable?: string;
}

/* Order matters: "For my accountant" leads because the statements are what gets reached for most,
 * and at year end almost exclusively. Inventory sits last — it is the one group with nothing behind
 * it, so it explains itself out of the way rather than interrupting the list. */
export const REPORT_GROUPS: Group[] = [
  {
    heading: 'Comprehensive & custom',
    blurb: 'The complete company package on one exportable sheet, with columns you choose.',
    entries: [
      { title: 'Comprehensive Company Report', description: 'Financial statements, tax, payroll, evidence, continuity and customizable transaction columns in one Excel sheet.', tone: 'brand', report: 'comprehensiveCompany' },
      { title: 'Customizable Transaction Detail', description: 'Every posted journal line with the columns you choose, saved as your layout, and one click back to the entry behind each line.', tone: 'sky', report: 'customTransactionDetail' },
    ],
  },
  {
    heading: 'Audit exceptions',
    blurb: 'The tests an auditor runs first — run them yourself before they do.',
    entries: [
      { title: 'Year-End Sign-off', description: 'Every check on one clipboard with a traffic light, and the final decision recorded under the reviewer’s name.', tone: 'emerald', report: 'yearEndSignoff' },
      { title: 'Activity Log', description: 'Who changed what and when, for every save in this company file — the list an auditor asks for.', tone: 'rose', report: 'activityLog' },
      { title: 'Audit Exceptions', description: 'Control-account mismatches, suspense balances, entries after lock, backdating, manual cash or revenue entries, round and weekend amounts, missing support, duplicates, number gaps, voids and stale items — each with the rows to open.', tone: 'rose', report: 'auditExceptions' },
    ],
  },
  {
    heading: 'CRA audit package',
    blurb: 'Trace the filed numbers back to bank activity, payroll and source evidence.',
    entries: [
      { title: 'Audit Trail / Change History', description: 'Creation and before/after revisions for journal entries, with GL drill-back.', tone: 'rose', report: 'auditTrail' },
      { title: 'Source Documents & Missing Evidence', description: 'Invoices, bills and manual journals with attached, generated or missing support.', tone: 'amber', report: 'sourceDocuments' },
      { title: 'Bank Deposit Analysis', description: 'Every deposit classified as sales, transfer, borrowing or contribution; ambiguous deposits flagged.', tone: 'sky', report: 'bankDepositAnalysis' },
      { title: 'Payroll Register & Remittance Detail', description: 'Gross pay, CPP, EI, income tax, employer portions, net pay and GL posting by employee.', tone: 'violet', report: 'payrollRegister' },
      { title: 'GST/HST Return Working Paper', description: 'CRA return lines 101–109, category support, manual exceptions and filed-return tie-out.', tone: 'emerald', report: 'hstWorkingPaper' },
    ],
  },
  {
    heading: 'CPA year-end continuity',
    blurb: 'The supporting schedules that roll opening balances and activity into year-end balances.',
    entries: [
      { title: 'Fixed Asset / CCA Continuity', description: 'Opening UCC, additions, dispositions, claim and closing UCC by class.', tone: 'teal', report: 'fixedAssetContinuity' },
      { title: 'Shareholder & Related-Party Continuity', description: 'Loan balances, dividends, interest and missing shareholder identity details.', tone: 'violet', report: 'shareholderContinuity' },
      { title: 'Inventory Movement & Valuation', description: 'Opening quantity, receipts, issues, closing quantity/value and stock exceptions.', tone: 'emerald', report: 'inventoryContinuity' },
      { title: 'Debt Continuity', description: 'Loan terms and principal compared with each linked liability-account balance.', tone: 'sky', report: 'debtContinuity' },
      { title: 'T2 Preliminary Tax Reconciliation', description: 'Accounting income, depreciation add-back, CCA deduction and missing GIFI mappings.', tone: 'amber', report: 't2Reconciliation' },
    ],
  },
  {
    heading: 'For my accountant',
    blurb: 'The statements and listings handed over at year end.',
    entries: [
      { title: 'Trial Balance', description: 'Every account balance, debits and credits in agreement.', tone: 'sky', report: 'trialBalance' },
      { title: 'Working Trial Balance', description: 'Opening, movement, your adjustments and closing — the sheet a year is closed from.', tone: 'sky', report: 'workingTrialBalance' },
      { title: 'Loan Schedule', description: 'Each payment split into interest and principal, so only the interest is expensed.', tone: 'teal', report: 'loanSchedule' },
      { title: 'Reconciliation Report', description: 'The page that proves the bank and the books agree, with what is still outstanding.', tone: 'sky', report: 'reconciliationReport' },
      { title: 'Balance Sheet', description: 'Assets, liabilities, and equity as of a date. Compare two dates from the report itself.', tone: 'violet', report: 'balanceSheet', variants: [{ label: 'Summary', report: 'balanceSheetSummary' }, { label: 'Detail', report: 'balanceSheetDetail' }, { label: 'Two dates side by side', report: 'balanceSheetComparison' }] },
      { title: 'Statement of Cash Flows', description: 'Where the money came from and went, reconciled to the bank. Indirect method.', tone: 'teal', report: 'cashFlow' },
      { title: 'Statement of Changes in Equity', description: 'Opening equity, what moved during the period, and closing equity.', tone: 'amber', report: 'changesInEquity' },
      { title: 'Adjusting Entries', description: 'Every correction made to client-supplied data — what changed, from what, to what.', tone: 'rose', report: 'adjustingEntries' },
      { title: 'Profit and Loss', description: 'Revenue, expenses, and net income for a period. Compare periods, accrual or cash basis, from the report itself.', tone: 'amber', report: 'incomeStatement', variants: [{ label: 'Every transaction behind each account', report: 'profitAndLossDetail' }] },
      { title: 'Journal', description: 'Every transaction in the period with both sides shown, or one line each.', tone: 'sky', report: 'journalReport' },
      { title: 'Cheque Register', description: 'Every cheque in number order, and the gaps where one is missing.', tone: 'amber', report: 'chequeRegister' },
      { title: 'General Ledger', description: 'Full transaction history and running balance for one account.', tone: 'emerald', report: 'generalLedger' },
      { title: 'Invalid Transactions', description: 'Entries that cannot be right — unbalanced, one-sided, or missing an account.', tone: 'rose', report: 'invalidTransactions' },
      { title: 'Account List', description: 'The full chart of accounts with GIFI codes, grouped by type.', tone: 'sky', report: 'accountList' },
    ],
  },
  {
    heading: 'Who owes you (A/R)',
    blurb: 'Money invoiced but not yet collected.',
    entries: [
      { title: 'Accounts Receivable Ageing', description: 'Unpaid invoices bucketed 30/60/90 days past due, by customer.', tone: 'rose', report: 'agingReceivable' },
      { title: 'Customer Statement', description: "One customer's account as they see it — the document you send them.", tone: 'teal', report: 'customerStatement' },
    ],
  },
  {
    heading: 'Whom we owe (A/P)',
    blurb: 'Money owed to vendors but not yet paid.',
    entries: [
      { title: 'Accounts Payable Ageing', description: 'Unpaid bills bucketed 30/60/90 days past due, by vendor.', tone: 'amber', report: 'agingPayable' },
    ],
  },
  {
    heading: 'Sales and customers',
    blurb: 'What was sold, and to whom.',
    entries: [
      { title: 'Sales by Customer', description: 'Invoiced and receipted sales totalled per customer for a period.', tone: 'emerald', report: 'salesByCustomer' },
      { title: 'P&L by Customer', description: 'Posted revenue and any directly-tagged cost, per customer.', tone: 'teal', report: 'profitAndLossByCustomer' },
      { title: 'P&L by Period', description: 'Profit and loss by month, by quarter, as a % of income, or year to date against last year.', tone: 'brand', report: 'periodStatements' },
    ],
  },
  {
    heading: 'Expenses and vendors',
    blurb: 'What was bought and how vendor spending is managed.',
    entries: [
      { title: 'Expenses by Vendor', description: 'Total spend with each vendor for a period, and what it went on.', tone: 'rose', report: 'expensesByVendor' },
      { title: 'Bill Approval Status', description: 'What is waiting on a decision, how long it has waited, and anything paid without one.', tone: 'amber', report: 'billApproval' },
    ],
  },
  {
    heading: 'Payroll',
    blurb: 'Pay history by employee, ready for T4, ROE and CRA questions.',
    entries: [
      { title: 'Employee Earnings Record', description: 'Each employee run by run with year-to-date beside it, payroll items, employer cost and vacation owing — the sheet a T4, ROE or CRA query is checked against.', tone: 'violet', report: 'employeeEarnings' },
    ],
  },
  {
    heading: 'Analysis',
    blurb: 'Trend and outlook, rather than statutory statements.',
    entries: [
      { title: 'Budget vs Actual', description: 'What you planned against what happened, with favourable and unfavourable marked.', tone: 'brand', report: 'budgetVsActual' },
      { title: 'P&L by Tag Group', description: 'Profit and loss with a column per tag — by store, job or vehicle — plus untagged shown separately.', tone: 'violet', report: 'profitAndLossByTag' },
      { title: 'Business Snapshot', description: 'Revenue, profit, position and cash on one page, each figure linking to its report.', tone: 'brand', report: 'businessSnapshot' },
      { title: 'Business Performance', description: "Quarter/half/year growth analysis — is the business up or down, and what's driving it.", tone: 'teal', report: 'businessPerformance' },
      { title: 'Projections', description: 'Trailing average revenue/expense trend with a simple forward estimate.', tone: 'cyan', report: 'projections' },
    ],
  },
  {
    heading: 'Inventory',
    blurb: 'Stock on hand and what it is worth.',
    entries: [
      { title: 'Inventory Status', description: 'Quantity and value of every tracked product, as of any date.', tone: 'emerald', report: 'inventoryStatus' },
    ],
  },
];

/* Class strings in full, not composed from a template, so Tailwind's JIT scanner can find them —
 * same reason as the note in Sidebar.tsx. */
const GROUP_TINTS: { rest: string; active: string }[] = [
  { rest: 'bg-sky-50 text-sky-800 hover:bg-sky-100', active: 'bg-sky-100 text-sky-900 ring-1 ring-sky-300' },
  { rest: 'bg-rose-50 text-rose-800 hover:bg-rose-100', active: 'bg-rose-100 text-rose-900 ring-1 ring-rose-300' },
  { rest: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100', active: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300' },
  { rest: 'bg-amber-50 text-amber-800 hover:bg-amber-100', active: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300' },
  { rest: 'bg-teal-50 text-teal-800 hover:bg-teal-100', active: 'bg-teal-100 text-teal-900 ring-1 ring-teal-300' },
  { rest: 'bg-violet-50 text-violet-800 hover:bg-violet-100', active: 'bg-violet-100 text-violet-900 ring-1 ring-violet-300' },
];

export function ReportsHubPage({ group: requestedGroup }: { group?: string } = {}) {
  const setView = useUiStore((s) => s.setView);
  // One category at a time rather than one long scroll. With thirty reports the flat page meant
  // hunting; a row of categories is how somebody already thinks about which report they want.
  const [active, setActive] = useState(requestedGroup ?? 'Favourites');
  useEffect(() => {
    if (requestedGroup) setActive(requestedGroup);
  }, [requestedGroup]);
  const [favourites, setFavourites] = useState<Set<FavouritePage>>(() => loadFavouritePages());
  const group = REPORT_GROUPS.find((g) => g.heading === active) ?? REPORT_GROUPS[0];
  const favouriteReports = REPORT_GROUPS.flatMap((item) => item.entries).filter((entry) => favourites.has(`report:${entry.report}`));
  const favouriteForms = FORM_TEMPLATES.filter((form) => favourites.has(`form:${form.id}`));
  const isFavourites = active === 'Favourites';

  function starButton(page: FavouritePage, title: string) {
    const selected = favourites.has(page);
    return (
      <button
        type="button"
        aria-label={`${selected ? 'Remove' : 'Add'} ${title} ${selected ? 'from' : 'to'} favourites`}
        title={selected ? 'Remove from favourites' : 'Add to favourites'}
        onClick={() => setFavourites((current) => toggleFavouritePage(current, page))}
        className={`absolute right-3 top-3 z-10 text-xl leading-none ${selected ? 'text-gold-500' : 'text-gray-400 hover:text-gold-500'}`}
      >
        {selected ? '★' : '☆'}
      </button>
    );
  }

  function reportCard(entry: Entry) {
    return (
      <div key={entry.report} className="relative min-w-0">
        <HubCard
          tone={entry.tone}
          title={entry.title}
          description={entry.description}
          badge={<span className="w-5" aria-hidden="true" />}
          onClick={() => setView({ kind: 'report', report: entry.report })}
        />
        {starButton(`report:${entry.report}`, entry.title)}
        {entry.variants && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 px-1 text-xs">
            {entry.variants.map((v) => (
              <button key={v.report} type="button" onClick={() => setView({ kind: 'report', report: v.report })} className="text-brand-700 hover:underline">{v.label} →</button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    // Categories down the left, the chosen one opening to the right. With thirty reports a single
    // scroll meant hunting; this keeps every category in view while only one set of cards is shown.
    <div className="flex w-full gap-3">
      <nav className="w-56 shrink-0 space-y-1.5" aria-label="Report categories">
        <button
          type="button"
          aria-current={isFavourites ? 'page' : undefined}
          onClick={() => setActive('Favourites')}
          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
            isFavourites ? 'bg-gold-100 text-gold-900 shadow-soft ring-1 ring-gold-300' : 'bg-gold-50 text-gold-800 hover:bg-gold-100'
          }`}
        >
          <span>★ Favourites</span>
          <span className="text-xs opacity-60">{favouriteReports.length + favouriteForms.length}</span>
        </button>
        {REPORT_GROUPS.map((g, index) => {
          const tint = GROUP_TINTS[index % GROUP_TINTS.length];
          const isActive = g.heading === active;
          return (
            <button
              key={g.heading}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => { setActive(g.heading); setView({ kind: 'reportsHub', group: g.heading }); }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                isActive ? `${tint.active} shadow-soft` : tint.rest
              }`}
            >
              <span className="truncate">{g.heading}</span>
              <span className="ml-2 flex shrink-0 items-center gap-1.5">
                {g.entries.length > 0 && <span className="text-xs opacity-60">{g.entries.length}</span>}
                {/* Points right when closed, and turns to point at the panel it opened. */}
                <span className={`text-xs transition-transform ${isActive ? 'translate-x-0.5' : 'opacity-50'}`}>›</span>
              </span>
            </button>
          );
        })}
      </nav>

      <section className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-gray-900">{isFavourites ? 'My favourite reports and forms' : group.heading}</h2>
        <p className="mb-3 text-sm text-gray-500">
          {isFavourites ? 'Your frequently used accountant pages, kept together on this device.' : group.blurb}
        </p>
        {isFavourites ? (
          favouriteReports.length === 0 && favouriteForms.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gold-300 bg-gold-50 p-3 text-sm text-gold-900">
              Select the ☆ on any report below, or on any form in Forms, to build your personal list.
              <div className="mt-3 flex gap-3">
                <button type="button" onClick={() => setActive(REPORT_GROUPS[0].heading)} className="font-semibold underline">Browse reports</button>
                <button type="button" onClick={() => setView({ kind: 'forms' })} className="font-semibold underline">Browse forms</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {favouriteReports.map(reportCard)}
              {favouriteForms.map((form) => (
                <div key={form.id} className="relative min-w-0">
                  <HubCard
                    tone="amber"
                    title={form.title}
                    description={`Form — ${form.description}`}
                    badge={<span className="w-5" aria-hidden="true" />}
                    onClick={() => setView({ kind: 'forms', formId: form.id })}
                  />
                  {starButton(`form:${form.id}`, form.title)}
                </div>
              ))}
            </div>
          )
        ) : group.unavailable ? (
          <p className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500">{group.unavailable}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.entries.map(reportCard)}
          </div>
        )}
      </section>
    </div>
  );
}
