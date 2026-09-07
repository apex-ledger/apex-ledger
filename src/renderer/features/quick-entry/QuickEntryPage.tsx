import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Account, CategoryRule, FiscalPeriod, HstFiling, JournalEntry, TaxCode } from '@shared/domain/types';
import { suggestCategory } from '@shared/domain/categorization/matchCategory';
import { suggestTaxCents } from '@shared/domain/ledger/computeTaxSplit';
import { CustomTaxRateInput } from '../../components/CustomTaxRateInput';
import { PeriodPresetSelect } from '../../components/PeriodPresetSelect';
import { EditableDateCell } from '../../components/EditableDateCell';
import type { RecurringTemplate } from '../../../preload/index';
import { suggestedCategoriesForBusinessType } from '@shared/domain/businessTypes';
import { checkDraftEntryWarnings } from '@shared/domain/audit/checkDraftEntryWarnings';
import { Combobox } from '../../components/Combobox';
import { taxCodeLabel, taxCodeOptions } from '@shared/domain/ledger/taxCodes';
import { useCompanyTaxDefault } from '../../hooks/useCompanyTaxDefault';
import { AccountFormModal } from '../chart-of-accounts/AccountFormModal';
import { CurrencyInput } from '../../components/CurrencyInput';
import { ForeignCurrencyDetails, ForeignCurrencySelector } from '../../components/ForeignCurrencyFields';
import { Modal } from '../../components/Modal';
import { accountPickerOptions } from '../../utils/accountLabel';
import { capitalizeWords, suggestOnBlur } from '../../utils/textCase';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { recordSuggestion, suggestionListId } from '../../utils/textSuggestions';
import { useForeignCurrencyAmount } from '../../hooks/useForeignCurrencyAmount';
import { useUiStore, type QuickEntryType } from '../../app/store/uiStore';
import type { QuickEntryPrefill } from '../../app/store/uiStore';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { confirmDialog } from '../../app/store/confirmStore';
import { postingLockWithReason } from '@shared/domain/ledger/postJournalEntry';
import { gstHstControlAccountId } from '@shared/domain/ledger/gstHstAccounts';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { formatEnteredAt } from '@shared/domain/audit/enteredStamp';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { ErrorNotice } from '../../components/ErrorNotice';

function todayIso(): string {
  return localIsoDate();
}

function nextRecurringDate(dateIso: string, frequency: NonNullable<RecurringTemplate['scheduleFrequency']>): string {
  const source = new Date(`${dateIso}T00:00:00Z`);
  if (frequency === 'weekly') source.setUTCDate(source.getUTCDate() + 7);
  else {
    const months = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;
    const day = source.getUTCDate();
    source.setUTCDate(1);
    source.setUTCMonth(source.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0)).getUTCDate();
    source.setUTCDate(Math.min(day, lastDay));
  }
  return source.toISOString().slice(0, 10);
}


const COPY: Record<QuickEntryType, { title: string; moneyLabel: string; categoryLabel: string; verb: string }> = {
  expense: {
    title: 'New Expense',
    moneyLabel: 'Paid From',
    categoryLabel: 'Expense Category',
    verb: 'expense',
  },
  income: {
    title: 'New Sale / Income',
    moneyLabel: 'Deposited To',
    categoryLabel: 'Income Category',
    verb: 'sale',
  },
  transfer: {
    title: 'Transfer',
    moneyLabel: 'From Account',
    categoryLabel: 'To Account',
    verb: 'transfer',
  },
};

/** A transfer moves money between balance-sheet accounts (bank-to-bank, paying down a credit
 * card, an owner's draw/contribution) rather than categorizing it as income or an expense — so
 * both sides pick from the same broader list instead of Expense/Revenue accounts. */
function isTransferEligible(accountType: Account['accountType']): boolean {
  return accountType === 'Asset' || accountType === 'Liability' || accountType === 'Equity';
}

/** Saves the currently-filled-in form (money account, category, amount, tax treatment) as a
 * reusable template — for the rent/insurance/subscription-style transactions that repeat every
 * month, so next time it's a load-and-click instead of retyping everything. */
