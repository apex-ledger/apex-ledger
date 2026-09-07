import { useState } from 'react';
import { AccountLink } from '../../components/DrillLinks';
import type { Account } from '@shared/domain/types';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Budget against actual, with the variance and whether it is good news.
 *
 * The favourable flag is the point. Spending 500 less than budgeted and earning 500 less than
 * budgeted are the same arithmetic and opposite outcomes; a bare variance column leaves the reader
 * to work that out on every line, and they will get it wrong on the line that matters. */

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

function parseMoney(text: string): number {
  return Math.round((Number(text.replace(/[^0-9.-]/g, '')) || 0) * 100);
}

export function BudgetVsActualPage() {
  const [budgetId, setBudgetId] = useState<number | null>(null);
  const [fiscalYearStart, setFiscalYearStart] = useState(yearStartIso());
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const { data: budgets, reload: reloadBudgets } = useIpcQuery(() => window.api.budgets.list({}), []);
  const { data: accounts } = useIpcQuery(() => window.api.accounts.list({ activeOnly: true }), []);
  const { data, reload } = useIpcQuery(
    () =>
      budgetId
        ? window.api.budgets.vsActual({ budgetId, fiscalYearStart, periodStart, periodEnd })
        : Promise.resolve({ ok: true as const, data: undefined }),
    [budgetId, fiscalYearStart, periodStart, periodEnd],
  );

  async function createBudget() {
    if (!newName.trim()) return setError('Give the budget a name.');
    const result = await window.api.budgets.create({ name: newName.trim(), fiscalYearEnd: periodEnd });
    if (!result.ok) return setError(result.error);
    setError(null);
    setNewName('');
    setBudgetId(result.data.id);
    reloadBudgets();
  }

  /** Sets a whole year's figure for one account, spread evenly. A starting point, not an answer —
   * rent really is flat, but heating and sales are not, and those get adjusted per month after. */
  async function setAnnual(accountId: number, annualCents: number) {
    if (!budgetId) return;
    const result = await window.api.budgets.spreadEvenly({ budgetId, accountId, annualCents });
    if (!result.ok) return setError(result.error);
    setError(null);
    reload();
  }

  const sections = data ? [{ label: 'Revenue', rows: data.revenue }, { label: 'Expenses', rows: data.expenses }] : [];

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-gray-600">Budget</span>
          <select
            className="mt-1 w-52 rounded border border-gray-300 px-2 py-1.5"
            value={budgetId ?? ''}
            onChange={(e) => setBudgetId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Choose a budget…</option>
            {(budgets ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.fiscalYearEnd})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-gray-600" title="Period 1 of the budget is the first month of this year">
            Fiscal year starts
          </span>
          <DateInput value={fiscalYearStart} onChange={setFiscalYearStart} className="mt-1 w-32" />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">Report from</span>
          <DateInput value={periodStart} onChange={setPeriodStart} className="mt-1 w-32" />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">To</span>
          <DateInput value={periodEnd} onChange={setPeriodEnd} className="mt-1 w-32" />
        </label>
        {budgetId && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            {editing ? 'Done editing' : 'Edit figures'}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 text-red-500 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {!budgetId && (
        <div className="rounded border border-dashed border-gray-300 px-4 py-4">
          <p className="mb-2 text-sm text-gray-600">No budget selected. Create one to compare against:</p>
          <div className="flex gap-2">
            <input
              className="w-56 rounded border border-gray-300 px-2 py-1.5 text-sm"
              placeholder="e.g. 2026 Operating Budget"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createBudget();
              }}
            />
            <button
              type="button"
              onClick={() => void createBudget()}
              className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Budgeted profit', cents: data.budgetNetIncomeCents },
              { label: 'Actual profit', cents: data.actualNetIncomeCents },
              {
                label: data.netIsFavourable ? 'Ahead of plan by' : 'Behind plan by',
                cents: Math.abs(data.netVarianceCents),
                tone: data.netIsFavourable ? 'text-emerald-700' : 'text-rose-700',
              },
            ].map((tile) => (
              <div key={tile.label} className="rounded border border-gray-200 bg-white px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-gray-500">{tile.label}</div>
                <div className={`mt-1 text-lg font-semibold tabular-nums ${tile.tone ?? 'text-gray-900'}`}>
                  <Money cents={tile.cents} />
                </div>
              </div>
            ))}
          </div>

          {sections.map((section) => (
            <div key={section.label}>
              <h2 className="mb-1 text-sm font-semibold text-gray-900">{section.label}</h2>
              {section.rows.length === 0 ? (
                <p className="px-3 py-1.5 text-sm text-gray-400">Nothing budgeted or spent here.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2 text-left font-medium">Account</th>
                      <th className="px-3 py-2 text-right font-medium">Budget</th>
                      <th className="px-3 py-2 text-right font-medium">Actual</th>
                      <th className="px-3 py-2 text-right font-medium">Variance</th>
                      <th className="px-3 py-2 text-right font-medium">%</th>
                      {editing && <th className="px-3 py-2 text-right font-medium">Set year</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((r) => (
                      <tr key={r.account.id} className="border-b border-gray-100">
                        <td className="px-3 py-1.5">
                          <AccountLink id={r.account.id} name={r.account.name} dateFrom={periodStart} dateTo={periodEnd} />
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                          <Money cents={r.budgetCents} />
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          <Money cents={r.actualCents} />
                        </td>
                        <td className={`px-3 py-1.5 text-right font-medium tabular-nums ${r.isFavourable ? 'text-emerald-700' : 'text-rose-700'}`}>
                          <Money cents={r.varianceCents} />
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                          {r.variancePercent === null ? <span className="text-gray-300">—</span> : `${r.variancePercent.toFixed(0)}%`}
                        </td>
                        {editing && (
                          <td className="px-3 py-1.5 text-right">
                            <input
                              className="w-28 rounded border border-gray-300 px-1.5 py-0.5 text-right text-sm tabular-nums"
                              placeholder="annual"
                              onBlur={(e) => {
                                if (e.target.value.trim()) void setAnnual(r.account.id, parseMoney(e.target.value));
                              }}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}

          {editing && (
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-sm text-gray-600">
                Budget an account that has no activity yet — type its annual figure and it spreads evenly across the year.
              </p>
              <div className="flex flex-wrap gap-2">
                {((accounts ?? []) as Account[])
                  .filter((a) => a.accountType === 'Revenue' || a.accountType === 'Expense')
                  .filter((a) => ![...data.revenue, ...data.expenses].some((r) => r.account.id === a.id))
                  .slice(0, 24)
                  .map((a) => (
                    <div key={a.id} className="flex items-center gap-1.5 rounded border border-gray-300 bg-white px-2 py-1">
                      <span className="text-xs text-gray-600">{a.name}</span>
                      <input
                        className="w-24 rounded border border-gray-300 px-1.5 py-0.5 text-right text-xs tabular-nums"
                        placeholder="annual"
                        onBlur={(e) => {
                          if (e.target.value.trim()) void setAnnual(a.id, parseMoney(e.target.value));
                        }}
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Green is favourable: more revenue, or less cost. The budget shown is only the months being reported on, so a quarter is
            compared against a quarter rather than against the whole year. Setting a yearly figure spreads it evenly — a starting
            point, since rent is flat but heating and sales are not.
          </p>
        </>
      )}
    </div>
  );
}
