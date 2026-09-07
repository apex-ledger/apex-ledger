import { useEffect, useRef, useState } from 'react';
import type { Account, AccountType } from '@shared/domain/types';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { Table, type TableColumn } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { buildAccountTree, rollUpBalances } from '@shared/domain/ledger/accountTree';
import { KNOWN_SUBTYPES } from '@shared/domain/ledger/accountPresets';
import { Money } from '../../components/Money';
import { CommandCentreSection, FlowArrow, FlowBox, FlowRow } from '../../components/CommandCentreFlow';
import { AccountFormModal } from './AccountFormModal';
import { OpeningBalancesModal } from './OpeningBalancesModal';
import { capitalizeWords, suggestOnBlur } from '../../utils/textCase';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { suggestionListId } from '../../utils/textSuggestions';
import { useUiStore } from '../../app/store/uiStore';
import { ReportActions } from '../../components/ReportActions';
import { localIsoDate } from '@shared/domain/dates/localDate';

const ACCOUNT_TYPES: (AccountType | 'All')[] = ['All', 'Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

/** Controlled editor for the real bank/card account reference shown in the Chart of Accounts.
 *
 * The old uncontrolled input wrote only on blur and then relied on a list reload to refresh its
 * defaultValue. That gave no visible save state and could leave the cell showing a stale value
 * even after the database returned the saved account. Enter now commits through the same blur
 * path, Escape restores the saved value, and the controlled value follows the refreshed row. */
export function AccountNumberCell({
  account,
  className,
  onSave,
}: {
  account: Account;
  className: string;
  onSave: (value: string | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(account.accountNumber ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(account.accountNumber ?? ''), [account.accountNumber]);

  async function commit() {
    const next = draft.trim() || null;
    if (next === (account.accountNumber ?? null) || saving) return;
    setSaving(true);
    await onSave(next);
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-1">
      <input
        className={className}
        value={draft}
        placeholder="—"
        aria-label={`Account number for ${account.name}`}
        disabled={saving}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(account.accountNumber ?? '');
            e.currentTarget.blur();
          }
        }}
      />
      {saving && <span className="shrink-0 text-[11px] text-gray-400">Saving…</span>}
    </div>
  );
}

/**
 * Every business transaction is recorded against these five account types — there are no others in
 * double-entry bookkeeping. The blurb is the one-line "what goes here" a bookkeeper needs when
 * deciding where a transaction belongs.
 */
const ACCOUNT_TYPE_BLURB: Record<AccountType, string> = {
  Asset: 'What the business owns — bank, receivables, inventory, equipment',
  Liability: 'What it owes — payables, loans, GST/HST and payroll owing',
  Equity: "The owners' stake — share capital, retained earnings, draws",
  Revenue: 'What it earns — sales, fees, interest income',
  Expense: 'What it costs to operate — wages, rent, supplies, fees',
};

const ACCOUNT_TYPE_STYLES: Record<AccountType, string> = {
  Asset: 'border-emerald-200 bg-emerald-50/60',
  Liability: 'border-amber-200 bg-amber-50/60',
  Equity: 'border-violet-200 bg-violet-50/60',
  Revenue: 'border-sky-200 bg-sky-50/60',
  Expense: 'border-rose-200 bg-rose-50/60',
};

function todayIso(): string {
  return localIsoDate();
}

/** Saves the whole current Chart of Accounts as a reusable template — the same list then shows up
 * when creating a new client company, or loading a starter set into an existing one, in Company
 * Settings. Matches the "save as template" pattern accountants know from QuickBooks. */
function SaveTemplateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleClose() {
    setLabel('');
    setDescription('');
    setError(null);
    setSaved(false);
    onClose();
  }

  async function handleSave() {
    if (!label.trim()) return setError('Template name is required.');
    setBusy(true);
    setError(null);
    const result = await window.api.accounts.saveAsTemplate({ label: capitalizeWords(label.trim()), description: capitalizeWords(description.trim()) });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
  }

  return (
    <Modal open={open} onClose={handleClose} title="Save as Template">
      {saved ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Saved "{label}" as a template. It'll now show up as a starting Chart of Accounts option when you create a new client company, or when
            loading a template into an existing one from Company Settings.
          </p>
          <button type="button" onClick={handleClose} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200">
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Saves every active account in this company's Chart of Accounts as a reusable template you can load into future client companies.
          </p>
          {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <label className="block text-sm">
            <span className="text-gray-600">Template Name</span>
            <input
              autoFocus
              list={suggestionListId('coa-template-name')}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={suggestOnBlur('coa-template-name', setLabel)}
              placeholder="e.g. My Standard Retail Template"
            />
            <SuggestionDatalist fieldKey="coa-template-name" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Description (optional)</span>
            <input
              list={suggestionListId('coa-template-description')}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={suggestOnBlur('coa-template-description', setDescription)}
            />
            <SuggestionDatalist fieldKey="coa-template-description" />
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
      )}
    </Modal>
  );
}

/** The per-row Action menu: the handful of things you do TO an account, gathered in one place
 * instead of spread between a row click, a hover button, and the form. "Account history" sits
 * outside the menu as its own link because it is the one people reach for constantly. */
