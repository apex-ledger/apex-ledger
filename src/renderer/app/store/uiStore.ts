import {
  currentView,
  goBack as goBackInHistory,
  goForward as goForwardInHistory,
  pushView,
  startHistory,
  type HistoryState,
} from './viewHistory';
import { create } from 'zustand';
import { seatHomeView } from '@shared/domain/seatScope';
import { webSeat } from '../../utils/platform';
import { loadStoredColorScheme, storeColorScheme, type ColorSchemeId } from '../../theme';
import { loadStoredFontSize, storeFontSize, type FontSizeId } from '../../utils/fontSize';
import { loadStoredFontFamily, storeFontFamily, type FontFamilyId } from '../../utils/fontFamily';
import { clampZoomPercent, loadStoredZoomPercent, storeZoomPercent } from '../../utils/zoom';
import { useUnsavedChangesStore } from './unsavedChangesStore';
import type { TransactionsTab } from '../../features/transactions/TransactionsPage';
import type { SalesTab } from '../../features/sales/SalesPage';
import type { ExpensesTab } from '../../features/expenses/ExpensesPage';

/** What the voice agent fills into Quick Entry when the reviewer wants to adjust before posting. */
export interface QuickEntryPrefill {
  entryDate: string;
  moneyAccountId: number | null;
  categoryAccountId: number | null;
  baseCents: number;
  taxCode: string | null;
  taxCents: number;
  description: string;
}

export interface NewCompanyPrefill {
  legalName: string;
  businessType: string | null;
  fiscalYearEnd: { month: number; day: number } | null;
  businessNumber: string | null;
}

export type ReportKind =
  | 'comprehensiveCompany'
  | 'customTransactionDetail'
  | 'trialBalance'
  | 'generalLedger'
  | 'incomeStatement'
  | 'balanceSheet'
  | 'gifiExport'
  | 'projections'
  | 'hstSummary'
  | 'salesTaxByProvince'
  | 'hstReconciliation'
  | 'hstQuickMethod'
  | 'hstFiling'
  | 'businessPerformance'
  | 'periodStatements'
  | 'accountList'
  | 'agingReceivable'
  | 'agingPayable'
  | 'salesByCustomer'
  | 'cashFlow'
  | 'changesInEquity'
  | 'balanceSheetSummary'
  | 'balanceSheetDetail'
  | 'balanceSheetComparison'
  | 'profitAndLossDetail'
  | 'businessSnapshot'
  | 'adjustingEntries'
  | 'profitAndLossByCustomer'
  | 'journalReport'
  | 'invalidTransactions'
  | 'inventoryStatus'
  | 'workingTrialBalance'
  | 'expensesByVendor'
  | 'customerStatement'
  | 'chequeRegister'
  | 'activityLog'
  | 'ccaSchedule'
  | 'loanSchedule'
  | 'salesTaxDetail'
  | 'budgetVsActual'
  | 'reconciliationReport'
  | 'profitAndLossByTag'
  | 'billApproval'
  | 'auditTrail'
  | 'sourceDocuments'
  | 'bankDepositAnalysis'
  | 'payrollRegister'
  | 'employeeEarnings'
  | 'auditExceptions'
  | 'hstWorkingPaper'
  | 'fixedAssetContinuity'
  | 'shareholderContinuity'
  | 'inventoryContinuity'
  | 'debtContinuity'
  | 't2Reconciliation'
  | 'yearEndSignoff';

export type QuickEntryType = 'expense' | 'income' | 'transfer';

/** Lines a new purchase order opens with — the reorder list hands over the items and quantities. */
export interface PurchaseOrderPrefill {
  vendorId: number | null;
  lines: Array<{ productId: number; quantity: number }>;
}

