import { UnitSelect } from '../../components/UnitSelect';
import { CategorySelect } from './CategorySelect';
import { categoriesInUse } from '@shared/domain/inventory/productCatalogue';
import { useEffect, useRef, useMemo, useState } from 'react';
import { useUiStore } from '../../app/store/uiStore';
import type { Account, TaxCode } from '@shared/domain/types';
import type { InventoryMovementRow, Product } from '../../../preload/index';
import { AccountCombobox } from '../../components/AccountCombobox';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { Modal } from '../../components/Modal';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { ReportActions } from '../../components/ReportActions';
import { TAX_CODE_SELECT_OPTIONS } from '@shared/domain/ledger/taxCodes';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS, productTypeOf, type ProductType } from '@shared/domain/inventory/productCatalogue';
import { ItemMasterModal } from './ItemMasterModal';
import { ReorderPanel } from './ReorderPanel';
import type { Contact } from '@shared/domain/types';

/** The product list, edited in place, with each product's stock movements behind it.
 *
 * Stock on hand is never typed. It is the sum of the movements, so it cannot be set to a figure the
 * history does not support — which is the whole reason inventory reports go wrong. To correct a
 * count you record the correction as its own movement, and the trail of why the number changed
 * survives.
 */

const KIND_LABELS: Record<string, string> = {
  opening: 'Opening count',
  purchase: 'Purchase / received',
  sale: 'Sold / issued',
  adjustment: 'Adjustment / shrinkage',
};

function todayIso(): string {
  return localIsoDate();
}

const BLANK_PRODUCT = { sku: '', barcode: '', name: '', productType: 'inventory' as ProductType, category: '', unit: 'each', salePriceCents: 0, purchasePriceCents: 0, defaultTaxCode: null as TaxCode | null, reorderPoint: 0 };

