import { PaymentTermsSelect } from '../../components/PaymentTermsSelect';
import { BackButton } from '../../components/BackButton';
import { RecordNavigator } from '../../components/RecordNavigator';
import { asPaymentTerm, dueDateFor, termFromDates, type PaymentTerm } from '@shared/domain/contacts/paymentTerms';
import { compareDocumentNumbers } from '@shared/domain/documents/documentNumbering';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Account, Contact, Invoice, InvoiceLine, InvoicePayment, TaxCode } from '@shared/domain/types';
import type { Product } from '../../../preload/index';
import { suggestTaxCents } from '@shared/domain/ledger/computeTaxSplit';
import { taxPortionOfInclusive } from '@shared/domain/ledger/taxCodes';
import { convertForeignAmountToCadCents } from '@shared/domain/currency/convertForeignAmount';
import { Combobox } from '../../components/Combobox';
import { AccountCombobox } from '../../components/AccountCombobox';
import { saleLineAccountPickerOptions } from '../../utils/accountLabel';
import { CurrencyInput } from '../../components/CurrencyInput';
import { ForeignCurrencyDetails, ForeignCurrencySelector } from '../../components/ForeignCurrencyFields';
import { Money } from '../../components/Money';
import { ShareMenu } from '../../components/ShareMenu';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { useForeignCurrencyAmount } from '../../hooks/useForeignCurrencyAmount';
import { useUiStore } from '../../app/store/uiStore';
import { ReceivePaymentModal } from './ReceivePaymentModal';
import { rememberOnBlur } from '../../utils/textCase';
import { recordSuggestion, suggestionListId } from '../../utils/textSuggestions';
import { ContactFormModal } from '../contacts/ContactFormModal';
import { taxCodeOptions } from '@shared/domain/ledger/taxCodes';
import { useCompanyTaxDefault } from '../../hooks/useCompanyTaxDefault';
import { isAccountingFirm } from '@shared/domain/sales/firmServices';
import { JournalEntryLink } from '../../components/JournalEntryLink';
import { NewProductModal } from '../inventory/NewProductModal';
import { ServiceFeeRail } from '../../components/ServiceFeeRail';
import { CustomTaxRateInput } from '../../components/CustomTaxRateInput';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { AttachmentsPanel } from '../../components/AttachmentsPanel';
import { DocumentHistoryPanel } from '../../components/DocumentHistoryPanel';
import { DocumentLineTagPicker, useHasTagGroups } from '../../components/DocumentLineTagPicker';
import { expandBundle, productPickerOptions, productTypeOf } from '@shared/domain/inventory/productCatalogue';
import { ErrorNotice } from '../../components/ErrorNotice';


interface LineRow {
  key: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  revenueAccountId: number | null;
  /** The product sold, when this line is stock. Null for a service or a delivery charge. */
  productId: number | null;
  taxCode: TaxCode | null;
  manualHstCents: number;
  /** Class / location tags chosen for this line. */
  tagIds: number[];
}

let rowKeyCounter = 0;
function newRow(defaultTaxCode: TaxCode | null = null): LineRow {
  rowKeyCounter += 1;
  return { key: `row-${rowKeyCounter}`, description: '', quantity: 1, unitPriceCents: 0, revenueAccountId: null, productId: null, taxCode: defaultTaxCode, manualHstCents: 0, tagIds: [] };
}

function today(): string {
  return localIsoDate();
}

function lineAmountCents(row: Pick<LineRow, 'quantity' | 'unitPriceCents'>): number {
  return Math.round(row.quantity * row.unitPriceCents);
}

/** The amount actually posted for a line: when the invoice currency is USD, the typed unit price
 * is USD, so the raw lineAmountCents needs converting to CAD via the fetched/entered rate. */
function cadLineAmountCents(row: Pick<LineRow, 'quantity' | 'unitPriceCents'>, isForeign: boolean, exchangeRate: number | null): number {
  const raw = lineAmountCents(row);
  return isForeign && exchangeRate !== null ? convertForeignAmountToCadCents(raw, exchangeRate) : raw;
}

/** The tax amount actually booked for a saved line: the accountant's own figure for 'Manual'
 * lines, or the flat-rate suggestion for rate-based codes (see buildInvoiceJournalLines.ts, which
 * posts this same amount to GST/HST Payable — l.amountCents is the pre-tax base). */
function invoiceLineTaxCents(line: Pick<InvoiceLine, 'taxCode' | 'manualHstCents' | 'amountCents'>): number {
  if (line.taxCode === 'Manual') return line.manualHstCents ?? 0;
  return suggestTaxCents(line.taxCode, line.amountCents);
}

/** Read-only view of a posted invoice's line items — creation is the only supported write path
 * (mirrors Bills: no edit after posting), so an existing invoice is display-only here. */
