import { useCallback, useEffect, useState } from 'react';
import type { Account, Bill, Contact, CreditNote, CreditNoteKind, Invoice } from '@shared/domain/types';
import { Money } from '../../components/Money';
import { CreditNoteFormModal } from './CreditNoteFormModal';
import { JournalEntryLink } from '../../components/JournalEntryLink';
import { EnteredTd, EnteredText, EnteredTh } from '../../components/EnteredCell';
import { localIsoDate } from '@shared/domain/dates/localDate';

function todayIso(): string {
  return localIsoDate();
}

const STATUS_STYLES: Record<CreditNote['status'], string> = {
  open: 'bg-amber-100 text-amber-800',
  applied: 'bg-emerald-100 text-emerald-800',
  refunded: 'bg-gray-100 text-gray-600',
};

/**
 * Credit notes for both directions. A customer credit note reverses a sale (a return, an
 * overcharge); a vendor credit is one received from a vendor. Both can then either settle an
 * open invoice/bill or be paid out in cash.
 */
/** `kind` fixes the side: Sales → Credit notes shows customer credit notes, Expenses → Vendor
 * credits shows vendor credits, and neither shows the other's toggle. */
export function CreditNotesPage({ kind: fixedKind }: { kind?: CreditNoteKind } = {}) {
  const [kind, setKind] = useState<CreditNoteKind>(fixedKind ?? 'customer');
  useEffect(() => {
    if (fixedKind) setKind(fixedKind);
  }, [fixedKind]);
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);
  const [openBills, setOpenBills] = useState<Bill[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Dollars typed against each open credit before choosing what to apply it to. Blank means "as
   * much as possible" — the whole credit, or the whole balance, whichever is smaller. */
  const [applyAmounts, setApplyAmounts] = useState<Record<number, string>>({});

  const bankAccounts = accounts.filter((a) => a.isActive && a.accountSubtype === 'Cash and Bank');

  const reload = useCallback(() => {
    window.api.creditNotes.list(kind).then((r) => {
      if (r.ok) setNotes(r.data);
    });
    const contactApi = kind === 'customer' ? window.api.customers : window.api.vendors;
    contactApi.list().then((r) => {
      if (r.ok) setContacts(r.data);
    });
    if (kind === 'customer') {
      window.api.invoices.list().then((r) => {
        if (r.ok) setOpenInvoices(r.data.filter((i) => i.status === 'unpaid'));
      });
    } else {
      window.api.bills.list().then((r) => {
        if (r.ok) setOpenBills(r.data.filter((b) => b.status === 'unpaid'));
      });
    }
  }, [kind]);

  useEffect(() => {
    window.api.accounts.list({ activeOnly: true }).then((r) => {
      if (r.ok) setAccounts(r.data);
    });
  }, []);

  useEffect(reload, [reload]);

  function contactName(id: number): string {
    return contacts.find((c) => c.id === id)?.name ?? 'Unknown customer/vendor';
  }

  function appliedTargetLabel(targetId: number | null): string {
    if (targetId === null) return 'Applied';
    if (kind === 'customer') {
      const invoice = openInvoices.find((row) => row.id === targetId);
      return invoice ? `Applied to invoice ${invoice.invoiceNumber}` : 'Applied to invoice';
    }
    const bill = openBills.find((row) => row.id === targetId);
    return bill?.billNumber ? `Applied to vendor invoice ${bill.billNumber}` : 'Applied to vendor bill';
  }

  async function handleApply(note: CreditNote, targetId: number) {
    const typed = (applyAmounts[note.id] ?? '').trim();
    const amountCents = typed === '' ? undefined : Math.round(Number(typed) * 100);
    if (amountCents !== undefined && (!Number.isFinite(amountCents) || amountCents <= 0)) return setError('Enter the amount of the credit to apply, in dollars.');
    setBusy(true);
    setError(null);
    const result = await window.api.creditNotes.apply({ id: note.id, targetId, amountCents });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setApplyAmounts((current) => ({ ...current, [note.id]: '' }));
    reload();
  }

  async function handleRefund(note: CreditNote, bankAccountId: number) {
    setBusy(true);
    setError(null);
    const result = await window.api.creditNotes.refund({ id: note.id, bankAccountId, refundDate: todayIso() });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    reload();
  }

  async function handleDelete(note: CreditNote) {
    if (!window.confirm(`Delete credit note ${note.creditNoteNumber}? Its linked accounting entry will be voided. This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    const result = await window.api.creditNotes.delete(note.id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    reload();
  }

  async function handleUndoSettlement(note: CreditNote) {
    const undoingRefund = note.status === 'refunded';
    if (!window.confirm(`Undo the ${undoingRefund ? 'refund' : 'latest application'} of ${note.creditNoteNumber}? ${undoingRefund ? 'The refund journal entry will be voided.' : 'The invoice/bill balance will reopen by that amount.'}`)) return;
    setBusy(true);
    setError(null);
    const result = await window.api.creditNotes.undoSettlement(note.id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    reload();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200"
        >
          New {kind === 'customer' ? 'Credit Note' : 'Vendor Credit'}
        </button>
        {!fixedKind && (['customer', 'vendor'] as CreditNoteKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${kind === k ? 'bg-brand-300 text-brand-900' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
          >
            {k === 'customer' ? 'Customer Credit Notes' : 'Vendor Credits'}
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-500">
        {kind === 'customer'
          ? 'Reverses a sale and the GST/HST charged on it, leaving a credit the customer can put against an open invoice or take back as a refund.'
          : 'A credit received from a vendor — reverses the expense and the input tax credit claimed, and can settle an open bill or come back as cash.'}
      </p>

      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="rounded border border-gray-200 bg-white p-3">
        {notes.length === 0 ? (
          <p className="text-sm text-gray-400">No {kind === 'customer' ? 'credit notes' : 'vendor credits'} yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="py-1">Number</th>
                <th className="py-1">Date</th><EnteredTh className="py-1" />
                <th className="py-1">{kind === 'customer' ? 'Customer' : 'Vendor'}</th>
                <th className="py-1 text-right">Amount</th>
                <th className="py-1">Status</th>
                <th className="py-1">Settle</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((note) => (
                <tr key={note.id} className="border-t border-gray-100 align-top">
                  <td className="py-2 font-medium text-gray-700">{note.creditNoteNumber}</td>
                  <td className="py-2 text-gray-500">{note.creditNoteDate}</td><EnteredTd at={note.createdAt} className="py-2" />
                  <td className="py-2 text-gray-700">{contactName(note.contactId)}</td>
                  <td className="py-2 text-right">
                    <Money cents={note.totalCents} />
                    {note.appliedCents > 0 && note.status === 'open' && (
                      <div className="text-xs text-gray-500">
                        <Money cents={note.remainingCents} /> remaining
                      </div>
                    )}
                  </td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[note.status]}`}>
                      {note.status === 'open' && note.appliedCents > 0 ? 'partly applied' : note.status}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="mb-1 flex gap-2">
                      <JournalEntryLink id={note.creditJournalEntryId} label="Credit GL" />
                      <JournalEntryLink id={note.refundJournalEntryId} label="Refund GL" />
                    </div>
                    {note.status === 'open' ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            disabled={busy}
                            value={applyAmounts[note.id] ?? ''}
                            onChange={(e) => setApplyAmounts((current) => ({ ...current, [note.id]: e.target.value }))}
                            placeholder={`Up to ${(note.remainingCents / 100).toFixed(2)}`}
                            aria-label={`Amount of ${note.creditNoteNumber} to apply`}
                            title="Leave blank to apply as much as possible"
                            className="w-28 rounded border border-gray-300 px-2 py-1 text-xs"
                          />
                          <select
                            disabled={busy}
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) handleApply(note, Number(e.target.value));
                            }}
                            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                          >
                            <option value="">Apply to…</option>
                            {kind === 'customer'
                              ? openInvoices
                                  .filter((i) => i.customerId === note.contactId)
                                  .map((i) => (
                                    <option key={i.id} value={i.id}>
                                      {i.invoiceNumber} — ${(i.balanceDueCents / 100).toFixed(2)} due
                                    </option>
                                  ))
                              : openBills
                                  .filter((b) => b.vendorId === note.contactId)
                                  .map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.billNumber ? `Vendor invoice ${b.billNumber}` : 'Vendor bill'} — ${(b.balanceDueCents / 100).toFixed(2)} due
                                    </option>
                                  ))}
                          </select>
                        </div>
                        <select
                          disabled={busy}
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) handleRefund(note, Number(e.target.value));
                          }}
                          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="">{kind === 'customer' ? 'Refund from…' : 'Deposit into…'}</option>
                          {bankAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        {note.appliedCents > 0 ? (
                          <button type="button" disabled={busy} onClick={() => handleUndoSettlement(note)} className="text-left text-xs font-medium text-amber-700 hover:underline disabled:opacity-50">
                            Undo latest application
                          </button>
                        ) : (
                          <button type="button" disabled={busy} onClick={() => handleDelete(note)} className="text-left text-xs text-gray-400 hover:text-red-600">
                            Delete
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-gray-400">{note.status === 'applied' ? appliedTargetLabel(note.appliedToId) : 'Refunded'}</span>
                        <button type="button" disabled={busy} onClick={() => handleUndoSettlement(note)} className="text-left text-xs font-medium text-amber-700 hover:underline disabled:opacity-50">
                          Undo Settlement
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreditNoteFormModal
        open={formOpen}
        kind={kind}
        contacts={contacts}
        accounts={accounts}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
      />
    </div>
  );
}
