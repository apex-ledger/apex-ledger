import { useState } from 'react';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';
import { openOriginalEntry } from '../../utils/openOriginalEntry';
import { OpenEntryButton } from '../../components/OpenEntryButton';
import { userAuditStyle } from '../../utils/userAuditColor';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** The Journal: every entry in the period with both sides shown, and a flat one-line-per-entry view
 * of the same data.
 *
 * Drafts and voided entries appear, marked, because "what did we enter" is a different question
 * from "what affects the balances" — a listing that hid them would make an entry someone is hunting
 * for simply not be there. They are left out of the totals for the opposite reason: they move no
 * balance, so counting them would put this at odds with the trial balance. */

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

const STATUS_CHIP: Record<string, string> = {
  draft: 'bg-gray-200 text-gray-700',
  void: 'bg-rose-100 text-rose-800',
  posted: '',
};

export function JournalReportPage() {
  const setView = useUiStore((s) => s.setView);
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [postedOnly, setPostedOnly] = useState(false);
  const [flat, setFlat] = useState(false);
  const { data: identity } = useIpcQuery(() => window.api.access.getIdentity(), []);

  const { data, loading, error } = useIpcQuery(
    () => window.api.reports.journal({ periodStart, periodEnd, postedOnly }),
    [periodStart, periodEnd, postedOnly],
  );

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">From</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <label className="text-sm text-gray-600">To</label>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={postedOnly} onChange={(e) => setPostedOnly(e.target.checked)} />
          Posted only
        </label>
        <button
          type="button"
          onClick={() => setFlat((v) => !v)}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
        >
          {flat ? 'Show both sides' : 'One line per entry'}
        </button>
        <span className="text-xs text-gray-500"><span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">Current user</span> · other colors identify other users</span>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {data && data.entries.length === 0 && !loading && (
        <p className="text-sm text-gray-500">No transactions in this period.</p>
      )}

      {data && data.entries.length > 0 && flat && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <EnteredTh className="px-3 py-2 text-left font-medium" />
              <th className="px-3 py-2 text-left font-medium">Entry</th>
              <th data-export-skip className="px-3 py-2 text-left font-medium" title="Screen only — not included in Excel export or Copy">User</th>
              <th className="px-3 py-2 text-left font-medium">Memo</th>
              <th className="px-3 py-2 text-left font-medium">Accounts</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => (
              <tr
                key={e.entryId}
                onClick={() => void openOriginalEntry(e.entryId, setView)}
                className={`cursor-pointer border-b border-gray-100 hover:bg-brand-50 ${userAuditStyle(e.createdBy, identity?.name).row}`}
              >
                <td className="px-3 py-1.5 text-gray-500">
                  <div className="flex items-center gap-2"><span>{e.entryDate}</span><OpenEntryButton entryId={e.entryId} /></div>
                </td>
                <EnteredTd at={e.createdAt} className="px-3 py-1.5" />
                <td className="px-3 py-1.5">
                  #{e.entryId}
                  {e.status !== 'posted' && (
                    <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${STATUS_CHIP[e.status]}`}>{e.status}</span>
                  )}
                </td>
                <td data-export-skip className="px-3 py-1.5"><span className={`rounded px-2 py-0.5 text-xs ring-1 ${userAuditStyle(e.createdBy, identity?.name).badge}`}>{e.createdBy ?? 'Legacy/local'}</span></td>
                <td className="px-3 py-1.5 text-gray-700">{e.memo || <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-1.5 text-xs text-gray-500">
                  {e.lines.map((l) => l.accountName).join(' · ')}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  <Money cents={e.totalDebitCents} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data && data.entries.length > 0 && !flat && (
        <div className="space-y-3">
          {data.entries.map((e) => (
            <div key={e.entryId} className={`rounded border border-gray-200 ${userAuditStyle(e.createdBy, identity?.name).row}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white/50 px-3 py-1.5 text-sm">
                <div>
                  <button
                    type="button"
                    className="font-medium text-brand-700 hover:underline"
                    onClick={() => void openOriginalEntry(e.entryId, setView)}
                  >
                    {e.entryDate} · #{e.entryId}
                  </button>
                  <span className="ml-2"><EnteredText at={e.createdAt} /></span>
                  {e.memo && <span className="ml-2 text-gray-600">{e.memo}</span>}
                  {e.reference && <span className="ml-2 text-xs text-gray-400">ref {e.reference}</span>}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`rounded px-2 py-0.5 ring-1 ${userAuditStyle(e.createdBy, identity?.name).badge}`}>{e.createdBy ?? 'Legacy/local'}</span>
                  <OpenEntryButton entryId={e.entryId} />
                  {e.isAdjustingEntry && <span className="rounded bg-violet-100 px-2 py-0.5 text-violet-800">Adjusting</span>}
                  {e.status !== 'posted' && (
                    <span className={`rounded px-2 py-0.5 ${STATUS_CHIP[e.status]}`}>{e.status}</span>
                  )}
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {e.lines.map((l, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-1">{l.accountName}</td>
                      <td className="px-3 py-1 text-xs text-gray-500">{l.description ?? l.contactName ?? ''}</td>
                      <td className="w-28 px-3 py-1 text-right tabular-nums">
                        {l.debitCents ? <Money cents={l.debitCents} /> : ''}
                      </td>
                      <td className="w-28 px-3 py-1 text-right tabular-nums">
                        {l.creditCents ? <Money cents={l.creditCents} /> : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {data && data.entries.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="border-t-2 border-gray-400 font-semibold">
              <td className="px-3 py-2">Total posted</td>
              <td className="w-28 px-3 py-2 text-right tabular-nums">
                <Money cents={data.totalDebitCents} />
              </td>
              <td className="w-28 px-3 py-2 text-right tabular-nums">
                <Money cents={data.totalCreditCents} />
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <p className="text-xs text-gray-400">
        Draft and voided entries are listed but excluded from the totals — they affect no balance, so counting them would put this
        at odds with the trial balance. Click any entry to open it.
      </p>
    </div>
  );
}
