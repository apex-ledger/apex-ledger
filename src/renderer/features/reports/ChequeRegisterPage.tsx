import { useState } from 'react';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';
import { openOriginalEntry } from '../../utils/openOriginalEntry';
import { OpenEntryButton } from '../../components/OpenEntryButton';
import type { ChequeRow } from '@shared/domain/ledger/chequeRegister';
import { ChequePrintDesigner } from './ChequePrintDesigner';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Every cheque written, in number order — and the gaps in the sequence.
 *
 * The gaps are the reason this report exists. A missing number in an otherwise unbroken run is how
 * you find a cheque that was written and never entered, which is the commonest way money leaves a
 * small business without appearing in its books. A voided or spoiled cheque makes the same gap, so
 * the report asks rather than accuses. */

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

export function ChequeRegisterPage() {
  const setView = useUiStore((s) => s.setView);
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [printRequest, setPrintRequest] = useState<{ cheque?: ChequeRow } | null>(null);

  const { data, loading, error } = useIpcQuery(
    () => window.api.reports.chequeRegister({ periodStart, periodEnd }),
    [periodStart, periodEnd],
  );

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPrintRequest({})}
          className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + Fill a Cheque
        </button>
        <label className="text-sm text-gray-600">From</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <label className="text-sm text-gray-600">To</label>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {printRequest && <ChequePrintDesigner cheque={printRequest.cheque} onClose={() => setPrintRequest(null)} />}

      {data && data.cheques.length === 0 && !loading && (
        <div className="rounded border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
          No cheques found in this period. A cheque is recognised from its number in the line description or the entry reference —
          "CHQ#1043", "Cheque 1043", or just "1043" — on a payment out of a bank account.
        </div>
      )}

      {data && data.gaps.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="font-medium">
            {data.gaps.reduce((sum, g) => sum + g.count, 0)} cheque number
            {data.gaps.reduce((sum, g) => sum + g.count, 0) === 1 ? '' : 's'} missing from the sequence
          </div>
          <div className="mt-1 text-xs">
            {data.gaps.map((g) => (g.from === g.to ? `${g.from}` : `${g.from}–${g.to}`)).join(', ')}
          </div>
          <p className="mt-1 text-xs text-amber-800">
            Each gap is either a cheque written but never entered, or one voided or spoiled. Both are worth accounting for.
          </p>
        </div>
      )}

      {data && data.duplicates.length > 0 && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          Number{data.duplicates.length === 1 ? '' : 's'} used more than once: {data.duplicates.join(', ')} — either the same cheque
          was entered twice, or a number was reused.
        </div>
      )}

      {data && data.cheques.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 text-left font-medium">Cheque #</th>
              <th className="px-3 py-2 text-left font-medium">Date</th><EnteredTh className="px-3 py-2 text-left font-medium" />
              <th className="px-3 py-2 text-left font-medium">Payee</th>
              <th className="px-3 py-2 text-left font-medium">Account</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-right font-medium">Print</th>
            </tr>
          </thead>
          <tbody>
            {data.cheques.map((c, i) => (
              <tr
                key={`${c.chequeNumber}-${c.entryId}-${i}`}
                onClick={() => void openOriginalEntry(c.entryId, setView)}
                className={`cursor-pointer border-b border-gray-100 hover:bg-brand-50 ${c.status === 'void' ? 'opacity-60' : ''}`}
                title="Open this entry"
              >
                <td className="px-3 py-1.5 font-mono tabular-nums">
                  {c.chequeNumber}
                  {c.status === 'void' && <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-800">void</span>}
                  {data.duplicates.includes(c.chequeNumber) && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">duplicate</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-gray-500">
                  <div className="flex items-center gap-2"><span>{c.entryDate}</span><OpenEntryButton entryId={c.entryId} /></div>
                </td><EnteredTd at={c.createdAt} className="px-3 py-1.5" />
                <td className="px-3 py-1.5">{c.payee ?? <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-1.5 text-xs text-gray-500">{c.accountName}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${c.status === 'void' ? 'line-through text-gray-400' : ''}`}>
                  <Money cents={c.amountCents} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    type="button"
                    disabled={c.status === 'void'}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPrintRequest({ cheque: c });
                    }}
                    className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-200 disabled:opacity-40"
                  >
                    Print Cheque
                  </button>
                </td>
              </tr>
            ))}
            <tr className="border-t border-gray-300 font-semibold">
              <td className="px-3 py-2" colSpan={5}>
                Total written ({data.cheques.filter((c) => c.status === 'posted').length} cheques)
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                <Money cents={data.totalCents} />
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      )}

      <p className="text-xs text-gray-400">
        Voided cheques are listed — they are usually what explains a gap — but are not included in the total, since they moved no
        money. Drafts are left out entirely.
      </p>
    </div>
  );
}
