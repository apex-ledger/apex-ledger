import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useUiStore, type View } from '../app/store/uiStore';
import { useEdition } from '../hooks/useEdition';
import type { Feature } from '@shared/domain/licensing/editions';
import { confirmDialog } from '../app/store/confirmStore';
import { Logo } from '../components/Logo';
import { IconBell, IconPencil, IconUserGroup } from '../components/icons';
import { webContext } from '../features/company-settings/WebOrganisationSection';
import {
  applyStoredOrder,
  loadColorOverrides,
  loadHiddenItems,
  resetSidebarPrefs,
  setItemHidden,
  storeColorOverride,
  storeSectionOrder,
  COLOR_SCHEMES,
  type ColorSchemeId,
  type SectionKey,
} from '../utils/sidebarPrefs';
import {
  IconBook,
  IconBuilding,
  IconCalendar,
  IconCart,
  IconFileText,
  IconGear,
  IconCalculator,
  IconHome,
  IconHelp,
  IconLedger,
  IconPeople,
  IconPercent,
  IconTaxForm,
  IconClipboardCheck,
  IconReceipt,
  IconShieldCheck,
  IconShoppingBag,
  IconUsers,
  IconMonitor,
} from '../components/icons';

type NavColor = 'blue' | 'emerald' | 'teal' | 'rose' | 'purple' | 'orange' | 'amber' | 'indigo' | 'cyan' | 'sky' | 'fuchsia' | 'violet';

export interface NavItem {
  label: string;
  view: View;
  color: NavColor;
  icon: ReactNode;
  /** The edition feature this screen belongs to. Items whose feature the licence does not include
   * are left out of the sidebar entirely rather than shown and refused — a menu full of things you
   * cannot use is worse than a shorter menu. */
  feature?: Feature;
  /** A high-value direct link into a parent centre. It stays fully visible and one click away, but
   * is indented so the sidebar distinguishes a destination from one of its important tabs. */
  shortcut?: boolean;
  /** Related screens folded under this one. The parent stays a real destination — clicking its
   * label still navigates — and the caret beside it opens the group, so a long flat list becomes a
   * short one without hiding anything behind an extra click. */
  children?: NavItem[];
}

/** The everyday entry screen is intentionally outside the reorderable accordion navigation. It
 * stays directly below New on every company and every device, so the most frequently used screen
 * is always one click away even when a user has a saved custom sidebar order. */
export const QUICK_ENTRY_NAV_ITEM: NavItem = {
  label: 'Quick Entry',
  view: { kind: 'quickEntry', type: 'expense' },
  color: 'orange',
  icon: <IconPencil />,
};

/** Web only, for the platform administrator and firm owners: one clean page for firms, seats,
 * company files and trial requests. Sits under Quick Entry, outside the reorderable list. */
export const ADMIN_NAV_ITEM: NavItem = {
  label: 'Administration',
  view: { kind: 'webAdmin' },
  color: 'purple',
  icon: <IconUserGroup />,
};

