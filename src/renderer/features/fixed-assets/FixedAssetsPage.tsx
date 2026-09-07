import { useEffect, useMemo, useState } from 'react';
import type { Account } from '@shared/domain/types';
import { CCA_CLASS_OPTIONS, DEPRECIATION_METHOD_LABELS, type DepreciationMethod } from '@shared/domain/assets/fixedAssets';
import type { FixedAssetRow } from '../../../main/ipc/fixedAssets.handlers';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { Combobox } from '../../components/Combobox';
import { CurrencyInput } from '../../components/CurrencyInput';
import { JournalEntryLink } from '../../components/JournalEntryLink';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { useUiStore } from '../../app/store/uiStore';

const field = 'mt-1 w-full rounded border border-gray-300 px-2 py-1.5';

type Draft = {
  id?: number;
  name: string;
  description: string;
  assetAccountId: number | null;
  accumulatedDepreciationAccountId: number | null;
  depreciationExpenseAccountId: number | null;
  costCents: number;
  salvageCents: number;
  acquiredDate: string;
  inServiceDate: string;
  method: DepreciationMethod;
  usefulLifeMonths: number;
  decliningRate: number;
  ccaClass: string;
  serialNumber: string;
  location: string;
  notes: string;
};

const blank = (): Draft => ({ name: '', description: '', assetAccountId: null, accumulatedDepreciationAccountId: null, depreciationExpenseAccountId: null, costCents: 0, salvageCents: 0, acquiredDate: localIsoDate(), inServiceDate: localIsoDate(), method: 'straightLine', usefulLifeMonths: 60, decliningRate: 0.2, ccaClass: '', serialNumber: '', location: '', notes: '' });

/** The register: every capital asset with cost, what has been depreciated, and book value; a
 * monthly depreciation run that posts the journal; and disposal with gain or loss. */
