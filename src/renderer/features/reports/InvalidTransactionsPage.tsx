import { INVALID_REASON_TEXT } from '@shared/domain/ledger/transactionLists';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';
import { openOriginalEntry } from '../../utils/openOriginalEntry';
import { OpenEntryButton } from '../../components/OpenEntryButton';
import { useState } from 'react';
import { ReportDateRange } from '../../components/ReportDateRange';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string { return localIsoDate(); }
function yearStartIso(): string { return `${todayIso().slice(0, 4)}-01-01`; }

/** Entries that could not be right, whatever anyone intended: unbalanced, one-sided, all-zero, or
 * pointing at an account that no longer exists.
 *
 * Posting validates every one of these, so a POSTED entry appearing here means something got in
 * another way — an interrupted write, a file touched by an older version, a bad import. That is
 * worth knowing about loudly, which is why posted problems sort to the top and are coloured
 * differently from drafts, where being half-finished is expected. */

export function InvalidTransactionsPage() {
  const setView = useUiStore((s) => s.setView);
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const { data, loading, error } = useIpcQuery(
    () => window.api.reports.invalidTransactions({ periodStart, periodEnd }),
    [periodStart, periodEnd],
  );

  const posted = (data ?? []).filter((t) => t.status === 'posted');
  const drafts = (data ?? []).filter((t) => t.status !== 'posted');

  return (
    <div className="w-full space-y-3">
      <ReportDateRange from={periodStart} to={periodEnd} onFromChange={setPeriodStart} onToChange={setPeriodEnd} />
      {loading && <p className="text-sm text-gray-500">Checking every entry…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {data && data.length === 0 && !loading && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ✓ Every entry is structurally sound — all balanced, two-sided, and pointing at accounts that exist.
        </div>
      )}

      {posted.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {posted.length} posted {posted.length === 1 ? 'entry is' : 'entries are'} affecting your balances despite being invalid.
          Posting rejects all of these, so they got in another way — worth looking at each one.
        </div>
      )}

      {[
        { label: 'Posted', rows: posted, tone: 'border-red-200' },
        { label: 'Draft', rows: drafts, tone: 'border-gray-200' },
      ]
        .filter((g) => g.rows.length > 0)
        .map((group) => (
          <div key={group.label}>
            <h2 className="mb-1 text-sm font-semibold text-gray-900">
              {group.label} ({group.rows.length})
            </h2>
            <div className={`rounded border ${group.tone}`}>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-3 py-2">Date</th><EnteredTh className="px-3 py-2" />
                    <th className="px-3 py-2">Entry</th>
                    <th className="px-3 py-2">What is wrong</th>
                    <th className="px-3 py-2 text-right">Debits</th>
                    <th className="px-3 py-2 text-right">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((t) => (
                    <tr
                      key={t.entryId}
                      onClick={() => void openOriginalEntry(t.entryId, setView)}
                      className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-brand-50"
                      title="Open this entry"
                    >
                      <td className="px-3 py-1.5 text-gray-500">
                        <div className="flex items-center gap-2"><span>{t.entryDate}</span><OpenEntryButton entryId={t.entryId} /></div>
                      </td><EnteredTd at={t.createdAt} className="px-3 py-1.5" />
                      <td className="px-3 py-1.5">
                        #{t.entryId}
                        {t.memo && <span className="ml-2 text-gray-500">{t.memo}</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        {t.reasons.map((r) => (
                          <div key={r} className="text-xs text-rose-700">
                            {INVALID_REASON_TEXT[r]}
                          </div>
                        ))}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        <Money cents={t.totalDebitCents} />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        <Money cents={t.totalCreditCents} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      <p className="text-xs text-gray-400">
        Voided entries are not listed — a void is a deliberate reversal, not a defect. Drafts are checked too, but being incomplete
        while you type is normal, so they are separated out rather than reported as corruption.
      </p>
    </div>
  );
}
