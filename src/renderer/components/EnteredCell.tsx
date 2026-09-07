import { ENTERED_COLUMN_LABEL, formatEnteredAt } from '@shared/domain/audit/enteredStamp';

/** The "Entered" column every sheet carries beside its Date column: the time the record was
 * keyed in, in the reader's local time. Time only — no person's name — so an Excel export of the
 * sheet can go to a client as is. Use `EnteredTh` for the heading and `EnteredTd` for the cell so
 * every sheet reads the same. */
export function EnteredTh({ className = '' }: { className?: string }) {
  return <th className={className} title="When this was keyed into the books (your local time)">{ENTERED_COLUMN_LABEL}</th>;
}

export function EnteredTd({ at, className = '' }: { at: string | null | undefined; className?: string }) {
  const label = formatEnteredAt(at);
  return <td className={`whitespace-nowrap tabular-nums text-xs text-gray-500 ${className}`}>{label || '—'}</td>;
}

/** Inline form for cells that are not plain <td> (card headers, custom tables). */
export function EnteredText({ at }: { at: string | null | undefined }) {
  const label = formatEnteredAt(at);
  return <span className="whitespace-nowrap tabular-nums text-xs text-gray-500">{label || '—'}</span>;
}