export function FixedAssetsPage() {
  const refreshNonce = useUiStore((s) => s.refreshNonce);
  const [assets, setAssets] = useState<FixedAssetRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [disposing, setDisposing] = useState<FixedAssetRow | null>(null);
  const [scheduleFor, setScheduleFor] = useState<FixedAssetRow | null>(null);
  const [schedule, setSchedule] = useState<{ rows: Array<{ month: string; amountCents: number; accumulatedCents: number; bookValueCents: number }>; postedMonths: string[] } | null>(null);
  const [throughMonth, setThroughMonth] = useState(localIsoDate().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDisposed, setShowDisposed] = useState(false);

  function reload() {
    window.api.fixedAssets.list().then((r) => (r.ok ? setAssets(r.data) : setError(r.error)));
  }
  useEffect(() => {
    reload();
    window.api.accounts.list().then((r) => r.ok && setAccounts(r.data));
  }, [refreshNonce]);

  const assetAccounts = useMemo(() => accounts.filter((a) => a.accountType === 'Asset').map((a) => ({ value: String(a.id), label: a.name, sublabel: a.accountSubtype ?? undefined })), [accounts]);
  const expenseAccounts = useMemo(() => accounts.filter((a) => a.accountType === 'Expense').map((a) => ({ value: String(a.id), label: a.name })), [accounts]);
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const visible = assets.filter((a) => showDisposed || a.status === 'active');
  const totals = visible.reduce((t, a) => ({ cost: t.cost + a.costCents, acc: t.acc + a.accumulatedCents, book: t.book + a.bookValueCents, next: t.next + a.nextMonthlyCents }), { cost: 0, acc: 0, book: 0, next: 0 });
  const behind = assets.filter((a) => a.status === 'active' && (a.lastPostedMonth ?? '') < throughMonth && a.inServiceDate.slice(0, 7) <= throughMonth && a.nextMonthlyCents > 0).length;

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const r = await window.api.fixedAssets.save({
      ...editing,
      description: editing.description || null,
      ccaClass: editing.ccaClass || null,
      serialNumber: editing.serialNumber || null,
      location: editing.location || null,
      notes: editing.notes || null,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setEditing(null);
    reload();
  }

  async function runDepreciation() {
    setBusy(true);
    setError(null);
    const r = await window.api.fixedAssets.runDepreciation({ throughMonth });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const locked = r.data.skippedLocked.length > 0 ? ` Skipped ${r.data.skippedLocked.join(', ')}: those months are in a locked period — post them as adjusting entries if they belong there.` : '';
    setNotice((r.data.postedMonths === 0 ? 'Nothing to post — every open month through the chosen one is already in the books.' : `Posted ${r.data.postedMonths} month${r.data.postedMonths === 1 ? '' : 's'} of depreciation for ${r.data.assets} asset${r.data.assets === 1 ? '' : 's'}.`) + locked);
    reload();
  }

  async function openSchedule(a: FixedAssetRow) {
    setScheduleFor(a);
    setSchedule(null);
    const r = await window.api.fixedAssets.schedule(a.id);
    if (r.ok) setSchedule(r.data);
  }

  function edit(a: FixedAssetRow) {
    setEditing({ id: a.id, name: a.name, description: a.description ?? '', assetAccountId: a.assetAccountId, accumulatedDepreciationAccountId: a.accumulatedDepreciationAccountId, depreciationExpenseAccountId: a.depreciationExpenseAccountId, costCents: a.costCents, salvageCents: a.salvageCents, acquiredDate: a.acquiredDate, inServiceDate: a.inServiceDate, method: a.method, usefulLifeMonths: a.usefulLifeMonths, decliningRate: a.decliningRate, ccaClass: a.ccaClass ?? '', serialNumber: a.serialNumber ?? '', location: a.location ?? '', notes: a.notes ?? '' });
  }

  return (
    <div className="space-y-3 p-3" data-testid="fixed-assets">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Fixed Assets</h1>
          <p className="text-sm text-gray-500">Capital assets, book depreciation posted monthly, and disposals. Tax CCA stays on the CCA Schedule.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="text-xs text-gray-600">
            Post depreciation through
            <input type="month" className="ml-1 rounded border border-gray-300 px-2 py-1 text-sm" value={throughMonth} max={localIsoDate().slice(0, 7)} onChange={(e) => setThroughMonth(e.target.value)} />
          </label>
          <button type="button" disabled={busy || behind === 0} onClick={runDepreciation} className="rounded-full bg-brand-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50" title={behind === 0 ? 'All assets are depreciated through this month' : undefined}>
            Run depreciation{behind > 0 ? ` (${behind})` : ''}
          </button>
          <button type="button" onClick={() => setEditing(blank())} className="rounded-full bg-brand-100 px-4 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-200">
            + Add asset
          </button>
        </div>
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Cost" cents={totals.cost} />
        <Card label="Accumulated depreciation" cents={totals.acc} />
        <Card label="Net book value" cents={totals.book} emphasis />
        <Card label="Next month's depreciation" cents={totals.next} />
      </div>

      <div className="rounded border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
          <span className="text-sm font-semibold text-gray-800">Register <span className="ml-1 text-xs font-normal text-gray-400">{visible.length}</span></span>
          <label className="flex items-center gap-1 text-xs text-gray-500"><input type="checkbox" checked={showDisposed} onChange={(e) => setShowDisposed(e.target.checked)} /> Show disposed</label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Asset</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">In service</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">CCA</th>
                <th className="px-3 py-2 text-right">Cost</th>
                <th className="px-3 py-2 text-right">Accumulated</th>
                <th className="px-3 py-2 text-right">Book value</th>
                <th className="px-3 py-2">Posted to</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-5 text-center text-sm text-gray-400">No assets yet. Add the equipment, vehicles, computers and improvements the business owns.</td></tr>
              )}
              {visible.map((a) => (
                <tr key={a.id} className={a.status === 'disposed' ? 'bg-gray-50 text-gray-400' : ''}>
                  <td className="px-3 py-1.5">
                    <div className="font-medium text-gray-900">{a.name}{a.status === 'disposed' && <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] uppercase text-gray-600">disposed {a.disposedDate}</span>}</div>
                    {(a.serialNumber || a.location) && <div className="text-xs text-gray-400">{[a.serialNumber, a.location].filter(Boolean).join(' · ')}</div>}
                  </td>
                  <td className="px-3 py-1.5 text-gray-600">{accountName.get(a.assetAccountId) ?? a.assetAccountId}</td>
                  <td className="px-3 py-1.5 tabular-nums">{a.inServiceDate}</td>
                  <td className="px-3 py-1.5 text-gray-600">{DEPRECIATION_METHOD_LABELS[a.method]} · {a.method === 'straightLine' ? `${a.usefulLifeMonths} mo` : `${Math.round(a.decliningRate * 100)}%`}</td>
                  <td className="px-3 py-1.5 text-gray-600">{a.ccaClass ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums"><Money cents={a.costCents} /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums"><Money cents={a.accumulatedCents} /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium"><Money cents={a.bookValueCents} /></td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-600">{a.lastPostedMonth ?? '—'}{a.status === 'active' && a.nextMonthlyCents > 0 && (a.lastPostedMonth ?? '') < throughMonth ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">behind</span> : null}</td>
                  <td className="px-3 py-1.5 text-right text-xs">
                    <button type="button" onClick={() => openSchedule(a)} className="mr-2 text-brand-600 hover:underline">Schedule</button>
                    <button type="button" onClick={() => edit(a)} className="mr-2 text-brand-600 hover:underline">Edit</button>
                    {a.status === 'active' ? (
                      <button type="button" onClick={() => setDisposing(a)} className="text-amber-700 hover:underline">Dispose</button>
                    ) : (
                      a.disposalJournalEntryId && <JournalEntryLink id={a.disposalJournalEntryId} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? `Asset — ${editing.name}` : 'New asset'} wide
          footer={<>
            <button type="button" onClick={() => setEditing(null)} className="rounded-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
            <button type="button" disabled={busy || !editing.name.trim() || editing.assetAccountId === null || editing.costCents <= 0} onClick={save} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50">Save asset</button>
          </>}>
          <div className="grid grid-cols-3 gap-3 text-sm" data-testid="asset-form">
            <label className="col-span-2 block"><span className="text-gray-600">Name</span><input className={field} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label className="block"><span className="text-gray-600">CCA class (for tax)</span>
              <select className={`${field} bg-white`} value={editing.ccaClass} onChange={(e) => setEditing({ ...editing, ccaClass: e.target.value })}>
                <option value="">—</option>
                {CCA_CLASS_OPTIONS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-gray-600">Asset account</span><div className="mt-1"><Combobox options={assetAccounts} value={editing.assetAccountId === null ? null : String(editing.assetAccountId)} onChange={(v) => setEditing({ ...editing, assetAccountId: v ? Number(v) : null })} placeholder="e.g. Equipment" /></div></label>
            <label className="block"><span className="text-gray-600">Accumulated depreciation account</span><div className="mt-1"><Combobox options={assetAccounts} value={editing.accumulatedDepreciationAccountId === null ? null : String(editing.accumulatedDepreciationAccountId)} onChange={(v) => setEditing({ ...editing, accumulatedDepreciationAccountId: v ? Number(v) : null })} placeholder="Default: Accumulated Depreciation" allowClear /></div></label>
            <label className="block"><span className="text-gray-600">Depreciation expense account</span><div className="mt-1"><Combobox options={expenseAccounts} value={editing.depreciationExpenseAccountId === null ? null : String(editing.depreciationExpenseAccountId)} onChange={(v) => setEditing({ ...editing, depreciationExpenseAccountId: v ? Number(v) : null })} placeholder="Default: Depreciation" allowClear /></div></label>
            <label className="block"><span className="text-gray-600">Cost</span><CurrencyInput valueCents={editing.costCents} onChange={(c) => setEditing({ ...editing, costCents: c })} className="mt-1" /></label>
            <label className="block"><span className="text-gray-600">Salvage value</span><CurrencyInput valueCents={editing.salvageCents} onChange={(c) => setEditing({ ...editing, salvageCents: c })} className="mt-1" /></label>
            <label className="block"><span className="text-gray-600">Method</span>
              <select className={`${field} bg-white`} value={editing.method} onChange={(e) => setEditing({ ...editing, method: e.target.value as DepreciationMethod })}>
                {(Object.keys(DEPRECIATION_METHOD_LABELS) as DepreciationMethod[]).map((m) => <option key={m} value={m}>{DEPRECIATION_METHOD_LABELS[m]}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-gray-600">Acquired</span><input type="date" min={DATE_MIN} max={DATE_MAX} className={field} value={editing.acquiredDate} onChange={(e) => setEditing({ ...editing, acquiredDate: clampIsoDate(e.target.value) })} /></label>
            <label className="block"><span className="text-gray-600">In service (depreciation starts this month)</span><input type="date" min={DATE_MIN} max={DATE_MAX} className={field} value={editing.inServiceDate} onChange={(e) => setEditing({ ...editing, inServiceDate: clampIsoDate(e.target.value) })} /></label>
            {editing.method === 'straightLine' ? (
              <label className="block"><span className="text-gray-600">Useful life (months)</span><input type="number" min={1} className={`${field} text-right`} value={editing.usefulLifeMonths} onChange={(e) => setEditing({ ...editing, usefulLifeMonths: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /></label>
            ) : (
              <label className="block"><span className="text-gray-600">Annual rate (%)</span><input type="number" min={1} max={100} className={`${field} text-right`} value={Math.round(editing.decliningRate * 100)} onChange={(e) => setEditing({ ...editing, decliningRate: Math.min(1, Math.max(0, (Number(e.target.value) || 0) / 100)) })} /></label>
            )}
            <label className="block"><span className="text-gray-600">Serial / VIN</span><input className={`${field} font-mono`} value={editing.serialNumber} onChange={(e) => setEditing({ ...editing, serialNumber: e.target.value })} /></label>
            <label className="block"><span className="text-gray-600">Location</span><input className={field} value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></label>
            <label className="block"><span className="text-gray-600">Description</span><input className={field} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
            <label className="col-span-3 block"><span className="text-gray-600">Notes</span><textarea rows={2} className={field} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></label>
            {editing.id && <p className="col-span-3 text-xs text-gray-400">Cost, salvage, in-service date and method lock once depreciation has been posted.</p>}
          </div>
        </Modal>
      )}

      {disposing && <DisposeModal asset={disposing} accounts={accounts} onClose={() => setDisposing(null)} onDone={() => { setDisposing(null); reload(); }} />}

      {scheduleFor && (
        <Modal open onClose={() => setScheduleFor(null)} title={`Depreciation schedule — ${scheduleFor.name}`} footer={<button type="button" onClick={() => setScheduleFor(null)} className="rounded-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">Close</button>}>
          {!schedule ? <p className="text-sm text-gray-400">Computing…</p> : (
            <table className="w-full text-xs">
              <thead><tr className="text-left text-gray-400"><th className="py-1">Month</th><th className="py-1 text-right">Depreciation</th><th className="py-1 text-right">Accumulated</th><th className="py-1 text-right">Book value</th><th className="py-1">Status</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {schedule.rows.map((r) => (
                  <tr key={r.month} className={schedule.postedMonths.includes(r.month) ? '' : 'text-gray-500'}>
                    <td className="py-0.5 tabular-nums">{r.month}</td>
                    <td className="py-0.5 text-right tabular-nums"><Money cents={r.amountCents} /></td>
                    <td className="py-0.5 text-right tabular-nums"><Money cents={r.accumulatedCents} /></td>
                    <td className="py-0.5 text-right tabular-nums"><Money cents={r.bookValueCents} /></td>
                    <td className="py-0.5">{schedule.postedMonths.includes(r.month) ? <span className="text-emerald-700">posted</span> : 'projected'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  );
}

function Card({ label, cents, emphasis = false }: { label: string; cents: number; emphasis?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${emphasis ? 'border-brand-200 bg-brand-50' : 'border-gray-200 bg-white'}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-gray-900"><Money cents={cents} /></div>
    </div>
  );
}

function DisposeModal({ asset, accounts, onClose, onDone }: { asset: FixedAssetRow; accounts: Account[]; onClose: () => void; onDone: () => void }) {
  const [disposedDate, setDisposedDate] = useState(localIsoDate());
  const [proceedsCents, setProceedsCents] = useState(0);
  const [proceedsAccountId, setProceedsAccountId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cashLike = accounts.filter((a) => a.accountType === 'Asset' && (a.accountSubtype === 'Cash and Bank' || /receivable/i.test(a.name))).map((a) => ({ value: String(a.id), label: a.name }));
  const gainLoss = proceedsCents - asset.bookValueCents;

  async function dispose() {
    setBusy(true);
    setError(null);
    const r = await window.api.fixedAssets.dispose({ id: asset.id, disposedDate, proceedsCents, proceedsAccountId });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onDone();
  }

  return (
    <Modal open onClose={onClose} title={`Dispose — ${asset.name}`}
      footer={<>
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
        <button type="button" disabled={busy || (proceedsCents > 0 && proceedsAccountId === null)} onClick={dispose} className="rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50">Post disposal</button>
      </>}>
      <div className="space-y-3 text-sm" data-testid="dispose-form">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-red-700">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-gray-600">Disposal date</span><input type="date" min={DATE_MIN} max={DATE_MAX} className={field} value={disposedDate} onChange={(e) => setDisposedDate(clampIsoDate(e.target.value))} /></label>
          <label className="block"><span className="text-gray-600">Proceeds (0 if scrapped)</span><CurrencyInput valueCents={proceedsCents} onChange={setProceedsCents} className="mt-1" /></label>
          {proceedsCents > 0 && (
            <label className="col-span-2 block"><span className="text-gray-600">Proceeds received into</span><div className="mt-1"><Combobox options={cashLike} value={proceedsAccountId === null ? null : String(proceedsAccountId)} onChange={(v) => setProceedsAccountId(v ? Number(v) : null)} placeholder="Bank or receivable…" /></div></label>
          )}
        </div>
        <dl className="rounded bg-gray-50 p-3 text-xs text-gray-700">
          <div className="flex justify-between"><dt>Cost</dt><dd><Money cents={asset.costCents} /></dd></div>
          <div className="flex justify-between"><dt>Accumulated depreciation</dt><dd><Money cents={asset.accumulatedCents} /></dd></div>
          <div className="flex justify-between font-medium"><dt>Book value</dt><dd><Money cents={asset.bookValueCents} /></dd></div>
          <div className={`mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold ${gainLoss >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}><dt>{gainLoss >= 0 ? 'Gain on disposal' : 'Loss on disposal'}</dt><dd><Money cents={Math.abs(gainLoss)} /></dd></div>
        </dl>
        <p className="text-xs text-gray-400">Posts one journal entry: clears cost and accumulated depreciation, records proceeds, and books the gain or loss. Depreciation for the disposal month is not taken.</p>
      </div>
    </Modal>
  );
}
