import { RecordNavigator } from '../../components/RecordNavigator';
import { BackButton } from '../../components/BackButton';
import { nameScopeForAccount, nameScopeHint, nameStillValid } from '@shared/domain/contacts/nameColumnScope';
import { LineTagPicker } from './LineTagPicker';
import type { TagGroupRow } from '../../../preload/index';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Account, Contact, TaxCode } from '@shared/domain/types';
import { taxPortionCents } from '@shared/domain/ledger/hstSummary';
import { parsePastedJournalLines } from '@shared/domain/journal/parsePastedJournalLines';
import type { RepeatEntryMatch } from '@shared/domain/journal/findPossibleDuplicates';
import { checkDraftEntryWarnings } from '@shared/domain/audit/checkDraftEntryWarnings';
import { Combobox } from '../../components/Combobox';
import { Modal } from '../../components/Modal';
import { CurrencyInput } from '../../components/CurrencyInput';
import { EditableDateCell } from '../../components/EditableDateCell';
import { Money } from '../../components/Money';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { AccountFormModal } from '../chart-of-accounts/AccountFormModal';
import { useUiStore } from '../../app/store/uiStore';
import { accountPickerOptions } from '../../utils/accountLabel';
import { capitalizeWords, suggestOnBlur } from '../../utils/textCase';
import { recordSuggestion, suggestionListId } from '../../utils/textSuggestions';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { confirmDialog } from '../../app/store/confirmStore';
import { confirmLockedOverride } from '../../utils/lockedPeriodGuard';
import { taxCodeOptions } from '@shared/domain/ledger/taxCodes';
import { useCompanyTaxDefault } from '../../hooks/useCompanyTaxDefault';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { formatEnteredAt } from '@shared/domain/audit/enteredStamp';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { AttachmentsPanel } from '../../components/AttachmentsPanel';
import { DocumentHistoryPanel } from '../../components/DocumentHistoryPanel';
import { APPROVAL_STATUS_LABELS } from '@shared/domain/workflow/approvals';
import { ErrorNotice } from '../../components/ErrorNotice';


interface LineRow {
  key: string;
  lineId: number | null;
  accountId: number | null;
  debitCents: number;
  creditCents: number;
  description: string;
  taxCode: TaxCode | null;
  manualHstCents: number;
  /** At most one of these is set — see JournalEntryLine.vendorId/customerId. */
  vendorId: number | null;
  customerId: number | null;
}

let rowKeyCounter = 0;
function newRow(): LineRow {
  rowKeyCounter += 1;
  return {
    key: `row-${rowKeyCounter}`,
    lineId: null,
    accountId: null,
    debitCents: 0,
    creditCents: 0,
    description: '',
    taxCode: null,
    manualHstCents: 0,
    vendorId: null,
    customerId: null,
  };
}

// Account and Description are the two columns reviewers actually read/type long text into, so
// they're the ones worth letting the reviewer widen — dragged widths persist across sessions the
// same way other sidebar/table UI preferences in this app do (see sidebarPrefs.ts).
const COLUMN_WIDTHS_STORAGE_KEY = 'nl-je-line-column-widths';
const DEFAULT_COLUMN_WIDTHS = { account: 260, description: 240 };

function loadColumnWidths(): { account: number; description: number } {
  try {
    const raw = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMN_WIDTHS;
    const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_COLUMN_WIDTHS>;
    return { account: parsed.account ?? DEFAULT_COLUMN_WIDTHS.account, description: parsed.description ?? DEFAULT_COLUMN_WIDTHS.description };
  } catch {
    return DEFAULT_COLUMN_WIDTHS;
  }
}

/** The "Name" column's combined vendor+customer picker value is encoded as "v:5" or "c:3" so one
 * Combobox can offer both lists at once — decoded back into the pair of nullable ids the line
 * actually stores. */
function encodeNameValue(vendorId: number | null, customerId: number | null): string | null {
  if (vendorId !== null) return `v:${vendorId}`;
  if (customerId !== null) return `c:${customerId}`;
  return null;
}
function decodeNameValue(value: string | null): { vendorId: number | null; customerId: number | null } {
  if (!value) return { vendorId: null, customerId: null };
  const [kind, idStr] = value.split(':');
  const id = Number(idStr);
  return kind === 'v' ? { vendorId: id, customerId: null } : { vendorId: null, customerId: id };
}

/** For an already-posted line, the whole-entry Save Draft/Post flow isn't available, so entering
 * a Manual HST amount needs its own explicit "Link" action — same endpoint the dedicated Manual
 * HST Input page uses, just reachable inline here too. */
