import { RecordNavigator } from '../../components/RecordNavigator';
import { BackButton } from '../../components/BackButton';
import { saleLineAccountPickerOptions } from '../../utils/accountLabel';
import { compareDocumentNumbers } from '@shared/domain/documents/documentNumbering';
import { useEffect, useMemo, useState } from 'react';
import type { Account, Contact, SalesReceipt, SalesReceiptLine, TaxCode } from '@shared/domain/types';
import { suggestTaxCents } from '@shared/domain/ledger/computeTaxSplit';
import { taxPortionOfInclusive } from '@shared/domain/ledger/taxCodes';
import { convertForeignAmountToCadCents } from '@shared/domain/currency/convertForeignAmount';
import { Combobox } from '../../components/Combobox';
import { AccountCombobox } from '../../components/AccountCombobox';
import { CurrencyInput } from '../../components/CurrencyInput';
import { ForeignCurrencyDetails, ForeignCurrencySelector } from '../../components/ForeignCurrencyFields';
import { Money } from '../../components/Money';
import { ShareMenu } from '../../components/ShareMenu';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { useForeignCurrencyAmount } from '../../hooks/useForeignCurrencyAmount';
import { useUiStore } from '../../app/store/uiStore';
import { rememberOnBlur } from '../../utils/textCase';
import { recordSuggestion, suggestionListId } from '../../utils/textSuggestions';
import { ContactFormModal } from '../contacts/ContactFormModal';
import { taxCodeOptions } from '@shared/domain/ledger/taxCodes';
import { useCompanyTaxDefault } from '../../hooks/useCompanyTaxDefault';
import { isAccountingFirm } from '@shared/domain/sales/firmServices';
import { JournalEntryLink } from '../../components/JournalEntryLink';
import { CustomTaxRateInput } from '../../components/CustomTaxRateInput';
import type { Product } from '../../../preload/index';
import { NewProductModal } from '../inventory/NewProductModal';
import { ServiceFeeRail } from '../../components/ServiceFeeRail';
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
  productId: number | null;
  taxCode: TaxCode | null;
  manualHstCents: number;
  /** Class / location tags chosen for this line. */
  tagIds: number[];
}

let rowKeyCounter = 0;
function newRow(defaultTaxCode: TaxCode | null = null): LineRow {
  rowKeyCounter += 1;
  return { key: `sr-row-${rowKeyCounter}`, description: '', quantity: 1, unitPriceCents: 0, revenueAccountId: null, productId: null, taxCode: defaultTaxCode, manualHstCents: 0, tagIds: [] };
}

function today(): string {
  return localIsoDate();
}

function lineAmountCents(row: Pick<LineRow, 'quantity' | 'unitPriceCents'>): number {
  return Math.round(row.quantity * row.unitPriceCents);
}

function cadLineAmountCents(row: Pick<LineRow, 'quantity' | 'unitPriceCents'>, isForeign: boolean, exchangeRate: number | null): number {
  const raw = lineAmountCents(row);
  return isForeign && exchangeRate !== null ? convertForeignAmountToCadCents(raw, exchangeRate) : raw;
}

function receiptLineTaxCents(line: Pick<SalesReceiptLine, 'taxCode' | 'manualHstCents' | 'amountCents'>): number {
  if (line.taxCode === 'Manual') return line.manualHstCents ?? 0;
  return suggestTaxCents(line.taxCode, line.amountCents);
}

/** Read-only view of a posted receipt's line items — creation is the only supported write path,
 * same rule as Invoices and Bills: no edit after posting. */
