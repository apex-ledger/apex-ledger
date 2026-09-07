import { useState } from 'react';
import { AccountLink } from '../../components/DrillLinks';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Profit and loss with one column per tag in a group.
 *
 * The group is the unit, not individual tags: a line carries at most one tag from a group, so the
 * columns are mutually exclusive and add up to the total. Reporting on loose tags instead would
 * double-count anything carrying two of them.
 *
 * Untagged gets its own column rather than being spread over the others. Splitting head-office rent
 * across five stores would invent an allocation nobody decided on, and it would be invisible in the
 * result.
 */

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

export function ProfitAndLossByTagPage() {
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [groupId, setGroupId] = useState<number | null>(null);

  const groups = useIpcQuery(() => window.api.tags.groups({ activeOnly: true }), []);
  const activeGroupId = groupId ?? groups.data?.[0]?.id ?? null;

  const { data, loading, error } = useIpcQuery(
    () =>
      activeGroupId === null
        ? Promise.resolve({ ok: true as const, data: null })
        : window.api.reports.profitAndLossByTag({ tagGroupId: activeGroupId, periodStart, periodEnd }),
    [activeGroupId, periodStart, periodEnd],
  );

  const tags = data?.tags ?? [];

  function cell(byTag: Map<number, number>, tagId: number) {
    return byTag.get(tagId) ?? 0;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">Tag group</label>
        <select
          value={activeGroupId ?? ''}
          onChange={(e) => setGroupId(Number(e.target.value))}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {(groups.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <label className="text-sm text-gray-600">From</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <label className="text-sm text-gray-600">To</label>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {!groups.loading && (groups.data ?? []).length === 0 && (
        <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          There are no tag groups yet. Create one under Tags — a group like “Store” or “Job”, with a tag for each one — then tag the
          journal lines you want to see split out here.
        </div>
      )}

      {data && tags.length === 0 && (
        <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          “{data.groupName}” has no tags in it yet, so there is nothing to put across the top.
        </div>
      )}

      {data && tags.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 text-left font-medium">Account</th>
                  {tags.map((t) => (
                    <th key={t.id} className="px-3 py-2 text-right font-medium">
                      {t.name}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium italic">Untagged</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>

              {[data.revenue, data.expenses].map((section) => (
                <tbody key={section.label}>
                  <tr className="bg-gray-50">
                    <td className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500" colSpan={tags.length + 3}>
                      {section.label}
                    </td>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={row.account.id} className="border-b border-gray-100">
                      <td className="px-3 py-1.5"><AccountLink id={row.account.id} name={row.account.name} dateFrom={periodStart} dateTo={periodEnd} /></td>
                      {tags.map((t) => (
                        <td key={t.id} className="px-3 py-1.5 text-right tabular-nums">
                          <Money cents={cell(row.byTag, t.id)} />
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                        <Money cents={row.untaggedCents} />
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                        <Money cents={row.totalCents} />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b border-gray-300 font-medium">
                    <td className="px-3 py-1.5">Total {section.label.toLowerCase()}</td>
                    {tags.map((t) => (
                      <td key={t.id} className="px-3 py-1.5 text-right tabular-nums">
                        <Money cents={cell(section.totalByTag, t.id)} />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                      <Money cents={section.totalUntaggedCents} />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      <Money cents={section.totalCents} />
                    </td>
                  </tr>
                </tbody>
              ))}

              <tbody>
                <tr className="border-t-2 border-gray-400 font-semibold">
                  <td className="px-3 py-2">Net income</td>
                  {tags.map((t) => (
                    <td key={t.id} className="px-3 py-2 text-right tabular-nums">
                      <Money cents={cell(data.netByTag, t.id)} />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                    <Money cents={data.netUntaggedCents} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Money cents={data.netIncomeCents} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {data.netUntaggedCents !== 0 && (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Money cents={data.netUntaggedCents} /> of net income carries no “{data.groupName}” tag. It is shown in its own column
              rather than shared out, because splitting it would invent a decision nobody made.
            </p>
          )}

          <p className="text-xs text-gray-400">
            Columns add up to the total because a line can carry only one tag from a group. Amounts follow each account&apos;s own
            direction, so a credit note reduces a column instead of inflating it.
          </p>
        </>
      )}
    </div>
  );
}
