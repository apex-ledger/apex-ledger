import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Account, Bill, ClientRecord, Contact, CreditNote, Deposit, Employee, HstFiling, Invoice, JournalEntry, PayrollRun, SalesReceipt,
} from '@shared/domain/types';
import type { EstimateRow, MileageTripRow, Product, PurchaseOrderRow, RecurringTemplate, TagGroupRow } from '../../preload/index';
import { FORM_TEMPLATES } from '@shared/domain/forms/formTemplates';
import { useUiStore, type View } from '../app/store/uiStore';
import { ACCOUNTING_NAV, BOOKKEEPING_NAV, MAIN_NAV, QUICK_ENTRY_NAV_ITEM, type NavItem } from './Sidebar';
import { REPORT_GROUPS } from '../features/reports/ReportsHubPage';
import {
  IconBank, IconBook, IconBuilding, IconCalculator, IconCart, IconDollarCircle, IconFileText, IconGear, IconHelp, IconLedger, IconPeople,
  IconReceipt, IconShoppingBag, IconUsers,
} from '../components/icons';
import { formatDollars, rankCandidates, type SearchCandidate } from '../utils/searchIndex';

/** Pages reachable only from the header's Settings menu / elsewhere — not in the sidebar's own
 * three nav arrays, but still real destinations someone would reasonably type into search. */
const EXTRA_NAV_ITEMS: { label: string; view: View; icon: React.ReactNode }[] = [
  { label: 'Company Settings', view: { kind: 'companySettings' }, icon: <IconGear /> },
  { label: 'Tools & Calculators', view: { kind: 'tools' }, icon: <IconCalculator /> },
  { label: 'Accounting Audit / Health Check', view: { kind: 'audit' }, icon: <IconLedger /> },
  { label: 'User Guide', view: { kind: 'userGuide' }, icon: <IconHelp /> },
  { label: 'Knowledge Base', view: { kind: 'knowledgeBase' }, icon: <IconHelp /> },
  { label: 'Users & Access', view: { kind: 'accessPermissions' }, icon: <IconUsers /> },
];

function flattenNavigation(items: NavItem[]): { label: string; view: View; icon: React.ReactNode }[] {
  return items.flatMap((item) => [{ label: item.label, view: item.view, icon: item.icon }, ...flattenNavigation(item.children ?? [])]);
}

const PAGE_INDEX = [...flattenNavigation([QUICK_ENTRY_NAV_ITEM, ...MAIN_NAV, ...BOOKKEEPING_NAV, ...ACCOUNTING_NAV]), ...EXTRA_NAV_ITEMS]
  .filter((item, index, all) => all.findIndex((candidate) => candidate.label === item.label && JSON.stringify(candidate.view) === JSON.stringify(item.view)) === index);

/** Every report in the Reports hub, so "aged receivable" or "T2" finds the report directly. */
const REPORT_INDEX = REPORT_GROUPS.flatMap((group) =>
  group.entries.map((entry) => ({ label: entry.title, description: entry.description, group: group.heading, view: { kind: 'report', report: entry.report } as View })),
);

function companyNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop()?.replace(/\.company$/, '') ?? filePath;
}

/** The order groups appear in. */
const GROUPS = [
  'page', 'report', 'form', 'account', 'customer', 'vendor', 'invoice', 'estimate', 'salesReceipt', 'creditNote', 'bill', 'purchaseOrder',
  'journal', 'product', 'employee', 'payrollRun', 'client', 'deposit', 'hstFiling', 'mileage', 'recurring', 'tag', 'company',
] as const;
type GroupKey = (typeof GROUPS)[number];
const GROUP_LABELS: Record<GroupKey, string> = {
  page: 'Pages and tabs', report: 'Reports', form: 'Forms', account: 'Accounts and sub-accounts', customer: 'Customers', vendor: 'Vendors',
  invoice: 'Invoices', estimate: 'Estimates', salesReceipt: 'Sales receipts', creditNote: 'Credit notes', bill: 'Bills', purchaseOrder: 'Purchase orders',
  journal: 'Journal entries', product: 'Products and services', employee: 'Employees', payrollRun: 'Pay runs', client: 'Clients (CRM)', deposit: 'Deposits',
  hstFiling: 'Sales tax returns', mileage: 'Mileage', recurring: 'Recurring transactions', tag: 'Tags', company: 'Companies',
};
/** How many rows each group may show. Documents get more room than pages because a number
 * search tends to have one right answer among many near-misses. */