function AccountActionMenu({
  account,
  onEdit,
  onCreateSubaccount,
  onToggleActive,
  onRunReport,
}: {
  account: Account;
  onEdit: () => void;
  onCreateSubaccount: () => void;
  onToggleActive: () => void;
  onRunReport: () => void;
}) {
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

  const items = [
    { label: 'Edit', run: onEdit },
    { label: 'Create sub-account', run: onCreateSubaccount },
    { label: account.isActive ? 'Make inactive' : 'Make active', run: onToggleActive },
    { label: 'Run report', run: onRunReport },
  ];

  return (
    <div ref={containerRef} className="relative flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={onRunReport} className="text-sm text-brand-700 hover:underline">
        Account history
      </button>
      <button
        type="button"
        aria-label={`Actions for ${account.name}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`rounded border px-1.5 py-0.5 text-xs ${open ? 'border-gray-400 bg-gray-100' : 'border-transparent hover:border-gray-300'}`}
      >
        ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded border border-gray-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-brand-50"
              onClick={() => {
                setOpen(false);
                item.run();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChartOfAccountsPage() {
  // Anything on this screen can be taken to a spreadsheet, same as a report.
  const exportRef = useRef<HTMLDivElement>(null);
  const setView = useUiStore((s) => s.setView);
  const view = useUiStore((s) => s.view);
  const [typeFilter, setTypeFilter] = useState<AccountType | 'All'>('All');
  const [search, setSearch] = useState('');
  const pendingSearchTerm = useUiStore((s) => s.pendingSearchTerm);
  const setPendingSearchTerm = useUiStore((s) => s.setPendingSearchTerm);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [subaccountParent, setSubaccountParent] = useState<Account | null>(null);
  const [renamingId, setRenameId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  // Arriving here right after creating a brand-new company (see the View type's own doc comment)
  // starts with the modal already open, every starter account from the Chart of Accounts template
  // ready to prefill — not a flag the reviewer would otherwise think to go looking for.
  const [showOpeningBalances, setShowOpeningBalances] = useState(
    view.kind === 'chartOfAccounts' && view.openOpeningBalances === true,
  );

  useEffect(() => {
    if (!pendingSearchTerm) return;
    setSearch(pendingSearchTerm);
    setPendingSearchTerm(null);
  }, [pendingSearchTerm, setPendingSearchTerm]);

  const { data: accounts, loading, error, reload } = useIpcQuery(
    () =>
      window.api.accounts.list({
        activeOnly: !showInactive,
        accountType: typeFilter === 'All' ? undefined : typeFilter,
        search: search || undefined,
      }),
    [typeFilter, search, showInactive],
  );

  // Current balance per account, and the current year's Net Income — the same figures the Balance
  // Sheet report computes, surfaced right here so browsing the Chart of Accounts doesn't require
  // running a separate report to see what an account (or the business) is actually sitting at.
  // Net Income itself is never a real account row — it's Revenue minus Expense to date, closed to
  // Retained Earnings only at year-end — so it's shown as a summary card, not mixed into the table.
  const { data: balanceSheetData } = useIpcQuery(() => window.api.reports.balanceSheet({ asOfDate: todayIso() }), []);
  const { data: trialBalanceData } = useIpcQuery(() => window.api.reports.trialBalance({ asOfDate: todayIso() }), []);
  const { data: foreignBalances } = useIpcQuery(() => window.api.fx.foreignBalances({}), []);
  const foreignByAccountId = new Map((foreignBalances ?? []).map((b) => [b.accountId, b]));
  const balancesByAccountId = new Map(
    (trialBalanceData?.rows ?? []).map((row) => [
      row.account.id,
      row.account.normalBalance === 'Debit' ? row.debitCents - row.creditCents : row.creditCents - row.debitCents,
    ]),
  );
  const netIncomeCents = balanceSheetData?.equity.lines.find((l) => l.account.id === -1)?.amountCents ?? null;

  // Deliberately unfiltered: the summary counts the whole chart, so the numbers don't move around as
  // the search box and type filter below are used.
  const { data: allAccounts } = useIpcQuery(() => window.api.accounts.list({ activeOnly: true }), []);
  // Backs the GIFI cell's picker and the check that a typed code is a real one.
  const { data: gifiCodes } = useIpcQuery(() => window.api.gifi.list(), []);
  const gifiCodeSet = new Set((gifiCodes ?? []).map((g) => g.code));
  // "Active" here means the account actually carries a balance as at today, which is the closest
  // honest proxy the trial balance gives for "used in business transactions" — an account whose
  // postings happen to net to zero won't be counted.
  const accountIdsWithBalance = new Set(
    (trialBalanceData?.rows ?? []).filter((row) => row.debitCents !== 0 || row.creditCents !== 0).map((row) => row.account.id),
  );
  const typeSummary = (['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as AccountType[]).map((type) => {
    const ofType = (allAccounts ?? []).filter((a) => a.accountType === type);
    return { type, total: ofType.length, withBalance: ofType.filter((a) => accountIdsWithBalance.has(a.id)).length };
  });

  const accountsById = new Map((accounts ?? []).map((a) => [a.id, a]));

  // Renaming in place. The name is the one field that gets corrected constantly (a typo, a
  // vendor rebrands, "Cheque-0542" wants to read "Chequing (0542)"), and opening the whole
  // account form to change one word is friction. Everything else still goes through the form,
  // because account type drives normalBalance and is deliberately not editable after creation.
  function startRename(a: Account) {
    setRenameId(a.id);
    setRenameValue(a.name);
    setRenameError(null);
  }
  function cancelRename() {
    setRenameId(null);
    setRenameValue('');
    setRenameError(null);
  }
  async function commitRename(a: Account) {
    const next = capitalizeWords(renameValue.trim());
    if (!next || next === a.name) return cancelRename();
    setRenameBusy(true);
    const result = await window.api.accounts.update({ id: a.id, patch: { name: next } });
    setRenameBusy(false);
    if (!result.ok) {
      // Kept on screen rather than silently reverting, so a duplicate-name rejection is visible.
      setRenameError(`Could not rename "${a.name}": ${result.error}`);
      setRenameId(null);
      return;
    }
    cancelRename();
    reload();
  }

  /** Writes one field of one account straight from its cell.
   *
   * Rename already worked this way; this is the same contract for every other editable column, so
   * the whole row can be corrected in place instead of only its name. A rejected write is surfaced
   * rather than silently reverted — a duplicate code is the usual cause and the user needs to see
   * why nothing changed. */
  async function patchAccount(a: Account, patch: Record<string, unknown>, describe: string) {
    setRenameBusy(true);
    const result = await window.api.accounts.update({ id: a.id, patch });
    setRenameBusy(false);
    if (!result.ok) {
      setRenameError(`Could not change ${describe} on "${a.name}": ${result.error}`);
      return false;
    }
    setRenameError(null);
    reload();
    return true;
  }

  /** Shared look for an in-cell editor: invisible until hovered or focused, so the table still
   * reads as a table rather than as a wall of input boxes. */
  const cellInput =
    'w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm hover:border-gray-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500';

  // Sub-accounts sit directly under their parent and indent, and a parent shows the total of
  // everything beneath it — the shape anyone coming from QuickBooks expects. Both come from pure
  // helpers in shared/domain/ledger so the reports can reuse them; see accountTree.ts.
  const tree = buildAccountTree(accounts ?? []);
  const orderedAccounts = tree.map((n) => n.account);
  const depthById = new Map(tree.map((n) => [n.account.id, n.depth]));
  const hasChildrenById = new Map(tree.map((n) => [n.account.id, n.hasChildren]));
  const rolledBalances = rollUpBalances(accounts ?? [], balancesByAccountId);

  const columns: TableColumn<Account>[] = [
    // No Code column: the account's code orders the reports but is not something to read
    // beside every name. It is edited in the account's own form instead.
    {
      key: 'name',
      header: 'Name',
      render: (a) => {
        const depth = depthById.get(a.id) ?? 0;
        const isParent = hasChildrenById.get(a.id) ?? false;
        // Bold begins when the first sub-account exists, so the visual treatment reflects a real
        // roll-up rather than merely a master flag that has not been used yet.
        const isMaster = isParent;
        const isEditing = renamingId === a.id;
        return (
          <div style={{ paddingLeft: depth * 18 }} className="group flex items-center gap-1.5">
            {depth > 0 && <span className="flex-shrink-0 text-gray-300">↳</span>}
            {isEditing ? (
              <input
                autoFocus
                className="w-full min-w-0 rounded border border-brand-400 px-1.5 py-0.5 text-sm"
                value={renameValue}
                disabled={renameBusy}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void commitRename(a); }
                  if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                }}
                onBlur={() => void commitRename(a)}
              />
            ) : (
              <>
                <button
                  type="button"
                  title="Click to rename"
                  onClick={(e) => { e.stopPropagation(); startRename(a); }}
                  className={`truncate rounded px-1 text-left hover:bg-brand-50 ${isMaster ? 'font-bold text-brand-900' : ''}`}
                >
                  {a.name}
                </button>
                {isMaster && <span className="flex-shrink-0 text-xs font-semibold text-brand-600">(master · rolls up)</span>}
                <button
                  type="button"
                  title={`Add a sub-account under ${a.name}`}
                  onClick={(e) => { e.stopPropagation(); setSubaccountParent(a); setEditing(null); setShowForm(true); }}
                  className="flex-shrink-0 rounded px-1.5 text-xs text-brand-700 opacity-0 transition-opacity hover:bg-brand-50 group-hover:opacity-100"
                >
                  + sub-account
                </button>
              </>
            )}
          </div>
        );
      },
    },
    {
      key: 'accountNumber',
      header: 'Account #',
      render: (a) => (
        <AccountNumberCell
          account={a}
          className={cellInput}
          onSave={(accountNumber) => patchAccount(a, { accountNumber }, 'the account number')}
        />
      ),
    },
    { key: 'type', header: 'Type', render: (a) => a.accountType },
    {
      key: 'subtype',
      header: 'Subtype',
      render: (a) => (
        <select
          className={cellInput}
          value={a.accountSubtype ?? ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => void patchAccount(a, { accountSubtype: e.target.value || null }, 'the subtype')}
        >
          <option value="">—</option>
          {/* Only the classifications the reports actually branch on, plus whatever this account
              already carries, so an old free-typed value is not silently wiped by opening the list. */}
          {[...new Set([...KNOWN_SUBTYPES, ...(a.accountSubtype ? [a.accountSubtype] : [])])].map((subtype) => (
            <option key={subtype} value={subtype}>
              {subtype}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      render: (a) =>
        rolledBalances.has(a.id) && (rolledBalances.get(a.id) !== 0 || balancesByAccountId.has(a.id)) ? (
          <div className="flex flex-col items-end">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setView({ kind: 'report', report: 'generalLedger', drillDown: { accountId: a.id } });
              }}
              className="tabular-nums text-brand-700 hover:underline"
              title="See every posted transaction behind this balance — click through to correct one"
            >
              <Money cents={rolledBalances.get(a.id)!} />
            </button>
            {foreignByAccountId.has(a.id) && (
              <span className="text-xs font-medium text-sky-700" title="Balance in the account's own currency">{foreignByAccountId.get(a.id)!.currency} {(foreignByAccountId.get(a.id)!.foreignCents / 100).toFixed(2)}</span>
            )}
            {(hasChildrenById.get(a.id) ?? false) && balancesByAccountId.get(a.id) ? (
              <span className="text-xs text-gray-400" title="Posted directly to this account, before its sub-accounts">
                own <Money cents={balancesByAccountId.get(a.id)!} />
              </span>
            ) : null}
          </div>
        ) : (
          // Zero balance is not the same as no history: an account whose entries net to nil still
          // has entries, and leaving a dash here was the only place in the app with no way through
          // to them.
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setView({ kind: 'report', report: 'generalLedger', drillDown: { accountId: a.id } });
            }}
            className="tabular-nums text-gray-400 hover:text-brand-700 hover:underline"
            title="See every posted transaction on this account"
          >
            <Money cents={0} />
          </button>
        ),
    },
    {
      key: 'gifi',
      header: 'GIFI Code',
      render: (a) => (
        <div className="flex items-center gap-1.5">
          <input
            className={`${cellInput} tabular-nums`}
            defaultValue={a.gifiCode ?? ''}
            placeholder="—"
            list="gifi-code-options"
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const next = e.target.value.trim() || null;
              if (next === (a.gifiCode ?? null)) return;
              // A GIFI code that isn't in the CRA list would quietly break the T2 export, so it is
              // refused here instead of being stored and failing at filing time.
              if (next && !gifiCodeSet.has(next)) {
                setRenameError(`"${next}" is not a CRA GIFI code. Leave it blank if this account has no mapping.`);
                e.target.value = a.gifiCode ?? '';
                return;
              }
              void patchAccount(a, { gifiCode: next }, 'the GIFI code').then((ok) => {
                if (!ok) e.target.value = a.gifiCode ?? '';
              });
            }}
          />
          {!a.gifiCode && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Unmapped</span>}
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (a) => (
        <AccountActionMenu
          account={a}
          onEdit={() => {
            setEditing(a);
            setShowForm(true);
          }}
          onCreateSubaccount={() => {
            setEditing(null);
            setSubaccountParent(a);
            setShowForm(true);
          }}
          onToggleActive={() => void patchAccount(a, { isActive: !a.isActive }, 'the status')}
          onRunReport={() => setView({ kind: 'report', report: 'generalLedger', drillDown: { accountId: a.id } })}
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => (
        <select
          className={cellInput}
          value={a.isActive ? 'active' : 'inactive'}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => void patchAccount(a, { isActive: e.target.value === 'active' }, 'the status')}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      ),
    },
  ];

  return (
    <div ref={exportRef}>
      <ReportActions targetRef={exportRef} reportName="Chart of Accounts" />
    <div>
      <div className="mb-3">
        <CommandCentreSection title="Accounts Workflow">
          {/* Four steps on one line instead of two stacked rows — half the vertical space, and the
              chart of accounts below is the point of this page. */}
          <FlowRow nowrap>
            <FlowBox label="Record Journal Entry" tone="sky" onClick={() => setView({ kind: 'journalForm', id: 'new' })} />
            <FlowBox label="Transfer Money" tone="cyan" onClick={() => setView({ kind: 'quickEntry', type: 'transfer' })} />
            <FlowArrow />
            <FlowBox label="General Ledger" tone="amber" onClick={() => setView({ kind: 'report', report: 'generalLedger' })} />
            <FlowBox label="Audit Log" tone="violet" onClick={() => setView({ kind: 'audit' })} />
          </FlowRow>
        </CommandCentreSection>
      </div>

      <div className="mb-3">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-600">Account types used for business transactions</h2>
          <span className="text-xs text-gray-400">
            {typeSummary.reduce((sum, t) => sum + t.total, 0)} accounts · {typeSummary.reduce((sum, t) => sum + t.withBalance, 0)} carrying a balance
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {typeSummary.map((t) => (
            <button
              key={t.type}
              type="button"
              // Doubles as a filter — clicking a type narrows the table below to it, and clicking the
              // active one clears back to All.
              onClick={() => setTypeFilter(typeFilter === t.type ? 'All' : t.type)}
              title={ACCOUNT_TYPE_BLURB[t.type]}
              className={`rounded-xl2 border p-2.5 text-left duration-250 ease-standard hover:-translate-y-0.5 hover:shadow-soft ${ACCOUNT_TYPE_STYLES[t.type]} ${
                typeFilter === t.type ? 'ring-2 ring-brand-400' : ''
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-700">{t.type}</span>
                <span className="text-base font-bold text-gray-800">{t.total}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-gray-500">{t.withBalance} with a balance</div>
              <div className="mt-1 text-[11px] leading-snug text-gray-400">{ACCOUNT_TYPE_BLURB[t.type]}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setSubaccountParent(null);
            setShowForm(true);
          }}
          className="rounded-full bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-200"
        >
          + New Account
        </button>
        <button
          type="button"
          onClick={() => setShowOpeningBalances(true)}
          className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Set Opening Balances
        </button>
        <button
          type="button"
          onClick={() => setShowSaveTemplate(true)}
          className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Save as Template
        </button>
        <input
          className="w-64 rounded border border-gray-300 px-3 py-1.5 text-sm"
          placeholder="Search accounts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as AccountType | 'All')}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {netIncomeCents !== null && (typeFilter === 'All' || typeFilter === 'Equity') && (
        <div className="mb-3 flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <span className="text-gray-600">
            Net Income (current year, to date) — Revenue less Expense, closed to Retained Earnings only at year-end. Not a postable
            account, so it never appears as a row below.
          </span>
          <Money cents={netIncomeCents} className="ml-3 flex-shrink-0 font-semibold tabular-nums text-gray-800" />
        </div>
      )}

      {renameError && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{renameError}</span>
          <button type="button" onClick={() => setRenameError(null)} className="flex-shrink-0 text-red-500 hover:text-red-800" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {accounts && (
        <>
        <datalist id="gifi-code-options">
          {(gifiCodes ?? []).map((g) => (
            <option key={g.code} value={g.code}>
              {g.description}
            </option>
          ))}
        </datalist>
        <Table
          columns={columns}
          rows={orderedAccounts}
          rowKey={(a) => a.id}
          onRowClick={(a) => {
            setEditing(a);
            setShowForm(true);
          }}
          emptyMessage="No accounts yet. Create one or load a starter template from Company Settings."
        />
        </>
      )}

      <AccountFormModal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setSubaccountParent(null);
        }}
        onSaved={reload}
        account={editing}
        initialParent={subaccountParent}
        onAddSubaccount={(parent) => {
          setEditing(null);
          setSubaccountParent(parent);
        }}
      />
      <SaveTemplateModal open={showSaveTemplate} onClose={() => setShowSaveTemplate(false)} />
      <OpeningBalancesModal open={showOpeningBalances} onClose={() => setShowOpeningBalances(false)} onSaved={reload} />
    </div>
    </div>
  );
}
