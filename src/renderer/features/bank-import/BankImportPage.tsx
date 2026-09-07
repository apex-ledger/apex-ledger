import { useEffect, useMemo, useState } from 'react';
import type { Account, Bill, CategoryRule, Contact, Invoice, TaxCode } from '@shared/domain/types';
import { suggestCategory } from '@shared/domain/categorization/matchCategory';
import { deriveRulePattern } from '@shared/domain/categorization/deriveRulePattern';
import { hstPortionCents, usTaxPortionCents } from '@shared/domain/ledger/hstSummary';
import { categoryLineAmountCents, computeTaxSplit } from '@shared/domain/ledger/computeTaxSplit';
import { Combobox } from '../../components/Combobox';
import { CurrencyInput } from '../../components/CurrencyInput';
import { Money, formatCents } from '../../components/Money';
import { AccountQuickTabs } from '../../components/AccountQuickTabs';
import { accountPickerOptions } from '../../utils/accountLabel';
import { suggestOnBlur } from '../../utils/textCase';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { suggestionListId } from '../../utils/textSuggestions';
import { ColumnMappingModal } from './ColumnMappingModal';
import { CategoryRulesModal } from './CategoryRulesModal';
import { AccountFormModal } from '../chart-of-accounts/AccountFormModal';
import { parseWithMapping, splitIntoTable, type ColumnRole, type DateFormat, type ParsedTransaction, type RawTable, type SkippedRow } from './parseTransactions';
import { isOfxContent, ofxAccountHint, parseOfx } from './parseOfx';
import { useBankImportSessionStore, type ImportRow, type StatementType } from './bankImportSessionStore';
import { useUiStore } from '../../app/store/uiStore';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { taxCodeOptions } from '@shared/domain/ledger/taxCodes';
import { useCompanyTaxDefault } from '../../hooks/useCompanyTaxDefault';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { suggestDocumentMatch } from '@shared/domain/banking/suggestDocumentMatch';

const LAST_ACCOUNT_STORAGE_KEY = 'bankImport.lastAccountId';

/** A bank/credit-card account's own subtype tells us which statement convention it uses, so
 * picking the account also "maps" the statement type for it — no separate toggle to remember,
 * the same way QuickBooks ties a bank feed to a fixed account type. */
function statementTypeForAccount(account: Account | undefined): StatementType | null {
  if (!account) return null;
  if (account.accountSubtype === 'Credit Card') return 'creditCard';
  if (account.accountSubtype === 'Cash and Bank') return 'bank';
  return null;
}


/** Splits a bank line's known total (the real amount that hit the account) into a pre-tax base
 * and a tax amount — the embedded-tax math (13/113, 8/108) that used to be this app's only tax
 * treatment, now used just to back the base out of a known total rather than to post tax
 * embedded in the category. See computeTaxSplit.ts for how the resulting tax amount is then split
 * into claimable vs. non-claimable and posted to its own GST/HST line. */
function splitBankLineTax(taxCode: TaxCode | null, totalCents: number, manualHstCents: number): { baseCents: number; taxCents: number } {
  if (taxCode === 'Manual') return { baseCents: totalCents - manualHstCents, taxCents: manualHstCents };
  if (taxCode === 'HST' || taxCode === 'MealsHST') {
    const tax = hstPortionCents(totalCents);
    return { baseCents: totalCents - tax, taxCents: tax };
  }
  if (taxCode === 'USTax') {
    const tax = usTaxPortionCents(totalCents);
    return { baseCents: totalCents - tax, taxCents: tax };
  }
  return { baseCents: totalCents, taxCents: 0 };
}

/** Bank statements show money-out as negative. Credit card statements are typically the
 * opposite: a purchase/charge (an expense) posts as a POSITIVE number, and a payment or credit
 * posts as negative. This resolves the row's real direction from the raw parsed sign plus which
 * kind of statement it came from — the double-entry mechanics (which side gets debited/credited)
 * don't change, only which direction "this row" means. */
function isExpenseRow(row: ParsedTransaction, statementType: StatementType): boolean {
  return statementType === 'creditCard' ? row.amountCents > 0 : row.amountCents < 0;
}

/** Whether categorizing a row against this account means "this is a transfer", not a real
 * expense/income category — true for the two subtypes Bank Import always offers as transfer
 * targets (Cash and Bank, Credit Card) plus any other account manually flagged
 * isTransferEligible on the Chart of Accounts (see categoryOptionsFor). Shared by every place
 * that needs to tell a transfer-categorized row apart from a normal one, so the posting logic and
 * the category-list filter can never disagree about which accounts count. */
function isTransferTargetAccount(account: Account | undefined): boolean {
  return account?.accountSubtype === 'Cash and Bank' || account?.accountSubtype === 'Credit Card' || !!account?.isTransferEligible;
}

/** A deterministic tag for "this specific credit card payment", written onto the transfer entry
 * when it's posted and looked up again before posting the same payment's other side. The two
 * accounts are sorted before joining rather than kept in money-account/category-account order —
 * importing the bank statement first sees (bank, card) while importing the card's own statement
 * second sees (card, bank), and without sorting those produce two different strings for the exact
 * same real-world payment, so the lookup would never actually find the first side's entry. */
function cardPaymentReference(dateIso: string, amountCents: number, accountIdA: number, accountIdB: number): string {
  const [idLo, idHi] = [accountIdA, accountIdB].sort((a, b) => a - b);
  return `CC-PMT-${dateIso.replaceAll('-', '')}-${amountCents}-${idLo}-${idHi}`;
}

/** One line of the "couldn't be parsed" list — pre-fills whatever the parser DID manage to read
 * (a date, a description, an amount) and leaves the rest for the reviewer to fill in, so finishing
 * a skipped row is a few clicks rather than a whole separate manual journal entry. "Money out" is
 * the more common case for a statement's parse failures (the ones directly asked about in the
 * screenshot this feature was built from were all Cheques/debits), so it's the default direction
 * rather than forcing a choice every time. */
function SkippedRowFixer({
  skippedRow,
  onAdd,
}: {
  skippedRow: SkippedRow;
  onAdd: (dateIso: string, description: string, amountCents: number) => void;
}) {
  const [date, setDate] = useState(skippedRow.dateGuess ?? '');
  const [description, setDescription] = useState(skippedRow.descriptionGuess);
  const [amountCents, setAmountCents] = useState(skippedRow.amountGuessCents ?? 0);
  const [direction, setDirection] = useState<'out' | 'in'>('out');

  const canAdd = !!date && amountCents > 0;

  return (
    <div className="flex flex-wrap items-end gap-2 py-2">
      <div className="basis-full truncate text-xs text-amber-700" title={skippedRow.raw}>
        {skippedRow.raw || '(blank row)'}
      </div>
      <label className="block text-sm">
        <span className="text-xs text-gray-600">Date</span>
        <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-0.5 rounded border border-gray-300 px-2 py-1 text-sm" value={date} onChange={(e) => setDate(clampIsoDate(e.target.value))} />
      </label>
      <label className="block min-w-[10rem] flex-1 text-sm">
        <span className="text-xs text-gray-600">Description</span>
        <input
          list={suggestionListId('line-item-description')}
          className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={suggestOnBlur('line-item-description', setDescription)}
        />
      </label>
      <label className="block text-sm">
        <span className="text-xs text-gray-600">Amount</span>
        <div className="mt-0.5 w-28">
          <CurrencyInput valueCents={amountCents} onChange={setAmountCents} />
        </div>
      </label>
      <label className="block text-sm">
        <span className="text-xs text-gray-600">Direction</span>
        <select
          className="mt-0.5 rounded border border-gray-300 px-2 py-1 text-sm"
          value={direction}
          onChange={(e) => setDirection(e.target.value as 'out' | 'in')}
        >
          <option value="out">Money out</option>
          <option value="in">Money in</option>
        </select>
      </label>
      <button
        type="button"
        disabled={!canAdd}
        onClick={() => onAdd(date, description.trim() || '(no description)', direction === 'out' ? -Math.abs(amountCents) : Math.abs(amountCents))}
        className="rounded-full bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        Add
      </button>
    </div>
  );
}