export type View =
  | { kind: 'welcome' }
  | { kind: 'dashboard' }
  | { kind: 'bookkeepingChecklist' }
  | { kind: 'actionCentre' }
  | { kind: 'fixedAssets' }
  | { kind: 'approvals' }
  | { kind: 'reclassify' }
  | { kind: 'clientOverview' }
  | { kind: 'monthEndClose' }
  | {
      kind: 'chartOfAccounts';
      /** Set right after creating a brand-new company — auto-opens "Set Opening Balances" so
       * every account the starter Chart of Accounts template just created (bank accounts, credit
       * cards, Common Shares, Dividends Paid, etc.) is immediately ready to prefill with a starting
       * balance, before the reviewer moves on to entering ongoing/current transactions. */
      openOpeningBalances?: boolean;
    }
  | { kind: 'journalList' }
  | { kind: 'journalForm'; id: number | 'new' }
  | { kind: 'quickEntry'; type: QuickEntryType; templateId?: number; prefill?: QuickEntryPrefill }
  | { kind: 'bulkExpenseImport' }
  | { kind: 'bankImport' }
  | {
      kind: 'report';
      report: ReportKind;
      /** Set when navigating here by clicking a specific account's balance on another report (or
       * the Chart of Accounts) — pre-selects that account (and optionally the date range that
       * produced the number that was clicked) on General Ledger, whose own rows are already
       * clickable through to the underlying Journal Entry for correction. Only meaningful when
       * report === 'generalLedger'; ignored otherwise. */
      drillDown?: { accountId: number; dateFrom?: string; dateTo?: string };
      /** Set when a GST/HST figure was clicked on the Sales Tax Return screen — opens Sales Tax
       * Detail on that period and side. Only meaningful when report === 'salesTaxDetail'. */
      salesTax?: { periodStart: string; periodEnd: string; side?: 'collected' | 'paid' };
    }
  | { kind: 'hstCentre' }
  | { kind: 'taxGifi' }
  | { kind: 'reportsHub'; group?: string }
  | { kind: 'companySettings' }
  | { kind: 'clientHub' }
  | { kind: 'payroll' }
  | { kind: 'customers' }
  | { kind: 'vendors' }
  | { kind: 'purchases'; tab?: 'unpaid' | 'paid' | 'vendors'; billId?: number; vendorId?: number }
  | { kind: 'invoices' }
  | { kind: 'creditNotes' }
  | { kind: 'cpaReview' }
  | { kind: 'workpapers' }
  | { kind: 'accountantCentre'; tab?: 'compliance' | 'workpapers' | 'cpaReview' }
  | { kind: 'banking'; tab?: 'connections' | 'transactions' | 'spend' | 'receive' | 'transfer' | 'receipts' | 'organise' | 'reconcile' }
  | { kind: 'transactions'; tab?: TransactionsTab }
  | { kind: 'sales'; tab?: SalesTab; customerId?: number }
  | { kind: 'expenses'; tab?: ExpensesTab; billId?: number; vendorId?: number }
  | { kind: 'products' }
  | { kind: 'projects' }
  | { kind: 'tags' }
  | { kind: 'invoiceEditor'; id: number | 'new'; customerId?: number }
  | { kind: 'estimates' }
  | { kind: 'estimateEditor'; id: number | 'new'; asOrder?: boolean; customerId?: number }
  | { kind: 'mileage' }
  | { kind: 'deposits' }
  | { kind: 'purchaseOrders' }
  | { kind: 'purchaseOrderEditor'; id: number | 'new'; prefill?: PurchaseOrderPrefill }
  | { kind: 'salesReceipts' }
  | { kind: 'salesReceiptEditor'; id: number | 'new'; customerId?: number }
  | { kind: 'bankReconciliation' }
  | { kind: 'receiptInbox' }
  | { kind: 'paystub'; runId: number }
  | { kind: 'forms'; formId?: string }
  | { kind: 'calendar' }
  | { kind: 'qbImport' }
  | { kind: 'userGuide' }
  | { kind: 'tools' }
  | { kind: 'knowledgeBase' }
  | { kind: 'audit'; tab?: 'exceptions' | 'checks' | 'package' }
  | { kind: 'about' }
  | { kind: 'whatsNew' }
  | { kind: 'accessPermissions' }
  /** Web only: firms, seats, company files and trial requests, for the platform administrator or a firm's owner. */
  | { kind: 'webAdmin' }
  /** Web only, platform administrator: subscriptions, payments and each subscriber's details, as a full page. */
  | { kind: 'webSubscriptions' }
  /** Not a page: choosing it opens the Help & Tutor panel over whatever is showing. */
  | { kind: 'helpTutor' };