export const MAIN_NAV: NavItem[] = [
  { label: 'Dashboard', view: { kind: 'dashboard' }, color: 'blue', icon: <IconHome /> },
  { label: 'Action Centre', view: { kind: 'actionCentre' }, color: 'rose', icon: <IconBell /> },

  // QuickBooks-style work areas: the parent opens the hub and the caret exposes its related daily
  // tasks. Apex Ledger keeps only screens it really supports, so the groups stay compact.
  {
    label: 'Sales & Payments',
    view: { kind: 'sales' },
    color: 'emerald',
    icon: <IconCart />,
    children: [
      { label: 'All Sales', view: { kind: 'sales', tab: 'all' }, color: 'teal', icon: <IconLedger /> },
      { label: 'Invoices', view: { kind: 'sales', tab: 'invoices' }, color: 'sky', icon: <IconFileText /> },
      { label: 'Sales Receipts', view: { kind: 'sales', tab: 'receipts' }, color: 'cyan', icon: <IconReceipt /> },
      { label: 'Estimates', view: { kind: 'sales', tab: 'estimates' }, color: 'indigo', icon: <IconFileText /> },
      { label: 'Sales Orders', view: { kind: 'sales', tab: 'orders' }, color: 'violet', icon: <IconCart /> },
      { label: 'Customers', view: { kind: 'sales', tab: 'customers' }, color: 'sky', icon: <IconUsers /> },
      { label: 'Credit Notes', view: { kind: 'sales', tab: 'creditNotes' }, color: 'rose', icon: <IconFileText /> },
      { label: 'Deposits', view: { kind: 'sales', tab: 'deposits' }, color: 'emerald', icon: <IconBuilding /> },
    ],
  },
  {
    label: 'Expenses & Bills',
    view: { kind: 'expenses' },
    color: 'teal',
    icon: <IconShoppingBag />,
    children: [
      { label: 'Expense Transactions', view: { kind: 'expenses', tab: 'expense' }, color: 'rose', icon: <IconReceipt /> },
      { label: 'Vendor Bills', view: { kind: 'expenses', tab: 'bills' }, color: 'amber', icon: <IconReceipt /> },
      { label: 'Paid Bills', view: { kind: 'expenses', tab: 'paid' }, color: 'teal', icon: <IconFileText /> },
      { label: 'Vendors', view: { kind: 'expenses', tab: 'vendors' }, color: 'amber', icon: <IconBuilding /> },
      { label: 'Mileage', view: { kind: 'expenses', tab: 'mileage' }, color: 'indigo', icon: <IconCart /> },
    ],
  },
  {
    label: 'Banking & Accounting',
    view: { kind: 'accountantCentre' },
    color: 'blue',
    icon: <IconCalculator />,
    children: [
      { label: 'Client Overview', view: { kind: 'clientOverview' }, color: 'blue', icon: <IconShieldCheck /> },
      { label: 'Banking Overview', view: { kind: 'banking' }, color: 'blue', icon: <IconBuilding /> },
      { label: 'Bank Transactions', view: { kind: 'banking', tab: 'transactions' }, color: 'sky', icon: <IconLedger /> },
      { label: 'Receipt Inbox', view: { kind: 'receiptInbox' }, color: 'amber', icon: <IconReceipt /> },
      { label: 'Bank Reconciliation', view: { kind: 'banking', tab: 'reconcile' }, color: 'cyan', icon: <IconShieldCheck /> },
    ],
  },
  { label: 'Chart of Accounts', view: { kind: 'chartOfAccounts' }, color: 'sky', icon: <IconBook /> },
  { label: 'Journal Entries', view: { kind: 'journalList' }, color: 'indigo', icon: <IconLedger /> },
  { label: 'Fixed Assets', view: { kind: 'fixedAssets' }, color: 'teal', icon: <IconBuilding /> },
  { label: 'Approvals', view: { kind: 'approvals' }, color: 'amber', icon: <IconShieldCheck /> },
  { label: 'General Ledger', view: { kind: 'report', report: 'generalLedger' }, color: 'violet', icon: <IconBook /> },
  {
    label: 'Inventory',
    view: { kind: 'products' },
    color: 'emerald',
    icon: <IconShoppingBag />,
    feature: 'inventory',
    // The parent row already opens the items list, so it is not repeated as a child — two rows that
    // go to the same place is a menu that lies about how much it offers.
    children: [
      { label: 'Purchase Orders', view: { kind: 'purchaseOrders' }, color: 'indigo', icon: <IconFileText />, feature: 'inventory' },
    ],
  },
  { label: 'Projects', view: { kind: 'projects' }, color: 'indigo', icon: <IconLedger /> },
  { label: 'Payroll', view: { kind: 'payroll' }, color: 'indigo', icon: <IconPeople />, feature: 'payroll' },
  {
    label: 'Sales Tax (GST/HST)',
    view: { kind: 'hstCentre' },
    color: 'fuchsia',
    icon: <IconTaxForm />,
    children: [
      { label: 'GST/HST Payable', view: { kind: 'report', report: 'hstSummary' }, color: 'sky', icon: <IconTaxForm /> },
      { label: 'GST/HST Reconciliation', view: { kind: 'report', report: 'hstReconciliation' }, color: 'emerald', icon: <IconShieldCheck /> },
      { label: 'File GST/HST Return', view: { kind: 'report', report: 'hstFiling' }, color: 'rose', icon: <IconFileText /> },
      { label: 'Sales Tax Detail', view: { kind: 'report', report: 'salesTaxDetail' }, color: 'teal', icon: <IconLedger /> },
      { label: 'Sales Tax by Province', view: { kind: 'report', report: 'salesTaxByProvince' }, color: 'indigo', icon: <IconPercent /> },
      { label: 'GST/HST Quick Method', view: { kind: 'report', report: 'hstQuickMethod' }, color: 'cyan', icon: <IconCalculator /> },
    ],
  },

  // Close and review only after the daily source documents above are entered.
  { label: 'Auditor Centre', view: { kind: 'audit' }, color: 'rose', icon: <IconClipboardCheck /> },
  { label: 'Month-End Close', view: { kind: 'monthEndClose' }, color: 'violet', icon: <IconCalendar /> },
  { label: 'Business Tax & GIFI', view: { kind: 'taxGifi' }, color: 'purple', icon: <IconFileText /> },
  { label: 'Settings', view: { kind: 'companySettings' }, color: 'teal', icon: <IconGear /> },

  // Reports deliberately come last: enter and reconcile the books first, then review the output.
  {
    label: 'Reports & Analytics',
    view: { kind: 'reportsHub' },
    color: 'violet',
    icon: <IconClipboardCheck />,
    // The rail mirrors the hub's groups, the way the Sales rail mirrors its tabs: each item opens
    // the hub on that group, where every report in it is listed with its description.
    children: [
      { label: 'For my accountant', view: { kind: 'reportsHub', group: 'For my accountant' }, color: 'cyan', icon: <IconCalculator /> },
      { label: 'Who owes you (A/R)', view: { kind: 'reportsHub', group: 'Who owes you (A/R)' }, color: 'rose', icon: <IconReceipt /> },
      { label: 'Whom we owe (A/P)', view: { kind: 'reportsHub', group: 'Whom we owe (A/P)' }, color: 'amber', icon: <IconFileText /> },
      { label: 'Sales and customers', view: { kind: 'reportsHub', group: 'Sales and customers' }, color: 'emerald', icon: <IconCart /> },
      { label: 'Expenses and vendors', view: { kind: 'reportsHub', group: 'Expenses and vendors' }, color: 'orange', icon: <IconShoppingBag /> },
      { label: 'Payroll reports', view: { kind: 'reportsHub', group: 'Payroll' }, color: 'indigo', icon: <IconPeople /> },
      { label: 'Audit exceptions', view: { kind: 'reportsHub', group: 'Audit exceptions' }, color: 'rose', icon: <IconShieldCheck /> },
      { label: 'CPA year-end continuity', view: { kind: 'reportsHub', group: 'CPA year-end continuity' }, color: 'violet', icon: <IconLedger /> },
    ],
  },
];

