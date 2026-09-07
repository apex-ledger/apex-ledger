import { useState } from 'react';
import { useUiStore, type View } from '../../app/store/uiStore';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import type { OverviewIssue } from '@shared/domain/review/clientOverview';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** The accountant's first look at a client file — the same three questions every review starts
 * with: is the company set up right, how far behind is the banking, and what is wrong that the
 * client's own screens would not have shown them. Nothing here is stored; it is worked out from
 * the books each time, so it can never disagree with a report. */

function todayIso(): string {
  return localIsoDate();
}

const GO: Record<OverviewIssue['go'], View> = {
  reconcile: { kind: 'banking', tab: 'reconcile' },
  deposits: { kind: 'sales', tab: 'deposits' },
  journal: { kind: 'journalList' },
  invoices: { kind: 'sales', tab: 'invoices' },
  bills: { kind: 'purchases', tab: 'unpaid' },
  chartOfAccounts: { kind: 'chartOfAccounts' },
  receipts: { kind: 'receiptInbox' },
  hst: { kind: 'report', report: 'hstFiling' },
  accounts: { kind: 'chartOfAccounts' },
};

const SEVERITY: Record<OverviewIssue['severity'], { label: string; tone: string }> = {
  high: { label: 'Fix first', tone: 'bg-rose-50 text-rose-800' },
  medium: { label: 'Review', tone: 'bg-amber-50 text-amber-800' },
  low: { label: 'Tidy up', tone: 'bg-sky-50 text-sky-800' },
};

export function ClientOverviewPage() {
  const setView = useUiStore((s) => s.setView);
  const [asOf, setAsOf] = useState(todayIso());
  const overview = useIpcQuery(() => window.api.clientOverview.get({ asOf }), [asOf]);
  const [setupOpen, setSetupOpen] = useState(false);
  const data = overview.data;

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold text-brand-900">Client overview</h1>
          {data && <p className="text-sm text-gray-500">{data.setup.legalName}</p>}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Review as of
          <input type="date" min={DATE_MIN} max={DATE_MAX} value={asOf} onChange={(e) => setAsOf(clampIsoDate(e.target.value))} className="rounded border border-gray-300 px-2 py-1 text-sm" />
        </label>
      </div>

      {overview.loading && <p className="text-sm text-gray-500">Looking through the books…</p>}
      {overview.error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{overview.error}</div>}

      {data && (
        <>
          <section className="rounded-xl border border-gray-200 bg-white">
            <button type="button" onClick={() => setSetupOpen(!setupOpen)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold uppercase tracking-wide text-gray-700" aria-expanded={setupOpen}>
              <span aria-hidden="true">{setupOpen ? '▾' : '▸'}</span> Company setup
            </button>
            {setupOpen && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-gray-100 px-3 py-2 text-sm md:grid-cols-4">
                <Fact label="Business type" value={data.setup.businessType ?? 'Not set'} warn={!data.setup.businessType} />
                <Fact label="Fiscal year end" value={data.setup.fiscalYearEnd} />
                <Fact label="Province" value={data.setup.province ?? 'Not set'} warn={!data.setup.province} />
                <Fact label="GST/HST number" value={data.setup.hstNumber ?? 'Not registered / not set'} warn={!data.setup.hstNumber} />
                <Fact label="Business number" value={data.setup.businessNumber ?? 'Not set'} warn={!data.setup.businessNumber} />
                <Fact label="Active accounts" value={String(data.setup.accountCount)} />
                <Fact label="Books cover" value={data.setup.firstEntryDate ? `${data.setup.firstEntryDate} to ${data.setup.lastEntryDate}` : 'No entries yet'} />
                <Fact label="Posted entries" value={String(data.setup.postedEntryCount)} />
              </dl>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="px-3 py-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Banking activity</h2>
              <p className="text-sm text-gray-500">How far each bank and card account is from being reconciled — the effort to bring the file up to date.</p>
            </div>
            {data.banking.length === 0 ? (
              <p className="border-t border-gray-100 px-3 py-2 text-sm text-gray-500">No bank or credit-card accounts yet.</p>
            ) : (
              <div className="overflow-x-auto border-t border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-2 font-medium">Account ({data.banking.length})</th>
                      <th className="px-4 py-2 text-right font-medium">In the books</th>
                      <th className="px-4 py-2 text-right font-medium">Unreconciled</th>
                      <th className="px-4 py-2 font-medium">Reconciled through</th>
                      <th className="px-4 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.banking.map((row) => (
                      <tr key={row.accountId} className="border-t border-gray-100">
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-900">{row.name}</div>
                          {row.attention && <div className="text-xs text-rose-700">⚠ {row.attention}</div>}
                        </td>
                        <td className={`px-4 py-2 text-right tabular-nums ${row.bookBalanceCents < 0 && row.kind === 'bank' ? 'text-rose-700' : ''}`}><Money cents={row.bookBalanceCents} /></td>
                        <td className="px-4 py-2 text-right tabular-nums">{row.unreconciledCount === 0 ? <span className="text-gray-400">none</span> : `${row.unreconciledCount} transactions`}</td>
                        <td className="px-4 py-2 tabular-nums text-gray-600">{row.reconciledThrough ?? 'Never reconciled'}</td>
                        <td className="px-4 py-2 text-right">
                          <button type="button" onClick={() => setView({ kind: 'banking', tab: 'reconcile' })} className="text-xs font-medium text-brand-700 hover:underline">Reconcile</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="px-3 py-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Common issues</h2>
              <p className="text-sm text-gray-500">What needs attention before the statements can be trusted. A clean file shows nothing here.</p>
            </div>
            {data.issues.length === 0 ? (
              <p className="border-t border-gray-100 px-3 py-2 text-sm text-emerald-800">Nothing found — undeposited funds, suspense, opening balances, receivables, payables, drafts, receipts and GST/HST all check out as of {data.asOf}.</p>
            ) : (
              <ul className="divide-y divide-gray-100 border-t border-gray-100">
                {data.issues.map((issue) => (
                  <li key={issue.key} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY[issue.severity].tone}`}>{SEVERITY[issue.severity].label}</span>
                        <span className="font-medium text-gray-900">{issue.title}</span>
                        {issue.amountCents !== undefined && <span className="tabular-nums text-gray-700"><Money cents={issue.amountCents} /></span>}
                      </div>
                      <p className="mt-0.5 text-sm text-gray-600">{issue.detail}</p>
                    </div>
                    <button type="button" onClick={() => setView(GO[issue.go])} className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Fact({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`font-medium ${warn ? 'text-amber-700' : 'text-gray-900'}`}>{value}</dd>
    </div>
  );
}
