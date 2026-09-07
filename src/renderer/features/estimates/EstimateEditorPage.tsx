import { useEffect, useMemo, useState } from 'react';
import type { Account, Contact, TaxCode } from '@shared/domain/types';
import { taxCodeOptions } from '@shared/domain/ledger/taxCodes';
import { suggestTaxCents } from '@shared/domain/ledger/computeTaxSplit';
import { useCompanyTaxDefault } from '../../hooks/useCompanyTaxDefault';
import { useUiStore } from '../../app/store/uiStore';
import { Combobox } from '../../components/Combobox';
import { CurrencyInput } from '../../components/CurrencyInput';
import { Money } from '../../components/Money';
import { RecordNavigator } from '../../components/RecordNavigator';
import { saleLineAccountPickerOptions } from '../../utils/accountLabel';
import { documentTotalCents, lineAmountCents } from '@shared/domain/sales/commitmentDocuments';
import { compareDocumentNumbers } from '@shared/domain/documents/documentNumbering';
import type { Product } from '../../../preload/index';
import { ContactFormModal } from '../contacts/ContactFormModal';
import { NewProductModal } from '../inventory/NewProductModal';
import { AccountCombobox } from '../../components/AccountCombobox';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** Writing a quote.
 *
 * Deliberately the invoice form minus everything that posts: no due date, no payment, no journal
 * entry. Saving records an offer and nothing else, which is why this screen can be edited freely
 * right up until it becomes an invoice — and why it locks the moment it does.
 */

interface LineRow {
  key: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  revenueAccountId: number | null;
  productId: number | null;
  taxCode: TaxCode | null;
}

let rowCounter = 0;
function newRow(taxCode: TaxCode | null = null): LineRow {
  rowCounter += 1;
  return { key: `row-${rowCounter}`, description: '', quantity: 1, unitPriceCents: 0, revenueAccountId: null, productId: null, taxCode };
}

function todayIso(): string {
  return localIsoDate();
}

/** `asOrder`: opened from Sales orders — the new estimate is marked Accepted on save, which is what
 * makes it a sales order, and closing returns to the orders list. */
