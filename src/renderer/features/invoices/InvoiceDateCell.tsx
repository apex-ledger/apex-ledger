import { useState } from 'react';
import type { Invoice } from '@shared/domain/types';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';

/** The Invoice Date column is click-to-edit, like the Date column on the ledger tables: a posted
 * invoice keeps its number, lines and amounts and moves to the corrected date, its journal with it,
 * and a payment received on the same day moves along. Anything that makes the move unsafe (locked
 * period, reconciled line, a deposit already made, a payment that would end up before the invoice)
 * comes back as the reason, unchanged. */
export function InvoiceDateCell({ invoice, onSaved }: { invoice: Invoice; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function commit(next: string) {
    if (!next || next === invoice.invoiceDate) { setEditing(false); return; }
    setSaving(true);
    setNote(null);
    const r = await window.api.invoices.changeDate({ id: invoice.id, invoiceDate: next });
    setSaving(false);
    if (!r.ok) { setNote(r.error); return; }
    setEditing(false);
    setNote(r.data.paymentsMoved > 0 ? `Moved to ${next} with ${r.data.paymentsMoved === 1 ? 'its payment' : `${r.data.paymentsMoved} payments`}.` : null);
    onSaved();
  }

  if (!editing) {
    return (
      <span className="inline-flex flex-col">
        <button type="button" onClick={() => setEditing(true)} className="whitespace-nowrap text-left underline decoration-dotted decoration-gray-300 underline-offset-2 hover:decoration-brand-500" title="Click to change the invoice date; the journal and a same-day payment move with it">
          {invoice.invoiceDate}
        </button>
        {note && <span className="text-[10px] text-brand-700">{note}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-0.5">
      <input type="date" min={DATE_MIN} max={DATE_MAX} autoFocus defaultValue={invoice.invoiceDate} disabled={saving} className="rounded border border-brand-300 px-1 py-0.5 text-xs"
        onBlur={(e) => void commit(clampIsoDate(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); if (e.key === 'Enter') void commit((e.target as HTMLInputElement).value); }} />
      {note && <span className="text-[10px] text-red-600">{note}</span>}
    </span>
  );
}
