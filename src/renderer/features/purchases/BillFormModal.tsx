import { PaymentTermsSelect } from '../../components/PaymentTermsSelect';
import { dueDateFor, termFromDates, type PaymentTerm } from '@shared/domain/contacts/paymentTerms';
import { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { continueReference } from '@shared/domain/documents/documentNumbering';
import { purchaseLineAccountPickerOptions } from '../../utils/accountLabel';
import type { Account, Bill, Contact, TaxCode } from '@shared/domain/types';
import { lineFromEnteredAmount } from '@shared/domain/purchases/billLines';
import { CurrencyInput } from '../../components/CurrencyInput';
import { Combobox } from '../../components/Combobox';
import { AccountCombobox } from '../../components/AccountCombobox';
import { ForeignCurrencyDetails, ForeignCurrencySelector } from '../../components/ForeignCurrencyFields';
import { useForeignCurrencyAmount } from '../../hooks/useForeignCurrencyAmount';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { rememberOnBlur } from '../../utils/textCase';
import { recordSuggestion, suggestionListId } from '../../utils/textSuggestions';
import { ContactFormModal } from '../contacts/ContactFormModal';
import { taxCodeOptions } from '@shared/domain/ledger/taxCodes';
import { useCompanyTaxDefault } from '../../hooks/useCompanyTaxDefault';
import { buttonClass } from '../../components/Button';
import { Money } from '../../components/Money';
import { QuickScroll } from '../../components/QuickScroll';
import type { Product } from '../../../preload/index';
import { NewProductModal } from '../inventory/NewProductModal';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { DocumentLineTagPicker, useHasTagGroups } from '../../components/DocumentLineTagPicker';
import { expandBundle, productPickerOptions, productTypeOf } from '@shared/domain/inventory/productCatalogue';
import { ErrorNotice } from '../../components/ErrorNotice';

function today(): string {
  return localIsoDate();
}

let lineKeyCounter = 0;

/** One row of the bill as the person sees it: the amount as typed (before or after tax,
 * depending on the "Amounts are" switch) and a tax figure that is either the rate suggestion or
 * what was typed over it. The pre-tax base and the tax to post are derived on the way out. */
interface LineRow {
  key: string;
  categoryAccountId: number | null;
  description: string;
  productId: number | null;
  quantity: number;
  amountCents: number;
  taxCode: TaxCode | null;
  typedTaxCents: number | null;
  /** Class / location tags chosen for this line. */
  tagIds: number[];
}

type AmountsMode = 'exclusive' | 'inclusive';

function newLine(taxCode: TaxCode | null): LineRow {
  return { key: `line-${++lineKeyCounter}`, categoryAccountId: null, description: '', productId: null, quantity: 1, amountCents: 0, taxCode, typedTaxCents: null, tagIds: [] };
}

function figuresFor(line: LineRow, mode: AmountsMode): { baseCents: number; taxCents: number; totalCents: number } {
  const { baseCents, taxCents } = lineFromEnteredAmount(line.amountCents, line.taxCode, mode, line.typedTaxCents);
  return { baseCents, taxCents, totalCents: baseCents + taxCents };
}

/** The bill entry screen. Opens full-screen — a vendor invoice has several lines and a few
 * header fields, and a narrow pop-up made every one of them a squeeze — with the close control
 * at the top right where every other ledger puts it. */
export function BillFormModal({
  open,
  onClose,
  onSaved,
  vendors,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  vendors: Contact[];
}) {
  const { province: taxProvince, defaultTaxCode, loaded: taxDefaultLoaded } = useCompanyTaxDefault();
  const TAX_CODE_OPTIONS = taxCodeOptions('expense', taxProvince);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [vendorId, setVendorId] = useState<number | null>(null);
  const hasTagGroups = useHasTagGroups();
  const [billNumber, setBillNumber] = useState('');
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('');
  const [localVendors, setLocalVendors] = useState<Contact[]>(vendors);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [billDate, setBillDate] = useState(today());
  const [dueDate, setDueDate] = useState(today());
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm>('net30');
  const [products, setProducts] = useState<Product[]>([]);
  const [addProductForLine, setAddProductForLine] = useState<string | null>(null);
  const [mode, setMode] = useState<AmountsMode>('exclusive');
  const [lines, setLines] = useState<LineRow[]>([newLine(null)]);
  const [readNotice, setReadNotice] = useState<string | null>(null);

  /** Reads a PDF or scanned invoice and fills what it can: the vendor (matched by name), the date,
   * the amount and the tax. Everything stays editable — it is a head start, not a decision. */
  async function readFromFile() {
    setReadNotice(null);
    const result = await window.api.receiptInbox.pickAndExtract();
    if (!result.ok) return setReadNotice(result.error);
    if (!result.data.picked) return;
    const f = result.data.fields;
    const filled: string[] = [];
    if (f.vendorNameGuess) {
      const guess = f.vendorNameGuess.toLowerCase();
      const match = vendors.find((v) => v.isActive && (guess.includes(v.name.toLowerCase()) || v.name.toLowerCase().includes(guess.split(/\s+/)[0] ?? '')));
      if (match) { setVendorId(match.id); filled.push(`vendor ${match.name}`); }
      else filled.push(`vendor not matched ("${f.vendorNameGuess}") — pick it`);
    }
    if (f.dateGuess) { setBillDate(f.dateGuess); setDueDate(f.dateGuess); filled.push(`date ${f.dateGuess}`); }
    if (f.amountCentsGuess) {
      const tax = f.taxAmountCentsGuess ?? 0;
      const base = Math.max(0, f.amountCentsGuess - tax);
      setLines((prev) => [{ ...prev[0], amountCents: base, typedTaxCents: tax > 0 ? tax : prev[0].typedTaxCents, taxCode: tax > 0 ? 'Manual' : prev[0].taxCode }, ...prev.slice(1)]);
      filled.push(`amount $${(base / 100).toFixed(2)}${tax > 0 ? ` + tax $${(tax / 100).toFixed(2)}` : ''}`);
    }
    setReadNotice(filled.length > 0 ? `Read ${result.data.fileName}: ${filled.join(', ')}. Check each field against the invoice before saving. The file is kept in the Receipt Inbox.` : `Nothing could be read from ${result.data.fileName}. It is in the Receipt Inbox; enter the bill by hand.`);
  }
  const [memo, setMemo] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ entryDate: string; memo: string | null }[]>([]);
  const [recentBills, setRecentBills] = useState<Bill[]>([]);
  const [lastVendorCategory, setLastVendorCategory] = useState<number | null>(null);
  const fx = useForeignCurrencyAmount();

  const defaultLineTaxCode = defaultTaxCode ?? 'HST';

  // Opening the form starts a fresh bill. Vendor-list refreshes are handled separately below so
  // adding or refreshing a vendor cannot erase an invoice number, amount, category, or tax already
  // entered on the bill.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setLocalVendors(vendors);
    // No vendor until one is chosen: a bill quietly filed under whoever sorts first is the kind of
    // mistake found months later on the wrong vendor's statement.
    setVendorId(null);
    setBillNumber('');
    setPurchaseOrderNumber('');
    setBillDate(today());
    setDueDate(today());
    setMode('exclusive');
    setLines([newLine(taxDefaultLoaded ? defaultLineTaxCode : null)]);
    setMemo('');
    setDuplicateWarning([]);
    fx.reset();
    window.api.accounts.list({ activeOnly: true }).then((r) => r.ok && setAccounts(r.data));
    window.api.bills.list().then((r) => r.ok && setRecentBills(r.data));
    window.api.products.list({ activeOnly: true }).then((r) => r.ok && setProducts(r.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The company's tax treatment arrives a moment after the form opens; lines that have no code
  // yet take it. A code someone already picked is left alone.
  useEffect(() => {
    if (!open || !taxDefaultLoaded) return;
    setLines((current) => current.map((line) => (line.taxCode === null && line.amountCents === 0 ? { ...line, taxCode: defaultLineTaxCode } : line)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taxDefaultLoaded]);

  useEffect(() => {
    if (!open) return;
    setLocalVendors((current) => {
      const merged = new Map(current.map((vendor) => [vendor.id, vendor]));
      for (const vendor of vendors) merged.set(vendor.id, vendor);
      return [...merged.values()];
    });
    // A list that arrives with exactly one vendor can only mean that one; several means a choice
    // the person has to make, so nothing is picked for them.
    setVendorId((current) => current ?? (vendors.length === 1 ? vendors[0].id : null));
  }, [open, vendors]);

  // Escape closes, like every full-screen sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !showAddVendor && addProductForLine === null) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, showAddVendor, addProductForLine]);

  const vendor = useMemo(() => localVendors.find((v) => v.id === vendorId) ?? null, [localVendors, vendorId]);

  // A vendor's invoice number is theirs, so it is never filled in for them — but the last one
  // they sent, and what would follow it, catches a typo or a skipped invoice at entry time.
  const lastVendorInvoiceNumber = useMemo(() => {
    if (vendorId === null) return null;
    const last = recentBills.filter((b) => b.vendorId === vendorId && b.billNumber).sort((a, b) => b.billDate.localeCompare(a.billDate) || b.id - a.id)[0];
    return last?.billNumber ?? null;
  }, [vendorId, recentBills]);
  const nextVendorInvoiceNumber = lastVendorInvoiceNumber ? continueReference(lastVendorInvoiceNumber) : null;

  // "Self-learning" convenience, not a rule: whichever category was used last time for this vendor
  // is offered as a starting point on the first line (only while that line's category is still
  // blank), and the vendor's own terms set the due date.
  useEffect(() => {
    if (vendorId === null) {
      setLastVendorCategory(null);
      return;
    }
    const lastBillFromVendor = recentBills.filter((b) => b.vendorId === vendorId).sort((a, b) => b.billDate.localeCompare(a.billDate))[0];
    const vendorRecord = localVendors.find((v) => v.id === vendorId);
    if (vendorRecord?.paymentTerms) {
      setPaymentTerms(vendorRecord.paymentTerms);
      const due = dueDateFor(billDate, vendorRecord.paymentTerms);
      if (due) setDueDate(due);
    }
    const suggestedCategory = lastBillFromVendor?.categoryAccountId ?? vendorRecord?.defaultExpenseAccountId ?? null;
    const suggestedTax = lastBillFromVendor?.taxCode;
    setLastVendorCategory(lastBillFromVendor?.categoryAccountId ?? null);
    if (suggestedCategory) {
      setLines((current) =>
        current.map((line, index) => (index === 0 && line.categoryAccountId === null ? { ...line, categoryAccountId: suggestedCategory, taxCode: suggestedTax === undefined ? line.taxCode : suggestedTax } : line)),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, recentBills, localVendors]);

  // A foreign-currency bill is one line: the converted CAD figure is that line's amount.
  useEffect(() => {
    if (fx.isForeign && fx.cadAmountCents !== null) {
      setLines((current) => [{ ...current[0], amountCents: fx.cadAmountCents! }]);
    }
  }, [fx.isForeign, fx.cadAmountCents]);

  const figures = useMemo(() => lines.map((line) => figuresFor(line, mode)), [lines, mode]);
  const subtotalCents = figures.reduce((sum, f) => sum + f.baseCents, 0);
  const taxTotalCents = figures.reduce((sum, f) => sum + f.taxCents, 0);
  const totalCents = subtotalCents + taxTotalCents;
  const firstCategoryId = lines[0]?.categoryAccountId ?? null;

  // Heads-up for a bill that might already be entered (same first category, same total, within a
  // few days) — catches an accidentally re-entered or re-imported vendor invoice. Never blocks saving.
  useEffect(() => {
    if (!open || firstCategoryId === null || totalCents <= 0) {
      setDuplicateWarning([]);
      return;
    }
    const timeoutId = setTimeout(() => {
      window.api.journal.findPossibleDuplicates({ entryDate: billDate, accountId: firstCategoryId, amountCents: totalCents }).then((r) => {
        if (r.ok) setDuplicateWarning(r.data);
      });
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [open, firstCategoryId, totalCents, billDate]);

  const categoryOptions = useMemo(() => purchaseLineAccountPickerOptions(accounts), [accounts]);
  const productOptions = useMemo(
    () => productPickerOptions(products, 'purchase', undefined, vendor ? { label: `Preferred from ${vendor.name}`, matches: (product) => product.preferredVendorId === vendor.id } : undefined),
    [products, vendor],
  );

  function updateLine(key: string, patch: Partial<LineRow>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function applyProduct(key: string, product: Product | undefined, quantity: number) {
    if (!product) return updateLine(key, { productId: null });
    if (productTypeOf(product) === 'bundle') {
      // Buying a kit: one line per component at its purchase cost, the picked row taking the first.
      const { lines: parts } = expandBundle(product, products, quantity || 1);
      if (parts.length > 0) {
        setLines((current) =>
          current.flatMap((line) => {
            if (line.key !== key) return [line];
            return parts.map((part, index) => ({
              ...(index === 0 ? line : newLine(line.taxCode)),
              productId: part.product.id,
              description: part.product.description?.trim() || part.product.name,
              quantity: part.quantity,
              amountCents: Math.round(part.product.purchasePriceCents * part.quantity),
              ...(part.product.trackQuantity && part.product.assetAccountId ? { categoryAccountId: part.product.assetAccountId } : {}),
              ...(part.product.defaultTaxCode ? { taxCode: part.product.defaultTaxCode as LineRow['taxCode'], typedTaxCents: null } : {}),
            }));
          }),
        );
        return;
      }
    }
    updateLine(key, {
      productId: product.id,
      description: product.description?.trim() || product.name,
      amountCents: Math.round(product.purchasePriceCents * quantity),
      quantity,
      ...(product.trackQuantity && product.assetAccountId ? { categoryAccountId: product.assetAccountId } : {}),
      ...(product.defaultTaxCode ? { taxCode: product.defaultTaxCode, typedTaxCents: null } : {}),
    });
  }

  function addLine() {
    setLines((current) => [...current, newLine(taxDefaultLoaded ? defaultLineTaxCode : null)]);
  }

  function removeLine(key: string) {
    setLines((current) => (current.length === 1 ? [newLine(taxDefaultLoaded ? defaultLineTaxCode : null)] : current.filter((line) => line.key !== key)));
  }

  function prepareNextBill() {
    setBillNumber('');
    setPurchaseOrderNumber('');
    setBillDate(today());
    const nextDue = dueDateFor(today(), paymentTerms);
    setDueDate(nextDue ?? today());
    setLines([newLine(taxDefaultLoaded ? defaultLineTaxCode : null)]);
    setMemo('');
    setDuplicateWarning([]);
    fx.reset();
  }

  async function handleSave(after: 'close' | 'next') {
    if (vendorId === null) {
      setError('Select a vendor from the list, or use “+ Add New Vendor” to create one before saving.');
      return;
    }
    const filled = lines.filter((line) => line.amountCents > 0 || line.categoryAccountId !== null || line.description.trim() !== '');
    if (filled.length === 0) {
      setError('Add at least one line with a category and an amount before saving.');
      return;
    }
    const missingCategory = filled.findIndex((line) => line.categoryAccountId === null);
    if (missingCategory >= 0) {
      setError(`Line ${missingCategory + 1} needs a category (an expense or asset account).`);
      return;
    }
    const missingAmount = filled.findIndex((line) => line.amountCents <= 0);
    if (missingAmount >= 0) {
      setError(`Line ${missingAmount + 1} needs an amount greater than zero.`);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await window.api.bills.create({
      vendorId,
      billNumber: billNumber.trim() || null,
      purchaseOrderNumber: purchaseOrderNumber.trim() || null,
      billDate,
      dueDate,
      paymentTerms,
      lines: filled.map((line) => {
        const f = figuresFor(line, mode);
        return {
          categoryAccountId: line.categoryAccountId as number,
          description: line.description.trim() ? line.description.trim() : null,
          baseCents: f.baseCents,
          taxCode: line.taxCode,
          taxCents: f.taxCents,
          productId: line.productId,
          quantity: line.productId === null ? null : line.quantity,
          tagIds: line.tagIds,
        };
      }),
      memo: memo.trim() ? memo.trim() : null,
      foreignCurrency: fx.isForeign ? fx.currency : null,
      foreignAmountCents: fx.isForeign ? fx.foreignAmountCents : null,
      exchangeRate: fx.isForeign ? fx.exchangeRate : null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onSaved();
    if (after === 'close') return onClose();
    prepareNextBill();
    window.api.bills.list().then((r) => r.ok && setRecentBills(r.data));
    window.api.products.list({ activeOnly: true }).then((r) => r.ok && setProducts(r.data));
  }

  if (!open) return null;

  const inputClass = 'mt-1 w-full rounded border border-gray-300 px-2 py-1.5';
  const cellInput = 'w-full rounded border border-gray-300 px-2 py-1 text-sm';
  const saveDisabled = busy || (fx.isForeign && fx.cadAmountCents === null);

  // Rendered into document.body, like the shared Modal: a transform or filter on any page ancestor
  // turns `fixed` into "relative to that ancestor", which clipped this sheet to a short strip.
  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col bg-white" role="dialog" aria-modal="true" aria-labelledby="bill-form-title">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-2">
        <h1 id="bill-form-title" className="text-lg font-semibold text-gray-900">Bill</h1>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void readFromFile()} className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50" title="Pick the vendor's PDF or a scan; the vendor, date and amounts are filled in for you to check">
            Read from PDF or scan…
          </button>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Balance due</div>
            <div className="text-lg font-semibold tabular-nums text-gray-900"><Money cents={totalCents} /></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" title="Close (Esc)" className="rounded-full p-2 text-xl leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-900">
            ×
          </button>
        </div>
      </div>
      {readNotice && <div className="border-b border-amber-100 bg-amber-50 px-5 py-1.5 text-xs text-amber-900">{readNotice}</div>}

      <div className="relative flex min-h-0 flex-1">
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-3">
          {error && <ErrorNotice message={error} />}

          <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-gray-600">Vendor</span>
                <Combobox
                  options={localVendors.map((v) => ({ value: String(v.id), label: v.name }))}
                  value={vendorId !== null ? String(vendorId) : null}
                  onChange={(v) => setVendorId(v ? Number(v) : null)}
                  placeholder="Select a vendor…"
                  onAddNew={() => setShowAddVendor(true)}
                  addNewLabel="+ Add New Vendor"
                />
              </label>
              <div className="text-sm">
                <span className="text-gray-600">Mailing address</span>
                <div className="mt-1 min-h-[4.5rem] whitespace-pre-line rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-gray-700">
                  {vendor ? [vendor.name, vendor.address].filter(Boolean).join('\n') : <span className="text-gray-400">Choose a vendor to see their address.</span>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <label className="block text-sm">
                <span className="text-gray-600">Terms</span>
                <PaymentTermsSelect
                  value={paymentTerms}
                  documentDate={billDate}
                  onChange={(term, due) => {
                    setPaymentTerms(term);
                    if (due) setDueDate(due);
                  }}
                  className={`${inputClass} text-sm`}
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Bill Date</span>
                <input
                  type="date" min={DATE_MIN} max={DATE_MAX}
                  className={inputClass}
                  value={billDate}
                  onChange={(e) => {
                    setBillDate(clampIsoDate(e.target.value));
                    const recomputed = dueDateFor(clampIsoDate(e.target.value), paymentTerms);
                    if (recomputed) setDueDate(recomputed);
                  }}
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Due Date</span>
                <input
                  type="date" min={DATE_MIN} max={DATE_MAX}
                  className={inputClass}
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(clampIsoDate(e.target.value));
                    // Typing a date by hand means the terms no longer describe it.
                    setPaymentTerms(termFromDates(billDate, clampIsoDate(e.target.value)));
                  }}
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Vendor Invoice Number</span>
                <input className={inputClass} value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder={nextVendorInvoiceNumber ?? 'e.g. INV-10482'} maxLength={100} />
                {lastVendorInvoiceNumber ? (
                  <span className="mt-1 block text-xs text-gray-500">
                    Last from this vendor: {lastVendorInvoiceNumber}
                    {nextVendorInvoiceNumber ? ` — next would be ${nextVendorInvoiceNumber}` : ''}
                  </span>
                ) : (
                  <span className="mt-1 block text-xs text-gray-400">Used to detect a duplicate vendor invoice.</span>
                )}
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Purchase Order / Reference</span>
                <input className={inputClass} value={purchaseOrderNumber} onChange={(e) => setPurchaseOrderNumber(e.target.value)} placeholder="Optional" maxLength={100} />
              </label>
              <div className="block text-sm">
                <span className="text-gray-600">Currency</span>
                <div className="mt-1"><ForeignCurrencySelector fx={fx} /></div>
              </div>
            </div>
          </div>
          <ForeignCurrencyDetails fx={fx} />

          <div className="rounded-lg border border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
              <span className="text-sm font-semibold text-gray-700">Lines</span>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                Amounts are
                <select aria-label="Amounts are" value={mode} onChange={(e) => setMode(e.target.value as AmountsMode)} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm">
                  <option value="exclusive">Exclusive of tax</option>
                  <option value="inclusive">Inclusive of tax (as on a receipt)</option>
                </select>
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-2 py-2 w-8">#</th>
                    <th className="px-2 py-2 w-64">Category</th>
                    <th className="px-2 py-2">Description</th>
                    <th className="px-2 py-2 w-44">Item received (optional)</th>
                    <th className="px-2 py-2 w-20 text-right">Qty</th>
                    <th className="px-2 py-2 w-32 text-right">{mode === 'inclusive' ? 'Amount (incl. tax)' : 'Amount (CAD)'}</th>
                    <th className="px-2 py-2 w-40">Tax</th>
                    <th className="px-2 py-2 w-28 text-right">Tax amount</th>
                    {hasTagGroups && <th className="px-2 py-2 w-36">Class / Location</th>}
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const f = figures[index];
                    return (
                      <tr key={line.key} className="border-t border-gray-100 align-top">
                        <td className="px-2 py-1.5 text-gray-400">{index + 1}</td>
                        <td className="px-2 py-1.5">
                          <AccountCombobox
                            options={categoryOptions}
                            value={line.categoryAccountId !== null ? String(line.categoryAccountId) : null}
                            onChange={(v) => updateLine(line.key, { categoryAccountId: v ? Number(v) : null })}
                            placeholder="Select an expense or asset account…"
                            accounts={accounts}
                            initialType="Expense"
                            addNewLabel="+ New category"
                            onAccountCreated={(created) => {
                              setAccounts((prev) => [...prev, created]);
                              updateLine(line.key, { categoryAccountId: created.id });
                            }}
                          />
                          {index === 0 && lastVendorCategory !== null && lastVendorCategory === line.categoryAccountId && (
                            <span className="mt-1 block text-xs text-gray-400">Pre-filled from the last bill for this vendor.</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            aria-label={`Line ${index + 1} description`}
                            list={suggestionListId('transaction-memo')}
                            className={cellInput}
                            value={line.description}
                            onChange={(e) => updateLine(line.key, { description: e.target.value })}
                            onBlur={rememberOnBlur('transaction-memo')}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Combobox
                            options={productOptions}
                            value={line.productId === null ? null : String(line.productId)}
                            onChange={(value) => applyProduct(line.key, products.find((row) => row.id === Number(value)), line.quantity)}
                            placeholder="None"
                            onAddNew={() => setAddProductForLine(line.key)}
                            addNewLabel="+ New product / service"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            aria-label={`Line ${index + 1} quantity`}
                            type="number"
                            min="0.0001"
                            step="any"
                            value={line.quantity}
                            onChange={(event) => {
                              const next = Number(event.target.value) || 0;
                              const product = products.find((row) => row.id === line.productId);
                              updateLine(line.key, { quantity: next, ...(product ? { amountCents: Math.round(product.purchasePriceCents * next) } : {}) });
                            }}
                            className={`${cellInput} text-right`}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <CurrencyInput
                            aria-label={`Line ${index + 1} amount`}
                            valueCents={line.amountCents}
                            onChange={(cents) => updateLine(line.key, { amountCents: cents })}
                            disabled={fx.isForeign}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            aria-label={`Line ${index + 1} tax`}
                            className={`${cellInput} bg-white`}
                            value={line.taxCode ?? ''}
                            onChange={(e) => updateLine(line.key, { taxCode: (e.target.value || null) as TaxCode | null, typedTaxCents: null })}
                          >
                            {TAX_CODE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          {line.taxCode && line.taxCode !== 'NonHST' ? (
                            <CurrencyInput
                              aria-label={`Line ${index + 1} tax amount`}
                              valueCents={f.taxCents}
                              onChange={(cents) => updateLine(line.key, { typedTaxCents: cents })}
                            />
                          ) : (
                            <div className="py-1 text-right text-gray-400">—</div>
                          )}
                        </td>
                        {hasTagGroups && <td className="px-2 py-1.5"><DocumentLineTagPicker tagIds={line.tagIds} onChange={(tagIds) => updateLine(line.key, { tagIds })} /></td>}
                        <td className="px-2 py-1.5 text-right">
                          <button type="button" onClick={() => removeLine(line.key)} aria-label={`Remove line ${index + 1}`} title="Remove line" className="rounded px-2 py-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                            🗑
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3 border-t border-gray-200 px-3 py-2">
              <div className="flex gap-2">
                <button type="button" onClick={addLine} disabled={fx.isForeign} className={buttonClass('secondary')}>Add line</button>
                <button type="button" onClick={() => setLines([newLine(taxDefaultLoaded ? defaultLineTaxCode : null)])} className={buttonClass('secondary')}>Clear all lines</button>
              </div>
              <dl className="grid grid-cols-[auto_8rem] gap-x-4 gap-y-1 text-sm tabular-nums">
                <dt className="text-gray-600">Subtotal (before tax)</dt>
                <dd className="text-right" data-testid="bill-subtotal"><Money cents={subtotalCents} /></dd>
                <dt className="text-gray-600">Tax → GST/HST Recoverable</dt>
                <dd className="text-right" data-testid="bill-tax"><Money cents={taxTotalCents} /></dd>
                <dt className="font-semibold text-gray-900">Total</dt>
                <dd className="text-right font-semibold" data-testid="bill-total"><Money cents={totalCents} /></dd>
              </dl>
            </div>
          </div>
          {lines.some((line) => line.taxCode === 'MealsHST') && (
            <p className="text-xs text-gray-400">
              CRA only allows a 50% Input Tax Credit on meals & entertainment — half that line's tax is recorded as recoverable, the other half is added to the expense as a real cost.
            </p>
          )}

          <label className="block text-sm md:max-w-xl">
            <span className="text-gray-600">Memo (optional)</span>
            <textarea
              name="bill-memo"
              rows={2}
              className={inputClass}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              onBlur={(e) => recordSuggestion('transaction-memo', e.target.value)}
            />
            <SuggestionDatalist fieldKey="transaction-memo" />
          </label>
          <p className="text-xs text-gray-400">Saving posts the bill immediately (Debit each category, Credit Accounts Payable for the total). Pay it later from the Purchases list.</p>
          {duplicateWarning.length > 0 && (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Possible duplicate — {duplicateWarning.length === 1 ? 'an entry' : `${duplicateWarning.length} entries`} for this exact amount and category
              already exist{duplicateWarning.length === 1 ? 's' : ''} within a few days ({duplicateWarning.map((d) => d.entryDate).join(', ')}). Double-check
              this isn't already entered.
            </p>
          )}
        </div>
      </div>
      <QuickScroll targetRef={bodyRef} />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-2">
        <button type="button" onClick={onClose} className={buttonClass('secondary')}>Cancel</button>
        <button type="button" disabled={saveDisabled} onClick={() => handleSave('next')} className={buttonClass('secondary')}>Save &amp; Next</button>
        <button type="button" disabled={saveDisabled} onClick={() => handleSave('close')} className={buttonClass('primary')}>Save &amp; Close</button>
      </div>

      <ContactFormModal
        open={showAddVendor}
        onClose={() => setShowAddVendor(false)}
        editing={null}
        kind="vendor"
        onSaved={(newVendor) => {
          setLocalVendors((prev) => [...prev, newVendor]);
          setVendorId(newVendor.id);
        }}
      />
      {addProductForLine !== null && (
        <NewProductModal
          accounts={accounts}
          initialName={lines.find((line) => line.key === addProductForLine)?.description ?? ''}
          initialIncomeAccountId={accounts.find((account) => account.accountType === 'Revenue')?.id ?? null}
          onClose={() => setAddProductForLine(null)}
          onCreated={(product) => {
            setProducts((current) => [...current, product]);
            const key = addProductForLine;
            const line = lines.find((row) => row.key === key);
            if (line) applyProduct(key, product, line.quantity);
            setAddProductForLine(null);
          }}
        />
      )}
    </div>,
    document.body,
  );
}