/** Two views are the same screen when they name the same kind and the same record. Views are
 * rebuilt on every click, so comparing by reference would record a move each time. */
function sameView(a: View, b: View): boolean {
  if (a.kind !== b.kind) return false;
  const idOf = (v: View) => ('id' in v ? v.id : 'tab' in v ? v.tab : 'report' in v ? v.report : 'group' in v ? v.group : undefined);
  return idOf(a) === idOf(b);
}

interface UiState {
  view: View;
  /** Where you have been, so the header's back/forward arrows work the way a browser's do.
   * Kept out of `view` itself because going back must NOT record a new move. */
  history: HistoryState<View>;
  /** Set instead of `view` when setView is called while the current screen has unsaved changes —
   * holds the destination until NavigationConfirmModal resolves it (Save & Leave, Discard & Leave,
   * or Stay Here), instead of silently switching pages and discarding whatever was mid-entry. */
  pendingView: View | null;
  companyPath: string | null;
  companyLegalName: string | null;
  showNewCompanyModal: boolean;
  /** Fields the voice agent heard for a new company; the wizard reads and clears them when it opens. */
  newCompanyPrefill: NewCompanyPrefill | null;
  /** A lesson started from Settings → Self tutorial; the voice agent opens and runs it, then clears this. */
  pendingLessonId: string | null;
  /** The Help & Tutor panel (typed questions, lessons, optional voice). */
  helpTutorOpen: boolean;
  receiptInboxPendingCount: number;
  /** Overdue + today + soon items in the Action Centre — the red badge on the header button. */
  actionCentreCount: number;
  setActionCentreCount: (count: number) => void;
  /** Covers the open company without closing it or discarding the current page/form state. */
  sessionLocked: boolean;
  /** Bumped by the header's Refresh button. App.tsx keys the current page on this, so bumping it
   * remounts just the page in view (re-running its data fetches) — NOT the whole renderer, which
   * a real `window.location.reload()` would do, kicking the user back to Welcome and forgetting
   * which company was open even though the main process still has it open. */
  refreshNonce: number;
  colorScheme: ColorSchemeId;
  fontSize: FontSizeId;
  fontFamily: FontFamilyId;
  zoomPercent: number;
  /** One-shot search term set by the Quick Search palette when it jumps to a page whose own
   * search box should be pre-filled (e.g. a client name into Client Hub) — the destination page
   * reads it once on mount and clears it, so it never lingers or reapplies on a later visit. */
  pendingSearchTerm: string | null;
  setView: (view: View) => void;
  goBack: () => void;
  /** Back along the trail if there is one, else to the page a screen naturally belongs under. */
  goBackOr: (fallback: View) => void;
  goForward: () => void;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
  setCompany: (companyPath: string | null, legalName: string | null) => void;
  setShowNewCompanyModal: (show: boolean) => void;
  setNewCompanyPrefill: (prefill: NewCompanyPrefill | null) => void;
  setPendingLessonId: (id: string | null) => void;
  setHelpTutorOpen: (open: boolean) => void;
  setReceiptInboxPendingCount: (count: number) => void;
  setSessionLocked: (locked: boolean) => void;
  bumpRefreshNonce: () => void;
  setColorScheme: (scheme: ColorSchemeId) => void;
  setFontSize: (size: FontSizeId) => void;
  setFontFamily: (family: FontFamilyId) => void;
  setZoomPercent: (percent: number) => void;
  setPendingSearchTerm: (term: string | null) => void;
}


/** One screen, one place. Several older view names open the same screen a hub tab already shows
 * (a plain Customers list beside Sales → Customers, Invoices beside Sales → Invoices, Purchases
 * beside Expenses → Vendor bills). They are folded into the hub tab here, so every button, link
 * and how-to step lands on the same screen with the same sidebar highlight, whichever name it
 * used. */
