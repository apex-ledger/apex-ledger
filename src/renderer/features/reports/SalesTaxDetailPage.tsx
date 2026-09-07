import { useState } from 'react';
import { AccountLink } from '../../components/DrillLinks';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';
import { openOriginalEntry } from '../../utils/openOriginalEntry';
import { OpenEntryButton } from '../../components/OpenEntryButton';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Every line behind a GST/HST return figure.
 *
 * The HST Centre gives the totals that go on the return; this gives what those totals are made of.
 * It is what CRA asks for when a return is queried, and what you check before filing — a total you
 * cannot break down is a total you cannot defend. */

function todayIso(): string {
  return localIsoDate();
}
function quarterStartIso(): string {
  const today = todayIso();
  const month = Number(today.slice(5, 7));
  const quarterFirstMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${today.slice(0, 4)}-${String(quarterFirstMonth).padStart(2, '0')}-01`;
}

/** `initial`: the period and side a figure was clicked on elsewhere (the Sales Tax Return screen),
 * so the transactions behind that exact number are what appears. */
export function SalesTaxDetailPage() {
  const setView = useUiStore((s) => s.setView);
  // Opened from a figure on the Sales Tax Return screen: start on that period and side, so the
  // transactions behind that exact number are what appears.
  const initial = useUiStore((s) => (s.view.kind === 'report' && s.view.report === 'salesTaxDetail' ? s.view.salesTax : undefined));
  const [periodStart, setPeriodStart] = useState(initial?.periodStart ?? quarterStartIso());
  const [periodEnd, setPeriodEnd] = useState(initial?.periodEnd ?? todayIso());
  const [side, setSide] = useState<'collected' | 'paid'>(initial?.side ?? 'collected');

  const { data, loading, error } = useIpcQuery(
    () => window.api.reports.salesTaxDetail({ periodStart, periodEnd }),
    [periodStart, periodEnd],
  );
  const { data: categoryData, loading: categoryLoading, error: categoryError } = useIpcQuery(
    () => window.api.reports.hstSummary({ periodStart, periodEnd }),
    [periodStart, periodEnd],
  );

  const lines = data ? (side === 'collected' ? data.collected : data.paid) : [];
  const summary = data ? (side === 'collected' ? data.byCodeCollected : data.byCodePaid) : [];
  const categoryRows = categoryData
    ? categoryData.byAccount.filter((row) => row.direction === (side === 'collected' ? 'collected' : 'itc'))
    : [];
  const taxableRevenueCents = categoryData?.byAccount.filter((row) => row.direction === 'collected').reduce((sum, row) => sum + row.baseAmountCents, 0) ?? 0;
  const taxablePurchaseCents = categoryData?.byAccount.filter((row) => row.direction === 'itc').reduce((sum, row) => sum + row.baseAmountCents, 0) ?? 0;

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">From</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <label className="text-sm text-gray-600">To</label>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
      </div>

      {(loading || categoryLoading) && <p className="text-sm text-gray-500">Loading…</p>}
      {(error || categoryError) && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error || categoryError}</div>}

      {data && categoryData && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: 'Taxable revenue', cents: taxableRevenueCents, tone: 'text-gray-900' },
            { label: 'GST/HST collected', cents: data.totalCollectedCents, tone: 'text-emerald-700' },
            { label: 'Taxable purchases / expenses', cents: taxablePurchaseCents, tone: 'text-gray-900' },
            { label: 'GST/HST paid (ITCs)', cents: data.totalPaidCents, tone: 'text-rose-700' },
            { label: data.netCents >= 0 ? 'Net to remit' : 'Net refund due', cents: Math.abs(data.netCents), tone: 'text-gray-900' },
          ].map((tile) => (
            <div key={tile.label} className="rounded border border-gray-200 bg-white px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-gray-500">{tile.label}</div>
              <div className={`mt-1 text-lg font-semibold tabular-nums ${tile.tone}`}>
                <Money cents={tile.cents} />
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.manualPendingCount > 0 && (
        <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {data.manualPendingCount} line{data.manualPendingCount === 1 ? '' : 's'} tagged "Manual" still {data.manualPendingCount === 1 ? 'has' : 'have'} no
          tax amount entered, so {data.manualPendingCount === 1 ? 'it is' : 'they are'} not in the figures above. Enter them before filing — treating them as
          zero is how a return goes out understated.
        </div>
      )}

      {data && (
        <div className="flex gap-2">
          {(['collected', 'paid'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                side === s ? 'bg-brand-100 text-brand-900 ring-1 ring-brand-300' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {s === 'collected' ? 'Collected from customers' : 'Paid to vendors'}
              <span className="ml-2 text-xs opacity-60">{s === 'collected' ? data.collected.length : data.paid.length}</span>
            </button>
          ))}
        </div>
      )}

      {data && categoryData && summary.length > 0 && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">
            {side === 'collected' ? 'Revenue categories where HST was collected' : 'Purchase / expense categories where ITC was paid'}
          </div>
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="px-3 py-2 text-right font-medium">{side === 'collected' ? 'Revenue amount' : 'Purchase amount'}</th>
                <th className="px-3 py-2 text-right font-medium">{side === 'collected' ? 'HST collected' : 'ITC paid'}</th>
              </tr>
            </thead>
            <tbody>
              {categoryRows.map((row) => (
                <tr key={`${row.account.id}:${row.direction}`} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-1.5"><AccountLink id={row.account.id} name={row.account.name} dateFrom={periodStart} dateTo={periodEnd} /></td>
                  <td className="px-3 py-1.5 text-right"><Money cents={row.baseAmountCents} /></td>
                  <td className="px-3 py-1.5 text-right font-medium"><Money cents={row.hstCents} /></td>
                </tr>
              ))}
              {categoryRows.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-2 text-center text-gray-400">No categories in this period.</td></tr>
              )}
            </tbody>
            {categoryRows.length > 0 && (
              <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right"><Money cents={side === 'collected' ? taxableRevenueCents : taxablePurchaseCents} /></td>
                  <td className="px-3 py-2 text-right"><Money cents={side === 'collected' ? data.totalCollectedCents : data.totalPaidCents} /></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {summary.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 text-left font-medium">Tax code</th>
              <th className="px-3 py-2 text-right font-medium">Lines</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-right font-medium">GST/HST</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.taxCode} className="border-b border-gray-100">
                <td className="px-3 py-1.5">{s.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{s.lineCount}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                  <Money cents={s.amountCents} />
                </td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                  <Money cents={s.gstHstCents} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {lines.length > 0 && (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-3 py-2">Date</th><EnteredTh className="px-3 py-2" />
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Tax code</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">GST/HST</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr
                  key={`${l.entryId}-${i}`}
                  onClick={() => void openOriginalEntry(l.entryId, setView)}
                  className="cursor-pointer border-b border-gray-100 hover:bg-brand-50"
                  title="Open this entry"
                >
                  <td className="px-3 py-1 text-gray-500">
                    <div className="flex items-center gap-2"><span>{l.entryDate}</span><OpenEntryButton entryId={l.entryId} /></div>
                  </td><EnteredTd at={l.createdAt} className="px-3 py-1.5" />
                  <td className="px-3 py-1">{l.accountName}</td>
                  <td className="px-3 py-1 text-gray-500">{l.contactName ?? l.memo ?? ''}</td>
                  <td className="px-3 py-1 text-xs text-gray-500">{l.taxCodeLabel}</td>
                  <td className="px-3 py-1 text-right tabular-nums text-gray-500">
                    <Money cents={l.amountCents} />
                  </td>
                  <td className="px-3 py-1 text-right font-medium tabular-nums">
                    <Money cents={l.gstHstCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && lines.length === 0 && !loading && (
        <p className="text-sm text-gray-500">
          No {side === 'collected' ? 'sales' : 'purchases'} with a tax code in this period.
        </p>
      )}

      <p className="text-xs text-gray-400">
        Only the federal GST/HST is counted. In British Columbia, Saskatchewan and Manitoba the provincial sales tax is filed with
        the province, and Quebec's QST goes to Revenu Québec — so a 12% BC purchase contributes its 5%, not its 12%. Click any line
        to open the entry behind it.
      </p>
    </div>
  );
}
