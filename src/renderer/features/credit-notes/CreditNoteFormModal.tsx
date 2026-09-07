import { useEffect, useState } from 'react';
import type { Account, Contact, CreditNoteKind, TaxCode } from '@shared/domain/types';
import { Modal } from '../../components/Modal';
import { CurrencyInput } from '../../components/CurrencyInput';
import { Money } from '../../components/Money';
import { CustomTaxRateInput } from '../../components/CustomTaxRateInput';
import { suggestTaxCents } from '@shared/domain/ledger/computeTaxSplit';
import { Combobox } from '../../components/Combobox';
import { AccountCombobox } from '../../components/AccountCombobox';
import { ContactFormModal } from '../contacts/ContactFormModal';
import { purchaseLineAccountPickerOptions, saleLineAccountPickerOptions } from '../../utils/accountLabel';
import { DATE_MAX, DATE_MIN, clampIsoDate } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

/** MealsHST is deliberately absent on the customer side — the 50% restriction is a purchase-side
 * ITC rule, and buildCreditNoteJournalLines rejects it there. */
const CUSTOMER_TAX_CODES: { value: string; label: string }[] = [
  { value: '', label: '—' },
  { value: 'HST', label: 'HST 13%' },
  { value: 'GST', label: 'GST 5%' },
  { value: 'USTax', label: 'US Tax 8%' },
  { value: 'NonHST', label: 'No HST' },
  { value: 'Manual', label: 'Custom rate' },
];
const VENDOR_TAX_CODES: { value: string; label: string }[] = [...CUSTOMER_TAX_CODES, { value: 'MealsHST', label: 'Meals & Ent. (50% ITC)' }];

interface LineDraft {
  description: string;
  quantity: number;
  unitPriceCents: number;
  categoryAccountId: number | null;
  taxCode: string;
  manualHstCents: number;
}

function emptyLine(): LineDraft {
  return { description: '', quantity: 1, unitPriceCents: 0, categoryAccountId: null, taxCode: '', manualHstCents: 0 };
}

function todayIso(): string {
  return localIsoDate();
}