export function canonicalView(view: View): View {
  switch (view.kind) {
    case 'bookkeepingChecklist': return { kind: 'actionCentre' };
    case 'customers': return { kind: 'sales', tab: 'customers' };
    case 'invoices': return { kind: 'sales', tab: 'invoices' };
    case 'estimates': return { kind: 'sales', tab: 'estimates' };
    case 'salesReceipts': return { kind: 'sales', tab: 'receipts' };
    case 'creditNotes': return { kind: 'sales', tab: 'creditNotes' };
    case 'deposits': return { kind: 'sales', tab: 'deposits' };
    case 'vendors': return { kind: 'expenses', tab: 'vendors' };
    case 'mileage': return { kind: 'expenses', tab: 'mileage' };
    case 'purchases': return { kind: 'expenses', tab: view.tab === 'paid' ? 'paid' : view.tab === 'vendors' ? 'vendors' : 'bills', billId: view.billId, vendorId: view.vendorId };
    default: return view;
  }
}

export const useUiStore = create<UiState>((set, get) => ({
  view: { kind: 'welcome' },
  history: startHistory<View>({ kind: 'welcome' }),
  pendingView: null,
  companyPath: null,
  companyLegalName: null,
  showNewCompanyModal: false,
  newCompanyPrefill: null,
  pendingLessonId: null,
  helpTutorOpen: false,
  receiptInboxPendingCount: 0,
  actionCentreCount: 0,
  sessionLocked: false,
  refreshNonce: 0,
  colorScheme: loadStoredColorScheme(),
  fontSize: loadStoredFontSize(),
  fontFamily: loadStoredFontFamily(),
  zoomPercent: loadStoredZoomPercent(),
  pendingSearchTerm: null,
  setView: (requested) => {
    if (requested.kind === 'helpTutor') { set({ helpTutorOpen: true }); return; }
    const view = canonicalView(requested);
    if (useUnsavedChangesStore.getState().isDirty) {
      set({ pendingView: view });
      return;
    }
    set({ view, history: pushView(get().history, view, sameView) });
  },

  /** Back and forward move the pointer through the trail rather than recording a move — otherwise
   * going back would itself become a step you could go back from, and the arrows would never
   * reach anything. */
  goBack: () => {
    const history = goBackInHistory(get().history);
    const view = currentView(history);
    if (view) set({ view, history });
  },
  goBackOr: (fallback) => {
    if (get().history.index > 0) get().goBack();
    else get().setView(fallback);
  },
  goForward: () => {
    const history = goForwardInHistory(get().history);
    const view = currentView(history);
    if (view) set({ view, history });
  },

  confirmNavigation: () => {
    const pending = get().pendingView;
    // Recorded here as well: a move held up by unsaved changes is still a move once it goes ahead.
    if (pending) set({ view: pending, pendingView: null, history: pushView(get().history, pending, sameView) });
  },
  cancelNavigation: () => set({ pendingView: null }),
  setCompany: (companyPath, legalName) => {
    // Opening a different company starts a fresh trail: going "back" into screens belonging to the
    // file that was just closed would show another company's data.
    const view: View = companyPath ? seatHomeView(webSeat()) : { kind: 'welcome' };
    set({ companyPath, companyLegalName: legalName, view, history: startHistory<View>(view), sessionLocked: false });
  },
  setShowNewCompanyModal: (show) => set({ showNewCompanyModal: show }),
  setNewCompanyPrefill: (prefill) => set({ newCompanyPrefill: prefill }),
  setPendingLessonId: (id) => set({ pendingLessonId: id }),
  setHelpTutorOpen: (open) => set({ helpTutorOpen: open }),
  setReceiptInboxPendingCount: (count) => set({ receiptInboxPendingCount: count }),
  setActionCentreCount: (count) => set({ actionCentreCount: count }),
  setSessionLocked: (locked) => set({ sessionLocked: locked }),
  bumpRefreshNonce: () => set((s) => ({ refreshNonce: s.refreshNonce + 1 })),
  setColorScheme: (scheme) => {
    storeColorScheme(scheme);
    set({ colorScheme: scheme });
  },
  setFontSize: (size) => {
    storeFontSize(size);
    set({ fontSize: size });
  },
  setFontFamily: (family) => {
    storeFontFamily(family);
    set({ fontFamily: family });
  },
  setZoomPercent: (percent) => {
    const clamped = clampZoomPercent(percent);
    storeZoomPercent(clamped);
    set({ zoomPercent: clamped });
  },
  setPendingSearchTerm: (term) => set({ pendingSearchTerm: term }),
}));
