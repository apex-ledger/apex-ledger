import { useEffect, useMemo, useState } from 'react';
import type { Account } from '@shared/domain/types';
import type { ReclassifyCandidate } from '../../../main/ipc/reclassify.handlers';
import { AccountCombobox } from '../../components/AccountCombobox';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { JournalEntryLink } from '../../components/JournalEntryLink';
import { EnteredTd, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';

function yearStart(): string {
  return `${localIsoDate().slice(0, 4)}-01-01`;
}

/** Move posted amounts from one account to another in one pass. Each moved line gets its own
 * adjusting entry on the original date; nothing already posted is touched. */
export function ReclassifyPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState(yearStart());
  const [dateTo, setDateTo] = useState(localIsoDate());
  const [rows, setRows] = useState<ReclassifyCandidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ moved: number; totalCents: number; entryIds: number[] } | null>(null);

  useEffect(() => {
    window.api.accounts.list({ activeOnly: true }).then((r) => r.ok && setAccounts(r.data));
  }, []);

  async function load() {
    if (fromId === null) return;
    setError(null);
    setDone(null);
    const r = await window.api.journal.reclassifyCandidates({ accountId: fromId, dateFrom, dateTo });
    if (!r.ok) return setError(r.error);
    setRows(r.data);
    setSelected(new Set());
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId, dateFrom, dateTo]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => [r.memo, r.description, r.reference, r.partyName].some((v) => v?.toLowerCase().includes(term)));
  }, [rows, search]);

  const selectedRows = rows.filter((r) => selected.has(r.lineId));
  const selectedCents = selectedRows.reduce((s, r) => s + Math.abs(r.debitCents - r.creditCents), 0);
  const options = accounts.map((a) => ({ value: String(a.id), label: a.name, sublabel: a.accountSubtype ?? a.accountType }));
  const fromName = accounts.find((a) => a.id === fromId)?.name ?? '';
  const toName = accounts.find((a) => a.id === toId)?.name ?? '';

  function toggle(id: number) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function reclassify() {
    if (toId === null || selected.size === 0) return;
    if (!window.confirm(`Move ${selected.size} line${selected.size === 1 ? '' : 's'} totalling $${(selectedCents / 100).toFixed(2)} from ${fromName} to ${toName}?\n\nEach line gets its own adjusting entry on its original date. The original entries stay as they are.`)) return;
    setBusy(true);
    setError(null);
    const r = await window.api.journal.reclassify({ lineIds: [...selected], toAccountId: toId, note: note.trim() || null });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDone(r.data);
    await load();
  }

  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Reclassify transactions</h1>
        <p className="text-sm text-gray-500">Pick the account the amounts are sitting in, tick the ones that belong elsewhere, and choose where they go. Example: six Staples receipts coded to Office Supplies were really a $1,200 printer — tick them and move them to Computer Equipment, and the fixed-asset register and the CCA claim pick them up.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        <label className="block text-sm"><span className="text-gray-600">From account</span>
          <AccountCombobox options={options} value={fromId !== null ? String(fromId) : null} onChange={(v) => setFromId(v ? Number(v) : null)} placeholder="Account the amounts are in…" accounts={accounts} onAccountCreated={(created) => { setAccounts((prev) => [...prev, created]); setFromId(created.id); }} />
        </label>
        <label className="block text-sm"><span className="text-gray-600">Move to</span>
          <AccountCombobox options={options} value={toId !== null ? String(toId) : null} onChange={(v) => setToId(v ? Number(v) : null)} placeholder="Account they belong in…" accounts={accounts} addNewLabel="+ New account" onAccountCreated={(created) => { setAccounts((prev) => [...prev, created]); setToId(created.id); }} />
        </label>
        <label className="block text-sm"><span className="text-gray-600">From date</span><DateInput value={dateFrom} onChange={setDateFrom} className="mt-1 w-full" /></label>
        <label className="block text-sm"><span className="text-gray-600">To date</span><DateInput value={dateTo} onChange={setDateTo} className="mt-1 w-full" /></label>
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {done && (
        <div className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Moved {done.moved} line{done.moved === 1 ? '' : 's'}, <Money cents={done.totalCents} />, to {toName}. Adjusting entries: {done.entryIds.map((id, i) => <span key={id}>{i > 0 ? ', ' : ''}<JournalEntryLink id={id} label={`#${id}`} /></span>)}.
        </div>
      )}
      {fromId !== null && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by memo, description, name or reference…" className="w-80 rounded border border-gray-300 px-3 py-1.5 text-sm" />
            <button type="button" onClick={() => setSelected(new Set(visible.map((r) => r.lineId)))} className="text-xs font-medium text-brand-700 hover:underline">Select all shown</button>
            <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-medium text-gray-600 hover:underline">Clear</button>
            <span className="text-xs text-gray-500">{selected.size} selected · <Money cents={selectedCents} /></span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (goes on every entry, optional)" className="ml-auto w-72 rounded border border-gray-300 px-3 py-1.5 text-sm" />
            <button type="button" disabled={busy || toId === null || selected.size === 0 || toId === fromId} onClick={() => void reclassify()} className="rounded-full bg-brand-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
              {busy ? 'Moving…' : `Move ${selected.size} to ${toName || '…'}`}
            </button>
          </div>
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="w-8 px-3 py-2" /><th className="px-3 py-2">Date</th><EnteredTh className="px-3 py-2" /><th className="px-3 py-2">Memo / description</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Ref</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody>
                {visible.length === 0 && <tr><td colSpan={9} className="px-3 py-4 text-center text-gray-400">No posted lines in {fromName} for this range.</td></tr>}
                {visible.map((r) => (
                  <tr key={r.lineId} className={`border-t border-gray-100 ${selected.has(r.lineId) ? 'bg-brand-50' : ''}`}>
                    <td className="px-3 py-1.5"><input type="checkbox" checked={selected.has(r.lineId)} onChange={() => toggle(r.lineId)} aria-label={`Select line ${r.lineId}`} /></td>
                    <td className="px-3 py-1.5 tabular-nums text-gray-600">{r.entryDate}</td><EnteredTd at={r.createdAt} className="px-3 py-1.5" />
                    <td className="px-3 py-1.5 text-gray-800">{r.description || r.memo || '—'}{r.description && r.memo && r.description !== r.memo ? <span className="ml-1 text-xs text-gray-400">{r.memo}</span> : null}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.partyName ?? '—'}</td>
                    <td className="px-3 py-1.5 text-gray-500">{r.reference ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.debitCents ? <Money cents={r.debitCents} /> : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.creditCents ? <Money cents={r.creditCents} /> : ''}</td>
                    <td className="px-3 py-1.5 text-right"><JournalEntryLink id={r.entryId} label="Open" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
