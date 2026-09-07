import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CustomCompanyReportRow } from '@shared/domain/reporting/comprehensiveCompanyReport';
import { DateInput } from '../../components/DateInput';
import { Money } from '../../components/Money';
import { OpenEntryButton } from '../../components/OpenEntryButton';
import { useIpcQuery } from '../../hooks/useIpcQuery';
import { useUiStore } from '../../app/store/uiStore';
import { openOriginalEntry } from '../../utils/openOriginalEntry';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso() { return localIsoDate() }
function yearStartIso() { return `${todayIso().slice(0, 4)}-01-01` }

export type ColumnKey = keyof CustomCompanyReportRow;
export interface ColumnDefinition { key: ColumnKey; label: string; group: string; value: (row: CustomCompanyReportRow) => ReactNode; right?: boolean }

const money = (value: number | null) => value === null ? '—' : <Money cents={value} />;
const text = (value: unknown) => value === null || value === '' ? '—' : String(value);

export const CUSTOM_REPORT_COLUMNS: ColumnDefinition[] = [
  { key: 'entryDate', label: 'Date', group: 'Journal', value: (row) => row.entryDate },
  { key: 'entryId', label: 'Journal entry #', group: 'Journal', value: (row) => row.entryId },
  { key: 'lineId', label: 'Journal line #', group: 'Journal', value: (row) => row.lineId },
  { key: 'transactionType', label: 'Transaction type', group: 'Journal', value: (row) => row.transactionType },
  { key: 'reference', label: 'Reference / document #', group: 'Journal', value: (row) => text(row.reference) },
  { key: 'user', label: 'Entered by', group: 'Audit', value: (row) => row.user ?? 'Legacy/local' },
  { key: 'status', label: 'Status', group: 'Audit', value: (row) => row.status },
  { key: 'adjusting', label: 'Adjusting entry', group: 'Audit', value: (row) => row.adjusting ? 'Yes' : 'No' },
  { key: 'memo', label: 'Memo', group: 'Journal', value: (row) => text(row.memo) },
  { key: 'accountCode', label: 'Account code', group: 'General Ledger', value: (row) => text(row.accountCode) },
  { key: 'accountName', label: 'Account', group: 'General Ledger', value: (row) => row.accountName },
  { key: 'contactName', label: 'Customer / vendor', group: 'Contacts', value: (row) => text(row.contactName) },
  { key: 'description', label: 'Description', group: 'General Ledger', value: (row) => text(row.description) },
  { key: 'debitCents', label: 'Debit', group: 'General Ledger', value: (row) => row.debitCents ? money(row.debitCents) : '—', right: true },
  { key: 'creditCents', label: 'Credit', group: 'General Ledger', value: (row) => row.creditCents ? money(row.creditCents) : '—', right: true },
  { key: 'taxCode', label: 'Tax code', group: 'Sales Tax', value: (row) => text(row.taxCode) },
  { key: 'baseCents', label: 'Taxable base', group: 'Sales Tax', value: (row) => money(row.baseCents), right: true },
  { key: 'taxAmountCents', label: 'Tax amount', group: 'Sales Tax', value: (row) => row.taxAmountCents ? money(row.taxAmountCents) : '—', right: true },
  { key: 'currency', label: 'Currency', group: 'Foreign Currency', value: (row) => row.currency },
  { key: 'exchangeRate', label: 'Exchange rate', group: 'Foreign Currency', value: (row) => row.exchangeRate ?? '—', right: true },
  { key: 'foreignAmountCents', label: 'Foreign amount', group: 'Foreign Currency', value: (row) => money(row.foreignAmountCents), right: true },
];

export const DEFAULT_COLUMNS: ColumnKey[] = ['entryDate', 'transactionType', 'reference', 'user', 'accountName', 'contactName', 'description', 'debitCents', 'creditCents', 'taxCode', 'taxAmountCents'];
const COLUMN_STORAGE_KEY = 'apexLedger.comprehensiveReportColumns';

export function loadColumns(): ColumnKey[] {
  try {
    const stored = JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(stored)) return DEFAULT_COLUMNS;
    const allowed = new Set(CUSTOM_REPORT_COLUMNS.map((column) => column.key));
    const valid = [...new Set(stored.filter((key): key is ColumnKey => typeof key === 'string' && allowed.has(key as ColumnKey)))];
    return valid.length > 0 ? valid : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

export function storeColumns(columns: ColumnKey[]): void {
  localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columns));
}

/** The sheet itself: choose the columns, save the layout, and click any line back to the entry that
 * created it. Used both as its own screen and inside the Comprehensive Company Report, so the two
 * can never drift into different column lists or different drill-through behaviour. */
