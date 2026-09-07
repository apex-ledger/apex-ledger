import { useMemo } from 'react';
import type { Contact } from '@shared/domain/types';
import type { Product } from '../../../preload/index';
import { useUiStore } from '../../app/store/uiStore';
import { Money } from '../../components/Money';

export interface ReorderRow {
  product: Product;
  quantityOnHand: number;
  suggestedQuantity: number;
  vendor: Contact | null;
}

/** What to reorder: every counted item at or below its reorder point, the quantity the item
 * master suggests, and one "Create PO" per preferred vendor with those items already on it. */
export function reorderRows(products: Product[], onHand: Map<number, number>, vendors: Contact[]): ReorderRow[] {
  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  return products
    .filter((p) => p.isActive && p.trackQuantity && p.reorderPoint > 0 && (onHand.get(p.id) ?? 0) <= p.reorderPoint)
    .map((p) => {
      const qty = onHand.get(p.id) ?? 0;
      // Suggest the reorder quantity, or enough to get back above the reorder point, whichever is more.
      const toPoint = Math.max(0, p.reorderPoint - qty + 1);
      const suggested = Math.max(p.reorderQuantity ?? 0, toPoint, p.minimumOrderQuantity ?? 0);
      return { product: p, quantityOnHand: qty, suggestedQuantity: suggested, vendor: p.preferredVendorId ? vendorById.get(p.preferredVendorId) ?? null : null };
    })
    .sort((a, b) => (a.vendor?.name ?? '~').localeCompare(b.vendor?.name ?? '~') || a.product.name.localeCompare(b.product.name));
}

export function ReorderPanel({ products, onHand, vendors }: { products: Product[]; onHand: Map<number, number>; vendors: Contact[] }) {
  const setView = useUiStore((s) => s.setView);
  const rows = useMemo(() => reorderRows(products, onHand, vendors), [products, onHand, vendors]);
  if (rows.length === 0) return null;

  const byVendor = new Map<string, ReorderRow[]>();
  for (const r of rows) {
    const key = r.vendor ? String(r.vendor.id) : 'none';
    byVendor.set(key, [...(byVendor.get(key) ?? []), r]);
  }

  function createPo(group: ReorderRow[]) {
    const vendorId = group[0].vendor?.id ?? null;
    setView({ kind: 'purchaseOrderEditor', id: 'new', prefill: { vendorId, lines: group.map((r) => ({ productId: r.product.id, quantity: r.suggestedQuantity })) } });
  }

  return (
    <section className="rounded-xl border border-orange-200 bg-orange-50 p-3" data-testid="reorder-panel">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-orange-900">Reorder list <span className="ml-1 text-xs font-normal text-orange-700">{rows.length} item{rows.length === 1 ? '' : 's'} at or below reorder point</span></div>
          <div className="text-xs text-orange-800">Suggested quantity is the item's reorder quantity, at least its minimum order, and enough to get back above the reorder point.</div>
        </div>
        <div className="flex flex-wrap gap-1">
          {[...byVendor.entries()].map(([key, group]) => (
            <button key={key} type="button" onClick={() => createPo(group)} className="rounded-full bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-500">
              Create PO{group[0].vendor ? ` — ${group[0].vendor.name}` : ' (no preferred vendor)'} · {group.length}
            </button>
          ))}
        </div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-orange-800">
            <th className="py-1">Item</th>
            <th className="py-1">Preferred vendor</th>
            <th className="py-1 text-right">On hand</th>
            <th className="py-1 text-right">Reorder point</th>
            <th className="py-1 text-right">Suggest</th>
            <th className="py-1 text-right">Lead time</th>
            <th className="py-1 text-right">Est. cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-orange-100">
          {rows.map((r) => (
            <tr key={r.product.id} className="text-gray-800">
              <td className="py-1 pr-2">{r.product.name}{r.product.sku ? <span className="ml-1 font-mono text-gray-400">{r.product.sku}</span> : null}</td>
              <td className="py-1 pr-2 text-gray-600">{r.vendor?.name ?? '—'}</td>
              <td className={`py-1 text-right tabular-nums ${r.quantityOnHand <= 0 ? 'font-semibold text-rose-700' : ''}`}>{r.quantityOnHand}</td>
              <td className="py-1 text-right tabular-nums">{r.product.reorderPoint}</td>
              <td className="py-1 text-right tabular-nums font-medium">{r.suggestedQuantity} {r.product.unit}</td>
              <td className="py-1 text-right tabular-nums text-gray-600">{r.product.leadTimeDays ? `${r.product.leadTimeDays} d` : '—'}</td>
              <td className="py-1 text-right tabular-nums"><Money cents={Math.round(r.product.purchasePriceCents * r.suggestedQuantity)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
