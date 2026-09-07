import { useEffect, useState } from 'react';
import { useUiStore } from '../../app/store/uiStore';
import { QuickEntryPage } from '../quick-entry/QuickEntryPage';
import { ExpensesOverviewTab } from './ExpensesOverviewTab';
import { MileagePage } from '../mileage/MileagePage';
import { PurchasesPage } from '../purchases/PurchasesPage';
import { CreditNotesPage } from '../credit-notes/CreditNotesPage';
import { CommandCentreSection, FlowArrow, FlowBox, FlowRow } from '../../components/CommandCentreFlow';

/** The buying side, behind one row of tabs — the mirror of the Sales page. Expenses, vendor
 * bills, vendors and vendor credits all live here; there is no second Purchases screen.
 *
 * Kept deliberately parallel to Sales: the same tab row, the same overview layout, the same ageing
 * buckets read the other way round. Somebody who has learned one screen has learned both, and the
 * two sides of a ledger reading differently is a needless thing to have to remember.
 */
export type ExpensesTab = 'overview' | 'expense' | 'bills' | 'paid' | 'vendors' | 'vendorCredits' | 'mileage';

/* Written out in full rather than composed, so Tailwind's scanner can see them. */
const TABS: { id: ExpensesTab; label: string; rest: string; active: string }[] = [
  {
    id: 'overview',
    label: 'Overview',
    rest: 'bg-rose-50 text-rose-800 hover:bg-rose-100',
    active: 'bg-rose-100 text-rose-900 ring-1 ring-rose-300',
  },
  {
    id: 'expense',
    label: 'Record expense',
    rest: 'bg-amber-50 text-amber-800 hover:bg-amber-100',
    active: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300',
  },
  {
    id: 'bills',
    label: 'Vendor bills',
    rest: 'bg-amber-50 text-amber-800 hover:bg-amber-100',
    active: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300',
  },
  {
    id: 'paid',
    label: 'Paid bills',
    rest: 'bg-teal-50 text-teal-800 hover:bg-teal-100',
    active: 'bg-teal-100 text-teal-900 ring-1 ring-teal-300',
  },
  {
    id: 'vendors',
    label: 'Vendors',
    rest: 'bg-sky-50 text-sky-800 hover:bg-sky-100',
    active: 'bg-sky-100 text-sky-900 ring-1 ring-sky-300',
  },
  {
    id: 'vendorCredits',
    label: 'Vendor credits',
    rest: 'bg-rose-50 text-rose-800 hover:bg-rose-100',
    active: 'bg-rose-100 text-rose-900 ring-1 ring-rose-300',
  },
  {
    id: 'mileage',
    label: 'Mileage',
    rest: 'bg-teal-50 text-teal-800 hover:bg-teal-100',
    active: 'bg-teal-100 text-teal-900 ring-1 ring-teal-300',
  },
];

export function ExpensesPage({ tab: requestedTab, billId, vendorId }: { tab?: ExpensesTab; billId?: number; vendorId?: number }) {
  const setView = useUiStore((s) => s.setView);
  const [tab, setTab] = useState<ExpensesTab>(requestedTab ?? 'overview');

  useEffect(() => {
    if (requestedTab) setTab(requestedTab);
  }, [requestedTab]);

  function selectTab(next: ExpensesTab) {
    setTab(next);
    setView({ kind: 'expenses', tab: next });
  }

  return (
    <div className="w-full space-y-3">
      <CommandCentreSection title="Purchase workflow">
        <FlowRow nowrap>
          <FlowBox label="Record expense" tone="amber" onClick={() => selectTab('expense')} />
          <FlowArrow />
          <FlowBox label="Enter vendor bill" tone="rose" onClick={() => selectTab('bills')} />
          <FlowArrow />
          <FlowBox label="Pay bills" tone="cyan" onClick={() => selectTab('bills')} />
          <FlowArrow />
          <FlowBox label="General Ledger" tone="violet" onClick={() => setView({ kind: 'report', report: 'generalLedger' })} />
          <span className="mx-1 text-gray-300" aria-hidden>·</span>
          <FlowBox label="Purchase orders — order → receive → match bill" tone="sky" onClick={() => setView({ kind: 'purchaseOrders' })} />
        </FlowRow>
      </CommandCentreSection>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-lg font-semibold text-gray-900">Expenses</h1>
        <nav className="flex flex-wrap gap-2" aria-label="Expenses sections">
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
        {tab === 'overview' && <ExpensesOverviewTab />}
        {tab === 'expense' && <QuickEntryPage type="expense" />}
        {(tab === 'bills' || tab === 'paid') && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span className="font-semibold">A bill is an invoice you received.</span> You send invoices to customers; you receive bills from vendors.
            <span className="font-semibold"> Enter Bill</span> records what you owe the day the bill arrives (Accounts Payable goes up, the expense is booked).
            <span className="font-semibold"> Pay</span> records the money leaving the bank later, which clears the payable. Example: the hydro bill arrives today and is paid next week — enter it today, pay it next week.
          </p>
        )}
        {tab === 'bills' && <PurchasesPage embedded requestedTab="unpaid" requestedBillId={billId} requestedVendorId={vendorId} />}
        {tab === 'paid' && <PurchasesPage embedded requestedTab="paid" requestedBillId={billId} />}
        {tab === 'vendors' && <PurchasesPage embedded requestedTab="vendors" requestedVendorId={vendorId} />}
        {tab === 'vendorCredits' && <CreditNotesPage kind="vendor" />}
        {tab === 'mileage' && <MileagePage />}
      </div>
    </div>
  );
}
