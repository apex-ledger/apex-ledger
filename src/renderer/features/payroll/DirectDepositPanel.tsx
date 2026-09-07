import { useEffect, useState } from 'react';
import type { DirectDepositPreview } from '../../../main/ipc/directDeposit.handlers';
import { Money } from '../../components/Money';
import { useUiStore } from '../../app/store/uiStore';

/** Direct deposit: pick a pay date with posted runs, see every employee's net pay and whether
 * their bank details are complete, then save the CPA-005 file for the bank portal. The file
 * number counts up on each save; the panel shows which number the next file will carry. */
export function DirectDepositPanel() {
  const setView = useUiStore((s) => s.setView);
  const [dates, setDates] = useState<Array<{ payDate: string; employees: number; totalCents: number }>>([]);
  const [payDate, setPayDate] = useState<string>('');
  const [preview, setPreview] = useState<DirectDepositPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => { window.api.directDeposit.payDates().then((r) => { if (r.ok) { setDates(r.data); if (r.data[0]) setPayDate(r.data[0].payDate); } }); }, []);
  useEffect(() => {
    if (!payDate) return setPreview(null);
    window.api.directDeposit.preview({ payDate }).then((r) => { if (r.ok) setPreview(r.data); else setStatus(r.error); });
  }, [payDate]);

  async function save() {
    setBusy(true); setStatus(null);
    const result = await window.api.directDeposit.saveFile({ payDate });
    setBusy(false);
    if (!result.ok) return setStatus(result.error);
    if (!result.data.saved) return;
    setStatus(`Saved file #${result.data.fileNumber} to ${result.data.filePath} — ${((result.data.totalCents ?? 0) / 100).toFixed(2)} to ${preview?.payees.length ?? 0} employees. Upload it in your bank’s business portal.`);
    const r = await window.api.directDeposit.preview({ payDate }); if (r.ok) setPreview(r.data);
  }

  if (dates.length === 0) return null;
  const companyProblems = preview?.problems.filter((p) => p.payee === 'Company') ?? [];
  const payeeProblems = new Map((preview?.problems ?? []).filter((p) => p.payee !== 'Company').map((p) => [p.payee, p.problem]));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-900">Direct deposit file</h2>
        <select aria-label="Pay date" className="rounded border border-gray-300 bg-white px-2 py-1 text-sm" value={payDate} onChange={(e) => setPayDate(e.target.value)}>
          {dates.map((d) => <option key={d.payDate} value={d.payDate}>{d.payDate} — {d.employees} employee{d.employees === 1 ? '' : 's'} — ${(d.totalCents / 100).toFixed(2)}</option>)}
        </select>
        <button type="button" disabled={busy || !preview || preview.problems.length > 0} onClick={() => void save()} className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40" title="Write the CPA-005 file for your bank's portal">{busy ? 'Saving…' : `Save bank file${preview ? ` #${preview.nextFileNumber}` : ''}`}</button>
        <button type="button" onClick={() => setView({ kind: 'companySettings' })} className="text-xs text-brand-600 hover:underline">EFT settings</button>
      </div>
      {companyProblems.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-rose-700">{companyProblems.map((p, i) => <li key={i}>{p.problem}</li>)}</ul>
      )}
      {preview && (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400"><th className="pb-1">Employee</th><th className="pb-1">Bank</th><th className="pb-1 text-right">Net pay</th><th className="pb-1">Ready</th></tr></thead>
          <tbody>
            {preview.payees.map((p) => (
              <tr key={p.runId} className="border-b border-gray-100">
                <td className="py-1">{p.name}</td>
                <td className="py-1 tabular-nums text-gray-600">{p.institution && p.transit && p.account ? `${p.institution}-${p.transit}-••••${p.account.slice(-4)}` : <span className="text-rose-700">missing</span>}</td>
                <td className="py-1 text-right"><Money cents={p.netPayCents} /></td>
                <td className="py-1 text-xs">{payeeProblems.has(p.name) ? <span className="text-rose-700">{payeeProblems.get(p.name)}</span> : <span className="text-emerald-700">✓</span>}</td>
              </tr>
            ))}
            <tr className="font-semibold"><td className="py-1" colSpan={2}>Total</td><td className="py-1 text-right"><Money cents={preview.totalCents} /></td><td /></tr>
          </tbody>
        </table>
      )}
      {status && <p className="mt-2 whitespace-pre-line text-xs text-gray-600">{status}</p>}
      <p className="mt-2 text-[11px] text-gray-400">CPA Standard 005 (AFT credits, code 200). The originator ID, data centre and settlement account come from your bank’s EFT agreement and are set under Settings. Employee bank details are on each employee’s record.</p>
    </div>
  );
}