/** Supporting destinations get their own clearly labelled section. Main business centres stay in
 * the canonical rail above, so this fills the workspace without repeating module-page tabs. */
export const BOOKKEEPING_NAV: NavItem[] = [
  { label: 'Access & Permissions', view: { kind: 'accessPermissions' }, color: 'indigo', icon: <IconShieldCheck /> },
  { label: 'Calendar', view: { kind: 'calendar' }, color: 'blue', icon: <IconCalendar /> },
  { label: 'Forms', view: { kind: 'forms' }, color: 'purple', icon: <IconFileText /> },
  { label: 'Audit', view: { kind: 'audit', tab: 'checks' }, color: 'emerald', icon: <IconShieldCheck /> },
  { label: 'Tools', view: { kind: 'tools' }, color: 'amber', icon: <IconCalculator /> },
  { label: 'User Guide', view: { kind: 'userGuide' }, color: 'sky', icon: <IconHelp /> },
  { label: 'Help & Tutor', view: { kind: 'helpTutor' }, color: 'emerald', icon: <IconHelp /> },
  { label: "What's new", view: { kind: 'whatsNew' }, color: 'emerald', icon: <IconHelp /> },
  { label: 'About', view: { kind: 'about' }, color: 'indigo', icon: <IconMonitor /> },
];
export const ACCOUNTING_NAV: NavItem[] = [];

// Every Tailwind class below is written out in full (not composed from a template string) so the
// Tailwind JIT compiler can actually find and generate it — dynamically built class names like
// `bg-${color}-600` are invisible to the scanner and silently produce no CSS.
//
// Inactive tabs all share one uniform light background (matching the sidebar's own bg-brand-50) so
// they blend into the sidebar at rest — the per-item color only appears once a tab is selected.
const INACTIVE_NAV_CLASS = 'bg-brand-50 text-brand-900 hover:bg-brand-100';

/** Parent/master destinations use the strong brand colour. A selected child remains light so the
 * open tree keeps its visual hierarchy instead of looking like two equally dark master tabs. */
export function navToneClass(active: boolean, nested: boolean, emphasized: boolean): string {
  if (active && nested) return 'bg-brand-100 text-brand-900 ring-1 ring-inset ring-brand-300';
  if (active) return 'bg-brand-800 text-white';
  if (emphasized) return 'text-gold-800 hover:bg-gold-100';
  return INACTIVE_NAV_CLASS;
}

