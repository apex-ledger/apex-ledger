import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Account, Contact } from '@shared/domain/types';
import { Modal } from '../../components/Modal';
import { CurrencyInput } from '../../components/CurrencyInput';
import { Money, formatCents } from '../../components/Money';
import { postOpeningBalance } from './openingBalanceEquity';
import { localIsoDate } from '@shared/domain/dates/localDate';
import {
  AP_CONTROL_NAME,
  AR_CONTROL_NAME,
  MISC_AP_NAME,
  MISC_AR_NAME,
  accountFamilyIds,
  contactOpeningSubaccountName,
  nextContactSubaccountCode,
  type ContactOpeningKind,
} from './openingBalanceContactAccounts';

function todayIso(): string {
  return localIsoDate();
}

// Display order for grouping the opening-balance list into labeled sections instead of one long
// flat table — anything with a subtype not in this list (a custom one the accountant typed) falls
// through to its own alphabetized group at the end rather than being dropped.
const SUBTYPE_ORDER = [
  'Cash and Bank',
  'Current Asset',
  'Capital Asset',
  'Credit Card',
  'Current Liability',
  'Long-Term Liability',
  'Share Capital',
  'Equity',
];

interface PendingContactOpening {
  id: number;
  kind: ContactOpeningKind;
  contactId: number | null;
  contactName: string | null;
  accountId: number | null;
  createSubaccount: boolean;
  amountCents: number;
}

function subtypeRank(subtype: string | null): number {
  const idx = SUBTYPE_ORDER.indexOf(subtype ?? '');
  return idx === -1 ? SUBTYPE_ORDER.length : idx;
}

interface OpeningBalancesModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** A single screen listing every bank/card/other Asset, Liability & Equity account (Chequing,
 * Savings, Visa, Mastercard, GST/HST Recoverable, Common Shares, Dividends Paid, etc.) so a new
 * company's starting balances can be typed in one sitting — one figure per account — instead of
 * hunting for an "Edit" option on each account or building a manual journal entry. Existing
 * accounts (e.g. the ones a Chart of Accounts template pre-creates) never got this option before:
 * AccountFormModal only offers an opening balance when creating a brand-new account, so a
 * pre-existing Chequing account had no easy path in. This reuses the same Opening Balance Equity
 * posting convention either way — an Equity account's own box accepts a signed value (positive for
 * a normal credit balance, negative for a contra-equity one like Dividends Paid), matching exactly
 * how it reads on a real Balance Sheet; see postOpeningBalance's own doc comment. */
