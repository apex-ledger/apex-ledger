import { useEffect, useMemo, useState } from 'react';
import type { Account } from '@shared/domain/types';
import { parseBulkExpenseImport, type BulkExpenseRow } from '@shared/domain/journal/parseBulkExpenseImport';
import { detectColumnMapping, ALL_COLUMN_ROLES, COLUMN_ROLE_LABELS, type ColumnRole } from '@shared/domain/journal/bulkExpenseColumns';
import { hstPortionCents, usTaxPortionCents } from '@shared/domain/ledger/hstSummary';
import { categoryLineAmountCents, computeTaxSplit } from '@shared/domain/ledger/computeTaxSplit';
import type { TaxCode } from '@shared/domain/types';
import { Combobox } from '../../components/Combobox';
import { Money } from '../../components/Money';
import { useUiStore } from '../../app/store/uiStore';
import { accountPickerOptions } from '../../utils/accountLabel';

interface EditableRow extends BulkExpenseRow {
  include: boolean;
}

type PostStatus = 'pending' | 'posting' | 'posted' | 'draft' | 'error';
type Stage = 'paste' | 'map' | 'review';

function isRowUsable(row: EditableRow): boolean {
  return row.entryDate !== null && row.categoryAccountId !== null && row.moneyAccountId !== null && row.cadTotalCents > 0;
}

/** Splits a row's known total (cadTotalCents, tax-inclusive) into a pre-tax base and a tax
 * amount via the same embedded-tax math this app always used (13/113, 8/108) — now used to back
 * the base out of a known total so tax can be posted to its own GST/HST line instead of staying
 * embedded in the category. See computeTaxSplit.ts for the claimable/non-claimable split. */
function splitRowTax(taxCode: TaxCode | null, totalCents: number, manualHstCents: number): { baseCents: number; taxCents: number } {
  if (taxCode === 'Manual') return { baseCents: totalCents - manualHstCents, taxCents: manualHstCents };
  if (taxCode === 'HST' || taxCode === 'MealsHST') {
    const tax = hstPortionCents(totalCents);
    return { baseCents: totalCents - tax, taxCents: tax };
  }
  if (taxCode === 'USTax') {
    const tax = usTaxPortionCents(totalCents);
    return { baseCents: totalCents - tax, taxCents: tax };
  }
  return { baseCents: totalCents, taxCents: 0 };
}