function PostedReceiptLines({ lines, revenueAccountNameById }: { lines: SalesReceiptLine[]; revenueAccountNameById: Map<number, string> }) {
  const subtotalCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
  const taxCents = lines.reduce((sum, l) => sum + receiptLineTaxCents(l), 0);
  const totalCents = subtotalCents + taxCents;
  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-gray-50">
          <tr>
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
              <td className="px-3 py-1.5">{l.description}</td>
              <td className="px-3 py-1.5 text-right">{l.quantity}</td>
              <td className="px-3 py-1.5 text-right">
                <Money cents={l.unitPriceCents} />
              </td>
              <td className="px-3 py-1.5 text-right">
                <Money cents={l.amountCents} />
              </td>
              <td className="px-3 py-1.5">{revenueAccountNameById.get(l.revenueAccountId) ?? '—'}</td>
              <td className="px-3 py-1.5 text-right">{receiptLineTaxCents(l) > 0 ? <Money cents={receiptLineTaxCents(l)} /> : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-gray-500">
            <td className="px-3 py-1" colSpan={3}>
              Subtotal
            </td>
            <td className="px-3 py-1 text-right">
              <Money cents={subtotalCents} />
            </td>
            <td colSpan={2} />
          </tr>
          {taxCents > 0 && (
            <tr className="text-gray-500">
              <td className="px-3 py-1" colSpan={3}>
                GST/HST
              </td>
              <td className="px-3 py-1 text-right">
                <Money cents={taxCents} />
              </td>
              <td colSpan={2} />
            </tr>
          )}
          <tr className="bg-gray-50 font-medium">
            <td className="px-3 py-2" colSpan={3}>
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

export function SalesReceiptEditorPage({ id, customerId: presetCustomerId }: { id: number | 'new'; customerId?: number }) {
  // Tax codes ordered with the company's own province first — see useCompanyTaxDefault.
  const { province: taxProvince, businessType, defaultTaxCode, loaded: taxDefaultLoaded } = useCompanyTaxDefault();
  const TAX_CODE_OPTIONS = taxCodeOptions('income', taxProvince);
  const effectiveDefaultTaxCode = defaultTaxCode ?? 'HST';
  const setView = useUiStore((s) => s.setView);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newProductLineKey, setNewProductLineKey] = useState<string | null>(null);
  const [undepositedFundsId, setUndepositedFundsId] = useState<number | null>(null);
  const [posted, setPosted] = useState<SalesReceipt | null>(null);
  const hasTagGroups = useHasTagGroups();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptDate, setReceiptDate] = useState(today());
  const [allReceiptIds, setAllReceiptIds] = useState<number[]>([]);
  const [memo, setMemo] = useState('');
  const [depositToAccountId, setDepositToAccountId] = useState<number | null>(null);
  const [lines, setLines] = useState<LineRow[]>([newRow()]);
  const fx = useForeignCurrencyAmount();

  useEffect(() => {
    window.api.accounts.list({ activeOnly: true }).then((r) => r.ok && setAccounts(r.data));
    window.api.customers.list().then((r) => r.ok && setCustomers(r.data.filter((c) => c.isActive)));
    window.api.products.list({ activeOnly: true }).then((r) => r.ok && setProducts(r.data));
    window.api.salesReceipts.undepositedFundsAccountId().then((r) => r.ok && setUndepositedFundsId(r.data));
    // Ordered by number, so the arrows follow the order a person reads them in.
    window.api.salesReceipts.list({}).then((r) => {
      if (!r.ok) return;
      const ordered = [...r.data].sort((a, b) => compareDocumentNumbers('SR', a.receiptNumber, b.receiptNumber));
      setAllReceiptIds(ordered.map((x) => x.id));
    });
  }, []);

  useEffect(() => {
    if (typeof id === 'number') {
      window.api.salesReceipts.get(id).then((r) => {
        if (!r.ok) return setError(r.error);
        setPosted(r.data);
      });
      return;
    }
    setPosted(null);
    setCustomerId(presetCustomerId ?? null);
    setReceiptDate(today());
    setMemo('');
    setDepositToAccountId(null);
    setLines([newRow(taxDefaultLoaded ? effectiveDefaultTaxCode : null)]);
    fx.reset();
    window.api.salesReceipts.nextNumber({ receiptDate: today() }).then((r) => r.ok && setReceiptNumber(r.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // The browser visually displays the first tax option when a select's value is blank. Previously
  // that made a new line look like HST 13% while its real state was null, so HST stayed at zero and
  // the saved receipt contained no tax. Apply the company tax default to the actual line state as
  // soon as the company profile is available; preserve any choice the user already made.
  useEffect(() => {
    if (id !== 'new' || !taxDefaultLoaded) return;
    setLines((previous) =>
      previous.map((line) => (line.taxCode === null ? { ...line, taxCode: effectiveDefaultTaxCode } : line)),
    );
  }, [id, taxDefaultLoaded, effectiveDefaultTaxCode]);

  const bankAccounts = useMemo(() => accounts.filter((a) => a.accountSubtype === 'Cash and Bank'), [accounts]);
  const depositToOptions = useMemo(() => {
    const opts = bankAccounts.map((a) => ({ value: String(a.id), label: a.name }));
    if (undepositedFundsId !== null) opts.push({ value: String(undepositedFundsId), label: 'Undeposited Funds' });
    return opts;
  }, [bankAccounts, undepositedFundsId]);

  useEffect(() => {
    if (depositToAccountId !== null || posted !== null) return;
    if (bankAccounts.length > 0) setDepositToAccountId(bankAccounts[0].id);
    else if (undepositedFundsId !== null) setDepositToAccountId(undepositedFundsId);
  }, [bankAccounts, undepositedFundsId, depositToAccountId, posted]);

  const revenueAccountOptions = useMemo(
    () => saleLineAccountPickerOptions(accounts),
    [accounts],
  );
  const revenueAccountNameById = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const accountNameById = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const customerNameById = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  function updateLine(key: string, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const [onHand, setOnHand] = useState<Map<number, number>>(new Map());
  useEffect(() => {
    window.api.inventory.status({}).then((r) => {
      if (r.ok) setOnHand(new Map(r.data.rows.map((row) => [row.productId, row.quantityOnHand])));
    });
  }, [products]);
  const productOptions = useMemo(() => productPickerOptions(products, 'sale', onHand), [products, onHand]);

  function applyBundleToLine(line: LineRow, bundle: Product) {
    const { lines: parts } = expandBundle(bundle, products, line.quantity || 1);
    if (parts.length === 0) return updateLine(line.key, { productId: bundle.id, description: bundle.description || bundle.name, unitPriceCents: bundle.salePriceCents, revenueAccountId: bundle.incomeAccountId });
    const rows = parts.map((part, index) => ({
      ...(index === 0 ? line : newRow(effectiveDefaultTaxCode)),
      productId: part.product.id,
      description: part.product.description?.trim() || part.product.name,
      quantity: part.quantity,
      unitPriceCents: part.product.salePriceCents,
      revenueAccountId: part.product.incomeAccountId ?? line.revenueAccountId,
    }));
    setLines((prev) => prev.flatMap((l) => (l.key === line.key ? rows : [l])));
  }

  function chooseServiceFee(name: string) {
    const product = products.find((row) => row.isActive && row.name.trim().toLowerCase() === name.toLowerCase());
    const blank = lines.find((line) => !line.description.trim() && line.unitPriceCents === 0);
    const target = blank ?? newRow(effectiveDefaultTaxCode);
    if (!blank) setLines((current) => [...current, target]);
    if (product) {
      setLines((current) => current.map((line) => line.key === target.key ? {
        ...line,
        productId: product.id,
        description: product.description?.trim() || product.name,
        unitPriceCents: product.salePriceCents,
        revenueAccountId: product.incomeAccountId,
      } : line));
    } else {
      setLines((current) => current.map((line) => line.key === target.key ? { ...line, description: name } : line));
      setNewProductLineKey(target.key);
    }
  }

  // Whether the typed prices already include tax (a till receipt) or not — same switch as the invoice.
  const [amountsMode, setAmountsMode] = useState<'exclusive' | 'inclusive'>('exclusive');
  function lineTaxCents(line: LineRow): number {
    const typed = cadLineAmountCents(line, fx.isForeign, fx.exchangeRate);
    if (line.taxCode === 'Manual') return Math.min(typed, line.manualHstCents);
    return amountsMode === 'inclusive' ? taxPortionOfInclusive(line.taxCode, typed) : suggestTaxCents(line.taxCode, typed);
  }
  function lineBaseCents(line: LineRow): number {
    const typed = cadLineAmountCents(line, fx.isForeign, fx.exchangeRate);
    return amountsMode === 'inclusive' ? typed - lineTaxCents(line) : typed;
  }

  const subtotalCents = lines.reduce((sum, l) => sum + lineBaseCents(l), 0);
  const taxCents = lines.reduce((sum, l) => sum + lineTaxCents(l), 0);
  const totalCents = subtotalCents + taxCents;
  const canSave =
    customerId !== null &&
    receiptNumber.trim().length > 0 &&
    depositToAccountId !== null &&
    lines.length > 0 &&
    lines.every((l) => l.description.trim() && l.revenueAccountId !== null && lineAmountCents(l) > 0) &&
    !(fx.isForeign && fx.exchangeRate === null);

  type AfterSave = 'stay' | 'new' | 'close';

  async function handleSave(after: AfterSave = 'stay') {
    if (customerId === null || depositToAccountId === null) return;
    setBusy(true);
    setError(null);
    const foreignTotalCents = fx.isForeign ? lines.reduce((sum, l) => sum + lineAmountCents(l), 0) : null;
    const result = await window.api.salesReceipts.create({
      customerId,
      receiptNumber: receiptNumber.trim(),
      receiptDate,
      memo: memo.trim() ? memo.trim() : null,
      depositToAccountId,
      foreignCurrency: fx.isForeign ? fx.currency : null,
      foreignAmountCents: foreignTotalCents,
      exchangeRate: fx.isForeign ? fx.exchangeRate : null,
      lines: lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
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
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (after === 'close') return setView({ kind: 'sales', tab: 'receipts' });
    if (after === 'new') return setView({ kind: 'salesReceiptEditor', id: 'new' });
    setView({ kind: 'salesReceiptEditor', id: result.data.id });
  }

  async function handleDelete() {
    if (posted === null) return;
    if (!window.confirm(`Delete sales receipt ${posted.receiptNumber}? Its linked accounting entry will be voided. This cannot be undone.`)) return;
    setBusy(true);
    const result = await window.api.salesReceipts.delete(posted.id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setView({ kind: 'salesReceipts' });
  }

  async function handleDownloadPdf() {
    if (posted === null) return;
    setPdfBusy(true);
    setPdfError(null);
    setPdfNotice(null);
    const result = await window.api.salesReceiptPdf.generate({ salesReceiptId: posted.id });
    setPdfBusy(false);
    if (!result.ok) return setPdfError(result.error);
    if (result.data.saved) setPdfNotice(`Saved to ${result.data.filePath}`);
  }

  async function handleEmailViaOutlook() {
    if (posted === null) return;
    setPdfBusy(true);
    setPdfError(null);
    setPdfNotice(null);
    const result = await window.api.salesReceiptPdf.emailViaOutlook({ salesReceiptId: posted.id });
    setPdfBusy(false);
    if (!result.ok) return setPdfError(result.error);
    setPdfNotice('Outlook draft opened with the sales receipt attached.');
  }

  async function handleSaveToDownloads() {
    if (posted === null) return;
    setPdfBusy(true);
    setPdfError(null);
    setPdfNotice(null);
    const result = await window.api.salesReceiptPdf.saveToDownloads({ salesReceiptId: posted.id });
    setPdfBusy(false);
    if (!result.ok) return setPdfError(result.error);
    setPdfNotice(`Saved to ${result.data.filePath}`);
  }

  /** WhatsApp has no public way for a desktop app to attach a local file to a chat directly — see
   * InvoiceEditorPage's identical handler for the full rationale. Saves to Downloads, then opens a
   * pre-filled WhatsApp chat, leaving the one manual attach-file click WhatsApp itself requires. */
  async function handleShareWhatsApp() {
    if (posted === null) return;
    setPdfBusy(true);
    setPdfError(null);
    setPdfNotice(null);
    const result = await window.api.salesReceiptPdf.saveToDownloads({ salesReceiptId: posted.id });
    setPdfBusy(false);
    if (!result.ok) return setPdfError(result.error);

    const customer = customers.find((c) => c.id === posted.customerId);
    const phoneDigits = customer?.phone ? customer.phone.replace(/\D/g, '') : '';
    const text = encodeURIComponent(`Hi${customer ? ` ${customer.name}` : ''}, please find attached sales receipt ${posted.receiptNumber}.`);
    window.open(phoneDigits ? `https://wa.me/${phoneDigits}?text=${text}` : `https://wa.me/?text=${text}`, '_blank');
    setPdfNotice(`PDF saved to ${result.data.filePath} — attach it in the WhatsApp chat that just opened.`);
  }

  return (
    <div className="w-full">
      {error && <ErrorNotice message={error} className="mb-3" />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <RecordNavigator
          ids={allReceiptIds}
          currentId={id}
          label="sales receipt"
          disabled={busy}
          onGo={(next) => setView({ kind: 'salesReceiptEditor', id: next })}
        />
        <button
          type="button"
          onClick={() => setView({ kind: 'salesReceipts' })}
          aria-label="Close"
          title="Close (back to Sales Receipts)"
          className="order-last ml-auto rounded-full px-2 text-xl leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          ×
        </button>
        <BackButton fallback={{ kind: 'salesReceipts' }} fallbackLabel="Sales Receipts" />
        {!posted && <ForeignCurrencySelector fx={fx} />}
        {posted && (
          <span className="ml-auto rounded bg-green-300 px-2 py-0.5 text-xs text-green-900">
            {posted.depositId !== null ? 'deposited' : posted.depositToAccountId === undepositedFundsId ? 'undeposited' : 'paid'}
          </span>
        )}
      </div>

      {posted ? (
        <>
          <div className="mb-3"><AttachmentsPanel entityType="salesReceipt" entityId={posted.id} /><div className="mt-2"><DocumentHistoryPanel entityType="salesReceipt" entityId={posted.id} /></div></div>
          <div className="grid grid-cols-3 gap-3 rounded border border-gray-200 bg-white p-3">
            <div className="text-sm">
              <span className="block text-gray-500">Receipt #</span>
              <span className="font-medium text-gray-800">{posted.receiptNumber}</span>
            </div>
            <div className="text-sm">
              <span className="block text-gray-500">Customer</span>
              <span className="font-medium text-gray-800">{customerNameById.get(posted.customerId) ?? '—'}</span>
            </div>
            <div className="text-sm">
              <span className="block text-gray-500">Receipt Date</span>
              <span className="font-medium text-gray-800">{posted.receiptDate}</span>
            </div>
            <div className="text-sm">
              <span className="block text-gray-500">Deposit To</span>
              <span className="font-medium text-gray-800">{accountNameById.get(posted.depositToAccountId) ?? '—'}</span>
            </div>
            <div className="text-sm">
              <span className="block text-gray-500">Memo</span>
              <span className="font-medium text-gray-800">{posted.memo || '—'}</span>
            </div>
            <div className="text-sm">
              <span className="block text-gray-500">Journal Entry</span>
              <JournalEntryLink id={posted.journalEntryId} label="Open sales receipt GL" />
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
            <PostedReceiptLines lines={posted.lines} revenueAccountNameById={revenueAccountNameById} />
          </div>

          {pdfError && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{pdfError}</div>}
          {pdfNotice && <div className="mt-3 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{pdfNotice}</div>}

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
            <button
              type="button"
              disabled={busy || posted.depositId !== null}
              onClick={handleDelete}
              className="ml-auto rounded-full bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              Delete Sales Receipt
            </button>
          </div>
          {posted.depositId !== null && <p className="mt-2 text-xs text-gray-400">Already deposited — void the deposit first to delete.</p>}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 rounded border border-gray-200 bg-white p-3">
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
              <span className="text-gray-600">Sales Receipt #</span>
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Receipt Date</span>
              <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={receiptDate} onChange={(e) => setReceiptDate(clampIsoDate(e.target.value))} />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Deposit To</span>
              <Combobox
                options={depositToOptions}
                value={depositToAccountId !== null ? String(depositToAccountId) : null}
                onChange={(v) => setDepositToAccountId(v ? Number(v) : null)}
                placeholder="Select an account…"
              />
            </label>
            <label className="col-span-2 block text-sm">
              <span className="text-gray-600">Memo (optional)</span>
              <input
                name="sales-receipt-memo"
                autoComplete="on"
                list={suggestionListId('transaction-memo')}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                onBlur={rememberOnBlur('transaction-memo')}
              />
              <SuggestionDatalist fieldKey="transaction-memo" />
            </label>
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
          <div className="mt-3 overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-600">Product / Service</th>
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
                    <td className="w-56 px-2 py-1.5">
                      <Combobox
                        options={productOptions}
                        value={line.productId === null ? null : String(line.productId)}
                        onChange={(value) => {
                          const product = products.find((row) => row.id === Number(value));
                          if (product && productTypeOf(product) === 'bundle') return applyBundleToLine(line, product);
                          updateLine(line.key, product ? { productId: product.id, description: product.description || product.name, unitPriceCents: product.salePriceCents, revenueAccountId: product.incomeAccountId } : { productId: null });
                        }}
                        placeholder="Select item…"
                        onAddNew={() => setNewProductLineKey(line.key)}
                        addNewLabel="+ New product / service"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        name="sales-receipt-line-description"
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
                        placeholder="Select revenue account…"
                        accounts={accounts}
                        initialType="Revenue"
                        addNewLabel="+ New revenue account"
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
                      {line.taxCode === 'HST' || line.taxCode === 'USTax' ? (
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
                      GST/HST <Money cents={taxCents} />
                    </td>
                    <td colSpan={4} />
                  </tr>
                )}
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
          {newProductLineKey && (
            <NewProductModal
              accounts={accounts}
              initialName={lines.find((line) => line.key === newProductLineKey)?.description ?? ''}
              initialIncomeAccountId={lines.find((line) => line.key === newProductLineKey)?.revenueAccountId ?? null}
              onClose={() => setNewProductLineKey(null)}
              onCreated={(product) => {
                setProducts((current) => [...current, product]);
                updateLine(newProductLineKey, { productId: product.id, description: product.description || product.name, unitPriceCents: product.salePriceCents, revenueAccountId: product.incomeAccountId });
                setNewProductLineKey(null);
              }}
            />
          )}

          <p className="mt-2 text-xs text-gray-400">
            Saving posts the sales receipt immediately — Debit {depositToAccountId !== null ? accountNameById.get(depositToAccountId) ?? 'the deposit account' : 'the deposit account'}, Credit each line's revenue account.
          </p>

          <div className="mt-3 flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              disabled={busy || !canSave}
              onClick={() => handleSave('stay')}
              className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
            >
              Save Sales Receipt
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
        onSaved={(newCustomer) => {
          setCustomers((prev) => [...prev, newCustomer]);
          setCustomerId(newCustomer.id);
        }}
      />
    </div>
  );
}
