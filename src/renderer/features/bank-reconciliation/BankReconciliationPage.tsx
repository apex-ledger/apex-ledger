import { useEffect, useState } from 'react';
import { reconcilableAccounts } from '../../utils/bankAccounts';
import type { Account, BankReconciliation } from '@shared/domain/types';
import { CurrencyInput } from '../../components/CurrencyInput';
import { Money } from '../../components/Money';
import { useUiStore } from '../../app/store/uiStore';
import { confirmDialog } from '../../app/store/confirmStore';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';

type BankReconciliationDetail = Extract<Awaited<ReturnType<typeof window.api.bankReconciliation.get>>, { ok: true }>['data'];

function today(): string {
  return localIsoDate();
}

export function BankReconciliationPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [reconciliations, setReconciliations] = useState<BankReconciliation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [detail, setDetail] = useState<BankReconciliationDetail | null>(null);
  const [statementDate, setStatementDate] = useState(today());
  const [endingBalanceCents, setEndingBalanceCents] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.api.accounts.list({ activeOnly: true }).then((r) => {
      if (!r.ok) return;
      const bankAccounts = reconcilableAccounts(r.data);
      setAccounts(bankAccounts);
      setAccountId((prev) => prev ?? bankAccounts[0]?.id ?? null);
    });
  }, []);

  async function refreshList() {
    if (accountId === null) return;
    const result = await window.api.bankReconciliation.list(accountId);
    if (result.ok) setReconciliations(result.data);
  }

  useEffect(() => {
    setActiveId(null);
    setDetail(null);
    setError(null);
    setStatementDate(today());
    setEndingBalanceCents(0);
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function loadDetail(id: number) {
    setError(null);
    const result = await window.api.bankReconciliation.get(id);
    if (!result.ok) return setError(result.error);
    setDetail(result.data);
    setActiveId(id);
  }

  const hasInProgress = reconciliations.some((r) => r.status === 'in_progress');

  async function handleStart() {
    if (accountId === null) return;
    setBusy(true);
    setError(null);
    const result = await window.api.bankReconciliation.start({ accountId, statementDate, endingBalanceCents });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDetail(result.data);
    setActiveId(result.data.reconciliation.id);
    refreshList();
  }

  async function handleToggle(lineId: number, cleared: boolean) {
    if (activeId === null) return;
    setError(null);
    const result = await window.api.bankReconciliation.toggleLine({ reconciliationId: activeId, lineId, cleared });
    if (!result.ok) return setError(result.error);
    setDetail(result.data);
  }

  async function handleComplete() {
    if (activeId === null) return;
    setBusy(true);
    setError(null);
    const result = await window.api.bankReconciliation.complete({ id: activeId });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDetail(result.data);
    refreshList();
  }

  async function handleReopen() {
    if (activeId === null || !(await confirmDialog('Reopen this completed reconciliation? Its cleared transactions stay selected so you can make the correction.'))) return;
    setBusy(true);
    setError(null);
    const result = await window.api.bankReconciliation.reopen(activeId);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDetail(result.data);
    refreshList();
  }

  async function handleAbandon() {
    if (activeId === null || !(await confirmDialog('Abandon this unfinished reconciliation? Its cleared marks will be released; no journal entries will be deleted.'))) return;
    setBusy(true);
    setError(null);
    const result = await window.api.bankReconciliation.abandon(activeId);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setActiveId(null);
    setDetail(null);
    refreshList();
  }

  if (accounts.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-semibold text-brand-900">Bank Reconciliation</h1>
        <p className="text-sm text-amber-600">Add a bank or credit card account (Chart of Accounts) before reconciling.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold text-brand-900">Bank Reconciliation</h1>
          <p className="text-sm text-gray-500">Tick off transactions that have cleared your real bank/card statement.</p>
        </div>
      </div>

      <label className="block max-w-xs text-sm">
        <span className="text-gray-600">Account</span>
        <select
          className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5"
          value={accountId ?? ''}
          onChange={(e) => setAccountId(Number(e.target.value))}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {activeId === null || detail === null ? (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800">Past Reconciliations</h2>
            {reconciliations.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">No reconciliations yet for this account.</p>
            ) : (
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="pb-2">Statement Date</th>
                    <th className="pb-2 text-right">Ending Balance</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliations.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100">
                      <td className="py-2">
                        <button type="button" onClick={() => loadDetail(r.id)} className="text-brand-600 hover:underline">
                          {r.statementDate}
                        </button>
                      </td>
                      <td className="py-2 text-right">
                        <Money cents={r.endingBalanceCents} />
                      </td>
                      <td className="py-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${r.status === 'completed' ? 'bg-green-100 text-green-800 ring-1 ring-green-200' : 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'}`}>
                          {r.status === 'completed' ? 'completed' : 'in progress'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800">Start New Reconciliation</h2>
            {hasInProgress && <p className="mt-2 text-sm text-amber-600">This account already has a reconciliation in progress — resume it above instead.</p>}
            <div className="mt-3 flex items-end gap-3">
              <label className="block text-sm">
                <span className="text-gray-600">Statement Date</span>
                <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 rounded border border-gray-300 px-2 py-1.5" value={statementDate} onChange={(e) => setStatementDate(clampIsoDate(e.target.value))} />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Statement Ending Balance</span>
                <div className="mt-1 w-36">
                  <CurrencyInput valueCents={endingBalanceCents} onChange={setEndingBalanceCents} />
                </div>
              </label>
              <button
                type="button"
                disabled={busy || hasInProgress}
                onClick={handleStart}
                className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
              >
                Start
              </button>
            </div>
          </div>
        </>
      ) : (
        <ReconciliationDetailView detail={detail} busy={busy} onBack={() => setActiveId(null)} onToggle={handleToggle} onComplete={handleComplete} onReopen={handleReopen} onAbandon={handleAbandon} />
      )}
    </div>
  );
}

function ReconciliationDetailView({
  detail,
  busy,
  onBack,
  onToggle,
  onComplete,
  onReopen,
  onAbandon,
}: {
  detail: BankReconciliationDetail;
  busy: boolean;
  onBack: () => void;
  onToggle: (lineId: number, cleared: boolean) => void;
  onComplete: () => void;
  onReopen: () => void;
  onAbandon: () => void;
}) {
  const setView = useUiStore((state) => state.setView);
  const [search, setSearch] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const { reconciliation, clearedLines, unclearedLines, clearedBalanceCents, differenceCents } = detail;
  const editable = reconciliation.status === 'in_progress';
  const rows = editable ? [...clearedLines, ...unclearedLines].sort((a, b) => a.entryDate.localeCompare(b.entryDate)) : clearedLines;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleRows = normalizedSearch
    ? rows.filter((row) => `${row.entryDate} ${row.memo ?? ''} ${row.line.debitCents / 100} ${row.line.creditCents / 100}`.toLowerCase().includes(normalizedSearch))
    : rows;
  const balanced = differenceCents === 0;

  async function setVisibleCleared(cleared: boolean) {
    const changed = visibleRows.filter((row) => (row.line.clearedAt !== null) !== cleared);
    if (changed.length === 0) return;
    setBatchBusy(true);
    for (const row of changed) await onToggle(row.line.id, cleared);
    setBatchBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-sm text-brand-600 hover:underline">
          ← Back
        </button>
        <span className={`ml-auto rounded px-2 py-0.5 text-xs ${reconciliation.status === 'completed' ? 'bg-green-100 text-green-800 ring-1 ring-green-200' : 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'}`}>
          {reconciliation.status === 'completed' ? 'completed' : 'in progress'}
        </span>
      </div>

      <div className="sticky top-0 z-10 grid grid-cols-3 gap-3 rounded border border-gray-200 bg-white p-3 shadow-sm">
        <div className="text-sm">
          <span className="block text-gray-500">Statement Balance</span>
          <span className="text-lg font-semibold text-gray-800">
            <Money cents={reconciliation.endingBalanceCents} />
          </span>
        </div>
        <div className="text-sm">
          <span className="block text-gray-500">Cleared Balance</span>
          <span className="text-lg font-semibold text-gray-800">
            <Money cents={clearedBalanceCents} />
          </span>
        </div>
        <div className="text-sm">
          <span className="block text-gray-500">Difference</span>
          <span className={`text-lg font-semibold ${balanced ? 'text-green-600' : 'text-amber-600'}`}>
            <Money cents={differenceCents} />
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search date, description or amount"
            className="min-w-64 flex-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
          />
          {editable && (
            <>
              <button type="button" disabled={batchBusy || visibleRows.length === 0} onClick={() => setVisibleCleared(true)} className="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-200 disabled:opacity-50">
                Mark visible cleared
              </button>
              <button type="button" disabled={batchBusy || visibleRows.length === 0} onClick={() => setVisibleCleared(false)} className="rounded-full bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50">
                Mark visible uncleared
              </button>
            </>
          )}
          <span className="text-xs text-gray-500">{visibleRows.length} of {rows.length} transactions</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-3 text-sm text-gray-400">No posted transactions on this account up to the statement date.</p>
        ) : visibleRows.length === 0 ? (
          <p className="p-3 text-sm text-gray-400">No reconciliation transactions match this search.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50">
              <tr>
                {editable && <th className="border-b border-gray-200 px-3 py-2" />}
                <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Date</th><EnteredTh className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600" />
                <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Description</th>
                <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Debit</th>
                <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Credit</th>
                <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Original</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const cleared = row.line.clearedAt !== null;
                return (
                  <tr key={row.line.id} className="border-b border-gray-100 last:border-0">
                    {editable && (
                      <td className="px-3 py-1.5">
                        <input type="checkbox" checked={cleared} onChange={(e) => onToggle(row.line.id, e.target.checked)} />
                      </td>
                    )}
                    <td className="px-3 py-1.5 text-gray-600">{row.entryDate}</td><EnteredTd at={row.createdAt} className="px-3 py-1.5" />
                    <td className="px-3 py-1.5 text-gray-800">{row.memo || '—'}</td>
                    <td className="px-3 py-1.5 text-right">{row.line.debitCents > 0 && <Money cents={row.line.debitCents} />}</td>
                    <td className="px-3 py-1.5 text-right">{row.line.creditCents > 0 && <Money cents={row.line.creditCents} />}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button type="button" onClick={() => setView({ kind: 'journalForm', id: row.journalEntryId })} className="whitespace-nowrap text-brand-600 hover:underline">
                        Open entry
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editable && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy || !balanced}
            onClick={onComplete}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Finish Reconciliation
          </button>
          {!balanced && <span className="text-sm text-amber-600">Tick off transactions until the difference is zero.</span>}
          <button type="button" disabled={busy} onClick={onAbandon} className="ml-auto rounded-full bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">Abandon</button>
        </div>
      )}
      {!editable && (
        <button type="button" disabled={busy} onClick={onReopen} className="rounded-full bg-amber-100 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-200 disabled:opacity-50">
          Reopen Reconciliation
        </button>
      )}
    </div>
  );
}
