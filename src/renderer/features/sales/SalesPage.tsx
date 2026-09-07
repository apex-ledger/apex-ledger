import { useEffect, useState } from 'react';
import { useUiStore } from '../../app/store/uiStore';
import { InvoicesPage } from '../invoices/InvoicesPage';
import { SalesReceiptsPage } from '../sales-receipts/SalesReceiptsPage';
import { SalesOverviewTab } from './SalesOverviewTab';
import { AllSalesTab } from './AllSalesTab';
import { SalesOrdersTab } from '../estimates/SalesOrdersTab';
import { EstimatesPage } from '../estimates/EstimatesPage';
import { DepositsPage } from '../deposits/DepositsPage';
import { CreditNotesPage } from '../credit-notes/CreditNotesPage';
import { RecurringInvoicesTab } from './RecurringInvoicesTab';
import { TimeTrackingTab } from './TimeTrackingTab';
import { CustomerWorkspace } from './CustomerWorkspace';
import { CommandCentreSection, FlowArrow, FlowBox, FlowRow } from '../../components/CommandCentreFlow';

/** Everything on the sales side, behind one row of tabs across the top.
 *
 * Same shape as the Transactions page. The tab label is the only place the section is named — the
 * pages underneath suppress their own headings when embedded here, so one screen does not print
 * its title twice.
 *
 * Each tab is the existing full page rather than a copy of it, so there is only ever one Invoices
 * screen to fix when something is wrong with it.
 */
export type SalesTab = 'overview' | 'all' | 'customers' | 'estimates' | 'orders' | 'invoices' | 'recurring' | 'time' | 'receipts' | 'creditNotes' | 'deposits';

/* Written out in full rather than composed, so Tailwind's scanner can see them — same reason as
 * the note in Sidebar.tsx. */
const TABS: { id: SalesTab; label: string; rest: string; active: string }[] = [
  {
    id: 'overview',
    label: 'Overview',
    rest: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    active: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300',
  },
  {
    id: 'all',
    label: 'All sales',
    rest: 'bg-teal-50 text-teal-800 hover:bg-teal-100',
    active: 'bg-teal-100 text-teal-900 ring-1 ring-teal-300',
  },
  {
    id: 'customers',
    label: 'Customers',
    rest: 'bg-sky-50 text-sky-800 hover:bg-sky-100',
    active: 'bg-sky-100 text-sky-900 ring-1 ring-sky-300',
  },
  {
    id: 'estimates',
    label: 'Estimates',
    rest: 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100',
    active: 'bg-indigo-100 text-indigo-900 ring-1 ring-indigo-300',
  },
  {
    id: 'orders',
    label: 'Sales orders',
    rest: 'bg-violet-50 text-violet-800 hover:bg-violet-100',
    active: 'bg-violet-100 text-violet-900 ring-1 ring-violet-300',
  },
  {
    id: 'invoices',
    label: 'Invoices',
    rest: 'bg-sky-50 text-sky-800 hover:bg-sky-100',
    active: 'bg-sky-100 text-sky-900 ring-1 ring-sky-300',
  },
  {
    id: 'recurring',
    label: 'Recurring',
    rest: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    active: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300',
  },
  {
    id: 'time',
    label: 'Time',
    rest: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    active: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300',
  },
  {
    id: 'receipts',
    label: 'Sales receipts',
    rest: 'bg-cyan-50 text-cyan-800 hover:bg-cyan-100',
    active: 'bg-cyan-100 text-cyan-900 ring-1 ring-cyan-300',
  },
  {
    id: 'creditNotes',
    label: 'Credit notes',
    rest: 'bg-rose-50 text-rose-800 hover:bg-rose-100',
    active: 'bg-rose-100 text-rose-900 ring-1 ring-rose-300',
  },
  {
    id: 'deposits',
    label: 'Deposits',
    rest: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    active: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300',
  },
];

export function SalesPage({ tab: requestedTab, customerId }: { tab?: SalesTab; customerId?: number }) {
  const setView = useUiStore((s) => s.setView);
  const [tab, setTab] = useState<SalesTab>(requestedTab ?? 'overview');

  useEffect(() => {
    if (requestedTab) setTab(requestedTab);
  }, [requestedTab]);

  function selectTab(next: SalesTab) {
    setTab(next);
    setView({ kind: 'sales', tab: next });
  }

  return (
    <div className="w-full space-y-3">
      <CommandCentreSection title="Sales workflow">
        <FlowRow nowrap>
          <FlowBox label="Estimate" tone="violet" onClick={() => setView({ kind: 'estimateEditor', id: 'new' })} />
          <FlowArrow />
          <FlowBox label="Invoice" tone="rose" onClick={() => setView({ kind: 'invoiceEditor', id: 'new' })} />
          <FlowArrow />
          <FlowBox label="Receive Payment" tone="cyan" onClick={() => selectTab('invoices')} />
          <FlowArrow />
          <FlowBox label="Deposit" tone="emerald" onClick={() => selectTab('deposits')} />
          <FlowArrow />
          <FlowBox label="General Ledger" tone="amber" onClick={() => setView({ kind: 'report', report: 'generalLedger' })} />
          <span className="mx-1 text-gray-300" aria-hidden>·</span>
          <FlowBox label="Sales receipt — paid on the spot" tone="sky" onClick={() => setView({ kind: 'salesReceiptEditor', id: 'new' })} />
        </FlowRow>
      </CommandCentreSection>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-lg font-semibold text-gray-900">Sales</h1>
        <nav className="flex flex-wrap gap-2" aria-label="Sales sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => selectTab(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? `${t.active} shadow-soft` : t.rest
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      </div>

      <div>
        {tab === 'overview' && <SalesOverviewTab />}
        {tab === 'all' && <AllSalesTab />}
        {tab === 'orders' && <SalesOrdersTab />}
        {tab === 'customers' && <CustomerWorkspace requestedCustomerId={customerId} />}
        {tab === 'estimates' && <EstimatesPage />}
        {tab === 'invoices' && (
          <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
            <span className="font-semibold">An invoice is what you send.</span> It records the sale and what the customer owes (Accounts Receivable goes up).
            <span className="font-semibold"> Receive Payment</span> records the money arriving later, which clears the receivable. A sale paid on the spot is a Sales Receipt instead: one step, no receivable.
          </p>
        )}
        {tab === 'invoices' && <InvoicesPage embedded />}
        {tab === 'recurring' && <RecurringInvoicesTab />}
        {tab === 'time' && <TimeTrackingTab />}
        {tab === 'receipts' && <SalesReceiptsPage />}
        {tab === 'creditNotes' && <CreditNotesPage kind="customer" />}
        {tab === 'deposits' && <DepositsPage />}
      </div>
    </div>
  );
}