export function CustomTransactionDetailSheet({ rows }: { rows: CustomCompanyReportRow[] }) {
  const setView = useUiStore((state) => state.setView);
  const [columns, setColumns] = useState<ColumnKey[]>(loadColumns);
  /** What is actually written to storage. Comparing against it is how Save knows whether there is
   * anything to save — the layout is no longer written on every click. */
  const [savedColumns, setSavedColumns] = useState<ColumnKey[]>(loadColumns);
  const [columnToAdd, setColumnToAdd] = useState<ColumnKey>('entryId');
  const [justSaved, setJustSaved] = useState(false);

  const selected = useMemo(() => columns.map((key) => CUSTOM_REPORT_COLUMNS.find((column) => column.key === key)!).filter(Boolean), [columns]);
  const available = CUSTOM_REPORT_COLUMNS.filter((column) => !columns.includes(column.key));
  const effectiveColumnToAdd = available.some((column) => column.key === columnToAdd) ? columnToAdd : available[0]?.key ?? columnToAdd;
  const dirty = columns.length !== savedColumns.length || columns.some((key, index) => savedColumns[index] !== key);

  useEffect(() => { if (dirty) setJustSaved(false) }, [dirty]);

  function addColumn() {
    if (!columns.includes(effectiveColumnToAdd)) setColumns((current) => [...current, effectiveColumnToAdd]);
  }

  function saveLayout() {
    storeColumns(columns);
    setSavedColumns(columns);
    setJustSaved(true);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2 rounded bg-gray-50 p-2" data-export-ignore>
        <label className="text-xs text-gray-600"><span className="block">Add column from another report</span><select value={effectiveColumnToAdd} onChange={(event) => setColumnToAdd(event.target.value as ColumnKey)} className="mt-1 min-w-64 rounded border border-gray-300 px-2 py-1.5 text-sm">{available.map((column) => <option key={column.key} value={column.key}>{column.group} — {column.label}</option>)}</select></label>
        <button type="button" onClick={addColumn} disabled={available.length === 0} className="rounded bg-brand-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">Add column</button>
        <button type="button" onClick={saveLayout} disabled={!dirty} className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">Save columns</button>
        <button type="button" onClick={() => setColumns(DEFAULT_COLUMNS)} className="rounded border border-gray-300 px-3 py-1.5 text-sm">Reset</button>
        <span className={`pb-1.5 text-xs font-medium ${dirty ? 'text-amber-700' : 'text-gray-500'}`}>
          {dirty ? 'Unsaved column changes' : justSaved ? 'Column layout saved' : 'Saved layout in use'}
        </span>
      </div>
      <div className="flex flex-wrap gap-1" data-export-ignore>{selected.map((column) => <button key={column.key} type="button" onClick={() => setColumns((current) => current.filter((key) => key !== column.key))} className="rounded-full bg-brand-50 px-2 py-1 text-xs text-brand-800" title="Remove column">{column.label} ×</button>)}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b">
              {selected.map((column) => <th key={column.key} className={`px-3 py-1.5 ${column.right ? 'text-right' : 'text-left'}`}>{column.label}</th>)}
              <th className="px-3 py-1.5 text-left" data-export-ignore>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.entryId}:${row.lineId}`}
                onClick={() => void openOriginalEntry(row.entryId, setView)}
                title="Open the original entry behind this line"
                className="cursor-pointer border-b border-gray-100 hover:bg-brand-50"
              >
                {selected.map((column) => <td key={column.key} className={`px-3 py-1.5 ${column.right ? 'text-right' : 'text-left'}`}>{column.value(row)}</td>)}
                <td className="px-3 py-1.5" data-export-ignore><OpenEntryButton entryId={row.entryId} compact /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The same sheet on its own screen, with its own period, so it can be opened, laid out and traced
 * without generating the whole comprehensive company report around it. */
export function CustomTransactionDetailPage() {
  const [periodStart, setPeriodStart] = useState(yearStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const { data, loading, error } = useIpcQuery(() => window.api.reports.comprehensiveCompany({ periodStart, periodEnd }), [periodStart, periodEnd]);
  const { data: company } = useIpcQuery(() => window.api.company.get(), []);

  return <div className="w-full space-y-3">
    <div>
      <h2 className="text-lg font-semibold text-gray-900">Customizable Transaction Detail</h2>
      <p className="text-sm text-gray-500">Every posted journal line, with the columns you choose. Click any line to open the invoice, bill, receipt, payroll run or journal entry behind it.</p>
    </div>
    <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-gray-50 p-3" data-export-ignore>
      <label className="text-sm"><span className="block text-gray-600">From</span><DateInput value={periodStart} onChange={setPeriodStart} className="mt-1 w-36" /></label>
      <label className="text-sm"><span className="block text-gray-600">To / as of</span><DateInput value={periodEnd} onChange={setPeriodEnd} className="mt-1 w-36" /></label>
      <span className="text-xs text-gray-500">Company: {company?.displayName || company?.legalName || 'Company'}</span>
    </div>
    {loading && <p className="text-sm text-gray-500">Preparing the transaction detail…</p>}
    {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
    {data && <CustomTransactionDetailSheet rows={data.customRows} />}
  </div>;
}
