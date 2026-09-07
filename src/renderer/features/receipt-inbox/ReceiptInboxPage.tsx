import { useEffect, useMemo, useRef, useState } from 'react';
import { receiptEntryLabel } from '@shared/domain/receipts/scanFileNames';
import type { Account, Contact, TaxCode } from '@shared/domain/types';
import { CurrencyInput } from '../../components/CurrencyInput';
import { Combobox } from '../../components/Combobox';
import { ForeignCurrencyDetails, ForeignCurrencySelector } from '../../components/ForeignCurrencyFields';
import { useForeignCurrencyAmount } from '../../hooks/useForeignCurrencyAmount';
import { useUiStore } from '../../app/store/uiStore';
import { accountPickerOptions } from '../../utils/accountLabel';
import { capitalizeWords, suggestOnBlur } from '../../utils/textCase';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { suggestionListId } from '../../utils/textSuggestions';
import { isNoTaxCode, taxCodeOptions, taxPortionOfInclusive } from '@shared/domain/ledger/taxCodes';
import { useCompanyTaxDefault } from '../../hooks/useCompanyTaxDefault';
import { confirmDialog } from '../../app/store/confirmStore';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

type ReceiptInboxEntry = Extract<Awaited<ReturnType<typeof window.api.receiptInbox.list>>, { ok: true }>['data'][number];
type ProcessedReceiptEntry = Extract<Awaited<ReturnType<typeof window.api.receiptInbox.history>>, { ok: true }>['data'][number];
type EntryType = 'bill' | 'expense' | 'income';


const TYPE_TABS: { value: EntryType; label: string }[] = [
  { value: 'bill', label: 'Vendor Bill' },
  { value: 'expense', label: 'Quick Expense' },
  { value: 'income', label: 'Quick Sale' },
];

function today(): string {
  return localIsoDate();
}

function ReceiptPreview({ dataUrl }: { dataUrl: string | null }) {
  if (!dataUrl) return <div className="flex h-full items-center justify-center text-sm text-gray-400">Loading…</div>;
  if (dataUrl.startsWith('data:application/pdf')) {
    return <embed src={dataUrl} type="application/pdf" className="h-full w-full rounded border border-gray-200" />;
  }
  return <img src={dataUrl} alt="Receipt" className="mx-auto max-h-full max-w-full rounded border border-gray-200 object-contain" />;
}