export function EstimateEditorPage({ id, asOrder = false, customerId: presetCustomerId }: { id: number | 'new'; asOrder?: boolean; customerId?: number }) {
  const setView = useUiStore((s) => s.setView);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allIds, setAllIds] = useState<number[]>([]);

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [estimateNumber, setEstimateNumber] = useState('');
  const [estimateDate, setEstimateDate] = useState(todayIso());
  const [expiryDate, setExpiryDate] = useState('');
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<LineRow[]>([newRow()]);
  const [locked, setLocked] = useState(false);
  const { province: taxProvince, defaultTaxCode, loaded: taxDefaultLoaded } = useCompanyTaxDefault();
  const effectiveDefaultTaxCode: TaxCode = defaultTaxCode ?? 'HST';
  const TAX_CODE_OPTIONS = taxCodeOptions('income', taxProvince);
  const lineTaxCents = (line: LineRow): number => suggestTaxCents(line.taxCode, lineAmountCents(line));
  const taxTotalCents = lines.reduce((sum, line) => sum + lineTaxCents(line), 0);
  // Lines created before the company profile loaded get the default tax once it is known.
  useEffect(() => {
    if (id !== 'new' || !taxDefaultLoaded) return;
    setLines((previous) => previous.map((line) => (line.taxCode === null ? { ...line, taxCode: effectiveDefaultTaxCode } : line)));
  }, [id, taxDefaultLoaded, effectiveDefaultTaxCode]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newProductForLine, setNewProductForLine] = useState<{ lineKey: string; initialName: string } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.api.accounts.list({ activeOnly: true }).then((r) => r.ok && setAccounts(r.data));
    window.api.customers.list({}).then((r) => r.ok && setCustomers(r.data.filter((c) => c.isActive)));
    window.api.products.list({ activeOnly: true }).then((r) => r.ok && setProducts(r.data.filter((p) => p.isActive)));
    window.api.estimates.list().then((r) => {
      if (!r.ok) return;
      const ordered = [...r.data].sort((a, b) => compareDocumentNumbers('EST', a.estimateNumber, b.estimateNumber));
      setAllIds(ordered.map((e) => e.id));
    });
  }, []);

  useEffect(() => {
    if (typeof id !== 'number') {
      setCustomerId(presetCustomerId ?? null);
      setEstimateDate(todayIso());
      setExpiryDate('');
      setMemo('');
      setLines([newRow()]);
      setLocked(false);
      window.api.estimates.nextNumber({ estimateDate: todayIso() }).then((r) => r.ok && setEstimateNumber(r.data));
      return;
    }

    window.api.estimates.get(id).then((r) => {
      if (!r.ok) return setError(r.error);
      const e = r.data;
      setCustomerId(e.customerId);
      setEstimateNumber(e.estimateNumber);
      setEstimateDate(e.estimateDate);
      setExpiryDate(e.expiryDate ?? '');
      setMemo(e.memo ?? '');
      // An invoiced estimate is the record of what that invoice was raised from. Editing it after
      // the fact would leave the two disagreeing with nothing to say which is right.
      setLocked(e.convertedInvoiceId !== null);
      setLines(
        e.lines.length > 0
          ? e.lines.map((l) => ({
              key: `line-${l.id}`,
              description: l.description,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
              revenueAccountId: l.revenueAccountId,
              productId: l.productId,
              taxCode: (l.taxCode as TaxCode | null) ?? null,
            }))
          : [newRow()],
      );
    });
  }, [id]);

  const revenueOptions = useMemo(
    () => saleLineAccountPickerOptions(accounts),
    [accounts],
  );

  function updateLine(key: string, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const totalCents = documentTotalCents(lines);
  const canSave =
    !locked &&
    customerId !== null &&
    estimateNumber.trim().length > 0 &&
    lines.length > 0 &&
    lines.every((l) => l.description.trim() && l.revenueAccountId !== null);

  async function handleSave(after: 'stay' | 'new' | 'close') {
    if (customerId === null) return;
    setBusy(true);
    setError(null);

    const payload = {
      customerId,
      estimateNumber: estimateNumber.trim(),
      estimateDate,
      expiryDate: expiryDate || null,
      memo: memo.trim() || null,
      lines: lines.map((l) => ({
        description: l.description.trim(),
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        revenueAccountId: l.revenueAccountId as number,
        taxCode: l.taxCode,
        manualHstCents: null,
        productId: l.productId,
      })),
    };

    const result =
      typeof id === 'number'
        ? await window.api.estimates.update({ id, patch: payload })
        : await window.api.estimates.create(payload);

    if (result.ok && asOrder && typeof id !== 'number') {
      const accepted = await window.api.estimates.setStatus({ id: result.data.id, status: 'accepted' });
      if (!accepted.ok) {
        setBusy(false);
        return setError(accepted.error);
      }
    }
    setBusy(false);
    if (!result.ok) return setError(result.error);

    if (after === 'close') return setView(asOrder ? { kind: 'sales', tab: 'orders' } : { kind: 'estimates' });
    if (after === 'new') return setView({ kind: 'estimateEditor', id: 'new', asOrder });
    setView({ kind: 'estimateEditor', id: result.data.id });
  }

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <RecordNavigator
          ids={allIds}
          currentId={id}
          label="estimate"
          disabled={busy}
          onGo={(next) => setView({ kind: 'estimateEditor', id: next })}
        />
        <button
          type="button"
          onClick={() => setView({ kind: 'estimates' })}
          aria-label="Close"
          title="Close (back to Estimates)"
          className="order-last ml-auto rounded-full px-2 text-xl leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          ×
        </button>
        <button
          type="button"
          onClick={() => setView({ kind: 'estimates' })}
          className="text-sm text-brand-600 hover:underline"
        >
          ← All estimates
        </button>
      </div>

      {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {locked && (
        <div className="mb-3 rounded bg-violet-50 px-3 py-2 text-sm text-violet-800">
          This estimate has been turned into an invoice, so it is now read-only — it is the record of what that invoice was raised
          from. Correct the invoice instead.
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-gray-600">Customer</span>
          <Combobox
            options={customers.map((c) => ({ value: String(c.id), label: c.name }))}
            value={customerId !== null ? String(customerId) : null}
            onChange={(v) => setCustomerId(v ? Number(v) : null)}
            placeholder="Select a customer…"
            onAddNew={() => setShowAddCustomer(true)}
            addNewLabel="+ Add New Customer"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Estimate Number</span>
          <input
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 disabled:bg-gray-100"
            value={estimateNumber}
            disabled={locked}
            onChange={(e) => setEstimateNumber(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Estimate Date</span>
          <input
            type="date" min={DATE_MIN} max={DATE_MAX}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 disabled:bg-gray-100"
            value={estimateDate}
            disabled={locked}
            onChange={(e) => setEstimateDate(clampIsoDate(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Expires (optional)</span>
          <input
            type="date" min={DATE_MIN} max={DATE_MAX}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 disabled:bg-gray-100"
            value={expiryDate}
            disabled={locked}
            onChange={(e) => setExpiryDate(clampIsoDate(e.target.value))}
          />
          <span className="mt-1 block text-[11px] text-gray-400">Leave blank for an offer that does not lapse.</span>
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

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Product</th>
              <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Description</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Qty</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Unit Price</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Amount</th>
              <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Revenue Account</th>
              <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Tax</th>
              <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Tax Amt</th>
              {!locked && <th className="border-b border-gray-200 px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key} className="border-b border-gray-100">
                <td className="w-52 px-3 py-1.5">
                  <Combobox
                    options={products.map((product) => ({ value: String(product.id), label: product.sku ? `${product.sku} — ${product.name}` : product.name }))}
                    value={line.productId !== null ? String(line.productId) : null}
                    onChange={(value) => {
                      const product = products.find((row) => row.id === Number(value));
                      if (!product) return updateLine(line.key, { productId: null });
                      updateLine(line.key, {
                        productId: product.id,
                        description: product.description ?? product.name,
                        unitPriceCents: product.salePriceCents,
                        revenueAccountId: product.incomeAccountId,
                        ...(product.defaultTaxCode ? { taxCode: product.defaultTaxCode } : {}),
                      });
                    }}
                    placeholder="Optional product…"
                    onAddNew={(query) => setNewProductForLine({ lineKey: line.key, initialName: query })}
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
                  <CurrencyInput
                    valueCents={line.unitPriceCents}
                    onChange={(cents) => updateLine(line.key, { unitPriceCents: cents })}
                  />
                </td>
                <td className="w-32 px-3 py-1.5 text-right tabular-nums">
                  <Money cents={lineAmountCents(line)} />
                </td>
                <td className="w-64 px-3 py-1.5">
                  <AccountCombobox
                    options={revenueOptions}
                    value={line.revenueAccountId !== null ? String(line.revenueAccountId) : null}
                    onChange={(v) => updateLine(line.key, { revenueAccountId: v ? Number(v) : null })}
                    placeholder="Revenue account…"
                    accounts={accounts}
                    initialType="Revenue"
                    addNewLabel="+ New revenue account"
                    onAccountCreated={(created) => {
                      setAccounts((previous) => [...previous, created]);
                      updateLine(line.key, { revenueAccountId: created.id });
                    }}
                  />
                </td>
                <td className="w-36 px-3 py-1.5">
                  <select
                    aria-label="Line tax code"
                    className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm disabled:bg-gray-100"
                    value={line.taxCode ?? ''}
                    disabled={locked}
                    onChange={(e) => updateLine(line.key, { taxCode: (e.target.value || null) as TaxCode | null })}
                  >
                    {TAX_CODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </td>
                <td className="w-24 px-3 py-1.5 text-right tabular-nums text-gray-600">
                  <Money cents={lineTaxCents(line)} />
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
            <tr className="bg-gray-50 font-medium">
              <td className="px-3 py-2" colSpan={4}>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => setLines((prev) => [...prev, newRow(taxDefaultLoaded ? effectiveDefaultTaxCode : null)])}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    + Add line
                  </button>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                <Money cents={totalCents} />
              </td>
              <td className="px-3 py-2 text-right text-xs text-gray-500">Tax</td>
              <td className="px-3 py-2 text-right tabular-nums"><Money cents={taxTotalCents} /></td>
              <td colSpan={locked ? 1 : 2} />
            </tr>
            <tr className="border-t border-gray-300 font-semibold">
              <td colSpan={4} className="px-3 py-2 text-right">Total including tax</td>
              <td className="px-3 py-2 text-right tabular-nums"><Money cents={totalCents + taxTotalCents} /></td>
              <td colSpan={locked ? 3 : 4} />
            </tr>
          </tfoot>
        </table>
      </div>

      {!locked && (
        <>
          <p className="mt-2 text-xs text-gray-400">
            Saving records an offer and nothing more — no journal entry, no receivable. It reaches the books only when you turn it
            into an invoice.
          </p>

          <div className="mt-3 flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              disabled={busy || !canSave}
              onClick={() => handleSave('stay')}
              className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
            >
              Save Estimate
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
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        editing={null}
        kind="customer"
        onSaved={(customer) => {
          setCustomers((previous) => [...previous, customer]);
          setCustomerId(customer.id);
          setShowAddCustomer(false);
        }}
      />
      {newProductForLine && (
        <NewProductModal
          accounts={accounts}
          initialName={newProductForLine.initialName}
          initialIncomeAccountId={lines.find((line) => line.key === newProductForLine.lineKey)?.revenueAccountId ?? null}
          onClose={() => setNewProductForLine(null)}
          onCreated={(product) => {
            setProducts((previous) => [...previous, product]);
            updateLine(newProductForLine.lineKey, {
              productId: product.id,
              description: product.description ?? product.name,
              unitPriceCents: product.salePriceCents,
              revenueAccountId: product.incomeAccountId,
              ...(product.defaultTaxCode ? { taxCode: product.defaultTaxCode } : {}),
            });
            setNewProductForLine(null);
          }}
        />
      )}
    </div>
  );
}
