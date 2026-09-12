import { useEffect, useMemo, useState } from 'react';
import type { Account, Contact, TaxCode } from '@shared/domain/types';
import type { InventoryMovementRow, Product } from '../../../preload/index';
import { CategorySelect } from './CategorySelect';
import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS, categoriesInUse, productTypeOf, type BundleComponent, type ProductType } from '@shared/domain/inventory/productCatalogue';
import { TAX_CODE_SELECT_OPTIONS } from '@shared/domain/ledger/taxCodes';
import { Combobox } from '../../components/Combobox';
import { CurrencyInput } from '../../components/CurrencyInput';
import { Modal } from '../../components/Modal';
import { Money } from '../../components/Money';
import { UnitSelect } from '../../components/UnitSelect';
import { accountPickerOptions } from '../../utils/accountLabel';

type Tab = 'general' | 'sales' | 'purchasing' | 'inventory' | 'bundle' | 'activity';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'sales', label: 'Sales' },
  { id: 'purchasing', label: 'Purchasing' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'bundle', label: 'Bundle' },
  { id: 'activity', label: 'Activity' },
];

const field = 'mt-1 w-full rounded border border-gray-300 px-2 py-1.5';

/**
 * The item master — one record with everything the business knows about an item, the way an ERP
 * keeps it: identity and category, how it sells, how it is bought (preferred vendor, lead time,
 * minimum order), how it is stocked (reorder point and quantity, bin), what a bundle contains, and
 * its stock activity. Saves as one patch so a half-edited item is never left behind.
 */
