import { useMemo, useState } from 'react';
import { DateInput } from '../../components/DateInput';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { Money } from '../../components/Money';
import { PeriodPresetSelect } from '../../components/PeriodPresetSelect';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
}
function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

function Row({ label, cents, indent, bold, note }: { label: string; cents: number; indent?: boolean; bold?: boolean; note?: string }) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className={`px-3 py-1.5 ${indent ? 'pl-8 text-gray-600' : ''} ${bold ? 'font-semibold' : ''}`}>{label}</td>
      <td className={`px-3 py-1.5 text-right ${bold ? 'font-semibold' : ''}`}>
        <Money cents={cents} />
      </td>
      <td className="px-3 py-1.5 text-xs text-gray-400">{note}</td>
    </tr>
  );
}

export function HstReconciliationPage() {
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());

  const { data: incomeStatement, loading: loadingIs, error: errorIs } = useIpcQuery(
    () => window.api.reports.incomeStatement({ periodStart, periodEnd }),
    [periodStart, periodEnd],
  );
  const { data: hst, loading: loadingHst, error: errorHst } = useIpcQuery(
    () => window.api.reports.hstSummary({ periodStart, periodEnd }),
    [periodStart, periodEnd],
  );

  const loading = loadingIs || loadingHst;
  const error = errorIs ?? errorHst;

  const breakdown = useMemo(() => {
    if (!incomeStatement || !hst) return null;

    const totalSalesCents = incomeStatement.revenue.totalCents;
    const purchaseLines = incomeStatement.expenses.lines.filter((l) => l.account.accountSubtype === 'Cost of Sales');
    const expenseLines = incomeStatement.expenses.lines.filter((l) => l.account.accountSubtype !== 'Cost of Sales');
    const totalPurchasesCents = purchaseLines.reduce((s, l) => s + l.amountCents, 0);
    const totalExpensesCents = expenseLines.reduce((s, l) => s + l.amountCents, 0);

    const purchaseAccountIds = new Set(purchaseLines.map((l) => l.account.id));
    const itcRows = hst.byAccount.filter((r) => r.direction === 'itc');
    const hstOnPurchasesCents = itcRows.filter((r) => purchaseAccountIds.has(r.account.id)).reduce((s, r) => s + r.hstCents, 0);
    const hstOnExpensesCents = itcRows.filter((r) => !purchaseAccountIds.has(r.account.id)).reduce((s, r) => s + r.hstCents, 0);
    const hstCollectedCents = hst.byAccount.filter((r) => r.direction === 'collected').reduce((s, r) => s + r.hstCents, 0);

    const impliedSalesRate = totalSalesCents > 0 ? (hstCollectedCents / totalSalesCents) * 100 : null;

    return {
      totalSalesCents,
      totalPurchasesCents,
      totalExpensesCents,
      hstCollectedCents,
      hstOnPurchasesCents,
      hstOnExpensesCents,
      netPayableCents: hstCollectedCents - hstOnPurchasesCents - hstOnExpensesCents,
      impliedSalesRate,
      manualCount: hst.manualReviewLines.length,
    };
  }, [incomeStatement, hst]);

  return (
    <div className="w-full">
      <div className="mb-3 rounded border border-gold-200 bg-gold-50 px-3 py-2 text-sm text-gold-800">
        A double-check view: the underlying Sales/Purchases/Expenses totals for this period next to the HST figures
        calculated from them, so you can sanity-check that the HST math lines up with the real activity. Same 13%
        tax-inclusive assumption as HST Payable, and "Manual HST" lines are excluded here too.
      </div>

      <div className="mb-3 flex items-center gap-3">
        <label className="text-sm text-gray-600">Period</label>
        <DateInput value={periodStart} onChange={setPeriodStart} className="w-32" />
        <span className="text-sm text-gray-400">to</span>
        <DateInput value={periodEnd} onChange={setPeriodEnd} className="w-32" />
        <PeriodPresetSelect
          referenceDateIso={periodStart}
          onSelect={(range) => {
            setPeriodStart(range.from);
            setPeriodEnd(range.to);
          }}
        />
      </div>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {breakdown && (
        <div className="space-y-3">
          <div className="rounded border border-gray-200 bg-white">
            <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">Activity Totals</h3>
            <table className="w-full border-collapse text-sm">
              <tbody>
                <Row label="Total Sales" cents={breakdown.totalSalesCents} bold />
                <Row label="Total Purchases (Cost of Sales)" cents={breakdown.totalPurchasesCents} bold />
                <Row label="Total Operating Expenses" cents={breakdown.totalExpensesCents} bold />
              </tbody>
            </table>
          </div>

          <div className="rounded border border-gray-200 bg-white">
            <h3 className="border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700">HST Calculated From That Activity</h3>
            <table className="w-full border-collapse text-sm">
              <tbody>
                <Row
                  label="HST Earned on Sale"
                  cents={breakdown.hstCollectedCents}
                  bold
                  note={breakdown.impliedSalesRate !== null ? `≈ ${breakdown.impliedSalesRate.toFixed(1)}% of total sales` : undefined}
                />
                <Row label="HST Paid on Purchases" cents={breakdown.hstOnPurchasesCents} bold />
                <Row label="ITC on Expenses" cents={breakdown.hstOnExpensesCents} bold />
                <Row label="Net HST Payable" cents={breakdown.netPayableCents} bold />
              </tbody>
            </table>
          </div>

          {breakdown.impliedSalesRate !== null && Math.abs(breakdown.impliedSalesRate - 100 * (13 / 113)) > 3 && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              HST collected is {breakdown.impliedSalesRate.toFixed(1)}% of total sales, noticeably off from the ~11.5% you'd
              expect if every sale were fully taxable at 13% tax-inclusive. That's normal if some sales are zero-rated/exempt
              or untagged — but worth a quick look if it surprises you.
            </div>
          )}

          {breakdown.manualCount > 0 && (
            <p className="text-sm text-amber-600">
              {breakdown.manualCount} transaction{breakdown.manualCount === 1 ? '' : 's'} tagged "Manual HST" are excluded from
              the figures above — see the HST Payable report for that list.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
