import { useEffect, useRef, useState } from 'react';
import type { Account, AccountType, GifiCode } from '@shared/domain/types';
import { Modal } from '../../components/Modal';
import { Combobox } from '../../components/Combobox';
import { CurrencyInput } from '../../components/CurrencyInput';
import { capitalizeWords, suggestOnBlur } from '../../utils/textCase';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { recordSuggestion, suggestionListId } from '../../utils/textSuggestions';
import { postOpeningBalance } from './openingBalanceEquity';
import { suggestGifiCode } from '@shared/domain/ledger/suggestGifiCode';
import { findPreset, presetsForAccountType } from '@shared/domain/ledger/accountPresets';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { FOREIGN_CURRENCY_CODES, FOREIGN_CURRENCY_LABELS } from '@shared/domain/types';

function todayIso(): string {
  return localIsoDate();
}

const ACCOUNT_TYPES: AccountType[] = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

/** Sentinel for "none of these — let me type my own subtype", which reveals the free-text box. */
const CUSTOM_SUBTYPE = '__custom__';

// Matches this app's own starter chart-of-accounts templates (see coa_template.*.seed.ts) —
// used only as a fallback starting point when a type has no accounts yet.
const TYPE_RANGE_START: Record<AccountType, number> = {
  Asset: 1000,
  Liability: 2000,
  Equity: 3000,
  Revenue: 4000,
  Expense: 5000,
};

/** Suggests the next unused account code for a new account of the given type: one past the
 * highest existing code already used within that type (falling back to the type's usual starting
 * range if it has none yet), skipping over any code number already taken by a DIFFERENT type
 * (codes must be unique across the whole chart of accounts, not just within a type). */
function suggestNextCode(accountType: AccountType, existingAccounts: Account[]): string {
  const usedCodes = new Set(existingAccounts.map((a) => a.code));
  const numericCodesInType = existingAccounts
    .filter((a) => a.accountType === accountType)
    .map((a) => Number(a.code))
    .filter((n) => Number.isFinite(n));
  let candidate = numericCodesInType.length > 0 ? Math.max(...numericCodesInType) + 10 : TYPE_RANGE_START[accountType];
  while (usedCodes.has(String(candidate))) candidate += 1;
  return String(candidate);
}

interface AccountFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Receives the created/updated account so a caller that opened this modal for a quick inline
   * add (see BankImportPage) can immediately use its id — e.g. auto-selecting it as the category
   * that was just being picked — without a second round trip to look it back up. */
  onSaved: (account: Account) => void;
  account?: Account | null;
  /** Pre-fills a brand-new account as a sub-account of this one — e.g. clicking "Visa" and then
   * "+ Add Sub-Account" opens this modal ready to name the specific card ("RBC Visa", "TD Visa"). */
  initialParent?: Account | null;
  /** The type a brand-new account should start as when there is no parent to inherit one from.
   * A category picker on the Expense tab opens this modal to create an expense account; leaving
   * it on the 'Asset' default would save an account that then fails to appear in the very list
   * the user opened it from. */
  initialType?: AccountType | null;
  /** Lets the caller switch from viewing/editing this account straight into creating a new
   * sub-account of it, without closing the modal in between. */
  onAddSubaccount?: (parent: Account) => void;
}