export function BulkExpenseImportPage() {
  const setView = useUiStore((s) => s.setView);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [stage, setStage] = useState<Stage>('paste');
  /** Names the batch on the Adjusting Entries report, so a correction can be traced back to the
   * spreadsheet it came from months later. */
  const [sourceLabel, setSourceLabel] = useState('Client spreadsheet');
  /** Client data arrives for review, not to be trusted straight into the ledger — and only a draft
   * can be edited, so posting on import would make it impossible to correct or to record what was
   * corrected. Left on by default for that reason; uncheck for a batch already known to be right. */
  const [leaveAsDraft, setLeaveAsDraft] = useState(true);
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [hasHeaderRow, setHasHeaderRow] = useState(false);
  const [mapping, setMapping] = useState<ColumnRole[]>([]);

  const [rows, setRows] = useState<EditableRow[]>([]);
  const [posting, setPosting] = useState(false);
  const [rowStatus, setRowStatus] = useState<Record<number, { status: PostStatus; error?: string }>>({});
  const [rowDuplicateCounts, setRowDuplicateCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    window.api.accounts.list({ activeOnly: true }).then((r) => r.ok && setAccounts(r.data));
  }, []);

  const expenseAccountOptions = useMemo(() => accountPickerOptions(accounts.filter((a) => a.accountType === 'Expense')), [accounts]);
  const moneyAccountOptions = useMemo(
    () => accountPickerOptions(accounts.filter((a) => a.accountType === 'Asset' || a.accountType === 'Liability')),
    [accounts],
  );

  async function handlePasteFromExcel() {
    setPasteBusy(true);
    setPasteError(null);
    setRowStatus({});
    const result = await window.api.clipboard.readText();
    setPasteBusy(false);
    if (!result.ok) return setPasteError(result.error);

    const parsedRows = result.data.split(/\r\n|\r|\n/).map((r) => r.split('\t'));
    const nonBlank = parsedRows.filter((r) => r.some((c) => c.trim().length > 0));
    if (nonBlank.length === 0) {
      setPasteError('Clipboard is empty — copy some rows from Excel first, then try again.');
      return;
    }
    const { mapping: detected, hasHeaderRow: detectedHeader } = detectColumnMapping(nonBlank);
    setRawRows(nonBlank);
    setHasHeaderRow(detectedHeader);
    setMapping(detected);
    setStage('map');
  }

  function sampleForColumn(col: number): string {
    const dataRows = hasHeaderRow ? rawRows.slice(1) : rawRows;
    const sample = dataRows.find((r) => (r[col] ?? '').trim().length > 0);
    return sample ? sample[col].trim() : '';
  }

  function handleConfirmMapping() {
    const text = rawRows.map((r) => r.join('\t')).join('\n');
    const parsed = parseBulkExpenseImport(text, accounts, mapping, new Date().getFullYear(), hasHeaderRow);
    const editableRows = parsed.rows.map((r) => ({ ...r, include: !r.skipped }));
    setRows(editableRows);
    setStage('review');
    checkForDuplicates(editableRows);
  }

  // Checks every usable row against existing entries (same category account, same amount, within
  // a few days) — most useful for catching an already-imported batch getting pasted twice.
  // Heads-up only, shown as a badge; never excludes a row from posting on its own.
  async function checkForDuplicates(candidateRows: EditableRow[]) {
    setRowDuplicateCounts({});
    const results = await Promise.all(
      candidateRows
        .filter((r) => isRowUsable(r))
        .map(async (r) => {
          const result = await window.api.journal.findPossibleDuplicates({
            entryDate: r.entryDate as string,
            accountId: r.categoryAccountId as number,
            amountCents: r.cadTotalCents,
          });
          return [r.rowIndex, result.ok ? result.data.length : 0] as const;
        }),
    );
    setRowDuplicateCounts(Object.fromEntries(results.filter(([, count]) => count > 0)));
  }

  function updateRow(rowIndex: number, patch: Partial<EditableRow>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowIndex !== rowIndex) return r;
        const next = { ...r, ...patch };
        if (isRowUsable(next) && !r.include) next.include = true;
        return next;
      }),
    );
  }

  const includedRows = rows.filter((r) => r.include && isRowUsable(r));
  const postedCount = Object.values(rowStatus).filter((s) => s.status === 'posted' || s.status === 'draft').length;

  async function handlePostAll() {
    setPosting(true);
    let gstRecoverableId: number | null = null;
    for (const row of includedRows) {
      setRowStatus((prev) => ({ ...prev, [row.rowIndex]: { status: 'posting' } }));
      const foreignFields =
        row.foreignCurrency !== null && row.foreignAmountCents !== null && row.foreignAmountCents > 0 && row.exchangeRate !== null
          ? { foreignCurrency: row.foreignCurrency, foreignAmountCents: row.foreignAmountCents, exchangeRate: row.exchangeRate }
          : {};
      const manualHst = row.taxCode === 'Manual' ? row.manualHstCents : 0;
      const { baseCents, taxCents } = splitRowTax(row.taxCode, row.cadTotalCents, manualHst);
      const split = computeTaxSplit(row.taxCode, taxCents);
      const categoryCents = categoryLineAmountCents(baseCents, split);
      const categoryLine = {
        accountId: row.categoryAccountId as number,
        debitCents: row.isRefund ? 0 : categoryCents,
        creditCents: row.isRefund ? categoryCents : 0,
        description: row.vendor || null,
        taxCode: row.taxCode,
        manualHstCents: row.taxCode === 'Manual' ? row.manualHstCents : null,
        ...foreignFields,
      };
      const moneyLine = {
        accountId: row.moneyAccountId as number,
        debitCents: row.isRefund ? row.cadTotalCents : 0,
        creditCents: row.isRefund ? 0 : row.cadTotalCents,
        description: row.vendor || null,
      };
      const lines = [categoryLine, moneyLine];
      if (split.claimableTaxCents > 0) {
        if (gstRecoverableId === null) {
          const r = await window.api.accounts.ensureGstHstAccount('recoverable');
          if (r.ok) gstRecoverableId = r.data.id;
        }
        if (gstRecoverableId !== null) {
          lines.splice(row.isRefund ? 0 : 1, 0, {
            accountId: gstRecoverableId,
            debitCents: row.isRefund ? 0 : split.claimableTaxCents,
            creditCents: row.isRefund ? split.claimableTaxCents : 0,
            description: 'GST/HST',
          });
        }
      }

      const journalInput = {
        entryDate: row.entryDate as string,
        memo: row.vendor || null,
        reference: null,
        lines,
        source: 'clientImport',
        sourceReference: sourceLabel.trim() || null,
      };
      const saveResult = leaveAsDraft ? await window.api.journal.create(journalInput) : await window.api.journal.createAndPost(journalInput);
      if (!saveResult.ok) {
        setRowStatus((prev) => ({ ...prev, [row.rowIndex]: { status: 'error', error: saveResult.error } }));
        continue;
      }
      if (leaveAsDraft) {
        setRowStatus((prev) => ({ ...prev, [row.rowIndex]: { status: 'draft' } }));
        continue;
      }
      setRowStatus((prev) => ({ ...prev, [row.rowIndex]: { status: 'posted' } }));
    }
    setPosting(false);
  }

  const columnCount = rawRows.length > 0 ? Math.max(...rawRows.map((r) => r.length)) : 0;
  const mappedRoleCounts = mapping.reduce<Partial<Record<ColumnRole, number>>>((acc, role) => {
    acc[role] = (acc[role] ?? 0) + 1;
    return acc;
  }, {});
  const mappingErrors: string[] = [];
  if ((mappedRoleCounts.date ?? 0) === 0) mappingErrors.push('a Date column');
  if ((mappedRoleCounts.category ?? 0) === 0) mappingErrors.push('a Category column');
  if ((mappedRoleCounts.paymentMethod ?? 0) === 0) mappingErrors.push('a Payment Method column');
  if ((mappedRoleCounts.amount ?? 0) === 0 && ((mappedRoleCounts.foreignAmount ?? 0) === 0 || (mappedRoleCounts.exchangeRate ?? 0) === 0)) {
    mappingErrors.push('an Amount column (or a Foreign Total + Exchange Rate pair)');
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => (stage === 'paste' ? setView({ kind: 'quickEntry', type: 'expense' }) : setStage(stage === 'review' ? 'map' : 'paste'))}
          className="text-sm text-brand-600 hover:underline"
        >
          ← {stage === 'paste' ? 'Back to Quick Entry' : 'Back'}
        </button>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <h1 className="text-lg font-semibold text-gray-900">Bulk Expense Import</h1>
        <p className="mt-1 text-sm text-gray-500">
          Works with any spreadsheet layout — paste your rows, tell it which column is which (it makes a best guess first), then review and post.
        </p>

        {stage === 'paste' && (
          <div className="mt-3">
            <button
              type="button"
              disabled={pasteBusy}
              onClick={handlePasteFromExcel}
              className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              {pasteBusy ? 'Pasting…' : 'Paste from Excel'}
            </button>
            {pasteError && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{pasteError}</p>}
          </div>
        )}

        {stage === 'map' && (
          <div className="mt-3">
            <p className="text-sm text-gray-600">
              {hasHeaderRow ? 'Detected a header row and matched columns automatically.' : 'No header row detected — guessed each column from its data.'}{' '}
              Fix anything that's wrong before continuing.
            </p>
            <div className="mt-3 overflow-x-auto rounded border border-gray-200">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">Column</th>
                    <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">Sample Value</th>
                    <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">This Column Is</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: columnCount }, (_, col) => (
                    <tr key={col} className="border-b border-gray-100 last:border-0">
                      <td className="px-2 py-1.5 text-gray-500">{hasHeaderRow ? rawRows[0]?.[col] || `Column ${col + 1}` : `Column ${col + 1}`}</td>
                      <td className="px-2 py-1.5 text-gray-500">{sampleForColumn(col) || '—'}</td>
                      <td className="w-64 px-2 py-1.5">
                        <select
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          value={mapping[col] ?? 'ignore'}
                          onChange={(e) =>
                            setMapping((prev) => {
                              const next = [...prev];
                              next[col] = e.target.value as ColumnRole;
                              return next;
                            })
                          }
                        >
                          {ALL_COLUMN_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {COLUMN_ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {mappingErrors.length > 0 && (
              <p className="mt-2 text-sm text-amber-600">Still need to assign: {mappingErrors.join(', ')}.</p>
            )}
            <button
              type="button"
              disabled={mappingErrors.length > 0}
              onClick={handleConfirmMapping}
              className="mt-3 rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
            >
              Continue to Review
            </button>
          </div>
        )}

        {stage === 'review' && (
          <>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-sm text-gray-600">
                {rows.length} row{rows.length === 1 ? '' : 's'} — {includedRows.length} ready to post
              </span>
              <button type="button" onClick={() => setStage('map')} className="text-sm text-brand-600 hover:underline">
                Adjust column mapping
              </button>
            </div>

            <div className="mt-3 overflow-x-auto rounded border border-gray-200">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border-b border-gray-200 px-2 py-2" />
                    <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">Date</th>
                    <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">Vendor / Description</th>
                    <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">Category</th>
                    <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">Paid With</th>
                    <th className="border-b border-gray-200 px-2 py-2 text-right font-medium text-gray-600">CAD Total</th>
                    <th className="border-b border-gray-200 px-2 py-2 text-left font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const status = rowStatus[row.rowIndex];
                    return (
                      <tr key={row.rowIndex} className={`border-b border-gray-100 last:border-0 ${row.skipped && !isRowUsable(row) ? 'bg-amber-50' : ''}`}>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={row.include && isRowUsable(row)}
                            disabled={!isRowUsable(row)}
                            onChange={(e) => updateRow(row.rowIndex, { include: e.target.checked })}
                          />
                        </td>
                        <td className="px-2 py-1.5">{row.entryDate ?? <span className="text-xs text-amber-600">unrecognized</span>}</td>
                        <td className="px-2 py-1.5">
                          {row.vendor}
                          {row.isRefund && <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500">refund</span>}
                          {rowDuplicateCounts[row.rowIndex] > 0 && (
                            <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700" title="An entry with this account, amount, and a nearby date already exists — double-check before posting.">
                              possible duplicate
                            </span>
                          )}
                        </td>
                        <td className="w-56 px-2 py-1.5">
                          <Combobox
                            options={expenseAccountOptions}
                            value={row.categoryAccountId !== null ? String(row.categoryAccountId) : null}
                            onChange={(v) => updateRow(row.rowIndex, { categoryAccountId: v ? Number(v) : null })}
                            placeholder={`"${row.categoryName}" — pick account…`}
                          />
                        </td>
                        <td className="w-48 px-2 py-1.5">
                          <Combobox
                            options={moneyAccountOptions}
                            value={row.moneyAccountId !== null ? String(row.moneyAccountId) : null}
                            onChange={(v) => updateRow(row.rowIndex, { moneyAccountId: v ? Number(v) : null })}
                            placeholder={row.paymentMethodName ? `"${row.paymentMethodName}" — pick account…` : 'Pick account…'}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <Money cents={row.cadTotalCents} />
                        </td>
                        <td className="px-2 py-1.5 text-xs">
                          {status?.status === 'posting' && <span className="text-gray-400">Posting…</span>}
                          {status?.status === 'posted' && <span className="text-green-600">Posted</span>}
                          {status?.status === 'draft' && <span className="text-sky-600">Draft — ready to review</span>}
                          {status?.status === 'error' && (
                            <span className="text-red-600" title={status.error}>
                              Failed
                            </span>
                          )}
                          {!status && row.skipped && <span className="text-amber-600">{row.skipReason}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                disabled={posting || includedRows.length === 0}
                onClick={handlePostAll}
                className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
              >
                {posting ? 'Posting…' : `Post ${includedRows.length} Entr${includedRows.length === 1 ? 'y' : 'ies'}`}
              </button>
              {postedCount > 0 && <span className="text-sm text-green-600">Posted {postedCount} so far.</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