const GROUP_LIMIT: Partial<Record<GroupKey, number>> = { page: 6, report: 6, form: 4, account: 8, journal: 8 };

interface ResultRow {
  group: GroupKey;
  key: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  action: () => void | Promise<void>;
}

/** Everything the palette can search. Loaded when it opens, in parallel; a list that fails to
 * load is simply empty rather than blocking the rest. */
interface SearchData {
  clients: ClientRecord[]; accounts: Account[]; companies: string[]; customers: Contact[]; vendors: Contact[]; invoices: Invoice[];
  estimates: EstimateRow[]; salesReceipts: SalesReceipt[]; creditNotes: CreditNote[]; bills: Bill[]; purchaseOrders: PurchaseOrderRow[];
  journal: JournalEntry[]; products: Product[]; employees: Employee[]; payrollRuns: PayrollRun[]; deposits: Deposit[]; hstFilings: HstFiling[];
  mileage: MileageTripRow[]; recurring: RecurringTemplate[]; tags: TagGroupRow[];
}
const EMPTY: SearchData = {
  clients: [], accounts: [], companies: [], customers: [], vendors: [], invoices: [], estimates: [], salesReceipts: [], creditNotes: [], bills: [],
  purchaseOrders: [], journal: [], products: [], employees: [], payrollRuns: [], deposits: [], hstFilings: [], mileage: [], recurring: [], tags: [],
};

async function loadList<T>(call: () => Promise<{ ok: true; data: T[] } | { ok: false; error: string }>): Promise<T[]> {
  try {
    const result = await call();
    return result.ok ? result.data : [];
  } catch {
    return [];
  }
}

async function loadSearchData(): Promise<SearchData> {
  const api = window.api;
  const [
    clients, accounts, companies, customers, vendors, invoices, estimates, salesReceipts, creditNotes, bills, purchaseOrders, journal, products,
    employees, payrollRuns, deposits, hstFilings, mileage, recurring, tags,
  ] = await Promise.all([
    loadList(() => api.clients.list()), loadList(() => api.accounts.list({ activeOnly: false })), loadList(() => api.company.listRecent()),
    loadList(() => api.customers.list()), loadList(() => api.vendors.list()), loadList(() => api.invoices.list()), loadList(() => api.estimates.list()),
    loadList(() => api.salesReceipts.list()), loadList(() => api.creditNotes.list()), loadList(() => api.bills.list()), loadList(() => api.purchaseOrders.list()),
    loadList(() => api.journal.list()), loadList(() => api.products.list()), loadList(() => api.employees.list()), loadList(() => api.payrollRuns.list()),
    loadList(() => api.deposits.list()), loadList(() => api.hstFilings.list()), loadList(() => api.mileage.list()), loadList(() => api.recurringTemplates.list()),
    loadList(() => api.tags.groups()),
  ]);
  return { clients, accounts, companies, customers, vendors, invoices, estimates, salesReceipts, creditNotes, bills, purchaseOrders, journal, products, employees, payrollRuns, deposits, hstFilings, mileage, recurring, tags };
}