export function BankImportPage() {
  // Tax codes ordered with the company's own province first — see useCompanyTaxDefault.
  const { province: taxProvince } = useCompanyTaxDefault();
  const TAX_CODE_OPTIONS = taxCodeOptions('all', taxProvince, { includeBlank: true });
  const setView = useUiStore((s) => s.setView);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  // When on, the table hides every row that's already categorized/matched, leaving only the rows
  // that still need a category — so you jump straight to them instead of scrolling the whole sheet.
  const [showNeedsCategoryOnly, setShowNeedsCategoryOnly] = useState(false);
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);
  const [openBills, setOpenBills] = useState<Bill[]>([]);
  // Set to the row currently asking for a brand-new Chart of Accounts category — opens
  // AccountFormModal right on top of this page instead of navigating to Chart of Accounts, which
  // used to unmount this whole in-progress import (parsed rows, categorization, everything) and
  // force starting the import over from scratch.
  const [addAccountRowKey, setAddAccountRowKey] = useState<string | null>(null);
  /** The category the new account should be nested under, when the request came from "+ sub" on a
   * specific row of the dropdown rather than the plain add button. */
  const [addAccountParent, setAddAccountParent] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [newRulePattern, setNewRulePattern] = useState<string | undefined>(undefined);
  const [savingProgress, setSavingProgress] = useState(false);
  const [saveProgressMessage, setSaveProgressMessage] = useState<string | null>(null);

  // Everything below lives in a Zustand store, not local useState — this is the actual
  // in-progress review (parsed rows, categorization, duplicate flags, the loaded table). Keeping
  // it in a store means it survives this page unmounting when the reviewer switches to another
  // page (most commonly: leaving to add a missing category in Chart of Accounts) — it used to be
  // silently wiped out, forcing the whole import to be redone. See bankImportSessionStore.ts.
  const statementType = useBankImportSessionStore((s) => s.statementType);
  const setStatementType = useBankImportSessionStore((s) => s.setStatementType);
  const moneyAccountId = useBankImportSessionStore((s) => s.moneyAccountId);
  const setMoneyAccountId = useBankImportSessionStore((s) => s.setMoneyAccountId);
  const rawText = useBankImportSessionStore((s) => s.rawText);
  const setRawText = useBankImportSessionStore((s) => s.setRawText);
  const rows = useBankImportSessionStore((s) => s.rows);
  const setRows = useBankImportSessionStore((s) => s.setRows);
  const skippedRows = useBankImportSessionStore((s) => s.skippedRows);
  const setSkippedRows = useBankImportSessionStore((s) => s.setSkippedRows);
  const table = useBankImportSessionStore((s) => s.table);
  const setTable = useBankImportSessionStore((s) => s.setTable);
  const rowDuplicateCounts = useBankImportSessionStore((s) => s.rowDuplicateCounts);
  const setRowDuplicateCounts = useBankImportSessionStore((s) => s.setRowDuplicateCounts);
  const previouslyExcludedKeys = useBankImportSessionStore((s) => s.previouslyExcludedKeys);
  const setPreviouslyExcludedKeys = useBankImportSessionStore((s) => s.setPreviouslyExcludedKeys);
  // Keyed by row.key — set when a row currently categorized as a transfer to/from a credit card
  // exactly matches the reference tag of an already-posted payment (see cardPaymentReference).
  // Unlike rowDuplicateCounts' fuzzy account+amount+date guess, this is a certain match, so it
  // gets its own distinct, more assertive badge rather than folding into the same "possible
  // duplicate" wording.
  const cardPaymentMatches = useBankImportSessionStore((s) => s.cardPaymentMatches);
  const setCardPaymentMatches = useBankImportSessionStore((s) => s.setCardPaymentMatches);
  // Spreadsheet-style row selection for bulk delete — an entire mis-imported statement's worth of
  // rows can be selected in one shift-click range and removed together, or a single row deleted on
  // its own via the row's own × button, without needing to touch "Include" (which just excludes a
  // row from posting, not from the sheet).
  const selectedKeys = useBankImportSessionStore((s) => s.selectedKeys);
  const setSelectedKeys = useBankImportSessionStore((s) => s.setSelectedKeys);
  const lastClickedKey = useBankImportSessionStore((s) => s.lastClickedKey);
  const setLastClickedKey = useBankImportSessionStore((s) => s.setLastClickedKey);
  const dateSortDir = useBankImportSessionStore((s) => s.dateSortDir);
  const setDateSortDir = useBankImportSessionStore((s) => s.setDateSortDir);

  // Ties this review session into the same app-wide "Unsaved Changes" guard every other entry
  // form uses — the in-memory Zustand store above already survives switching pages, but not the
  // app actually closing (including to install an update), which previously discarded any
  // categorization work that hadn't been imported yet with no warning at all. markDirty() below
  // fires on every row edit; the registered handler persists progress to the database instead of
  // finishing the import, so "Save & Leave"/"Save & Exit" here means "keep my place," not "post
  // these transactions."
  const { markDirty, markClean } = useUnsavedGuard('bank import', handleSaveProgress);
  // Statement's own printed Opening/Closing balance, when a loaded PDF has one (auto-filled) —
  // both stay editable so the reviewer can correct or fill them in by hand (a CSV load, or a PDF
  // whose wording wasn't recognized, leaves them blank). Purely a reconciliation check before
  // posting: opening + net of the rows actually being imported should equal closing.
  const openingBalanceCents = useBankImportSessionStore((s) => s.openingBalanceCents);
  const setOpeningBalanceCents = useBankImportSessionStore((s) => s.setOpeningBalanceCents);
  const closingBalanceCents = useBankImportSessionStore((s) => s.closingBalanceCents);
  const setClosingBalanceCents = useBankImportSessionStore((s) => s.setClosingBalanceCents);

  useEffect(() => {
    window.api.accounts.list({ activeOnly: true }).then((r) => {
      if (!r.ok) return;
      setAccounts(r.data);
      // Remember whichever bank/credit-card account was used last time, and infer its statement
      // type from the account itself rather than making the user re-pick both every visit.
      const lastId = Number(localStorage.getItem(LAST_ACCOUNT_STORAGE_KEY));
      const lastAccount = lastId ? r.data.find((a) => a.id === lastId) : undefined;
      const inferredType = statementTypeForAccount(lastAccount);
      if (lastAccount && inferredType) {
        setMoneyAccountId(lastAccount.id);
        setStatementType(inferredType);
      }
    });
    window.api.categoryRules.list().then((r) => r.ok && setRules(r.data));
    window.api.vendors.list().then((r) => r.ok && setVendors(r.data.filter((v) => v.isActive)));
    window.api.customers.list().then((r) => r.ok && setCustomers(r.data.filter((c) => c.isActive)));
    window.api.invoices.list().then((r) => r.ok && setOpenInvoices(r.data.filter((inv) => inv.status === 'unpaid')));
    window.api.bills.list().then((r) => r.ok && setOpenBills(r.data.filter((b) => b.status === 'unpaid')));
  }, []);

  // Combines vendors and customers into one picker for the "Payee" column, same as Journal
  // Entries' "Name" field — tags a row's category line with a party independent of its GL account.
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
  const nameOptions = useMemo(
    () => [
      ...vendors.map((v) => ({ value: `v:${v.id}`, label: v.name, sublabel: 'Vendor' })),
      ...customers.map((c) => ({ value: `c:${c.id}`, label: c.name, sublabel: 'Customer' })),
    ],
    [vendors, customers],
  );
  const customerNameById = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const vendorNameById = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);

  function selectMoneyAccount(accountId: number | null) {
    setMoneyAccountId(accountId);
    if (accountId === null) return;
    localStorage.setItem(LAST_ACCOUNT_STORAGE_KEY, String(accountId));
    const inferredType = statementTypeForAccount(accounts.find((a) => a.id === accountId));
    if (inferredType) setStatementType(inferredType);
    if (rows.length > 0) checkForDuplicates(rows, accountId);
  }

  const moneyAccountOptions = useMemo(
    () => accountPickerOptions(accounts.filter((a) => a.accountType === 'Asset' || a.accountType === 'Liability')),
    [accounts],
  );

  function categoryOptionsFor(isExpense: boolean) {
    const type = isExpense ? 'Expense' : 'Revenue';
    const incomeOrExpense = accounts.filter((a) => a.accountType === type);
    // A statement row can also be a movement between two balance-sheet accounts.  In particular,
    // paying a Visa/Mastercard from chequing is a transfer, not a second expense: debit the card
    // liability and credit the bank account.  Offering the other bank/card accounts here lets the
    // import post that correct two-sided entry in one step.  isTransferEligible extends this same
    // list to any other account manually flagged for it on the Chart of Accounts (a line of
    // credit, PayPal, an intercompany account) that isn't a Cash and Bank/Credit Card subtype.
    const transferAccounts = accounts.filter(
      (a) => a.id !== moneyAccountId && (a.accountSubtype === 'Cash and Bank' || a.accountSubtype === 'Credit Card' || a.isTransferEligible),
    );
    return [...incomeOrExpense, ...transferAccounts].map((a) => ({
      value: String(a.id),
      label: a.name,
      sublabel: transferAccounts.includes(a) ? 'Money transfer between accounts / credit-card payment' : undefined,
    }));
  }

  // Open invoices/bills offered right alongside GL categories in the same picker — matching a
  // deposit to the invoice it settles (or a withdrawal to the bill it pays) properly closes that
  // invoice/bill instead of posting a disconnected generic journal entry that leaves AR/AP still
  // showing the customer/vendor as owing. Encoded as "inv:<id>" / "bill:<id>" so one Combobox can
  // offer categories and matches together; decoded in the row's onChange below.
  function matchOptionsFor(isExpense: boolean) {
    if (isExpense) {
      return openBills.map((b) => ({
        value: `bill:${b.id}`,
        label: `Match: Bill — ${vendorNameById.get(b.vendorId) ?? 'Vendor'} (${formatCents(b.balanceDueCents)})`,
        sublabel: `Due ${b.dueDate}`,
      }));
    }
    return openInvoices.map((inv) => ({
      value: `inv:${inv.id}`,
      label: `Match: Invoice ${inv.invoiceNumber} — ${customerNameById.get(inv.customerId) ?? 'Customer'} (${formatCents(inv.balanceDueCents)})`,
      sublabel: `Due ${inv.dueDate}`,
    }));
  }

  function enrichRows(parsed: ParsedTransaction[]): ImportRow[] {
    const accountsById = new Map(accounts.map((a) => [a.id, a]));
    return parsed.map((row) => {
      // A row promoted from "couldn't be parsed" on a guessed amount/direction has no reliable
      // signal to categorize from yet — auto-suggesting here risks confidently applying a rule to
      // a transaction whose direction (money in/out) isn't actually confirmed.
      if (row.needsVerification) {
        return { ...row, categoryAccountId: null, taxCode: null, manualHstCents: 0, include: false, vendorId: null, customerId: null, matchedInvoiceId: null, matchedBillId: null };
      }
      const suggestion = suggestCategory(row.description, rules);
      const suggestedAccount = suggestion ? accountsById.get(suggestion.accountId) : undefined;
      // A rule's account only applies if its type actually matches the row's direction —
      // otherwise a mismatched rule could silently post an entry backwards, so we drop the
      // suggestion instead of trusting it blindly. A transfer-target account is exempt from this
      // check: a transfer rule (e.g. "Online transfer" -> Savings) is equally valid whichever
      // direction the money moves, so gating it on Expense/Revenue would reject every transfer
      // rule outright — it would simply never apply, no matter what the row looked like.
      const expectedType = isExpenseRow(row, statementType) ? 'Expense' : 'Revenue';
      const categoryMatches = suggestedAccount?.accountType === expectedType || isTransferTargetAccount(suggestedAccount);
      // A rule saved with "Manual" as its tax code (e.g. from before this guard existed) can't be
      // auto-applied safely — the whole point of Manual is a dollar figure that varies per
      // transaction, so blindly reusing it here would silently import this row with $0 HST.
      // Falls back to no tax code suggested at all, same as any other unmatched row.
      const suggestedTaxCode = suggestion?.taxCode === 'Manual' ? null : (suggestion?.taxCode ?? null);
      // An open invoice or bill that this line settles to the cent, in the date window, beats any
      // category rule: matching closes the document and clears the customer's or vendor's
      // balance, where a category entry would leave them still showing as owing.
      const isExpense = isExpenseRow(row, statementType);
      const documentMatch = suggestDocumentMatch(
        { date: row.date, amountCents: row.amountCents, description: row.description, isExpense },
        openInvoices.map((inv) => ({ id: inv.id, date: inv.invoiceDate, balanceDueCents: inv.balanceDueCents, partyName: customerNameById.get(inv.customerId) ?? '' })),
        openBills.map((b) => ({ id: b.id, date: b.billDate, balanceDueCents: b.balanceDueCents, partyName: vendorNameById.get(b.vendorId) ?? '' })),
      );
      if (documentMatch) {
        return {
          ...row,
          categoryAccountId: null,
          taxCode: null,
          manualHstCents: 0,
          include: true,
          vendorId: null,
          customerId: null,
          matchedInvoiceId: documentMatch.kind === 'invoice' ? documentMatch.id : null,
          matchedBillId: documentMatch.kind === 'bill' ? documentMatch.id : null,
          autoMatched: true,
        };
      }
      return {
        ...row,
        categoryAccountId: categoryMatches ? suggestion!.accountId : null,
        taxCode: categoryMatches ? suggestedTaxCode : null,
        manualHstCents: 0,
        include: true,
        vendorId: null,
        customerId: null,
        matchedInvoiceId: null,
        matchedBillId: null,
      };
    });
  }

  function openMapping(text: string) {
    setError(null);
    setResultMessage(null);
    setOpeningBalanceCents(null);
    setClosingBalanceCents(null);
    // An OFX/QFX/QBO download is already tagged field by field, so there is nothing to map: it goes
    // straight to the review table. Bank downloads sign money out as negative; a credit-card
    // download does the same for charges, which this page reads the other way round.
    if (isOfxContent(text)) {
      const parsed = parseOfx(text);
      const rows = statementType === 'creditCard' ? parsed.rows.map((r) => ({ ...r, amountCents: -r.amountCents })) : parsed.rows;
      if (rows.length === 0 && parsed.skippedRows.length === 0) {
        setError('This file looks like an OFX/QFX download but holds no transactions.');
        return;
      }
      finishParse(rows, parsed.skippedRows);
      const hint = ofxAccountHint(text);
      setResultMessage(`${rows.length} transaction${rows.length === 1 ? '' : 's'} read from the bank download${hint ? ` for account ${hint}` : ''}. Check the account above matches, then review below.`);
      return;
    }
    const t = splitIntoTable(text);
    if (t.allRows.length === 0) {
      setError('Paste some transactions first.');
      return;
    }
    setTable(t);
    setShowMappingModal(true);
  }

  function handleParse() {
    openMapping(rawText);
  }

  /** Backs all the way out of an in-progress import (wrong file loaded, statement parsed badly,
   * or just changed your mind) — clears the pasted/loaded text, the parsed rows, and every bit of
   * state derived from them, back to the empty "paste transactions" screen. Doesn't touch the
   * Statement Type / Account selection, since that's independent of which file was loaded. */
  function cancelImport() {
    setRawText('');
    setRows([]);
    setSkippedRows([]);
    setCardPaymentMatches({});
    setTable(null);
    setShowMappingModal(false);
    setError(null);
    setResultMessage(null);
    setOpeningBalanceCents(null);
    setClosingBalanceCents(null);
    setSelectedKeys(new Set());
    setLastClickedKey(null);
    setRowDuplicateCounts({});
    setPreviouslyExcludedKeys({});
    markClean();
  }

  async function handleLoadFile() {
    setError(null);
    const result = await window.api.bankImport.readCsvFile();
    if (!result.ok) return setError(`Could not read the file: ${result.error}`);
    if (!result.data.loaded) return;
    setRawText(result.data.content);
    openMapping(result.data.content);
  }

  async function handleLoadPdfFile() {
    setError(null);
    const result = await window.api.bankImport.readPdfFile();
    if (!result.ok) return setError(`Could not read the file: ${result.error}`);
    if (!result.data.loaded) {
      if (result.data.error) setError(result.data.error);
      return;
    }
    setRawText(result.data.content);
    openMapping(result.data.content);
    // openMapping() clears these unconditionally above — set them after, from whatever the PDF's
    // own text actually said (null if not found, left for the reviewer to fill in by hand).
    setOpeningBalanceCents(result.data.openingBalanceCents ?? null);
    setClosingBalanceCents(result.data.closingBalanceCents ?? null);
    // A partial-success note (e.g. one of several selected PDFs had no text layer) — the rest
    // still loaded fine, so this is informational, not an error blocking the import.
    if (result.data.error) setResultMessage(result.data.error);
  }

  // Checks every parsed row against existing posted entries on the selected account (same
  // amount, within a few days) — most useful when importing statements one after another
  // (January's PDF, then February's) where the last day or two of one statement commonly repeats
  // as the first day or two of the next. Heads-up only, shown as a badge; never excludes a row.
  async function checkForDuplicates(candidateRows: ImportRow[], accountId: number) {
    setRowDuplicateCounts({});
    const results = await Promise.all(
      candidateRows.map(async (r) => {
        const result = await window.api.journal.findPossibleDuplicates({
          entryDate: r.date,
          accountId,
          amountCents: Math.abs(r.amountCents),
        });
        return [r.key, result.ok ? result.data.length : 0] as const;
      }),
    );
    setRowDuplicateCounts(Object.fromEntries(results.filter(([, count]) => count > 0)));
  }

  /** Cross-references every parsed row against this account's saved bank_import_exclusions —
   * anything the reviewer previously told the app to "never show again" gets pre-unchecked and
   * flagged with its own badge, so a recurring known-noise transaction doesn't need re-excluding
   * every time an overlapping statement range gets imported. */
  async function applyStoredExclusions(candidateRows: ImportRow[], accountId: number) {
    setPreviouslyExcludedKeys({});
    const result = await window.api.bankImport.exclusionsList(accountId);
    if (!result.ok || result.data.length === 0) return;
    const matchKey = (date: string, description: string, amountCents: number) => `${date}|${description}|${amountCents}`;
    const exclusionKeys = new Set(result.data.map((e) => matchKey(e.transactionDate, e.description, e.amountCents)));
    const matches = candidateRows.filter((r) => exclusionKeys.has(matchKey(r.date, r.description, r.amountCents)));
    if (matches.length === 0) return;
    const matchedRowKeys = new Set(matches.map((r) => r.key));
    setRows((prev) => prev.map((r) => (matchedRowKeys.has(r.key) ? { ...r, include: false } : r)));
    setPreviouslyExcludedKeys(Object.fromEntries(matches.map((r) => [r.key, true])));
  }

  /** Cross-references every parsed row against this account's saved bank_import_row_progress —
   * restores exactly the category/tax/vendor/customer/include state a previous review session had
   * gotten to, whether that session ended by navigating away (already covered by the in-memory
   * store) or by the app closing entirely (this is the part that covers that). */
  async function applyStoredRowProgress(candidateRows: ImportRow[], accountId: number) {
    const result = await window.api.bankImport.rowProgressList(accountId);
    if (!result.ok || result.data.length === 0) return;
    const matchKey = (date: string, description: string, amountCents: number) => `${date}|${description}|${amountCents}`;
    const progressByKey = new Map(result.data.map((p) => [matchKey(p.transactionDate, p.description, p.amountCents), p]));
    const patchByRowKey = new Map(
      candidateRows
        .map((r) => [r.key, progressByKey.get(matchKey(r.date, r.description, r.amountCents))] as const)
        .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => entry[1] !== undefined),
    );
    if (patchByRowKey.size === 0) return;
    setRows((prev) =>
      prev.map((r) => {
        const saved = patchByRowKey.get(r.key);
        if (!saved) return r;
        return {
          ...r,
          categoryAccountId: saved.categoryAccountId,
          taxCode: saved.taxCode,
          manualHstCents: saved.manualHstCents,
          vendorId: saved.vendorId,
          customerId: saved.customerId,
          include: saved.include,
        };
      }),
    );
  }

  /** Persists every row's current categorization to bank_import_row_progress — the "Save" action
   * behind this page's Unsaved Changes prompt (see the useUnsavedGuard call above). Only rows with
   * something actually worth remembering are sent (an untouched row is indistinguishable from one
   * that was never reviewed, so there's nothing useful to save for it). */
  async function handleSaveProgress(): Promise<boolean> {
    if (moneyAccountId === null) return true;
    const worthSaving = rows.filter(
      (r) => r.categoryAccountId !== null || r.taxCode !== null || r.vendorId !== null || r.customerId !== null || !r.include,
    );
    if (worthSaving.length === 0) return true;
    const result = await window.api.bankImport.rowProgressSave(
      worthSaving.map((r) => ({
        accountId: moneyAccountId,
        transactionDate: r.date,
        description: r.description,
        amountCents: r.amountCents,
        categoryAccountId: r.categoryAccountId,
        taxCode: r.taxCode,
        manualHstCents: r.manualHstCents,
        vendorId: r.vendorId,
        customerId: r.customerId,
        include: r.include,
      })),
    );
    return result.ok;
  }

  /** Visible, always-available "Save Progress" button — the guard's Save & Exit prompt above only
   * appears when you try to leave, which isn't discoverable on its own. This lets the reviewer
   * save deliberately at any point without navigating away or closing the app first. */
  async function handleSaveProgressClick() {
    setSavingProgress(true);
    setSaveProgressMessage(null);
    const succeeded = await handleSaveProgress();
    setSavingProgress(false);
    if (!succeeded) return setSaveProgressMessage('Could not save — try again.');
    markClean();
    setSaveProgressMessage('Progress saved.');
  }

  /** Same save, then leaves the page — the explicit "Save & Exit" a reviewer expects to be able to
   * click directly, rather than relying on the close/navigate guard to catch it for them. */
  async function handleSaveAndExit() {
    setSavingProgress(true);
    setSaveProgressMessage(null);
    const succeeded = await handleSaveProgress();
    setSavingProgress(false);
    if (!succeeded) return setSaveProgressMessage('Could not save — try again.');
    markClean();
    setView({ kind: 'dashboard' });
  }

  /** Explicit "never show again" action for one excluded row — see bankImportExclusionsAdd's own
   * doc comment for why this is a deliberate per-row action rather than automatic on every plain
   * exclude. */
  async function rememberExclusion(row: ImportRow) {
    if (moneyAccountId === null) return;
    const result = await window.api.bankImport.exclusionsAdd({
      accountId: moneyAccountId,
      transactionDate: row.date,
      description: row.description,
      amountCents: row.amountCents,
    });
    if (result.ok) setPreviouslyExcludedKeys((prev) => ({ ...prev, [row.key]: true }));
  }

  /** Checks one row against the exact-reference lookup the moment its category is set to a
   * transfer involving a credit card — that's the only point a would-be payment reference can even
   * be computed (it needs the category account, which nothing auto-suggests for a transfer; see
   * categoryOptionsFor). A hit means the other side of this exact payment is already posted. */
  async function checkCardPaymentMatch(row: ImportRow, categoryAccountId: number | null) {
    if (moneyAccountId === null || categoryAccountId === null) {
      setCardPaymentMatches((prev) => {
        if (!(row.key in prev)) return prev;
        const next = { ...prev };
        delete next[row.key];
        return next;
      });
      return;
    }
    const moneyAccount = accounts.find((a) => a.id === moneyAccountId);
    const categoryAccount = accounts.find((a) => a.id === categoryAccountId);
    const isTransfer = isTransferTargetAccount(categoryAccount);
    const isCardPayment = isTransfer && [moneyAccount, categoryAccount].some((a) => a?.accountSubtype === 'Credit Card');
    if (!isCardPayment) {
      setCardPaymentMatches((prev) => {
        if (!(row.key in prev)) return prev;
        const next = { ...prev };
        delete next[row.key];
        return next;
      });
      return;
    }
    const reference = cardPaymentReference(row.date, Math.abs(row.amountCents), moneyAccountId, categoryAccountId);
    const result = await window.api.journal.findByReference(reference);
    setCardPaymentMatches((prev) => {
      const next = { ...prev };
      if (result.ok && result.data) next[row.key] = { entryId: result.data.entryId, entryDate: result.data.entryDate };
      else delete next[row.key];
      return next;
    });
  }

  function applyMapping(mapRoles: ColumnRole[], hasHeader: boolean, dateFormat: DateFormat) {
    if (!table) return;
    const { rows: parsed, skippedRows: skippedRowDetails } = parseWithMapping(table, mapRoles, hasHeader, dateFormat);

    // A skipped row with both a usable date AND a guessed amount doesn't need the separate
    // manual-entry panel — it goes straight into the review table like any other row, just flagged
    // (needsVerification) and left unchecked, since the guessed figure's direction (money in/out)
    // isn't actually confirmed the way a real Amount/Debit/Credit column reading is.
    const promotable = skippedRowDetails.filter((sr) => sr.dateGuess !== null && sr.amountGuessCents !== null && sr.amountGuessCents > 0);
    const stillUnresolved = skippedRowDetails.filter((sr) => !promotable.includes(sr));
    const promoted: ParsedTransaction[] = promotable.map((sr) => ({
      key: `guess-${sr.sourceIndex}`,
      date: sr.dateGuess as string,
      description: sr.descriptionGuess || '(description not detected — check the statement)',
      // Matches isExpenseRow's own sign convention per statement type — a guessed figure defaults
      // to "money out", the more common failure case, since nothing here actually read a Debit vs
      // Credit column.
      amountCents: statementType === 'creditCard' ? (sr.amountGuessCents as number) : -(sr.amountGuessCents as number),
      needsVerification: true,
    }));

    const allParsed = [...parsed, ...promoted];
    if (allParsed.length === 0) {
      setError('No transactions could be parsed with this column mapping — double check the Date and Amount/Debit/Credit assignments.');
      setRows([]);
      setSkippedRows(stillUnresolved);
      return;
    }
    finishParse(allParsed, stillUnresolved);
  }

  /** The tail every parser shares once it has rows: sort, enrich, and run the checks. */
  function finishParse(allParsed: ParsedTransaction[], stillUnresolved: SkippedRow[]) {
    // Sorted chronologically regardless of the source table's row order — makes date continuity
    // (and any gap or overlap against a previously-imported statement) easy to see at a glance
    // when importing several statements one after another.
    const sorted = [...allParsed].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
    const enriched = enrichRows(sorted);
    setRows(enriched);
    setSkippedRows(stillUnresolved);
    setShowMappingModal(false);
    if (moneyAccountId !== null) {
      checkForDuplicates(enriched, moneyAccountId);
      applyStoredExclusions(enriched, moneyAccountId);
      applyStoredRowProgress(enriched, moneyAccountId);
    }
  }

  /** Turns one row the parser couldn't handle automatically into a real import row, using whatever
   * the reviewer fixed/filled in on top of the parser's own best-effort guesses — then removes it
   * from the "couldn't be parsed" list since it's now a normal row in the table below (still
   * subject to the same category-suggestion, duplicate-check, and Include/exclude as every other
   * imported row). */
  function addSkippedRowManually(skippedRow: SkippedRow, dateIso: string, description: string, amountCents: number) {
    const manual: ParsedTransaction = { key: `manual-${skippedRow.sourceIndex}`, date: dateIso, description, amountCents };
    const [enrichedRow] = enrichRows([manual]);
    setRows((prev) => [...prev, enrichedRow].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key)));
    setSkippedRows((prev) => prev.filter((r) => r.sourceIndex !== skippedRow.sourceIndex));
    // Not re-running checkForDuplicates here — it resets rowDuplicateCounts for every row rather
    // than merging, so calling it for just this one row would wipe the badges already shown on
    // every other row already in the table.
  }

  function updateRow(key: string, patch: Partial<ImportRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    markDirty();
  }

  /** New account created from the "+ New Account" link on a row — adds it to this page's own
   * account list (no refetch needed) and immediately assigns it as that row's category. */
  function handleAccountCreated(account: Account) {
    setAccounts((prev) => [...prev, account]);
    const rowKey = addAccountRowKey;
    setAddAccountRowKey(null);
    setAddAccountParent(null);
    if (!rowKey) return;
    updateRow(rowKey, { categoryAccountId: account.id });
    const row = rows.find((r) => r.key === rowKey);
    if (row) checkCardPaymentMatch(row, account.id);
  }

  function deleteRow(key: string) {
    if (!window.confirm('Delete this row from the current bank import? You will need to import or enter it again if it was removed by mistake.')) return;
    setRows((prev) => prev.filter((r) => r.key !== key));
    setSelectedKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function deleteSelectedRows() {
    if (!window.confirm(`Delete ${selectedKeys.size} selected row${selectedKeys.size === 1 ? '' : 's'} from the current bank import? You will need to import or enter them again if they were removed by mistake.`)) return;
    setRows((prev) => prev.filter((r) => !selectedKeys.has(r.key)));
    setSelectedKeys(new Set());
  }

  /** Click to toggle one row; Shift+click selects every row between the last-clicked row and this
   * one (the range read off the sheet's current on-screen order), same as a spreadsheet's row
   * headers — the mechanism the user asked for to select "a selected portion" of a bad statement
   * import to delete in one go. */
  function toggleRowSelected(key: string, shiftKey: boolean) {
    setSelectedKeys((prev) => {
      if (shiftKey && lastClickedKey) {
        const keys = rows.map((r) => r.key);
        const start = keys.indexOf(lastClickedKey);
        const end = keys.indexOf(key);
        if (start !== -1 && end !== -1) {
          const [from, to] = start < end ? [start, end] : [end, start];
          const next = new Set(prev);
          for (let i = from; i <= to; i++) next.add(keys[i]);
          return next;
        }
      }
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setLastClickedKey(key);
  }

  function toggleSelectAll() {
    setSelectedKeys((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.key))));
  }

  function toggleDateSort() {
    const nextDir = dateSortDir === 'asc' ? 'desc' : 'asc';
    setDateSortDir(nextDir);
    setRows((prev) =>
      [...prev].sort((a, b) =>
        nextDir === 'asc' ? a.date.localeCompare(b.date) || a.key.localeCompare(b.key) : b.date.localeCompare(a.date) || b.key.localeCompare(a.key),
      ),
    );
  }

  const includedRows = rows.filter((r) => r.include);
  const readyRows = includedRows.filter((r) => r.categoryAccountId !== null || r.matchedInvoiceId !== null || r.matchedBillId !== null);
  // A row still needs a category when it's included but has no category account and isn't matched to
  // an open invoice/bill — the same set counted by (includedRows − readyRows).
  const rowNeedsCategory = (r: (typeof rows)[number]) =>
    r.include && r.categoryAccountId === null && r.matchedInvoiceId === null && r.matchedBillId === null;
  const needsCategoryCount = includedRows.length - readyRows.length;
  const canImport = moneyAccountId !== null && readyRows.length > 0 && !busy;

  /** Proposes only unambiguous amount matches. Nothing is posted here: the reviewer can open the
   * original invoice/bill, change the selection, or exclude the bank row before Import. A balance
   * shared by two open documents is deliberately left alone because amount alone cannot identify
   * which document the customer or vendor paid. */
  function suggestExactDocumentMatches() {
    const usedInvoiceIds = new Set(rows.flatMap((row) => (row.matchedInvoiceId === null ? [] : [row.matchedInvoiceId])));
    const usedBillIds = new Set(rows.flatMap((row) => (row.matchedBillId === null ? [] : [row.matchedBillId])));
    let matchedCount = 0;
    const nextRows = rows.map((row) => {
      if (!row.include || row.needsVerification || row.matchedInvoiceId !== null || row.matchedBillId !== null || row.categoryAccountId !== null) return row;
      const amount = Math.abs(row.amountCents);
      if (isExpenseRow(row, statementType)) {
        const candidates = openBills.filter((bill) => bill.balanceDueCents === amount && !usedBillIds.has(bill.id));
        if (candidates.length !== 1) return row;
        usedBillIds.add(candidates[0].id);
        matchedCount += 1;
        return { ...row, matchedBillId: candidates[0].id };
      }
      const candidates = openInvoices.filter((invoice) => invoice.balanceDueCents === amount && !usedInvoiceIds.has(invoice.id));
      if (candidates.length !== 1) return row;
      usedInvoiceIds.add(candidates[0].id);
      matchedCount += 1;
      return { ...row, matchedInvoiceId: candidates[0].id };
    });
    setRows(nextRows);
    setResultMessage(
      matchedCount > 0
        ? `${matchedCount} exact open invoice/bill match${matchedCount === 1 ? '' : 'es'} suggested. Review each original before importing.`
        : 'No new unique exact-amount invoice or bill matches were found. Ambiguous amounts were left unchanged.',
    );
  }

  // Reconciliation check, before posting: opening + net of every parsed row (not just the ones
  // checked "Include" — a row someone excludes from import still happened on the statement, so it
  // still counts toward whether the extraction reconciles) should equal the statement's own
  // closing balance. amountCents already carries the statement's own credit(+)/debit(−) sign for
  // both bank and credit-card statements, so a plain sum is the correct net change either way —
  // no statementType-specific sign flip needed here.
  const netOfAllRowsCents = rows.reduce((sum, r) => sum + r.amountCents, 0);
  const expectedClosingCents = openingBalanceCents !== null ? openingBalanceCents + netOfAllRowsCents : null;
  const reconciles = expectedClosingCents !== null && closingBalanceCents !== null ? expectedClosingCents === closingBalanceCents : null;

  /** Learns from a correction: if the category the reviewer actually chose isn't what the
   * existing rules would already suggest for this description, remembers it — either by updating
   * a rule that matched the wrong account, or creating a new one — so the next transaction from
   * this vendor auto-suggests correctly instead of asking again. Best-effort; a description with
   * nothing distinctive in it (just numbers/noise words) is silently skipped rather than saving a
   * pattern that would misfire on unrelated transactions later. */
  async function learnFromCorrection(row: ImportRow, currentRules: CategoryRule[]): Promise<CategoryRule | null> {
    if (row.categoryAccountId === null) return null;
    // "Manual" means the HST amount varies per transaction and has to be typed in from the source
    // invoice each time — a saved rule has no way to carry that dollar figure forward, so learning
    // it as the rule's tax code would later auto-apply "Manual" with a silent $0 HST on some
    // future transaction. The category (account) is still safe to learn and repeat; the tax code
    // just isn't, so it's dropped to null rather than carried through.
    const learnedTaxCode = row.taxCode === 'Manual' ? null : row.taxCode;
    const suggestion = suggestCategory(row.description, currentRules);
    if (suggestion?.accountId === row.categoryAccountId && suggestion.taxCode === learnedTaxCode) return null;

    const pattern = deriveRulePattern(row.description);
    if (!pattern) return null;

    const existingRule = currentRules.find((r) => r.isActive && r.pattern.toUpperCase() === pattern);
    if (existingRule) {
      if (existingRule.accountId === row.categoryAccountId && existingRule.taxCode === learnedTaxCode) return null;
      const result = await window.api.categoryRules.update({ id: existingRule.id, patch: { accountId: row.categoryAccountId, taxCode: learnedTaxCode } });
      return result.ok ? result.data : null;
    }
    const result = await window.api.categoryRules.create({ pattern, accountId: row.categoryAccountId, taxCode: learnedTaxCode, priority: 0 });
    return result.ok ? result.data : null;
  }

  async function handleImport() {
    if (moneyAccountId === null) return;
    setBusy(true);
    setError(null);
    setResultMessage(null);

    let succeeded = 0;
    let failed = 0;
    let learnedCount = 0;
    let currentRules = rules;

    // Fetched once for the whole batch (same accounts for every row that needs them) rather than
    // per-row — resolved lazily so a batch with no taxed rows never creates either account.
    let gstRecoverableId: number | null = null;
    let gstPayableId: number | null = null;
    async function gstAccountId(direction: 'payable' | 'recoverable'): Promise<number> {
      if (direction === 'recoverable') {
        if (gstRecoverableId === null) {
          const r = await window.api.accounts.ensureGstHstAccount('recoverable');
          gstRecoverableId = r.ok ? r.data.id : null;
        }
        return gstRecoverableId as number;
      }
      if (gstPayableId === null) {
        const r = await window.api.accounts.ensureGstHstAccount('payable');
        gstPayableId = r.ok ? r.data.id : null;
      }
      return gstPayableId as number;
    }

    for (const row of readyRows) {
      const magnitudeCents = Math.abs(row.amountCents);
      // A row matched to an open invoice/bill settles that invoice/bill directly instead of
      // posting a generic category journal entry — see invoicesReceivePayment's own doc comment
      // for why this posts straight to moneyAccountId rather than through Undeposited Funds.
      if (row.matchedInvoiceId !== null) {
        const result = await window.api.invoices.receivePayment({ id: row.matchedInvoiceId, paymentDate: row.date, bankAccountId: moneyAccountId, amountCents: magnitudeCents });
        if (result.ok) succeeded++;
        else failed++;
        continue;
      }
      if (row.matchedBillId !== null) {
        const result = await window.api.bills.pay({ id: row.matchedBillId, bankAccountId: moneyAccountId, paymentDate: row.date, amountCents: magnitudeCents });
        if (result.ok) succeeded++;
        else failed++;
        continue;
      }

      const isExpense = isExpenseRow(row, statementType);
      const categoryAccount = accounts.find((a) => a.id === row.categoryAccountId);
      const moneyAccount = accounts.find((a) => a.id === moneyAccountId);
      const isTransfer = isTransferTargetAccount(categoryAccount);
      const effectiveTaxCode = isTransfer ? null : row.taxCode;
      const manualHst = !isTransfer && row.taxCode === 'Manual' ? row.manualHstCents : 0;
      const { baseCents, taxCents } = splitBankLineTax(effectiveTaxCode, magnitudeCents, manualHst);
      const split = isTransfer ? { totalTaxCents: 0, claimableTaxCents: 0, nonClaimableTaxCents: 0, provincialClaimableCents: 0 } : computeTaxSplit(row.taxCode, taxCents);
      const categoryCents = categoryLineAmountCents(baseCents, split);
      const categoryLine = {
        accountId: row.categoryAccountId as number,
        debitCents: isExpense ? categoryCents : 0,
        creditCents: isExpense ? 0 : categoryCents,
        description: isTransfer ? `Transfer: ${row.description}` : row.description,
        taxCode: isTransfer ? null : row.taxCode,
        manualHstCents: !isTransfer && row.taxCode === 'Manual' ? row.manualHstCents : null,
        vendorId: row.vendorId,
        customerId: row.customerId,
      };
      const moneyLine = {
        accountId: moneyAccountId,
        debitCents: isExpense ? 0 : magnitudeCents,
        creditCents: isExpense ? magnitudeCents : 0,
        description: row.description,
      };
      let gstLine: { accountId: number; debitCents: number; creditCents: number; description: string } | null = null;
      if (!isTransfer && split.claimableTaxCents > 0) {
        const accountId = await gstAccountId(isExpense ? 'recoverable' : 'payable');
        gstLine = {
          accountId,
          debitCents: isExpense ? split.claimableTaxCents : 0,
          creditCents: isExpense ? 0 : split.claimableTaxCents,
          description: 'GST/HST',
        };
      }
      // Matches the prior line ordering convention: category-then-money for an expense,
      // money-then-category for income — the GST/HST line (when present) sits between them.
      const lines = isExpense
        ? [categoryLine, ...(gstLine ? [gstLine] : []), moneyLine]
        : [moneyLine, categoryLine, ...(gstLine ? [gstLine] : [])];

      const isCardPayment = isTransfer && [moneyAccount, categoryAccount].some((account) => account?.accountSubtype === 'Credit Card');
      const paymentReference = isCardPayment ? cardPaymentReference(row.date, magnitudeCents, moneyAccountId, row.categoryAccountId as number) : null;
      const postResult = await window.api.journal.createAndPost({ entryDate: row.date, memo: row.description, reference: paymentReference, lines });
      if (!postResult.ok) {
        failed++;
        continue;
      }
      succeeded++;

      const learnedRule = isTransfer ? null : await learnFromCorrection(row, currentRules);
      if (learnedRule) {
        learnedCount++;
        currentRules = [...currentRules.filter((r) => r.id !== learnedRule.id), learnedRule];
      }
    }

    setBusy(false);
    setRules(currentRules);
    setResultMessage(
      `Imported ${succeeded} transaction${succeeded === 1 ? '' : 's'}.${failed > 0 ? ` ${failed} failed.` : ''}` +
        (learnedCount > 0 ? ` Learned ${learnedCount} new categorization rule${learnedCount === 1 ? '' : 's'} for next time.` : ''),
    );
    setRows((prev) => prev.filter((r) => !readyRows.includes(r)));
    // These rows are either now posted or failed outright — either way they're leaving the review
    // table, so any saved progress for them is stale and shouldn't keep being restored later.
    if (moneyAccountId !== null && readyRows.length > 0) {
      window.api.bankImport.rowProgressClear({
        accountId: moneyAccountId,
        rows: readyRows.map((r) => ({ transactionDate: r.date, description: r.description, amountCents: r.amountCents })),
      });
    }
    markClean();
  }

  return (
    <div className="w-full">
      <div data-testid="bank-import-account-toolbar" className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <AccountQuickTabs selectedAccountId={moneyAccountId} onSelect={selectMoneyAccount} />
        </div>
        <button
          type="button"
          onClick={() => {
            setNewRulePattern(undefined);
            setShowRulesModal(true);
          }}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Manage Categorization Rules
        </button>
      </div>
      <CategoryRulesModal
        open={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        accounts={accounts}
        rules={rules}
        onAccountCreated={(account) => setAccounts((prev) => [...prev, account])}
        initialPattern={newRulePattern}
        onRulesChanged={(next) => {
          setRules(next);
          setRows((prev) =>
            prev.map((row) => {
              const suggestion = suggestCategory(row.description, next);
              if (!suggestion || row.categoryAccountId !== null) return row;
              const suggestedAccount = accounts.find((a) => a.id === suggestion.accountId);
              const isExpense = isExpenseRow(row, statementType);
              const typeMatches = suggestedAccount?.accountType === (isExpense ? 'Expense' : 'Revenue') || isTransferTargetAccount(suggestedAccount);
              if (!suggestedAccount || !typeMatches) return row;
              // See enrichRows above for why a "Manual" rule can't be auto-applied — it has no
              // per-transaction dollar figure to carry, so applying it here would silently zero
              // out the HST instead.
              return { ...row, categoryAccountId: suggestion.accountId, taxCode: suggestion.taxCode === 'Manual' ? null : suggestion.taxCode };
            }),
          );
        }}
      />
      <div className="mb-2 rounded border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Statement Type</span>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setStatementType('bank')}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${statementType === 'bank' ? 'bg-brand-300 text-brand-900' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
              >
                Bank Account
              </button>
              <button
                type="button"
                onClick={() => setStatementType('creditCard')}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${statementType === 'creditCard' ? 'bg-brand-300 text-brand-900' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
              >
                Credit Card
              </button>
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">{statementType === 'creditCard' ? 'Credit Card Account' : 'Bank Account'}</span>
            <div className="mt-1 w-72">
              <Combobox options={moneyAccountOptions} value={moneyAccountId !== null ? String(moneyAccountId) : null} onChange={(v) => selectMoneyAccount(v ? Number(v) : null)} placeholder="Select account…" />
            </div>
          </label>
        </div>
        {statementType === 'creditCard' && (
          <p className="mt-2 text-xs text-gray-500">
            Credit card convention: a positive amount is treated as a purchase/charge (expense), negative as a payment or
            credit. If your statement does it the other way around, switch back to "Bank Account".
          </p>
        )}

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm text-gray-600">Paste transactions (from Excel or your bank's website) or load a CSV, OFX or QFX download — one per line</span>
            <span className="flex items-center gap-3">
              <button type="button" onClick={handleLoadFile} className="text-sm text-brand-600 hover:underline">
                Load bank file (CSV, OFX, QFX)…
              </button>
              <button type="button" onClick={handleLoadPdfFile} className="text-sm text-brand-600 hover:underline">
                Load PDF Statement(s)…
              </button>
            </span>
          </div>
          <textarea
            className="w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
            rows={6}
            placeholder={'2026-01-05, TORONTO HYDRO, -120.50\n2026-01-06, CLIENT PAYMENT, 500.00'}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-400">
            Accepts: date, description, amount — or date, description, debit, credit. You'll get a chance to map columns next.
            PDF works with a real downloaded statement (RBC, TD, Scotiabank, BMO, and similar all read correctly) — a
            scanned/photographed statement isn't supported yet, use CSV or the bank's own export for that. Select
            several PDFs at once (e.g. all 12 months of a year) to import them together as one batch, sorted by date.
          </p>
        </div>

        <button
          type="button"
          disabled={!rawText.trim()}
          onClick={handleParse}
          className="mt-3 rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
        >
          {isOfxContent(rawText) ? 'Read bank download' : 'Map Columns…'}
        </button>
      </div>

      {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {resultMessage && <div className="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{resultMessage}</div>}

      {skippedRows.length > 0 && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-sm font-medium text-amber-800">
            {skippedRows.length} row(s) could not be parsed automatically — fill in what's missing below and click Add to
            include them.
          </p>
          <SuggestionDatalist fieldKey="line-item-description" />
          <div className="mt-1 divide-y divide-amber-200">
            {skippedRows.map((sr) => (
              <SkippedRowFixer key={sr.sourceIndex} skippedRow={sr} onAdd={(dateIso, description, cents) => addSkippedRowManually(sr, dateIso, description, cents)} />
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-3">
              {selectedKeys.size > 0 && (
                <button type="button" onClick={deleteSelectedRows} className="text-sm font-medium text-red-600 hover:underline">
                  Delete {selectedKeys.size} selected row{selectedKeys.size === 1 ? '' : 's'}
                </button>
              )}
              {needsCategoryCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowNeedsCategoryOnly((v) => !v)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${showNeedsCategoryOnly ? 'bg-amber-100 text-amber-900 shadow-soft ring-1 ring-amber-300' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
                  title="Show only the rows that still need a category, so you don't have to scroll the whole sheet"
                >
                  {showNeedsCategoryOnly ? `Showing ${needsCategoryCount} to categorize — show all rows` : `⚠ ${needsCategoryCount} need a category — show only these`}
                </button>
              )}
              {showNeedsCategoryOnly && needsCategoryCount === 0 && (
                <button type="button" onClick={() => setShowNeedsCategoryOnly(false)} className="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-200">
                  ✓ All categorized — show all rows
                </button>
              )}
            </span>
            <span className="flex items-center gap-3">
              <button
                type="button"
                onClick={suggestExactDocumentMatches}
                className="rounded-full bg-teal-100 px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-200"
                title="Suggest only unique exact outstanding-amount matches; nothing is posted until you review and import"
              >
                Suggest exact matches
              </button>
              {saveProgressMessage && <span className="text-sm text-gray-500">{saveProgressMessage}</span>}
              <button
                type="button"
                disabled={savingProgress}
                onClick={handleSaveProgressClick}
                className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                title="Save your categorization progress now, without leaving this page"
              >
                {savingProgress ? 'Saving…' : '💾 Save Progress'}
              </button>
              <button
                type="button"
                disabled={savingProgress}
                onClick={handleSaveAndExit}
                className="rounded-full bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
                title="Save your categorization progress and leave this page — pick up where you left off later by reloading the same statement file"
              >
                Save &amp; Close
              </button>
              <button type="button" onClick={() => setShowMappingModal(true)} className="text-sm text-brand-600 hover:underline">
                ← Edit column mapping
              </button>
              <button type="button" onClick={cancelImport} className="text-sm font-medium text-red-600 hover:underline">
                Cancel Import
              </button>
            </span>
          </div>
          {/* resize-x adds a native drag grip (bottom-right) so the sheet can be widened/narrowed;
              min-width keeps the columns usable, max-w-full keeps it inside the page. */}
          <div className="resize-x overflow-auto rounded border border-gray-200 bg-white min-w-[720px] max-w-full">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border-b border-gray-200 px-1 py-2 text-center font-medium text-gray-600" title="Click a row number to select it, Shift+click to select a range — click here to select/deselect all">
                    <button type="button" onClick={toggleSelectAll} className="w-full text-gray-400 hover:text-gray-700">
                      #
                    </button>
                  </th>
                  <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">Include</th>
                  <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">
                    <button type="button" onClick={toggleDateSort} className="flex items-center gap-1 hover:text-gray-900" title="Click to sort by date">
                      Date {dateSortDir === 'asc' ? '↑' : '↓'}
                    </button>
                  </th>
                  <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">Description</th>
                  <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">Category (or Match)</th>
                  <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">Payee</th>
                  <th className="border-b border-gray-200 px-2 py-2 text-right font-medium text-gray-600">Amount</th>
                  <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">Direction</th>
                  <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">Tax</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-600">
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5 tabular-nums text-gray-400">start</td>
                  <td className="px-2 py-1.5 font-medium">Opening Balance</td>
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5 text-right">
                    <div className="ml-auto w-28">
                      <CurrencyInput valueCents={openingBalanceCents ?? 0} onChange={setOpeningBalanceCents} placeholder="from statement" />
                    </div>
                  </td>
                  <td className="px-2 py-1.5" colSpan={2}>
                    <span className="text-xs text-gray-400">
                      {openingBalanceCents !== null ? 'Read from the statement — adjust if needed.' : 'Not found on the statement — enter it by hand for the check below.'}
                    </span>
                  </td>
                </tr>
                {rows.map((row, index) => {
                  const isExpense = isExpenseRow(row, statementType);
                  const isTransfer = isTransferTargetAccount(accounts.find((a) => a.id === row.categoryAccountId));
                  const selected = selectedKeys.has(row.key);
                  return (
                    <tr key={row.key} className={`border-b border-gray-100 last:border-0 ${selected ? 'bg-brand-50' : ''} ${showNeedsCategoryOnly && !rowNeedsCategory(row) ? 'hidden' : ''}`}>
                      <td className="px-1 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => toggleRowSelected(row.key, e.shiftKey)}
                            className={`w-5 select-none text-xs ${selected ? 'font-semibold text-brand-700' : 'text-gray-400 hover:text-gray-700'}`}
                            title="Click to select — Shift+click to select a range"
                          >
                            {index + 1}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRow(row.key)}
                            className="text-red-400 hover:text-red-700"
                            title="Delete this row"
                          >
                            ×
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={row.include} onChange={(e) => updateRow(row.key, { include: e.target.checked })} />
                        {!row.include && !previouslyExcludedKeys[row.key] && (
                          <button
                            type="button"
                            onClick={() => rememberExclusion(row)}
                            className="mt-1 block text-[10px] font-medium text-gray-400 hover:text-gray-600 hover:underline"
                            title="Pre-exclude this exact transaction (same date, description, and amount) automatically next time it's imported"
                          >
                            never show again
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">{row.date}</td>
                      <td className="px-2 py-1.5">
                        {row.description}
                        {previouslyExcludedKeys[row.key] && (
                          <span
                            className="ml-1 rounded bg-gray-200 px-1 text-[10px] font-medium text-gray-600"
                            title="Pre-excluded — you told Bank Import to never show this exact transaction again"
                          >
                            previously excluded
                          </span>
                        )}
                        {row.needsVerification && (
                          <span
                            className="ml-1 rounded bg-violet-100 px-1 text-[10px] font-medium text-violet-700"
                            title="This row couldn't be parsed normally — the amount was found by scanning the whole line, and its direction (money in/out) is a guess. Confirm the amount and pick a category before including it."
                          >
                            verify amount
                          </span>
                        )}
                        {cardPaymentMatches[row.key] ? (
                          <span
                            className="ml-1 rounded bg-red-100 px-1 text-[10px] font-medium text-red-700"
                            title={`Already recorded as a credit card payment transfer on ${cardPaymentMatches[row.key].entryDate} — importing this too will double it. Uncheck Include, or delete this row.`}
                          >
                            already paid — other side already recorded
                          </span>
                        ) : (
                          rowDuplicateCounts[row.key] > 0 && (
                            <span
                              className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700"
                              title="An entry on this account with this amount and a nearby date already exists — possibly already imported from an earlier statement."
                            >
                              possible duplicate
                            </span>
                          )
                        )}
                      </td>
                      <td className="w-56 px-2 py-1.5">
                        <Combobox
                          options={[...matchOptionsFor(isExpense), ...categoryOptionsFor(isExpense)]}
                          value={row.matchedInvoiceId !== null ? `inv:${row.matchedInvoiceId}` : row.matchedBillId !== null ? `bill:${row.matchedBillId}` : row.categoryAccountId !== null ? String(row.categoryAccountId) : null}
                          onChange={(v) => {
                            if (v?.startsWith('inv:')) {
                              updateRow(row.key, { matchedInvoiceId: Number(v.slice(4)), matchedBillId: null, categoryAccountId: null, taxCode: null, manualHstCents: 0, autoMatched: false });
                              return;
                            }
                            if (v?.startsWith('bill:')) {
                              updateRow(row.key, { matchedBillId: Number(v.slice(5)), matchedInvoiceId: null, categoryAccountId: null, taxCode: null, manualHstCents: 0 });
                              return;
                            }
                            const categoryAccountId = v ? Number(v) : null;
                            updateRow(row.key, { categoryAccountId, matchedInvoiceId: null, matchedBillId: null });
                            checkCardPaymentMatch(row, categoryAccountId);
                          }}
                          placeholder="Uncategorized"
                          addNewLabel="+ New category"
                          onAddNew={() => {
                            setAddAccountParent(null);
                            setAddAccountRowKey(row.key);
                          }}
                          // Open invoices and bills share this dropdown with categories; only the
                          // plain numeric account rows can take a sub-account.
                          canAddSub={(option) => !option.value.includes(':')}
                          onAddSub={(option) => {
                            setAddAccountParent(accounts.find((a) => a.id === Number(option.value)) ?? null);
                            setAddAccountRowKey(row.key);
                          }}
                        />
                        {row.matchedInvoiceId === null && row.matchedBillId === null && (
                          <div className="mt-1 flex flex-wrap gap-2">
                            {row.categoryAccountId === null && (
                              <button
                                type="button"
                                onClick={() => {
                                  setNewRulePattern(deriveRulePattern(row.description) ?? row.description);
                                  setShowRulesModal(true);
                                }}
                                className="text-xs font-medium text-brand-600 hover:underline"
                                title="No categorization rule matched this description — create one now instead of just picking a category for this row alone."
                              >
                                + New Rule
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setAddAccountParent(null);
                                setAddAccountRowKey(row.key);
                              }}
                              className="text-xs font-medium text-brand-600 hover:underline"
                              title="Add a new Chart of Accounts category without leaving this import — everything you've entered here stays exactly as it is."
                            >
                              + New Account
                            </button>
                          </div>
                        )}
                        {row.autoMatched && (row.matchedInvoiceId !== null || row.matchedBillId !== null) && (
                          <span className="mt-1 block text-[11px] text-emerald-700" title="Amount equals the document's balance to the cent within the date window — confirm, or pick something else">✓ Auto-matched — confirm</span>
                        )}
                        {row.matchedInvoiceId !== null && (
                          <button type="button" onClick={() => setView({ kind: 'invoiceEditor', id: row.matchedInvoiceId! })} className="mt-1 text-xs font-medium text-brand-600 hover:underline">
                            Open original invoice
                          </button>
                        )}
                        {row.matchedBillId !== null && (
                          <button type="button" onClick={() => setView({ kind: 'purchases' })} className="mt-1 text-xs font-medium text-brand-600 hover:underline">
                            Open original bill list
                          </button>
                        )}
                      </td>
                      <td className="w-44 px-2 py-1.5">
                        {row.matchedInvoiceId !== null || row.matchedBillId !== null ? (
                          <span className="text-xs text-gray-400">Set by the matched {row.matchedInvoiceId !== null ? 'invoice' : 'bill'}</span>
                        ) : (
                          <Combobox options={nameOptions} value={encodeNameValue(row.vendorId, row.customerId)} onChange={(v) => updateRow(row.key, decodeNameValue(v))} placeholder="—" />
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Money cents={row.amountCents} />
                      </td>
                      <td className="px-2 py-1.5">
                        {row.matchedInvoiceId !== null || row.matchedBillId !== null ? (
                          <span className="rounded bg-teal-100 px-1.5 py-0.5 text-xs text-teal-800" title="Importing this row will settle the matched invoice/bill directly, instead of posting a generic journal entry.">
                            Matched
                          </span>
                        ) : (
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs ${
                              row.categoryAccountId === null
                                ? 'bg-gray-100 text-gray-500'
                                : isTransfer
                                  ? 'bg-cyan-100 text-cyan-800'
                                  : isExpense
                                    ? 'bg-gold-100 text-gold-800'
                                    : 'bg-brand-100 text-brand-800'
                            }`}
                            title={isTransfer ? 'Money movement between your own accounts — not posted as income or an expense.' : undefined}
                          >
                            {row.categoryAccountId === null ? 'Uncategorized' : isTransfer ? 'Transfer' : isExpense ? 'Expense' : 'Income'}
                          </span>
                        )}
                      </td>
                      <td className="w-40 px-2 py-1.5">
                        {row.matchedInvoiceId === null && row.matchedBillId === null && (
                          <>
                            <select
                              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                              value={row.taxCode ?? ''}
                              onChange={(e) => updateRow(row.key, { taxCode: (e.target.value || null) as TaxCode | null })}
                            >
                              {TAX_CODE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            {row.taxCode === 'Manual' && (
                              <div className="mt-1">
                                <CurrencyInput valueCents={row.manualHstCents} onChange={(cents) => updateRow(row.key, { manualHstCents: cents })} placeholder="HST $" />
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-700">
                  <td className="px-2 py-1.5" colSpan={6}>
                    Total ({rows.length} row{rows.length === 1 ? '' : 's'})
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                    <Money cents={netOfAllRowsCents} />
                  </td>
                  <td className="px-2 py-1.5" colSpan={2} />
                </tr>
                <tr className="border-t border-gray-200 bg-gray-50 text-gray-600">
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5 tabular-nums text-gray-400">end</td>
                  <td className="px-2 py-1.5 font-medium">Closing Balance</td>
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5 text-right">
                    <div className="ml-auto w-28">
                      <CurrencyInput valueCents={closingBalanceCents ?? 0} onChange={setClosingBalanceCents} placeholder="from statement" />
                    </div>
                  </td>
                  <td className="px-2 py-1.5" colSpan={2}>
                    {expectedClosingCents !== null && closingBalanceCents !== null ? (
                      reconciles ? (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          ✓ Reconciles — Opening + Total = Closing
                        </span>
                      ) : (
                        <span
                          className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                          title="Opening Balance + Total doesn't match Closing Balance — a row may have been missed, misread, or the Opening/Closing figures need correcting."
                        >
                          ✗ Off by <Money cents={expectedClosingCents - closingBalanceCents} /> — expected <Money cents={expectedClosingCents} />
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-gray-400">Enter both Opening and Closing Balance above to check.</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button type="button" disabled={!canImport} onClick={handleImport} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50">
              Import {readyRows.length} Transaction{readyRows.length === 1 ? '' : 's'}
            </button>
            {includedRows.length > readyRows.length && (
              <span className="text-sm text-amber-600">{includedRows.length - readyRows.length} row(s) need a category before they can be imported.</span>
            )}
            {moneyAccountId === null && <span className="text-sm text-amber-600">Select an account above first.</span>}
          </div>
        </>
      )}

      <ColumnMappingModal open={showMappingModal} onClose={() => setShowMappingModal(false)} table={table} onContinue={applyMapping} />
      <AccountFormModal
        open={addAccountRowKey !== null}
        onClose={() => {
          setAddAccountRowKey(null);
          setAddAccountParent(null);
        }}
        initialParent={addAccountParent}
        onSaved={handleAccountCreated}
      />

      {/* AppShell's own scroll container is the <main> element wrapping every page, not the
          window — so these scroll that instead of a no-op window.scrollTo. Only shown once the
          review table is actually long enough that jumping matters. */}
      {rows.length > 10 && (
        <div className="fixed bottom-24 right-6 z-40 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-700 text-lg text-white shadow-lg hover:bg-brand-800"
            title="Scroll to top"
            aria-label="Scroll to top"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => {
              const main = document.querySelector('main');
              if (main) main.scrollTo({ top: main.scrollHeight, behavior: 'smooth' });
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-700 text-lg text-white shadow-lg hover:bg-brand-800"
            title="Scroll to bottom"
            aria-label="Scroll to bottom"
          >
            ↓
          </button>
        </div>
      )}
    </div>
  );
}
