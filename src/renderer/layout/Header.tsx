import { clientForOpenFile } from '@shared/domain/clients/bookkeepingClients';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useUiStore } from '../app/store/uiStore';
import { useUnsavedChangesStore } from '../app/store/unsavedChangesStore';
import { useEdition } from '../hooks/useEdition';
import { useAppVersion } from '../hooks/useAppVersion';
import { confirmDialog } from '../app/store/confirmStore';
import { DEFAULT_FONT_SIZE, FONT_SIZES } from '../utils/fontSize';
import { DEFAULT_FONT_FAMILY, FONT_FAMILIES } from '../utils/fontFamily';
import { DEFAULT_ZOOM_PERCENT, ZOOM_LEVELS, ZOOM_STEP_PERCENT } from '../utils/zoom';
import { Modal } from '../components/Modal';
import { AiChatPanel } from './AiChatPanel';
import { VoiceAgentPanel } from './VoiceAgentPanel';
import { ReceivePaymentModal } from '../features/invoices/ReceivePaymentModal';
import { PayBillModal } from '../features/purchases/PayBillModal';
import { QuickSearchPalette } from './QuickSearchPalette';
import { useIpcQuery } from '../hooks/useIpcQuery';
import { storeAccessRole } from '../utils/accessRole';
import { isWeb } from '../utils/platform';
import { FeedbackDialog } from './FeedbackDialog';

/** Feedback: on the web a dialog that posts to the server (the Header listens for this event);
 * on the desktop the mail client, as before. Shared by the header button and both menus. */
function sendFeedback(): void {
  if (isWeb()) window.dispatchEvent(new Event('apex:feedback'));
  else window.open('mailto:info@pjinsuretax.ca?subject=Apex Ledger Feedback');
}
import {
  IconBank,
  IconBillPlus,
  IconBook,
  IconCalculator,
  IconCamera,
  IconChevronDown,
  IconCloudUpload,
  IconDollarCircle,
  IconGear,
  IconHelp,
  IconInvoicePlus,
  IconLedger,
  IconLock,
  IconMonitor,
  IconRedo,
  IconRefresh,
  IconSave,
  IconSearch,
  IconSparkles,
  IconUndo,
  IconUserGroup,
  IconBell,
} from '../components/icons';

type ActionColor = 'rose' | 'emerald' | 'orange' | 'blue' | 'purple' | 'violet' | 'cyan' | 'gray';

// Written out in full (not composed from a template string) so Tailwind's JIT scanner can find
// and generate these classes — see the same note in Sidebar.tsx.
//
// Uniform light background (matching the header's own bg-white) at rest so buttons blend into the
// toolbar instead of showing as separate colored blocks — each button's color only shows on hover.
const ACTION_COLOR_CLASSES: Record<ActionColor, string> = {
  rose: 'text-rose-700 bg-white hover:bg-rose-50',
  emerald: 'text-emerald-700 bg-white hover:bg-emerald-50',
  orange: 'text-orange-700 bg-white hover:bg-orange-50',
  blue: 'text-blue-700 bg-white hover:bg-blue-50',
  purple: 'text-purple-700 bg-white hover:bg-purple-50',
  violet: 'text-violet-700 bg-white hover:bg-violet-50',
  cyan: 'text-cyan-700 bg-white hover:bg-cyan-50',
  gray: 'text-gray-500 bg-white hover:bg-gray-50',
};

/** The browser-style back/forward pair.
 *
 * Disabled at each end rather than hidden, so the control does not appear and vanish as you move
 * around — a button that comes and goes is harder to aim at than one that greys out. */
function HistoryArrows() {
  const goBack = useUiStore((s) => s.goBack);
  const goForward = useUiStore((s) => s.goForward);
  const history = useUiStore((s) => s.history);

  // Alt+Left / Alt+Right, and the side buttons on a mouse — the same gestures every browser
  // answers to, so the hand that already knows them does not have to learn anything here.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goForward();
      }
    }
    function onMouse(e: MouseEvent) {
      if (e.button === 3) {
        e.preventDefault();
        goBack();
      } else if (e.button === 4) {
        e.preventDefault();
        goForward();
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onMouse);
    };
  }, [goBack, goForward]);

  const backDisabled = history.index <= 0;
  const forwardDisabled = history.index < 0 || history.index >= history.entries.length - 1;

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Page history">
      <button
        type="button"
        aria-label="Back"
        title="Back"
        disabled={backDisabled}
        onClick={goBack}
        className="rounded-full px-3 py-1 text-lg font-bold leading-none text-gray-800 transition-colors hover:bg-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent"
      >
        <span aria-hidden="true">←</span>
      </button>
      <button
        type="button"
        aria-label="Forward"
        title="Forward"
        disabled={forwardDisabled}
        onClick={goForward}
        className="rounded-full px-3 py-1 text-lg font-bold leading-none text-gray-800 transition-colors hover:bg-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent"
      >
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  comingSoon,
  busy,
  color = 'gray',
  badge = 0,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  comingSoon?: boolean;
  busy?: boolean;
  color?: ActionColor;
  /** A count shown in a red pill at the top corner; hidden when zero. */
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={comingSoon ? `${label} — coming soon` : label}
      className={`relative flex w-16 flex-col items-center gap-1 rounded-full px-2 py-1.5 transition-colors disabled:opacity-50 ${ACTION_COLOR_CLASSES[color]}`}
    >
      {icon}
      <span className="text-[10px] font-bold leading-none">{label}</span>
      {comingSoon && <span className="absolute -top-1 right-1 rounded-full bg-gold-400 px-1 text-[8px] font-bold text-white">SOON</span>}
      {badge > 0 && <span className="absolute -top-1 right-0 rounded-full bg-red-600 px-1.5 text-[9px] font-bold text-white">{badge}</span>}
    </button>
  );
}

