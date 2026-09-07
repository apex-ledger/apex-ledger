import { useState } from 'react';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';
import { openOriginalEntry } from '../../utils/openOriginalEntry';
import { OpenEntryButton } from '../../components/OpenEntryButton';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** The income statement with every transaction behind it, rather than one total per account.
 *
 * This is the report you hand over when someone asks what is actually in "Repairs — 14,200": the
 * account totals are the same figures the Profit and Loss Summary shows, with their constituent entries
 * listed underneath in date order. */

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

export function ProfitAndLossDetailPage() {
  const setView = useUiStore((s) => s.setView);
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const { data, loading, error } = useIpcQuery(
    () => window.api.reports.profitAndLossDetail({ periodStart, periodEnd }),
    [periodStart, periodEnd],
  );

  function toggle(accountId: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  const sections = data ? [data.revenue, data.expenses] : [];

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">From</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <label className="text-sm text-gray-600">To</label>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
        {data && (
          <button
            type="button"
            onClick={() =>
              setCollapsed((prev) =>
                prev.size > 0 ? new Set() : new Set(sections.flatMap((s) => s.accounts.map((a) => a.account.id))),
              )
            }
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
          >
            {collapsed.size > 0 ? 'Expand all' : 'Collapse all'}
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {data && data.revenue.accounts.length === 0 && data.expenses.accounts.length === 0 && !loading && (
        <p className="text-sm text-gray-500">No posted income or expense transactions in this period.</p>
      )}

      {sections.map((section) => (
        <div key={section.label}>
          <h2 className="mb-1 text-sm font-semibold text-gray-900">{section.label}</h2>
          {section.accounts.length === 0 ? (
            <p className="px-3 py-1.5 text-sm text-gray-400">Nothing in this period.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <tbody>
                {section.accounts.map((group) => (
                  <tbody key={group.account.id}>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <td className="px-3 py-1.5" colSpan={3}>
                        <button type="button" onClick={() => toggle(group.account.id)} className="font-medium text-gray-900">
                          <span className="mr-1 text-gray-400">{collapsed.has(group.account.id) ? '▸' : '▾'}</span>
                          {group.account.name}
                          <span className="ml-2 text-xs font-normal text-gray-400">
                            {group.lines.length} transaction{group.lines.length === 1 ? '' : 's'}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                        <Money cents={group.totalCents} />
                      </td>
                    </tr>
                    {!collapsed.has(group.account.id) &&
                      group.lines.map((line, i) => (
                        <tr
                          key={`${line.entryId}-${i}`}
                          onClick={() => void openOriginalEntry(line.entryId, setView)}
                          className="cursor-pointer border-b border-gray-100 hover:bg-brand-50"
                          title="Open this entry"
                        >
                          <td className="px-3 py-1 pl-8 text-gray-500">
                            <div className="flex items-center gap-2"><span>{line.entryDate}</span><OpenEntryButton entryId={line.entryId} /></div>
                          </td>
                          <td className="px-3 py-1 text-gray-700">
                            {line.description || line.memo || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-1 text-gray-500">{line.contactName ?? ''}</td>
                          <td className="px-3 py-1 text-right tabular-nums">
                            <Money cents={line.amountCents} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                ))}
                <tr className="border-t border-gray-300 font-semibold">
                  <td className="px-3 py-2" colSpan={3}>
                    Total {section.label.toLowerCase()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Money cents={section.totalCents} />
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      ))}

      {data && (
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="border-t-2 border-gray-400 font-semibold">
              <td className="px-3 py-2">Net {data.netIncomeCents < 0 ? 'loss' : 'income'}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${data.netIncomeCents < 0 ? 'text-rose-700' : ''}`}>
                <Money cents={data.netIncomeCents} />
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <p className="text-xs text-gray-400">
        Account totals here are the same figures as the Profit and Loss Summary — this shows what each one is made of. Accounts with no
        activity in the period are left out. Click any line to open the entry behind it.
      </p>
    </div>
  );
}
