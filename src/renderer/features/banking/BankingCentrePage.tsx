import { useEffect, useState } from 'react';
import type { Account, CategoryRule } from '@shared/domain/types';
import { useUiStore } from '../../app/store/uiStore';
import { BankImportPage } from '../bank-import/BankImportPage';
import { CategoryRulesModal } from '../bank-import/CategoryRulesModal';
import { BankReconciliationPage } from '../bank-reconciliation/BankReconciliationPage';
import { QuickEntryPage } from '../quick-entry/QuickEntryPage';
import { BulkExpenseImportPage } from '../quick-entry/BulkExpenseImportPage';
import { ReceiptInboxPage } from '../receipt-inbox/ReceiptInboxPage';

/**
 * The whole banking workflow on one row of tabs, in the order the work actually happens: get the
 * transactions in, code them, record anything that didn't come off a statement, then reconcile.
 * Each tab is the existing full page — this groups them rather than reimplementing them.
 */
export type BankingTab = 'connections' | 'transactions' | 'spend' | 'receive' | 'transfer' | 'receipts' | 'organise' | 'reconcile';

/* Class strings are written out in full rather than composed from a template, so Tailwind's JIT
 * scanner can actually find them — same reason as the note in Sidebar.tsx. Each tab keeps a light
 * tint of its own so the row reads as seven distinct steps; the selected one deepens and gains a
 * ring rather than changing colour entirely. */
const TABS: { id: BankingTab; label: string; blurb: string; rest: string; active: string }[] = [
  {
    id: 'connections',
    label: 'Connections',
    blurb: 'Set up bank and credit-card accounts, import statements and review feed readiness',
    rest: 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100',
    active: 'bg-indigo-100 text-indigo-900 ring-1 ring-indigo-300',
  },
  {
    id: 'transactions',
    label: 'Bank Transactions',
    blurb: 'Import a statement and code each line',
    rest: 'bg-sky-50 text-sky-800 hover:bg-sky-100',
    active: 'bg-sky-100 text-sky-900 ring-1 ring-sky-300',
  },
  {
    id: 'spend',
    label: 'Spend Money',
    blurb: 'Record money going out',
    rest: 'bg-rose-50 text-rose-800 hover:bg-rose-100',
    active: 'bg-rose-100 text-rose-900 ring-1 ring-rose-300',
  },
  {
    id: 'receive',
    label: 'Receive Money',
    blurb: 'Record money coming in',
    rest: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    active: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300',
  },
  {
    id: 'transfer',
    label: 'Transfer',
    blurb: 'Move money between your own accounts',
    rest: 'bg-cyan-50 text-cyan-800 hover:bg-cyan-100',
    active: 'bg-cyan-100 text-cyan-900 ring-1 ring-cyan-300',
  },
  {
    id: 'receipts',
    label: 'Receipts',
    blurb: 'Scanned receipts waiting to be filed',
    rest: 'bg-amber-50 text-amber-800 hover:bg-amber-100',
    active: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300',
  },
  {
    id: 'organise',
    label: 'Organise',
    blurb: 'Bank rules and bulk import',
    rest: 'bg-violet-50 text-violet-800 hover:bg-violet-100',
    active: 'bg-violet-100 text-violet-900 ring-1 ring-violet-300',
  },
  {
    id: 'reconcile',
    label: 'Reconcile',
    blurb: 'Tick off cleared items against the statement',
    rest: 'bg-teal-50 text-teal-800 hover:bg-teal-100',
    active: 'bg-teal-100 text-teal-900 ring-1 ring-teal-300',
  },
];

function moneyAccountLabel(account: Account): string {
  const suffix = account.accountNumber?.trim();
  return suffix ? `${account.name} •••• ${suffix.slice(-4)}` : account.name;
}