export function ItemMasterModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<Tab>('general');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [catalogue, setCatalogue] = useState<Product[]>([]);
  const [movements, setMovements] = useState<InventoryMovementRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    name: product.name,
    sku: product.sku ?? '',
    barcode: product.barcode ?? '',
    description: product.description ?? '',
    unit: product.unit,
    productType: productTypeOf(product) as ProductType,
    category: product.category ?? '',
    isActive: product.isActive,
    salePriceCents: product.salePriceCents,
    defaultTaxCode: product.defaultTaxCode,
    incomeAccountId: product.incomeAccountId,
    purchasePriceCents: product.purchasePriceCents,
    preferredVendorId: product.preferredVendorId ?? null,
    leadTimeDays: product.leadTimeDays ?? 0,
    minimumOrderQuantity: product.minimumOrderQuantity ?? 0,
    assetAccountId: product.assetAccountId,
    cogsAccountId: product.cogsAccountId,
    reorderPoint: product.reorderPoint,
    reorderQuantity: product.reorderQuantity ?? 0,
    binLocation: product.binLocation ?? '',
    manufacturer: product.manufacturer ?? '',
    manufacturerPartNumber: product.manufacturerPartNumber ?? '',
    weightKg: product.weightKg ?? null,
    notes: product.notes ?? '',
    bundleItems: (product.bundleItems ?? []) as BundleComponent[],
  });
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    window.api.accounts.list().then((r) => r.ok && setAccounts(r.data));
    window.api.vendors.list().then((r) => r.ok && setVendors(r.data));
    window.api.products.list({}).then((r) => r.ok && setCatalogue(r.data));
    window.api.inventory.movements({ productId: product.id }).then((r) => r.ok && setMovements(r.data));
  }, [product.id]);

  const accountOptions = useMemo(() => accountPickerOptions(accounts), [accounts]);
  const assetOptions = useMemo(() => accounts.filter((a) => a.accountType === 'Asset').map((a) => ({ value: String(a.id), label: a.name })), [accounts]);
  const expenseOptions = useMemo(() => accounts.filter((a) => a.accountType === 'Expense').map((a) => ({ value: String(a.id), label: a.name })), [accounts]);
  const vendorOptions = useMemo(() => vendors.map((v) => ({ value: String(v.id), label: v.name })), [vendors]);
  const componentOptions = useMemo(() => catalogue.filter((p) => p.id !== product.id && productTypeOf(p) !== 'bundle' && p.isActive).map((p) => ({ value: String(p.id), label: p.name, sublabel: p.sku ?? undefined })), [catalogue, product.id]);
  const categories = useMemo(() => categoriesInUse(catalogue), [catalogue]);
  const onHand = useMemo(() => movements.reduce((t, m) => t + m.quantityDelta, 0), [movements]);
  const isInventory = draft.productType === 'inventory';
  const isBundle = draft.productType === 'bundle';

  async function save() {
    if (!draft.name.trim()) return setError('Enter an item name.');
    if (isInventory && (!draft.assetAccountId || !draft.cogsAccountId)) return setError('An inventory item needs an inventory asset account and a cost of goods sold account.');
    setBusy(true);
    setError(null);
    const r = await window.api.products.update({
      id: product.id,
      patch: {
        name: draft.name.trim(),
        sku: draft.sku.trim() || null,
        barcode: draft.barcode.trim() || null,
        description: draft.description.trim() || null,
        unit: draft.unit,
        productType: draft.productType,
        trackQuantity: isInventory,
        category: draft.category.trim() || null,
        isActive: draft.isActive,
        salePriceCents: draft.salePriceCents,
        defaultTaxCode: draft.defaultTaxCode,
        incomeAccountId: draft.incomeAccountId,
        purchasePriceCents: draft.purchasePriceCents,
        preferredVendorId: draft.preferredVendorId,
        leadTimeDays: draft.leadTimeDays,
        minimumOrderQuantity: draft.minimumOrderQuantity,
        assetAccountId: isInventory ? draft.assetAccountId : null,
        cogsAccountId: isInventory ? draft.cogsAccountId : null,
        reorderPoint: isInventory ? draft.reorderPoint : 0,
        reorderQuantity: isInventory ? draft.reorderQuantity : 0,
        binLocation: draft.binLocation.trim() || null,
        manufacturer: draft.manufacturer.trim() || null,
        manufacturerPartNumber: draft.manufacturerPartNumber.trim() || null,
        weightKg: draft.weightKg,
        notes: draft.notes.trim() || null,
        bundleItems: isBundle ? draft.bundleItems.filter((b) => b.componentProductId > 0 && b.quantity > 0) : [],
      },
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onSaved();
  }

  const num = (value: string) => Math.max(0, Number(value) || 0);

  return (
    <Modal
      fullScreen
      open
      onClose={onClose}
      title={`Item — ${product.name}`}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={busy} className="rounded-full bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save item'}
          </button>
        </>
      }
    >
      <div data-testid="item-master">
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <span><span className="text-gray-400">Type</span> {PRODUCT_TYPE_LABELS[draft.productType]}</span>
          {draft.sku && <span><span className="text-gray-400">SKU</span> {draft.sku}</span>}
          <span><span className="text-gray-400">Sells at</span> <Money cents={draft.salePriceCents} /></span>
          <span><span className="text-gray-400">Costs</span> <Money cents={draft.purchasePriceCents} /></span>
          {isInventory && <span><span className="text-gray-400">On hand</span> {onHand}{draft.binLocation ? ` · bin ${draft.binLocation}` : ''}</span>}
          <span className={draft.isActive ? 'text-emerald-700' : 'text-gray-400'}>{draft.isActive ? 'Active' : 'Inactive'}</span>
        </div>
        <div className="mb-3 flex gap-1 border-b border-gray-200" role="tablist">
          {TABS.filter((t) => t.id !== 'bundle' || isBundle).filter((t) => t.id !== 'inventory' || isInventory).map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 text-sm ${tab === t.id ? 'border-b-2 border-brand-700 font-medium text-brand-800' : 'text-gray-500 hover:text-gray-800'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {tab === 'general' && (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <label className="col-span-2 block"><span className="text-gray-600">Item name</span><input value={draft.name} onChange={(e) => set('name', e.target.value)} className={field} /></label>
            <label className="block"><span className="text-gray-600">Type</span>
              <select value={draft.productType} onChange={(e) => set('productType', e.target.value as ProductType)} className={`${field} bg-white`}>
                {PRODUCT_TYPES.map((t) => <option key={t} value={t}>{PRODUCT_TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-gray-600">SKU</span><input value={draft.sku} onChange={(e) => set('sku', e.target.value)} className={`${field} font-mono`} /></label>
            <label className="block"><span className="text-gray-600">Barcode / UPC</span><input value={draft.barcode} onChange={(e) => set('barcode', e.target.value)} className={`${field} font-mono`} /></label>
            <label className="block"><span className="text-gray-600">Unit</span><UnitSelect value={draft.unit} onChange={(v) => set('unit', v)} className={field} /></label>
            <label className="block"><span className="text-gray-600">Category</span>
              <CategorySelect value={draft.category} onChange={(v) => set('category', v)} inUse={categories} className={`${field} bg-white`} ariaLabel="Category" />
            </label>
            <label className="block"><span className="text-gray-600">Manufacturer / brand</span><input value={draft.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} className={field} /></label>
            <label className="block"><span className="text-gray-600">Manufacturer part #</span><input value={draft.manufacturerPartNumber} onChange={(e) => set('manufacturerPartNumber', e.target.value)} className={`${field} font-mono`} /></label>
            <label className="col-span-2 block"><span className="text-gray-600">Description (prints on forms)</span><textarea rows={2} value={draft.description} onChange={(e) => set('description', e.target.value)} className={field} /></label>
            <label className="block"><span className="text-gray-600">Weight (kg)</span><input type="number" min="0" step="any" value={draft.weightKg ?? ''} onChange={(e) => set('weightKg', e.target.value === '' ? null : num(e.target.value))} className={`${field} text-right`} /></label>
            <label className="col-span-2 block"><span className="text-gray-600">Internal notes</span><textarea rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} className={field} /></label>
            <label className="flex items-center gap-2 self-end pb-2"><input type="checkbox" checked={draft.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Active (shown in dropdowns)</label>
          </div>
        )}

        {tab === 'sales' && (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <label className="block"><span className="text-gray-600">Sale price</span><CurrencyInput valueCents={draft.salePriceCents} onChange={(c) => set('salePriceCents', c)} className="mt-1" /></label>
            <label className="block"><span className="text-gray-600">Default sales tax</span>
              <select value={draft.defaultTaxCode ?? ''} onChange={(e) => set('defaultTaxCode', (e.target.value || null) as TaxCode | null)} className={`${field} bg-white`}>
                <option value="">Company default (line tax)</option>{TAX_CODE_SELECT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-gray-600">Income account</span>
              <div className="mt-1"><Combobox options={accountOptions} value={draft.incomeAccountId === null ? null : String(draft.incomeAccountId)} onChange={(v) => set('incomeAccountId', v ? Number(v) : null)} placeholder="Select account…" /></div>
            </label>
            <p className="col-span-3 text-xs text-gray-400">Margin at these prices: <Money cents={draft.salePriceCents - draft.purchasePriceCents} />{draft.salePriceCents > 0 ? ` (${Math.round(((draft.salePriceCents - draft.purchasePriceCents) / draft.salePriceCents) * 100)}%)` : ''}. Picking this item on an invoice or sales receipt fills the description, price, account and tax.</p>
          </div>
        )}

        {tab === 'purchasing' && (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <label className="block"><span className="text-gray-600">Purchase cost</span><CurrencyInput valueCents={draft.purchasePriceCents} onChange={(c) => set('purchasePriceCents', c)} className="mt-1" /></label>
            <label className="block"><span className="text-gray-600">Preferred vendor</span>
              <div className="mt-1"><Combobox options={vendorOptions} value={draft.preferredVendorId === null ? null : String(draft.preferredVendorId)} onChange={(v) => set('preferredVendorId', v ? Number(v) : null)} placeholder="None" allowClear /></div>
            </label>
            <label className="block"><span className="text-gray-600">Lead time (days)</span><input type="number" min="0" step="1" value={draft.leadTimeDays} onChange={(e) => set('leadTimeDays', Math.round(num(e.target.value)))} className={`${field} text-right`} /></label>
            <label className="block"><span className="text-gray-600">Minimum order quantity</span><input type="number" min="0" step="any" value={draft.minimumOrderQuantity} onChange={(e) => set('minimumOrderQuantity', num(e.target.value))} className={`${field} text-right`} /></label>
            <p className="col-span-3 text-xs text-gray-400">On a bill for the preferred vendor this item is listed first under its own heading. Lead time and minimum order are shown on the reorder list.</p>
          </div>
        )}

        {tab === 'inventory' && isInventory && (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <label className="block"><span className="text-gray-600">Inventory asset account</span>
              <div className="mt-1"><Combobox options={assetOptions} value={draft.assetAccountId === null ? null : String(draft.assetAccountId)} onChange={(v) => set('assetAccountId', v ? Number(v) : null)} placeholder="Select asset account…" /></div>
            </label>
            <label className="block"><span className="text-gray-600">Cost of goods sold account</span>
              <div className="mt-1"><Combobox options={expenseOptions} value={draft.cogsAccountId === null ? null : String(draft.cogsAccountId)} onChange={(v) => set('cogsAccountId', v ? Number(v) : null)} placeholder="Select COGS account…" /></div>
            </label>
            <label className="block"><span className="text-gray-600">Bin / shelf location</span><input value={draft.binLocation} onChange={(e) => set('binLocation', e.target.value)} className={field} placeholder="e.g. A-03-2" /></label>
            <label className="block"><span className="text-gray-600">Reorder point</span><input type="number" min="0" step="any" value={draft.reorderPoint} onChange={(e) => set('reorderPoint', num(e.target.value))} className={`${field} text-right`} /></label>
            <label className="block"><span className="text-gray-600">Reorder quantity</span><input type="number" min="0" step="any" value={draft.reorderQuantity} onChange={(e) => set('reorderQuantity', num(e.target.value))} className={`${field} text-right`} /></label>
            <div className="block"><span className="text-gray-600">On hand now</span><div className={`mt-1 rounded bg-gray-50 px-2 py-1.5 text-right tabular-nums ${onHand < 0 ? 'text-rose-700' : ''}`}>{onHand}</div></div>
            <p className="col-span-3 text-xs text-gray-400">When on hand falls to the reorder point the item appears on the reorder list with the reorder quantity suggested.</p>
          </div>
        )}

        {tab === 'bundle' && isBundle && (
          <div className="text-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-gray-600">Contents of one bundle</span>
              <button type="button" onClick={() => set('bundleItems', [...draft.bundleItems, { componentProductId: 0, quantity: 1 }])} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200">+ Add component</button>
            </div>
            {draft.bundleItems.length === 0 && <p className="text-xs text-gray-400">No components yet. When the bundle is picked on an invoice it turns into these lines.</p>}
            {draft.bundleItems.map((item, index) => (
              <div key={index} className="mb-1 grid grid-cols-6 items-center gap-2">
                <div className="col-span-4"><Combobox options={componentOptions} value={item.componentProductId ? String(item.componentProductId) : null} onChange={(v) => set('bundleItems', draft.bundleItems.map((row, i) => (i === index ? { ...row, componentProductId: v ? Number(v) : 0 } : row)))} placeholder="Select product…" /></div>
                <input type="number" min="0.0001" step="any" value={item.quantity} onChange={(e) => set('bundleItems', draft.bundleItems.map((row, i) => (i === index ? { ...row, quantity: num(e.target.value) } : row)))} className="rounded border border-gray-300 px-2 py-1 text-right" aria-label="Component quantity" />
                <button type="button" onClick={() => set('bundleItems', draft.bundleItems.filter((_, i) => i !== index))} className="text-xs text-gray-400 hover:text-red-600">Remove</button>
              </div>
            ))}
          </div>
        )}

        {tab === 'activity' && (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-gray-400"><th className="py-1">Date</th><th className="py-1">Kind</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Unit cost</th><th className="py-1">Note</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {movements.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-gray-400">No stock activity yet.</td></tr>}
              {movements.slice().reverse().slice(0, 50).map((m) => (
                <tr key={m.id}>
                  <td className="py-1 tabular-nums text-gray-600">{m.movementDate}</td>
                  <td className="py-1">{m.kind}</td>
                  <td className={`py-1 text-right tabular-nums ${m.quantityDelta < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{m.quantityDelta > 0 ? '+' : ''}{m.quantityDelta}</td>
                  <td className="py-1 text-right tabular-nums">{m.unitCostCents !== null ? <Money cents={m.unitCostCents} /> : '—'}</td>
                  <td className="py-1 text-gray-600">{m.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
