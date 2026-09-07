import { formatBusinessNumber, formatSin, isValidBusinessNumber, isValidSin } from '@shared/domain/contacts/identifiers';
import { useEffect, useState } from 'react';
import type { Account, Shareholder } from '@shared/domain/types';
import { Modal } from '../../components/Modal';
import { Combobox } from '../../components/Combobox';
import { capitalizeWords, suggestOnBlur } from '../../utils/textCase';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { recordSuggestion, suggestionListId } from '../../utils/textSuggestions';
import { AccountFormModal } from '../chart-of-accounts/AccountFormModal';
import { maskBusinessNumber, maskPhone, maskSin } from '@shared/domain/forms/fieldMasks';

export function ShareholderFormModal({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: Shareholder | null;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [sin, setSin] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [loanAccountId, setLoanAccountId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(editing?.name ?? '');
    setEmail(editing?.email ?? '');
    setPhone(editing?.phone ?? '');
    setAddress(editing?.address ?? '');
    setNotes(editing?.notes ?? '');
    setSin(editing?.sin ?? '');
    setBusinessNumber(editing?.businessNumber ?? '');
    setLoanAccountId(editing?.loanAccountId ?? null);
    window.api.accounts.list({ activeOnly: true }).then((r) => r.ok && setAccounts(r.data));
  }, [open, editing]);

  const liabilityAccounts = accounts.filter((a) => a.accountType === 'Liability');
  // Best-effort match to an existing "Due to Shareholder(s)" main account, so quick-adding a
  // loan account for this shareholder can default straight to being a sub-account of it (same
  // pattern as "RBC Visa" under "Visa") instead of asking the user to hunt for the right parent.
  const dueToShareholderAccount = liabilityAccounts.find((a) => a.parentId == null && /shareholder/i.test(a.name)) ?? null;

  async function handleSave(after: 'close' | 'next') {
    if (sin.trim() && !isValidSin(sin)) return setError('That SIN is not valid — it must be nine digits and pass the CRA check digit. Re-enter it from the card.');
    if (businessNumber.trim() && !isValidBusinessNumber(businessNumber)) return setError('That Business Number is not valid — it is nine digits, optionally followed by a program account such as RC0001.');
    setBusy(true);
    setError(null);
    const result = await window.api.shareholders.save({
      id: editing?.id,
      name: capitalizeWords(name),
      email: email || null,
      phone: phone || null,
      address: address || null,
      notes: notes || null,
      sin: sin ? formatSin(sin) : null,
      businessNumber: businessNumber ? formatBusinessNumber(businessNumber) : null,
      loanAccountId,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onSaved();
    if (after === 'close' || editing) return onClose();
    setName(''); setEmail(''); setPhone(''); setAddress(''); setNotes(''); setSin(''); setBusinessNumber(''); setLoanAccountId(null);
  }

  return (
    <Modal fullScreen
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Shareholder' : 'Add Shareholder'}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => handleSave('close')}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Save &amp; Close
          </button>
          {!editing && <button type="button" disabled={busy || !name.trim()} onClick={() => handleSave('next')} className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Save &amp; Next</button>}
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <label className="block text-sm">
          <span className="text-gray-600">Name</span>
          <input
            list={suggestionListId('shareholder-name')}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={suggestOnBlur('shareholder-name', setName)}
          />
          <SuggestionDatalist fieldKey="shareholder-name" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Email</span>
            <input
              list={suggestionListId('email-address')}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={(e) => recordSuggestion('email-address', e.target.value)}
            />
            <SuggestionDatalist fieldKey="email-address" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Phone</span>
            <input
              list={suggestionListId('phone-number')}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              onBlur={(e) => recordSuggestion('phone-number', e.target.value)}
            />
            <SuggestionDatalist fieldKey="phone-number" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-gray-600">Address</span>
          <input
            list={suggestionListId('address-line1')}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onBlur={suggestOnBlur('address-line1', setAddress)}
          />
          <SuggestionDatalist fieldKey="address-line1" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">SIN (individual)</span>
            <input inputMode="numeric" maxLength={11} placeholder="123 456 789" className={`mt-1 w-full rounded border px-2 py-1.5 ${sin.trim() && !isValidSin(sin) ? 'border-amber-400' : 'border-gray-300'}`} value={sin} onChange={(e) => setSin(maskSin(e.target.value))} onBlur={(e) => setSin(formatSin(e.target.value))} />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Business Number (company)</span>
            <input maxLength={16} placeholder="123456789 RC0001" className={`mt-1 w-full rounded border px-2 py-1.5 ${businessNumber.trim() && !isValidBusinessNumber(businessNumber) ? 'border-amber-400' : 'border-gray-300'}`} value={businessNumber} onChange={(e) => setBusinessNumber(maskBusinessNumber(e.target.value))} onBlur={(e) => setBusinessNumber(formatBusinessNumber(e.target.value))} />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-gray-600">Notes</span>
          <textarea
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={(e) => {
              const capitalized = capitalizeWords(e.target.value);
              setNotes(capitalized);
              recordSuggestion('shareholder-notes', capitalized);
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Shareholder Loan Account (optional)</span>
          <Combobox
            options={liabilityAccounts.map((a) => ({ value: String(a.id), label: a.name }))}
            value={loanAccountId !== null ? String(loanAccountId) : null}
            onChange={(v) => setLoanAccountId(v ? Number(v) : null)}
            placeholder="Link the Liability account tracking what's owed to this shareholder…"
            onAddNew={() => setShowAddAccount(true)}
            addNewLabel="+ Add New Account"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Tracks what the company owes this specific shareholder — e.g. "Due to {name || 'Shareholder'}" as a sub-account of "Due to
            Shareholder", same as "RBC Visa" under "Visa".
          </p>
        </label>
      </div>

      <AccountFormModal
        open={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        onSaved={(newAccount) => {
          setAccounts((prev) => [...prev, newAccount]);
          setLoanAccountId(newAccount.id);
        }}
        account={null}
        initialParent={dueToShareholderAccount}
      />
    </Modal>
  );
}