export function QuickSearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setView = useUiStore((s) => s.setView);
  const setPendingSearchTerm = useUiStore((s) => s.setPendingSearchTerm);
  const setCompany = useUiStore((s) => s.setCompany);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [data, setData] = useState<SearchData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    setLoading(true);
    let cancelled = false;
    void loadSearchData().then((loaded) => {
      if (cancelled) return;
      setData(loaded);
      setLoading(false);
    });
    // Autofocus needs a tick — the input isn't in the DOM yet on the same render that flips `open`.
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      cancelled = true;
    };
  }, [open]);

  const results = useMemo<ResultRow[]>(() => {
    const term = query.trim();
    if (!term) {
      // Nothing typed yet — show the most likely jump-to destinations rather than an empty box.
      return PAGE_INDEX.slice(0, 8).map((p) => ({ group: 'page', key: `page-${p.label}`, label: p.label, icon: p.icon, action: () => setView(p.view) }));
    }

    const customerName = new Map(data.customers.map((c) => [c.id, c.name]));
    const vendorName = new Map(data.vendors.map((v) => [v.id, v.name]));
    const employeeName = new Map(data.employees.map((e) => [e.id, e.name]));
    const accountName = new Map(data.accounts.map((a) => [a.id, a.name]));

    /** Ranks one source and turns its matches into rows. */
    function rows<T>(group: GroupKey, candidates: SearchCandidate<T>[], toRow: (item: T) => Omit<ResultRow, 'group'>): ResultRow[] {
      return rankCandidates(candidates, term, GROUP_LIMIT[group] ?? 5).map(({ item }) => ({ group, ...toRow(item) }));
    }

    return [
      ...rows('page', PAGE_INDEX.map((p) => ({ item: p, fields: [p.label] })), (p) => ({ key: `page-${p.label}`, label: p.label, icon: p.icon, action: () => setView(p.view) })),
      ...rows('report', REPORT_INDEX.map((r) => ({ item: r, fields: [r.label, r.description, r.group] })), (r) => ({ key: `report-${r.label}`, label: r.label, sublabel: r.group, icon: <IconBook />, action: () => setView(r.view) })),
      ...rows('form', FORM_TEMPLATES.map((f) => ({ item: f, fields: [f.title] })), (f) => ({ key: `form-${f.id}`, label: f.title, icon: <IconFileText />, action: () => setView({ kind: 'forms', formId: f.id }) })),
      ...rows('account', data.accounts.map((a) => ({ item: a, fields: [a.name, a.accountNumber, a.code, a.accountSubtype] })), (a) => {
        const parent = a.parentId ? accountName.get(a.parentId) : null;
        return {
          key: `account-${a.id}`, label: a.name, sublabel: parent ? `Sub-account of ${parent}` : `${a.accountType} account`, icon: <IconLedger />,
          action: () => { setPendingSearchTerm(a.name); setView({ kind: 'chartOfAccounts' }); },
        };
      }),
      ...rows('customer', data.customers.map((c) => ({ item: c, fields: [c.name, c.companyName, c.contactName, c.email, c.phone] })), (c) => ({
        key: `customer-${c.id}`, label: c.name, sublabel: c.isActive ? (c.email ?? c.phone ?? undefined) : 'Inactive', icon: <IconUsers />,
        action: () => { setPendingSearchTerm(c.name); setView({ kind: 'sales', tab: 'customers' }); },
      })),
      ...rows('vendor', data.vendors.map((v) => ({ item: v, fields: [v.name, v.companyName, v.contactName, v.email, v.phone] })), (v) => ({
        key: `vendor-${v.id}`, label: v.name, sublabel: v.isActive ? (v.email ?? v.phone ?? undefined) : 'Inactive', icon: <IconBuilding />,
        action: () => { setPendingSearchTerm(v.name); setView({ kind: 'purchases', tab: 'vendors', vendorId: v.id }); },
      })),
      ...rows('invoice', data.invoices.map((i) => ({ item: i, fields: [i.invoiceNumber, customerName.get(i.customerId), i.memo, formatDollars(i.totalCents)] })), (i) => ({
        key: `invoice-${i.id}`, label: `${i.invoiceNumber} — ${customerName.get(i.customerId) ?? 'Customer'}`, sublabel: `${formatDollars(i.totalCents)} · ${i.status}`, icon: <IconFileText />,
        action: () => setView({ kind: 'invoiceEditor', id: i.id }),
      })),
      ...rows('estimate', data.estimates.map((e) => ({ item: e, fields: [e.estimateNumber, customerName.get(e.customerId), formatDollars(e.totalCents)] })), (e) => ({
        key: `estimate-${e.id}`, label: `${e.estimateNumber} — ${customerName.get(e.customerId) ?? 'Customer'}`, sublabel: `${formatDollars(e.totalCents)} · ${e.status}`, icon: <IconFileText />,
        action: () => setView({ kind: 'estimateEditor', id: e.id }),
      })),
      ...rows('salesReceipt', data.salesReceipts.map((r) => ({ item: r, fields: [r.receiptNumber, customerName.get(r.customerId), r.memo, formatDollars(r.totalCents)] })), (r) => ({
        key: `receipt-${r.id}`, label: `${r.receiptNumber} — ${customerName.get(r.customerId) ?? 'Customer'}`, sublabel: formatDollars(r.totalCents), icon: <IconReceipt />,
        action: () => setView({ kind: 'salesReceiptEditor', id: r.id }),
      })),
      ...rows('creditNote', data.creditNotes.map((n) => ({ item: n, fields: [n.creditNoteNumber, (n.kind === 'customer' ? customerName : vendorName).get(n.contactId), n.memo, formatDollars(n.totalCents)] })), (n) => ({
        key: `credit-${n.id}`, label: `${n.creditNoteNumber} — ${(n.kind === 'customer' ? customerName : vendorName).get(n.contactId) ?? 'Contact'}`, sublabel: `${formatDollars(n.totalCents)} · ${n.status}`, icon: <IconFileText />,
        action: () => setView({ kind: 'creditNotes' }),
      })),
      ...rows('bill', data.bills.map((b) => ({ item: b, fields: [b.billNumber, vendorName.get(b.vendorId), b.memo, formatDollars(b.amountCents)] })), (b) => ({
        key: `bill-${b.id}`, label: `${b.billNumber ? `Vendor invoice ${b.billNumber}` : `Bill ${b.id}`} — ${vendorName.get(b.vendorId) ?? 'Vendor'}`, sublabel: `${formatDollars(b.amountCents)} · ${b.status}`, icon: <IconReceipt />,
        action: () => setView({ kind: 'purchases', tab: b.status === 'paid' ? 'paid' : 'unpaid', billId: b.id }),
      })),
      ...rows('purchaseOrder', data.purchaseOrders.map((p) => ({ item: p, fields: [p.poNumber, vendorName.get(p.vendorId), formatDollars(p.totalCents)] })), (p) => ({
        key: `po-${p.id}`, label: `${p.poNumber} — ${vendorName.get(p.vendorId) ?? 'Vendor'}`, sublabel: `${formatDollars(p.totalCents)} · ${p.status}`, icon: <IconShoppingBag />,
        action: () => setView({ kind: 'purchaseOrderEditor', id: p.id }),
      })),
      ...rows('journal', data.journal.map((j) => ({ item: j, fields: [j.reference, j.memo, j.entryDate, `#${j.id}`] })), (j) => ({
        key: `journal-${j.id}`, label: j.memo || j.reference || `Journal entry #${j.id}`, sublabel: `${j.entryDate} · ${j.status}`, icon: <IconLedger />,
        action: () => setView({ kind: 'journalForm', id: j.id }),
      })),
      ...rows('product', data.products.map((p) => ({ item: p, fields: [p.name, p.sku, p.barcode, p.description] })), (p) => ({
        key: `product-${p.id}`, label: p.name, sublabel: p.sku ?? formatDollars(p.salePriceCents), icon: <IconShoppingBag />,
        action: () => { setPendingSearchTerm(p.name); setView({ kind: 'products' }); },
      })),
      ...rows('employee', data.employees.map((e) => ({ item: e, fields: [e.name] })), (e) => ({
        key: `employee-${e.id}`, label: e.name, sublabel: e.isActive ? 'Employee' : 'Inactive employee', icon: <IconPeople />, action: () => setView({ kind: 'payroll' }),
      })),
      ...rows('payrollRun', data.payrollRuns.map((r) => ({ item: r, fields: [employeeName.get(r.employeeId), r.payDate, r.payPeriodStart, r.payPeriodEnd] })), (r) => ({
        key: `payrun-${r.id}`, label: `${employeeName.get(r.employeeId) ?? 'Employee'} — paid ${r.payDate}`, sublabel: `${r.payPeriodStart} to ${r.payPeriodEnd} · ${r.status}`, icon: <IconPeople />,
        action: () => setView({ kind: 'paystub', runId: r.id }),
      })),
      ...rows('client', data.clients.map((c) => ({ item: c, fields: [c.clientName, c.phone, c.email] })), (c) => ({
        key: `client-${c.id}`, label: c.clientName, sublabel: c.phone ?? c.email ?? undefined, icon: <IconUsers />,
        action: () => { setView({ kind: 'clientHub' }); setPendingSearchTerm(c.clientName); },
      })),
      ...rows('deposit', data.deposits.map((d) => ({ item: d, fields: [d.depositDate, accountName.get(d.bankAccountId), 'deposit'] })), (d) => ({
        key: `deposit-${d.id}`, label: `Deposit ${d.depositDate}`, sublabel: accountName.get(d.bankAccountId), icon: <IconBank />, action: () => setView({ kind: 'deposits' }),
      })),
      ...rows('hstFiling', data.hstFilings.map((f) => ({ item: f, fields: [`${f.periodStart} ${f.periodEnd}`, f.memo, 'hst gst sales tax return'] })), (f) => ({
        key: `hst-${f.id}`, label: `GST/HST return ${f.periodStart} to ${f.periodEnd}`, icon: <IconDollarCircle />, action: () => setView({ kind: 'hstCentre' }),
      })),
      ...rows('mileage', data.mileage.map((m) => ({ item: m, fields: [m.purpose, m.vehicle, m.startLocation, m.endLocation, m.tripDate] })), (m) => ({
        key: `trip-${m.id}`, label: m.purpose, sublabel: `${m.tripDate} · ${m.kilometres} km`, icon: <IconCart />, action: () => setView({ kind: 'mileage' }),
      })),
      ...rows('recurring', data.recurring.map((t) => ({ item: t, fields: [t.name, t.description, accountName.get(t.categoryAccountId)] })), (t) => ({
        key: `recurring-${t.id}`, label: t.name, sublabel: `${formatDollars(t.amountCents)} · ${t.scheduleFrequency ?? 'on demand'}`, icon: <IconLedger />, action: () => setView({ kind: 'transactions' }),
      })),
      ...rows('tag', data.tags.map((t) => ({ item: t, fields: [t.name, t.description] })), (t) => ({
        key: `tag-${t.id}`, label: t.name, sublabel: t.description ?? undefined, icon: <IconLedger />, action: () => setView({ kind: 'tags' }),
      })),
      ...rows('company', data.companies.map((path) => ({ item: path, fields: [companyNameFromPath(path)] })), (path) => ({
        key: `company-${path}`, label: companyNameFromPath(path), sublabel: 'Open company file', icon: <IconBuilding />,
        action: async () => {
          const result = await window.api.company.open(path);
          if (result.ok && result.data.opened) setCompany(result.data.filePath, result.data.company.legalName);
        },
      })),
    ];
  }, [query, data, setView, setPendingSearchTerm, setCompany]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function runResult(row: ResultRow) {
    void row.action();
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = results[activeIndex];
      if (row) runResult(row);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-24" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl border border-gray-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search everything"
          placeholder="Search everything — invoices, bills, customers, vendors, entries, products, reports, pages…"
          className="w-full rounded-t-xl border-b border-gray-200 px-3 py-2 text-sm focus:outline-none"
        />
        <div className="max-h-[28rem] overflow-y-auto py-2">
          {results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-gray-400">{loading ? 'Loading…' : `No matches for "${query}".`}</p>
          )}
          {GROUPS.map((groupKey) => {
            const groupRows = results.filter((r) => r.group === groupKey);
            if (groupRows.length === 0) return null;
            return (
              <div key={groupKey}>
                <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{GROUP_LABELS[groupKey]}</div>
                {groupRows.map((row) => {
                  runningIndex += 1;
                  const rowIndex = runningIndex;
                  const isActive = rowIndex === activeIndex;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onMouseEnter={() => setActiveIndex(rowIndex)}
                      onClick={() => runResult(row)}
                      className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm ${isActive ? 'bg-brand-50 text-brand-900' : 'text-gray-700 hover:bg-gray-50'}`}
                    >
                      <span className="flex-shrink-0 text-gray-400">{row.icon}</span>
                      <span className="flex-1 truncate">{row.label}</span>
                      {row.sublabel && <span className="flex-shrink-0 text-xs text-gray-400">{row.sublabel}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="border-t border-gray-100 px-4 py-1.5 text-[11px] text-gray-400">
          ↑↓ to navigate · Enter to open · Esc to close{loading && ' · still loading records…'}
        </div>
      </div>
    </div>
  );
}
