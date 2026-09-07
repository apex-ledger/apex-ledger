import { useEffect, useState } from 'react';
import { useUiStore } from '../../app/store/uiStore';
import { BankImportPage } from '../bank-import/BankImportPage';
import { BankReconciliationPage } from '../bank-reconciliation/BankReconciliationPage';
import { ChartOfAccountsPage } from '../chart-of-accounts/ChartOfAccountsPage';
import { JournalEntryListPage } from '../journal-entries/JournalEntryListPage';
import { ReceiptInboxPage } from '../receipt-inbox/ReceiptInboxPage';
import { RecurringTransactionsTab } from './RecurringTransactionsTab';
import { RulesTab } from './RulesTab';

/** Everything that touches a transaction, on one page behind one row of tabs.
 *
 * The pieces already existed but were scattered across the sidebar, so coding a statement meant
 * hopping between Bank Import, Chart of Accounts, and Reconcile as separate destinations — losing
 * your place each time. This groups them the way QuickBooks does, and each tab is the existing
 * full page rather than a reimplementation, so nothing forks.
 *
 * Tabs are plain text with an underline on the active one, matching the reference layout: with
 * seven of them, coloured pills (the Banking hub's style) turn the header into the loudest thing
 * on the page, which is wrong for a row you pass through on the way to the work.
 */
export type TransactionsTab =
  | 'bank'
  | 'app'
  | 'receipts'
  | 'reconcile'
  | 'rules'
  | 'chartOfAccounts'
  | 'recurring';

/* Class strings written out in full rather than composed from a template, so Tailwind's JIT scanner
 * can find them — same reason as the note in Sidebar.tsx. Each tab keeps a light tint of its own so
 * the row reads as distinct steps; the selected one deepens and gains a ring. */
const TABS: { id: TransactionsTab; label: string; rest: string; active: string }[] = [
  {
    id: 'bank',
    label: 'Bank transactions',
    rest: 'bg-sky-50 text-sky-800 hover:bg-sky-100',
    active: 'bg-sky-100 text-sky-900 ring-1 ring-sky-300',
  },
  {
    id: 'app',
    label: 'App transactions',
    rest: 'bg-violet-50 text-violet-800 hover:bg-violet-100',
    active: 'bg-violet-100 text-violet-900 ring-1 ring-violet-300',
  },
  {
    id: 'receipts',
    label: 'Receipts',
    rest: 'bg-amber-50 text-amber-800 hover:bg-amber-100',
    active: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300',
  },
  {
    id: 'reconcile',
    label: 'Reconcile',
    rest: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    active: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300',
  },
  {
    id: 'rules',
    label: 'Rules',
    rest: 'bg-rose-50 text-rose-800 hover:bg-rose-100',
    active: 'bg-rose-100 text-rose-900 ring-1 ring-rose-300',
  },
  {
    id: 'chartOfAccounts',
    label: 'Chart of accounts',
    rest: 'bg-cyan-50 text-cyan-800 hover:bg-cyan-100',
    active: 'bg-cyan-100 text-cyan-900 ring-1 ring-cyan-300',
  },
  {
    id: 'recurring',
    label: 'Recurring transactions',
    rest: 'bg-teal-50 text-teal-800 hover:bg-teal-100',
    active: 'bg-teal-100 text-teal-900 ring-1 ring-teal-300',
  },
];

export function TransactionsPage({ tab: requestedTab }: { tab?: TransactionsTab }) {
  const setView = useUiStore((s) => s.setView);
  const [tab, setTab] = useState<TransactionsTab>(requestedTab ?? 'bank');

  // Following a link that names a tab (from the Dashboard, say) has to move the row even when this
  // page is already mounted — without this, the click would appear to do nothing.
  useEffect(() => {
    if (requestedTab) setTab(requestedTab);
  }, [requestedTab]);

  /** Keeps the address in the store in step with the row, so a tab survives navigating away and
   * back, and so the tab a user is on is the one a "back to Transactions" lands on. */
  function selectTab(next: TransactionsTab) {
    setTab(next);
    setView({ kind: 'transactions', tab: next });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-lg font-semibold text-gray-900">Transactions</h1>
        <nav className="flex flex-wrap gap-2" aria-label="Transactions sections">
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
        {tab === 'bank' && <BankImportPage />}
        {tab === 'app' && <JournalEntryListPage />}
        {tab === 'receipts' && <ReceiptInboxPage />}
        {tab === 'reconcile' && <BankReconciliationPage />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'chartOfAccounts' && <ChartOfAccountsPage />}
        {tab === 'recurring' && <RecurringTransactionsTab />}
      </div>
    </div>
  );
}