function SetupInstructions() {
  const [inboxPath, setInboxPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleShowFolder() {
    setBusy(true);
    const result = await window.api.receiptInbox.showFolder();
    setBusy(false);
    if (result.ok) setInboxPath(result.data.inboxPath);
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-3 text-sm text-gray-600">
      <h2 className="font-semibold text-gray-800">No receipts waiting</h2>
      <p className="mt-1">
        Already have a receipt file on this PC — a downloaded invoice, a photo, a screenshot? Use "Import File…" above to bring it in directly. Or scan
        one on your iPhone with the OneDrive app and it'll show up here automatically:
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5">
        <li>Open the OneDrive app on your iPhone (install it from the App Store if you haven't).</li>
        <li>
          Browse to the <span className="font-semibold">Apex Ledger Receipt Inbox</span> in your Documents folder.
        </li>
        <li>Tap the + button and choose "Scan" to photograph a receipt — it'll upload automatically.</li>
        <li>Come back to this page on your PC after it syncs (usually within a minute or two).</li>
      </ol>
      <button
        type="button"
        disabled={busy}
        onClick={handleShowFolder}
        className="mt-3 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
      >
        Show Inbox Folder on This PC
      </button>
      {inboxPath && <p className="mt-2 font-mono text-xs text-gray-400">{inboxPath}</p>}
    </div>
  );
}

/** Reserves a truthful scanner workflow now without claiming hardware integration before it has
 * been configured and tested. The working fallback is the same watched inbox/manual import used
 * by every other scan, so files can already flow through OCR and review without a second page. */
function ScannerConnectionPanel({ onScanned }: { onScanned: (fileName: string) => void }) {
  const [inboxPath, setInboxPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<string[] | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);

  useEffect(() => {
    window.api.receiptInbox.scannerStatus().then((result) => {
      if (result.ok) setDevices(result.data.devices);
      else setScannerError(result.error);
    });
  }, []);

  async function scanReceipt() {
    setBusy(true);
    setScannerError(null);
    const result = await window.api.receiptInbox.scan();
    setBusy(false);
    if (!result.ok) return setScannerError(result.error);
    if (result.data.scanned && result.data.fileName) onScanned(result.data.fileName);
  }

  async function showInboxFolder() {
    setBusy(true);
    const result = await window.api.receiptInbox.showFolder();
    setBusy(false);
    if (result.ok) setInboxPath(result.data.inboxPath);
  }

  return (
    <details className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span>
          <span className="block font-semibold text-indigo-900">Epson / Windows Document Scanner</span>
          <span className="mt-0.5 block text-xs text-indigo-700">
            {devices === null ? 'Checking connected scanners…' : devices.length > 0 ? devices.join(' · ') : 'No WIA scanner detected'}
          </span>
        </span>
        <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${devices && devices.length > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          {devices && devices.length > 0 ? 'CONNECTED' : 'SETUP'}
        </span>
      </summary>
      <div className="mt-3 border-t border-indigo-200 pt-3 text-sm text-indigo-900">
        <p>
          Click Scan Receipt to open the Epson/Windows acquisition window. Select the feeder or flatbed, colour and resolution there. The captured image enters this Inbox, OCR suggests the fields, and nothing posts until you review and save it.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={scanReceipt} className="rounded-full bg-indigo-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">
            {busy ? 'Waiting for scanner…' : 'Scan Receipt'}
          </button>
          <button type="button" disabled={busy} onClick={showInboxFolder} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-indigo-800 ring-1 ring-indigo-300 hover:bg-indigo-100 disabled:opacity-50">Show scanner inbox folder</button>
          <span className="text-xs text-indigo-700">Requires the Epson Scan 2/WIA driver supplied for the scanner model.</span>
        </div>
        {scannerError && <p role="alert" className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{scannerError}</p>}
        {inboxPath && <p className="mt-2 break-all font-mono text-xs text-indigo-600">{inboxPath}</p>}
      </div>
    </details>
  );
}

export function ReceiptInboxPage() {
  // Tax codes ordered with the company's own province first — see useCompanyTaxDefault.
  const { province: taxProvince } = useCompanyTaxDefault();
  const TAX_CODE_OPTIONS = taxCodeOptions('expense', taxProvince, { includeBlank: true });
  const setView = useUiStore((s) => s.setView);
  const [entries, setEntries] = useState<ReceiptInboxEntry[]>([]);
  const [history, setHistory] = useState<ProcessedReceiptEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Defaults to Quick Expense rather than Vendor Bill — most scans are small receipts (meals,
  // parking, supplies) that don't need a vendor tracked. Vendor Bill stays one click away for a
  // genuine invoice from a vendor worth tracking (a real purchase, a recurring bill).
  const [entryType, setEntryType] = useState<EntryType>('expense');
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [entryDate, setEntryDate] = useState(today());
  const [dueDate, setDueDate] = useState(today());
  const [moneyAccountId, setMoneyAccountId] = useState<number | null>(null);
  const [categoryAccountId, setCategoryAccountId] = useState<number | null>(null);
  const [amountCents, setAmountCents] = useState(0);
  const [taxCode, setTaxCode] = useState<TaxCode | null>(null);
  const [manualHstCents, setManualHstCents] = useState(0);
  const [memo, setMemo] = useState('');
  const fx = useForeignCurrencyAmount();

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrApplied, setOcrApplied] = useState(false);
  const [vendorNameGuess, setVendorNameGuess] = useState<string | null>(null);
  const [vendorMatched, setVendorMatched] = useState(false);
  const selectedRef = useRef<string | null>(null);

  const [importBusy, setImportBusy] = useState(false);
  const setReceiptInboxPendingCount = useUiStore((s) => s.setReceiptInboxPendingCount);

  async function refreshEntries() {
    const result = await window.api.receiptInbox.list();
    if (result.ok) {
      setEntries(result.data);
      setReceiptInboxPendingCount(result.data.length);
    }
  }

  async function refreshHistory() {
    const result = await window.api.receiptInbox.history();
    if (result.ok) setHistory(result.data);
  }

  async function reprocess(item: ProcessedReceiptEntry) {
    const kind = item.billId ? 'vendor bill' : item.journalEntryId ? 'quick entry' : 'skipped receipt';
    if (!(await confirmDialog(`Return “${item.sourceFileName}” to the Inbox? Its ${kind} will be reversed first when applicable.`))) return;
    setBusy(true);
    setError(null);
    const result = await window.api.receiptInbox.reprocess(item.id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSelected(null);
    await Promise.all([refreshEntries(), refreshHistory()]);
  }

  /** Not every receipt comes from the OneDrive phone-scan folder — a downloaded invoice PDF, a
   * photo taken with a regular camera, or a screenshot can be picked from anywhere on the PC and
   * reviewed exactly the same way. */
  async function handleImportFiles() {
    setImportBusy(true);
    setError(null);
    const result = await window.api.receiptInbox.importFiles();
    setImportBusy(false);
    if (!result.ok) return setError(result.error);
    if (result.data.importedCount > 0) refreshEntries();
  }

  async function handleScanned(fileName: string) {
    await refreshEntries();
    setSelected(fileName);
  }

  useEffect(() => {
    refreshEntries();
    refreshHistory();
    window.api.vendors.list().then((r) => r.ok && setVendors(r.data.filter((v) => v.isActive)));
    window.api.accounts.list({ activeOnly: true }).then((r) => r.ok && setAccounts(r.data));
  }, []);

  function resetForm() {
    setEntryType('expense');
    setError(null);
    setVendorId(vendors[0]?.id ?? null);
    setEntryDate(today());
    setDueDate(today());
    setMoneyAccountId(null);
    setCategoryAccountId(null);
    setAmountCents(0);
    setTaxCode(null);
    setManualHstCents(0);
    setMemo('');
    fx.reset();
    setOcrLoading(false);
    setOcrApplied(false);
    setVendorNameGuess(null);
    setVendorMatched(false);
  }

  useEffect(() => {
    if (selected === null) {
      setPreviewDataUrl(null);
      return;
    }
    const fileName = selected;
    selectedRef.current = fileName;
    setPreviewDataUrl(null);
    resetForm();
    window.api.receiptInbox.getPreview(fileName).then((r) => {
      if (r.ok && selectedRef.current === fileName) setPreviewDataUrl(r.data.dataUrl);
    });

    setOcrLoading(true);
    window.api.receiptInbox.extractFields(fileName).then((r) => {
      if (selectedRef.current !== fileName) return;
      setOcrLoading(false);
      if (!r.ok) return;
      const { vendorNameGuess: vendorGuess, dateGuess, amountCentsGuess, taxAmountCentsGuess, currencyGuess } = r.data;
      if (!vendorGuess && !dateGuess && !amountCentsGuess && !taxAmountCentsGuess) return;

      setOcrApplied(true);
      if (dateGuess) {
        setEntryDate(dateGuess);
        setDueDate(dateGuess);
      }
      if (amountCentsGuess && currencyGuess === 'USD') {
        // Receipt total is in USD, not CAD — hand it to the existing FX flow so it fetches the
        // live Bank of Canada rate and computes the CAD equivalent, instead of treating the raw
        // USD number as if it were already CAD.
        fx.setCurrency('USD');
        fx.setForeignAmountCents(amountCentsGuess);
        fx.fetchRate();
      } else if (amountCentsGuess) {
        setAmountCents(amountCentsGuess);
      }
      if (taxAmountCentsGuess) {
        setTaxCode('Manual');
        setManualHstCents(taxAmountCentsGuess);
      }
      if (vendorGuess) {
        setVendorNameGuess(vendorGuess);
        const needle = vendorGuess.toLowerCase();
        const match = vendors.find((v) => needle.includes(v.name.toLowerCase()) || v.name.toLowerCase().includes(needle));
        if (match) {
          setVendorId(match.id);
          setVendorMatched(true);
        } else {
          setMemo((prev) => prev || vendorGuess);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Switching tabs keeps the amount/tax/memo (usually still correct) but clears the
  // type-specific pickers, since a vendor doesn't carry over to a money-account field and vice versa.
  useEffect(() => {
    setVendorId(vendors[0]?.id ?? null);
    setMoneyAccountId(null);
    setCategoryAccountId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryType]);

  useEffect(() => {
    if (fx.isForeign && fx.cadAmountCents !== null) setAmountCents(fx.cadAmountCents);
  }, [fx.isForeign, fx.cadAmountCents]);

  const moneyAccountOptions = useMemo(
    () => accountPickerOptions(accounts.filter((a) => a.accountType === 'Asset' || a.accountType === 'Liability')),
    [accounts],
  );
  const categoryOptions = useMemo(() => {
    const eligibleTypes = entryType === 'bill' ? ['Expense', 'Asset'] : entryType === 'expense' ? ['Expense'] : ['Revenue'];
    return accountPickerOptions(accounts.filter((a) => eligibleTypes.includes(a.accountType)));
  }, [accounts, entryType]);

  const canSave =
    selected !== null &&
    categoryAccountId !== null &&
    amountCents > 0 &&
    !(fx.isForeign && fx.cadAmountCents === null) &&
    (entryType === 'bill' ? vendorId !== null : moneyAccountId !== null);

  async function handleSave() {
    if (!canSave || selected === null || categoryAccountId === null) return;
    setBusy(true);
    setError(null);

    const foreignFields = {
      foreignCurrency: fx.isForeign ? fx.currency : null,
      foreignAmountCents: fx.isForeign ? fx.foreignAmountCents : null,
      exchangeRate: fx.isForeign ? fx.exchangeRate : null,
    };

    const result =
      entryType === 'bill'
        ? vendorId === null
          ? null
          : await window.api.receiptInbox.importAsBill({
              fileName: selected,
              bill: {
                vendorId,
                billDate: entryDate,
                dueDate,
                categoryAccountId,
                amountCents,
                taxCode,
                manualHstCents: taxCode === 'Manual' ? manualHstCents : null,
                memo: memo ? capitalizeWords(memo) : null,
                ...foreignFields,
              },
            })
        : moneyAccountId === null
        ? null
        : await window.api.receiptInbox.importAsQuickEntry({
            fileName: selected,
            type: entryType,
            entryDate,
            moneyAccountId,
            categoryAccountId,
            amountCents,
            taxCode,
            manualHstCents: taxCode === 'Manual' ? manualHstCents : null,
            memo: memo ? capitalizeWords(memo) : null,
            ...foreignFields,
          });

    setBusy(false);
    if (!result) return;
    if (!result.ok) return setError(result.error);
    setEntries((prev) => prev.filter((e) => e.fileName !== selected));
    refreshHistory();
    setSelected(null);
  }

  async function handleSkip() {
    if (selected === null) return;
    setBusy(true);
    setError(null);
    const result = await window.api.receiptInbox.dismiss(selected);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setEntries((prev) => prev.filter((e) => e.fileName !== selected));
    refreshHistory();
    setSelected(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-brand-900">Receipt Inbox</h1>
          <p className="mt-1 text-sm text-gray-500">
            Scans from your iPhone land here automatically — review each one into a Bill, Quick Expense, or Quick Sale, or skip it. You can also import
            any receipt file from anywhere on this PC.
          </p>
        </div>
        <button
          type="button"
          disabled={importBusy}
          onClick={handleImportFiles}
          className="flex-shrink-0 rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
        >
          {importBusy ? 'Importing…' : 'Import File…'}
        </button>
      </div>

      <ScannerConnectionPanel onScanned={(fileName) => void handleScanned(fileName)} />

      <details className="rounded-xl border border-gray-200 bg-white p-3">
        <summary className="cursor-pointer font-semibold text-gray-900">Processed receipts ({history.length})</summary>
        <p className="mt-1 text-xs text-gray-500">Open the archived scan or return to the original accounting entry for any correction.</p>
        {history.length === 0 ? <p className="mt-3 text-sm text-gray-400">No processed receipts yet.</p> : (
          <div className="mt-3 max-h-64 overflow-auto divide-y divide-gray-100">
            {history.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1"><div className="truncate font-medium text-gray-800">{item.sourceFileName}</div><div className="text-xs text-gray-400">{item.importedAt.slice(0, 10)} · {item.billId ? 'Vendor bill created' : item.journalEntryId ? 'Journal entry created' : 'Skipped'}</div></div>
                <button type="button" onClick={() => window.api.receiptInbox.openFile(item.archivedFilePath)} className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">View scan</button>
                {item.billId && <button type="button" onClick={() => setView({ kind: 'purchases', tab: 'unpaid', billId: item.billId! })} className="rounded-lg bg-brand-100 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-200">Open bill</button>}
                {item.journalEntryId && <button type="button" onClick={() => setView({ kind: 'journalForm', id: item.journalEntryId! })} className="rounded-lg bg-brand-100 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-200">Open entry</button>}
                <button type="button" disabled={busy} onClick={() => reprocess(item)} className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200 disabled:opacity-50">Reprocess</button>
              </div>
            ))}
          </div>
        )}
      </details>

      {selected === null && error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {entryType === 'bill' && vendors.length === 0 && (
        <p className="text-sm text-amber-600">
          Add a vendor first (
          <button type="button" onClick={() => setView({ kind: 'vendors' })} className="underline">
            Vendors page
          </button>
          ), or use "Quick Expense" / "Quick Sale" instead if this receipt doesn't need a vendor tracked.
        </p>
      )}

      {entries.length === 0 && selected === null ? (
        <SetupInstructions />
      ) : (
        <div className="grid grid-cols-[200px_1fr] gap-3">
          <div className="space-y-2">
            {entries.map((entry) => (
              <button
                key={entry.fileName}
                type="button"
                onClick={() => setSelected(entry.fileName)}
                className={`block w-full truncate rounded border px-3 py-2 text-left text-xs ${
                  selected === entry.fileName ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
                title={entry.fileName}
              >
                {receiptEntryLabel(entry.fileName)}
              </button>
            ))}
          </div>

          {selected === null ? (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-sm text-gray-400">
              Select a receipt on the left to review it.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="h-[70vh] rounded-lg border border-gray-200 bg-gray-50 p-2">
                <ReceiptPreview dataUrl={previewDataUrl} />
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-3">
                {error && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

                <div className="mb-3 flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 gap-1 rounded bg-gray-100 p-1">
                    {TYPE_TABS.map((tab) => (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => setEntryType(tab.value)}
                        className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                          entryType === tab.value ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <ForeignCurrencySelector fx={fx} />
                </div>

                {ocrLoading && <p className="mb-3 text-xs text-gray-400">Reading receipt…</p>}
                {!ocrLoading && ocrApplied && (
                  <p className="mb-3 rounded bg-brand-50 px-3 py-2 text-xs text-brand-700">Some fields were auto-filled from the scan — please double-check them before saving.</p>
                )}
                {!ocrLoading && !ocrApplied && selected?.toLowerCase().endsWith('.pdf') && (
                  <p className="mb-3 rounded bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    Couldn't auto-fill from this PDF — enter the details below manually.
                  </p>
                )}

                <div className="space-y-3">
                  {entryType === 'bill' ? (
                    <label className="block text-sm">
                      <span className="text-gray-600">Vendor</span>
                      <select
                        className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5"
                        value={vendorId ?? ''}
                        onChange={(e) => setVendorId(e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">Select a vendor…</option>
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                      {vendorNameGuess && !vendorMatched && (
                        <span className="mt-1 block text-xs text-amber-600">
                          Scan looks like "{vendorNameGuess}" — no matching vendor found. Add it on the{' '}
                          <button type="button" onClick={() => setView({ kind: 'vendors' })} className="underline">
                            Vendors page
                          </button>{' '}
                          or pick the closest match above.
                        </span>
                      )}
                    </label>
                  ) : (
                    <label className="block text-sm">
                      <span className="text-gray-600">{entryType === 'expense' ? 'Paid From' : 'Deposited To'}</span>
                      <Combobox
                        options={moneyAccountOptions}
                        value={moneyAccountId !== null ? String(moneyAccountId) : null}
                        onChange={(v) => setMoneyAccountId(v ? Number(v) : null)}
                        placeholder="Select bank, cash, or credit card…"
                      />
                    </label>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm">
                      <span className="text-gray-600">{entryType === 'bill' ? 'Bill Date' : 'Date'}</span>
                      <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={entryDate} onChange={(e) => setEntryDate(clampIsoDate(e.target.value))} />
                    </label>
                    {entryType === 'bill' && (
                      <label className="block text-sm">
                        <span className="text-gray-600">Due Date</span>
                        <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={dueDate} onChange={(e) => setDueDate(clampIsoDate(e.target.value))} />
                      </label>
                    )}
                  </div>
                  <label className="block text-sm">
                    <span className="text-gray-600">{entryType === 'income' ? 'Income Category' : 'Category'}</span>
                    <Combobox
                      options={categoryOptions}
                      value={categoryAccountId !== null ? String(categoryAccountId) : null}
                      onChange={(v) => setCategoryAccountId(v ? Number(v) : null)}
                      placeholder={entryType === 'income' ? 'Select an income account…' : 'Select an expense or asset account…'}
                    />
                  </label>
                  <ForeignCurrencyDetails fx={fx} />
                  <div className="flex gap-3">
                    <label className="block text-sm">
                      <span className="text-gray-600">Amount {fx.isForeign && '(CAD, computed)'}</span>
                      <div className="mt-1 w-32">
                        <CurrencyInput valueCents={amountCents} onChange={setAmountCents} disabled={fx.isForeign} />
                      </div>
                    </label>
                    <label className="block text-sm">
                      <span className="text-gray-600">Tax</span>
                      <select className="mt-1 w-32 rounded border border-gray-300 px-2 py-1.5" value={taxCode ?? ''} onChange={(e) => setTaxCode((e.target.value || null) as TaxCode | null)}>
                        {TAX_CODE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {taxCode && !isNoTaxCode(taxCode) && (
                      <label className="block text-sm">
                        <span className="text-gray-600">HST Amount {taxCode === 'Manual' ? '(as on receipt)' : '(suggested)'}</span>
                        <div className="mt-1 w-28">
                          <CurrencyInput
                            valueCents={taxCode === 'Manual' ? manualHstCents : taxPortionOfInclusive(taxCode, amountCents)}
                            onChange={(cents) => {
                              // A figure typed here is the receipt's own tax — kept exactly, never recalculated.
                              setTaxCode('Manual');
                              setManualHstCents(cents);
                            }}
                          />
                        </div>
                      </label>
                    )}
                  </div>
                  <label className="block text-sm">
                    <span className="text-gray-600">Description (optional)</span>
                    <input
                      name="receipt-memo"
                      autoComplete="on"
                      list={suggestionListId('transaction-memo')}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      onBlur={suggestOnBlur('transaction-memo', setMemo)}
                    />
                    <SuggestionDatalist fieldKey="transaction-memo" />
                  </label>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy || !canSave}
                    onClick={handleSave}
                    className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
                  >
                    {entryType === 'bill' ? 'Save as Bill' : entryType === 'expense' ? 'Save as Expense' : 'Save as Sale'}
                  </button>
                  <button type="button" disabled={busy} onClick={handleSkip} className="rounded-full px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100">
                    Skip
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