export function CreditNoteFormModal({
  open,
  kind,
  contacts,
  accounts,
  onClose,
  onSaved,
}: {
  open: boolean;
  kind: CreditNoteKind;
  contacts: Contact[];
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [contactId, setContactId] = useState<number | null>(null);
  const [creditNoteNumber, setCreditNoteNumber] = useState('');
  const [creditNoteDate, setCreditNoteDate] = useState(todayIso());
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableContacts, setAvailableContacts] = useState<Contact[]>(contacts);
  const [availableAccounts, setAvailableAccounts] = useState<Account[]>(accounts);
  const [showAddContact, setShowAddContact] = useState(false);

  // A customer credit reverses whatever the invoice line credited (revenue, a deposit, a rebilled
  // cost); a vendor credit reverses an expense or an asset purchase — so the category dropdown
  // offers the accounts that document actually posts to.
  const categoryOptions = kind === 'customer' ? saleLineAccountPickerOptions(availableAccounts) : purchaseLineAccountPickerOptions(availableAccounts);
  const taxCodes = kind === 'customer' ? CUSTOMER_TAX_CODES : VENDOR_TAX_CODES;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAvailableContacts(contacts);
    setAvailableAccounts(accounts);
    setContactId(null);
    setCreditNoteDate(todayIso());
    setMemo('');
    setLines([emptyLine()]);
    window.api.creditNotes.nextNumber(kind).then((r) => {
      if (r.ok) setCreditNoteNumber(r.data);
    });
  }, [open, kind]);

  function patchLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const totalBaseCents = lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitPriceCents), 0);
  const lineTaxCents = (line: LineDraft) => {
    const baseCents = Math.round(line.quantity * line.unitPriceCents);
    if (line.taxCode === 'Manual') return line.manualHstCents;
    return suggestTaxCents((line.taxCode || null) as TaxCode | null, baseCents);
  };
  const totalTaxCents = lines.reduce((sum, line) => sum + lineTaxCents(line), 0);
  const grandTotalCents = totalBaseCents + totalTaxCents;
  const canSave = contactId !== null && creditNoteNumber.trim() !== '' && lines.every((l) => l.description.trim() && l.categoryAccountId !== null && Math.round(l.quantity * l.unitPriceCents) > 0);

  function prepareNextCreditNote() {
    setContactId(null);
    setCreditNoteDate(todayIso());
    setMemo('');
    setLines([emptyLine()]);
    window.api.creditNotes.nextNumber(kind).then((r) => {
      if (r.ok) setCreditNoteNumber(r.data);
    });
  }

  async function handleSave(after: 'close' | 'next') {
    if (contactId === null) return;
    setBusy(true);
    setError(null);
    const result = await window.api.creditNotes.create({
      kind,
      contactId,
      creditNoteNumber: creditNoteNumber.trim(),
      creditNoteDate,
      memo: memo.trim() || null,
      lines: lines.map((l) => ({
        description: l.description.trim(),
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        categoryAccountId: l.categoryAccountId,
        taxCode: (l.taxCode || null) as TaxCode | null,
        manualHstCents: l.taxCode === 'Manual' ? l.manualHstCents : null,
      })),
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onSaved();
    if (after === 'close') return onClose();
    prepareNextCreditNote();
  }

  return (
    <>
    <Modal fullScreen
      open={open}
      onClose={onClose}
      title={kind === 'customer' ? 'New Credit Note' : 'New Vendor Credit'}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !canSave}
            onClick={() => handleSave('close')}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Save &amp; Close
          </button>
          <button
            type="button"
            disabled={busy || !canSave}
            onClick={() => handleSave('next')}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Save &amp; Next
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">{kind === 'customer' ? 'Customer' : 'Vendor'}</span>
            <Combobox
              options={availableContacts.filter((contact) => contact.isActive).map((contact) => ({ value: String(contact.id), label: contact.name }))}
              value={contactId === null ? null : String(contactId)}
              onChange={(value) => setContactId(value ? Number(value) : null)}
              placeholder="Select…"
              onAddNew={() => setShowAddContact(true)}
              addNewLabel={kind === 'customer' ? '+ Add New Customer' : '+ Add New Vendor'}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Number</span>
            <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={creditNoteNumber} onChange={(e) => setCreditNoteNumber(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Date</span>
            <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={creditNoteDate} onChange={(e) => setCreditNoteDate(clampIsoDate(e.target.value))} />
          </label>
        </div>

        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="rounded border border-gray-100 bg-gray-50/50 p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="Description"
                  value={line.description}
                  onChange={(e) => patchLine(i, { description: e.target.value })}
                />
                <AccountCombobox
                  options={categoryOptions}
                  value={line.categoryAccountId === null ? null : String(line.categoryAccountId)}
                  onChange={(value) => patchLine(i, { categoryAccountId: value ? Number(value) : null })}
                  placeholder={kind === 'customer' ? 'Revenue account…' : 'Expense account…'}
                  accounts={availableAccounts}
                  initialType={kind === 'customer' ? 'Revenue' : 'Expense'}
                  addNewLabel={kind === 'customer' ? '+ New revenue account' : '+ New expense category'}
                  onAccountCreated={(created) => {
                    setAvailableAccounts((previous) => [...previous, created]);
                    patchLine(i, { categoryAccountId: created.id });
                  }}
                />
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                <label className="block text-xs text-gray-500">
                  Qty
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    value={line.quantity}
                    onChange={(e) => patchLine(i, { quantity: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="block text-xs text-gray-500">
                  Unit price
                  <div className="mt-0.5">
                    <CurrencyInput valueCents={line.unitPriceCents} onChange={(cents) => patchLine(i, { unitPriceCents: cents })} />
                  </div>
                </label>
                <label className="block text-xs text-gray-500">
                  Tax
                  <select
                    className="mt-0.5 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                    value={line.taxCode}
                    onChange={(e) => patchLine(i, { taxCode: e.target.value })}
                  >
                    {taxCodes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                {line.taxCode === 'Manual' ? (
                  <div className="block text-xs text-gray-500">
                    Custom tax
                    <div className="mt-0.5">
                      <CustomTaxRateInput
                        baseCents={Math.round(line.quantity * line.unitPriceCents)}
                        taxCents={line.manualHstCents}
                        onTaxCentsChange={(cents) => patchLine(i, { manualHstCents: cents })}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-end justify-end pb-1 text-sm text-gray-600">
                    <span className="text-xs text-gray-400">Tax</span>
                    <Money cents={lineTaxCents(line)} />
                  </div>
                )}
              </div>
              {lines.length > 1 && (
                <button type="button" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} className="mt-1 text-xs text-gray-400 hover:text-red-600">
                  Remove line
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])} className="text-xs text-brand-600 hover:underline">
            + Add line
          </button>
        </div>

        <div className="space-y-1 border-t border-gray-200 pt-2 text-sm text-gray-700">
          <div className="flex justify-between"><span>Subtotal before tax</span><Money cents={totalBaseCents} /></div>
          <div className="flex justify-between"><span>GST/HST</span><Money cents={totalTaxCents} /></div>
          <div className="flex justify-between border-t border-gray-100 pt-1 font-semibold"><span>Credit total</span><Money cents={grandTotalCents} /></div>
        </div>

        <label className="block text-sm">
          <span className="text-gray-600">Memo (optional)</span>
          <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
      </div>
    </Modal>
    <ContactFormModal
      open={showAddContact}
      onClose={() => setShowAddContact(false)}
      editing={null}
      kind={kind === 'customer' ? 'customer' : 'vendor'}
      onSaved={(contact) => {
        setAvailableContacts((previous) => [...previous, contact]);
        setContactId(contact.id);
        setShowAddContact(false);
      }}
    />
    </>
  );
}