export function AccountFormModal({ open, onClose, onSaved, account, initialParent, initialType, onAddSubaccount }: AccountFormModalProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('Asset');
  const [accountSubtype, setAccountSubtype] = useState('');
  /** Which preset the picker is showing. Empty means none chosen; CUSTOM_SUBTYPE means the user
   * asked to type their own, which reveals the free-text box the picker replaced. */
  const [presetLabel, setPresetLabel] = useState('');
  /** A master is a non-posting parent/roll-up account. Its children can be added later. */
  const [createSubaccounts, setCreateSubaccounts] = useState(false);
  const [gifiCode, setGifiCode] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [isTransferEligible, setIsTransferEligible] = useState(false);
  const [currency, setCurrency] = useState<Account['currency']>('CAD');
  const [isSubaccount, setIsSubaccount] = useState(false);
  const [parentId, setParentId] = useState<number | null>(null);
  const [openingBalanceCents, setOpeningBalanceCents] = useState(0);
  const [openingBalanceDate, setOpeningBalanceDate] = useState(todayIso());
  const [gifiOptions, setGifiOptions] = useState<GifiCode[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Records a type this component set on its own from `initialParent`, so the effect that clears
   * the parent whenever the type changes can tell that change apart from the user picking a
   * different type by hand. Without it, pre-filling a parent was self-defeating: the parent was
   * set, the type was set from it, and the resulting type change immediately wiped the parent
   * again. Invisible for an Asset parent (already the default type, so no change fires) and
   * silently broken for every Expense or Revenue one — which is exactly what a category is. */
  const parentPrefillTypeRef = useRef<AccountType | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(account?.code ?? '');
    setName(account?.name ?? '');
    setAccountType(account?.accountType ?? initialType ?? 'Asset');
    setAccountSubtype(account?.accountSubtype ?? '');
    // Editing an existing account: show the preset whose classification it already carries, if one
    // matches, so the picker is not blank on an account that was created through it.
    setPresetLabel(
      account?.accountSubtype
        ? presetsForAccountType(account.accountType).find((p) => p.subtype === account.accountSubtype)?.label ?? CUSTOM_SUBTYPE
        : '',
    );
    setGifiCode(account?.gifiCode ?? null);
    setDescription(account?.description ?? '');
    setAccountNumber(account?.accountNumber ?? '');
    setIsTransferEligible(account?.isTransferEligible ?? false);
    setCurrency(account?.currency ?? 'CAD');
    setIsSubaccount(account ? account.parentId != null : initialParent != null);
    setParentId(account ? account.parentId ?? null : initialParent?.id ?? null);
    if (!account && initialParent) {
      setAccountType(initialParent.accountType);
      parentPrefillTypeRef.current = initialParent.accountType;
    } else {
      parentPrefillTypeRef.current = null;
    }
    setOpeningBalanceCents(0);
    setOpeningBalanceDate(todayIso());
    setError(null);
    setCreateSubaccounts(account?.isMaster ?? false);
    window.api.gifi.list().then((r) => r.ok && setGifiOptions(r.data));
    window.api.accounts.list({ activeOnly: false }).then((r) => {
      if (!r.ok) return;
      setAllAccounts(r.data);
      if (account && r.data.some((candidate) => candidate.parentId === account.id)) setCreateSubaccounts(true);
      if (!account) setCode(suggestNextCode(initialParent?.accountType ?? initialType ?? 'Asset', r.data));
    });
  }, [open, account, initialParent, initialType]);

  // Re-suggests the next unused code whenever the type changes on a NEW account — each type has
  // its own numeric range. The implementation-only code stays hidden from users.
  // A preset belongs to one account type, so switching type has to clear it — otherwise "Chequing
  // account" would still be showing after switching to Expense.
  useEffect(() => {
    if (!open || account) return;
    setPresetLabel('');
  }, [accountType, open, account]);

  useEffect(() => {
    if (!open || account) return;
    // This type came from the parent we just pre-filled, not from the user changing it — keep the
    // parent, and keep the code the effect above already suggested for that same type.
    if (parentPrefillTypeRef.current === accountType) {
      parentPrefillTypeRef.current = null;
      return;
    }
    setCode(suggestNextCode(accountType, allAccounts));
    setParentId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountType]);

  // Can't nest an account under itself or under one of its own children — that would create a
  // cycle in the parent chain.
  const selectedPreset = presetLabel && presetLabel !== CUSTOM_SUBTYPE ? findPreset(accountType, presetLabel) : undefined;

  const parentOptions = allAccounts.filter(
    (a) => a.accountType === accountType && a.id !== account?.id && a.parentId !== account?.id,
  );
  const hasSubaccounts = Boolean(account && allAccounts.some((candidate) => candidate.parentId === account.id));

  async function handleSave(keepOpen: boolean) {
    setBusy(true);
    setError(null);
    // Capitalized here rather than relying solely on the fields' onBlur — clicking Save right
    // after typing the last field fires blur and click in the same event batch, and this
    // component's own state wouldn't reflect the blur's capitalization yet by the time this
    // closure reads it. Capitalizing the raw value directly at save time is correct regardless.
    const capitalizedName = capitalizeWords(name);
    const capitalizedSubtype = capitalizeWords(accountSubtype);
    const resolvedParentId = isSubaccount ? parentId : null;
    // Codes are useful internal report-ordering keys, but the reviewer should not need to invent
    // one. A blank field receives the next unused code immediately before saving.
    // Re-read the chart right before saving: the list this form opened with may be minutes old, and
    // a code suggested from it can have been taken since (another window, another user, a preset).
    const latest = await window.api.accounts.list({ activeOnly: false });
    const currentAccounts = latest.ok ? latest.data : allAccounts;
    if (latest.ok) setAllAccounts(latest.data);
    const others = currentAccounts.filter((a) => a.id !== account?.id);
    const resolvedCode = account ? (code.trim() || suggestNextCode(accountType, others)) : suggestNextCode(accountType, others);
    setCode(resolvedCode);
    const result = account
      ? await window.api.accounts.update({
          id: account.id,
          patch: {
            code: resolvedCode,
            name: capitalizedName,
            accountSubtype: capitalizedSubtype || null,
            parentId: resolvedParentId,
            gifiCode,
            description: description || null,
            accountNumber: accountNumber || null,
            isTransferEligible,
            isMaster: createSubaccounts,
            currency,
          },
        })
      : await window.api.accounts.create({
          code: resolvedCode,
          name: capitalizedName,
          accountType,
          accountSubtype: capitalizedSubtype || null,
          parentId: resolvedParentId,
          gifiCode,
          description: description || null,
          accountNumber: accountNumber || null,
          isTransferEligible,
          isMaster: createSubaccounts,
          currency,
        });
    if (!result.ok) {
      setBusy(false);
      return setError(result.error);
    }

    // New bank/credit card/equity account with a real-world starting balance (bookkeeping is
    // beginning partway through its history) — post it against Opening Balance Equity, the same
    // convention QuickBooks uses, so the account's balance is correct from day one without a
    // fabricated "first transaction" standing in for history that predates this software.
    // Equity's own field allows a NEGATIVE value (e.g. bringing in a Dividends Paid balance of
    // -20,000, matching exactly how it reads on a real Balance Sheet) — see postOpeningBalance's
    // own doc comment for how that sign resolves into a real debit/credit pair.
    if (
      !account &&
      openingBalanceCents !== 0 &&
      (accountType === 'Asset' || accountType === 'Liability' || accountType === 'Equity')
    ) {
      const postResult = await postOpeningBalance({
        accountId: result.data.id,
        accountName: name,
        accountType,
        amountCents: openingBalanceCents,
        asOfDate: openingBalanceDate,
      });
      if (!postResult.ok) {
        setBusy(false);
        setError(`Account was created, but the opening balance could not be posted: ${postResult.error}`);
        onSaved(result.data);
        return;
      }
    }

    setBusy(false);
    onSaved(result.data);

    if (!keepOpen) {
      onClose();
      return;
    }

    // Save & Next: stay open for the next one, keeping Type/Main Account picked (adding RBC
    // Visa, then TD Visa, then Scotia Visa under the same "Visa" main account, back to back) while
    // clearing everything specific to the account just saved.
    const refreshedAccounts = [...allAccounts, result.data];
    setAllAccounts(refreshedAccounts);
    setName('');
    setAccountSubtype('');
    setPresetLabel('');
    setGifiCode(null);
    setDescription('');
    setAccountNumber('');
    setIsTransferEligible(false);
    setOpeningBalanceCents(0);
    setOpeningBalanceDate(todayIso());
    setCreateSubaccounts(false);
    setCode(suggestNextCode(accountType, refreshedAccounts));
  }

  return (
    <Modal fullScreen
      open={open}
      onClose={onClose}
      title={account ? `Edit ${account.name}` : 'New Account'}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          {!account && (
            <button
              type="button"
              disabled={busy || !name.trim() || (isSubaccount && !parentId)}
              onClick={() => handleSave(true)}
              title="Save this account and keep the window open to add another"
              className="rounded-full border border-brand-300 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
            >
              Save &amp; Next
            </button>
          )}
          <button
            type="button"
            disabled={busy || !name.trim() || (isSubaccount && !parentId)}
            onClick={() => handleSave(false)}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Save &amp; Close
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {account && account.parentId == null && onAddSubaccount && (
          <button
            type="button"
            onClick={() => onAddSubaccount(account)}
            className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            + Add Sub-Account (e.g. RBC {account.name}, TD {account.name})
          </button>
        )}
        <div className="block text-sm">
          <span className="text-gray-600">Account Type</span>
          <div className="mt-1 grid grid-cols-5 gap-1.5">
            {ACCOUNT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                disabled={!!account}
                onClick={() => {
                  setAccountType(t);
                  setParentId(null);
                }}
                className={`rounded px-2 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                  accountType === t ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded border border-gray-200 p-2">
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isSubaccount}
              onChange={(e) => {
                setIsSubaccount(e.target.checked);
                if (!e.target.checked) setParentId(null);
              }}
            />
            Make this a sub-account of…
          </label>
          {isSubaccount && (
            <select
              className="mt-1.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={parentId ?? ''}
              onChange={(e) => {
                const newParentId = e.target.value ? Number(e.target.value) : null;
                setParentId(newParentId);
                // A sub-account almost always rolls up to the same GIFI line and subtype as its
                // main account (RBC Visa reports the same as Visa) — auto-fill from it, but never
                // overwrite something the reviewer already picked themselves.
                const parentAccount = allAccounts.find((a) => a.id === newParentId);
                if (parentAccount) {
                  if (!gifiCode && parentAccount.gifiCode) setGifiCode(parentAccount.gifiCode);
                  if (!accountSubtype.trim() && parentAccount.accountSubtype) setAccountSubtype(parentAccount.accountSubtype);
                }
              }}
            >
              <option value="">Select a main account…</option>
              {parentOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          {isSubaccount && !parentId && (
            <p className="mt-1 text-xs text-gray-400">
              e.g. pick "Visa" as the main account, then name this one "RBC Visa" below — same idea for Chequing, Savings,
              Accounts Payable, or Accounts Receivable with multiple banks/vendors/customers. Its GIFI code will follow the main
              account automatically.
            </p>
          )}
          {isSubaccount && parentOptions.length === 0 && (
            <p className="mt-1 text-xs text-gray-400">No other {accountType} accounts available to nest under yet.</p>
          )}
        </div>
        <label className="block text-sm">
          <span className="text-gray-600">{isSubaccount ? 'Sub-Account Name' : 'Account Name'}</span>
          <input
            name="account-name"
            autoComplete="on"
            list={suggestionListId('account-name')}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => {
              const capitalized = capitalizeWords(e.target.value);
              setName(capitalized);
              recordSuggestion('account-name', capitalized);
              // Only on a brand-new account, and only into fields the reviewer hasn't already
              // filled in themselves — never overwrites a manual choice with a guess.
              if (!account && capitalized.trim()) {
                const suggestion = suggestGifiCode(capitalized, accountType, gifiOptions);
                if (suggestion) {
                  if (!gifiCode) setGifiCode(suggestion.code);
                  if (!accountSubtype.trim() && suggestion.category) setAccountSubtype(suggestion.category);
                }
              }
            }}
          />
          <SuggestionDatalist fieldKey="account-name" />
        </label>
        {(accountType === 'Asset' || accountType === 'Liability') && (
          <label className="block text-sm">
            <span className="text-gray-600">Bank / Card Account Number (optional)</span>
            <input
              list={suggestionListId('account-number')}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              onBlur={(e) => recordSuggestion('account-number', e.target.value)}
              placeholder="e.g. 123456 for a chequing account, or the last 4 digits of a card"
            />
            <SuggestionDatalist fieldKey="account-number" />
            <span className="mt-1 block text-[11px] text-gray-400">This is the real bank/card reference and can always be edited.</span>
          </label>
        )}
        {(accountType === 'Asset' || accountType === 'Liability') && (
          <label className="block text-sm">
            <span className="text-gray-600">Currency held</span>
            <select aria-label="Currency held" className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={currency} onChange={(e) => setCurrency(e.target.value as Account['currency'])}>
              <option value="CAD">CAD — Canadian dollar (base)</option>
              {FOREIGN_CURRENCY_CODES.map((code) => <option key={code} value={code}>{code} — {FOREIGN_CURRENCY_LABELS[code]}</option>)}
            </select>
            <span className="mt-1 block text-[11px] text-gray-400">For a US-dollar chequing account or card. Its ledger balance stays in CAD; the foreign balance is tracked from each transaction's foreign amount.</span>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isTransferEligible} onChange={(e) => setIsTransferEligible(e.target.checked)} />
          <span className="text-gray-600">Transfer Between Accounts</span>
        </label>
        {isTransferEligible && (
          <p className="-mt-2 text-[11px] text-gray-400">
            Makes this account selectable as a Transfer target in Bank Import's category dropdown — for moving money to/from another
            account (paying a credit card, moving Chequing to Savings) rather than posting it as income or an expense. Chequing,
            Savings, and Credit Card accounts already offer this automatically; check this for any other account you also transfer
            money to or from (a line of credit, PayPal, an intercompany account, etc.).
          </p>
        )}
        <label className="block text-sm">
          <span className="text-gray-600">Account Kind</span>
          <select
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            value={presetLabel}
            onChange={(e) => {
              const label = e.target.value;
              setPresetLabel(label);
              if (label === CUSTOM_SUBTYPE || label === '') {
                if (label === '') setAccountSubtype('');
                return;
              }
              const preset = findPreset(accountType, label);
              if (!preset) return;
              setAccountSubtype(preset.subtype);
              // The name is nearly always the kind itself, so fill it in — but never over a name
              // the user has already typed.
              if (preset.suggestedName) {
                setName((current) => (current.trim() ? current : preset.suggestedName!));
              }
              if (preset.transferEligible) setIsTransferEligible(true);
            }}
          >
            <option value="">— choose the kind of account —</option>
            {presetsForAccountType(accountType).map((preset) => (
              <option key={preset.label} value={preset.label}>
                {preset.label}
              </option>
            ))}
            <option value={CUSTOM_SUBTYPE}>Something else — let me type it</option>
          </select>
          {selectedPreset?.hint && <p className="mt-1 text-xs text-gray-500">{selectedPreset.hint}</p>}
          {presetLabel && presetLabel !== CUSTOM_SUBTYPE && accountSubtype && (
            <p className="mt-1 text-xs text-gray-400">Filed as "{accountSubtype}" on the reports.</p>
          )}
        </label>

        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createSubaccounts}
              disabled={hasSubaccounts}
              onChange={(e) => {
                setCreateSubaccounts(e.target.checked);
                if (e.target.checked) setOpeningBalanceCents(0);
              }}
            />
            <span className="font-medium text-gray-700">Make this a master account</span>
          </label>
          {hasSubaccounts ? (
            <p className="mt-1 text-xs font-medium text-amber-700">
              This master already has sub-accounts. You may still enter balances and transactions directly in the master, but its
              displayed total includes both direct master activity and every sub-account. Avoid entering the same amount twice.
            </p>
          ) : createSubaccounts ? (
            <p className="mt-1 text-xs font-medium text-amber-700">
              Entering an opening balance or transactions directly in this master is optional. If you add sub-accounts later, the
              master total will include both its own direct activity and all sub-account balances; avoid entering anything twice.
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">
              Marks this account as a master so sub-accounts can be organized beneath it later.
            </p>
          )}
        </div>

        {presetLabel === CUSTOM_SUBTYPE && (
          <label className="block text-sm">
            <span className="text-gray-600">Subtype</span>
            <input
              name="account-subtype"
              autoComplete="on"
              list={suggestionListId('account-subtype')}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={accountSubtype}
              onChange={(e) => setAccountSubtype(e.target.value)}
              onBlur={suggestOnBlur('account-subtype', setAccountSubtype)}
              placeholder="e.g. Current Asset"
            />
            <SuggestionDatalist fieldKey="account-subtype" />
            <p className="mt-1 text-xs text-amber-700">
              A subtype the app doesn't recognise still saves, but the account won't be picked up by the features that key off it —
              cash accounts on the Statement of Cash Flows, for instance. Choosing a kind above avoids that.
            </p>
          </label>
        )}
        {!account && (accountType === 'Asset' || accountType === 'Liability' || accountType === 'Equity') && (
          <div className="rounded border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 text-xs font-medium text-gray-600">
              Starting bookkeeping partway through this account's history? Enter its balance as of a specific date and it'll post
              automatically against an "Opening Balance Equity" account — the same approach QuickBooks uses.
              {accountType === 'Equity' && (
                <>
                  {' '}
                  Type it signed exactly as it reads on your old Balance Sheet — a normal credit balance (Common Shares, Retained
                  Earnings) as a positive number, a contra-equity balance (Dividends Paid) as a negative one, e.g.{' '}
                  <span className="font-mono">-20,000.00</span>.
                </>
              )}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-gray-600">Opening Balance (optional)</span>
                <div className="mt-1">
                  <CurrencyInput valueCents={openingBalanceCents} onChange={setOpeningBalanceCents} />
                </div>
              </label>
              {openingBalanceCents !== 0 && (
                <label className="block text-sm">
                  <span className="text-gray-600">As Of</span>
                  <input
                    type="date" min={DATE_MIN} max={DATE_MAX}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                    value={openingBalanceDate}
                    onChange={(e) => setOpeningBalanceDate(clampIsoDate(e.target.value))}
                  />
                </label>
              )}
            </div>
          </div>
        )}
        <label className="block text-sm">
          <span className="text-gray-600">GIFI Code</span>
          <div className="mt-1">
            <Combobox
              options={gifiOptions.map((g) => ({ value: g.code, label: g.description }))}
              value={gifiCode}
              onChange={setGifiCode}
              placeholder="Search GIFI codes…"
            />
          </div>
          {!gifiCode && <p className="mt-1 text-xs text-amber-600">No GIFI mapping — this account will be flagged on the GIFI Export report.</p>}
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Description (optional)</span>
          <textarea
            name="account-description"
            autoComplete="on"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={(e) => recordSuggestion('account-description', capitalizeWords(e.target.value))}
          />
        </label>
      </div>
    </Modal>
  );
}
