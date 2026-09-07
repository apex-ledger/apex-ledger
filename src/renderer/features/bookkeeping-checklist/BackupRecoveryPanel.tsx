import { useState } from 'react';
import { useUiStore } from '../../app/store/uiStore';
import { confirmDialog } from '../../app/store/confirmStore';

type RecoveryPoint = { filePath: string; fileName: string; createdAt: string; sizeBytes: number; valid: boolean; problem?: string; companyName?: string; journalEntries?: number; customers?: number; vendors?: number; invoices?: number; bills?: number };

export function BackupRecoveryPanel() {
  const setCompany = useUiStore((state) => state.setCompany);
  const [points, setPoints] = useState<RecoveryPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    const result = await window.api.company.listRecoveryPoints();
    setLoading(false);
    if (!result.ok) return window.alert(result.error);
    setPoints(result.data);
  }
  async function restore(point: RecoveryPoint) {
    const result = await window.api.company.restoreRecoveryPoint(point.filePath);
    if (!result.ok) return window.alert(result.error);
    if (!result.data.saved) return;
    const openNow = await confirmDialog(`Verified recovery copy created successfully:\n${result.data.filePath}\n\nOpen this recovered copy now? Your original file will remain unchanged.`);
    if (!openNow) return;
    const opened = await window.api.company.open(result.data.filePath);
    if (!opened.ok) return window.alert(`The recovery copy was created, but could not be opened:\n${opened.error}`);
    if (opened.data.opened) setCompany(opened.data.filePath, opened.data.company.legalName);
  }
  return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-emerald-700">Backup recovery</div><h2 className="mt-1 font-semibold text-gray-900">Verified automatic recovery points</h2><p className="mt-1 text-sm text-gray-600">Restore a checked backup as a separate company file. Existing files and your open books are never overwritten.</p></div><button type="button" onClick={load} disabled={loading} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:opacity-50">{loading ? 'Checking backups…' : points === null ? 'Show recovery points' : 'Check again'}</button></div>{points !== null && <div className="mt-3 space-y-2">{points.length === 0 ? <p className="text-sm text-gray-600">No automatic recovery points exist yet. Use Backup now below for an immediate copy.</p> : points.map((point) => <div key={point.filePath} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-white p-3"><div className="min-w-0"><div className="truncate text-sm font-medium text-gray-900">{point.companyName ?? 'Unknown company'} · {new Date(point.createdAt).toLocaleString()}</div><div className="truncate text-xs text-gray-500">{point.fileName} · {(point.sizeBytes / 1_048_576).toFixed(1)} MB</div>{point.valid && <div className="mt-1 text-xs text-emerald-800">{point.journalEntries} entries · {point.customers} customers · {point.vendors} vendors · {point.invoices} invoices · {point.bills} bills</div>}{!point.valid && <div className="mt-1 text-xs font-semibold text-red-700">Failed verification — do not use this copy</div>}</div><button type="button" disabled={!point.valid} onClick={() => restore(point)} className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:bg-gray-300">{point.valid ? 'Restore as new copy' : 'Not usable'}</button></div>)}</div>}</div>;
}
