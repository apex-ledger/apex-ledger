import { useEffect, useState } from 'react';
import type { ReportKind } from '../../app/store/uiStore';
import { useUiStore } from '../../app/store/uiStore';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { AuditPage } from './AuditPage';
import { AuditExceptionsPage } from '../reports/AuditExceptionsPage';

export type AuditorTab = 'exceptions' | 'checks' | 'package';

const TABS: Array<{ id: AuditorTab; label: string; blurb: string }> = [
  { id: 'exceptions', label: 'Exceptions', blurb: 'The tests an auditor runs first, with the rows that fail them' },
  { id: 'checks', label: 'Books health', blurb: 'Structural checks on the chart, balances and postings' },
  { id: 'package', label: 'Audit package', blurb: 'Every sheet an auditor asks for, one click each' },
];

interface PackageCard {
  title: string;
  description: string;
  report: ReportKind;
}

const PACKAGE: Array<{ heading: string; cards: PackageCard[] }> = [
  {
    heading: 'Trail and support',
    cards: [
      { title: 'Audit Trail', description: 'Who entered, changed, posted or voided each entry, and when.', report: 'auditTrail' },
      { title: 'Source Documents', description: 'Every posted entry with its invoice, bill, receipt or attachment.', report: 'sourceDocuments' },
      { title: 'Journal', description: 'All entries in the period in posting order.', report: 'journalReport' },
      { title: 'Adjusting Entries', description: 'Year-end and correcting entries on their own.', report: 'adjustingEntries' },
    ],
  },
  {
    heading: 'Reconciliations',
    cards: [
      { title: 'Bank Reconciliation Report', description: 'Statement balance to book balance, with outstanding items.', report: 'reconciliationReport' },
      { title: 'Bank Deposit Analysis', description: 'Deposits traced to invoices and receipts.', report: 'bankDepositAnalysis' },
      { title: 'A/R Ageing', description: 'Open invoices by age; supports the receivable balance.', report: 'agingReceivable' },
      { title: 'A/P Ageing', description: 'Open bills by age; supports the payable balance.', report: 'agingPayable' },
      { title: 'GST/HST Working Paper', description: 'Tax collected and claimed, tied to the returns filed.', report: 'hstWorkingPaper' },
      { title: 'Payroll Register', description: 'Gross to net by run, with employer costs and remittances.', report: 'payrollRegister' },
    ],
  },
  {
    heading: 'Balances and continuity',
    cards: [
      { title: 'Working Trial Balance', description: 'Opening, adjustments, closing, by account.', report: 'workingTrialBalance' },
      { title: 'Trial Balance', description: 'Every account balance at the period end.', report: 'trialBalance' },
      { title: 'Fixed Asset / CCA Continuity', description: 'Cost, additions, disposals and depreciation for the year.', report: 'fixedAssetContinuity' },
      { title: 'Debt Continuity', description: 'Loans opened, repaid and closed with interest.', report: 'debtContinuity' },
      { title: 'Shareholder Continuity', description: 'Loans to and from shareholders and related parties.', report: 'shareholderContinuity' },
      { title: 'Inventory Continuity', description: 'Stock movement and valuation for the year.', report: 'inventoryContinuity' },
    ],
  },
  {
    heading: 'Statements',
    cards: [
      { title: 'Balance Sheet', description: 'Financial position at the period end.', report: 'balanceSheet' },
      { title: 'Profit and Loss', description: 'Results for the period, with comparatives.', report: 'incomeStatement' },
      { title: 'Cash Flow', description: 'Where cash came from and went.', report: 'cashFlow' },
      { title: 'Changes in Equity', description: 'Opening equity to closing equity.', report: 'changesInEquity' },
    ],
  },
];

/** The auditor's tab: exception tests first, the books-health checks second, and every sheet of
 * the audit package one click away. Built for the person preparing for an audit as much as for
 * the auditor sitting down with the file. */
export function AuditorCentrePage({ tab: initialTab }: { tab?: AuditorTab }) {
  const setView = useUiStore((s) => s.setView);
  const [tab, setTab] = useState<AuditorTab>(initialTab ?? 'exceptions');
  const [counts, setCounts] = useState<{ high: number; medium: number; low: number } | null>(null);
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
  useEffect(() => {
    const today = localIsoDate();
    window.api.reports.auditExceptions({ periodStart: `${today.slice(0, 4)}-01-01`, periodEnd: today }).then((r) => r.ok && setCounts(r.data.counts));
  }, []);

  return (
    <div className="space-y-3 p-3" data-testid="auditor-centre">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Auditor Centre</h1>
          <p className="text-sm text-gray-500">What an auditor asks for and what they look for, so the answers are ready before the questions.</p>
        </div>
        {counts && (
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-800">{counts.high} high</span>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">{counts.medium} medium</span>
            <span className="rounded-full bg-yellow-100 px-2.5 py-1 font-medium text-yellow-800">{counts.low} low</span>
            <span className="text-gray-400">this year</span>
          </div>
        )}
      </div>
      <div className="flex gap-1 border-b border-gray-200" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} title={t.blurb} className={`px-3 py-1.5 text-sm ${tab === t.id ? 'rounded-t bg-brand-50 border-b-2 border-brand-700 font-medium text-brand-800' : 'text-gray-500 hover:text-gray-800'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'exceptions' && <AuditExceptionsPage />}
      {tab === 'checks' && <AuditPage hideRules={['stale-draft', 'large-round-amount']} />}
      {tab === 'package' && (
        <div className="space-y-3">
          {PACKAGE.map((group) => (
            <section key={group.heading}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{group.heading}</h2>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {group.cards.map((c) => (
                  <button key={c.report} type="button" onClick={() => setView({ kind: 'report', report: c.report })} className="rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-brand-300 hover:bg-brand-50">
                    <div className="text-sm font-semibold text-gray-900">{c.title}</div>
                    <div className="text-xs text-gray-500">{c.description}</div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
