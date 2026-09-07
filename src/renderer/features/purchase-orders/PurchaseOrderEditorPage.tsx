import { useEffect, useMemo, useState } from 'react';
import type { Account, Contact, TaxCode } from '@shared/domain/types';
import { useUiStore, type PurchaseOrderPrefill } from '../../app/store/uiStore';
import { Combobox } from '../../components/Combobox';
import { CurrencyInput } from '../../components/CurrencyInput';
import { Money } from '../../components/Money';
import { RecordNavigator } from '../../components/RecordNavigator';
import { purchaseLineAccountPickerOptions } from '../../utils/accountLabel';
import { lineAmountCents } from '@shared/domain/sales/commitmentDocuments';
import { compareDocumentNumbers } from '@shared/domain/documents/documentNumbering';
import { taxCodeOptions } from '@shared/domain/ledger/taxCodes';
import { suggestTaxCents } from '@shared/domain/ledger/computeTaxSplit';
import { taxPortionOfInclusive } from '@shared/domain/ledger/taxCodes';
import { useCompanyTaxDefault } from '../../hooks/useCompanyTaxDefault';
import type { Product } from '../../../preload/index';
import { ContactFormModal } from '../contacts/ContactFormModal';
import { NewProductModal } from '../inventory/NewProductModal';
import { AccountCombobox } from '../../components/AccountCombobox';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { productPickerOptions } from '@shared/domain/inventory/productCatalogue';

/** Writing a purchase order — the estimate form pointed at vendors.
 *
 * Lines carry a category account rather than a revenue account, because that is where the cost will
 * land once the vendor's invoice arrives. Nothing posts until it does.
 */

interface LineRow {
  key: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  categoryAccountId: number | null;
  productId: number | null;
  taxCode: TaxCode | null;
  manualHstCents: number | null;
}

let rowCounter = 0;
function newRow(): LineRow {
  rowCounter += 1;
  return { key: `po-row-${rowCounter}`, description: '', quantity: 1, unitPriceCents: 0, categoryAccountId: null, productId: null, taxCode: null, manualHstCents: null };
}

function todayIso(): string {
  return localIsoDate();
}

