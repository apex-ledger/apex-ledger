import { useMemo, useState } from 'react';
import type { Section } from '@shared/domain/ledger/sectionHelpers';
import type { Account } from '@shared/domain/types';
import { buildAccountTree, rollUpBalances } from '@shared/domain/ledger/accountTree';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Balance Sheet Summary, Detail, and Comparison — the three variants QuickBooks lists separately.
 *
 * They differ only in how much of the same figures they show, so they share one page and one query
 * rather than three near-identical files:
 *   Summary    — subtotals per section grouping (Current Assets, Capital Assets, …), no accounts
 *   Detail     — every account, sub-accounts indented under their parent and rolled up into it
 *   Comparison — two dates side by side with the change in dollars and percent
 */

export type BalanceSheetVariant = 'summary' | 'detail' | 'comparison';

const VARIANT_COPY: Record<BalanceSheetVariant, { label: string; blurb: string }> = {
  summary: { label: 'Summary', blurb: 'Section subtotals only — the shape of the balance sheet on one screen.' },
  detail: { label: 'Detail', blurb: 'Every account, with sub-accounts indented under and rolled up into their parent.' },
  comparison: { label: 'Comparison', blurb: 'Two dates side by side, with the change in dollars and percent.' },
};

function todayIso(): string {
  return localIsoDate();
}
function lastYearIso(): string {
  const today = todayIso();
  return `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
}

/** Percent change, or null when there's no meaningful base to compare against — a move from zero
 * is an infinite increase, which is true but useless, so those render as a dash. */
function percentChange(now: number, before: number): number | null {
  if (before === 0) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

function SummaryView({ sections }: { sections: { section: Section; label: string }[] }) {
  return (
    <div className="grid w-full grid-cols-1 gap-3 xl:grid-cols-3">
      {sections.map(({ section, label }) => {
        // Group the section's own lines by subtype, which is the level of detail a summary wants.
        const groups = new Map<string, number>();
        for (const line of section.lines) {
          const key = line.account.accountSubtype ?? line.account.accountType;
          groups.set(key, (groups.get(key) ?? 0) + line.amountCents);
        }
        return (
          <section key={label} className="min-w-0 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <h2 className="border-b border-gray-200 pb-2 font-semibold text-gray-900">{label}</h2>
            <table className="mt-2 w-full border-collapse text-sm">
              <tbody>
                {[...groups.entries()].map(([subtype, cents]) => (
                  <tr key={subtype} className="border-b border-gray-100">
                    <td className="py-2 pr-3 text-gray-700">{subtype}</td>
                    <td className="py-2 text-right tabular-nums"><Money cents={cents} /></td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 font-semibold">
                  <td className="pt-2 pr-3">Total {label.toLowerCase()}</td>
                  <td className="pt-2 text-right tabular-nums"><Money cents={section.totalCents} /></td>
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

export function BalanceSheetVariantsPage({ variant: initialVariant }: { variant?: BalanceSheetVariant }) {
  const setView = useUiStore((s) => s.setView);
  const [variant, setVariant] = useState<BalanceSheetVariant>(initialVariant ?? 'summary');
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [comparativeDate, setComparativeDate] = useState(lastYearIso());

  const { data, loading, error } = useIpcQuery(
    () =>
      window.api.reports.balanceSheet({
        asOfDate,
        comparativeDate: variant === 'comparison' ? comparativeDate : undefined,
      }),
    [asOfDate, comparativeDate, variant],
  );

  // Detail mode nests accounts, so it needs the chart itself — the report sections carry balances
  // but say nothing about which account is a child of which.
  const { data: accounts } = useIpcQuery(() => window.api.accounts.list({ activeOnly: false }), []);

  const sections = useMemo(
    () =>
      data
        ? [
            { section: data.assets, label: 'Assets' },
            { section: data.liabilities, label: 'Liabilities' },
            { section: data.equity, label: 'Equity' },
          ]
        : [],
    [data],
  );

  /** Detail mode: order each section's accounts as a tree and roll every child's balance up into
   * its parent, so a parent shows the total of everything beneath it — the same arithmetic the
   * Chart of Accounts uses, rather than a second implementation that could disagree with it. */
  function detailRowsFor(section: Section) {
    if (!accounts) return [];
    const inSection = new Set(section.lines.map((l) => l.account.id));
    const sectionAccounts = (accounts as Account[]).filter((a) => inSection.has(a.id));
    const own = new Map(section.lines.map((l) => [l.account.id, l.amountCents]));
    const rolled = rollUpBalances(sectionAccounts, own);
    return buildAccountTree(sectionAccounts).map((node) => ({
      node,
      rolledCents: rolled.get(node.account.id) ?? 0,
      ownCents: own.get(node.account.id) ?? 0,
    }));
  }

  function drillDown(accountId: number) {
    setView({ kind: 'report', report: 'generalLedger', drillDown: { accountId, dateFrom: '2000-01-01', dateTo: asOfDate } });
  }

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(Object.keys(VARIANT_COPY) as BalanceSheetVariant[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVariant(v)}
            className={`rounded-full px-3 py-1 text-sm ${
              variant === v ? 'bg-brand-600 font-medium text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {VARIANT_COPY[v].label}
          </button>
        ))}
      </div>
      <p className="mb-3 text-sm text-gray-500">{VARIANT_COPY[variant].blurb}</p>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">As of</label>
        <DateInput value={asOfDate} onChange={setAsOfDate} className="w-32" />
        {variant === 'comparison' && (
          <>
            <label className="text-sm text-gray-600">Compared with</label>
            <DateInput value={comparativeDate} onChange={setComparativeDate} className="w-32" />
          </>
        )}
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {data && variant === 'summary' && <SummaryView sections={sections} />}

      {data && variant === 'detail' && (
        <table className="w-full border-collapse text-sm">
          <tbody>
            {sections.map(({ section, label }) => (
              <tbody key={label}>
                <tr>
                  <td className="px-3 pb-1 pt-4 text-sm font-semibold text-gray-900" colSpan={2}>
                    {label}
                  </td>
                </tr>
                {detailRowsFor(section).map(({ node, rolledCents, ownCents }) => (
                  <tr
                    key={node.account.id}
                    onClick={() => drillDown(node.account.id)}
                    className="cursor-pointer border-b border-gray-100 hover:bg-brand-50"
                  >
                    <td className="px-3 py-1.5" style={{ paddingLeft: `${0.75 + node.depth * 1.25}rem` }}>
                      <span className={node.hasChildren ? 'font-medium' : ''}>{node.account.name}</span>
                      {node.hasChildren && ownCents !== 0 && (
                        <span className="ml-2 text-xs text-gray-400">
                          own <Money cents={ownCents} />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      <Money cents={rolledCents} />
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-gray-300 font-semibold">
                  <td className="px-3 py-1.5">Total {label.toLowerCase()}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    <Money cents={section.totalCents} />
                  </td>
                </tr>
              </tbody>
            ))}
          </tbody>
        </table>
      )}

      {data && variant === 'comparison' && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 text-left font-medium">Account</th>
              <th className="px-3 py-2 text-right font-medium">{asOfDate}</th>
              <th className="px-3 py-2 text-right font-medium">{comparativeDate}</th>
              <th className="px-3 py-2 text-right font-medium">Change</th>
              <th className="px-3 py-2 text-right font-medium">%</th>
            </tr>
          </thead>
          {sections.map(({ section, label }) => (
            <tbody key={label}>
              <tr>
                <td className="px-3 pb-1 pt-4 text-sm font-semibold text-gray-900" colSpan={5}>
                  {label}
                </td>
              </tr>
              {section.lines.map((line) => {
                const before = line.comparativeAmountCents ?? 0;
                const change = line.amountCents - before;
                const pct = percentChange(line.amountCents, before);
                return (
                  <tr
                    key={line.account.id}
                    onClick={line.account.id !== -1 ? () => drillDown(line.account.id) : undefined}
                    className={`border-b border-gray-100 ${line.account.id !== -1 ? 'cursor-pointer hover:bg-brand-50' : ''}`}
                  >
                    <td className="px-3 py-1.5">{line.account.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      <Money cents={line.amountCents} />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                      <Money cents={before} />
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${change < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      <Money cents={change} />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                      {pct === null ? <span className="text-gray-300">—</span> : `${pct.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-gray-300 font-semibold">
                <td className="px-3 py-1.5">Total {label.toLowerCase()}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  <Money cents={section.totalCents} />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                  <Money cents={section.comparativeTotalCents ?? 0} />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  <Money cents={section.totalCents - (section.comparativeTotalCents ?? 0)} />
                </td>
                <td />
              </tr>
            </tbody>
          ))}
        </table>
      )}

      {data && (
        <p className={`mt-3 text-xs ${data.isBalanced ? 'text-gray-400' : 'text-red-600'}`}>
          {data.isBalanced
            ? 'Assets equal liabilities plus equity. Click any account to see the transactions behind it.'
            : 'This balance sheet does not balance — please report it.'}
        </p>
      )}
    </div>
  );
}
