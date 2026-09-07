import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { suggestColumnMapping, type ColumnRole, type DateFormat, type RawTable } from './parseTransactions';

const ROLE_OPTIONS: { value: ColumnRole; label: string }[] = [
  { value: 'ignore', label: 'Ignore this column' },
  { value: 'date', label: 'Date' },
  { value: 'description', label: 'Description' },
  { value: 'debit', label: 'Debit (money out)' },
  { value: 'credit', label: 'Credit (money in)' },
  { value: 'amount', label: 'Amount (single, signed)' },
  { value: 'balance', label: 'Balance (ignored)' },
];

const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'MDY', label: 'MM/DD/YYYY' },
  { value: 'DMY', label: 'DD/MM/YYYY' },
  { value: 'YMD', label: 'YYYY/MM/DD' },
];

export function ColumnMappingModal({
  open,
  onClose,
  table,
  onContinue,
}: {
  open: boolean;
  onClose: () => void;
  table: RawTable | null;
  onContinue: (roles: ColumnRole[], hasHeader: boolean, dateFormat: DateFormat) => void;
}) {
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto');

  useEffect(() => {
    if (!open || !table) return;
    const suggestion = suggestColumnMapping(table);
    setRoles(suggestion.roles);
    setHasHeader(suggestion.hasHeader);
    setDateFormat('auto');
  }, [open, table]);

  if (!table) return null;

  const hasDate = roles.includes('date');
  const hasAmountish = roles.includes('amount') || roles.includes('debit') || roles.includes('credit');
  const canContinue = hasDate && hasAmountish;

  const headerRow = hasHeader ? table.allRows[0] : null;
  const previewRows = (hasHeader ? table.allRows.slice(1) : table.allRows).slice(0, 5);

  function setRole(index: number, role: ColumnRole) {
    setRoles((prev) => prev.map((r, i) => (i === index ? role : r)));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Map Columns"
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => onContinue(roles, hasHeader, dateFormat)}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Continue
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          Tell us which column is which — we've made a best guess below. Every row after the header (if any) is shown so you can check it
          looks right before importing.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
            <span className="text-gray-700">First row is a header</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">Date format</span>
            <select className="rounded border border-gray-300 px-2 py-1 text-sm" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
              {DATE_FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!canContinue && <p className="text-sm text-amber-600">Assign at least one Date column and one Amount (or Debit/Credit) column to continue.</p>}

        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-gray-50">
              <tr>
                {Array.from({ length: table.columnCount }).map((_, i) => (
                  <th key={i} className="border-b border-gray-200 px-2 py-2 text-left">
                    <select
                      className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs"
                      value={roles[i] ?? 'ignore'}
                      onChange={(e) => setRole(i, e.target.value as ColumnRole)}
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {headerRow?.[i] && <div className="mt-1 truncate text-[10px] font-normal text-gray-400" title={headerRow[i]}>"{headerRow[i]}"</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, rIdx) => (
                <tr key={rIdx} className="border-b border-gray-100 last:border-0">
                  {Array.from({ length: table.columnCount }).map((_, cIdx) => (
                    <td key={cIdx} className="whitespace-nowrap px-2 py-1.5 text-gray-700">
                      {row[cIdx] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