export function PurchaseOrderEditorPage({ id, prefill }: { id: number | 'new'; prefill?: PurchaseOrderPrefill }) {
  const { province: taxProvince, defaultTaxCode, loaded: taxDefaultLoaded } = useCompanyTaxDefault();
  const effectiveDefaultTaxCode: TaxCode = defaultTaxCode ?? 'HST';
  const TAX_CODE_OPTIONS = taxCodeOptions('expense', taxProvince);
  const setView = useUiStore((s) => s.setView);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allIds, setAllIds] = useState<number[]>([]);

  const [vendorId, setVendorId] = useState<number | null>(null);
  const [poNumber, setPoNumber] = useState('');
  const [orderDate, setOrderDate] = useState(todayIso());
  const [expectedDate, setExpectedDate] = useState('');
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<LineRow[]>([newRow()]);
  const [locked, setLocked] = useState(false);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [newProductForLine, setNewProductForLine] = useState<{ lineKey: string; initialName: string } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vendorForOptions = vendors.find((v) => v.id === vendorId) ?? null;
  const productOptions = useMemo(
    () => productPickerOptions(products, 'purchase', undefined, vendorForOptions ? { label: `Preferred from ${vendorForOptions.name}`, matches: (p) => p.preferredVendorId === vendorForOptions.id } : undefined),
    [products, vendorForOptions],
  );

  useEffect(() => {
    window.api.accounts.list({ activeOnly: true }).then((r) => r.ok && setAccounts(r.data));
    window.api.vendors.list({}).then((r) => r.ok && setVendors(r.data.filter((v) => v.isActive)));
    window.api.products.list({ activeOnly: true }).then((r) => r.ok && setProducts(r.data.filter((p) => p.isActive)));
    window.api.purchaseOrders.list().then((r) => {
      if (!r.ok) return;
      const ordered = [...r.data].sort((a, b) => compareDocumentNumbers('PO', a.poNumber, b.poNumber));
      setAllIds(ordered.map((p) => p.id));
    });
  }, []);

  useEffect(() => {
    if (typeof id !== 'number') {
      setVendorId(null);
      setOrderDate(todayIso());
      setExpectedDate('');
      setMemo('');
      setLines([{ ...newRow(), taxCode: taxDefaultLoaded ? effectiveDefaultTaxCode : null }]);
      if (prefill) {
        setVendorId(prefill.vendorId);
        // Prices come from the item master once the catalogue has loaded (see the effect below).
        setLines(prefill.lines.map((l) => ({ ...newRow(), productId: l.productId, quantity: l.quantity, taxCode: taxDefaultLoaded ? effectiveDefaultTaxCode : null })));
      }
      setLocked(false);
      window.api.purchaseOrders.nextNumber({ orderDate: todayIso() }).then((r) => r.ok && setPoNumber(r.data));
      return;
    }

    window.api.purchaseOrders.get(id).then((r) => {
      if (!r.ok) return setError(r.error);
      const po = r.data;
      setVendorId(po.vendorId);
      setPoNumber(po.poNumber);
      setOrderDate(po.orderDate);
      setExpectedDate(po.expectedDate ?? '');
      setMemo(po.memo ?? '');
      setLocked(po.convertedBillId !== null);
      setLines(
        po.lines.length > 0
          ? po.lines.map((l) => ({
              key: `po-line-${l.id}`,
              description: l.description,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
              categoryAccountId: l.categoryAccountId,
              productId: l.productId,
              taxCode: (l.taxCode as TaxCode | null) ?? null,
              manualHstCents: l.manualHstCents,
            }))
          : [newRow()],
      );
    });
    // Loading an existing purchase order must only depend on its id. A company-profile refresh
    // must never reload the document and wipe edits already being made on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Prefilled lines arrive with only a product id and quantity; fill description and cost from the
  // catalogue once it is loaded, without touching anything the user has since typed.
  useEffect(() => {
    if (id !== 'new' || products.length === 0) return;
    setLines((previous) => previous.map((line) => {
      if (line.productId === null || line.description) return line;
      const product = products.find((p) => p.id === line.productId);
      return product ? { ...line, description: product.description?.trim() || product.name, unitPriceCents: product.purchasePriceCents, ...(product.trackQuantity && product.assetAccountId ? { categoryAccountId: product.assetAccountId } : {}) } : line;
    }));
  }, [id, products]);

  // Match the visible first tax option with real line state once the company profile is known.
  // This is the same protection used by invoices and sales receipts.
  useEffect(() => {
    if (id !== 'new' || !taxDefaultLoaded) return;
    setLines((previous) => previous.map((line) => (line.taxCode === null ? { ...line, taxCode: effectiveDefaultTaxCode } : line)));
  }, [id, taxDefaultLoaded, effectiveDefaultTaxCode]);

  // Expenses and assets both: a purchase order can be for stationery or for a laptop, and offering
  // only expense accounts would push a capital purchase into costs.
  const categoryOptions = useMemo(
    () => purchaseLineAccountPickerOptions(accounts),
    [accounts],
  );

  function updateLine(key: string, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // Whether the typed prices already include tax — same switch as the bill and the invoice.
  const [amountsMode, setAmountsMode] = useState<'exclusive' | 'inclusive'>('exclusive');
  const lineTaxCents = (line: LineRow): number => {
    const typed = lineAmountCents(line);
    if (line.taxCode === 'Manual') return Math.min(typed, Math.max(0, line.manualHstCents ?? 0));
    return amountsMode === 'inclusive' ? taxPortionOfInclusive(line.taxCode, typed) : suggestTaxCents(line.taxCode, typed);
  };
  const lineBaseCents = (line: LineRow): number => (amountsMode === 'inclusive' ? lineAmountCents(line) - lineTaxCents(line) : lineAmountCents(line));
  const subtotalCents = lines.reduce((sum, line) => sum + lineBaseCents(line), 0);
  const taxTotalCents = lines.reduce((sum, line) => sum + lineTaxCents(line), 0);
  const totalCents = subtotalCents + taxTotalCents;
  const canSave =
    !locked &&
    vendorId !== null &&
    poNumber.trim().length > 0 &&
    lines.length > 0 &&
    lines.every((l) => l.description.trim() && l.categoryAccountId !== null);

  async function handleSave(after: 'stay' | 'new' | 'close') {
    if (vendorId === null) return;
    setBusy(true);
    setError(null);

    const payload = {
      vendorId,
      poNumber: poNumber.trim(),
      orderDate,
      expectedDate: expectedDate || null,
      memo: memo.trim() || null,
      lines: lines.map((l) => ({
        description: l.description.trim(),
        quantity: l.quantity,
        unitPriceCents: amountsMode === 'inclusive' ? Math.round(lineBaseCents(l) / (l.quantity || 1)) : l.unitPriceCents,
        categoryAccountId: l.categoryAccountId as number,
        taxCode: amountsMode === 'inclusive' && l.taxCode && l.taxCode !== 'NonHST' ? 'Manual' : l.taxCode,
        manualHstCents: amountsMode === 'inclusive' ? (l.taxCode && l.taxCode !== 'NonHST' ? lineTaxCents(l) : null) : l.taxCode === 'Manual' ? Math.max(0, l.manualHstCents ?? 0) : null,
        productId: l.productId,
      })),
    };

    const result =
      typeof id === 'number'
        ? await window.api.purchaseOrders.update({ id, patch: payload })
        : await window.api.purchaseOrders.create(payload);

    setBusy(false);
    if (!result.ok) return setError(result.error);

    if (after === 'close') return setView({ kind: 'purchaseOrders' });
    if (after === 'new') return setView({ kind: 'purchaseOrderEditor', id: 'new' });
    setView({ kind: 'purchaseOrderEditor', id: result.data.id });
  }

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <RecordNavigator
          ids={allIds}
          currentId={id}
          label="purchase order"
          disabled={busy}
          onGo={(next) => setView({ kind: 'purchaseOrderEditor', id: next })}
        />
        <button
          type="button"
          onClick={() => setView({ kind: 'purchaseOrders' })}
          aria-label="Close"
          title="Close (back to Purchase Orders)"
          className="order-last ml-auto rounded-full px-2 text-xl leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          ×
        </button>
        <button type="button" onClick={() => setView({ kind: 'purchaseOrders' })} className="text-sm text-brand-600 hover:underline">
          ← All purchase orders
        </button>
      </div>

      {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {locked && (
        <div className="mb-3 rounded bg-violet-50 px-3 py-2 text-sm text-violet-800">
          This order has been billed, so it is now read-only — it is the record of what was ordered. Correct the bill instead.
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-gray-600">Vendor</span>
          <Combobox
            options={vendors.map((v) => ({ value: String(v.id), label: v.name }))}
            value={vendorId !== null ? String(vendorId) : null}
            onChange={(v) => setVendorId(v ? Number(v) : null)}
            placeholder="Select a vendor…"
            onAddNew={() => setShowAddVendor(true)}
            addNewLabel="+ Add New Vendor"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">PO Number</span>
          <input
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 disabled:bg-gray-100"
            value={poNumber}
            disabled={locked}
            onChange={(e) => setPoNumber(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Order Date</span>
          <input
            type="date" min={DATE_MIN} max={DATE_MAX}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 disabled:bg-gray-100"
            value={orderDate}
            disabled={locked}
            onChange={(e) => setOrderDate(clampIsoDate(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Expected (optional)</span>
          <input
            type="date" min={DATE_MIN} max={DATE_MAX}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 disabled:bg-gray-100"
            value={expectedDate}
            disabled={locked}
            onChange={(e) => setExpectedDate(clampIsoDate(e.target.value))}
          />
        </label>
        <label className="col-span-2 block text-sm">
          <span className="text-gray-600">Memo (optional)</span>
          <input
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 disabled:bg-gray-100"
            value={memo}
            disabled={locked}
            onChange={(e) => setMemo(e.target.value)}
          />
        </label>
      </div>

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-sm text-gray-600">
            <label className="flex items-center gap-2">
              Amounts are
              <select aria-label="Amounts are" value={amountsMode} onChange={(e) => setAmountsMode(e.target.value as 'exclusive' | 'inclusive')} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm">
                <option value="exclusive">Exclusive of tax</option>
                <option value="inclusive">Inclusive of tax</option>
              </select>
            </label>
          </div>
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Product</th>
              <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Description</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Qty</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Unit Price</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Amount{amountsMode === 'inclusive' ? ' (incl. tax)' : ''}</th>
              <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Category</th>
              <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Tax</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Tax Amount</th>
              {!locked && <th className="border-b border-gray-200 px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key} className="border-b border-gray-100">
                <td className="w-52 px-3 py-1.5">
                  <Combobox
                    options={productOptions}
                    value={line.productId !== null ? String(line.productId) : null}
                    onChange={(v) => {
                      const productId = v ? Number(v) : null;
                      const product = products.find((p) => p.id === productId);
                      updateLine(line.key, { productId, description: line.description || product?.name || '', ...(product && line.unitPriceCents === 0 ? { unitPriceCents: product.purchasePriceCents } : {}) });
                    }}
                    placeholder="Optional product…"
                    onAddNew={locked ? undefined : (query) => setNewProductForLine({ lineKey: line.key, initialName: query })}
                    addNewLabel={(query) => query ? `+ New Product “${query}”` : '+ New Product or Service'}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100"
                    value={line.description}
                    disabled={locked}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                  />
                </td>
                <td className="w-24 px-3 py-1.5">
                  <input
                    type="number"
                    step="any"
                    className="w-full rounded border border-gray-300 px-2 py-1 text-right disabled:bg-gray-100"
                    value={line.quantity}
                    disabled={locked}
                    onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                  />
                </td>
                <td className="w-36 px-3 py-1.5">
                  <CurrencyInput valueCents={line.unitPriceCents} onChange={(cents) => updateLine(line.key, { unitPriceCents: cents })} />
                </td>
                <td className="w-32 px-3 py-1.5 text-right tabular-nums">
                  <Money cents={lineAmountCents(line)} />
                </td>
                <td className="w-64 px-3 py-1.5">
                  <AccountCombobox
                    options={categoryOptions}
                    value={line.categoryAccountId !== null ? String(line.categoryAccountId) : null}
                    onChange={(v) => updateLine(line.key, { categoryAccountId: v ? Number(v) : null })}
                    placeholder="Category…"
                    accounts={accounts}
                    initialType="Expense"
                    addNewLabel="+ New expense or asset category"
                    onAccountCreated={(created) => {
                      setAccounts((previous) => [...previous, created]);
                      updateLine(line.key, { categoryAccountId: created.id });
                    }}
                  />
                </td>
                <td className="w-52 px-3 py-1.5">
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100"
                    value={line.taxCode ?? ''}
                    disabled={locked}
                    onChange={(e) => {
                      const taxCode = (e.target.value || null) as TaxCode | null;
                      updateLine(line.key, { taxCode, manualHstCents: taxCode === 'Manual' ? line.manualHstCents ?? 0 : null });
                    }}
                  >
                    {TAX_CODE_OPTIONS.map((o) => (
                      <option key={o.value || 'blank'} value={o.value} title={o.title}>{o.label}</option>
                    ))}
                  </select>
                </td>
                <td className="w-36 px-3 py-1.5 text-right">
                  {line.taxCode === 'Manual' ? (
                    <CurrencyInput valueCents={line.manualHstCents ?? 0} onChange={(cents) => updateLine(line.key, { manualHstCents: cents })} />
                  ) : (
                    <Money cents={lineTaxCents(line)} />
                  )}
                </td>
                {!locked && (
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== line.key) : prev))}
                      className="text-gray-400 hover:text-red-600"
                      aria-label="Remove line"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50">
              <td className="px-3 py-2" colSpan={4}>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => setLines((prev) => [...prev, { ...newRow(), taxCode: effectiveDefaultTaxCode }])}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    + Add line
                  </button>
                )}
              </td>
              <td className="px-3 py-2 text-right font-medium" colSpan={3}>Subtotal</td>
              <td className="px-3 py-2 text-right tabular-nums"><Money cents={subtotalCents} /></td>
              {!locked && <td />}
            </tr>
            <tr className="bg-gray-50">
              <td colSpan={4} />
              <td className="px-3 py-2 text-right font-medium" colSpan={3}>Tax</td>
              <td className="px-3 py-2 text-right tabular-nums"><Money cents={taxTotalCents} /></td>
              {!locked && <td />}
            </tr>
            <tr className="bg-gray-50 font-semibold">
              <td colSpan={4} />
              <td className="px-3 py-2 text-right" colSpan={3}>Total</td>
              <td className="px-3 py-2 text-right tabular-nums"><Money cents={totalCents} /></td>
              {!locked && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {!locked && (
        <>
          <p className="mt-2 text-xs text-gray-400">
            Saving records an order and nothing more — no journal entry, no payable. It reaches the books when the vendor&apos;s
            invoice is entered against it.
          </p>

          <div className="mt-3 flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              disabled={busy || !canSave}
              onClick={() => handleSave('stay')}
              className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
            >
              Save Order
            </button>
            <button
              type="button"
              disabled={busy || !canSave}
              onClick={() => handleSave('new')}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Save &amp; Next
            </button>
            <button
              type="button"
              disabled={busy || !canSave}
              onClick={() => handleSave('close')}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Save &amp; Close
            </button>
          </div>
        </>
      )}

      <ContactFormModal
        open={showAddVendor}
        onClose={() => setShowAddVendor(false)}
        editing={null}
        kind="vendor"
        onSaved={(vendor) => {
          setVendors((previous) => [...previous, vendor]);
          setVendorId(vendor.id);
          setShowAddVendor(false);
        }}
      />
      {newProductForLine && (
        <NewProductModal
          accounts={accounts}
          initialName={newProductForLine.initialName}
          initialIncomeAccountId={accounts.find((account) => account.accountType === 'Revenue')?.id ?? null}
          onClose={() => setNewProductForLine(null)}
          onCreated={(product) => {
            setProducts((previous) => [...previous, product]);
            updateLine(newProductForLine.lineKey, {
              productId: product.id,
              description: product.description ?? product.name,
            });
            setNewProductForLine(null);
          }}
        />
      )}
    </div>
  );
}
