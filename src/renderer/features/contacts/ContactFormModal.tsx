import { PaymentTermsSelect } from '../../components/PaymentTermsSelect';
import type { PaymentTerm } from '@shared/domain/contacts/paymentTerms';
import { useEffect, useState } from 'react';
import type { Account, Contact } from '@shared/domain/types';
import { Modal } from '../../components/Modal';
import { Combobox } from '../../components/Combobox';
import { capitalizeWords, suggestOnBlur } from '../../utils/textCase';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { recordSuggestion, suggestionListId } from '../../utils/textSuggestions';
import { buttonClass } from '../../components/Button';
import { StructuredAddressFields } from '../../components/StructuredAddressFields';
import { formatBusinessNumber, formatPhone, formatSin, isValidBusinessNumber, isValidEmail, isValidSin } from '@shared/domain/contacts/identifiers';
import { duplicateNameRefusalReason } from '@shared/domain/contacts/contactRules';
import { maskBusinessNumber, maskPhone, maskSin } from '@shared/domain/forms/fieldMasks';

export function ContactFormModal({
  open,
  onClose,
  onSaved,
  editing,
  kind,
}: {
  open: boolean;
  onClose: () => void;
  /** Receives the created/updated contact so a caller that opened this modal for a quick inline
   * add (e.g. from a Bill or Invoice's vendor/customer picker) can immediately select it. */
  onSaved: (contact: Contact) => void;
  editing: Contact | null;
  kind: 'customer' | 'vendor';
}) {
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [website, setWebsite] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [isT4aContractor, setIsT4aContractor] = useState(false);
  const [t4aSin, setT4aSin] = useState('');
  const [t4aBusinessNumber, setT4aBusinessNumber] = useState('');
  const [isT5018Contractor, setIsT5018Contractor] = useState(false);
  const [defaultExpenseAccountId, setDefaultExpenseAccountId] = useState<number | null>(null);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm | null>(null);
  const [lateInterest, setLateInterest] = useState('');
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  /** Every existing contact of this kind, so a name that already exists is flagged while it is
   * being typed rather than refused after the whole form is filled in. */
  const [existing, setExisting] = useState<{ id: number; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(editing?.name ?? '');
    setCompanyName(editing?.companyName ?? '');
    setContactName(editing?.contactName ?? '');
    setWebsite(editing?.website ?? '');
    setShippingAddress(editing?.shippingAddress ?? '');
    setEmail(editing?.email ?? '');
    setPhone(editing?.phone ?? '');
    setAddress(editing?.address ?? '');
    setNotes(editing?.notes ?? '');
    setIsT4aContractor(editing?.isT4aContractor ?? false);
    setT4aSin(editing?.t4aSin ?? '');
    setT4aBusinessNumber(editing?.t4aBusinessNumber ?? '');
    setIsT5018Contractor(editing?.isT5018Contractor ?? false);
    setDefaultExpenseAccountId(editing?.defaultExpenseAccountId ?? null);
    setPaymentTerms(editing?.paymentTerms ?? null);
    setLateInterest(editing?.lateInterestRatePercent != null ? String(editing.lateInterestRatePercent) : '');
    if (kind === 'vendor') {
      window.api.accounts.list({ activeOnly: true, accountType: 'Expense' }).then((r) => r.ok && setExpenseAccounts(r.data));
    }
    (kind === 'customer' ? window.api.customers : window.api.vendors).list().then((r) => r.ok && setExisting(r.data.map((c) => ({ id: c.id, name: c.name }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const duplicateHint = name.trim() ? duplicateNameRefusalReason(kind, name, existing, editing?.id ?? null) : null;

  function prepareNextContact() {
    setName('');
    setCompanyName('');
    setContactName('');
    setWebsite('');
    setShippingAddress('');
    setEmail('');
    setPhone('');
    setAddress('');
    setNotes('');
    setIsT4aContractor(false);
    setT4aSin('');
    setT4aBusinessNumber('');
    setIsT5018Contractor(false);
    setDefaultExpenseAccountId(null);
    setPaymentTerms(null);
  }

  async function handleSave(after: 'close' | 'next') {
    // Refused here, before the round trip, with the field named — the same checks the slips and
    // the CRA apply later, when a wrong digit is far more expensive to find.
    if (email.trim() && !isValidEmail(email)) return setError('That email address does not look right — check it for a missing @ or domain.');
    if ((isT4aContractor || isT5018Contractor) && t4aSin.trim() && !isValidSin(t4aSin)) return setError('That SIN is not valid — it must be nine digits and pass the CRA check digit. Re-enter it from the card.');
    if ((isT4aContractor || isT5018Contractor) && t4aBusinessNumber.trim() && !isValidBusinessNumber(t4aBusinessNumber)) return setError('That Business Number is not valid — it is nine digits, optionally followed by a program account such as RT0001.');
    if (duplicateHint) return setError(duplicateHint);
    setBusy(true);
    setError(null);
    // Capitalized here (not just onBlur) so Save right after typing the last field still saves
    // the capitalized value — see the note in AccountFormModal.handleSave for why.
    const payload = {
      id: editing?.id,
      name: capitalizeWords(name),
      companyName: companyName ? capitalizeWords(companyName) : null,
      contactName: contactName ? capitalizeWords(contactName) : null,
      website: website.trim() || null,
      shippingAddress: shippingAddress.trim() || null,
      email: email.trim().toLowerCase() || null,
      phone: phone ? formatPhone(phone) : null,
      address: address.trim() || null,
      notes: notes || null,
      isT4aContractor,
      t4aSin: t4aSin ? formatSin(t4aSin) : null,
      t4aBusinessNumber: t4aBusinessNumber ? formatBusinessNumber(t4aBusinessNumber) : null,
      isT5018Contractor,
      defaultExpenseAccountId,
      paymentTerms,
      lateInterestRatePercent: kind === 'customer' && lateInterest.trim() !== '' ? Number(lateInterest) : null,
    };
    const api = kind === 'customer' ? window.api.customers : window.api.vendors;
    const result = await api.save(payload);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onSaved(result.data);
    if (after === 'close' || editing) return onClose();
    prepareNextContact();
  }

  return (
    <Modal fullScreen
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${kind === 'customer' ? 'Customer' : 'Vendor'}` : `Add ${kind === 'customer' ? 'Customer' : 'Vendor'}`}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass('secondary')}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => handleSave('close')}
            className={buttonClass('primary')}
          >
            Save &amp; Close
          </button>
          {!editing && (
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={() => handleSave('next')}
              className={buttonClass('secondary')}
            >
              Save &amp; Next
            </button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <label className="block text-sm">
          <span className="text-gray-600">Display Name *</span>
          <input
            name="contact-name"
            autoFocus
            autoComplete="organization"
            list={suggestionListId('contact-name')}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={suggestOnBlur('contact-name', setName)}
          />
          <SuggestionDatalist fieldKey="contact-name" />
          {duplicateHint ? (
            <span role="status" className="mt-1 block text-[11px] text-amber-700">{duplicateHint}</span>
          ) : (
            <span className="mt-1 block text-[11px] text-gray-400">The searchable name shown on invoices, bills and reports.</span>
          )}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Company / Legal Name</span>
            <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Primary Contact</span>
            <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Email</span>
            <input
              name="contact-email"
              type="email"
              autoComplete="email"
              list={suggestionListId('email-address')}
              className={`mt-1 w-full rounded border px-2 py-1.5 ${email.trim() && !isValidEmail(email) ? 'border-amber-400' : 'border-gray-300'}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={(e) => recordSuggestion('email-address', e.target.value.trim().toLowerCase())}
            />
            <SuggestionDatalist fieldKey="email-address" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Phone</span>
            <input
              name="contact-phone"
              type="tel"
              autoComplete="tel"
              list={suggestionListId('phone-number')}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={phone}
              placeholder="(416) 555-0100"
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              onBlur={(e) => {
                const formatted = formatPhone(e.target.value);
                setPhone(formatted);
                recordSuggestion('phone-number', formatted);
              }}
            />
            <SuggestionDatalist fieldKey="phone-number" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-gray-600">Website</span>
          <input type="url" autoComplete="url" placeholder="https://" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
        <StructuredAddressFields value={address} onChange={setAddress} legend={kind === 'customer' ? 'Billing / mailing address' : 'Vendor mailing address'} namePrefix={`${kind}-mailing`} />
        {kind === 'customer' && (
          <details className="rounded border border-gray-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">Shipping address {shippingAddress ? '— saved' : '(if different)'}</summary>
            <div className="mt-3"><StructuredAddressFields value={shippingAddress} onChange={setShippingAddress} legend="Ship-to address" namePrefix="customer-shipping" /></div>
          </details>
        )}
        <label className="block text-sm">
          <span className="text-gray-600">Notes</span>
          <textarea
            name="contact-notes"
            autoComplete="on"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={(e) => {
              const capitalized = capitalizeWords(e.target.value);
              setNotes(capitalized);
              recordSuggestion('contact-notes', capitalized);
            }}
          />
        </label>

        {kind === 'vendor' && (
          <div className="rounded border border-gray-200 bg-gray-50 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isT4aContractor} onChange={(e) => setIsT4aContractor(e.target.checked)} />
              <span className="text-gray-600">Report payments to this vendor on a T4A (Box 048 — Fees for services)</span>
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isT5018Contractor} onChange={(e) => setIsT5018Contractor(e.target.checked)} />
              <span className="text-gray-600">Report payments to this vendor on a T5018 (construction subcontractor — Box 22)</span>
            </label>
            {(isT4aContractor || isT5018Contractor) && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-gray-600">SIN (individual)</span>
                  <input inputMode="numeric" maxLength={11} placeholder="123 456 789" className={`mt-1 w-full rounded border px-2 py-1.5 ${t4aSin.trim() && !isValidSin(t4aSin) ? 'border-amber-400' : 'border-gray-300'}`} value={t4aSin} onChange={(e) => setT4aSin(maskSin(e.target.value))} onBlur={(e) => setT4aSin(formatSin(e.target.value))} />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Business Number (company)</span>
                  <input maxLength={16} placeholder="123456789 RT0001" className={`mt-1 w-full rounded border px-2 py-1.5 ${t4aBusinessNumber.trim() && !isValidBusinessNumber(t4aBusinessNumber) ? 'border-amber-400' : 'border-gray-300'}`} value={t4aBusinessNumber} onChange={(e) => setT4aBusinessNumber(maskBusinessNumber(e.target.value))} onBlur={(e) => setT4aBusinessNumber(formatBusinessNumber(e.target.value))} />
                </label>
              </div>
            )}
          </div>
        )}

        {/* Terms belong on both sides: what this customer is normally given, and what this vendor
            normally gives us. Only a default — each invoice or bill keeps whatever was agreed on it. */}
        <label className="block text-sm">
          <span className="text-gray-600">Payment Terms (optional)</span>
          <PaymentTermsSelect
            value={paymentTerms}
            onChange={(term) => setPaymentTerms(term)}
            emptyLabel="— no default —"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            {kind === 'customer'
              ? "Pre-fills the terms on a new invoice for this customer, which is what sets its due date. Changing it later does not move the due date of an invoice already sent."
              : "Pre-fills the terms on a new bill from this vendor. A vendor who really gives you 60 days should not be left on Net 30, or the payables ageing will read as late when it is not."}
          </p>
          {kind === 'customer' && (
            <label className="mt-2 block text-sm">
              <span className="text-gray-600">Late-payment interest, % per year (optional)</span>
              <input inputMode="decimal" className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" value={lateInterest} onChange={(e) => setLateInterest(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="e.g. 18" />
              <p className="mt-1 text-[11px] text-gray-400">Only what the engagement letter or invoice terms already say. Simple interest on the unpaid balance from the day after the due date; charged as its own invoice from the customer page, never automatically. Example: $1,000 overdue 30 days at 18% is $14.79.</p>
            </label>
          )}
        </label>

        {kind === 'vendor' && (
          <label className="block text-sm">
            <span className="text-gray-600">Default Expense Category (optional)</span>
            <Combobox
              options={expenseAccounts.map((a) => ({ value: String(a.id), label: a.name }))}
              value={defaultExpenseAccountId !== null ? String(defaultExpenseAccountId) : null}
              onChange={(v) => setDefaultExpenseAccountId(v ? Number(v) : null)}
              placeholder="Choose account…"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Pre-fills a new Bill's category the first time this vendor is picked — once a bill has been entered, its own category
              takes priority over this default.
            </p>
          </label>
        )}
      </div>
    </Modal>
  );
}