function SaveTemplateModal({
  open,
  onClose,
  onSaved,
  type,
  moneyAccountId,
  categoryAccountId,
  baseCents,
  taxCode,
  taxCents,
  description,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  type: 'expense' | 'income';
  moneyAccountId: number;
  categoryAccountId: number;
  baseCents: number;
  taxCode: TaxCode | null;
  taxCents: number;
  description: string;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setName('');
    setError(null);
    onClose();
  }

  async function handleSave() {
    if (!name.trim()) return setError('Template name is required.');
    setBusy(true);
    setError(null);
    const result = await window.api.recurringTemplates.create({
      name: capitalizeWords(name.trim()),
      type,
      moneyAccountId,
      categoryAccountId,
      amountCents: baseCents,
      taxCode,
      manualHstCents: taxCode ? taxCents : null,
      description: description || null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onSaved();
    handleClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Save as Template">
      <div className="space-y-3">
        <p className="text-sm text-gray-500">Saves this amount, account, and category as a reusable template for a transaction you enter repeatedly (rent, insurance, a subscription).</p>
        {error && <ErrorNotice message={error} />}
        <label className="block text-sm">
          <span className="text-gray-600">Template Name</span>
          <input
            autoFocus
            list={suggestionListId('template-name')}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={suggestOnBlur('template-name', setName)}
            placeholder="e.g. Monthly Rent"
          />
          <SuggestionDatalist fieldKey="template-name" />
        </label>
        <div className="flex flex-wrap justify-start gap-2 pt-2">
          <button type="button" onClick={handleClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleSave}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** "I just made a mistake on the amount, or dated it wrong" — the common case, and the whole
 * reason this modal exists instead of sending the user to the full Journal Entry form every time.
 * Voids the original entry and posts a corrected one with everything else (category, money
 * account, tax code, description) held exactly the same — only Base/Tax Amount and Date change. */
function EditAmountModal({
  entry,
  accounts,
  onClose,
  onSaved,
}: {
  entry: JournalEntry;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const categoryLine = entry.lines.find((l) => {
    const a = accounts.find((acct) => acct.id === l.accountId);
    return a && (a.accountType === 'Expense' || a.accountType === 'Revenue');
  });
  const gstLine = entry.lines.find((l) => l.description === 'GST/HST');
  const categoryName = categoryLine ? accounts.find((a) => a.id === categoryLine.accountId)?.name ?? '—' : '—';
  const isTransferEntry = !categoryLine;
  const categoryPostedCents = categoryLine ? categoryLine.debitCents || categoryLine.creditCents : 0;
  const originalBaseCents = categoryLine?.baseCents ?? categoryPostedCents;
  const claimableTaxCents = gstLine ? gstLine.debitCents || gstLine.creditCents : 0;
  const originalFullTaxCents = categoryLine ? Math.max(0, categoryPostedCents - originalBaseCents) + claimableTaxCents : 0;

  const [baseCents, setBaseCentsState] = useState(() =>
    categoryLine ? originalBaseCents : entry.lines.reduce((sum, l) => sum + l.debitCents, 0),
  );
  const [taxCents, setTaxCentsState] = useState(() => originalFullTaxCents);
  const [entryDate, setEntryDate] = useState(entry.entryDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CurrencyInput only commits via onBlur, and clicking "Save Correction" right after typing
  // fires blur-then-click in the same event batch — handleSave's closure would otherwise still
  // see the pre-edit amount, since the React state update from blur hasn't been applied yet by
  // the time the click handler runs. Refs update synchronously, so mirroring the value into one
  // on every change guarantees handleSave always reads what was actually just typed.
  const baseCentsRef = useRef(baseCents);
  const taxCentsRef = useRef(taxCents);
  function setEditBaseCents(cents: number) {
    baseCentsRef.current = cents;
    setBaseCentsState(cents);
  }
  function setEditTaxCents(cents: number) {
    taxCentsRef.current = cents;
    setTaxCentsState(cents);
  }

  const taxLabel = taxCodeOptions('all').find((opt) => opt.value === (categoryLine?.taxCode ?? ''))?.label ?? '—';
  const totalCents = baseCents + taxCents;

  async function handleSave() {
    const baseCents = baseCentsRef.current;
    const taxCents = taxCentsRef.current;
    if (baseCents <= 0) return setError('Amount must be greater than zero.');
    if (!entryDate) return setError('Date is required.');
    setBusy(true);
    setError(null);

    const correction = await window.api.quickEntry.correct({ originalEntryId: entry.id, entryDate, baseCents, taxCents });
    setBusy(false);
    if (!correction.ok) return setError(`Nothing was changed: ${correction.error}`);
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title="Edit Entry">
      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          Changes the amount and/or date on this {entry.entryDate} entry ({categoryName}) — everything else stays the same. Under the hood this
          unposts the original and posts a corrected one, keeping the audit trail intact.
        </p>
        {error && <ErrorNotice message={error} />}
        <label className="block text-sm">
          <span className="text-gray-600">Date</span>
          <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-40 rounded border border-gray-300 px-2 py-1.5" value={entryDate} onChange={(e) => setEntryDate(clampIsoDate(e.target.value))} />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">{isTransferEntry ? 'Amount' : 'Base Amount'}</span>
          <div className="mt-1 w-40">
            <CurrencyInput valueCents={baseCents} onChange={setEditBaseCents} />
          </div>
        </label>
        {!isTransferEntry && categoryLine?.taxCode && categoryLine.taxCode !== 'NonHST' && (
          <label className="block text-sm">
            <span className="text-gray-600">Tax Amount ({taxLabel})</span>
            <div className="mt-1 w-40">
              <CurrencyInput valueCents={taxCents} onChange={setEditTaxCents} />
            </div>
          </label>
        )}
        {categoryLine?.foreignCurrency && categoryLine.foreignAmountCents != null && (
          <p className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
            Original foreign amount: {(categoryLine.foreignAmountCents / 100).toFixed(2)} {categoryLine.foreignCurrency}. If the CAD base changes, Apex Ledger recalculates the stored exchange rate while preserving this source amount.
          </p>
        )}
        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          New total: <span className="font-mono font-medium tabular-nums text-gray-800">${(totalCents / 100).toFixed(2)}</span>
        </div>
        <div className="flex flex-wrap justify-start gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleSave}
            className="rounded-full bg-brand-300 px-4 py-2 text-sm font-medium text-brand-900 hover:bg-brand-400 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save Correction'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function QuickEntryPage({ type, templateId, prefill }: { type: QuickEntryType; templateId?: number; prefill?: QuickEntryPrefill }) {
  const setView = useUiStore((s) => s.setView);
  const refreshNonce = useUiStore((s) => s.refreshNonce);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);
  const [suggestedNames, setSuggestedNames] = useState<Set<string>>(new Set());
  const [entryDate, setEntryDate] = useState(todayIso());
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodDetailsOpen, setPeriodDetailsOpen] = useState(false);
  const [periodTo, setPeriodTo] = useState('');
  const [moneyAccountId, setMoneyAccountId] = useState<number | null>(null);
  const [categoryAccountId, setCategoryAccountId] = useState<number | null>(null);
  /** Open state for creating a category without leaving the entry being typed. `parent: null` is a
   * new top-level category; a parent means a sub-account nested under it. Held as an object rather
   * than two booleans so "which parent" and "is it open" cannot disagree. */
  const [newCategoryFor, setNewCategoryFor] = useState<{ parent: Account | null } | null>(null);
  const [baseCents, setBaseCents] = useState(0);
  const [taxCode, setTaxCode] = useState<TaxCode | null>(null);
  const { province, defaultTaxCode, loaded: taxDefaultLoaded } = useCompanyTaxDefault();
  // The ordinary picker deliberately has no blank option. Until the company profile finishes
  // loading the browser therefore displays its first option (Ontario HST) even if React state is
  // still null. Keep the actual value aligned with what is visible; a missing/unrecognised
  // province uses the same documented Ontario fallback as invoices, bills and sales receipts.
  const effectiveDefaultTaxCode: TaxCode = defaultTaxCode ?? 'HST';
  const [taxCents, setTaxCents] = useState(0);
  const [taxTouched, setTaxTouched] = useState(false);
  // The Base Amount that was in effect when Tax Amt was last manually set (by hand or by loading a
  // template) — lets the auto-suggest effect below tell "user deliberately overrode the tax for
  // this exact base" apart from "base changed since, so the old manual figure is now stale and
  // should go back to tracking the base" (previously any manual edit locked the tax forever, even
  // after the base was later corrected to a different amount).
  const [taxTouchedAtBaseCents, setTaxTouchedAtBaseCents] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ entryDate: string; memo: string | null }[]>([]);
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(null);
  const initialTemplateApplied = useRef<number | null>(null);
  // The voice agent's card, carried in so the reviewer can adjust before posting.
  const prefillApplied = useRef<QuickEntryPrefill | null>(null);
  useEffect(() => {
    if (!prefill || prefillApplied.current === prefill) return;
    prefillApplied.current = prefill;
    setEntryDate(prefill.entryDate);
    setMoneyAccountId(prefill.moneyAccountId);
    setCategoryAccountId(prefill.categoryAccountId);
    categoryManuallySelectedRef.current = prefill.categoryAccountId !== null;
    setBaseCents(prefill.baseCents);
    setTaxCode(prefill.taxCode as TaxCode | null);
    taxCodeManuallySelectedRef.current = true;
    setTaxCents(prefill.taxCents);
    setTaxTouched(true);
    setDescription(prefill.description);
  }, [prefill]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [voidingId, setVoidingId] = useState<number | null>(null);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [showRangeFilter, setShowRangeFilter] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [todaysEntries, setTodaysEntries] = useState<JournalEntry[]>([]);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [hstFilings, setHstFilings] = useState<HstFiling[]>([]);
  const fx = useForeignCurrencyAmount();
  const categoryFieldRef = useRef<HTMLInputElement>(null);
  const categoryManuallySelectedRef = useRef(false);
  const taxCodeManuallySelectedRef = useRef(false);
  // Tracks the last value we auto-filled into Description from the chosen category, so picking a
  // category can prefill Description without ever clobbering something the user typed by hand.
  const lastAutoFilledDescriptionRef = useRef<string>('');

  const copy = COPY[type];
  const totalCents = baseCents + (type === 'transfer' ? 0 : taxCents);

  function reloadTemplates() {
    if (type === 'transfer') return;
    window.api.recurringTemplates.list(type).then((r) => r.ok && setTemplates(r.data));
  }

  function reloadCategoryRules() {
    if (type === 'transfer') {
      setCategoryRules([]);
      return;
    }
    window.api.categoryRules.list().then((r) => r.ok && setCategoryRules(r.data));
  }

  async function reloadFilingLocks() {
    const [periodResult, filingResult] = await Promise.all([window.api.fiscalPeriods.list(), window.api.hstFilings.list()]);
      if (periodResult.ok) setFiscalPeriods(periodResult.data);
      if (filingResult.ok) setHstFilings(filingResult.data);
  }

  // Every entry posted for the date currently in the Date field — shown as a running list below
  // the form so entering several same-day transactions back-to-back actually shows a new row
  // appear each time, not just a form that quietly resets. Switching on the date-range filter
  // widens this to any custom From/To range instead (e.g. reviewing several days of test/back-
  // dated entries at once) without having to leave Quick Entry for the full Journal Entries list.
  function reloadTodaysEntries() {
    const params = showRangeFilter ? { dateFrom: rangeFrom || undefined, dateTo: rangeTo || undefined } : { dateFrom: entryDate, dateTo: entryDate };
    window.api.journal.list(params).then((r) => r.ok && setTodaysEntries(r.data));
  }

  /** Unposting directly from today's list — the fast path for "wrong amount, fix it now" without
   * navigating to Journal Entries first. Voiding (not deleting) keeps the audit trail intact; the
   * accountant re-enters it correctly as a new row right below. */
  async function handleVoidTodaysEntry(e: JournalEntry) {
    if (
      !(await confirmDialog(
        `Unpost this ${e.entryDate} entry${e.memo ? ` ("${e.memo}")` : ''}? This removes it from every balance and report, but keeps it visible (marked void) for the audit trail.`,
      ))
    ) {
      return;
    }
    setVoidError(null);
    setVoidingId(e.id);
    const result = await window.api.journal.void(e.id);
    setVoidingId(null);
    if (!result.ok) return setVoidError(result.error);
    reloadTodaysEntries();
  }

  /** Permanently removes a mistaken entry: voids it first (so it's never in "posted" status when
   * deleted — journal.delete only ever accepts draft or void), then deletes it outright. Unlike
   * Unpost alone, this leaves no record at all, so it's a separate, more clearly-worded
   * confirmation rather than a variant of the same button. */
  async function handleDeleteTodaysEntry(e: JournalEntry) {
    if (
      !(await confirmDialog(
        `Permanently delete this ${e.entryDate} entry${e.memo ? ` ("${e.memo}")` : ''}? This unposts it and removes it completely — unlike Unpost, it will not remain visible for the audit trail. This cannot be undone.`,
      ))
    ) {
      return;
    }
    setDeleteError(null);
    setDeletingId(e.id);
    if (e.status === 'posted') {
      const voidResult = await window.api.journal.void(e.id);
      if (!voidResult.ok) {
        setDeletingId(null);
        return setDeleteError(voidResult.error);
      }
    }
    const deleteResult = await window.api.journal.delete(e.id);
    setDeletingId(null);
    if (!deleteResult.ok) return setDeleteError(deleteResult.error);
    reloadTodaysEntries();
  }

  useEffect(() => {
    reloadTemplates();
    reloadFilingLocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  useEffect(() => {
    reloadTodaysEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryDate, showRangeFilter, rangeFrom, rangeTo]);

  // The header's global Refresh button no longer remounts this page (that wiped whatever row was
  // mid-entry — Date, Period covered, category/amount typed but not yet saved). It reloads just
  // the data lists instead, so newly-saved entries and account changes show up without losing
  // in-progress work.
  useEffect(() => {
    if (refreshNonce === 0) return;
    reloadTodaysEntries();
    reloadTemplates();
    reloadCategoryRules();
    window.api.accounts.list({ activeOnly: true }).then((r) => r.ok && setAccounts(r.data));
    reloadFilingLocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  function applyTemplate(templateId: number) {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    setMoneyAccountId(t.moneyAccountId);
    setCategoryAccountId(t.categoryAccountId);
    setBaseCents(t.amountCents);
    setTaxCode(t.taxCode as TaxCode | null);
    const templateTaxCode = t.taxCode as TaxCode | null;
    // Older templates could capture zero while the picker merely LOOKED like HST. Repair those on
    // load by recalculating a rate-based code; a zero Manual HST remains a deliberate manual value.
    const hasStoredOverride = t.manualHstCents !== null && (t.manualHstCents > 0 || templateTaxCode === 'Manual');
    setTaxCents(hasStoredOverride ? (t.manualHstCents ?? 0) : suggestTaxCents(templateTaxCode, t.amountCents));
    setTaxTouched(hasStoredOverride);
    setTaxTouchedAtBaseCents(hasStoredOverride ? t.amountCents : null);
    setDescription(t.description ?? '');
    categoryManuallySelectedRef.current = true;
    taxCodeManuallySelectedRef.current = true;
    setActiveTemplateId(t.id);
  }

  useEffect(() => {
    if (!templateId || templates.length === 0 || initialTemplateApplied.current === templateId) return;
    initialTemplateApplied.current = templateId;
    applyTemplate(templateId);
    // applyTemplate intentionally fills the existing entry form from the selected source template.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templates]);

  async function handleDeleteTemplate(templateId: number) {
    const template = templates.find((item) => item.id === templateId);
    if (!(await confirmDialog(`Delete the recurring transaction template${template ? ` “${template.name}”` : ''}? This cannot be undone.`))) return;
    await window.api.recurringTemplates.delete(templateId);
    reloadTemplates();
  }

  useEffect(() => {
    window.api.company.get().then((r) => {
      if (!r.ok) return;
      const categories = suggestedCategoriesForBusinessType(r.data.businessType);
      setSuggestedNames(new Set(categories.map((c) => c.name.toLowerCase())));
    });
  }, []);

  // The company's province decides the tax code, so an Ontario bookkeeper is not picking "HST 13%"
  // by hand on every line. Only ever fills an empty box — it must not overwrite a code the user
  // deliberately changed, and it arrives asynchronously, so it could otherwise land after a choice.
  useEffect(() => {
    if (!taxDefaultLoaded) return;
    setTaxCode((current) => current ?? effectiveDefaultTaxCode);
  }, [taxDefaultLoaded, effectiveDefaultTaxCode]);

  useEffect(() => {
    window.api.accounts.list({ activeOnly: true }).then((r) => r.ok && setAccounts(r.data));
    reloadCategoryRules();
    // Switching between Expense/Sale/Transfer keeps the money account (usually the same bank
    // account) and the date, but clears everything else that was specific to the transaction being
    // entered — category (expense and revenue accounts are different lists), amount, and
    // description all included, so a half-filled Expense never bleeds into a Sale entered right
    // after switching tabs.
    setCategoryAccountId(null);
    setBaseCents(0);
    setDescription('');
    categoryManuallySelectedRef.current = false;
    taxCodeManuallySelectedRef.current = false;
    lastAutoFilledDescriptionRef.current = '';
    setTaxCode(taxDefaultLoaded ? effectiveDefaultTaxCode : null);
    setTaxCents(0);
    setTaxTouched(false);
    setTaxTouchedAtBaseCents(null);
    setError(null);
    setSavedMessage(null);
    setPeriodFrom('');
    setPeriodTo('');
    setPeriodDetailsOpen(false);
    // The date-range filter below intentionally mixes every type together (that's its whole
    // point), but it was never turned back off when switching tabs — so once turned on once, every
    // tab kept showing that same unfiltered, all-types list forever after, looking exactly like
    // "every tab shows the same entries."
    setShowRangeFilter(false);
    setRangeFrom('');
    setRangeTo('');
    fx.reset();
    markClean();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  useEffect(() => {
    if (fx.isForeign && fx.cadAmountCents !== null) setBaseCents(fx.cadAmountCents);
  }, [fx.isForeign, fx.cadAmountCents]);

  // Suggests the tax amount at a flat rate (13% HST/Meals, 8% US) whenever the base amount or tax
  // treatment changes — but never overwrites a figure the accountant already typed by hand (or
  // loaded from a template) for the CURRENT base, since the real number on the source receipt
  // should always win over the formula. If the base changes afterward, though, that manual figure
  // no longer describes this transaction — it goes stale silently unless we release the lock and
  // go back to auto-suggesting, otherwise a corrected base keeps a leftover tax amount from
  // whatever base was on screen when it was typed (or from a loaded template's original amount).
  useEffect(() => {
    if (taxTouched && taxTouchedAtBaseCents === baseCents) return;
    setTaxCents(suggestTaxCents(taxCode, baseCents));
    if (taxTouched) setTaxTouched(false);
  }, [taxCode, baseCents, taxTouched, taxTouchedAtBaseCents]);

  // A heads-up, not a gate — checks whether this money account already has a same-amount entry
  // within a few days, so a re-entered bill or a duplicate import gets caught before it's saved
  // instead of silently doubling up. Debounced since it fires on every keystroke of the amount.
  useEffect(() => {
    if (type === 'transfer' || moneyAccountId === null || totalCents <= 0) {
      setDuplicateWarning([]);
      return;
    }
    const timeoutId = setTimeout(() => {
      window.api.journal.findPossibleDuplicates({ entryDate, accountId: moneyAccountId, amountCents: totalCents }).then((r) => {
        if (r.ok) setDuplicateWarning(r.data);
      });
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [type, moneyAccountId, totalCents, entryDate]);

  const moneyAccountOptions = useMemo(
    () =>
      accountPickerOptions(
        accounts.filter((a) => (type === 'transfer' ? isTransferEligible(a.accountType) : a.accountType === 'Asset' || a.accountType === 'Liability')),
      ),
    [accounts, type],
  );

  const categoryAccountOptions = useMemo(() => {
    const eligible = accounts.filter((a) =>
      type === 'transfer' ? isTransferEligible(a.accountType) : a.accountType === (type === 'expense' ? 'Expense' : 'Revenue'),
    );
    const isSuggested = (a: Account) => suggestedNames.has(a.name.toLowerCase());
    // Suggested-for-this-business accounts sort first (starred) — nothing is ever hidden, every
    // eligible account stays in the list either way.
    const sorted = type === 'expense' ? [...eligible].sort((a, b) => Number(isSuggested(b)) - Number(isSuggested(a))) : eligible;
    return sorted.map((a) => ({
      value: String(a.id),
      label: isSuggested(a) ? `★ ${a.name}` : a.name,
      sublabel: a.accountSubtype ?? a.accountType,
    }));
  }, [accounts, type, suggestedNames]);

  // The description rules learned for imports also make manual entry faster. Limit matches to
  // accounts that belong on this sheet so an expense can never auto-select a Revenue account (or
  // the reverse) when similar rules exist in both directions.
  const eligibleDescriptionRules = useMemo(() => {
    if (type === 'transfer') return [];
    const requiredType: Account['accountType'] = type === 'expense' ? 'Expense' : 'Revenue';
    const eligibleIds = new Set(accounts.filter((account) => account.accountType === requiredType).map((account) => account.id));
    return categoryRules.filter((rule) => eligibleIds.has(rule.accountId));
  }, [accounts, categoryRules, type]);
  const matchedDescriptionRule = useMemo(
    () => (description.trim() ? suggestCategory(description, eligibleDescriptionRules) : null),
    [description, eligibleDescriptionRules],
  );
  // Seeded rules use legacy "HST" to mean "taxable." Outside Ontario, translate that generic
  // taxable match to the company's own provincial GST/HST code instead of selecting a code that
  // is not available in the local three-choice picker.
  const detectedTaxCode =
    matchedDescriptionRule?.taxCode === 'HST' ? effectiveDefaultTaxCode : (matchedDescriptionRule?.taxCode ?? null);

  useEffect(() => {
    if (!matchedDescriptionRule || type === 'transfer') return;
    if (!categoryManuallySelectedRef.current) setCategoryAccountId(matchedDescriptionRule.accountId);
    if (detectedTaxCode && !taxCodeManuallySelectedRef.current) {
      setTaxCode(detectedTaxCode);
      setTaxTouched(false);
      setTaxTouchedAtBaseCents(null);
    }
  }, [detectedTaxCode, matchedDescriptionRule, type]);

  // Meals & entertainment is a purchase-only treatment, so it drops off the Sale tab.
  const taxOptions = taxCodeOptions(type === 'income' ? 'income' : 'expense', province);
  // The probe mirrors what the posting handler will actually write. A filed return only blocks an
  // entry that reaches a GST/HST control account, and the tax split adds that line exactly when
  // there is tax to post — so the banner and the Save button agree with the engine's answer
  // instead of promising a save the engine then refuses.
  const postingLock = useMemo(() => {
    const controlAccountId =
      type === 'transfer' || taxCents <= 0 ? null : gstHstControlAccountId(accounts, type === 'income' ? 'payable' : 'recoverable');
    return postingLockWithReason(
      {
        entryDate,
        lines: [
          {
            accountId: categoryAccountId ?? 0,
            debitCents: 0,
            creditCents: 0,
            taxCode: type === 'transfer' ? null : (taxCode ?? effectiveDefaultTaxCode),
            // The split builder records the base on the category line; the lock reads that as
            // "the tax, if any, is on the control line" — which is the line added below.
            baseCents,
          },
          ...(controlAccountId === null ? [] : [{ accountId: controlAccountId, debitCents: 0, creditCents: 0 }]),
        ],
      },
      accounts,
      fiscalPeriods,
    );
  }, [accounts, baseCents, categoryAccountId, effectiveDefaultTaxCode, entryDate, fiscalPeriods, taxCents, taxCode, type]);
  const lockedPeriod = postingLock?.kind === 'accountant' ? postingLock.period : undefined;
  const filedReturnLock = postingLock?.kind === 'hstFiling' ? postingLock.period : undefined;
  const filedReturnForDate = useMemo(
    () => hstFilings.find((filing) => entryDate >= filing.periodStart && entryDate <= filing.periodEnd),
    [entryDate, hstFilings],
  );

  /** Expense / Sale / Transfer for one entry, by which account type its category line actually
   * posted against. */
  function entryKind(e: JournalEntry): 'expense' | 'income' | 'transfer' {
    const categoryLine = e.lines.find((l) => {
      const a = accounts.find((acct) => acct.id === l.accountId);
      return a && (a.accountType === 'Expense' || a.accountType === 'Revenue');
    });
    if (!categoryLine) return 'transfer';
    const categoryAccount = accounts.find((a) => a.id === categoryLine.accountId);
    return categoryAccount?.accountType === 'Revenue' ? 'income' : 'expense';
  }

  // "Today's Entries" (and "Entries in Range") previously listed every journal entry posted for
  // the date/range regardless of tab — switching from Expense to Sale, or turning on a date range,
  // showed the exact same rows, since window.api.journal.list has no concept of "expense vs
  // income" and range mode deliberately skipped the client-side type filter entirely. Now both
  // modes always filter to the current tab's type, the same way the category dropdown already
  // does — a date range on the Sales tab shows only Sales, never Expenses or Transfers mixed in.
  //
  // Also excludes status 'void' — window.api.journal.list returns every status when no status
  // filter is passed, and "Save Correction" in EditAmountModal never deletes the original entry,
  // only voids it before posting a new corrected one. Without this exclusion the voided original
  // stayed in this list right alongside its replacement, looking exactly like a stuck duplicate
  // that editing (or deleting) had failed to remove.
  const visibleTodaysEntries = useMemo(() => {
    return todaysEntries.filter((e) => e.status !== 'void' && entryKind(e) === type && (e.source === 'quickEntry' || (e.source === 'manual' && e.sourceReference == null)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todaysEntries, accounts, type]);

  /** Sums for the totals row under the entries table — same per-entry math as each row uses
   * (total = every debit line, tax = the dedicated GST/HST line only, base = the category line's
   * stored baseCents), so the footer always reconciles to what's actually displayed above it. */
  const entriesTotals = useMemo(() => {
    return visibleTodaysEntries.reduce(
      (acc, e) => {
        const totalLineCents = e.lines.reduce((sum, l) => sum + l.debitCents, 0);
        const gstLine = e.lines.find((l) => l.description === 'GST/HST');
        const taxAmtCents = gstLine ? gstLine.debitCents || gstLine.creditCents : 0;
        const categoryLine = e.lines.find((l) => {
          const a = accounts.find((acct) => acct.id === l.accountId);
          return a && (a.accountType === 'Expense' || a.accountType === 'Revenue');
        });
        return {
          baseCents: acc.baseCents + (categoryLine?.baseCents ?? 0),
          totalCents: acc.totalCents + totalLineCents,
          taxCents: acc.taxCents + taxAmtCents,
        };
      },
      { baseCents: 0, totalCents: 0, taxCents: 0 },
    );
  }, [visibleTodaysEntries, accounts]);

  const canSave =
    moneyAccountId !== null &&
    categoryAccountId !== null &&
    baseCents > 0 &&
    moneyAccountId !== categoryAccountId &&
    !(type !== 'transfer' && fx.isForeign && fx.cadAmountCents === null);

  // Advisory, real-time nudge for common accounting-principle slips (e.g. a Transfer landing on
  // Retained Earnings, or a future-dated entry) — same rules the Accounting Audit page runs after
  // the fact, applied live here. Never blocks saving.
  const draftWarnings = useMemo(() => {
    if (moneyAccountId === null || categoryAccountId === null || baseCents <= 0) return [];
    const draftLines =
      type === 'expense'
        ? [
            { accountId: categoryAccountId, debitCents: baseCents, creditCents: 0, taxCode },
            { accountId: moneyAccountId, debitCents: 0, creditCents: baseCents },
          ]
        : type === 'income'
          ? [
              { accountId: moneyAccountId, debitCents: baseCents, creditCents: 0 },
              { accountId: categoryAccountId, debitCents: 0, creditCents: baseCents, taxCode },
            ]
          : [
              { accountId: categoryAccountId, debitCents: baseCents, creditCents: 0 },
              { accountId: moneyAccountId, debitCents: 0, creditCents: baseCents },
            ];
    return checkDraftEntryWarnings(accounts, draftLines, entryDate, todayIso());
  }, [accounts, type, moneyAccountId, categoryAccountId, baseCents, entryDate, taxCode]);

  const { markDirty, markClean } = useUnsavedGuard('quick entry', handleSave);

  // Only arms the Unsaved Changes prompt once the row is genuinely a complete, savable entry —
  // a row that's still missing a required field (no category picked yet, no amount typed) has
  // nothing worth offering to save, so navigating away just navigates away, no prompt. Previously
  // every keystroke armed the guard regardless, so leaving a half-filled row showed a "Save &
  // Leave" option that could never actually succeed.
  useEffect(() => {
    if (canSave) markDirty();
    else markClean();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSave]);

  async function handleSave(): Promise<boolean | string> {
    // Reports *which* required field is missing instead of a bare `return false` — otherwise
    // "Save & Leave" on the Unsaved Changes prompt looked broken (it always failed with only a
    // generic "check the form for errors" message) whenever the row was left partially filled in,
    // e.g. an amount typed but no category picked yet.
    if (lockedPeriod) {
      const reason = `This date is inside the fiscal period “${lockedPeriod.label}”, which was deliberately locked by an accountant. Unlock it from Settings → Fiscal Periods before posting.`;
      setError(reason);
      return reason;
    }
    if (filedReturnLock) {
      const reason = `This entry carries GST/HST inside the filed Sales Tax return “${filedReturnLock.label}”. Void that return from GST/HST Centre to reopen it before posting tax into this period.`;
      setError(reason);
      return reason;
    }
    if (!canSave || moneyAccountId === null || categoryAccountId === null) {
      const reason =
        moneyAccountId === null
          ? `Select ${copy.moneyLabel.toLowerCase()} before saving.`
          : categoryAccountId === null
            ? `Select ${copy.categoryLabel.toLowerCase()} before saving.`
            : baseCents <= 0
              ? 'Enter an amount before saving.'
              : moneyAccountId === categoryAccountId
                ? 'From and To can’t be the same account.'
                : type !== 'transfer' && fx.isForeign && fx.cadAmountCents === null
                  ? 'Enter the exchange rate before saving.'
                  : 'Fill in the required fields before saving.';
      setError(reason);
      return reason;
    }
    setBusy(true);
    setError(null);
    setSavedMessage(null);

    // Capitalized here rather than relying solely on the field's onBlur — see the same note in
    // JournalEntryFormPage.tsx: a Save click right after typing can fire in the same event batch
    // as blur, before this closure would otherwise see the capitalized value.
    const capitalizedDescription = description ? description.trim() : '';

    const foreignFields =
      type !== 'transfer' && fx.isForeign
        ? { foreignCurrency: fx.currency, foreignAmountCents: fx.foreignAmountCents, exchangeRate: fx.exchangeRate }
        : {};

    let createResult;
    if (type === 'transfer') {
      createResult = await window.api.journal.createAndPost({
        entryDate,
        memo: capitalizedDescription || null,
        reference: null,
        lines: [
          { accountId: categoryAccountId, debitCents: baseCents, creditCents: 0, description: capitalizedDescription || null },
          { accountId: moneyAccountId, debitCents: 0, creditCents: baseCents, description: capitalizedDescription || null },
        ],
        periodFrom: periodFrom || null,
        periodTo: periodTo || null,
      });
    } else {
      createResult = await window.api.quickEntry.create({
        type,
        entryDate,
        moneyAccountId,
        categoryAccountId,
        baseCents,
        taxCode,
        taxCents,
        description: capitalizedDescription || null,
        periodFrom: periodFrom || null,
        periodTo: periodTo || null,
        ...foreignFields,
      });
    }

    setBusy(false);
    if (!createResult.ok) {
      setError(createResult.error);
      return createResult.error;
    }

    const usedTemplate = activeTemplateId ? templates.find((template) => template.id === activeTemplateId) : undefined;
    if (usedTemplate?.scheduleFrequency) {
      const reminderResult = await window.api.recurringTemplates.update({ id: usedTemplate.id, patch: { lastUsedDate: entryDate, nextDueDate: nextRecurringDate(entryDate, usedTemplate.scheduleFrequency) } });
      if (!reminderResult.ok) setError(`The entry was saved, but its next recurring reminder could not be updated: ${reminderResult.error}`);
    }

    setSavedMessage(`Saved ${copy.verb} of $${(totalCents / 100).toFixed(2)}.`);
    markClean();
    setBaseCents(0);
    setDescription('');
    lastAutoFilledDescriptionRef.current = '';
    categoryManuallySelectedRef.current = false;
    taxCodeManuallySelectedRef.current = false;
    setCategoryAccountId(null);
    setTaxCode(effectiveDefaultTaxCode);
    setTaxCents(0);
    setTaxTouched(false);
    setDuplicateWarning([]);
    setPeriodFrom('');
    setPeriodTo('');
    setActiveTemplateId(null);
    fx.reset();
    // Date and Paid From/Deposited To are left as-is on purpose — entering several same-day
    // transactions back-to-back is the common case, so the next row starts ready to go.
    categoryFieldRef.current?.focus();
    reloadTodaysEntries();
    return true;
  }

  function handleRowKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && canSave && !busy) {
      e.preventDefault();
      handleSave();
    }
  }

  function showAccountantUnlockInstructions() {
    setError('This fiscal period was locked by an accountant. Unlock it from Settings → Fiscal Periods before posting this transaction.');
  }

  function closeEntryScreen() {
    if (type === 'expense') setView({ kind: 'expenses' });
    else if (type === 'income') setView({ kind: 'sales' });
    else setView({ kind: 'banking' });
  }

  async function handleSaveAndClose() {
    const saved = await handleSave();
    if (saved === true) closeEntryScreen();
  }

  // Category, [Base, Tax, Tax Amt if not transfer], Total/Amount, Description, Action.
  const columnCount = type === 'transfer' ? 4 : 7;

  return (
    <div className="flex w-full flex-col pb-4">
      <div data-testid="quick-entry-mode-row" className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setView({ kind: 'quickEntry', type: 'expense' })}
          className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium duration-250 ease-standard ${
            type === 'expense' ? 'bg-rose-100 text-rose-900 shadow-soft ring-1 ring-rose-300' : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
          }`}
        >
          Expense
        </button>
        <button
          type="button"
          onClick={() => setView({ kind: 'quickEntry', type: 'income' })}
          className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium duration-250 ease-standard ${
            type === 'income' ? 'bg-emerald-100 text-emerald-900 shadow-soft ring-1 ring-emerald-300' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          }`}
        >
          Sale / Income
        </button>
        <button
          type="button"
          onClick={() => setView({ kind: 'quickEntry', type: 'transfer' })}
          className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium duration-250 ease-standard ${
            type === 'transfer' ? 'bg-cyan-100 text-cyan-900 shadow-soft ring-1 ring-cyan-300' : 'bg-cyan-50 text-cyan-800 hover:bg-cyan-100'
          }`}
        >
          Transfer
        </button>
        <ForeignCurrencySelector fx={fx} disabled={type === 'transfer'} />
        <button type="button" onClick={() => setView({ kind: 'bulkExpenseImport' })} className="ml-auto text-sm text-brand-600 hover:underline">
          Have a whole batch in Excel? Bulk import →
        </button>
        <button type="button" onClick={() => setView({ kind: 'journalList' })} className="text-sm text-brand-600 hover:underline">
          Need a multi-line entry? Use Journal Entries →
        </button>
      </div>

      <div data-testid="quick-entry-controls" className="rounded border border-gray-200 bg-white p-3">
        {lockedPeriod && (
          <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
            <div className="font-semibold">This transaction date is inside an accountant-locked fiscal period.</div>
            <div className="mt-1">
              {lockedPeriod.label}. Only an accountant lock blocks saving; the date by itself does not.
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={showAccountantUnlockInstructions}
              className="mt-2 rounded-full border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              Show How to Unlock This Period
            </button>
          </div>
        )}
        {filedReturnLock && (
          <div className="mb-3 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
            <div className="font-semibold">This entry carries GST/HST inside a filed Sales Tax return.</div>
            <div className="mt-1">
              The return for {filedReturnLock.periodStart} to {filedReturnLock.periodEnd} has already been filed, so its tax cannot change. To
              record this transaction, void that return from GST/HST Centre to reopen it, enter the transaction, then re-file. An entry with no tax
              on it can still be saved in this period.
            </div>
            <button
              type="button"
              onClick={() => setView({ kind: 'report', report: 'hstFiling' })}
              className="mt-2 rounded-full border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Open GST/HST Centre
            </button>
          </div>
        )}
        {filedReturnForDate && !lockedPeriod && !filedReturnLock && (
          <div className="mb-3 rounded border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900" role="status">
            <div className="font-semibold">A filed Sales Tax return covers this date, but it is not an accountant lock.</div>
            <div className="mt-1">
              Save remains available. After entering this transaction, review whether the return for {filedReturnForDate.periodStart} to{' '}
              {filedReturnForDate.periodEnd} needs to be amended or re-filed.
            </div>
            <button
              type="button"
              onClick={() => setView({ kind: 'report', report: 'hstFiling' })}
              className="mt-2 rounded-full border border-sky-400 bg-white px-3 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100"
            >
              Review Sales Tax Return
            </button>
          </div>
        )}
        {error && <ErrorNotice message={error} className="mb-3" />}
        {voidError && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{voidError}</div>}
        {deleteError && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</div>}

        {type !== 'transfer' && templates.length > 0 && (
          <div className="mb-3">
            <select
              className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
              value=""
              onChange={(e) => e.target.value && applyTemplate(Number(e.target.value))}
            >
              <option value="">Load a saved template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (${(t.amountCents / 100).toFixed(2)})
                </option>
              ))}
            </select>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {templates.map((t) => (
                <span key={t.id} className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                  {t.name}
                  <button type="button" onClick={() => handleDeleteTemplate(t.id)} className="text-gray-400 hover:text-red-600" aria-label={`Delete ${t.name} template`}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Date</span>
            <input
              type="date" min={DATE_MIN} max={DATE_MAX}
              className="mt-1 w-40 rounded border border-gray-300 px-2 py-1.5"
              value={entryDate}
              onChange={(e) => setEntryDate(clampIsoDate(e.target.value))}
            />
          </label>

          <label className="block text-sm">
            <span className="text-gray-600">{copy.moneyLabel}</span>
            <div className="mt-1 w-56">
              <Combobox
                options={moneyAccountOptions}
                value={moneyAccountId !== null ? String(moneyAccountId) : null}
                onChange={(v) => setMoneyAccountId(v ? Number(v) : null)}
                placeholder={type === 'transfer' ? 'Select the account money is leaving…' : 'Select bank, cash, or credit card…'}
              />
            </div>
          </label>

          <details className="text-sm" open={periodDetailsOpen} onToggle={(e) => setPeriodDetailsOpen(e.currentTarget.open)}>
            <summary className="cursor-pointer select-none text-gray-500 hover:text-gray-700">
              Period covered (optional) — for one lump-sum row per month/quarter/year instead of entering every sale separately
            </summary>
            <div className="mt-1.5 space-y-2 rounded border border-gray-200 bg-gray-50 p-2">
              <label className="block text-sm">
                <span className="text-gray-600">Quick fill</span>
                <div className="mt-1 w-48">
                  <PeriodPresetSelect
                    referenceDateIso={entryDate}
                    onSelect={(range) => {
                      setPeriodFrom(range.from);
                      setPeriodTo(range.to);
                      // Also moves the entry's own Date to the end of the chosen period — otherwise
                      // the entry still posted (and showed up in Today's Entries) under whatever
                      // date happened to be in the Date field, usually today, regardless of which
                      // month/quarter/year was picked here.
                      setEntryDate(range.to);
                    }}
                  />
                </div>
                <span className="mt-1 block text-[11px] text-gray-400">
                  Uses the year from the Date field above — fills From/To below (which you can still adjust by hand) and moves Date to the end of
                  the period.
                </span>
              </label>
              <div className="flex gap-2">
                <label className="block text-sm">
                  <span className="text-gray-600">From</span>
                  <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={periodFrom} onChange={(e) => setPeriodFrom(clampIsoDate(e.target.value))} />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">To</span>
                  <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={periodTo} onChange={(e) => setPeriodTo(clampIsoDate(e.target.value))} />
                </label>
              </div>
            </div>
          </details>
        </div>

        {type !== 'transfer' && <ForeignCurrencyDetails fx={fx} />}

      </div>

      <div data-testid="quick-entry-history" className="order-last mt-3">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {showRangeFilter ? 'Entries in Range' : "Today's Entries"}
            </h2>
            <div className="flex items-center gap-2 text-xs">
              {showRangeFilter ? (
                <>
                  <input type="date" min={DATE_MIN} max={DATE_MAX} className="rounded border border-gray-300 px-1.5 py-1" value={rangeFrom} onChange={(e) => setRangeFrom(clampIsoDate(e.target.value))} />
                  <span className="text-gray-400">to</span>
                  <input type="date" min={DATE_MIN} max={DATE_MAX} className="rounded border border-gray-300 px-1.5 py-1" value={rangeTo} onChange={(e) => setRangeTo(clampIsoDate(e.target.value))} />
                  <button
                    type="button"
                    onClick={() => {
                      setShowRangeFilter(false);
                      setRangeFrom('');
                      setRangeTo('');
                    }}
                    className="font-medium text-brand-600 hover:underline"
                  >
                    Today only
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setShowRangeFilter(true)} className="font-medium text-brand-600 hover:underline">
                  Show a date range →
                </button>
              )}
            </div>
          </div>
          {visibleTodaysEntries.length === 0 ? (
            <p className="text-sm text-gray-400">
              {showRangeFilter && !rangeFrom && !rangeTo ? 'Pick a From and/or To date above.' : 'No entries in this range.'}
            </p>
          ) : (
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="px-3 py-2" title="The date the expense/sale actually happened — editable">
                  Date
                </th>
                <th className="px-3 py-2" title="When this row was actually entered into Apex Ledger — not editable">
                  Entered
                </th>
                <th className="px-3 py-2">{showRangeFilter ? 'Category / Account' : copy.categoryLabel}</th>
                {type !== 'transfer' && <th className="px-3 py-2">Base Amt</th>}
                <th className="px-3 py-2">{type === 'transfer' && !showRangeFilter ? 'Amount' : 'Total'}</th>
                {(type !== 'transfer' || showRangeFilter) && <th className="px-3 py-2">Tax</th>}
                <th className="px-3 py-2">Description</th>
                <th className="sticky right-0 bg-gray-50 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibleTodaysEntries.map((e) => {
                const totalLineCents = e.lines.reduce((sum, l) => sum + l.debitCents, 0);
                const categoryLine = e.lines.find((l) => {
                  const a = accounts.find((acct) => acct.id === l.accountId);
                  return a && (a.accountType === 'Expense' || a.accountType === 'Revenue');
                });
                const categoryName = categoryLine ? accounts.find((a) => a.id === categoryLine.accountId)?.name : accounts.find((a) => a.id === e.lines[0]?.accountId)?.name;
                const gstLine = e.lines.find((l) => l.description === 'GST/HST');
                const taxAmtCents = gstLine ? gstLine.debitCents || gstLine.creditCents : 0;
                return (
                  <tr key={e.id} className="border-b border-gray-100 text-gray-600">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <EditableDateCell entryId={e.id} value={e.entryDate} onSaved={reloadTodaysEntries} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 tabular-nums">{formatEnteredAt(e.createdAt)}</td>
                    <td className="px-3 py-2">{categoryName ?? '—'}</td>
                    {type !== 'transfer' && (
                      <td className="px-3 py-2 font-mono tabular-nums">
                        {categoryLine?.baseCents != null ? `$${(categoryLine.baseCents / 100).toFixed(2)}` : '—'}
                      </td>
                    )}
                    <td className="px-3 py-2 font-mono tabular-nums">${(totalLineCents / 100).toFixed(2)}</td>
                    {(type !== 'transfer' || showRangeFilter) &&
                      (type !== 'transfer' ? (
                        <td className="px-3 py-2 font-mono tabular-nums">{taxAmtCents > 0 ? `$${(taxAmtCents / 100).toFixed(2)}` : '—'}</td>
                      ) : (
                        <td className="px-3 py-2 text-gray-300">—</td>
                      ))}
                    <td className="px-3 py-2">{e.memo ?? ''}</td>
                    <td className="sticky right-0 bg-white px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingEntry(e)}
                          className="text-xs font-medium text-brand-600 hover:underline"
                          title="Just fix the amount or date, without opening the full Journal Entry form"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={voidingId === e.id}
                          onClick={() => handleVoidTodaysEntry(e)}
                          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                          title="Wrong amount? Unpost this entry, then re-enter it correctly below."
                        >
                          {voidingId === e.id ? 'Unposting…' : 'Unpost'}
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === e.id}
                          onClick={() => handleDeleteTodaysEntry(e)}
                          className="text-xs font-medium text-red-800 hover:underline disabled:opacity-50"
                          title="Permanently remove this entry — unposts it and deletes it completely, unlike Unpost. Cannot be undone."
                        >
                          {deletingId === e.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-700">
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2">Total ({visibleTodaysEntries.length})</td>
                {type !== 'transfer' && <td className="px-3 py-2 font-mono tabular-nums">${(entriesTotals.baseCents / 100).toFixed(2)}</td>}
                <td className="px-3 py-2 font-mono tabular-nums">${(entriesTotals.totalCents / 100).toFixed(2)}</td>
                {(type !== 'transfer' || showRangeFilter) && (
                  <td className="px-3 py-2 font-mono tabular-nums">${(entriesTotals.taxCents / 100).toFixed(2)}</td>
                )}
                <td className="px-3 py-2" />
                <td className="sticky right-0 bg-gray-50 px-3 py-2" />
              </tr>
            </tfoot>
          </table>
          </div>
          )}
        </div>

      <section data-testid="quick-entry-new-row" className="mt-5 border-t-2 border-gray-200 pt-4">
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">New {copy.verb}</h2>
      <p className="mb-1.5 text-xs text-gray-400">
        Date and {copy.moneyLabel.toLowerCase()} apply to the row below. Fill it in and press Enter (or click ✓) to post it — a fresh empty row is
        ready right after.
      </p>
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="px-3 py-2">{copy.categoryLabel}</th>
              {type !== 'transfer' && <th className="px-3 py-2">Base</th>}
              {type !== 'transfer' && <th className="px-3 py-2">Tax</th>}
              {type !== 'transfer' && <th className="px-3 py-2">Tax Amt</th>}
              <th className="px-3 py-2">{type === 'transfer' ? 'Amount' : 'Total'}</th>
              <th className="px-3 py-2">Description</th>
              <th className="sticky right-0 bg-gray-50 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr onKeyDown={handleRowKeyDown}>
              <td className="px-3 py-2 align-top">
                <Combobox
                  ref={categoryFieldRef}
                  options={categoryAccountOptions}
                  addNewLabel={type === 'transfer' ? '+ New account' : '+ New category'}
                  onAddNew={() => setNewCategoryFor({ parent: null })}
                  onAddSub={(option) =>
                    setNewCategoryFor({ parent: accounts.find((a) => a.id === Number(option.value)) ?? null })
                  }
                  value={categoryAccountId !== null ? String(categoryAccountId) : null}
                  onChange={(v) => {
                    categoryManuallySelectedRef.current = true;
                    const newId = v ? Number(v) : null;
                    setCategoryAccountId(newId);
                    const categoryName = newId !== null ? (accounts.find((a) => a.id === newId)?.name ?? '') : '';
                    // Prefills Description with the category name — but only if Description is
                    // still empty or still holds a previous auto-fill, so it never overwrites
                    // something the user typed by hand.
                    setDescription((prev) => {
                      if (!categoryName || (prev !== '' && prev !== lastAutoFilledDescriptionRef.current)) return prev;
                      lastAutoFilledDescriptionRef.current = categoryName;
                      return categoryName;
                    });
                  }}
                  placeholder={type === 'expense' ? 'Expense category…' : type === 'income' ? 'Income category…' : 'To account…'}
                />
                {categoryAccountOptions.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">No eligible accounts found — add one on Chart of Accounts first.</p>
                )}
                {type === 'transfer' && moneyAccountId !== null && moneyAccountId === categoryAccountId && (
                  <p className="mt-1 text-xs text-amber-600">From and To can't be the same account.</p>
                )}
              </td>
              {type !== 'transfer' ? (
                <>
                  <td className="w-28 px-3 py-2 align-top">
                    <CurrencyInput
                      valueCents={baseCents}
                      onChange={(cents) => setBaseCents(cents)}
                      disabled={fx.isForeign}
                    />
                  </td>
                  <td className="w-40 px-3 py-2 align-top">
                    <select
                      aria-label="Tax status"
                      className="w-full rounded border border-gray-300 px-2 py-1.5"
                      value={taxCode ?? ''}
                      onChange={(e) => {
                        taxCodeManuallySelectedRef.current = true;
                        setTaxCode((e.target.value || null) as TaxCode | null);
                        setTaxTouched(false);
                        setTaxTouchedAtBaseCents(null);
                      }}
                    >
                      {taxOptions.map((opt) => (
                        <option key={opt.value} value={opt.value} title={opt.title}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={taxCode === 'Manual' ? 'w-56 px-3 py-2 align-top' : 'w-24 px-3 py-2 align-top'}>
                    {taxCode && taxCode !== 'NonHST' ? (
                      taxCode === 'Manual' ? (
                        <CustomTaxRateInput
                          baseCents={baseCents}
                          taxCents={taxCents}
                          onTaxCentsChange={(cents) => {
                            setTaxCents(cents);
                            setTaxTouched(true);
                            setTaxTouchedAtBaseCents(baseCents);
                          }}
                        />
                      ) : (
                        <CurrencyInput
                          valueCents={taxCents}
                          onChange={(cents) => {
                            setTaxCents(cents);
                            setTaxTouched(true);
                            setTaxTouchedAtBaseCents(baseCents);
                          }}
                        />
                      )
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </>
              ) : (
                <td className="w-28 px-3 py-2 align-top">
                  <CurrencyInput valueCents={baseCents} onChange={(cents) => setBaseCents(cents)} />
                </td>
              )}
              {type !== 'transfer' && <td className="w-24 px-3 py-2 align-top font-mono tabular-nums text-gray-700">${(totalCents / 100).toFixed(2)}</td>}
              <td className="px-3 py-2 align-top">
                <input
                  name="quick-entry-description"
                  autoComplete="on"
                  list={suggestionListId('transaction-memo')}
                  className="w-full rounded border border-gray-300 px-2 py-1.5"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={(e) => {
                    setDescription(e.target.value);
                    recordSuggestion('transaction-memo', e.target.value);
                  }}
                  placeholder={type === 'expense' ? 'e.g. Office supplies from Staples' : type === 'income' ? 'e.g. Invoice payment from client' : 'e.g. Transfer to savings'}
                />
                <SuggestionDatalist fieldKey="transaction-memo" />
                {matchedDescriptionRule && type !== 'transfer' && (
                  <p className="mt-1 text-xs text-emerald-700">
                    Detected from description:{' '}
                    {detectedTaxCode
                      ? (taxOptions.find((option) => option.value === detectedTaxCode)?.label ?? taxCodeLabel(detectedTaxCode))
                      : 'category only'}
                    . You can
                    change it manually.
                  </p>
                )}
              </td>
              <td className="sticky right-0 bg-white px-3 py-2 align-top text-right">
                <button
                  type="button"
                  disabled={!canSave || busy || lockedPeriod !== undefined || filedReturnLock !== undefined}
                  onClick={handleSave}
                  title={`Save ${copy.verb} (Enter)`}
                  className="whitespace-nowrap rounded-full bg-brand-300 px-3 py-1.5 text-xs font-bold text-brand-900 hover:bg-brand-400 disabled:opacity-40"
                >
                  ✓ Save &amp; Next
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Same save action as the row's own button/Enter key — kept here too, always in view
          regardless of the table's width or horizontal scroll position, since the row button can
          end up off to the right on a narrow window. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={closeEntryScreen}
          className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave || busy || lockedPeriod !== undefined || filedReturnLock !== undefined}
          onClick={handleSaveAndClose}
          className="rounded-full bg-brand-300 px-4 py-2 text-sm font-bold text-brand-900 hover:bg-brand-400 disabled:opacity-40"
        >
          Save &amp; Close
        </button>
        <button
          type="button"
          disabled={!canSave || busy || lockedPeriod !== undefined || filedReturnLock !== undefined}
          onClick={handleSave}
          className="rounded-full bg-brand-300 px-4 py-2 text-sm font-bold text-brand-900 hover:bg-brand-400 disabled:opacity-40"
        >
          Save &amp; Next
        </button>
      </div>

      {savedMessage && <p className="mt-2 text-sm text-green-700">{savedMessage}</p>}
      {type === 'expense' && taxCode === 'MealsHST' && (
        <p className="mt-2 text-xs text-gray-400">
          CRA only allows a 50% Input Tax Credit on meals &amp; entertainment — half the tax above is recorded as recoverable, the other
          half is added to the expense as a real cost.
        </p>
      )}
      {type !== 'transfer' && taxCode === 'Manual' && <p className="mt-2 text-xs text-gray-400">Enter the actual HST from the source invoice in the Tax Amt box. Left blank, the line is excluded from HST totals until it is filled in.</p>}
      {duplicateWarning.length > 0 && (
        <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Possible duplicate — {duplicateWarning.length === 1 ? 'an entry' : `${duplicateWarning.length} entries`} for this exact amount already
          exist{duplicateWarning.length === 1 ? 's' : ''} on this account within a few days ({duplicateWarning.map((d) => d.entryDate).join(', ')}).
          Double-check before saving if you haven't already entered this.
        </p>
      )}
      {draftWarnings.map((w) => (
        <p key={w.id} className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {w.message}
        </p>
      ))}
      {type !== 'transfer' && moneyAccountId !== null && categoryAccountId !== null && baseCents > 0 && (
        <button type="button" onClick={() => setShowSaveTemplate(true)} className="mt-2 text-sm text-brand-600 hover:underline">
          Save this row as a reusable template →
        </button>
      )}
      </section>

      {type !== 'transfer' && moneyAccountId !== null && categoryAccountId !== null && (
        <SaveTemplateModal
          open={showSaveTemplate}
          onClose={() => setShowSaveTemplate(false)}
          onSaved={reloadTemplates}
          type={type}
          moneyAccountId={moneyAccountId}
          categoryAccountId={categoryAccountId}
          baseCents={baseCents}
          taxCode={taxCode}
          taxCents={taxCents}
          description={description}
        />
      )}

      {/* Creating a category mid-entry. The new account is selected straight away, so the flow is
          "no account for this yet" -> create it -> carry on typing the same entry, rather than
          abandoning the entry to go to the Chart of Accounts. */}
      <AccountFormModal
        open={newCategoryFor !== null}
        onClose={() => setNewCategoryFor(null)}
        initialParent={newCategoryFor?.parent ?? null}
        initialType={type === 'income' ? 'Revenue' : type === 'expense' ? 'Expense' : null}
        onSaved={(created) => {
          setNewCategoryFor(null);
          window.api.accounts.list({ activeOnly: true }).then((r) => {
            if (r.ok) setAccounts(r.data);
          });
          categoryManuallySelectedRef.current = true;
          setCategoryAccountId(created.id);
          categoryFieldRef.current?.focus();
        }}
      />

      {editingEntry && (
        <EditAmountModal
          entry={editingEntry}
          accounts={accounts}
          onClose={() => setEditingEntry(null)}
          onSaved={() => {
            setEditingEntry(null);
            reloadTodaysEntries();
          }}
        />
      )}
    </div>
  );
}