export function ProductsPage() {
  // Anything on this screen can be taken to a spreadsheet, same as a report.
  const exportRef = useRef<HTMLDivElement>(null);
  const { data: products, loading, error: loadError, reload } = useIpcQuery(() => window.api.products.list({}), []);
  const { data: accounts } = useIpcQuery(() => window.api.accounts.list({ activeOnly: true }), []);
  const { data: status, reload: reloadStatus } = useIpcQuery(() => window.api.inventory.status({ asOfDate: todayIso() }), []);

  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(BLANK_PRODUCT);
  const [itemFor, setItemFor] = useState<Product | null>(null);
  const [vendors, setVendors] = useState<Contact[]>([]);
  useEffect(() => {
    window.api.vendors.list({}).then((r) => r.ok && setVendors(r.data));
  }, []);
  const [adding, setAdding] = useState(false);
  const [movementsFor, setMovementsFor] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'inventory' | 'services' | 'low' | 'out' | 'negative' | 'inactive'>('all');
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [tab, setTab] = useState<'products' | 'adjustments'>('products');
  const [adjustFor, setAdjustFor] = useState<Product | null>(null);
  const pendingSearchTerm = useUiStore((s) => s.pendingSearchTerm);
  const setPendingSearchTerm = useUiStore((s) => s.setPendingSearchTerm);
  useEffect(() => {
    if (!pendingSearchTerm) return;
    setSearch(pendingSearchTerm);
    setPendingSearchTerm(null);
  }, [pendingSearchTerm, setPendingSearchTerm]);

  const onHand = useMemo(
    () => new Map((status?.rows ?? []).map((r) => [r.productId, r])),
    [status],
  );
  const onHandQty = useMemo(() => new Map([...onHand.entries()].map(([k, v]) => [k, v.quantityOnHand])), [onHand]);

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (products ?? []).filter((product) => {
      const quantity = onHand.get(product.id)?.quantityOnHand ?? 0;
      const matchesSearch = !needle || product.name.toLowerCase().includes(needle) || (product.sku ?? '').toLowerCase().includes(needle) || (product.barcode ?? '').toLowerCase().includes(needle);
      const matchesStock =
        stockFilter === 'all' ||
        (stockFilter === 'inventory' && product.isActive && product.trackQuantity) ||
        (stockFilter === 'services' && product.isActive && !product.trackQuantity) ||
        (stockFilter === 'low' && product.isActive && product.trackQuantity && quantity > 0 && quantity <= product.reorderPoint) ||
        (stockFilter === 'out' && product.isActive && product.trackQuantity && quantity === 0) ||
        (stockFilter === 'negative' && product.isActive && product.trackQuantity && quantity < 0) ||
        (stockFilter === 'inactive' && !product.isActive);
      return matchesSearch && matchesStock;
    });
  }, [onHand, products, search, stockFilter]);

  const outOfStockCount = (products ?? []).filter((product) => product.isActive && product.trackQuantity && (onHand.get(product.id)?.quantityOnHand ?? 0) === 0).length;
  const negativeStockCount = (products ?? []).filter((product) => product.isActive && product.trackQuantity && (onHand.get(product.id)?.quantityOnHand ?? 0) < 0).length;
  const lowStockCount = (products ?? []).filter((product) => product.isActive && product.trackQuantity && (onHand.get(product.id)?.quantityOnHand ?? 0) > 0 && (onHand.get(product.id)?.quantityOnHand ?? 0) <= product.reorderPoint).length;

  async function addProduct() {
    if (!draft.name.trim()) return setError('Enter a product name.');
    setAdding(true);
    const result = await window.api.products.create({
      sku: draft.sku.trim() || null,
      barcode: draft.barcode.trim() || null,
      name: draft.name.trim(),
      description: null,
      unit: draft.unit.trim() || 'each',
      salePriceCents: draft.salePriceCents,
      purchasePriceCents: draft.purchasePriceCents,
      incomeAccountId: null,
      cogsAccountId: null,
      assetAccountId: null,
      trackQuantity: draft.productType === 'inventory',
      productType: draft.productType,
      category: draft.category.trim() || null,
      defaultTaxCode: draft.defaultTaxCode,
      reorderPoint: draft.reorderPoint,
    });
    setAdding(false);
    if (!result.ok) return setError(result.error);
    setError(null);
    setDraft(BLANK_PRODUCT);
    reload();
  }

  async function patchProduct(product: Product, patch: Record<string, unknown>) {
    const result = await window.api.products.update({ id: product.id, patch });
    if (!result.ok) return setError(result.error);
    setError(null);
    reload();
  }

  /** A copy to edit — the fastest way to add the second size or colour of something. */
  async function duplicateProduct(product: Product) {
    const result = await window.api.products.create({
      sku: null,
      barcode: null,
      name: `${product.name} (copy)`,
      description: product.description ?? null,
      unit: product.unit,
      salePriceCents: product.salePriceCents,
      purchasePriceCents: product.purchasePriceCents,
      incomeAccountId: product.incomeAccountId,
      cogsAccountId: product.cogsAccountId,
      assetAccountId: product.assetAccountId,
      trackQuantity: product.trackQuantity,
      defaultTaxCode: product.defaultTaxCode,
      reorderPoint: product.reorderPoint,
    });
    if (!result.ok) return setError(result.error);
    setError(null);
    setSearch(`${product.name} (copy)`);
    reload();
  }

  async function removeProduct(product: Product) {
    if (!window.confirm(`${product.isActive ? 'Remove' : 'Delete'} the product “${product.name}”? Products with stock history will be made inactive; products without history will be permanently deleted.`)) return;
    const result = await window.api.products.delete(product.id);
    if (!result.ok) return setError(result.error);
    // A product with movement history is retired rather than deleted — removing it would rewrite
    // past valuations. Say which happened rather than leaving the row's fate ambiguous.
    setError(result.data.deactivated ? `"${product.name}" has stock history, so it was made inactive rather than deleted.` : null);
    reload();
  }

  const cell =
    'w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm hover:border-gray-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500';

  return (
    <div ref={exportRef}>
      <ReportActions targetRef={exportRef} reportName="Products and Inventory" />
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-xs text-gray-500">
          What you buy and sell. Quantity on hand comes from the movements behind each product; to correct a count, record the correction. Edit any cell directly.
        </p>
        {status && (
          <div className="text-sm text-gray-600">
            Stock value today <span className="ml-1 font-semibold tabular-nums text-gray-900"><Money cents={status.totalValueCents} /></span>
          </div>
        )}
      </div>

      {(products ?? []).some((p) => p.trackQuantity && (!p.assetAccountId || !p.cogsAccountId)) && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Some products have no <span className="font-medium">Inventory</span> or{' '}
          <span className="font-medium">Cost of goods sold</span> account set. Their stock is still tracked, but their movements
          post nothing to the books — so the balance sheet will not show the stock. Set both columns to fix it.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm" role="tablist" aria-label="Inventory views">
          <button type="button" role="tab" aria-selected={tab === 'products'} onClick={() => setTab('products')} className={`rounded-md px-3 py-1 ${tab === 'products' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>Products</button>
          <button type="button" role="tab" aria-selected={tab === 'adjustments'} onClick={() => setTab('adjustments')} className={`rounded-md px-3 py-1 ${tab === 'adjustments' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>Adjustments</button>
        </div>
        {tab === 'products' && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button type="button" onClick={() => setStockFilter('all')} className={`rounded-full border px-2.5 py-1 ${stockFilter === 'all' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-gray-200 bg-white text-gray-700'}`}>Products <span className="font-bold">{(products ?? []).length}</span></button>
            <button type="button" onClick={() => setStockFilter('low')} className={`rounded-full border px-2.5 py-1 ${stockFilter === 'low' ? 'border-orange-300 bg-orange-50 text-orange-900' : 'border-gray-200 bg-white text-gray-700'}`}>At/below reorder <span className="font-bold text-orange-800">{lowStockCount}</span></button>
            <button type="button" onClick={() => setStockFilter('out')} className={`rounded-full border px-2.5 py-1 ${stockFilter === 'out' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-gray-200 bg-white text-gray-700'}`}>Out of stock <span className="font-bold text-amber-800">{outOfStockCount}</span></button>
            <button type="button" onClick={() => setStockFilter('negative')} className={`rounded-full border px-2.5 py-1 ${stockFilter === 'negative' ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-gray-200 bg-white text-gray-700'}`}>Negative stock <span className="font-bold text-rose-800">{negativeStockCount}</span></button>
          </div>
        )}
      </div>

      {tab === 'adjustments' && <AdjustmentsTab products={products ?? []} onOpen={(product) => setMovementsFor(product)} />}

      {tab === 'products' && <>

      <ReorderPanel products={products ?? []} onHand={onHandQty} vendors={vendors} />

      {(error || loadError) && (
        <div className="flex items-start justify-between gap-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error ?? loadError}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 text-red-500 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by product name, SKU or barcode" className="w-80 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
        <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as typeof stockFilter)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm">
          <option value="all">All products</option>
          <option value="inventory">Inventory items (stock tracked)</option>
          <option value="low">At/below reorder point</option>
          <option value="out">Out of stock</option>
          <option value="negative">Negative stock</option>
          <option value="services">Services (no stock)</option>
<option value="inactive">Inactive</option>
        </select>
        <span className="text-sm text-gray-500">{filteredProducts.length} shown</span>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full min-w-[2000px] text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="w-20 px-2 py-2" />
              <th className="w-36 px-3 py-2">SKU</th>
              <th className="w-44 px-3 py-2">Barcode / UPC</th>
              <th className="min-w-[18rem] px-3 py-2">Name</th>
              <th className="w-40 px-3 py-2">Type</th>
              <th className="w-44 px-3 py-2">Category</th>
              <th className="w-28 px-3 py-2">Unit</th>
              <th className="w-32 px-3 py-2 text-right">Sale price</th>
              <th className="w-48 px-3 py-2">Default tax</th>
              <th className="w-32 px-3 py-2 text-right">Purchase cost</th>
              <th className="w-24 px-3 py-2 text-right">On hand</th>
              <th className="w-24 px-3 py-2 text-right">Reorder at</th>
              <th className="w-28 px-3 py-2 text-right">Avg cost</th>
              <th className="w-28 px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2" title="Where the sale is recorded">Income account</th>
              <th className="px-3 py-2" title="Where the stock sits on the balance sheet until it is sold">Inventory account</th>
              <th className="px-3 py-2" title="Where its cost goes when it leaves">Cost of goods sold</th>
              <th className="w-32 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-200 bg-brand-50/40">
              {/* First column, not last: on a wide sheet the last column is off-screen until you
                  scroll, and a button you have to hunt for is not there. */}
              <td className="px-2 py-1.5">
                <button
                  type="button"
                  disabled={adding}
                  onClick={() => void addProduct()}
                  className="w-full rounded bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {adding ? 'Adding…' : 'Add'}
                </button>
              </td>
              <td className="px-3 py-1.5">
                <input className={cell} placeholder="optional" value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} />
              </td>
              <td className="px-3 py-1.5">
                <input className={cell} placeholder="scan or type" value={draft.barcode} onChange={(e) => setDraft({ ...draft, barcode: e.target.value })} />
              </td>
              <td className="px-3 py-1.5">
                <input
                  className={cell}
                  placeholder="New product…"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void addProduct();
                  }}
                />
              </td>
              <td className="px-3 py-1.5">
                <select className={cell} value={draft.productType} onChange={(e) => setDraft({ ...draft, productType: e.target.value as ProductType })} aria-label="New product type">
                  {PRODUCT_TYPES.filter((type) => type !== 'bundle').map((type) => <option key={type} value={type}>{PRODUCT_TYPE_LABELS[type]}</option>)}
                </select>
              </td>
              <td className="px-3 py-1.5">
                <CategorySelect className={cell} value={draft.category} onChange={(category) => setDraft({ ...draft, category })} inUse={categoriesInUse(products ?? [])} ariaLabel="New product category" placeholder="optional" />
              </td>
              <td className="px-3 py-1.5">
                <UnitSelect className={cell} value={draft.unit} onChange={(unit) => setDraft({ ...draft, unit })} />
              </td>
              <td className="px-3 py-1.5">
                <input
                  type="text"
                  inputMode="decimal"
                  className={`${cell} text-right tabular-nums`}
                  defaultValue="0.00"
                  onBlur={(e) => setDraft({ ...draft, salePriceCents: Math.round((Number(e.target.value.replace(/[^0-9.-]/g, '')) || 0) * 100) })}
                />
              </td>
              <td className="px-3 py-1.5">
                <select className={cell} value={draft.defaultTaxCode ?? ''} onChange={(e) => setDraft({ ...draft, defaultTaxCode: (e.target.value || null) as TaxCode | null })}>
                  <option value="">Company default (line tax)</option>{TAX_CODE_SELECT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </td>
              <td className="px-3 py-1.5">
                <input type="text" inputMode="decimal" className={`${cell} text-right tabular-nums`} defaultValue="0.00" onBlur={(e) => setDraft({ ...draft, purchasePriceCents: Math.round((Number(e.target.value.replace(/[^0-9.-]/g, '')) || 0) * 100) })} />
              </td>
              <td />
              <td className="px-3 py-1.5">
                <input type="number" min="0" step="any" className={`${cell} text-right`} value={draft.reorderPoint} onChange={(e) => setDraft({ ...draft, reorderPoint: Math.max(0, Number(e.target.value) || 0) })} />
              </td>
              <td colSpan={6} />
            </tr>

            {loading && (
              <tr>
                <td colSpan={18} className="px-3 py-6 text-center text-sm text-gray-400">
                  Loading…
                </td>
              </tr>
            )}

            {!loading && (products ?? []).length === 0 && (
              <tr>
                <td colSpan={18} className="px-3 py-5 text-center text-sm text-gray-400">
                  No products yet. Add one above to start tracking stock.
                </td>
              </tr>
            )}

            {!loading && (products ?? []).length > 0 && filteredProducts.length === 0 && (
              <tr>
                <td colSpan={18} className="px-3 py-5 text-center text-sm text-gray-400">
                  No products match this search and stock filter.
                </td>
              </tr>
            )}

            {filteredProducts.map((p) => {
              const stock = onHand.get(p.id);
              return (
                <tr key={p.id} className={`border-b border-gray-100 last:border-0 ${p.isActive ? '' : 'opacity-50'}`}>
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => setItemFor(p)} className="w-full rounded border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100" title="Item master: sales, purchasing, inventory and bundle details">
                      Open
                    </button>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className={`${cell} font-mono text-xs`}
                      defaultValue={p.sku ?? ''}
                      placeholder="—"
                      onBlur={(e) => {
                        const next = e.target.value.trim() || null;
                        if (next !== (p.sku ?? null)) void patchProduct(p, { sku: next });
                      }}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className={`${cell} font-mono text-xs`}
                      defaultValue={p.barcode ?? ''}
                      placeholder="—"
                      onBlur={(e) => {
                        const next = e.target.value.trim() || null;
                        if (next !== (p.barcode ?? null)) void patchProduct(p, { barcode: next });
                      }}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className={`${cell} font-medium`}
                      defaultValue={p.name}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (!next) {
                          e.target.value = p.name;
                          return;
                        }
                        if (next !== p.name) void patchProduct(p, { name: next });
                      }}
                    />
                  </td>
                  <td className="px-3 py-1.5" data-testid="product-type-cell">
                    <select value={productTypeOf(p)} onChange={(e) => void patchProduct(p, { productType: e.target.value as ProductType, trackQuantity: e.target.value === 'inventory' })} className="w-full rounded border border-gray-200 bg-white px-1 py-0.5 text-xs">
                      {PRODUCT_TYPES.map((type) => <option key={type} value={type}>{PRODUCT_TYPE_LABELS[type]}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <CategorySelect value={p.category ?? ''} onChange={(next) => { if ((next.trim() || null) !== (p.category ?? null)) void patchProduct(p, { category: next.trim() || null }); }} inUse={categoriesInUse(products ?? [])} className={`${cell} text-xs`} ariaLabel={`${p.name} category`} placeholder="—" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className={cell}
                      defaultValue={p.unit}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== p.unit) void patchProduct(p, { unit: e.target.value.trim() });
                      }}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      className={`${cell} text-right tabular-nums`}
                      defaultValue={(p.salePriceCents / 100).toFixed(2)}
                      onBlur={(e) => {
                        const cents = Math.round((Number(e.target.value.replace(/[^0-9.-]/g, '')) || 0) * 100);
                        e.target.value = (cents / 100).toFixed(2);
                        if (cents !== p.salePriceCents) void patchProduct(p, { salePriceCents: cents });
                      }}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select className={cell} value={p.defaultTaxCode ?? ''} onChange={(e) => void patchProduct(p, { defaultTaxCode: e.target.value || null })}>
                          <option value="">Company default (line tax)</option>{TAX_CODE_SELECT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      className={`${cell} text-right tabular-nums`}
                      defaultValue={(p.purchasePriceCents / 100).toFixed(2)}
                      onBlur={(e) => {
                        const cents = Math.round((Number(e.target.value.replace(/[^0-9.-]/g, '')) || 0) * 100);
                        e.target.value = (cents / 100).toFixed(2);
                        if (cents !== p.purchasePriceCents) void patchProduct(p, { purchasePriceCents: cents });
                      }}
                    />
                  </td>
                  {/* Derived, so deliberately not an input. */}
                  <td className={`px-3 py-1.5 text-right tabular-nums ${stock && stock.quantityOnHand < 0 ? 'text-rose-700' : ''}`}>
                    {stock ? stock.quantityOnHand : 0}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className={`${cell} text-right tabular-nums`}
                      defaultValue={p.reorderPoint}
                      onBlur={(e) => {
                        const next = Math.max(0, Number(e.target.value) || 0);
                        e.target.value = String(next);
                        if (next !== p.reorderPoint) void patchProduct(p, { reorderPoint: next });
                      }}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                    {stock ? <Money cents={stock.averageCostCents} /> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    {stock ? <Money cents={stock.totalValueCents} /> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    <AccountCombobox
                      options={(accounts ?? [])
                        .filter((a: Account) => a.accountType === 'Revenue')
                        .map((a: Account) => ({ value: String(a.id), label: a.name, sublabel: a.accountType }))}
                      value={p.incomeAccountId ? String(p.incomeAccountId) : null}
                      onChange={(v) => void patchProduct(p, { incomeAccountId: v ? Number(v) : null })}
                      placeholder="Select…"
                      accounts={(accounts ?? []) as Account[]}
                      initialType="Revenue"
                      addNewLabel="+ New income account"
                      onAccountCreated={(created) => void patchProduct(p, { incomeAccountId: created.id })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <AccountCombobox
                      options={(accounts ?? [])
                        .filter((a: Account) => a.accountType === 'Asset')
                        .map((a: Account) => ({ value: String(a.id), label: a.name, sublabel: a.accountType }))}
                      value={p.assetAccountId ? String(p.assetAccountId) : null}
                      onChange={(v) => void patchProduct(p, { assetAccountId: v ? Number(v) : null })}
                      placeholder="Needed to post…"
                      accounts={(accounts ?? []) as Account[]}
                      initialType="Asset"
                      addNewLabel="+ New inventory account"
                      onAccountCreated={(created) => void patchProduct(p, { assetAccountId: created.id })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <AccountCombobox
                      options={(accounts ?? [])
                        .filter((a: Account) => a.accountType === 'Expense')
                        .map((a: Account) => ({ value: String(a.id), label: a.name, sublabel: a.accountType }))}
                      value={p.cogsAccountId ? String(p.cogsAccountId) : null}
                      onChange={(v) => void patchProduct(p, { cogsAccountId: v ? Number(v) : null })}
                      placeholder="Needed to post…"
                      accounts={(accounts ?? []) as Account[]}
                      initialType="Expense"
                      addNewLabel="+ New cost of sales account"
                      onAccountCreated={(created) => void patchProduct(p, { cogsAccountId: created.id })}
                    />
                  </td>
                  <td className="relative px-3 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => setMovementsFor(p)} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50">
                        Edit
                      </button>
                      <button
                        type="button"
                        aria-label={`Actions for ${p.name}`}
                        aria-expanded={menuFor === p.id}
                        onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                        className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        ▾
                      </button>
                    </div>
                    {menuFor === p.id && (
                      <div role="menu" className="absolute right-3 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 text-left text-sm shadow-lg">
                        {p.trackQuantity && (
                          <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setAdjustFor(p); setMovementsFor(p); }} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50">
                            Adjust quantity
                          </button>
                        )}
                        <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setMovementsFor(p); }} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50">
                          Stock movements
                        </button>
                        <button type="button" role="menuitem" onClick={() => { setMenuFor(null); void duplicateProduct(p); }} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50">
                          Duplicate
                        </button>
                        <button type="button" role="menuitem" onClick={() => { setMenuFor(null); void patchProduct(p, { isActive: !p.isActive }); }} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50">
                          {p.isActive ? 'Make inactive' : 'Make active'}
                        </button>
                        <button type="button" role="menuitem" onClick={() => { setMenuFor(null); void removeProduct(p); }} className="block w-full px-3 py-1.5 text-left text-red-700 hover:bg-red-50">
                          {p.isActive ? 'Remove' : 'Delete'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      </>}

      {itemFor && <ItemMasterModal product={itemFor} onClose={() => setItemFor(null)} onSaved={() => { setItemFor(null); reload(); }} />}
      {movementsFor && (
        <MovementsModal
          product={movementsFor}
          initialKind={adjustFor?.id === movementsFor.id ? 'adjustment' : undefined}
          onClose={() => { setMovementsFor(null); setAdjustFor(null); }}
          onChanged={() => {
            reload();
            reloadStatus();
          }}
        />
      )}
    </div>
    </div>
  );
}

/** Every manual stock adjustment across all products — the corrections, shrinkage and counts that
 * were not a purchase or a sale, in date order, so a reviewer can see them without opening each
 * product. */
function AdjustmentsTab({ products, onOpen }: { products: Product[]; onOpen: (product: Product) => void }) {
  const { data, loading, error } = useIpcQuery(() => window.api.inventory.movements({}), []);
  const nameById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const rows = (data ?? []).filter((m) => m.kind === 'adjustment' || m.kind === 'opening').sort((a, b) => b.movementDate.localeCompare(a.movementDate) || b.id - a.id);
  return (
    <div className="space-y-3">
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {data && rows.length === 0 && <p className="text-sm text-gray-500">No stock adjustments or opening counts yet. Use a product's Actions → Adjust quantity to record one.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Quantity change</th>
                <th className="px-3 py-2 text-right">Unit cost</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2">Posted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const product = nameById.get(m.productId);
                return (
                  <tr key={m.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-1.5 tabular-nums text-gray-600">{m.movementDate}</td>
                    <td className="px-3 py-1.5">
                      {product ? (
                        <button type="button" onClick={() => onOpen(product)} className="font-medium text-brand-700 hover:underline">{product.name}</button>
                      ) : (
                        <span className="text-gray-400">Product #{m.productId}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-gray-600">{KIND_LABELS[m.kind] ?? m.kind}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${m.quantityDelta < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{m.quantityDelta > 0 ? '+' : ''}{m.quantityDelta}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{m.unitCostCents !== null ? <Money cents={m.unitCostCents} /> : '—'}</td>
                    <td className="px-3 py-1.5 text-gray-600">{m.note ?? '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-gray-500">{m.journalEntryId !== null ? `Journal #${m.journalEntryId}` : 'Not posted'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MovementsModal({ product, onClose, onChanged, initialKind }: { product: Product; onClose: () => void; onChanged: () => void; initialKind?: string }) {
  const { data: accounts } = useIpcQuery(() => window.api.accounts.list({ activeOnly: true }), []);
  const { data, loading, reload } = useIpcQuery(() => window.api.inventory.movements({ productId: product.id }), [product.id]);
  const { data: valuation, reload: reloadValuation } = useIpcQuery(
    () => window.api.inventory.productValuation({ productId: product.id }),
    [product.id],
  );
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ movementDate: todayIso(), kind: initialKind ?? 'purchase', quantity: '', unitCost: '', counterAccountId: '' });
  const [busy, setBusy] = useState(false);
  /** Set when the stock moved but no journal entry could be posted, so the screen can say why
   * instead of looking like it worked. */
  const [notPosted, setNotPosted] = useState<string | null>(null);

  const inbound = form.kind === 'purchase' || form.kind === 'opening';

  async function add() {
    const quantity = Number(form.quantity);
    if (!quantity) return setError('Enter a quantity.');
    setBusy(true);
    const result = await window.api.inventory.addMovement({
      productId: product.id,
      movementDate: form.movementDate,
      // The sign is decided by the kind, not typed: asking someone to remember that a sale is a
      // negative number is how stock ends up going the wrong way.
      quantityDelta: inbound ? Math.abs(quantity) : -Math.abs(quantity),
      unitCostCents: inbound ? Math.round((Number(form.unitCost) || 0) * 100) : null,
      kind: form.kind,
      note: null,
      counterAccountId: form.counterAccountId ? Number(form.counterAccountId) : null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setError(null);
    setNotPosted(result.data.notPostedReason ?? null);
    setForm({ ...form, quantity: '', unitCost: '' });
    reload();
    reloadValuation();
    onChanged();
  }

  async function remove(movement: InventoryMovementRow) {
    const reversing = movement.journalEntryId !== null;
    if (!window.confirm(reversing
      ? 'Reverse this manual inventory movement? Its GL entry will be voided and the stock movement removed so you can enter the correction.'
      : 'Delete this unposted inventory movement? This cannot be undone.')) return;
    const result = reversing ? await window.api.inventory.reverseMovement(movement.id) : await window.api.inventory.deleteMovement(movement.id);
    if (!result.ok) return setError(result.error);
    reload();
    reloadValuation();
    onChanged();
  }

  return (
    <Modal open onClose={onClose} title={`Stock movements — ${product.name}`} fullScreen>
      {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mb-3 flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-gray-50 p-3">
        <label className="text-sm">
          <span className="block text-gray-600">Date</span>
          <DateInput value={form.movementDate} onChange={(v) => setForm({ ...form, movementDate: v })} className="mt-1 w-32" />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">What happened</span>
          <select
            className="mt-1 w-52 rounded border border-gray-300 px-2 py-1.5"
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
          >
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">Quantity</span>
          <input
            type="number"
            className="mt-1 w-24 rounded border border-gray-300 px-2 py-1.5 text-right tabular-nums"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
        </label>
        {inbound && (
          <label className="text-sm">
            <span className="block text-gray-600">Paid from</span>
            <select
              className="mt-1 w-44 rounded border border-gray-300 px-2 py-1.5"
              value={form.counterAccountId}
              onChange={(e) => setForm({ ...form, counterAccountId: e.target.value })}
            >
              <option value="">Choose an account…</option>
              {((accounts ?? []) as Account[])
                .filter((a) => a.accountType === 'Asset' || a.accountType === 'Liability')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {inbound && (
          <label className="text-sm">
            <span className="block text-gray-600">Cost each</span>
            <input
              type="text"
              inputMode="decimal"
              className="mt-1 w-28 rounded border border-gray-300 px-2 py-1.5 text-right tabular-nums"
              value={form.unitCost}
              onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
            />
          </label>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void add()}
          className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Record'}
        </button>
      </div>

      {!inbound && (
        <p className="mb-3 text-xs text-gray-500">
          No cost is entered on the way out. Stock leaves at the weighted average cost in force at that moment — that is what makes
          the balance sheet value and the cost of goods sold agree. Each movement posts a journal entry: stock in debits inventory,
          stock out debits cost of goods sold. No revenue is posted here; the invoice does that.
        </p>
      )}

      {notPosted && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>
            Stock recorded, but <span className="font-medium">nothing was posted to the books</span> — {notPosted}. Set the
            product's inventory and cost-of-goods-sold accounts so the balance sheet keeps up with the stock.
          </span>
          <button type="button" onClick={() => setNotPosted(null)} className="shrink-0 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {valuation?.wentNegative && (
        <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This product's history takes out more than was ever put in, so stock goes negative. The valuation below is an estimate
          until an opening count or the missing purchases are recorded.
        </p>
      )}

      <div className="max-h-80 overflow-y-auto rounded border border-gray-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">What</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Cost each</th>
              <th className="px-3 py-2 text-right">On hand</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && (data ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  Nothing recorded yet. Start with an opening count, or record the first purchase.
                </td>
              </tr>
            )}
            {(valuation?.steps ?? []).map((step) => (
              <tr key={step.movement.id} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-1.5 text-gray-500">{step.movement.movementDate}</td>
                <td className="px-3 py-1.5">{KIND_LABELS[step.movement.kind] ?? step.movement.kind}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${step.movement.quantityDelta < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {step.movement.quantityDelta > 0 ? '+' : ''}
                  {step.movement.quantityDelta}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                  {step.movement.unitCostCents !== null ? (
                    <Money cents={step.movement.unitCostCents} />
                  ) : (
                    <span className="text-gray-300" title="Left at the running average">
                      avg
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{step.quantityOnHand}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  <Money cents={step.valueCents} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => void remove(step.movement as InventoryMovementRow)}
                    disabled={(step.movement as InventoryMovementRow).sourceDocumentType !== null}
                    title={(step.movement as InventoryMovementRow).sourceDocumentType !== null ? 'Reverse this from its original invoice or purchase order.' : undefined}
                    className="text-xs font-medium text-red-600 hover:underline disabled:text-gray-300 disabled:no-underline"
                  >
                    {step.movement.journalEntryId !== null ? 'Reverse' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {valuation && (
        <p className="mt-3 text-xs text-gray-500">
          On hand <span className="font-medium">{valuation.quantityOnHand}</span> {product.unit}, valued at{' '}
          <Money cents={valuation.totalValueCents} /> (average <Money cents={valuation.averageCostCents} /> each). Cost of everything
          issued so far: <Money cents={valuation.costOfGoodsSoldCents} />.
        </p>
      )}
    </Modal>
  );
}