function ManualHstLinkCell({ lineId, initialCents }: { lineId: number; initialCents: number }) {
  const [valueCents, setValueCents] = useState(initialCents);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(initialCents > 0);
  const [error, setError] = useState<string | null>(null);

  async function handleLink() {
    setSaving(true);
    setError(null);
    const result = await window.api.journal.setManualHst({ lineId, manualHstCents: valueCents });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
  }

  return (
    <div className="flex items-center gap-1">
      <div className="w-24">
        <CurrencyInput
          valueCents={valueCents}
          onChange={(cents) => {
            setValueCents(cents);
            setSaved(false);
          }}
        />
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={handleLink}
        className="rounded-full bg-brand-100 px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
      >
        {saving ? '…' : saved ? 'Update' : 'Link'}
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}

export function JournalEntryFormPage({ id }: { id: number | 'new' }) {
  // Tax codes ordered with the company's own province first — see useCompanyTaxDefault.
  const { province: taxProvince, defaultTaxCode } = useCompanyTaxDefault();
  const TAX_CODE_OPTIONS = taxCodeOptions('all', taxProvince, { includeBlank: true });
  const setView = useUiStore((s) => s.setView);
  const [currentId, setCurrentId] = useState<number | 'new'>(id);
  const [status, setStatus] = useState<'draft' | 'posted' | 'void'>('draft');
  const [enteredAt, setEnteredAt] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  /** A bill, invoice or receipt posts its GST/HST on its own line, so showing a 13/113 "portion"
   * beside each category line as well would double the tax and mislead. The per-line HST figure
   * is only for entries that carry no dedicated tax line. */
  function entryHasSeparateTaxLine(): boolean {
    return lines.some((l) => {
      const account = accounts.find((a) => a.id === l.accountId);
      return /gst\/hst/i.test(account?.name ?? '') || l.description === 'GST/HST' || l.description === 'GST/HST collected';
    });
  }
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [entryDate, setEntryDate] = useState(() => localIsoDate());
  const [memo, setMemo] = useState('');
  const [reference, setReference] = useState('');
  const [isAdjustingEntry, setIsAdjustingEntry] = useState(false);
  /** The account usually posted opposite the one line that currently carries an amount, learned
   * from this file's own history. Offered rather than applied: a suggestion accepted without
   * thinking is worse than none, so it takes a click. */
  const [contraSuggestion, setContraSuggestion] = useState<{ accountId: number; confidence: number } | null>(null);
  /** Creating a name that isn't on file yet, without leaving the entry. The Name column only ever
   * offered vendors and customers already registered, so a one-off payee — a person, a refund to a
   * walk-in, anyone — could not be recorded at all. */
  const [newContact, setNewContact] = useState<{ lineKey: string; name: string; kind: 'vendor' | 'customer' } | null>(null);
  const [newContactBusy, setNewContactBusy] = useState(false);
  /** The guided "money in / money out" panel. Journal Entry is the raw two-sided view, which is
   * correct but demands you know which column an amount belongs in — and getting that wrong is how
   * an entry ends up with two debits to the bank and nothing on the other side. This asks the
   * question the way Quick Entry does ("paid from what, for what, how much") and writes both lines
   * itself, while the grid underneath stays available for anything it cannot express. */
  const [guidedOpen, setGuidedOpen] = useState(false);
  const [guidedDirection, setGuidedDirection] = useState<'out' | 'in'>('out');
  const [guidedMoneyAccountId, setGuidedMoneyAccountId] = useState<number | null>(null);
  const [guidedCategoryAccountId, setGuidedCategoryAccountId] = useState<number | null>(null);
  const [guidedCents, setGuidedCents] = useState(0);
  const [guidedDescription, setGuidedDescription] = useState('');
  const [lines, setLines] = useState<LineRow[]>([newRow(), newRow()]);
  /** Tag groups and this entry's saved line tags, both fetched once here rather than per line. */
  const [tagGroups, setTagGroups] = useState<TagGroupRow[]>([]);
  const [lineTags, setLineTags] = useState<Record<number, number[]>>({});
  /** Every saved entry id, oldest first — what the arrows page through. */
  const [allEntryIds, setAllEntryIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteSummary, setPasteSummary] = useState<string | null>(null);
  const [receiptFilePath, setReceiptFilePath] = useState<string | null>(null);
  // "Repeat transaction" sensor — a past posted entry with this exact memo, offered as a one-click
  // starting point. Dismissed per-memo (not just once) so retyping the same repeat memo after
  // dismissing it still offers the suggestion again, but re-blurring the SAME memo unchanged
  // doesn't keep nagging.
  const [repeatMatch, setRepeatMatch] = useState<RepeatEntryMatch | null>(null);
  const [dismissedRepeatMemo, setDismissedRepeatMemo] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState(loadColumnWidths);
  const lastRowAccountRef = useRef<HTMLInputElement | null>(null);
  const focusNewRowRef = useRef(false);
  // Debit/Credit auto-focus: picking an account on a still-blank line focuses whichever amount box
  // matches that account's normal balance (see updateLine's accountId branch), so the reviewer's
  // cursor is already in the box they're about to type into instead of guessing debit vs. credit.
  const debitInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const creditInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const focusAmountRef = useRef<{ key: string; side: 'debit' | 'credit' } | null>(null);
  // Tracks the Add/Edit Account modal across three states for whichever line opened it: brand-new
  // account (accountModalEditingAccount null, accountModalParent null), editing the line's current
  // account (accountModalEditingAccount set), or creating a sub-account of an account being viewed
  // (accountModalEditingAccount cleared, accountModalParent set) — accountModalLineKey stays the
  // same throughout so the modal doesn't close when jumping between those states.
  const [accountModalLineKey, setAccountModalLineKey] = useState<string | null>(null);
  const [accountModalEditingAccount, setAccountModalEditingAccount] = useState<Account | null>(null);
  const [accountModalParent, setAccountModalParent] = useState<Account | null>(null);

  useEffect(() => {
    window.api.accounts.list({ activeOnly: true }).then((r) => r.ok && setAccounts(r.data));
    window.api.vendors.list().then((r) => r.ok && setVendors(r.data.filter((v) => v.isActive)));
    window.api.customers.list().then((r) => r.ok && setCustomers(r.data.filter((c) => c.isActive)));
  }, []);

  useEffect(() => {
    window.api.tags.groups({ activeOnly: true }).then((r) => r.ok && setTagGroups(r.data));
    // Ordered by date then id, so the arrows walk the books the way they were written rather than
    // the order rows happen to sit in the table.
    window.api.journal.list({}).then((r) => {
      if (!r.ok) return;
      const ordered = [...r.data].sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.id - b.id);
      setAllEntryIds(ordered.map((e) => e.id));
    });
  }, []);

  useEffect(() => {
    if (typeof currentId !== 'number') {
      setLineTags({});
      return;
    }
    window.api.tags.forEntry(currentId).then((r) => r.ok && setLineTags(r.data));
  }, [currentId]);

  useEffect(() => {
    if (typeof currentId !== 'number') {
      setReceiptFilePath(null);
      return;
    }
    // A Bill keeps its receipt path on its own row, but an entry posted straight from Receipt
    // Inbox as a Quick Expense/Sale has no row of its own to carry that on — look it up.
    window.api.receiptInbox.getForJournalEntry(currentId).then((r) => setReceiptFilePath(r.ok && r.data ? r.data.archivedFilePath : null));
  }, [currentId]);

  useEffect(() => {
    if (typeof currentId !== 'number') return;
    window.api.journal.get(currentId).then((r) => {
      if (!r.ok) return setError(r.error);
      const entry = r.data;
      setEntryDate(entry.entryDate);
      setMemo(entry.memo ?? '');
      setReference(entry.reference ?? '');
      setStatus(entry.status);
      setEnteredAt(entry.createdAt);
      setIsAdjustingEntry(entry.isAdjustingEntry);
      setLines(
        entry.lines.length > 0
          ? entry.lines.map((l) => ({
              key: `line-${l.id}`,
              lineId: l.id,
              accountId: l.accountId,
              debitCents: l.debitCents,
              creditCents: l.creditCents,
              description: l.description ?? '',
              taxCode: l.taxCode,
              manualHstCents: l.manualHstCents ?? 0,
              vendorId: l.vendorId,
              customerId: l.customerId,
            }))
          : [newRow(), newRow()],
      );
      markClean();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const totalDebitCents = lines.reduce((sum, l) => sum + l.debitCents, 0);
  const totalCreditCents = lines.reduce((sum, l) => sum + l.creditCents, 0);
  const isBalanced = totalDebitCents === totalCreditCents && totalDebitCents > 0;
  const editable = status === 'draft';

  const accountOptions = useMemo(() => accountPickerOptions(accounts), [accounts]);

  // Combines vendors and customers into one picker for the "Name" column, same as QuickBooks'
  // journal-entry Name field — tags a line with a payee independent of its category account.
  const vendorOptions = useMemo(() => vendors.map((v) => ({ value: `v:${v.id}`, label: v.name, sublabel: 'Vendor' })), [vendors]);
  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: `c:${c.id}`, label: c.name, sublabel: 'Customer' })),
    [customers],
  );

  /** The names offered against one line's account.
   *
   * Accounts Payable is what the business owes its vendors, so a customer's name on an AP line is
   * always wrong — and it is wrong in a way that only shows up later, as a payables ageing that
   * disagrees with the ledger. Receivable is the same mistake the other way round. Every other
   * account still offers both. */
  const nameOptionsFor = useCallback(
    (accountId: number | null) => {
      const scope = nameScopeForAccount(accounts.find((a) => a.id === accountId));
      if (scope === 'vendor') return vendorOptions;
      if (scope === 'customer') return customerOptions;
      return [...vendorOptions, ...customerOptions];
    },
    [accounts, vendorOptions, customerOptions],
  );

  // Advisory, real-time nudge for common accounting-principle slips — same rules the Accounting
  // Audit page runs after the fact, applied live to just this entry. Never blocks saving.
  const draftWarnings = useMemo(() => {
    if (!editable) return [];
    const draftLines = lines
      .filter((l) => l.accountId !== null && (l.debitCents > 0 || l.creditCents > 0))
      .map((l) => ({ accountId: l.accountId as number, debitCents: l.debitCents, creditCents: l.creditCents, taxCode: l.taxCode }));
    return checkDraftEntryWarnings(accounts, draftLines, entryDate, localIsoDate());
  }, [accounts, lines, entryDate, editable]);

  const { markDirty, markClean } = useUnsavedGuard('journal entry', async () => {
    const savedId = await persist();
    return savedId !== null;
  });

  function updateLine(key: string, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    if (editable) markDirty();
  }

  /** One-click balance: put the outstanding difference on the first empty line (or a new line) as
   * the balancing debit/credit, so an entry is never left unbalanced by a single missed amount. */
  function balanceEntry() {
    const diff = totalDebitCents - totalCreditCents;
    if (diff === 0) return;
    const amount = Math.abs(diff);
    const needCredit = diff > 0; // debits exceed credits -> the balancing line is a credit
    const filled = { debitCents: needCredit ? 0 : amount, creditCents: needCredit ? amount : 0 };
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.debitCents === 0 && l.creditCents === 0);
      if (idx >= 0) return prev.map((l, i) => (i === idx ? { ...l, ...filled } : l));
      return [...prev, { ...newRow(), ...filled }];
    });
    markDirty();
  }

  /** Enter on the last row appends a new one and jumps focus straight to its Account field, so a
   * whole entry can be typed without ever reaching for the mouse — matching a spreadsheet-style
   * row-at-a-time flow instead of clicking "+ Add line" each time. */
  function addRowAndFocus() {
    focusNewRowRef.current = true;
    setLines((prev) => [...prev, newRow()]);
    markDirty();
  }

  useEffect(() => {
    if (focusNewRowRef.current) {
      focusNewRowRef.current = false;
      lastRowAccountRef.current?.focus();
    }
  }, [lines]);

  useEffect(() => {
    if (!focusAmountRef.current) return;
    const { key, side } = focusAmountRef.current;
    focusAmountRef.current = null;
    const refs = side === 'debit' ? debitInputRefs.current : creditInputRefs.current;
    refs.get(key)?.focus();
  }, [lines]);

  // Fires while exactly one line has an amount and the entry is not yet balanced — the moment the
  // other half is missing and knowable. Asking earlier has nothing to go on; asking once the entry
  // balances would be noise.
  useEffect(() => {
    if (!editable) return setContraSuggestion(null);
    if (isBalanced) return setContraSuggestion(null);
    const diff = totalDebitCents - totalCreditCents;
    if (diff === 0) return setContraSuggestion(null);

    // The missing line goes on the lighter side, so the habit to look up is the one belonging to
    // the accounts already sitting on the HEAVIER side. Restricting this to a single filled line,
    // as it first did, meant it said nothing about the ordinary case of several expense lines
    // waiting on one payment line — which is most of what a journal entry actually looks like.
    const heavySide: 'debit' | 'credit' = diff > 0 ? 'debit' : 'credit';
    const onHeavySide = lines.filter(
      (l) => l.accountId !== null && (heavySide === 'debit' ? l.debitCents > 0 : l.creditCents > 0),
    );
    if (onHeavySide.length === 0) return setContraSuggestion(null);
    // Largest line wins: with several, it is the one whose habit most likely governs the entry.
    const source = [...onHeavySide].sort(
      (a, b) => (heavySide === 'debit' ? b.debitCents - a.debitCents : b.creditCents - a.creditCents),
    )[0];
    const side = heavySide;
    let cancelled = false;
    window.api.journal.suggestContraAccount({ accountId: source.accountId!, side }).then((r) => {
      if (cancelled) return;
      // Never suggest an account the entry already uses — that would just be telling the user to
      // post a line against itself.
      const already = new Set(lines.map((l) => l.accountId));
      setContraSuggestion(r.ok && r.data && !already.has(r.data.accountId) ? r.data : null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, isBalanced, editable, totalDebitCents, totalCreditCents]);

  /** Fills the missing half: the suggested account on the first empty line, with whatever amount
   * balances the entry. Exactly what balanceEntry does, plus the account. */
  function applyContraSuggestion() {
    if (!contraSuggestion) return;
    const diff = totalDebitCents - totalCreditCents;
    if (diff === 0) return;
    const amount = Math.abs(diff);
    const needCredit = diff > 0;
    const filled = {
      accountId: contraSuggestion.accountId,
      debitCents: needCredit ? 0 : amount,
      creditCents: needCredit ? amount : 0,
    };
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.accountId === null && l.debitCents === 0 && l.creditCents === 0);
      if (idx >= 0) return prev.map((l, i) => (i === idx ? { ...l, ...filled } : l));
      return [...prev, { ...newRow(), ...filled }];
    });
    setContraSuggestion(null);
    markDirty();
  }

  /** Turns the guided panel into the two lines it implies, and appends them.
   *
   * Money out: the category is debited (the cost is incurred) and the bank credited (the money
   * left). Money in reverses both. That single decision is the whole reason this panel exists. */
  function addGuidedLines() {
    if (guidedMoneyAccountId === null || guidedCategoryAccountId === null || guidedCents <= 0) return;
    const out = guidedDirection === 'out';
    const description = guidedDescription.trim();
    const categoryLine = {
      ...newRow(),
      accountId: guidedCategoryAccountId,
      debitCents: out ? guidedCents : 0,
      creditCents: out ? 0 : guidedCents,
      description,
    };
    const moneyLine = {
      ...newRow(),
      accountId: guidedMoneyAccountId,
      debitCents: out ? 0 : guidedCents,
      creditCents: out ? guidedCents : 0,
      description,
    };
    setLines((prev) => {
      // Drop the untouched blank rows a fresh entry starts with, so adding two lines does not
      // leave two empty ones stranded above them.
      const kept = prev.filter((l) => l.accountId !== null || l.debitCents > 0 || l.creditCents > 0);
      return [...kept, categoryLine, moneyLine];
    });
    setGuidedCents(0);
    setGuidedDescription('');
    setGuidedCategoryAccountId(null);
    markDirty();
  }

  /** Saves the typed name as a vendor or customer and attaches it to the line that asked for it. */
  async function saveNewContact() {
    if (!newContact || !newContact.name.trim()) return;
    setNewContactBusy(true);
    const api = newContact.kind === 'vendor' ? window.api.vendors : window.api.customers;
    const result = await api.save({ name: capitalizeWords(newContact.name.trim()) });
    setNewContactBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (newContact.kind === 'vendor') {
      setVendors((prev) => [...prev, result.data]);
      updateLine(newContact.lineKey, { vendorId: result.data.id, customerId: null });
    } else {
      setCustomers((prev) => [...prev, result.data]);
      updateLine(newContact.lineKey, { customerId: result.data.id, vendorId: null });
    }
    setNewContact(null);
  }

  /** Picking an account on a still-blank line (no amount typed on either side yet) queues a focus
   * jump to whichever side matches that account's normal balance — a Debit-normal account (an
   * Expense, most Assets) usually gets debited, a Credit-normal one (Revenue, most Liabilities)
   * usually gets credited. Just a cursor placement hint, never changes any actual value — the
   * reviewer can still type in the other box instead. Also pre-fills the tax code this account has
   * most often been posted with historically, but only when the line doesn't already have one —
   * never overwrites a choice the reviewer already made. */
  function updateLineAccount(line: LineRow, accountId: number | null) {
    const account = accounts.find((a) => a.id === accountId);

    // Switching a line to Accounts Payable while a customer's name sits on it would leave the name
    // in place and invisible — the picker no longer offers it, so nothing on screen says it is
    // there. Clear it instead.
    const scope = nameScopeForAccount(account);
    const keepsName = nameStillValid(scope, line.vendorId, line.customerId);
    updateLine(line.key, keepsName ? { accountId } : { accountId, vendorId: null, customerId: null });

    if (accountId === null) return;
    if (account && line.debitCents === 0 && line.creditCents === 0) {
      focusAmountRef.current = { key: line.key, side: account.normalBalance === 'Debit' ? 'debit' : 'credit' };
    }
    if (line.taxCode === null) {
      window.api.journal.suggestTaxCodeForAccount(accountId).then((r) => {
        // What this account has historically been posted with wins; failing that, the code for the
        // company's own province. Without the fallback a new file showed "—" on every line and the
        // tax had to be picked by hand every single time.
        const suggested = (r.ok && r.data) || defaultTaxCode;
        if (suggested) updateLine(line.key, { taxCode: suggested });
      });
    }
  }

  /** Inserts a copy of a line right after it — same account/description/tax, zeroed amounts (a
   * duplicate with the same debit and credit would already be unbalanced by definition) — for the
   * common case of several lines that share everything but the dollar figure. */
  function duplicateRow(key: string) {
    setLines((prev) => {
      const index = prev.findIndex((l) => l.key === key);
      if (index === -1) return prev;
      const source = prev[index];
      const copy: LineRow = { ...source, key: `row-${(rowKeyCounter += 1)}`, lineId: null, debitCents: 0, creditCents: 0 };
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });
    markDirty();
  }

  /** Drag-to-resize for the Account/Description column headers — only ever changes column width,
   * nothing else about the row/line data. */
  function startColumnResize(column: keyof typeof DEFAULT_COLUMN_WIDTHS, e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = columnWidths[column];
    function onMove(moveEvent: MouseEvent) {
      const next = Math.max(120, Math.round(startWidth + (moveEvent.clientX - startX)));
      setColumnWidths((prev) => ({ ...prev, [column]: next }));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setColumnWidths((prev) => {
        localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(prev));
        return prev;
      });
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  async function clearAllLines() {
    if (!(await confirmDialog('Clear every line on this entry?'))) return;
    setLines([newRow(), newRow()]);
    markDirty();
  }

  /** Only offers a repeat suggestion for a genuinely fresh entry — an existing entry being edited,
   * or a new one the reviewer has already started filling in, shouldn't get its lines silently
   * second-guessed. */
  async function checkForRepeatTransaction(candidateMemo: string) {
    if (currentId !== 'new' || !candidateMemo.trim() || candidateMemo === dismissedRepeatMemo) {
      setRepeatMatch(null);
      return;
    }
    if (lines.some((l) => l.accountId !== null)) {
      setRepeatMatch(null);
      return;
    }
    const result = await window.api.journal.findRecentByMemo({ memo: candidateMemo });
    setRepeatMatch(result.ok ? result.data : null);
  }

  function applyRepeatMatch() {
    if (!repeatMatch) return;
    setLines(
      repeatMatch.lines.map((l) => ({
        key: `row-${(rowKeyCounter += 1)}`,
        lineId: null,
        accountId: l.accountId,
        debitCents: l.debitCents,
        creditCents: l.creditCents,
        description: l.description ?? '',
        taxCode: l.taxCode,
        manualHstCents: l.manualHstCents ?? 0,
        vendorId: null,
        customerId: null,
      })),
    );
    setRepeatMatch(null);
    markDirty();
  }

  /** Copy a block from Excel (Account, Description, Debit, Credit columns) and paste it in as
   * new lines in one shot, instead of typing each one by hand. Account names are matched against
   * the Chart of Accounts automatically; anything that can't be matched unambiguously is left for
   * manual selection rather than guessed, since a wrong guess here posts a real ledger line. */
  async function handlePasteFromExcel() {
    setPasteBusy(true);
    setPasteSummary(null);
    setError(null);
    const result = await window.api.clipboard.readText();
    setPasteBusy(false);
    if (!result.ok) return setError(result.error);

    const parsed = parsePastedJournalLines(result.data, accounts);
    if (parsed.lines.length === 0) {
      setPasteSummary('Nothing to paste — copy some rows from Excel first (Account, Description, Debit, Credit columns), then try again.');
      return;
    }

    const pastedRows: LineRow[] = parsed.lines.map((l) => ({
      ...newRow(),
      accountId: l.accountId,
      description: l.description,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
    }));
    setLines((prev) => {
      const isBlank = (l: LineRow) => l.accountId === null && l.debitCents === 0 && l.creditCents === 0 && !l.description;
      return [...prev.filter((l) => !isBlank(l)), ...pastedRows];
    });
    markDirty();
    setPasteSummary(
      `Pasted ${parsed.lines.length} line${parsed.lines.length === 1 ? '' : 's'} — ${parsed.matchedCount} matched automatically` +
        (parsed.unmatchedCount > 0 ? `, ${parsed.unmatchedCount} need${parsed.unmatchedCount === 1 ? 's' : ''} manual account selection.` : '.'),
    );
  }

  function buildPayload() {
    return {
      entryDate,
      // Capitalized here rather than relying solely on each field's onBlur — clicking Save right
      // after typing the last field fires blur and click in the same event batch, so this
      // component's own state wouldn't reflect the blur's capitalization yet by the time this
      // closure reads it (same stale-closure fix applied to the other forms this session).
      memo: memo ? capitalizeWords(memo) : null,
      reference: reference || null,
      isAdjustingEntry,
      lines: lines
        .filter((l) => l.accountId !== null && (l.debitCents > 0 || l.creditCents > 0))
        .map((l) => ({
          accountId: l.accountId as number,
          debitCents: l.debitCents,
          creditCents: l.creditCents,
          description: l.description ? capitalizeWords(l.description) : null,
          taxCode: l.taxCode,
          manualHstCents: l.taxCode === 'Manual' ? l.manualHstCents : null,
          vendorId: l.vendorId,
          customerId: l.customerId,
        })),
    };
  }

  async function persist(): Promise<number | null> {
    setError(null);
    const payload = buildPayload();
    if (currentId === 'new') {
      const result = await window.api.journal.create(payload);
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      setCurrentId(result.data.id);
      setView({ kind: 'journalForm', id: result.data.id });
      return result.data.id;
    }
    const result = await window.api.journal.update({ id: currentId, patch: payload });
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    return currentId;
  }

  async function handleSaveDraft() {
    setBusy(true);
    const savedId = await persist();
    setBusy(false);
    if (savedId !== null) markClean();
  }

  const [approval, setApproval] = useState<{ status: string; by: string | null; note: string | null } | null>(null);
  useEffect(() => {
    if (typeof currentId !== 'number') return setApproval(null);
    window.api.journal.get(currentId).then((r) => {
      if (r.ok) setApproval({ status: r.data.approvalStatus ?? 'notRequired', by: r.data.approvedBy ?? null, note: r.data.approvalNote ?? null });
    });
  }, [currentId, status]);

  async function handlePost() {
    setBusy(true);
    const savedId = await persist();
    if (savedId !== null) {
      const result = await window.api.journal.post(savedId);
      if (!result.ok) setError(result.error);
      else {
        setStatus('posted');
        markClean();
      }
    }
    setBusy(false);
  }

  /** Posts this entry, then immediately resets the form to a blank new entry instead of leaving
   * the reviewer sitting on the one just posted — for typing several entries back to back, same
   * as QuickBooks' "Save and new". Not a real navigation (this component isn't remounted just by
   * the route changing id), so every field is reset by hand. */
  async function handlePostAndNew() {
    setBusy(true);
    const savedId = await persist();
    if (savedId === null) {
      setBusy(false);
      return;
    }
    const result = await window.api.journal.post(savedId);
    setBusy(false);
    if (!result.ok) return setError(result.error);

    setCurrentId('new');
    setStatus('draft');
    setEntryDate(localIsoDate());
    setMemo('');
    setReference('');
    setIsAdjustingEntry(false);
    setLines([newRow(), newRow()]);
    setError(null);
    setPasteSummary(null);
    markClean();
    setView({ kind: 'journalForm', id: 'new' });
  }

  async function handleVoid() {
    if (currentId === 'new') return;
    if (!window.confirm(`Void this ${entryDate} journal entry${memo ? ` (“${memo}”)` : ''}? It will be removed from balances and reports but retained in the audit trail.`)) return;
    // Double-verification when voiding an entry inside a locked (e.g. HST-filed) period.
    const lock = await confirmLockedOverride(entryDate, 'void', lines.flatMap((line) => (line.accountId === null ? [] : [{ accountId: line.accountId }])));
    if (!lock.proceed) return;
    setBusy(true);
    const result = await window.api.journal.void(currentId, lock.override);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setStatus('void');
    markClean();
  }

  async function handleDelete() {
    if (currentId === 'new') return;
    if (!window.confirm(`Delete this ${entryDate} draft journal entry${memo ? ` (“${memo}”)` : ''}? This cannot be undone.`)) return;
    setBusy(true);
    const result = await window.api.journal.delete(currentId);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    markClean();
    setView({ kind: 'journalList' });
  }

  // Deliberately not capped at max-w-5xl any more. The line table has nine columns and needs every
  // pixel the window offers; capping the page at 1024px left the window half empty while the table
  // scrolled sideways inside it.
  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <RecordNavigator
          ids={allEntryIds}
          currentId={currentId}
          label="entry"
          disabled={busy}
          onGo={(next) => setView({ kind: 'journalForm', id: next })}
        />
        <button
          type="button"
          onClick={() => setView({ kind: 'journalList' })}
          aria-label="Close"
          title="Close (back to Journal Entries)"
          className="order-last ml-auto rounded-full px-2 text-xl leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          ×
        </button>
        <button
          type="button"
          onClick={() => setView({ kind: 'journalForm', id: 'new' })}
          className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
        >
          New entry
        </button>
      </div>

      {error && <ErrorNotice message={error} className="mb-3" />}
      {approval && approval.status !== 'notRequired' && (
        <div data-testid="approval-banner" className={`mb-3 rounded px-3 py-2 text-sm ${approval.status === 'approved' ? 'bg-emerald-50 text-emerald-800' : approval.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
          <span className="font-semibold">{APPROVAL_STATUS_LABELS[approval.status as keyof typeof APPROVAL_STATUS_LABELS]}.</span>{' '}
          {approval.status === 'pending' && 'This entry is above the approval threshold; it will post once an administrator or accountant approves it in Approvals.'}
          {approval.status === 'approved' && `Approved by ${approval.by ?? 'an approver'}.`}
          {approval.status === 'rejected' && `Rejected: ${approval.note ?? 'no note'}. Correct the entry and save to resubmit.`}
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <BackButton fallback={{ kind: 'journalList' }} fallbackLabel="Journal Entries" />
        {receiptFilePath && (
          <button
            type="button"
            onClick={() => window.api.receiptInbox.openFile(receiptFilePath)}
            className="ml-auto rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            View Receipt
          </button>
        )}
        {enteredAt && <span className={`${receiptFilePath ? '' : 'ml-auto'} text-xs text-gray-500`} title="When this entry was keyed in (your local time)">Entered {formatEnteredAt(enteredAt)}</span>}
        <span
          className={`${receiptFilePath || enteredAt ? '' : 'ml-auto'} rounded px-2 py-0.5 text-xs ${
            status === 'posted' ? 'bg-green-100 text-green-800 ring-1 ring-green-200' : status === 'void' ? 'bg-gray-200 text-gray-600' : 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
          }`}
        >
          {status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded border border-gray-200 bg-white p-3">
        <label className="block text-sm">
          <span className="text-gray-600">Date</span>
          {editable ? (
            <input
              type="date" min={DATE_MIN} max={DATE_MAX}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={entryDate}
              onChange={(e) => {
                setEntryDate(clampIsoDate(e.target.value));
                markDirty();
              }}
            />
          ) : (
            <div className="mt-1.5">
              {/* Correcting the date on a posted entry doesn't affect whether it balances, so it's
                  allowed directly here — same journal:updateDate mechanism already used by the
                  Journal Entries list, now also reachable from the entry itself. */}
              <EditableDateCell
                entryId={currentId as number}
                value={entryDate}
                onSaved={() => window.api.journal.get(currentId as number).then((r) => r.ok && setEntryDate(r.data.entryDate))}
              />
            </div>
          )}
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Reference</span>
          <input
            name="journal-reference"
            autoComplete="on"
            disabled={!editable}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 disabled:bg-gray-100"
            value={reference}
            onChange={(e) => {
              setReference(e.target.value);
              if (editable) markDirty();
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Memo</span>
          <input
            name="journal-memo"
            autoComplete="on"
            list={suggestionListId('transaction-memo')}
            disabled={!editable}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 disabled:bg-gray-100"
            value={memo}
            onChange={(e) => {
              setMemo(e.target.value);
              if (editable) markDirty();
            }}
            onBlur={(e) => {
              const capitalized = capitalizeWords(e.target.value);
              if (capitalized !== e.target.value) setMemo(capitalized);
              recordSuggestion('transaction-memo', capitalized);
              checkForRepeatTransaction(capitalized);
            }}
          />
          <SuggestionDatalist fieldKey="transaction-memo" />
          {repeatMatch && (
            <div className="mt-2 flex items-start justify-between gap-2 rounded border border-brand-200 bg-brand-50 px-2.5 py-2 text-xs">
              <span className="text-brand-800">
                Looks like a repeat of <span className="font-medium">{repeatMatch.entryDate}</span> ({repeatMatch.lines.length} line
                {repeatMatch.lines.length === 1 ? '' : 's'}).
              </span>
              <span className="flex flex-shrink-0 gap-2">
                <button type="button" onClick={applyRepeatMatch} className="font-medium text-brand-700 hover:underline">
                  Copy Lines
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDismissedRepeatMemo(memo);
                    setRepeatMatch(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  Dismiss
                </button>
              </span>
            </div>
          )}
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            disabled={!editable}
            checked={isAdjustingEntry}
            onChange={(e) => {
              setIsAdjustingEntry(e.target.checked);
              if (editable) markDirty();
            }}
          />
          <span className="text-gray-600">Is Adjusting Journal Entry?</span>
        </label>
      </div>

      {editable && (
        <div className="mt-3 rounded border border-brand-200 bg-brand-50/50">
          <button
            type="button"
            onClick={() => setGuidedOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left"
          >
            <span className="text-sm font-medium text-brand-800">
              Add a line the simple way — money in or out, without picking debit or credit
            </span>
            <span className="text-brand-700">{guidedOpen ? '▴' : '▾'}</span>
          </button>

          {guidedOpen && (
            <div className="border-t border-brand-200 px-3 py-2">
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="block text-gray-600">This is</span>
                  <select
                    className="mt-1 w-40 rounded border border-gray-300 px-2 py-1.5"
                    value={guidedDirection}
                    onChange={(e) => setGuidedDirection(e.target.value as 'out' | 'in')}
                  >
                    <option value="out">Money going out</option>
                    <option value="in">Money coming in</option>
                  </select>
                </label>

                <label className="text-sm">
                  <span className="block text-gray-600">{guidedDirection === 'out' ? 'Paid from' : 'Received into'}</span>
                  <div className="mt-1 w-56">
                    <Combobox
                      options={accounts
                        .filter((a) => a.accountType === 'Asset' || a.accountType === 'Liability')
                        .map((a) => ({ value: String(a.id), label: a.name, sublabel: a.accountSubtype ?? a.accountType }))}
                      value={guidedMoneyAccountId !== null ? String(guidedMoneyAccountId) : null}
                      onChange={(v) => setGuidedMoneyAccountId(v ? Number(v) : null)}
                      placeholder="Bank, cash, or card…"
                    />
                  </div>
                </label>

                <label className="text-sm">
                  <span className="block text-gray-600">{guidedDirection === 'out' ? 'What for' : 'What from'}</span>
                  <div className="mt-1 w-56">
                    <Combobox
                      options={accounts
                        .filter((a) => a.accountType === (guidedDirection === 'out' ? 'Expense' : 'Revenue'))
                        .map((a) => ({ value: String(a.id), label: a.name, sublabel: a.accountSubtype ?? a.accountType }))}
                      value={guidedCategoryAccountId !== null ? String(guidedCategoryAccountId) : null}
                      onChange={(v) => setGuidedCategoryAccountId(v ? Number(v) : null)}
                      placeholder={guidedDirection === 'out' ? 'Expense category…' : 'Income category…'}
                    />
                  </div>
                </label>

                <label className="text-sm">
                  <span className="block text-gray-600">Amount</span>
                  <div className="mt-1 w-32">
                    <CurrencyInput valueCents={guidedCents} onChange={setGuidedCents} />
                  </div>
                </label>

                <label className="text-sm">
                  <span className="block text-gray-600">Description</span>
                  <input
                    className="mt-1 w-44 rounded border border-gray-300 px-2 py-1.5"
                    value={guidedDescription}
                    onChange={(e) => setGuidedDescription(e.target.value)}
                    placeholder="Optional"
                  />
                </label>

                <button
                  type="button"
                  disabled={guidedMoneyAccountId === null || guidedCategoryAccountId === null || guidedCents <= 0}
                  onClick={addGuidedLines}
                  className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Add to entry
                </button>
              </div>

              {/* Says exactly which two lines are about to appear, so the panel teaches the rule
                  rather than hiding it — the grid below still shows the real double entry. */}
              {guidedMoneyAccountId !== null && guidedCategoryAccountId !== null && guidedCents > 0 && (
                <p className="mt-2 text-xs text-gray-600">
                  Adds a <span className="font-medium">debit</span> to{' '}
                  {accounts.find((a) => a.id === (guidedDirection === 'out' ? guidedCategoryAccountId : guidedMoneyAccountId))?.name}{' '}
                  and a <span className="font-medium">credit</span> to{' '}
                  {accounts.find((a) => a.id === (guidedDirection === 'out' ? guidedMoneyAccountId : guidedCategoryAccountId))?.name}, both{' '}
                  <Money cents={guidedCents} />.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {editable && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={pasteBusy}
            onClick={handlePasteFromExcel}
            className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            {pasteBusy ? 'Pasting…' : 'Paste from Excel'}
          </button>
          <button
            type="button"
            onClick={clearAllLines}
            className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Clear All Lines
          </button>
          <span className="text-xs text-gray-400">Copy Account, Description, Debit, Credit columns in Excel, then click this.</span>
        </div>
      )}
      {pasteSummary && <p className="mt-2 rounded bg-brand-50 px-3 py-2 text-xs text-brand-700">{pasteSummary}</p>}

      <SuggestionDatalist fieldKey="line-item-description" />
      <div className="mt-3 overflow-x-auto rounded border border-gray-200 bg-white">
        {/* min-width, not just w-full: with nine columns, w-full alone pinned the table to the
            container and squeezed every cell instead of letting the wrapper's overflow-x-auto
            scroll. That is what left the Tax dropdown a stub and clipped amounts to "500.0". */}
        <table className="w-full min-w-[1180px] border-collapse text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Date</th>
              <th className="relative border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600" style={{ width: columnWidths.account, minWidth: columnWidths.account }}>
                Account
                <div
                  onMouseDown={(e) => startColumnResize('account', e)}
                  className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize select-none hover:bg-brand-300 active:bg-brand-400"
                  title="Drag to resize"
                />
              </th>
              <th
                className="relative border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600"
                style={{ width: columnWidths.description, minWidth: columnWidths.description }}
              >
                Description
                <div
                  onMouseDown={(e) => startColumnResize('description', e)}
                  className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize select-none hover:bg-brand-300 active:bg-brand-400"
                  title="Drag to resize"
                />
              </th>
              <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Debit</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Credit</th>
              <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Tax</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600" title="HST implied by the tax code on a line. Blank when the entry carries its own GST/HST line (bills, invoices, receipts), where the tax is that line.">HST</th>
              <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Name</th>
              <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Tags</th>
              {editable && <th className="border-b border-gray-200 px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr
                key={line.key}
                className="border-b border-gray-100 last:border-0"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editable && index === lines.length - 1) {
                    e.preventDefault();
                    addRowAndFocus();
                  }
                }}
              >
                <td className="px-3 py-1.5">
                  {/* Every line of one journal entry shares the same date by definition — this
                      cell edits that one shared entryDate, same as the header Date field, just
                      reachable per-row too. Not a per-line date, since a journal entry doesn't
                      have one. */}
                  {editable ? (
                    <input
                      type="date" min={DATE_MIN} max={DATE_MAX}
                      className="w-full rounded border border-gray-300 px-2 py-1"
                      value={entryDate}
                      onChange={(e) => {
                        setEntryDate(clampIsoDate(e.target.value));
                        markDirty();
                      }}
                    />
                  ) : (
                    <EditableDateCell
                      entryId={currentId as number}
                      value={entryDate}
                      onSaved={() => window.api.journal.get(currentId as number).then((r) => r.ok && setEntryDate(r.data.entryDate))}
                    />
                  )}
                </td>
                <td className="px-3 py-1.5" style={{ width: columnWidths.account, minWidth: columnWidths.account }}>
                  <div className="flex items-center gap-1">
                    <div className="flex-1">
                      <Combobox
                        ref={index === lines.length - 1 ? lastRowAccountRef : undefined}
                        options={accountOptions}
                        value={line.accountId !== null ? String(line.accountId) : null}
                        onChange={(v) => updateLineAccount(line, v ? Number(v) : null)}
                        placeholder="Select account…"
                        onAddNew={
                          editable
                            ? () => {
                                setAccountModalLineKey(line.key);
                                setAccountModalEditingAccount(null);
                                setAccountModalParent(null);
                              }
                            : undefined
                        }
                        addNewLabel="+ Add New Account"
                        onAddSub={
                          editable
                            ? (option) => {
                                setAccountModalLineKey(line.key);
                                setAccountModalEditingAccount(null);
                                setAccountModalParent(accounts.find((a) => a.id === Number(option.value)) ?? null);
                              }
                            : undefined
                        }
                      />
                    </div>
                    {editable && line.accountId !== null && (
                      <button
                        type="button"
                        title="Edit this account, or add a sub-account under it (e.g. RBC Visa under Visa)"
                        onClick={() => {
                          setAccountModalLineKey(line.key);
                          setAccountModalEditingAccount(accounts.find((a) => a.id === line.accountId) ?? null);
                          setAccountModalParent(null);
                        }}
                        className="flex-shrink-0 rounded px-1.5 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        ✎
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-3 py-1.5" style={{ width: columnWidths.description, minWidth: columnWidths.description }}>
                  <input
                    name="journal-line-description"
                    autoComplete="on"
                    list={suggestionListId('line-item-description')}
                    disabled={!editable}
                    className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100"
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    onBlur={(e) => {
                      const capitalized = capitalizeWords(e.target.value);
                      updateLine(line.key, { description: capitalized });
                      recordSuggestion('line-item-description', capitalized);
                    }}
                  />
                </td>
                <td className="w-36 min-w-[8rem] px-3 py-1.5">
                  <CurrencyInput
                    ref={(el) => {
                      if (el) debitInputRefs.current.set(line.key, el);
                      else debitInputRefs.current.delete(line.key);
                    }}
                    valueCents={line.debitCents}
                    onChange={(cents) => updateLine(line.key, { debitCents: cents, creditCents: cents > 0 ? 0 : line.creditCents })}
                  />
                </td>
                <td className="w-36 min-w-[8rem] px-3 py-1.5">
                  <CurrencyInput
                    ref={(el) => {
                      if (el) creditInputRefs.current.set(line.key, el);
                      else creditInputRefs.current.delete(line.key);
                    }}
                    valueCents={line.creditCents}
                    onChange={(cents) => updateLine(line.key, { creditCents: cents, debitCents: cents > 0 ? 0 : line.debitCents })}
                  />
                </td>
                <td className="w-64 min-w-[15rem] px-2 py-1.5">
                  <select
                    disabled={status === 'void'}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                    value={line.taxCode ?? ''}
                    onChange={async (e) => {
                      const nextTaxCode = (e.target.value || null) as LineRow['taxCode'];
                      updateLine(line.key, { taxCode: nextTaxCode, manualHstCents: nextTaxCode === 'Manual' ? line.manualHstCents : 0 });
                      // Posted (already-persisted) lines have no other save path, so tax-code
                      // changes here need to write straight through immediately.
                      if (status === 'posted' && line.lineId !== null) {
                        const result = await window.api.journal.setLineTaxCode({ lineId: line.lineId, taxCode: nextTaxCode });
                        if (!result.ok) setError(result.error);
                      }
                    }}
                  >
                    {TAX_CODE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} title={opt.title}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="w-32 min-w-[7rem] px-2 py-1.5 text-right">
                  {line.taxCode !== null && line.taxCode !== 'Manual' && !entryHasSeparateTaxLine() && taxPortionCents(line.taxCode, line.debitCents || line.creditCents) > 0 ? (
                    <span className="text-gray-600">
                      <Money cents={taxPortionCents(line.taxCode as TaxCode | null, line.debitCents || line.creditCents)} />
                    </span>
                  ) : line.taxCode === 'Manual' ? (
                    status === 'posted' && line.lineId !== null ? (
                      <ManualHstLinkCell lineId={line.lineId} initialCents={line.manualHstCents} />
                    ) : (
                      <CurrencyInput valueCents={line.manualHstCents} onChange={(cents) => updateLine(line.key, { manualHstCents: cents })} />
                    )
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td
                  className="px-3 py-1.5"
                  title={nameScopeHint(nameScopeForAccount(accounts.find((a) => a.id === line.accountId))) ?? undefined}
                >
                  <Combobox
                    options={nameOptionsFor(line.accountId)}
                    value={encodeNameValue(line.vendorId, line.customerId)}
                    onChange={(v) => updateLine(line.key, decodeNameValue(v))}
                    placeholder={
                      nameScopeForAccount(accounts.find((a) => a.id === line.accountId)) === 'vendor'
                        ? 'Vendor…'
                        : nameScopeForAccount(accounts.find((a) => a.id === line.accountId)) === 'customer'
                          ? 'Customer…'
                          : 'Type any name…'
                    }
                    onAddNew={(typed) =>
                      setNewContact({
                        lineKey: line.key,
                        name: typed,
                        // Adding a name from an AR line should create a customer, not a vendor.
                        kind: nameScopeForAccount(accounts.find((a) => a.id === line.accountId)) === 'customer' ? 'customer' : 'vendor',
                      })
                    }
                    addNewLabel={(typed) => (typed ? `+ Add "${typed}"` : '+ Add a new name')}
                  />
                </td>
                <td className="w-32 min-w-[8rem] px-3 py-1.5">
                  <LineTagPicker
                    lineId={line.lineId}
                    groups={tagGroups}
                    initialTagIds={line.lineId === null ? [] : (lineTags[line.lineId] ?? [])}
                    disabled={status === 'void'}
                    onError={setError}
                  />
                </td>
                {editable && (
                  <td className="whitespace-nowrap px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => duplicateRow(line.key)}
                      className="mr-1 text-gray-400 hover:text-brand-600"
                      title="Duplicate this line"
                      aria-label="Duplicate line"
                    >
                      ⧉
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLines((prev) => prev.filter((l) => l.key !== line.key));
                        markDirty();
                      }}
                      className="text-gray-400 hover:text-red-600"
                      aria-label="Remove line"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-medium">
              <td className="px-3 py-2" colSpan={3}>
                {editable && (
                  <button
                    type="button"
                    onClick={() => {
                      setLines((prev) => [...prev, newRow()]);
                      markDirty();
                    }}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    + Add line
                  </button>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                <Money cents={totalDebitCents} />
              </td>
              <td className="px-3 py-2 text-right">
                <Money cents={totalCreditCents} />
              </td>
              <td colSpan={4} />
              {editable && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {editable && (
        <p className="mt-2 text-xs text-gray-400">
          Tip: type an account name and press Tab or Enter to pick it — no need to click. Press Enter on the last line to add another.
        </p>
      )}

      {!isBalanced && (
        <p className="mt-2 text-sm text-amber-600">
          {/* Says what is missing rather than only that something is. "Difference: 750.00" is a
              restatement of the problem; "needs a credit line of 750.00" is the instruction. */}
          {totalDebitCents === 0 && totalCreditCents === 0
            ? 'Enter an amount on at least one line.'
            : totalDebitCents === totalCreditCents
              ? 'Enter an amount before posting.'
              : null}
          {totalDebitCents !== totalCreditCents && (
            <>
              This entry needs a{' '}
              <span className="font-semibold">
                {totalDebitCents > totalCreditCents ? 'credit' : 'debit'} line of{' '}
                <Money cents={Math.abs(totalDebitCents - totalCreditCents)} />
              </span>
              . Every debit has to be matched by a credit, so posting stays disabled until the two sides agree.
            </>
          )}
          {editable && totalDebitCents !== totalCreditCents && (totalDebitCents > 0 || totalCreditCents > 0) && (
            <button type="button" onClick={balanceEntry} className="ml-2 rounded bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-amber-700" title="Fill the difference onto an empty line to balance this entry">
              Balance it
            </button>
          )}
        </p>
      )}

      {/* The other half of the double entry, learned from this file's own history. Sits next to the
          out-of-balance warning because that is the moment it is useful, and states the account by
          name so accepting it is a decision rather than a reflex. */}
      {newContact && (
        <Modal open onClose={() => setNewContact(null)} title="Add a name">
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-gray-600">Name</span>
              <input
                autoFocus
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveNewContact();
                }}
              />
            </label>
            <div className="text-sm">
              <span className="text-gray-600">This is a</span>
              <div className="mt-1 flex gap-3">
                {(['vendor', 'customer'] as const).map((kind) => (
                  <label key={kind} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={newContact.kind === kind}
                      onChange={() => setNewContact({ ...newContact, kind })}
                    />
                    <span className="capitalize">{kind}</span>
                  </label>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Anyone can be recorded here — a vendor, a customer, or a one-off payee. It is saved to your contact list so it can
              be picked again next time.
            </p>
            <div className="flex flex-wrap justify-start gap-2">
              <button
                type="button"
                onClick={() => setNewContact(null)}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={newContactBusy || !newContact.name.trim()}
                onClick={() => void saveNewContact()}
                className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {newContactBusy ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {contraSuggestion && editable && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <span>
            Usually posted against{' '}
            <span className="font-medium">
              {(() => {
                const a = accounts.find((x) => x.id === contraSuggestion.accountId);
                return a ? `${a.name}` : 'unknown account';
              })()}
            </span>
            <span className="ml-1 text-xs text-sky-700">
              ({Math.round(contraSuggestion.confidence * 100)}% of the time)
            </span>
          </span>
          <button
            type="button"
            onClick={applyContraSuggestion}
            className="rounded bg-sky-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-sky-700"
            title="Add the balancing line using this account"
          >
            Use it
          </button>
          <button
            type="button"
            onClick={() => setContraSuggestion(null)}
            className="text-xs text-sky-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {draftWarnings.length > 0 && (
        <div className="mt-3 space-y-1.5 rounded border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Accounting check</p>
          {draftWarnings.map((w) => (
            <p key={w.id} className="text-sm text-amber-800">
              {w.message}
            </p>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {editable && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={handleSaveDraft}
              className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              Save Draft
            </button>
            <button
              type="button"
              disabled={busy || !isBalanced}
              onClick={handlePost}
              className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
            >
              Post
            </button>
            <button
              type="button"
              disabled={busy || !isBalanced}
              onClick={handlePostAndNew}
              title="Post this entry, then clear the form to start the next one"
              className="rounded-full border border-brand-300 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
            >
              Post &amp; New
            </button>
            {currentId !== 'new' && (
              <button type="button" disabled={busy} onClick={handleDelete} className="ml-auto rounded-full bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100">
                Delete Draft
              </button>
            )}
          </>
        )}
        {status === 'posted' && (
          <button type="button" disabled={busy} onClick={handleVoid} className="rounded-full bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100">
            Void Entry
          </button>
        )}
      </div>
      {typeof currentId === 'number' && status !== 'draft' && <div className="mt-3"><AttachmentsPanel entityType="journalEntry" entityId={currentId} /><div className="mt-2"><DocumentHistoryPanel entityType="journalEntry" entityId={currentId} /></div></div>}

      <AccountFormModal
        open={accountModalLineKey !== null}
        onClose={() => {
          setAccountModalLineKey(null);
          setAccountModalEditingAccount(null);
          setAccountModalParent(null);
        }}
        account={accountModalEditingAccount}
        initialParent={accountModalParent}
        onAddSubaccount={(parent) => {
          setAccountModalEditingAccount(null);
          setAccountModalParent(parent);
        }}
        onSaved={(savedAccount) => {
          setAccounts((prev) => (prev.some((a) => a.id === savedAccount.id) ? prev.map((a) => (a.id === savedAccount.id ? savedAccount : a)) : [...prev, savedAccount]));
          if (accountModalLineKey) updateLine(accountModalLineKey, { accountId: savedAccount.id });
        }}
      />
    </div>
  );
}
