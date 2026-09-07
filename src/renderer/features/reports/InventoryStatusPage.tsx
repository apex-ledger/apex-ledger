import { useState } from 'react';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Stock on hand and what it is worth, as of any date.
 *
 * The as-of date is the point of this report rather than a convenience: run it at a past year end
 * and it gives the closing inventory figure that belonged on that balance sheet, worked out from
 * the movement history instead of from a number typed in at the time. */

function todayIso(): string {
  return localIsoDate();
}

export function InventoryStatusPage() {
  const setView = useUiStore((s) => s.setView);
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [hideEmpty, setHideEmpty] = useState(false);

  const { data, loading, error } = useIpcQuery(() => window.api.inventory.status({ asOfDate }), [asOfDate]);

  const rows = (data?.rows ?? []).filter((r) => !hideEmpty || r.quantityOnHand !== 0);

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">As of</label>
        <DateInput value={asOfDate} onChange={setAsOfDate} className="w-32" />
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
          Hide products with no stock
        </label>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {data && data.rows.length === 0 && !loading && (
        <div className="rounded border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
          No products are being tracked yet. Add them under Inventory → Products, then record an opening count or the first
          purchase and this report fills in.
        </div>
      )}

      {data && data.negativeStockCount > 0 && (
        <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {data.negativeStockCount} product{data.negativeStockCount === 1 ? ' has' : 's have'} negative stock — more has been sold
          than was ever recorded as received. Those values are estimates until an opening count or the missing purchases go in.
        </div>
      )}

      {rows.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 text-left font-medium">SKU</th>
              <th className="px-3 py-2 text-left font-medium">Product</th>
              <th className="px-3 py-2 text-right font-medium">On hand</th>
              <th className="px-3 py-2 text-right font-medium">Average cost</th>
              <th className="px-3 py-2 text-right font-medium">Value</th>
              <th className="px-3 py-2 text-right font-medium">Sale price</th>
              <th className="px-3 py-2 text-right font-medium">Retail value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.productId} className="border-b border-gray-100">
                <td className="px-3 py-1.5 font-mono text-xs text-gray-500">{r.sku ?? '—'}</td>
                <td className="px-3 py-1.5">
                  {r.name}
                  {r.wentNegative && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800" title="More issued than received">
                      estimate
                    </span>
                  )}
                </td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${r.quantityOnHand < 0 ? 'text-rose-700' : ''}`}>
                  {r.quantityOnHand} <span className="text-xs text-gray-400">{r.unit}</span>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                  <Money cents={r.averageCostCents} />
                </td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                  <Money cents={r.totalValueCents} />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                  <Money cents={r.salePriceCents} />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                  <Money cents={Math.round(r.quantityOnHand * r.salePriceCents)} />
                </td>
              </tr>
            ))}
            <tr className="border-t border-gray-300 font-semibold">
              <td className="px-3 py-2" colSpan={4}>
                Total at cost
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                <Money cents={data!.totalValueCents} />
              </td>
              <td />
              <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                <Money cents={rows.reduce((sum, r) => sum + Math.round(r.quantityOnHand * r.salePriceCents), 0)} />
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <p className="text-xs text-gray-400">
        Valued at moving weighted average cost: every receipt re-averages what is on hand, and every issue leaves at that average.
        Run this at a past year end to get the closing inventory figure for that balance sheet.{' '}
        <button type="button" onClick={() => setView({ kind: 'products' })} className="text-brand-600 hover:underline">
          Manage products →
        </button>
      </p>
    </div>
  );
}