function PostedInvoiceLines({
  lines,
  discountCents,
  revenueAccountNameById,
  productNameById,
}: {
  lines: InvoiceLine[];
  discountCents: number;
  revenueAccountNameById: Map<number, string>;
  productNameById: Map<number, string>;
}) {
  const subtotalCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
  const taxCents = lines.reduce((sum, l) => sum + invoiceLineTaxCents(l), 0);
  const totalCents = subtotalCents + taxCents - discountCents;
  return (
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
            <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Tax</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-gray-100 last:border-0">
              <td className="px-3 py-1.5">{l.productId === null ? 'Service / Other' : productNameById.get(l.productId) ?? 'Product unavailable'}</td>
              <td className="px-3 py-1.5">{l.description}</td>
              <td className="px-3 py-1.5 text-right">{l.quantity}</td>
              <td className="px-3 py-1.5 text-right">
                <Money cents={l.unitPriceCents} />
              </td>
              <td className="px-3 py-1.5 text-right">
                <Money cents={l.amountCents} />
              </td>
              <td className="px-3 py-1.5">{revenueAccountNameById.get(l.revenueAccountId) ?? '—'}</td>
              <td className="px-3 py-1.5 text-right">{invoiceLineTaxCents(l) > 0 ? <Money cents={invoiceLineTaxCents(l)} /> : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-gray-500">
            <td className="px-3 py-1" colSpan={4}>
              Subtotal
            </td>
            <td className="px-3 py-1 text-right">
              <Money cents={subtotalCents} />
            </td>
            <td colSpan={2} />
          </tr>
          {taxCents > 0 && (
            <tr className="text-gray-500">
              <td className="px-3 py-1" colSpan={4}>
                GST/HST
              </td>
              <td className="px-3 py-1 text-right">
                <Money cents={taxCents} />
              </td>
              <td colSpan={2} />
            </tr>
          )}
          {discountCents > 0 && (
            <tr className="text-emerald-700">
              <td className="px-3 py-1" colSpan={4}>Customer discount</td>
              <td className="px-3 py-1 text-right">−<Money cents={discountCents} /></td>
              <td colSpan={2} />
            </tr>
          )}
          <tr className="bg-gray-50 font-medium">
            <td className="px-3 py-2" colSpan={4}>
              Total
            </td>
            <td className="px-3 py-2 text-right">
              <Money cents={totalCents} />
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** `customerId` preselects the customer on a new invoice — the customer page's New invoice
 * button sends it, so the sheet opens ready to fill rather than asking who it is for again. */
export function InvoiceEditorPage({ id, customerId: presetCustomerId }: { id: number | 'new'; customerId?: number }) {
  // Tax codes ordered with the company's own province first — see useCompanyTaxDefault.
  const { province: taxProvince, businessType, defaultTaxCode, loaded: taxDefaultLoaded } = useCompanyTaxDefault();
  const TAX_CODE_OPTIONS = taxCodeOptions('income', taxProvince);
  const effectiveDefaultTaxCode = defaultTaxCode ?? 'HST';
  const setView = useUiStore((s) => s.setView);
  const [accounts, setAccounts] = useState<Account[]>([]);
  /** Products a line can be sold from. Choosing one is what lets posting the invoice take the stock
   * and charge its cost, instead of leaving that as a second job somebody has to remember. */
  const [products, setProducts] = useState<Product[]>([]);
  const [newProductForLine, setNewProductForLine] = useState<{ lineKey: string; initialName: string } | null>(null);
  /** What happened to stock when the invoice saved — said plainly, because silence here is how
   * somebody discovers weeks later that their stock never moved. */
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [posted, setPosted] = useState<Invoice | null>(null);
  const hasTagGroups = useHasTagGroups();
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [receiving, setReceiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [creditAvailableCents, setCreditAvailableCents] = useState(0);
  useEffect(() => {
    if (customerId === null) { setCreditAvailableCents(0); return; }
    let cancelled = false;
    window.api.creditNotes.list().then((r) => {
      if (cancelled || !r.ok) return;
      setCreditAvailableCents(r.data.filter((n) => n.kind === 'customer' && n.contactId === customerId && n.status === 'open').reduce((s, n) => s + Math.max(0, n.totalCents - n.appliedCents), 0));
    });
    return () => { cancelled = true; };
  }, [customerId]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceNumberManuallyEdited, setInvoiceNumberManuallyEdited] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState(today());
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm>('net30');
  /** Every saved invoice id, oldest first — what the arrows page through. */
  const [allInvoiceIds, setAllInvoiceIds] = useState<number[]>([]);
  const [memo, setMemo] = useState('');
  const [customerPoNumber, setCustomerPoNumber] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  /** Where the goods go: the customer's billing address, their saved ship-to address, or one typed
   * for this invoice only. A choice first; the text box only appears when it is really custom. */
  const [shipToMode, setShipToMode] = useState<'billing' | 'shipping' | 'custom'>('shipping');
  const [discountCents, setDiscountCents] = useState(0);
  // Whether the typed unit prices already include tax (a price list quoted "tax in") or not.
  const [amountsMode, setAmountsMode] = useState<'exclusive' | 'inclusive'>('exclusive');
  const [lines, setLines] = useState<LineRow[]>([newRow()]);
  const fx = useForeignCurrencyAmount();
  const copySourceRef = useRef<Invoice | null>(null);
  const nextNumberRequestRef = useRef(0);

  async function assignNextInvoiceNumber(documentDate: string) {
    const requestId = ++nextNumberRequestRef.current;
    const next = await window.api.invoices.nextNumber({ invoiceDate: documentDate });
    if (requestId !== nextNumberRequestRef.current) return;
    if (next.ok) setInvoiceNumber(next.data);
    else setError(next.error);
  }

  async function prepareNewInvoice(copyFrom: Invoice | null = null) {
    const documentDate = today();
    const terms = copyFrom?.paymentTerms ?? (copyFrom ? termFromDates(copyFrom.invoiceDate, copyFrom.dueDate) : 'net30');
    setPosted(null);
    setPayments([]);
    setCustomerId(copyFrom?.customerId ?? presetCustomerId ?? null);
    setInvoiceDate(documentDate);
    setDueDate(dueDateFor(documentDate, terms) ?? documentDate);
    setMemo(copyFrom?.memo ?? '');
    setCustomerPoNumber(copyFrom?.customerPoNumber ?? '');
    setShippingAddress(copyFrom?.shippingAddress ?? '');
    setDiscountCents(copyFrom?.discountCents ?? 0);
    setLines(
      copyFrom
        ? copyFrom.lines.map((line) => ({
            key: `row-${++rowKeyCounter}`,
            tagIds: [],
            description: line.description,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            revenueAccountId: line.revenueAccountId,
            productId: line.productId,
            taxCode: line.taxCode,
            manualHstCents: line.manualHstCents ?? 0,
          }))
        : [newRow(taxDefaultLoaded ? effectiveDefaultTaxCode : null)],
    );
    fx.reset();
    setPaymentTerms(terms);
    setError(null);
    setInvoiceNumberManuallyEdited(false);
    await assignNextInvoiceNumber(documentDate);
  }

  useEffect(() => {
    window.api.accounts.list({ activeOnly: true }).then((r) => r.ok && setAccounts(r.data));
    // Load inactive products too so historical posted invoices can still name what was sold;
    // only active products are offered while composing a new invoice.
    window.api.products.list({}).then((r) => {
      if (!r.ok) return;
      // An item can be created from this invoice while the initial list request is still in
      // flight. Merge the response so that late-arriving list data never removes the newly saved
      // product from the picker or clears it from the current line.
      setProducts((current) => {
        const merged = new Map(r.data.map((product) => [product.id, product]));
        for (const product of current) merged.set(product.id, product);
        return [...merged.values()];
      });
    });
    window.api.customers.list().then((r) => {
      if (!r.ok) return;
      // Merge instead of replace: if a customer is added inline while this initial request is still
      // in flight, its later response must not remove the newly selected customer from the picker.
      setCustomers((current) => {
        const merged = new Map(current.map((customer) => [customer.id, customer]));
        for (const customer of r.data.filter((entry) => entry.isActive)) merged.set(customer.id, customer);
        return [...merged.values()];
      });
    });
    // Ordered by number rather than by id, so the arrows follow the order a person reads the
    // invoices in — INV-2026-0002 after 0001, not whichever happened to be typed first.
    window.api.invoices.list({}).then((r) => {
      if (!r.ok) return;
      const ordered = [...r.data].sort((a, b) => compareDocumentNumbers('INV', a.invoiceNumber, b.invoiceNumber));
      setAllInvoiceIds(ordered.map((i) => i.id));
    });
  }, []);

  useEffect(() => {
    if (typeof id === 'number') {
      window.api.invoices.get(id).then((r) => {
        if (!r.ok) return setError(r.error);
        setPosted(r.data);
        setPaymentTerms(r.data.paymentTerms ?? termFromDates(r.data.invoiceDate, r.data.dueDate));
      });
      window.api.invoices.payments(id).then((r) => r.ok && setPayments(r.data));
      return;
    }
    const copyFrom = copySourceRef.current;
    copySourceRef.current = null;
    void prepareNewInvoice(copyFrom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Apply the company HST treatment to blank lines once the company profile finishes loading.
  // This closes the gap where the picker showed HST but a new line remained unlinked and displayed
  // no calculation. Existing/copied tax choices are preserved.
  useEffect(() => {
    if (id !== 'new' || !taxDefaultLoaded) return;
    setLines((previous) =>
      previous.map((line) => (line.taxCode === null ? { ...line, taxCode: effectiveDefaultTaxCode } : line)),
    );
  }, [id, taxDefaultLoaded, effectiveDefaultTaxCode]);

  const revenueAccountOptions = useMemo(
    () => saleLineAccountPickerOptions(accounts),
    [accounts],
  );
  const revenueAccountNameById = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const productNameById = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products]);
  const [onHand, setOnHand] = useState<Map<number, number>>(new Map());
  useEffect(() => {
    window.api.inventory.status({}).then((r) => {
      if (r.ok) setOnHand(new Map((r.data?.rows ?? []).map((row) => [row.productId, row.quantityOnHand])));
    });
  }, [products]);
  const productOptions = useMemo(() => productPickerOptions(products, 'sale', onHand), [products, onHand]);

  /** A bundle becomes its component lines: the picked row takes the first component, the rest are
   * inserted after it, each priced, taxed and stock-relieved on its own. */
  function applyBundleToLine(line: LineRow, bundle: Product) {
    const { lines: parts } = expandBundle(bundle, products, line.quantity || 1);
    if (parts.length === 0) return applyProductToLine(line, bundle);
    const rows = parts.map((part, index) => ({
      ...(index === 0 ? line : newRow(effectiveDefaultTaxCode)),
      productId: part.product.id,
      description: part.product.description?.trim() || part.product.name,
      quantity: part.quantity,
      unitPriceCents: part.product.salePriceCents,
      revenueAccountId: part.product.incomeAccountId ?? line.revenueAccountId,
      ...(part.product.defaultTaxCode ? { taxCode: part.product.defaultTaxCode as LineRow['taxCode'], manualHstCents: 0 } : {}),
    }));
    setLines((prev) => prev.flatMap((l) => (l.key === line.key ? rows : [l])));
  }
  const customerNameById = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  function updateLine(key: string, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function applyProductToLine(line: LineRow, product: Product | null) {
    updateLine(line.key, {
      productId: product?.id ?? null,
      // Defaults speed up entry, but never overwrite a customer-specific value already entered.
      ...(product && !line.description.trim() ? { description: product.description?.trim() || product.name } : {}),
      ...(product && line.unitPriceCents === 0 ? { unitPriceCents: product.salePriceCents } : {}),
      ...(product?.incomeAccountId && line.revenueAccountId === null ? { revenueAccountId: product.incomeAccountId } : {}),
      ...(product?.defaultTaxCode ? { taxCode: product.defaultTaxCode, manualHstCents: 0 } : {}),
    });
  }

  function chooseServiceFee(name: string) {
    const product = products.find((row) => row.isActive && row.name.trim().toLowerCase() === name.toLowerCase());
    const blank = lines.find((line) => !line.description.trim() && line.unitPriceCents === 0);
    const target = blank ?? newRow(effectiveDefaultTaxCode);
    if (!blank) setLines((current) => [...current, target]);
    if (product) {
      const patch = { productId: product.id, description: product.description?.trim() || product.name, unitPriceCents: product.salePriceCents, revenueAccountId: product.incomeAccountId, ...(product.defaultTaxCode ? { taxCode: product.defaultTaxCode, manualHstCents: 0 } : {}) };
      setLines((current) => current.map((line) => line.key === target.key ? { ...line, ...patch } : line));
    } else {
      setNewProductForLine({ lineKey: target.key, initialName: name });
    }
  }

  /** The tax on a line. Exclusive mode: the rate on the typed amount (or the typed Manual figure).
   * Inclusive mode: the tax already inside the typed amount. */
  function lineTaxCents(line: LineRow): number {
    const typed = cadLineAmountCents(line, fx.isForeign, fx.exchangeRate);
    if (line.taxCode === 'Manual') return Math.min(typed, line.manualHstCents);
    return amountsMode === 'inclusive' ? taxPortionOfInclusive(line.taxCode, typed) : suggestTaxCents(line.taxCode, typed);
  }

  /** The pre-tax amount a line posts to revenue. */
  function lineBaseCents(line: LineRow): number {
    const typed = cadLineAmountCents(line, fx.isForeign, fx.exchangeRate);
    return amountsMode === 'inclusive' ? typed - lineTaxCents(line) : typed;
  }

  const subtotalCents = lines.reduce((sum, l) => sum + lineBaseCents(l), 0);
  const taxCents = lines.reduce((sum, l) => sum + lineTaxCents(l), 0);
  const grossTotalCents = subtotalCents + taxCents;
  const totalCents = Math.max(0, grossTotalCents - discountCents);
  const newProductTargetLine = newProductForLine ? lines.find((line) => line.key === newProductForLine.lineKey) ?? null : null;
  const invalidLineIndex = lines.findIndex((line) => !line.description.trim() || line.revenueAccountId === null || lineAmountCents(line) <= 0);
  const invalidLine = invalidLineIndex >= 0 ? lines[invalidLineIndex] : null;
  const saveProblem =
    customerId === null
      ? 'Select a customer from the list, or use “+ Add New Customer” before saving.'
      : !invoiceNumber.trim()
        ? 'Enter an invoice number before saving.'
        : lines.length === 0
          ? 'Add at least one invoice line before saving.'
          : invalidLine && !invalidLine.description.trim()
            ? `Line ${invalidLineIndex + 1}: enter a description before saving.`
            : invalidLine && lineAmountCents(invalidLine) <= 0
              ? `Line ${invalidLineIndex + 1}: enter a quantity and unit price greater than zero.`
              : invalidLine?.revenueAccountId === null
                ? `Line ${invalidLineIndex + 1}: select a revenue account before saving.`
                : fx.isForeign && fx.exchangeRate === null
                  ? `Enter or fetch the ${fx.currency} exchange rate before saving.`
                  : discountCents >= grossTotalCents
                    ? 'Customer discount must be less than the invoice total.'
                  : null;

  /** What to do once the invoice is saved.
   *
   * 'stay' keeps the saved invoice open (the old behaviour, and what you want before emailing it),
   * 'new' clears the form for the next one, and 'close' goes back to the list. Saving and then
   * having to navigate is the difference between entering ten invoices and entering one. */
  type AfterSave = 'stay' | 'new' | 'copy' | 'close';

  async function handleSave(after: AfterSave = 'stay') {
    if (saveProblem) {
      setError(saveProblem);
      return;
    }
    if (customerId === null) return;
    setBusy(true);
    setError(null);
    const foreignTotalCents = fx.isForeign ? lines.reduce((sum, l) => sum + lineAmountCents(l), 0) : null;
    const result = await window.api.invoices.create({
      customerId,
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate,
      dueDate,
      memo: memo.trim() ? memo.trim() : null,
      customerPoNumber: customerPoNumber.trim() || null,
      shippingAddress: shippingAddress.trim() || null,
      discountCents,
      paymentTerms,
      foreignCurrency: fx.isForeign ? fx.currency : null,
      foreignAmountCents: foreignTotalCents,
      exchangeRate: fx.isForeign ? fx.exchangeRate : null,
      lines: lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        // Inclusive mode: the stored unit price is the pre-tax base, and the tax inside the typed
        // price is carried as an exact Manual figure so the invoice total equals what was typed.
        unitPriceCents:
          amountsMode === 'inclusive'
            ? Math.round(lineBaseCents(l) / (l.quantity || 1))
            : fx.isForeign && fx.exchangeRate !== null
              ? convertForeignAmountToCadCents(l.unitPriceCents, fx.exchangeRate)
              : l.unitPriceCents,
        revenueAccountId: l.revenueAccountId as number,
        tagIds: l.tagIds,
        productId: l.productId,
        taxCode: amountsMode === 'inclusive' && l.taxCode && l.taxCode !== 'NonHST' ? 'Manual' : l.taxCode,
        manualHstCents: amountsMode === 'inclusive' ? (l.taxCode && l.taxCode !== 'NonHST' ? lineTaxCents(l) : null) : l.taxCode === 'Manual' ? l.manualHstCents : null,
      })),
    });
    if (!result.ok) {
      setBusy(false);
      return setError(result.error);
    }

    // Stock/COGS is posted atomically inside invoices.create; no second inventory call is needed.

    setBusy(false);

    // Refresh the arrows' list so an invoice just saved can be paged back to.
    window.api.invoices.list({}).then((r) => {
      if (!r.ok) return;
      const ordered = [...r.data].sort((a, b) => compareDocumentNumbers('INV', a.invoiceNumber, b.invoiceNumber));
      setAllInvoiceIds(ordered.map((i) => i.id));
    });

    if (after === 'close') return setView({ kind: 'sales', tab: 'invoices' });
    if (after === 'new') return void prepareNewInvoice();
    if (after === 'copy') return void prepareNewInvoice(result.data);
    setView({ kind: 'invoiceEditor', id: result.data.id });
  }

  async function handleDelete() {
    if (posted === null) return;
    const customerName = customerNameById.get(posted.customerId) ?? 'this customer';
    if (
      !window.confirm(
        `Delete invoice ${posted.invoiceNumber} for ${customerName}? This permanently removes the invoice and voids its linked accounting entry. This cannot be undone.`,
      )
    ) return;
    setBusy(true);
    const result = await window.api.invoices.delete(posted.id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setView({ kind: 'invoices' });
  }

  function handleCopyInvoice() {
    if (posted === null) return;
    copySourceRef.current = posted;
    setView({ kind: 'invoiceEditor', id: 'new' });
  }

  async function handleReverseLastPayment() {
    if (posted === null) return;
    if (!window.confirm(`Reverse the newest payment on invoice ${posted.invoiceNumber}? Its payment journal will be voided and the outstanding balance reopened.`)) return;
    setBusy(true);
    setError(null);
    const result = await window.api.invoices.reverseLastPayment(posted.id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setPosted(result.data);
    window.api.invoices.payments(result.data.id).then((r) => r.ok && setPayments(r.data));
  }

  async function handleDownloadPdf() {
    if (posted === null) return;
    setPdfBusy(true);
    setPdfError(null);
    setPdfNotice(null);
    const result = await window.api.invoicePdf.generate({ invoiceId: posted.id });
    setPdfBusy(false);
    if (!result.ok) return setPdfError(result.error);
    if (result.data.saved) setPdfNotice(`Saved to ${result.data.filePath}`);
  }

  async function handleEmailViaOutlook() {
    if (posted === null) return;
    setPdfBusy(true);
    setPdfError(null);
    setPdfNotice(null);
    const result = await window.api.invoicePdf.emailViaOutlook({ invoiceId: posted.id });
    setPdfBusy(false);
    if (!result.ok) return setPdfError(result.error);
    setPdfNotice('Outlook draft opened with the invoice attached.');
  }

  async function handleSaveToDownloads() {
    if (posted === null) return;
    setPdfBusy(true);
    setPdfError(null);
    setPdfNotice(null);
    const result = await window.api.invoicePdf.saveToDownloads({ invoiceId: posted.id });
    setPdfBusy(false);
    if (!result.ok) return setPdfError(result.error);
    setPdfNotice(`Saved to ${result.data.filePath}`);
  }

  /** WhatsApp has no public way for a desktop app to attach a local file to a chat directly (no
   * API, no URI scheme for it, whether Desktop or Web) — so this saves the PDF to Downloads and
   * opens a WhatsApp chat with a pre-filled message (addressed to the customer's own phone number
   * when one's on file), leaving the actual attach-file step as the one manual click WhatsApp
   * itself requires. */
  async function handleShareWhatsApp() {
    if (posted === null) return;
    setPdfBusy(true);
    setPdfError(null);
    setPdfNotice(null);
    const result = await window.api.invoicePdf.saveToDownloads({ invoiceId: posted.id });
    setPdfBusy(false);
    if (!result.ok) return setPdfError(result.error);

    const customer = customers.find((c) => c.id === posted.customerId);
    const phoneDigits = customer?.phone ? customer.phone.replace(/\D/g, '') : '';
    const text = encodeURIComponent(
      `Hi${customer ? ` ${customer.name}` : ''}, please find attached invoice ${posted.invoiceNumber}${posted.dueDate ? ` (due ${posted.dueDate})` : ''}.`,
    );
    window.open(phoneDigits ? `https://wa.me/${phoneDigits}?text=${text}` : `https://wa.me/?text=${text}`, '_blank');
    setPdfNotice(`PDF saved to ${result.data.filePath} — attach it in the WhatsApp chat that just opened.`);
  }

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <RecordNavigator
          ids={allInvoiceIds}
          currentId={id}
          label="invoice"
          disabled={busy}
          onGo={(next) => setView({ kind: 'invoiceEditor', id: next })}
        />
        <BackButton fallback={{ kind: 'invoices' }} fallbackLabel="Invoices" />
        {id !== 'new' && (
          <button
            type="button"
            onClick={() => setView({ kind: 'invoiceEditor', id: 'new' })}
            className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
          >
            New invoice
          </button>
        )}
        <button
          type="button"
          onClick={() => setView({ kind: 'sales', tab: 'invoices' })}
          aria-label="Close"
          title="Close (back to Invoices)"
          className="order-last ml-auto rounded-full px-2 text-xl leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          ×
        </button>
        {!posted && <ForeignCurrencySelector fx={fx} />}
        <div className="flex items-center gap-2">
          {posted && (
            <span className={`rounded px-2 py-0.5 text-xs ${posted.status === 'paid' ? 'bg-green-100 text-green-800 ring-1 ring-green-200' : 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'}`}>{posted.status}</span>
          )}
        </div>
      </div>

      {error && <ErrorNotice message={error} className="mb-2" />}

      {posted ? (
        <>
          <div className="grid grid-cols-3 gap-3 rounded border border-gray-200 bg-white p-3">
            <div className="text-sm">
              <span className="block text-gray-500">Invoice #</span>
              <span className="font-medium text-gray-800">{posted.invoiceNumber}</span>
            </div>
            <div className="text-sm">
              <span className="block text-gray-500">Customer</span>
              <span className="font-medium text-gray-800">{customerNameById.get(posted.customerId) ?? '—'}</span>
            </div>
            <div className="text-sm">
              <span className="block text-gray-500">Invoice Date</span>
              <span className="font-medium text-gray-800">{posted.invoiceDate}</span>
            </div>
            <div className="text-sm">
              <span className="block text-gray-500">Due Date</span>
              <span className="font-medium text-gray-800">{posted.dueDate}</span>
            </div>
            <div className="text-sm">
              <span className="block text-gray-500">Customer PO / Reference</span>
              <span className="font-medium text-gray-800">{posted.customerPoNumber || '—'}</span>
            </div>
            <div className="text-sm">
              <span className="block text-gray-500">Ship-to</span>
              <span className="whitespace-pre-line font-medium text-gray-800">{posted.shippingAddress || '—'}</span>
            </div>
            <div className="text-sm">
              <span className="block text-gray-500">Memo</span>
              <span className="font-medium text-gray-800">{posted.memo || '—'}</span>
            </div>
            <div className="text-sm">
              <span className="block text-gray-500">Journal Entry</span>
              <JournalEntryLink id={posted.invoiceJournalEntryId} label="Open invoice GL" />
              {posted.paymentJournalEntryId && <JournalEntryLink id={posted.paymentJournalEntryId} label="Open payment GL" className="ml-2" />}
            </div>
            {posted.foreignCurrency && (
              <div className="text-sm">
                <span className="block text-gray-500">Foreign Amount</span>
                <span className="font-medium text-gray-800">
                  {posted.foreignCurrency} ${((posted.foreignAmountCents ?? 0) / 100).toFixed(2)} @ {posted.exchangeRate}
                </span>
              </div>
            )}
          </div>

          <div className="mt-3">
            <PostedInvoiceLines lines={posted.lines} discountCents={posted.discountCents} revenueAccountNameById={revenueAccountNameById} productNameById={productNameById} />
          </div>

          {pdfError && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{pdfError}</div>}
          {pdfNotice && <div className="mt-3 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{pdfNotice}</div>}

          {payments.length > 0 && (
            <div className="mt-3 rounded border border-gray-200 bg-white p-3">
              <h3 className="mb-2 text-sm font-semibold text-gray-800">Payment History</h3>
              {payments.map((payment) => (
                <div key={payment.id} className="flex items-center gap-3 border-t border-gray-100 py-1.5 text-sm first:border-0">
                  <span className="text-gray-600">{payment.paymentDate}</span>
                  <Money cents={payment.amountCents} />
                  {payment.foreignAmountCents != null && payment.exchangeRate != null && (
                    <span className="text-xs text-gray-500">{posted?.foreignCurrency} {(payment.foreignAmountCents / 100).toFixed(2)} at {payment.exchangeRate}{payment.fxGainLossCents ? <span className={payment.fxGainLossCents > 0 ? ' text-emerald-700' : ' text-rose-700'}> · exchange {payment.fxGainLossCents > 0 ? 'gain' : 'loss'} ${(Math.abs(payment.fxGainLossCents) / 100).toFixed(2)}</span> : null}</span>
                  )}
                  <JournalEntryLink id={payment.journalEntryId} label="Open GL" />
                  <span className="ml-auto text-xs text-gray-400">{payment.depositId === null ? 'Not deposited' : 'Deposited'}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3"><AttachmentsPanel entityType="invoice" entityId={posted.id} /><div className="mt-2"><DocumentHistoryPanel entityType="invoice" entityId={posted.id} /></div></div>

          <div className="mt-3 flex gap-2">
            <ShareMenu
              busy={pdfBusy}
              actions={[
                { label: 'Email via Outlook', onClick: handleEmailViaOutlook },
                { label: 'Share via WhatsApp', onClick: handleShareWhatsApp },
                { label: 'Export as PDF…', onClick: handleDownloadPdf },
                { label: 'Save to Downloads', onClick: handleSaveToDownloads },
              ]}
            />
            {posted.paidCents > 0 && (
              <button type="button" disabled={busy} onClick={handleReverseLastPayment} className="rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                Reverse Last Payment
              </button>
            )}
            {posted.status === 'unpaid' && (
              <>
                <button type="button" onClick={() => setReceiving(true)} className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200">
                  Receive Payment
                </button>
                <button type="button" disabled={busy} onClick={handleCopyInvoice} className="ml-auto rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  Copy Invoice
                </button>
                <button type="button" disabled={busy} onClick={handleDelete} className="rounded-full bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50">
                  Delete Invoice
                </button>
              </>
            )}
            {posted.status !== 'unpaid' && (
              <button type="button" disabled={busy} onClick={handleCopyInvoice} className="ml-auto rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Copy Invoice
              </button>
            )}
          </div>

          <ReceivePaymentModal
            open={receiving}
            onClose={() => setReceiving(false)}
            onReceived={() => {
              window.api.invoices.get(posted.id).then((r) => r.ok && setPosted(r.data));
              window.api.invoices.payments(posted.id).then((r) => r.ok && setPayments(r.data));
            }}
            invoiceId={posted.id}
          />
        </>
      ) : (
        <>
          <div data-testid="invoice-details-grid" className="grid grid-cols-1 gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-3 xl:grid-cols-6">
            <label className="block text-sm">
              <span className="text-gray-600">Customer</span>
              <Combobox
                options={customers.map((c) => ({ value: String(c.id), label: c.name }))}
                value={customerId !== null ? String(customerId) : null}
                onChange={(v) => {
                  const nextId = v ? Number(v) : null;
                  setCustomerId(nextId);
                  // Only on a NEW invoice: changing the customer on one already saved must not
                  // silently move a due date that has already been sent out.
                  if (nextId === null || id !== 'new') return;
                  const selectedCustomer = customers.find((c) => c.id === nextId);
                  setShippingAddress(selectedCustomer?.shippingAddress?.trim() || selectedCustomer?.address?.trim() || '');
                  setShipToMode(selectedCustomer?.shippingAddress?.trim() ? 'shipping' : 'billing');
                  const preferred = selectedCustomer?.paymentTerms;
                  if (!preferred) return;
                  setPaymentTerms(preferred);
                  const due = dueDateFor(invoiceDate, preferred);
                  if (due) setDueDate(due);
                }}
                placeholder="Select a customer…"
                onAddNew={() => setShowAddCustomer(true)}
                addNewLabel="+ Add New Customer"
              />
              {creditAvailableCents > 0 && <span className="mt-1 block text-xs text-emerald-800">This customer has <Money cents={creditAvailableCents} /> of credit available from unapplied credit notes. Apply it to this invoice after saving, from Sales → Credit notes.</span>}
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Invoice #</span>
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={invoiceNumber}
                onChange={(e) => {
                  nextNumberRequestRef.current += 1;
                  setInvoiceNumber(e.target.value);
                  setInvoiceNumberManuallyEdited(true);
                }}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Customer PO / Reference</span>
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={customerPoNumber} onChange={(e) => setCustomerPoNumber(e.target.value)} placeholder="Optional" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Invoice Date</span>
              <input
                type="date" min={DATE_MIN} max={DATE_MAX}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={invoiceDate}
                onChange={(e) => {
                  setInvoiceDate(clampIsoDate(e.target.value));
                  if (!invoiceNumberManuallyEdited) void assignNextInvoiceNumber(clampIsoDate(e.target.value));
                  // Moving the invoice date has to move the due date with it, or the terms on the
                  // document stop describing its own dates.
                  const recomputed = dueDateFor(clampIsoDate(e.target.value), paymentTerms);
                  if (recomputed) setDueDate(recomputed);
                }}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Terms</span>
              <PaymentTermsSelect
                value={paymentTerms}
                documentDate={invoiceDate}
                onChange={(term, due) => {
                  setPaymentTerms(term);
                  if (due) setDueDate(due);
                }}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Due Date</span>
              <input
                type="date" min={DATE_MIN} max={DATE_MAX}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(clampIsoDate(e.target.value));
                  // Typing a date by hand means the terms no longer describe it, so say so rather
                  // than leaving a label that quietly disagrees with the date beside it.
                  setPaymentTerms(termFromDates(invoiceDate, clampIsoDate(e.target.value)));
                }}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Memo (optional)</span>
              <input
                name="invoice-memo"
                autoComplete="on"
                list={suggestionListId('transaction-memo')}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                onBlur={rememberOnBlur('transaction-memo')}
              />
              <SuggestionDatalist fieldKey="transaction-memo" />
            </label>
            <div className="block text-sm xl:col-span-2">
              <label className="block">
                <span className="text-gray-600">Ship to</span>
                <select
                  aria-label="Ship to"
                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5"
                  value={shipToMode}
                  onChange={(e) => {
                    const mode = e.target.value as typeof shipToMode;
                    const shipToCustomer = customers.find((c) => c.id === customerId);
                    setShipToMode(mode);
                    if (mode === 'billing') setShippingAddress(shipToCustomer?.address?.trim() ?? '');
                    if (mode === 'shipping') setShippingAddress(shipToCustomer?.shippingAddress?.trim() ?? '');
                  }}
                >
                  <option value="billing">Customer's billing address</option>
                  <option value="shipping">Customer's shipping address</option>
                  <option value="custom">Different address for this invoice…</option>
                </select>
              </label>
              {shipToMode === 'custom' ? (
                <textarea aria-label="Ship-to address" rows={2} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} placeholder="Street, city, province, postal code" />
              ) : (
                <p className="mt-1 whitespace-pre-line text-xs text-gray-500">{shippingAddress || 'No address on the customer record — add one to the customer, or choose a different address.'}</p>
              )}
            </div>
          </div>

          <div>
            <ForeignCurrencyDetails fx={fx} showAmountField={false} />
            {fx.isForeign && (
              <p className="mt-1 text-xs text-gray-400">Unit prices below are entered in {fx.currency} and converted to CAD at the rate above.</p>
            )}
          </div>

          <SuggestionDatalist fieldKey="line-item-description" />
          {isAccountingFirm(businessType) && <ServiceFeeRail onChoose={chooseServiceFee} services={products} />}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-sm text-gray-600">
            <label className="flex items-center gap-2">
              Amounts are
              <select aria-label="Amounts are" value={amountsMode} onChange={(e) => setAmountsMode(e.target.value as 'exclusive' | 'inclusive')} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm">
                <option value="exclusive">Exclusive of tax</option>
                <option value="inclusive">Inclusive of tax</option>
              </select>
            </label>
          </div>
          <div className="mt-2 overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Product</th>
                  <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Description</th>
                  <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Qty</th>
                  <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Unit Price {fx.isForeign && `(${fx.currency})`}</th>
                  <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">Amount {amountsMode === 'inclusive' ? '(incl. tax)' : fx.isForeign ? '(CAD)' : ''}</th>
                  <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Revenue Account</th>
                  <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Tax</th>
                  <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-600">HST</th>
                  {hasTagGroups && <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">Class / Location</th>}
                  <th className="border-b border-gray-200 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key} className="border-b border-gray-100 last:border-0">
                    <td className="w-52 px-3 py-1.5">
                      {/* Choosing a product fills in the description and price, and is what makes
                          posting this invoice take the stock and charge its cost. Left blank for a
                          service or a delivery charge, which move no stock. */}
                      <Combobox
                        options={productOptions}
                        value={line.productId !== null ? String(line.productId) : null}
                        onChange={(v) => {
                          const productId = v ? Number(v) : null;
                          const product = products.find((p) => p.id === productId);
                          if (product && productTypeOf(product) === 'bundle') return applyBundleToLine(line, product);
                          applyProductToLine(line, product ?? null);
                        }}
                        onAddNew={(query) => setNewProductForLine({ lineKey: line.key, initialName: query })}
                        addNewLabel={(query) => query ? `+ New Product “${query}”` : '+ New Product or Service'}
                        placeholder="Service — no stock"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        name="invoice-line-description"
                        autoComplete="on"
                        list={suggestionListId('line-item-description')}
                        className="w-full rounded border border-gray-300 px-2 py-1"
                        value={line.description}
                        onChange={(e) => updateLine(line.key, { description: e.target.value })}
                        onBlur={(e) => {
                          updateLine(line.key, { description: e.target.value });
                          recordSuggestion('line-item-description', e.target.value);
                        }}
                      />
                    </td>
                    <td className="w-20 px-3 py-1.5">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="w-full rounded border border-gray-300 px-2 py-1 text-right"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="w-32 px-3 py-1.5">
                      <CurrencyInput valueCents={line.unitPriceCents} onChange={(cents) => updateLine(line.key, { unitPriceCents: cents })} />
                    </td>
                    <td className="w-28 px-3 py-1.5 text-right">
                      <Money cents={cadLineAmountCents(line, fx.isForeign, fx.exchangeRate)} />
                    </td>
                    <td className="w-52 px-3 py-1.5">
                      <AccountCombobox
                        options={revenueAccountOptions}
                        value={line.revenueAccountId !== null ? String(line.revenueAccountId) : null}
                        onChange={(v) => updateLine(line.key, { revenueAccountId: v ? Number(v) : null })}
                        placeholder="Select account…"
                        accounts={accounts}
                        initialType="Revenue"
                        addNewLabel="+ New account"
                        onAccountCreated={(created) => {
                          setAccounts((prev) => [...prev, created]);
                          updateLine(line.key, { revenueAccountId: created.id });
                        }}
                      />
                    </td>
                    <td className="w-32 px-2 py-1.5">
                      <select
                        className="w-full rounded border border-gray-300 px-1.5 py-1 text-sm"
                        value={line.taxCode ?? ''}
                        onChange={(e) => {
                          const nextTaxCode = (e.target.value || null) as LineRow['taxCode'];
                          updateLine(line.key, { taxCode: nextTaxCode, manualHstCents: nextTaxCode === 'Manual' ? line.manualHstCents : 0 });
                        }}
                      >
                        {TAX_CODE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="w-56 px-2 py-1.5 text-right">
                      {line.taxCode && line.taxCode !== 'NonHST' && line.taxCode !== 'Manual' ? (
                        <span className="text-gray-600">
                          <Money cents={lineTaxCents(line)} />
                        </span>
                      ) : line.taxCode === 'Manual' ? (
                        <CustomTaxRateInput
                          baseCents={cadLineAmountCents(line, fx.isForeign, fx.exchangeRate)}
                          taxCents={line.manualHstCents}
                          onTaxCentsChange={(cents) => updateLine(line.key, { manualHstCents: cents })}
                        />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {hasTagGroups && <td className="w-36 px-2 py-1.5"><DocumentLineTagPicker tagIds={line.tagIds} onChange={(tagIds) => updateLine(line.key, { tagIds })} /></td>}
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
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="px-3 py-2" colSpan={4}>
                    <button type="button" onClick={() => setLines((prev) => [...prev, newRow(effectiveDefaultTaxCode)])} className="text-sm text-brand-600 hover:underline">
                      + Add line
                    </button>
                  </td>
                  <td className="px-3 py-1 text-right text-gray-500">
                    Subtotal <Money cents={subtotalCents} />
                  </td>
                  <td colSpan={4} />
                </tr>
                {taxCents > 0 && (
                  <tr>
                    <td colSpan={4} />
                    <td className="px-3 py-1 text-right text-gray-500">
                      GST/HST Payable <Money cents={taxCents} />
                    </td>
                    <td colSpan={4} />
                  </tr>
                )}
                <tr>
                  <td className="px-3 py-1 text-right text-gray-500" colSpan={4}>Customer discount</td>
                  <td className="px-3 py-1 text-right">
                    <div className="ml-auto w-32">
                      <CurrencyInput valueCents={discountCents} onChange={setDiscountCents} />
                    </div>
                  </td>
                  <td colSpan={4} />
                </tr>
                <tr className="bg-gray-50 font-medium">
                  <td colSpan={4} />
                  <td className="px-3 py-2 text-right">
                    Total <Money cents={totalCents} />
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            Customer HST posts to GST/HST Payable. A customer discount reduces Accounts Receivable and posts to Customer Discounts expense with this customer attached for customer-profitability reporting.
          </p>

          {saveProblem && <p className="mt-2 text-xs font-medium text-amber-700">To save: {saveProblem}</p>}

          <div className="mt-3 flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => handleSave('stay')}
              className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
            >
              Save Invoice
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleSave('new')}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Save &amp; Next
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleSave('copy')}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Save &amp; Copy Invoice
            </button>
            <button
              type="button"
              disabled={busy}
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
        onSaved={(newCustomer) => {
          setCustomers((prev) => [...prev, newCustomer]);
          setCustomerId(newCustomer.id);
        }}
      />
      {newProductForLine && newProductTargetLine && (
        <NewProductModal
          accounts={accounts}
          initialName={newProductForLine.initialName}
          initialIncomeAccountId={newProductTargetLine.revenueAccountId}
          onClose={() => setNewProductForLine(null)}
          onCreated={(product) => {
            setProducts((previous) => [...previous.filter((existing) => existing.id !== product.id), product]);
            applyProductToLine(newProductTargetLine, product);
            setNewProductForLine(null);
          }}
        />
      )}
    </div>
  );
}