function isActive(view: View, current: View): boolean {
  if (view.kind !== current.kind) return false;
  if (view.kind === 'report' && current.kind === 'report') return view.report === current.report;
  if (view.kind === 'quickEntry' && current.kind === 'quickEntry') return view.type === current.type;
  if (view.kind === 'banking' && current.kind === 'banking') return view.tab === current.tab;
  if (view.kind === 'sales' && current.kind === 'sales') return view.tab === current.tab;
  if (view.kind === 'purchases' && current.kind === 'purchases') return view.tab === current.tab;
  if (view.kind === 'expenses' && current.kind === 'expenses') return (view.tab ?? 'overview') === (current.tab ?? 'overview');
  // The hub parent (no group) is active on any hub page; a rail item only on its own group.
  if (view.kind === 'reportsHub' && current.kind === 'reportsHub') return view.group === undefined || view.group === current.group;
  return true;
}

/** Returns the single accordion group that owns a destination. Standalone destinations deliberately
 * return null so switching to Dashboard, Payroll, Settings, Forms, and similar pages closes every
 * previously expanded group. Exported for the navigation-behaviour regression test. */
export function expandedOwnerLabel(items: NavItem[], current: View): string | null {
  return (
    items.find(
      (item) =>
        (item.children?.length ?? 0) > 0 &&
        (isActive(item.view, current) ||
          item.children?.some((child) => isActive(child.view, current)) ||
          // Any report page belongs to the Reports group, whose rail lists the hub's groups rather than single reports.
          (item.view.kind === 'reportsHub' && (current.kind === 'report' || current.kind === 'reportsHub'))),
    )?.label ?? null
  );
}

interface NewMenuLink {
  label: string;
  view: View;
}

interface NewMenuGroup {
  heading: string;
  links: NewMenuLink[];
}