export function OpeningBalancesModal({ open, onClose, onSaved }: OpeningBalancesModalProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [currentBalances, setCurrentBalances] = useState<Map<number, number>>(new Map());
  const [amounts, setAmounts] = useState<Map<number, number>>(new Map());
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const [contactKind, setContactKind] = useState<ContactOpeningKind>('receivable');
  const [contactId, setContactId] = useState<number | null>(null);
  const [contactAccountChoice, setContactAccountChoice] = useState('misc');
  const [contactAmountCents, setContactAmountCents] = useState(0);
  const [contactPending, setContactPending] = useState<PendingContactOpening[]>([]);
  const [nextContactPendingId, setNextContactPendingId] = useState(1);

  const [checkAccountId, setCheckAccountId] = useState<number | null>(null);
  const [checkDate, setCheckDate] = useState(todayIso());
  const [checkExpectedCents, setCheckExpectedCents] = useState(0);
  const [checkLedgerCents, setCheckLedgerCents] = useState<number | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const [accountsResult, trialBalanceResult, customersResult, vendorsResult] = await Promise.all([
      window.api.accounts.list({ activeOnly: true }),
      window.api.reports.trialBalance({ asOfDate: todayIso() }),
      window.api.customers.list(),
      window.api.vendors.list(),
    ]);
    setLoading(false);
    if (!accountsResult.ok) return setError(accountsResult.error);
    if (!customersResult.ok) return setError(customersResult.error);
    if (!vendorsResult.ok) return setError(vendorsResult.error);
    const activeAccounts = accountsResult.data;
    setAllAccounts(activeAccounts);
    setCustomers(customersResult.data.filter((contact) => contact.isActive));
    setVendors(vendorsResult.data.filter((contact) => contact.isActive));
    const arControl = activeAccounts.find((account) => account.name.toLowerCase() === AR_CONTROL_NAME.toLowerCase()) ?? null;
    const apControl = activeAccounts.find((account) => account.name.toLowerCase() === AP_CONTROL_NAME.toLowerCase()) ?? null;
    const contactAccountIds = new Set([
      ...accountFamilyIds(activeAccounts, arControl?.id ?? null),
      ...accountFamilyIds(activeAccounts, apControl?.id ?? null),
    ]);
    const list = activeAccounts
      .filter((account) => account.accountType === 'Asset' || account.accountType === 'Liability' || account.accountType === 'Equity')
      .filter((account) => !contactAccountIds.has(account.id))
      .filter((a) => a.name !== 'Opening Balance Equity')
      .sort((a, b) => {
        const rankDiff = subtypeRank(a.accountSubtype) - subtypeRank(b.accountSubtype);
        if (rankDiff !== 0) return rankDiff;
        const subtypeCompare = (a.accountSubtype ?? '').localeCompare(b.accountSubtype ?? '');
        if (subtypeCompare !== 0) return subtypeCompare;
        return a.code.localeCompare(b.code);
      });
    setAccounts(list);
    if (trialBalanceResult.ok) {
      const balances = new Map<number, number>();
      for (const row of trialBalanceResult.data.rows) {
        const signed = row.account.normalBalance === 'Debit' ? row.debitCents - row.creditCents : row.creditCents - row.debitCents;
        balances.set(row.account.id, signed);
      }
      setCurrentBalances(balances);
    }
  }

  useEffect(() => {
    if (!open) return;
    setAmounts(new Map());
    setAsOfDate(todayIso());
    setSuccessCount(0);
    setContactKind('receivable');
    setContactId(null);
    setContactAccountChoice('misc');
    setContactAmountCents(0);
    setContactPending([]);
    setNextContactPendingId(1);
    setCheckDate(todayIso());
    setCheckExpectedCents(0);
    setCheckLedgerCents(null);
    setCheckError(null);
    load();
  }, [open]);

  useEffect(() => {
    if (checkAccountId === null && accounts.length > 0) setCheckAccountId(accounts[0].id);
  }, [accounts, checkAccountId]);

  async function handleCheckBalance() {
    if (checkAccountId === null) return;
    setCheckBusy(true);
    setCheckError(null);
    setCheckLedgerCents(null);
    const result = await window.api.reports.trialBalance({ asOfDate: checkDate });
    setCheckBusy(false);
    if (!result.ok) return setCheckError(result.error);
    const row = result.data.rows.find((r) => r.account.id === checkAccountId);
    const account = accounts.find((a) => a.id === checkAccountId);
    if (!row || !account) {
      setCheckLedgerCents(0);
      return;
    }
    const signed = account.normalBalance === 'Debit' ? row.debitCents - row.creditCents : row.creditCents - row.debitCents;
    setCheckLedgerCents(signed);
  }

  function setAmount(accountId: number, cents: number) {
    setAmounts((prev) => {
      const next = new Map(prev);
      if (cents === 0) next.delete(accountId);
      else next.set(accountId, cents);
      return next;
    });
  }

  const pending = accounts.filter((a) => (amounts.get(a.id) ?? 0) !== 0);

  // accounts arrives pre-sorted by subtype rank then code (see load()), so consecutive same-
  // subtype runs can just be collected in one pass instead of re-grouping/re-sorting here.
  const groupedAccounts = useMemo(() => {
    const groups: { subtype: string; accounts: Account[] }[] = [];
    for (const a of accounts) {
      const subtype = a.accountSubtype ?? 'Other';
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.subtype === subtype) lastGroup.accounts.push(a);
      else groups.push({ subtype, accounts: [a] });
    }
    return groups;
  }, [accounts]);

  const arControl = useMemo(
    () => allAccounts.find((account) => account.name.toLowerCase() === AR_CONTROL_NAME.toLowerCase()) ?? null,
    [allAccounts],
  );
  const apControl = useMemo(
    () => allAccounts.find((account) => account.name.toLowerCase() === AP_CONTROL_NAME.toLowerCase()) ?? null,
    [allAccounts],
  );
  const contactControl = contactKind === 'receivable' ? arControl : apControl;
  const miscContactAccount = allAccounts.find(
    (account) => account.name.toLowerCase() === (contactKind === 'receivable' ? MISC_AR_NAME : MISC_AP_NAME).toLowerCase(),
  ) ?? null;
  const contactSubaccounts = contactControl
    ? allAccounts.filter((account) => account.parentId === contactControl.id && account.id !== miscContactAccount?.id)
    : [];
  const availableContacts = contactKind === 'receivable' ? customers : vendors;

  function addContactOpening() {
    if (contactAmountCents <= 0) {
      setError(`Enter a positive ${contactKind === 'receivable' ? 'receivable' : 'payable'} opening balance.`);
      return;
    }
    if (!contactControl || !miscContactAccount) {
      setError(
        `${contactKind === 'receivable' ? 'Accounts Receivable' : 'Accounts Payable'} opening-balance accounts are missing. Close and reopen the company to create them.`,
      );
      return;
    }
    const contact = availableContacts.find((item) => item.id === contactId) ?? null;
    if (contactAccountChoice === 'create' && !contact) {
      setError(`Choose a ${contactKind === 'receivable' ? 'customer' : 'vendor'} before creating its sub-account.`);
      return;
    }
    const selectedAccountId = contactAccountChoice.startsWith('account:')
      ? Number(contactAccountChoice.slice('account:'.length))
      : miscContactAccount.id;
    setContactPending((current) => [
      ...current,
      {
        id: nextContactPendingId,
        kind: contactKind,
        contactId: contact?.id ?? null,
        contactName: contact?.name ?? null,
        accountId: contactAccountChoice === 'create' ? null : selectedAccountId,
        createSubaccount: contactAccountChoice === 'create',
        amountCents: contactAmountCents,
      },
    ]);
    setNextContactPendingId((id) => id + 1);
    setContactAmountCents(0);
    setError(null);
  }

  async function handleSaveAll() {
    if (pending.length === 0 && contactPending.length === 0) return;
    setBusy(true);
    setError(null);
    for (const account of pending) {
      const result = await postOpeningBalance({
        accountId: account.id,
        accountName: account.name,
        accountType: account.accountType,
        amountCents: amounts.get(account.id)!,
        asOfDate,
      });
      if (!result.ok) {
        setBusy(false);
        setError(`Stopped at "${account.name}": ${result.error}`);
        await load();
        onSaved();
        return;
      }
    }
    let workingAccounts = [...allAccounts];
    for (const opening of contactPending) {
      const control = opening.kind === 'receivable' ? arControl : apControl;
      if (!control) {
        setBusy(false);
        setError(`Stopped: ${opening.kind === 'receivable' ? 'Accounts Receivable' : 'Accounts Payable'} could not be resolved.`);
        await load();
        onSaved();
        return;
      }
      let postingAccount = opening.accountId === null ? null : workingAccounts.find((account) => account.id === opening.accountId) ?? null;
      if (opening.createSubaccount) {
        const accountName = contactOpeningSubaccountName(opening.contactName!, opening.kind);
        postingAccount =
          workingAccounts.find(
            (account) => account.parentId === control.id && account.name.toLowerCase() === accountName.toLowerCase(),
          ) ?? null;
        if (!postingAccount) {
          const created = await window.api.accounts.create({
            code: nextContactSubaccountCode(workingAccounts, opening.kind),
            name: accountName,
            accountType: control.accountType,
            accountSubtype: control.accountSubtype,
            parentId: control.id,
            gifiCode: control.gifiCode,
            description: `Opening-balance sub-account for ${opening.contactName}. Totals roll up to ${control.name}.`,
            isMaster: false,
          });
          if (!created.ok) {
            setBusy(false);
            setError(`Could not create "${accountName}": ${created.error}`);
            await load();
            onSaved();
            return;
          }
          postingAccount = created.data;
          workingAccounts = [...workingAccounts, created.data];
        }
      }
      if (!postingAccount) {
        setBusy(false);
        setError('Stopped: the selected A/R or A/P opening-balance account could not be resolved.');
        await load();
        onSaved();
        return;
      }
      const result = await postOpeningBalance({
        accountId: postingAccount.id,
        accountName: postingAccount.name,
        accountType: postingAccount.accountType,
        amountCents: opening.amountCents,
        asOfDate,
        customerId: opening.kind === 'receivable' ? opening.contactId : null,
        vendorId: opening.kind === 'payable' ? opening.contactId : null,
      });
      if (!result.ok) {
        setBusy(false);
        setError(`Stopped at "${postingAccount.name}": ${result.error}`);
        await load();
        onSaved();
        return;
      }
    }
    setBusy(false);
    setSuccessCount((c) => c + pending.length + contactPending.length);
    setAmounts(new Map());
    setContactPending([]);
    await load();
    onSaved();
  }

  return (
    <Modal fullScreen open={open} onClose={onClose} title="Set Opening Balances">
      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          Type the balance each account should start at — this posts automatically against an "Opening Balance Equity" account, the
          standard way to begin bookkeeping partway through an account's history. Customer receivables and vendor payables are entered
          separately below so they roll up to A/R or A/P without losing the customer/vendor detail. Leave any account at 0.00 to skip it.
        </p>
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {successCount > 0 && !error && (
          <div className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">Posted opening balances for {successCount} account(s).</div>
        )}
        <label className="block w-48 text-sm">
          <span className="text-gray-600">As Of Date</span>
          <input
            type="date" min={DATE_MIN} max={DATE_MAX}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            value={asOfDate}
            onChange={(e) => setAsOfDate(clampIsoDate(e.target.value))}
          />
        </label>

        {loading && <p className="text-sm text-gray-400">Loading accounts…</p>}

        {!loading && (
          <div className="rounded border border-blue-200 bg-blue-50 p-3">
            <h3 className="text-sm font-semibold text-blue-900">Customer A/R and Vendor A/P Opening Balances</h3>
            <p className="mt-1 text-xs text-blue-800">
              Unidentified balances post to Miscellaneous Accounts Receivable or Miscellaneous Accounts Payable. For a known customer
              or vendor, select the name and optionally create a dedicated sub-account. Every sub-account total rolls into the bold A/R
              or A/P master account, so do not enter the same balance directly in the master.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <label className="block text-sm">
                <span className="text-gray-700">Balance Type</span>
                <select
                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5"
                  value={contactKind}
                  disabled={busy}
                  onChange={(event) => {
                    setContactKind(event.target.value as ContactOpeningKind);
                    setContactId(null);
                    setContactAccountChoice('misc');
                    setContactAmountCents(0);
                  }}
                >
                  <option value="receivable">Customer owes us (A/R)</option>
                  <option value="payable">We owe vendor (A/P)</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">{contactKind === 'receivable' ? 'Customer' : 'Vendor'} (optional)</span>
                <select
                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5"
                  value={contactId ?? ''}
                  disabled={busy}
                  onChange={(event) => {
                    setContactId(event.target.value ? Number(event.target.value) : null);
                    setContactAccountChoice('misc');
                  }}
                >
                  <option value="">No name — miscellaneous</option>
                  {availableContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>{contact.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">Post To</span>
                <select
                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5"
                  value={contactAccountChoice}
                  disabled={busy}
                  onChange={(event) => setContactAccountChoice(event.target.value)}
                >
                  <option value="misc">{contactKind === 'receivable' ? MISC_AR_NAME : MISC_AP_NAME}</option>
                  {contactId !== null && contactSubaccounts.map((account) => (
                    <option key={account.id} value={`account:${account.id}`}>{account.name}</option>
                  ))}
                  <option value="create" disabled={contactId === null}>
                    + Create sub-account for selected {contactKind === 'receivable' ? 'customer' : 'vendor'}
                  </option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">Opening Balance</span>
                <div className="mt-1 flex gap-2">
                  <CurrencyInput valueCents={contactAmountCents} onChange={setContactAmountCents} disabled={busy} />
                  <button
                    type="button"
                    onClick={addContactOpening}
                    disabled={busy || contactAmountCents <= 0}
                    className="whitespace-nowrap rounded bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </label>
            </div>
            {availableContacts.length === 0 && (
              <p className="mt-2 text-xs text-amber-700">
                No active {contactKind === 'receivable' ? 'customers' : 'vendors'} yet. You can use Miscellaneous now, or add the name
                on the {contactKind === 'receivable' ? 'Customers' : 'Vendors'} page first and return here.
              </p>
            )}
            {contactPending.length > 0 && (
              <div className="mt-3 overflow-hidden rounded border border-blue-200 bg-white">
                {contactPending.map((opening) => {
                  const selectedAccount = opening.accountId === null ? null : allAccounts.find((account) => account.id === opening.accountId);
                  return (
                    <div key={opening.id} className="flex items-center justify-between gap-3 border-b border-blue-100 px-3 py-2 text-xs last:border-b-0">
                      <div>
                        <span className="font-medium text-gray-800">{opening.contactName ?? 'No name — miscellaneous'}</span>
                        <span className="ml-2 text-gray-500">
                          {opening.kind === 'receivable' ? 'A/R' : 'A/P'} · {opening.createSubaccount ? 'Create dedicated sub-account' : selectedAccount?.name ?? 'Miscellaneous'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Money cents={opening.amountCents} className="font-semibold text-gray-800" />
                        <button
                          type="button"
                          onClick={() => setContactPending((current) => current.filter((item) => item.id !== opening.id))}
                          disabled={busy}
                          className="text-red-600 hover:underline disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!loading && accounts.length === 0 && (
          <p className="text-sm text-gray-400">No other Asset, Liability, or Equity accounts are available for an opening balance.</p>
        )}

        {!loading && accounts.length > 0 && (
          <div className="max-h-[50vh] overflow-y-auto rounded border border-gray-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2 text-right">Current Balance</th>
                  <th className="px-3 py-2 text-right">Opening Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groupedAccounts.map((group) => (
                  <Fragment key={group.subtype}>
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                        {group.subtype}
                      </td>
                    </tr>
                    {group.accounts.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800">{a.name}</div>
                          {a.accountNumber && <div className="text-xs text-gray-400">{a.accountNumber}</div>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Money cents={currentBalances.get(a.id) ?? 0} className="text-gray-500" />
                        </td>
                        <td className="px-3 py-2">
                          <CurrencyInput valueCents={amounts.get(a.id) ?? 0} onChange={(cents) => setAmount(a.id, cents)} disabled={busy} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && accounts.length > 0 && (
          <div className="rounded border border-gray-200 bg-gray-50 p-3">
            <h3 className="text-sm font-semibold text-gray-800">Verify a Balance</h3>
            <p className="mt-1 text-xs text-gray-500">
              Have a number from a bank statement or your old books — an opening balance, a closing balance, any date? Type it in here
              and see how it compares to what's actually in the ledger, without doing a full reconciliation.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block text-sm">
                <span className="text-gray-600">Account</span>
                <select
                  className="mt-1 w-56 rounded border border-gray-300 bg-white px-2 py-1.5"
                  value={checkAccountId ?? ''}
                  onChange={(e) => {
                    setCheckAccountId(Number(e.target.value));
                    setCheckLedgerCents(null);
                  }}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">As Of Date</span>
                <input
                  type="date" min={DATE_MIN} max={DATE_MAX}
                  className="mt-1 w-40 rounded border border-gray-300 px-2 py-1.5"
                  value={checkDate}
                  onChange={(e) => {
                    setCheckDate(clampIsoDate(e.target.value));
                    setCheckLedgerCents(null);
                  }}
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Expected Balance</span>
                <div className="mt-1 w-32">
                  <CurrencyInput
                    valueCents={checkExpectedCents}
                    onChange={(cents) => {
                      setCheckExpectedCents(cents);
                      setCheckLedgerCents(null);
                    }}
                  />
                </div>
              </label>
              <button
                type="button"
                disabled={checkBusy || checkAccountId === null}
                onClick={handleCheckBalance}
                className="rounded-full bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
              >
                {checkBusy ? 'Checking…' : 'Check'}
              </button>
            </div>
            {checkError && <p className="mt-2 text-sm text-red-600">{checkError}</p>}
            {checkLedgerCents !== null && !checkError && (
              <div className="mt-3 grid grid-cols-3 gap-3 rounded border border-gray-200 bg-white p-3">
                <div className="text-sm">
                  <span className="block text-gray-500">Ledger Says</span>
                  <Money cents={checkLedgerCents} className="text-base font-semibold text-gray-800" />
                </div>
                <div className="text-sm">
                  <span className="block text-gray-500">You Expected</span>
                  <Money cents={checkExpectedCents} className="text-base font-semibold text-gray-800" />
                </div>
                <div className="text-sm">
                  <span className="block text-gray-500">Difference</span>
                  <Money
                    cents={checkExpectedCents - checkLedgerCents}
                    className={`text-base font-semibold ${checkExpectedCents - checkLedgerCents === 0 ? 'text-green-600' : 'text-amber-600'}`}
                  />
                </div>
                {checkExpectedCents - checkLedgerCents === 0 ? (
                  <p className="col-span-3 text-xs text-green-700">Matches — nothing to fix here.</p>
                ) : (
                  <p className="col-span-3 text-xs text-amber-700">
                    Off by ${formatCents(Math.abs(checkExpectedCents - checkLedgerCents))}. Check for a missing, duplicate, or misdated transaction
                    on this account around {checkDate}, or use Bank Reconciliation to tick off cleared transactions line by line.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-start gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Close
          </button>
          <button
            type="button"
            disabled={busy || (pending.length === 0 && contactPending.length === 0)}
            onClick={handleSaveAll}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            {busy
              ? 'Saving…'
              : pending.length + contactPending.length > 0
                ? `Save ${pending.length + contactPending.length} Balance${pending.length + contactPending.length > 1 ? 's' : ''}`
                : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