function ConnectionsTab({ onUseImport, onUseReconcile }: { onUseImport: () => void; onUseReconcile: () => void }) {
  const setView = useUiStore((s) => s.setView);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.api.accounts.list({ activeOnly: true }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setAccounts(result.data);
        setLoadError(null);
      } else {
        setLoadError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const bankAccounts = accounts.filter((account) => account.accountType === 'Asset' && account.accountSubtype === 'Cash and Bank');
  const creditCards = accounts.filter((account) => account.accountType === 'Liability' && account.accountSubtype === 'Credit Card');

  const accountGroups = [
    {
      title: 'Bank accounts',
      description: 'Chequing, savings, trust and other cash accounts.',
      accounts: bankAccounts,
      empty: 'No active bank accounts are set up yet.',
      tone: 'border-sky-200 bg-sky-50',
      badge: 'bg-sky-100 text-sky-800',
    },
    {
      title: 'Credit cards',
      description: 'Business cards available for purchases, transfers and statement import.',
      accounts: creditCards,
      empty: 'No active credit-card accounts are set up yet.',
      tone: 'border-violet-200 bg-violet-50',
      badge: 'bg-violet-100 text-violet-800',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
        <div>
          <div className="font-semibold text-indigo-950">Banking connections</div>
          <p className="mt-1 text-sm text-indigo-800">
            Live bank feeds are not active yet. Apex Ledger uses secure statement import and keeps every posting under your review.
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">LIVE FEEDS PLANNED</span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {accountGroups.map((group) => (
          <section key={group.title} className={`rounded-xl border p-3 shadow-soft ${group.tone}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-950">{group.title}</h2>
                <p className="mt-1 text-sm text-gray-600">{group.description}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-bold ${group.badge}`}>
                {group.accounts.length} ACTIVE
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {group.accounts.slice(0, 4).map((account) => (
                <div key={account.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/80 bg-white/80 px-3 py-2">
                  <span className="min-w-0 truncate text-sm font-medium text-gray-800">{moneyAccountLabel(account)}</span>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    IMPORT READY
                  </span>
                </div>
              ))}
              {group.accounts.length === 0 && <p className="rounded-lg bg-white/70 px-3 py-2 text-sm text-gray-500">{group.empty}</p>}
              {group.accounts.length > 4 && (
                <p className="px-1 text-xs text-gray-500">+ {group.accounts.length - 4} more in the Chart of Accounts</p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setView({ kind: 'chartOfAccounts' })}
                className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Add or manage
              </button>
              <button
                type="button"
                onClick={onUseImport}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Import statement
              </button>
            </div>
          </section>
        ))}
      </div>

      {loadError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Could not load money accounts: {loadError}</div>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <button type="button" onClick={onUseImport} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left hover:bg-emerald-100">
          <div className="font-semibold text-emerald-900">Upload from file</div>
          <p className="mt-1 text-sm text-emerald-800">Import CSV statement activity for a bank account or credit card.</p>
        </button>
        <button
          type="button"
          onClick={() => setView({ kind: 'chartOfAccounts' })}
          className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-left hover:bg-sky-100"
        >
          <div className="font-semibold text-sky-900">Manage accounts</div>
          <p className="mt-1 text-sm text-sky-800">Add, rename, number or deactivate bank and credit-card accounts.</p>
        </button>
        <button type="button" onClick={onUseReconcile} className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-left hover:bg-teal-100">
          <div className="font-semibold text-teal-900">Reconcile</div>
          <p className="mt-1 text-sm text-teal-800">Compare Apex Ledger with the statement ending balance.</p>
        </button>
      </div>
    </div>
  );
}

/** The Organise tab: the two tools that stop coding being manual — rules that categorise a line the
 * moment it's recognised, and a bulk paste for a batch that never came off a bank feed. */
function OrganiseTab() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  function reload() {
    window.api.accounts.list({ activeOnly: true }).then((r) => {
      if (r.ok) setAccounts(r.data);
    });
    window.api.categoryRules.list().then((r) => {
      if (r.ok) setRules(r.data);
    });
  }

  useEffect(reload, []);

  if (showBulk) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setShowBulk(false)} className="text-sm text-brand-600 hover:underline">
          ← Back to Organise
        </button>
        <BulkExpenseImportPage />
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setRulesOpen(true)}
          className="rounded-xl2 border border-gray-200/80 bg-white p-3 text-left shadow-soft duration-250 ease-standard hover:-translate-y-0.5 hover:shadow-lift"
        >
          <div className="font-semibold text-gray-900">Bank Rules</div>
          <p className="mt-1 text-sm text-gray-500">
            Match a description to a category once, and every future transaction like it codes itself on import.
          </p>
          <p className="mt-2 text-xs text-gray-400">{rules.length} rule{rules.length === 1 ? '' : 's'} set up</p>
        </button>

        <button
          type="button"
          onClick={() => setShowBulk(true)}
          className="rounded-xl2 border border-gray-200/80 bg-white p-3 text-left shadow-soft duration-250 ease-standard hover:-translate-y-0.5 hover:shadow-lift"
        >
          <div className="font-semibold text-gray-900">Bulk Expense Import</div>
          <p className="mt-1 text-sm text-gray-500">Paste a block of expenses — a spreadsheet, a credit card export — and post them in one pass.</p>
        </button>
      </div>

      <CategoryRulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        accounts={accounts}
        rules={rules}
        onRulesChanged={reload}
        onAccountCreated={reload}
      />
    </div>
  );
}

export function BankingCentrePage() {
  const requestedTab = useUiStore((s) => (s.view.kind === 'banking' ? s.view.tab : undefined));
  const [tab, setTab] = useState<BankingTab>(requestedTab ?? 'connections');
  const active = TABS.find((t) => t.id === tab)!;

  // A direct sidebar shortcut can change the requested Banking tab while this centre is already
  // mounted. Keep the visible page in sync instead of only reading the shortcut on first load.
  useEffect(() => {
    setTab(requestedTab ?? 'connections');
  }, [requestedTab]);

  return (
    <div className="space-y-3">
      {/* One row, horizontally scrollable rather than wrapping — seven tabs that reflow onto a
          second line stop reading as a single workflow. */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            title={t.blurb}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium duration-250 ease-standard ${
              tab === t.id ? `${t.active} shadow-soft` : t.rest
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-500">{active.blurb}</p>

      {/* Keyed so each tab's page loads its own data fresh instead of flashing the previous tab's. */}
      <div key={tab} className="animate-viewIn">
        {tab === 'connections' && <ConnectionsTab onUseImport={() => setTab('transactions')} onUseReconcile={() => setTab('reconcile')} />}
        {tab === 'transactions' && <BankImportPage />}
        {tab === 'spend' && <QuickEntryPage type="expense" />}
        {tab === 'receive' && <QuickEntryPage type="income" />}
        {tab === 'transfer' && <QuickEntryPage type="transfer" />}
        {tab === 'receipts' && <ReceiptInboxPage />}
        {tab === 'organise' && <OrganiseTab />}
        {tab === 'reconcile' && <BankReconciliationPage />}
      </div>
    </div>
  );
}