function NewMenuGroupBlock({ group, onPick }: { group: NewMenuGroup; onPick: (view: View) => void }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-brand-400">{group.heading}</div>
      <div className="space-y-0.5">
        {group.links.map((link) => (
          <button
            key={link.label}
            type="button"
            onClick={() => onPick(link.view)}
            className="block w-full rounded px-1.5 py-1 text-left text-sm text-brand-800 hover:bg-brand-50"
          >
            {link.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Mirrors QuickBooks' "+ New" quick-create menu — grouped shortcuts straight into a blank entry
// screen, so starting any common transaction is one click from anywhere in the app instead of
// first navigating to its page. Only lists things this app actually has (no estimates/sales
// orders/purchase orders/time tracking/inventory — none of those exist here). Grouped by
// transaction type (a money-in/money-out entry, a standing record, or a batch import) rather than
// by who the entry involves — a Bill and an Expense are both "money out" the same way an Invoice
// and a Sales Receipt are both "money in", so type is a more predictable grouping to scan than
// splitting the same shape of entry across a Customers/Vendors divide.
const NEW_MENU_GROUPS: NewMenuGroup[] = [
  {
    heading: 'Transactions',
    links: [
      { label: 'Invoice', view: { kind: 'invoiceEditor', id: 'new' } },
      { label: 'Sales Receipt', view: { kind: 'salesReceiptEditor', id: 'new' } },
      { label: 'Receive Payment', view: { kind: 'sales', tab: 'invoices' } },
      { label: 'Expense', view: { kind: 'quickEntry', type: 'expense' } },
      { label: 'Bill', view: { kind: 'expenses', tab: 'bills' } },
      { label: 'Journal Entry', view: { kind: 'journalForm', id: 'new' } },
      { label: 'Transfer', view: { kind: 'quickEntry', type: 'transfer' } },
    ],
  },
  {
    heading: 'Records',
    links: [
      { label: 'Add Customer', view: { kind: 'sales', tab: 'customers' } },
      { label: 'Add Vendor', view: { kind: 'expenses', tab: 'vendors' } },
    ],
  },
  {
    heading: 'Import',
    links: [
      { label: 'Import Bank Statement', view: { kind: 'bankImport' } },
      { label: 'Scan or Import Receipts', view: { kind: 'receiptInbox' } },
      { label: 'Batch Expense Import', view: { kind: 'bulkExpenseImport' } },
    ],
  },
];

function NewMenu() {
  const setView = useUiStore((s) => s.setView);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative px-2 pt-2" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-800 py-1.5 text-sm font-bold text-white shadow-sm hover:bg-brand-700"
      >
        New
      </button>
      {open && (
        <div className="absolute left-2 top-full z-30 mt-1.5 flex w-[27rem] max-h-[70vh] overflow-y-auto gap-3 rounded-lg border border-brand-200 bg-white p-3 text-brand-900 shadow-xl">
          {/* Two columns instead of one long stacked list — Transactions (the longest group) gets
              its own column, Records + Import share the other, so the panel opens short and wide
              rather than tall enough to cover the sidebar's own nav items below the button. */}
          <div className="flex-1">
            <NewMenuGroupBlock
              group={NEW_MENU_GROUPS[0]}
              onPick={(view) => {
                setView(view);
                setOpen(false);
              }}
            />
          </div>
          <div className="flex-1 space-y-3">
            {NEW_MENU_GROUPS.slice(1).map((group) => (
              <NewMenuGroupBlock
                key={group.heading}
                group={group}
                onPick={(view) => {
                  setView(view);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mt-3 mb-1 rounded bg-brand-800 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gold-300 shadow-sm">
      {label}
    </div>
  );
}

/** The 5 dots offered while customizing a tab's color — the exact same 5 color schemes as the
 * app-wide picker (Company Settings), reusing their swatch hex values directly, so "orange" (say)
 * always means the same orange everywhere rather than introducing a second, disconnected palette. */
function ColorSwatchRow({ current, onPick }: { current: ColorSchemeId | null; onPick: (id: ColorSchemeId | null) => void }) {
  return (
    <div className="flex items-center gap-1 pl-8 pb-1.5" onClick={(e) => e.stopPropagation()}>
      {COLOR_SCHEMES.map((scheme) => (
        <button
          key={scheme.id}
          type="button"
          title={scheme.label}
          onClick={() => onPick(current === scheme.id ? null : scheme.id)}
          className={`h-4 w-4 rounded-full border-2 transition-transform hover:scale-110 ${
            current === scheme.id ? 'border-gray-700' : 'border-white'
          }`}
          style={{ backgroundColor: scheme.brandSwatch }}
        />
      ))}
    </div>
  );
}

function NavButton({
  item,
  forceActive = false,
  emphasized = false,
  editMode = false,
  colorOverride,
  onPickColor,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  hidden = false,
  onToggleHidden,
  expandable = false,
  expanded = false,
  onToggleExpanded,
  nested = false,
}: {
  item: NavItem;
  /** Keeps a work-area parent highlighted while one of its child screens is active. */
  forceActive?: boolean;
  emphasized?: boolean;
  editMode?: boolean;
  colorOverride?: ColorSchemeId | null;
  onPickColor?: (id: ColorSchemeId | null) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /** Only meaningful in edit mode — a hidden item is filtered out of the list entirely otherwise
   * (see NavSection), so this only ever renders true while editMode is also true. */
  hidden?: boolean;
  onToggleHidden?: () => void;
  /** Set on a parent that has a group under it — renders the caret. */
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  /** Set on the items inside a group, so they read as belonging to the one above. */
  nested?: boolean;
}) {
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const receiptInboxPendingCount = useUiStore((s) => s.receiptInboxPendingCount);
  const actionCentreCount = useUiStore((s) => s.actionCentreCount);
  const active = forceActive || isActive(item.view, view);
  const badgeCount = item.view.kind === 'receiptInbox' ? receiptInboxPendingCount : item.view.kind === 'actionCentre' ? actionCentreCount : 0;
  const [flyoutPosition, setFlyoutPosition] = useState<{ left: number; top: number } | null>(null);
  const closeFlyoutTimer = useRef<number | null>(null);

  function openFlyout(element: HTMLElement) {
    if (!expandable || editMode || !item.children?.length) return;
    if (closeFlyoutTimer.current !== null) window.clearTimeout(closeFlyoutTimer.current);
    const rect = element.getBoundingClientRect();
    setFlyoutPosition({ left: rect.right + 4, top: Math.min(rect.top, window.innerHeight - Math.min(420, item.children.length * 42 + 24)) });
  }
  function keepFlyoutOpen() {
    if (closeFlyoutTimer.current !== null) window.clearTimeout(closeFlyoutTimer.current);
  }
  function closeFlyoutSoon() {
    closeFlyoutTimer.current = window.setTimeout(() => setFlyoutPosition(null), 140);
  }

  const overrideSwatch = colorOverride ? COLOR_SCHEMES.find((s) => s.id === colorOverride) : null;
  const activeStyle = active && !nested && overrideSwatch ? { backgroundColor: overrideSwatch.brandSwatch, color: '#fff' } : undefined;

  return (
    <div
      className={`rounded-lg ${nested ? 'ml-4 border-l border-brand-200 pl-1' : ''} ${hidden ? 'opacity-40' : ''}`}
      onMouseEnter={(event) => openFlyout(event.currentTarget)}
      onMouseLeave={closeFlyoutSoon}
    >
      <div className="flex items-center gap-1">
        {editMode && (
          <input
            type="checkbox"
            checked={!hidden}
            onChange={onToggleHidden}
            title={hidden ? 'Hidden — check to show in the sidebar' : 'Shown — uncheck to hide from the sidebar'}
            className="flex-shrink-0"
          />
        )}
        {editMode && (
          <div className="flex flex-shrink-0 flex-col gap-0.5">
            <button
              type="button"
              disabled={!canMoveUp}
              onClick={onMoveUp}
              title="Move up"
              className="flex h-5 w-5 items-center justify-center rounded bg-white text-sm leading-none text-gray-500 shadow-sm hover:bg-brand-100 hover:text-brand-800 disabled:opacity-25 disabled:hover:bg-white"
            >
              ▲
            </button>
            <button
              type="button"
              disabled={!canMoveDown}
              onClick={onMoveDown}
              title="Move down"
              className="flex h-5 w-5 items-center justify-center rounded bg-white text-sm leading-none text-gray-500 shadow-sm hover:bg-brand-100 hover:text-brand-800 disabled:opacity-25 disabled:hover:bg-white"
            >
              ▼
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => !editMode && setView(item.view)}
          style={active ? activeStyle : undefined}
          className={`flex flex-1 items-center gap-2.5 rounded-lg px-3 text-left text-sm font-semibold transition-colors ${
            emphasized ? 'py-2 tracking-wide' : 'py-1.5'
          } ${
            activeStyle ? '' : navToneClass(active, nested, emphasized)
          }`}
        >
          {nested && <span className="-mr-1 flex-shrink-0 text-xs opacity-40">↳</span>}
          <span className="flex-shrink-0">{item.icon}</span>
          <span className="flex-1 truncate">{item.label}</span>
          {!editMode && badgeCount > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-white text-red-600' : 'bg-red-100 text-red-800 ring-1 ring-red-200'}`}>
              {badgeCount}
            </span>
          )}
          {!editMode && active && !expandable && <span className="text-xs">›</span>}
          {/* The caret sits inside the nav button but stops the click reaching it, so opening the
              group and going to the page are two separate actions on one control. */}
          {expandable && !editMode && (
            <span
              role="button"
              tabIndex={0}
              aria-label={expanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
              aria-expanded={expanded}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpanded?.();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleExpanded?.();
                }
              }}
              className={`-mr-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs transition-transform ${
                active ? 'hover:bg-white/20' : 'hover:bg-brand-200'
              } ${expanded ? 'rotate-90' : ''}`}
            >
              ›
            </span>
          )}
        </button>
      </div>
      {editMode && onPickColor && <ColorSwatchRow current={colorOverride ?? null} onPick={onPickColor} />}
      {flyoutPosition && item.children && createPortal(
        <div
          role="menu"
          aria-label={`${item.label} tabs`}
          onMouseEnter={keepFlyoutOpen}
          onMouseLeave={closeFlyoutSoon}
          className="fixed z-[45] min-w-56 max-w-72 rounded-xl border border-gray-200 bg-gray-100 p-1.5 shadow-2xl"
          style={{ left: flyoutPosition.left, top: flyoutPosition.top }}
        >
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">{item.label}</div>
          {item.children.map((child) => {
            const childActive = isActive(child.view, view);
            return <button key={child.label} type="button" role="menuitem" onClick={() => { setView(child.view); setFlyoutPosition(null); }} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${childActive ? 'bg-brand-100 font-semibold text-brand-900' : 'text-gray-800 hover:bg-white'}`}><span className="text-gray-500">{child.icon}</span><span className="flex-1">{child.label}</span><span className="text-gray-400">›</span></button>;
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** One customizable, reorderable nav section — used for all three sections so the reorder and
 * color-override wiring only needs to be written once. Reordering is plain Up/Down buttons rather
 * than drag-and-drop — HTML5 native drag-and-drop turned out unreliable for this (didn't
 * consistently register drags starting on/near the nested <button>), and arrow buttons are both
 * simpler and impossible to get wrong. */
function NavSection({
  section,
  items,
  setItems,
  editMode,
  emphasized,
  colorOverrides,
  setColorOverrides,
  hiddenItems,
  onToggleHidden,
}: {
  section: SectionKey;
  items: NavItem[];
  setItems: (items: NavItem[]) => void;
  editMode: boolean;
  emphasized?: boolean;
  colorOverrides: Record<string, ColorSchemeId>;
  setColorOverrides: (next: Record<string, ColorSchemeId>) => void;
  hiddenItems: Set<string>;
  onToggleHidden: (label: string) => void;
}) {
  function moveBy(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    storeSectionOrder(section, next.map((i) => i.label));
  }

  // Hidden items are only shown (dimmed, with their checkbox unticked) while customizing — outside
  // edit mode they're fully removed from the list, which is the whole point of hiding one.
  // Anything the licence does not include is dropped, children included. Shown-and-refused is a
  // worse experience than a shorter menu, and it is the one people complain about.
  const { can } = useEdition();
  const licensed = items
    .filter((item) => !item.feature || can(item.feature))
    .map((item) => ({ ...item, children: item.children?.filter((c) => !c.feature || can(c.feature)) }));
  const visibleItems = editMode ? licensed : licensed.filter((item) => !hiddenItems.has(item.label));

  // Which groups are open.
  //
  const currentView = useUiStore((s) => s.view);
  // Accordion behaviour: at most one work area is open. Navigating into another grouped work area
  // closes the previous one; navigating to a standalone main destination closes every group.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => {
      const owner = expandedOwnerLabel(items, currentView);
      return owner ? new Set([owner]) : new Set();
    },
  );
  useEffect(() => {
    const owner = expandedOwnerLabel(items, currentView);
    setExpanded(owner ? new Set([owner]) : new Set());
  }, [currentView, items]);

  const toggleExpanded = (label: string) =>
    setExpanded((prev) => (prev.has(label) ? new Set() : new Set([label])));

  return (
    <>
      {visibleItems.map((item) => {
        const index = licensed.findIndex((i) => i.label === item.label);
        const hasChildren = (item.children?.length ?? 0) > 0;
        const descendantActive = item.children?.some((child) => isActive(child.view, currentView)) ?? false;
        const isOpen = expanded.has(item.label);
        return (
          <Fragment key={item.label}>
          <NavButton
            item={item}
            forceActive={descendantActive}
            nested={item.shortcut}
            expandable={hasChildren}
            expanded={isOpen}
            onToggleExpanded={() => toggleExpanded(item.label)}
            emphasized={emphasized}
            editMode={editMode}
            colorOverride={colorOverrides[item.label]}
            onPickColor={(id) => {
              storeColorOverride(item.label, id);
              const next = { ...colorOverrides };
              if (id === null) delete next[item.label];
              else next[item.label] = id;
              setColorOverrides(next);
            }}
            onMoveUp={() => moveBy(index, -1)}
            onMoveDown={() => moveBy(index, 1)}
            canMoveUp={index > 0}
            canMoveDown={index < items.length - 1}
            hidden={hiddenItems.has(item.label)}
            onToggleHidden={() => onToggleHidden(item.label)}
          />
          {/* Children are plain nav buttons, indented — so they keep the same active highlight,
              colour override and badge behaviour as everything else rather than being a second,
              subtly different kind of nav item. */}
          {hasChildren && isOpen && !editMode &&
            item.children!
              .filter((child) => !hiddenItems.has(child.label))
              .map((child) => (
                <NavButton
                  key={child.label}
                  item={child}
                  nested
                  colorOverride={colorOverrides[child.label]}
                />
              ))}
          </Fragment>
        );
      })}
    </>
  );
}

export function Sidebar() {
  const companyLegalName = useUiStore((s) => s.companyLegalName);
  const currentView = useUiStore((s) => s.view);
  const isDemoCompany = Boolean(companyLegalName && /\b(DEMO|TEST)\b/i.test(companyLegalName));
  const setReceiptInboxPendingCount = useUiStore((s) => s.setReceiptInboxPendingCount);
  const setActionCentreCount = useUiStore((s) => s.setActionCentreCount);
  const [editMode, setEditMode] = useState(false);
  const [mainNav, setMainNav] = useState<NavItem[]>(() => applyStoredOrder('main', MAIN_NAV));
  const [bookkeepingNav, setBookkeepingNav] = useState<NavItem[]>(() => applyStoredOrder('bookkeeping', BOOKKEEPING_NAV));
  const [accountingNav, setAccountingNav] = useState<NavItem[]>(() => applyStoredOrder('accounting', ACCOUNTING_NAV));
  const [colorOverrides, setColorOverrides] = useState<Record<string, ColorSchemeId>>(() => loadColorOverrides());
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(() => loadHiddenItems());

  function toggleHidden(label: string) {
    const next = !hiddenItems.has(label);
    setItemHidden(label, next);
    setHiddenItems((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(label);
      else copy.delete(label);
      return copy;
    });
  }

  useEffect(() => {
    function refresh() {
      window.api.receiptInbox.list().then((r) => r.ok && setReceiptInboxPendingCount(r.data.length));
      window.api.actionCentre.items().then((r) => r.ok && setActionCentreCount(r.data.counts.overdue + r.data.counts.today + r.data.counts.soon));
    }
    refresh();
    const intervalId = setInterval(refresh, 60000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReset() {
    if (!(await confirmDialog('Reset the sidebar to its default order and colors?'))) return;
    resetSidebarPrefs();
    setMainNav(MAIN_NAV);
    setBookkeepingNav(BOOKKEEPING_NAV);
    setAccountingNav(ACCOUNTING_NAV);
    setColorOverrides({});
    setHiddenItems(new Set());
  }

  return (
    // z-40 is load-bearing, not decoration. apple.css puts a backdrop-filter on `aside`, and a
    // backdrop-filter creates a STACKING CONTEXT — so every z-index inside this element (the
    // "+ New" quick-create menu at z-30, the flyouts) is scoped to this layer and can never rise
    // above it. Without a z-index here the aside sits at `auto` and paints in DOM order, which puts
    // the main content on top of the whole sidebar: the New menu opened UNDERNEATH the page. Giving
    // the sidebar its own stacking order above the content fixes every popover inside it at once.
    // Kept below the Modal overlay's z-50 so dialogs still cover the sidebar.
    <aside className="relative z-40 flex h-full w-[15.5rem] flex-shrink-0 flex-col border-r border-brand-200 bg-brand-50 text-brand-900">
      <div className="border-b border-brand-200 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <Logo size="sm" />
          <button
            type="button"
            title={editMode ? 'Done customizing' : 'Customize navigation'}
            onClick={() => setEditMode((v) => !v)}
            className={`flex-shrink-0 rounded-full p-1.5 ${editMode ? 'bg-gold-200 text-gold-800' : 'text-brand-700 hover:bg-brand-100 hover:text-brand-900'}`}
          >
            <IconPencil width={15} height={15} />
          </button>
        </div>
        <div className="mt-2 rounded-lg border border-brand-200 bg-white px-2.5 py-2 shadow-sm">
          <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-brand-500">Open company</div>
          <div className="mt-0.5 flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate text-sm font-bold text-brand-900">
              {companyLegalName || 'No company open'}
            </div>
            {isDemoCompany && (
              <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                DEMO / TEST
              </span>
            )}
          </div>
        </div>
      </div>

      <NewMenu />

      <div className="px-2 pt-2">
        <NavButton
          item={QUICK_ENTRY_NAV_ITEM}
          forceActive={currentView.kind === 'quickEntry'}
          emphasized
        />
      </div>
      {(() => { const w = webContext(); return w && (w.org.isPlatform || w.user.role === 'owner'); })() && (
        <div className="px-2 pt-1">
          <NavButton item={ADMIN_NAV_ITEM} forceActive={currentView.kind === 'webAdmin'} emphasized />
        </div>
      )}

      {editMode && (
        <div className="border-b border-brand-200 bg-brand-100 px-3 py-2 text-[11px] text-brand-700">
          Tap <span className="font-bold">▲▼</span> to reorder, tap a dot to color a tab, uncheck to hide it.{' '}
          <button type="button" onClick={handleReset} className="font-semibold text-brand-900 underline">
            Reset
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <NavSection
          section="main"
          items={mainNav}
          setItems={setMainNav}
          editMode={editMode}
          colorOverrides={colorOverrides}
          setColorOverrides={setColorOverrides}
          hiddenItems={hiddenItems}
          onToggleHidden={toggleHidden}
        />
        <SectionHeader label="More" />
        <NavSection
          section="bookkeeping"
          items={bookkeepingNav}
          setItems={setBookkeepingNav}
          editMode={editMode}
          colorOverrides={colorOverrides}
          setColorOverrides={setColorOverrides}
          hiddenItems={hiddenItems}
          onToggleHidden={toggleHidden}
        />
      </nav>
    </aside>
  );
}
