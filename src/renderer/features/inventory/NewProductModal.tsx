import { UnitSelect } from '../../components/UnitSelect';
import { useEffect, useMemo, useState } from 'react';
import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS, categoriesInUse, type BundleComponent, type ProductType } from '@shared/domain/inventory/productCatalogue';
import type { Account, TaxCode } from '@shared/domain/types';
import type { Product } from '../../../preload/index';
import { Combobox } from '../../components/Combobox';
import { CurrencyInput } from '../../components/CurrencyInput';
import { Modal } from '../../components/Modal';
import { accountPickerOptions } from '../../utils/accountLabel';
import { TAX_CODE_SELECT_OPTIONS } from '@shared/domain/ledger/taxCodes';

export function NewProductModal({
  accounts,
  initialName,
  initialIncomeAccountId,
  onClose,
  onCreated,
}: {
  accounts: Account[];
  initialName: string;
  initialIncomeAccountId: number | null;
  onClose: () => void;
  onCreated: (product: Product) => void;
}) {
  const revenueAccounts = useMemo(() => accounts.filter((account) => account.accountType === 'Revenue'), [accounts]);
  const accountOptions = useMemo(() => accountPickerOptions(accounts), [accounts]);
  const assetAccounts = useMemo(() => accounts.filter((account) => account.accountType === 'Asset'), [accounts]);
  const expenseAccounts = useMemo(() => accounts.filter((account) => account.accountType === 'Expense'), [accounts]);
  const [name, setName] = useState(initialName);
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('each');
  const [salePriceCents, setSalePriceCents] = useState(0);
  const [purchasePriceCents, setPurchasePriceCents] = useState(0);
  const [incomeAccountId, setIncomeAccountId] = useState<number | null>(initialIncomeAccountId ?? revenueAccounts[0]?.id ?? null);
  const [productType, setProductType] = useState<ProductType>('service');
  const [category, setCategory] = useState('');
  const [bundleItems, setBundleItems] = useState<BundleComponent[]>([]);
  const [catalogue, setCatalogue] = useState<Product[]>([]);
  const trackQuantity = productType === 'inventory';
  useEffect(() => {
    window.api.products.list({ activeOnly: true }).then((r) => r.ok && setCatalogue(r.data));
  }, []);
  const categories = useMemo(() => categoriesInUse(catalogue), [catalogue]);
  const componentOptions = useMemo(() => catalogue.filter((row) => row.productType !== 'bundle').map((row) => ({ value: String(row.id), label: row.name, sublabel: row.sku ?? undefined })), [catalogue]);
  const [defaultTaxCode, setDefaultTaxCode] = useState<TaxCode | null>(null);
  const [reorderPoint, setReorderPoint] = useState(0);
  const [assetAccountId, setAssetAccountId] = useState<number | null>(null);
  const [cogsAccountId, setCogsAccountId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && incomeAccountId !== null && (!trackQuantity || (assetAccountId !== null && cogsAccountId !== null)) && (productType !== 'bundle' || bundleItems.length > 0);
  const options = (rows: Account[]) => rows.map((account) => ({ value: String(account.id), label: account.name }));

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const result = await window.api.products.create({
      sku: sku.trim() || null,
      barcode: barcode.trim() || null,
      name: name.trim(),
      description: description.trim() || null,
      unit: unit.trim() || 'each',
      salePriceCents,
      purchasePriceCents,
      incomeAccountId,
      cogsAccountId: trackQuantity ? cogsAccountId : null,
      assetAccountId: trackQuantity ? assetAccountId : null,
      trackQuantity,
      defaultTaxCode,
      reorderPoint: trackQuantity ? reorderPoint : 0,
      productType,
      category: category.trim() || null,
      bundleItems: productType === 'bundle' ? bundleItems.filter((item) => item.componentProductId > 0 && item.quantity > 0) : [],
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onCreated(result.data);
  }

  return (
    <Modal fullScreen
      open
      onClose={onClose}
      title="New Product or Service"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={busy || !canSave} className="rounded-full bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? 'Adding…' : 'Add Product / Service'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <p className="rounded bg-brand-50 px-3 py-2 text-xs text-brand-800">
          Saving here adds this item to Products &amp; Inventory and selects it on the current transaction.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-sm">
            <span className="text-gray-600">Product or Service Name</span>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Type</span>
            <select value={productType} onChange={(event) => setProductType(event.target.value as ProductType)} className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" data-testid="product-type">
              {PRODUCT_TYPES.map((type) => <option key={type} value={type}>{PRODUCT_TYPE_LABELS[type]}</option>)}
            </select>
            <span className="mt-1 block text-xs text-gray-400">
              {productType === 'inventory' ? 'Stock is counted; needs asset and cost-of-goods accounts.' : productType === 'nonInventory' ? 'Bought and sold, not counted.' : productType === 'service' ? 'Hours, fees, labour.' : 'A kit of other products, expanded into its parts when picked.'}
            </span>
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Category (optional)</span>
            <input list="product-category-suggestions" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. Hardware, Labour" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
            <datalist id="product-category-suggestions">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label className="text-sm">
            <span className="text-gray-600">SKU (optional)</span>
            <input value={sku} onChange={(event) => setSku(event.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Barcode / UPC (optional)</span>
            <input value={barcode} onChange={(event) => setBarcode(event.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Unit</span>
            <UnitSelect value={unit} onChange={setUnit} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Default Sales Tax</span>
            <select value={defaultTaxCode ?? ''} onChange={(event) => setDefaultTaxCode((event.target.value || null) as TaxCode | null)} className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5">
              <option value="">Company default (line tax)</option>{TAX_CODE_SELECT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Default Sale Price</span>
            <CurrencyInput valueCents={salePriceCents} onChange={setSalePriceCents} className="mt-1" />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Default Purchase Cost</span>
            <CurrencyInput valueCents={purchasePriceCents} onChange={setPurchasePriceCents} className="mt-1" />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Account</span>
            <div className="mt-1">
              <Combobox options={accountOptions} value={incomeAccountId === null ? null : String(incomeAccountId)} onChange={(value) => setIncomeAccountId(value ? Number(value) : null)} placeholder="Select account…" />
            </div>
          </label>
          <label className="col-span-2 text-sm">
            <span className="text-gray-600">Description (optional)</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
          </label>
        </div>

        {productType === 'bundle' && (
          <div className="rounded border border-gray-200 p-3 text-sm" data-testid="bundle-editor">
            <div className="mb-2 flex items-center justify-between">
              <strong>Bundle contents</strong>
              <button type="button" onClick={() => setBundleItems((current) => [...current, { componentProductId: 0, quantity: 1 }])} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200">+ Add component</button>
            </div>
            {bundleItems.length === 0 && <p className="text-xs text-gray-400">Add the products this bundle is made of. When the bundle is picked on an invoice it turns into these lines.</p>}
            {bundleItems.map((item, index) => (
              <div key={index} className="mb-1 grid grid-cols-6 items-center gap-2">
                <div className="col-span-4">
                  <Combobox options={componentOptions} value={item.componentProductId ? String(item.componentProductId) : null} onChange={(value) => setBundleItems((current) => current.map((row, i) => (i === index ? { ...row, componentProductId: value ? Number(value) : 0 } : row)))} placeholder="Select product…" />
                </div>
                <input type="number" min="0.0001" step="any" value={item.quantity} onChange={(event) => setBundleItems((current) => current.map((row, i) => (i === index ? { ...row, quantity: Number(event.target.value) || 0 } : row)))} className="rounded border border-gray-300 px-2 py-1 text-right" aria-label="Component quantity" />
                <button type="button" onClick={() => setBundleItems((current) => current.filter((_, i) => i !== index))} className="text-xs text-gray-400 hover:text-red-600">Remove</button>
              </div>
            ))}
          </div>
        )}

        {trackQuantity && (
          <div className="grid grid-cols-2 gap-3 rounded bg-gray-50 p-3">
            <label className="text-sm">
              <span className="text-gray-600">Inventory Asset Account</span>
              <div className="mt-1">
                <Combobox options={options(assetAccounts)} value={assetAccountId === null ? null : String(assetAccountId)} onChange={(value) => setAssetAccountId(value ? Number(value) : null)} placeholder="Select asset account…" />
              </div>
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Reorder Point</span>
              <input type="number" min="0" step="any" value={reorderPoint} onChange={(event) => setReorderPoint(Math.max(0, Number(event.target.value) || 0))} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-right" />
            </label>
            <label className="text-sm">
              <span className="text-gray-600">Cost of Goods Sold Account</span>
              <div className="mt-1">
                <Combobox options={options(expenseAccounts)} value={cogsAccountId === null ? null : String(cogsAccountId)} onChange={(value) => setCogsAccountId(value ? Number(value) : null)} placeholder="Select COGS account…" />
              </div>
            </label>
            <p className="col-span-2 text-xs text-gray-500">Both accounts are required before a tracked product can be sold, protecting inventory valuation and cost-of-goods-sold posting.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