function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const version = useAppVersion();
  return (
    <Modal open={open} onClose={onClose} title="Help">
      <div className="space-y-3 text-sm text-gray-700">
        <p>
          <strong>Quick Add</strong> (sidebar) is the fastest way to record an expense, sale, or import a bank/credit
          card statement — no debits/credits needed, it's built automatically.
        </p>
        <p>
          <strong>GST/HST Centre</strong> (sidebar) covers everything HST: the Payable summary, a Reconciliation
          double-check, and the filing itself. For a receipt whose HST is not a clean 13% (wholesale, cash-and-carry, mixed
          groceries), pick the Custom rate tax code on the entry and type the exact HST in its Tax Amt box.
        </p>
        <p>
          <strong>Backup</strong> (toolbar) saves a full copy of your company file under a new name/location — good
          practice before year-end or a big cleanup. The app also keeps its own automatic backups (once a day, and
          on quit) in a "Backups" folder next to your company file, keeping the last 14 — no action needed, but
          worth knowing they're there.
        </p>
        <p className="text-gray-500">Apex Ledger {version ?? ''}.</p>
      </div>
    </Modal>
  );
}

function KeyboardShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const shortcuts = [
    ['Ctrl+K', 'Open Quick Search'],
    ['Alt+Left', 'Go back'],
    ['Alt+Right', 'Go forward'],
    ['Ctrl+Z / Ctrl+Y', 'Undo / redo in the focused field'],
    ['Ctrl+X / Ctrl+C / Ctrl+V', 'Cut / copy / paste in the focused field'],
    ['Ctrl+A', 'Select all in the focused field'],
    ['Esc', 'Close the current dialog'],
  ];
  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts">
      <div className="divide-y divide-gray-100">
        {shortcuts.map(([keys, description]) => (
          <div key={keys} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="text-gray-700">{description}</span>
            <kbd className="whitespace-nowrap rounded border border-gray-300 bg-gray-50 px-2 py-1 font-mono text-xs font-semibold text-gray-700">{keys}</kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** Guards File > Delete Company & Data — the most destructive action in the app, so a plain
 * window.confirm() isn't enough. Requires typing the company's exact legal name back (the same
 * "type to confirm" pattern most software uses for irreversible deletes) before the button
 * enables at all. */
function DeleteCompanyModal({
  open,
  onClose,
  companyLegalName,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  companyLegalName: string;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTyped('');
      setError(null);
    }
  }, [open]);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const result = await window.api.company.deleteCurrent();
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onDeleted();
  }

  const matches = typed.trim() === companyLegalName.trim();

  return (
    <Modal open={open} onClose={onClose} title="Delete Company & Data">
      <div className="space-y-3">
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          This permanently deletes <strong>{companyLegalName}</strong> — every account, transaction, invoice, bill, client, and its
          backups. This cannot be undone from within Apex Ledger. Consider using File &gt; Save Company As… to make a copy first if
          you're not certain.
        </div>
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <label className="block text-sm">
          <span className="text-gray-600">
            Type the company name (<strong>{companyLegalName}</strong>) to confirm:
          </span>
          <input
            autoFocus
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={busy}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={!matches || busy}
            onClick={handleDelete}
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Permanently Delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

type MenuBarItem =
  | { separator: true }
  | { separator?: false; label: string; onClick: () => void; disabled?: boolean; submenu?: undefined; shortcut?: string }
  | { separator?: false; label: string; submenu: { label: string; onClick: () => void }[]; onClick?: undefined; disabled?: undefined };

/** One dropdown in the top menu bar — same interaction pattern as CompanySwitcher's dropdown
 * (click to open, click-away/blur to close), just generalized to a plain item list so File/Edit/
 * Help can all share it instead of each hand-rolling their own open/close state. An item with a
 * `submenu` instead of `onClick` opens a nested flyout to the right on hover, same as a native
 * Windows menu's ">" arrow items (used for the Edit menu's Font Size picker). */
function MenuBarDropdown({ label, items }: { label: string; items: MenuBarItem[] }) {
  const [open, setOpen] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className={`rounded px-2.5 py-1 text-sm font-medium text-brand-100 transition-colors hover:bg-white/10 ${open ? 'bg-white/10' : ''}`}
      >
        {label}
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 text-gray-700 shadow-lg">
          {items.map((item, i) =>
            item.separator ? (
              <div key={i} className="my-1 border-t border-gray-100" />
            ) : item.submenu ? (
              <div key={item.label} className="relative" onMouseEnter={() => setOpenSubmenu(item.label)} onMouseLeave={() => setOpenSubmenu(null)}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                >
                  {item.label}
                  <span className="text-gray-400">›</span>
                </button>
                {openSubmenu === item.label && (
                  <div className="absolute left-full top-0 z-40 w-44 rounded-lg border border-gray-200 bg-white py-1 text-gray-700 shadow-lg">
                    {item.submenu.map((sub) => (
                      <button
                        key={sub.label}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setOpen(false);
                          setOpenSubmenu(null);
                          sub.onClick();
                        }}
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-white"
              >
                <span>{item.label}</span>
                {item.shortcut && <span className="text-xs text-gray-400">{item.shortcut}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

interface SettingsMenuGroup {
  heading: string;
  links: { label: string; onClick: () => void }[];
}

/** The gear icon's dropdown — mirrors QuickBooks' Settings mega-menu, but only lists what this
 * app actually has (no multi-user team/billing/subscriptions concepts — this is a single-company
 * desktop app, not a multi-tenant SaaS). */
function SettingsMenu() {
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

  function go(view: Parameters<typeof setView>[0]) {
    setView(view);
    setOpen(false);
  }

  const groups: SettingsMenuGroup[] = [
    {
      heading: 'Settings',
      links: [
        { label: 'Company Settings', onClick: () => go({ kind: 'companySettings' }) },
        { label: 'Chart of Accounts', onClick: () => go({ kind: 'chartOfAccounts' }) },
        { label: 'Payroll Settings', onClick: () => go({ kind: 'payroll' }) },
      ],
    },
    {
      heading: 'Tools',
      links: [
        { label: 'Import Data (QuickBooks / Xero)', onClick: () => go({ kind: 'qbImport' }) },
        { label: 'Export Data', onClick: () => go({ kind: 'companySettings' }) },
        { label: 'Reconcile', onClick: () => go({ kind: 'bankReconciliation' }) },
        { label: 'Accounting Audit Log', onClick: () => go({ kind: 'audit' }) },
        { label: 'Tools & Links', onClick: () => go({ kind: 'tools' }) },
        { label: 'Knowledge Base', onClick: () => go({ kind: 'knowledgeBase' }) },
      ],
    },
    {
      heading: 'Company',
      links: [
        { label: 'User Guide', onClick: () => go({ kind: 'userGuide' }) },
        { label: 'Send Feedback', onClick: sendFeedback },
      ],
    },
  ];

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Settings"
        className={`rounded-full p-1.5 hover:bg-brand-100 hover:text-brand-700 ${open ? 'bg-brand-100 text-brand-700' : ''}`}
      >
        <IconGear width={18} height={18} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1.5 grid grid-cols-3 gap-3 rounded-lg border border-gray-200 bg-white p-3 text-gray-700 shadow-xl" style={{ width: '32rem' }}>
          {groups.map((group) => (
            <div key={group.heading}>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">{group.heading}</div>
              <div className="space-y-0.5">
                {group.links.map((link) => (
                  <button
                    key={link.label}
                    type="button"
                    onClick={link.onClick}
                    className="block w-full rounded px-1.5 py-1 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The classic File / Edit / Help trio, restyled to match the app's own dark header instead of
 * looking like a generic Windows menu bar. File covers the same company actions as
 * CompanySwitcher's dropdown (kept alongside it, not replacing it — two paths to the same place is
 * harmless). Edit uses document.execCommand, which Chromium still honours for the focused
 * editable element — the same thing a native Edit menu would have triggered. */
function AppMenuBar({
  onOpenHelp,
  onOpenShortcuts,
  onOpenQuickSearch,
  onBackup,
  onCheckUpdates,
  backingUp,
  checkingForUpdates,
}: {
  onOpenHelp: () => void;
  onOpenShortcuts: () => void;
  onOpenQuickSearch: () => void;
  onBackup: () => void;
  onCheckUpdates: () => void;
  backingUp: boolean;
  checkingForUpdates: boolean;
}) {
  const setView = useUiStore((s) => s.setView);
  const companyPath = useUiStore((s) => s.companyPath);
  const companyLegalName = useUiStore((s) => s.companyLegalName);
  const setCompany = useUiStore((s) => s.setCompany);
  const setShowNewCompanyModal = useUiStore((s) => s.setShowNewCompanyModal);
  const fontSize = useUiStore((s) => s.fontSize);
  const setFontSize = useUiStore((s) => s.setFontSize);
  const fontFamily = useUiStore((s) => s.fontFamily);
  const setFontFamily = useUiStore((s) => s.setFontFamily);
  const [showDeleteCompany, setShowDeleteCompany] = useState(false);
  const [pdfMessage, setPdfMessage] = useState<string | null>(null);

  async function handleOpen(filePath?: string) {
    const result = await window.api.company.open(filePath);
    if (result.ok && result.data.opened) setCompany(result.data.filePath, result.data.company.legalName);
  }

  async function handleSaveAs() {
    const result = await window.api.company.saveAs();
    if (result.ok && result.data.saved) setCompany(result.data.filePath, result.data.company.legalName);
  }

  async function handleClose() {
    if (!(await confirmDialog('Close the current company file? You can reopen it any time from Open Company File… or Open Recent.'))) return;
    const result = await window.api.company.close();
    if (result.ok) setCompany(null, null);
  }

  async function handleExit() {
    if (!(await confirmDialog('Exit Apex Ledger?'))) return;
    await window.api.app.quit();
  }

  async function handleSaveAsPdf() {
    setPdfMessage(null);
    const result = await window.api.app.savePdf();
    if (!result.ok) return setPdfMessage(`Could not save PDF: ${result.error}`);
    if (result.data.saved) setPdfMessage(`Saved to ${result.data.filePath}`);
  }

  function execEdit(command: string) {
    document.execCommand(command);
  }

  // Recent companies live in the Open Company dialog / CompanySwitcher (top-right) and Welcome
  // screen already — this menu stays a short, standard File menu rather than duplicating a
  // growing company list here too.
  const fileItems: MenuBarItem[] = [
    { label: 'New Company…', onClick: () => setShowNewCompanyModal(true) },
    { label: 'Open Company…', onClick: () => handleOpen() },
    { separator: true },
    { label: 'Save Company As…', onClick: handleSaveAs, disabled: !companyPath },
    { label: backingUp ? 'Backing Up…' : 'Backup Company Now…', onClick: onBackup, disabled: !companyPath || backingUp },
    { label: 'View / Restore Recovery Points…', onClick: () => setView({ kind: 'actionCentre' }), disabled: !companyPath },
    { label: 'Close Company', onClick: handleClose, disabled: !companyPath },
    { separator: true },
    { label: 'Import Data (QuickBooks / Xero)…', onClick: () => setView({ kind: 'qbImport' }), disabled: !companyPath },
    { label: 'Export Data…', onClick: () => setView({ kind: 'companySettings' }), disabled: !companyPath },
    { separator: true },
    { label: 'Print Current View…', onClick: () => window.print() },
    { label: 'Save as PDF…', onClick: handleSaveAsPdf, disabled: !companyPath },
    { separator: true },
    { label: 'Delete Company & Data…', onClick: () => setShowDeleteCompany(true), disabled: !companyPath },
    { separator: true },
    { label: 'Exit', onClick: handleExit },
  ];

  const editItems: MenuBarItem[] = [
    { label: 'Undo', shortcut: 'Ctrl+Z', onClick: () => execEdit('undo') },
    { label: 'Redo', shortcut: 'Ctrl+Y', onClick: () => execEdit('redo') },
    { separator: true },
    { label: 'Cut', shortcut: 'Ctrl+X', onClick: () => execEdit('cut') },
    { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => execEdit('copy') },
    { label: 'Paste', shortcut: 'Ctrl+V', onClick: () => execEdit('paste') },
    { separator: true },
    { label: 'Select All', shortcut: 'Ctrl+A', onClick: () => execEdit('selectAll') },
    { separator: true },
    { label: 'Quick Search…', shortcut: 'Ctrl+K', onClick: onOpenQuickSearch },
    { separator: true },
    {
      label: 'Font',
      submenu: FONT_FAMILIES.map((f) => ({
        label: `${f.label}${fontFamily === f.id ? ' ✓' : ''}`,
        onClick: () => setFontFamily(f.id),
      })),
    },
    {
      label: 'Font Size',
      submenu: FONT_SIZES.map((size) => ({
        label: `${size.label}${fontSize === size.id ? ' ✓' : ''}`,
        onClick: () => setFontSize(size.id),
      })),
    },
    { label: 'Reset Font and Size', onClick: () => { setFontFamily(DEFAULT_FONT_FAMILY); setFontSize(DEFAULT_FONT_SIZE); } },
  ];

  const helpItems: MenuBarItem[] = [
    { label: 'User Guide', onClick: () => setView({ kind: 'userGuide' }) },
    { label: 'Quick Help', onClick: onOpenHelp },
    { label: 'Knowledge Base', onClick: () => setView({ kind: 'knowledgeBase' }) },
    { label: 'Keyboard Shortcuts', onClick: onOpenShortcuts },
    { separator: true },
    ...(isWeb() ? [] : [{ label: checkingForUpdates ? 'Checking for Updates…' : 'Check for Updates…', onClick: onCheckUpdates, disabled: checkingForUpdates }]),
    { label: 'About & License', onClick: () => setView({ kind: 'about' }) },
    { separator: true },
    { label: 'Contact Support', onClick: () => window.open('mailto:info@pjinsuretax.ca?subject=Apex Ledger Support') },
    { label: 'Send Feedback', onClick: sendFeedback },
  ];

  return (
    <div className="flex items-center gap-0.5">
      <MenuBarDropdown label="File" items={fileItems} />
      <MenuBarDropdown label="Edit" items={editItems} />
      <MenuBarDropdown label="Help" items={helpItems} />
      {pdfMessage && (
        <div className="fixed right-4 top-14 z-50 max-w-sm rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 shadow-lg">
          {pdfMessage}
          <button type="button" onClick={() => setPdfMessage(null)} className="ml-2 text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
      )}
      {companyLegalName && (
        <DeleteCompanyModal
          open={showDeleteCompany}
          onClose={() => setShowDeleteCompany(false)}
          companyLegalName={companyLegalName}
          onDeleted={() => {
            setShowDeleteCompany(false);
            setCompany(null, null);
          }}
        />
      )}
    </div>
  );
}

/** Browser-style zoom (see the preload's zoom.set — a real webFrame zoom factor, not just a
 * font-size bump), so zooming out actually fits more table columns on screen at once, not only
 * smaller text. Persisted per the same localStorage pattern as Font Size, applied by App.tsx. */
function ZoomControl() {
  const zoomPercent = useUiStore((s) => s.zoomPercent);
  const setZoomPercent = useUiStore((s) => s.setZoomPercent);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex items-center gap-0.5 rounded-full border border-brand-700 bg-brand-800 px-0.5 py-0.5">
      <button
        type="button"
        onClick={() => setZoomPercent(zoomPercent - ZOOM_STEP_PERCENT)}
        title="Zoom out"
        className="rounded-full px-1.5 py-1 text-sm font-bold leading-none text-brand-100 hover:bg-brand-700"
      >
        −
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        title="Zoom level"
        className={`min-w-[3rem] rounded px-1 py-1 text-xs font-semibold text-brand-100 hover:bg-brand-700 ${open ? 'bg-brand-700' : ''}`}
      >
        {zoomPercent}%
      </button>
      <button
        type="button"
        onClick={() => setZoomPercent(zoomPercent + ZOOM_STEP_PERCENT)}
        title="Zoom in"
        className="rounded-full px-1.5 py-1 text-sm font-bold leading-none text-brand-100 hover:bg-brand-700"
      >
        +
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-28 rounded-lg border border-gray-200 bg-white py-1 text-gray-700 shadow-lg">
          {ZOOM_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setZoomPercent(level);
                setOpen(false);
              }}
              className={`block w-full px-3 py-1 text-left text-sm hover:bg-gray-50 ${level === zoomPercent ? 'font-semibold text-brand-700' : ''}`}
            >
              {level}%
            </button>
          ))}
          <div className="my-1 border-t border-gray-100" />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setZoomPercent(DEFAULT_ZOOM_PERCENT);
              setOpen(false);
            }}
            className="block w-full px-3 py-1 text-left text-sm hover:bg-gray-50"
          >
            Reset to 100%
          </button>
        </div>
      )}
    </div>
  );
}

function CompanySwitcher() {
  const companyLegalName = useUiStore((s) => s.companyLegalName);
  const companyPath = useUiStore((s) => s.companyPath);
  const setCompany = useUiStore((s) => s.setCompany);
  const setShowNewCompanyModal = useUiStore((s) => s.setShowNewCompanyModal);
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [bookkeepingClientName, setBookkeepingClientName] = useState<string | null>(null);

  useEffect(() => {
    if (open) window.api.company.listRecent().then((r) => r.ok && setRecents(r.data));
  }, [open]);

  // Which client's books are open. Re-read only when the file changes, since that is the only
  // thing that can change the answer.
  useEffect(() => {
    if (!companyPath) return setBookkeepingClientName(null);
    window.api.clients.list().then((r) => {
      if (!r.ok) return setBookkeepingClientName(null);
      setBookkeepingClientName(clientForOpenFile(r.data, companyPath)?.clientName ?? null);
    });
  }, [companyPath]);

  async function handleOpen(filePath?: string) {
    setOpen(false);
    const result = await window.api.company.open(filePath);
    if (result.ok && result.data.opened) setCompany(result.data.filePath, result.data.company.legalName);
  }

  async function handleSaveAs() {
    setOpen(false);
    const result = await window.api.company.saveAs();
    if (result.ok && result.data.saved) setCompany(result.data.filePath, result.data.company.legalName);
  }

  async function handleClose() {
    setOpen(false);
    if (!(await confirmDialog('Close the current company file? You can reopen it any time from Open Company File… or Open Recent.'))) return;
    const result = await window.api.company.close();
    if (result.ok) setCompany(null, null);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
      >
        {companyLegalName ?? 'No company open'}
        {/* Whose books these are, when the open file belongs to a bookkeeping client. Without it,
            the only thing on screen naming the company is its own legal name — which is not always
            what the practice calls the client, and gives no warning when the wrong file is open. */}
        {bookkeepingClientName && bookkeepingClientName !== companyLegalName && (
          <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[11px] font-medium text-brand-800" title="Bookkeeping client">
            {bookkeepingClientName}
          </span>
        )}
        <IconChevronDown className="text-gray-400" width={14} height={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded border border-gray-200 bg-white py-1 shadow-lg">
          {recents.map((path) => (
            <button
              key={path}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleOpen(path)}
              className="block w-full truncate px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
              title={path}
            >
              {path.split(/[\\/]/).pop()}
            </button>
          ))}
          <div className="my-1 border-t border-gray-100" />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleOpen()}
            className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            Open Company File…
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen(false);
              setShowNewCompanyModal(true);
            }}
            className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            New Company…
          </button>
          {companyPath && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleSaveAs}
                className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                Save Company As…
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleClose}
                className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                Close Company
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function Header() {
  const setView = useUiStore((s) => s.setView);
  const { data: identity } = useIpcQuery(() => window.api.access.getIdentity(), []);
  const { data: sessionUsers } = useIpcQuery(() => window.api.access.sessionUsersList(), []);
  async function switchUser(key: string) {
    if (key === identity?.key) return;
    const id = Number(key.replace('company-user:', ''));
    const request = key === 'local:administrator' ? { key } : Number.isInteger(id) && id > 0 ? { id } : null;
    if (!request) return;
    const result = await window.api.access.switchUser(request);
    if (result.ok) storeAccessRole(result.data.role);
  }
  const actionCentreCount = useUiStore((s) => s.actionCentreCount);
  const { can } = useEdition();
  const setSessionLocked = useUiStore((s) => s.setSessionLocked);
  const bumpRefreshNonce = useUiStore((s) => s.bumpRefreshNonce);
  const [toast, setToast] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  // The two money-in / money-out actions open their form directly: choose the customer or vendor
  // and the unpaid document there, instead of going to a list and finding a row first.
  const [showReceivePayment, setShowReceivePayment] = useState(false);
  const [showPayBill, setShowPayBill] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  const showVoice = useUiStore((s) => s.helpTutorOpen);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  useEffect(() => { const open = () => setFeedbackOpen(true); window.addEventListener('apex:feedback', open); return () => window.removeEventListener('apex:feedback', open); }, []);
  const setShowVoice = useUiStore((s) => s.setHelpTutorOpen);
  const pendingLessonId = useUiStore((s) => s.pendingLessonId);
  useEffect(() => { if (pendingLessonId) setShowVoice(true); }, [pendingLessonId, setShowVoice]);
  const [backingUp, setBackingUp] = useState(false);
  const [importingReceipt, setImportingReceipt] = useState(false);
  const [checkingForUpdate, setCheckingForUpdate] = useState(false);
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const isDirty = useUnsavedChangesStore((s) => s.isDirty);

  /** Saves whatever form currently has unsaved changes (Journal Entry, Quick Entry, …) — the same
   * saveHandler the close-window guard uses, just reachable from a toolbar click instead of only
   * firing when you try to close the app. Disabled entirely when nothing is dirty, so it never
   * looks like it might do something to an already-saved screen. */
  async function handleToolbarSave() {
    const { saveHandler, label } = useUnsavedChangesStore.getState();
    if (!saveHandler) return flashToast('Nothing to save right now.');
    setSaving(true);
    const succeeded = await saveHandler();
    setSaving(false);
    if (succeeded) {
      useUnsavedChangesStore.getState().markClean();
      flashToast(`Saved ${label ?? 'entry'}.`);
    } else {
      flashToast('Could not save — check the form for errors.');
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowQuickSearch(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function flashToast(message: string, ms = 3500) {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), ms);
  }

  // The button's own one-shot feedback ("Checking…" / "You're up to date" / an error) — separate
  // from UpdateBanner, which only ever shows once an update is actually found or downloading and
  // stays silent for "not-available", so a manual click would otherwise look like it did nothing.
  // electron-updater is a no-op outside a packaged install (see setupAutoUpdater), so no status
  // event ever arrives when running from `npm run dev` — the timeout below covers that case
  // rather than leaving the button stuck on "Checking…" forever.
  async function handleCheckForUpdates() {
    setCheckingForUpdate(true);
    let settled = false;
    const unsubscribe = window.api.updater.onStatus((status) => {
      if (status.state === 'checking' || settled) return;
      settled = true;
      setCheckingForUpdate(false);
      unsubscribe();
      if (status.state === 'not-available') flashToast("You're on the latest version.");
      else if (status.state === 'available') flashToast(`Update ${status.version} found — downloading in the background…`);
      else if (status.state === 'error') flashToast(`Update check failed: ${status.message}`);
      // 'downloading' / 'downloaded' need no toast here — UpdateBanner already shows those live.
    });
    window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setCheckingForUpdate(false);
      unsubscribe();
      flashToast('No response from the updater — this only runs in the installed app, not a dev build.');
    }, 8000);
    const result = await window.api.updater.checkForUpdates();
    if (!result.ok && !settled) {
      settled = true;
      setCheckingForUpdate(false);
      unsubscribe();
      flashToast(`Update check failed: ${result.error}`);
    }
  }

  async function handleBackup() {
    setBackingUp(true);
    const result = await window.api.company.backup();
    setBackingUp(false);
    if (!result.ok) return flashToast(`Backup failed: ${result.error}`);
    if (!result.data.saved) return flashToast('Backup cancelled.');
    flashToast(`Backup saved to ${result.data.filePath}`, 5000);
  }

  async function handleScanReceipt() {
    setImportingReceipt(true);
    const result = await window.api.receiptInbox.scan();
    setImportingReceipt(false);
    if (!result.ok) return flashToast(result.error);
    if (!result.data.scanned) return;
    setView({ kind: 'receiptInbox' });
    const pages = result.data.fileNames.length;
    flashToast(pages > 1 ? `${pages} receipts scanned — OCR is ready for your review.` : 'Receipt scanned — OCR is ready for your review.');
  }

  // The z-30 on the wrapper below is load-bearing, not decoration. Every menu in this header — the
  // company switcher, the gear menu that holds Knowledge Base, the + New grid — hangs DOWN out of
  // the header and over whatever follows it in AppShell: TopBar, then UpdateBanner, then <main>.
  // Those siblings come later in the DOM, so with no stacking order here they paint over an open
  // menu. That is what sliced the company list in half with the gold UpdateBanner strip and hid the
  // gear menu's Tools column, making Knowledge Base look like it had gone missing. Raising the
  // whole header layer fixes every menu in it at once. Sits below the sidebar's z-40 and the Modal
  // portal's z-50, so dialogs and the sidebar still cover the header as they should.
  return (
    <div className="relative z-30">
      <header className="flex items-center justify-between border-b border-gold-400 bg-gradient-to-r from-brand-900 to-brand-800 px-6 py-2">
        <div className="flex items-center gap-3">
          <AppMenuBar
            onOpenHelp={() => setShowHelp(true)}
            onOpenShortcuts={() => setShowKeyboardShortcuts(true)}
            onOpenQuickSearch={() => setShowQuickSearch(true)}
            onBackup={() => void handleBackup()}
            onCheckUpdates={() => void handleCheckForUpdates()}
            backingUp={backingUp}
            checkingForUpdates={checkingForUpdate}
          />
        </div>

        <button
          type="button"
          onClick={() => setShowQuickSearch(true)}
          className="relative w-72 rounded border border-brand-700 bg-white/95 py-1.5 pl-8 pr-2 text-left text-sm text-gray-400 hover:bg-white focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
        >
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width={16} height={16} />
          Search everything…
          <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-gray-300 px-1 text-[10px] text-gray-400">Ctrl+K</span>
        </button>
        <QuickSearchPalette open={showQuickSearch} onClose={() => setShowQuickSearch(false)} />

        <div className="flex items-center gap-1 text-brand-100">
          <ZoomControl />
          <button type="button" onClick={() => setView({ kind: 'tools' })} title="Tools & Calculators" className="rounded-full p-1.5 hover:bg-brand-100 hover:text-brand-700">
            <IconCalculator width={18} height={18} />
          </button>
          <button type="button" onClick={() => setShowHelp(true)} title="Help" className="rounded-full p-1.5 hover:bg-brand-100 hover:text-brand-700">
            <IconHelp width={18} height={18} />
          </button>
          <button
            type="button"
            data-testid="action-centre-button"
            onClick={() => setView({ kind: 'actionCentre' })}
            title="Action Centre — what is due, overdue, or waiting to be posted"
            className="relative mr-1 flex items-center gap-1 rounded-full bg-rose-200/90 px-2.5 py-1 text-xs font-semibold text-rose-900 shadow-sm hover:bg-rose-200"
          >
            <IconBell width={14} height={14} />
            Action Centre
            {actionCentreCount > 0 && (
              <span className="ml-0.5 rounded-full bg-rose-700 px-1.5 text-[10px] font-bold text-white">{actionCentreCount}</span>
            )}
          </button>
          <button
            type="button"
            onClick={sendFeedback}
            title={isWeb() ? 'Tell Apex Ledger what is wrong, confusing or missing on this screen' : 'Send feedback to info@pjinsuretax.ca'}
            className="rounded-full px-1.5 py-1 text-xs font-semibold hover:bg-brand-100 hover:text-brand-700"
            data-testid="feedback-button"
          >
            Feedback
          </button>
          {!isWeb() && (
            <button
              type="button"
              disabled={checkingForUpdate}
              onClick={handleCheckForUpdates}
              title="Check for a newer version of Apex Ledger"
              className="rounded-full px-1.5 py-1 text-xs font-semibold hover:bg-brand-100 hover:text-brand-700 disabled:opacity-60"
            >
              {checkingForUpdate ? 'Checking…' : 'Check for Updates'}
            </button>
          )}
          <button type="button" onClick={() => setSessionLocked(true)} title="Lock Apex Ledger" className="rounded-full p-1.5 hover:bg-brand-100 hover:text-brand-700">
            <IconLock width={18} height={18} />
          </button>
          <button type="button" onClick={() => setShowVoice(!showVoice)} title="Help & Tutor: ask how to do something, start a lesson, or type an entry" aria-label="Help & Tutor" className={`rounded-full p-1.5 hover:bg-brand-100 hover:text-brand-700 ${showVoice ? 'bg-brand-100 text-brand-700' : ''}`} data-testid="voice-agent-button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /><path d="M10 9.2a2 2 0 1 1 2.8 1.8c-.6.3-.8.7-.8 1.3" /><path d="M12 14.5h.01" /></svg>
          </button>
          <button type="button" onClick={() => setShowAiChat(true)} title="AI Assistant (Claude / ChatGPT)" className="rounded-full p-1.5 hover:bg-brand-100 hover:text-brand-700">
            <IconSparkles width={18} height={18} />
          </button>
          <SettingsMenu />
          <div className="ml-1 flex items-center gap-2 rounded border border-brand-700 bg-brand-800 px-2 py-1">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gold-400 text-xs font-bold text-brand-900">A</span>
            <select
              aria-label="Working as"
              title="Working as — switch the person entering"
              value={identity?.key ?? ''}
              onChange={(event) => void switchUser(event.target.value)}
              className="max-w-44 rounded border border-brand-600 bg-brand-900 px-1.5 py-0.5 text-xs font-semibold text-white"
            >
              {identity && !(sessionUsers ?? []).some((user) => user.key === identity.key) && <option value={identity.key}>{identity.name}</option>}
              {(sessionUsers ?? []).map((user) => <option key={user.key} value={user.key}>{user.name} — {user.role}</option>)}
            </select>
            <CompanySwitcher />
          </div>
        </div>
      </header>

      <div className="flex items-center justify-start gap-0.5 overflow-x-auto border-b border-gray-200 bg-white px-2 py-1.5">
        {/* Back and forward through screens, the way a browser does — kept compact and first, where
            the hand already expects them, rather than as another labelled button in the row. */}
        <HistoryArrows />
        <div className="mx-1 h-6 w-px bg-gray-200" />
        <ActionButton
          icon={<IconSave />}
          label="Save"
          onClick={handleToolbarSave}
          busy={saving}
          color={isDirty ? 'emerald' : 'gray'}
        />
        <ActionButton
          icon={<IconUndo />}
          label="Undo"
          onClick={() => document.execCommand('undo')}
          color="gray"
        />
        <ActionButton
          icon={<IconRedo />}
          label="Redo"
          onClick={() => document.execCommand('redo')}
          color="gray"
        />
        <div className="mx-1 h-6 w-px bg-gray-200" />
        <ActionButton icon={<IconInvoicePlus />} label="New Invoice" onClick={() => setView({ kind: 'invoiceEditor', id: 'new' })} color="emerald" />
        <ActionButton icon={<IconBillPlus />} label="New Bill" onClick={() => setView({ kind: 'purchases' })} color="orange" />
        <ActionButton icon={<IconDollarCircle />} label="New Expense" onClick={() => setView({ kind: 'quickEntry', type: 'expense' })} color="rose" />
        <ActionButton icon={<IconUserGroup />} label="Receive Payment" onClick={() => setShowReceivePayment(true)} color="blue" />
        <ActionButton icon={<IconBank />} label="Make Payment" onClick={() => setShowPayBill(true)} color="purple" />
        <ActionButton icon={<IconDollarCircle />} label="Transfer" onClick={() => setView({ kind: 'quickEntry', type: 'transfer' })} color="cyan" />
        <ActionButton icon={<IconBank />} label="Import Bank" onClick={() => setView({ kind: 'bankImport' })} color="blue" />
        <ActionButton icon={<IconCamera />} label="Scan Receipt" onClick={handleScanReceipt} busy={importingReceipt} />
        <ActionButton icon={<IconBook />} label="Journal Entry" onClick={() => setView({ kind: 'journalForm', id: 'new' })} color="violet" />
        {!isWeb() && <ActionButton icon={<IconCloudUpload />} label="Backup" onClick={handleBackup} busy={backingUp} color="purple" />}
        <ActionButton icon={<IconRefresh />} label="Refresh" onClick={bumpRefreshNonce} color="gray" />
        {!isWeb() && <ActionButton icon={<IconMonitor />} label="Mirror Window" onClick={() => window.api.window.openMirror()} color="cyan" />}
        <ActionButton icon={<IconLedger />} label="Accountant Centre" onClick={() => setView({ kind: 'accountantCentre' })} color="violet" />
        {can('crm') && <ActionButton icon={<IconUserGroup />} label="Client Management (CRM)" onClick={() => setView({ kind: 'clientHub' })} color="purple" />}
      </div>

      {toast && (
        <div className="absolute right-6 top-full z-30 mt-2 rounded border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-gold-800 shadow-md">
          {toast}
        </div>
      )}

      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
      <ReceivePaymentModal open={showReceivePayment} onClose={() => setShowReceivePayment(false)} onReceived={bumpRefreshNonce} invoiceId={null} />
      <PayBillModal open={showPayBill} onClose={() => setShowPayBill(false)} onPaid={bumpRefreshNonce} billId={null} />
      <KeyboardShortcutsModal open={showKeyboardShortcuts} onClose={() => setShowKeyboardShortcuts(false)} />
      <AiChatPanel open={showAiChat} onClose={() => setShowAiChat(false)} />
      <VoiceAgentPanel open={showVoice} onClose={() => setShowVoice(false)} />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}
