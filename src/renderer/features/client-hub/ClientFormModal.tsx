import { useEffect, useState } from 'react';
import type {
  ClientCommentEntry,
  ClientGender,
  ClientRecord,
  DependentInfo,
  EmploymentStatus,
  HomeOwnership,
  HstFilingFrequency,
  InsuranceProductType,
  MaritalStatus,
  OutstandingDocumentItem,
  TaxReturnType,
} from '@shared/domain/types';
import { Modal } from '../../components/Modal';
import { capitalizeWords, suggestOnBlur } from '../../utils/textCase';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { recordSuggestion, suggestionListId } from '../../utils/textSuggestions';
import { StructuredAddressFields } from '../../components/StructuredAddressFields';
import { DATE_MAX, DATE_MIN, clampIsoDate, maskPhone, maskSin } from '@shared/domain/forms/fieldMasks';
import { localIsoDate } from '@shared/domain/dates/localDate';

const HST_FREQUENCIES: HstFilingFrequency[] = ['Monthly', 'Quarterly', 'Annually', 'None'];
const MARITAL_STATUSES: MaritalStatus[] = ['Single', 'Married', 'Common-Law', 'Separated', 'Divorced', 'Widowed'];
const EMPLOYMENT_STATUSES: EmploymentStatus[] = ['Employed', 'Self-Employed', 'Both', 'Not Employed'];
const HOME_OWNERSHIP_TYPES: HomeOwnership[] = ['Own', 'Lease'];
const RETURN_TYPES: TaxReturnType[] = ['T1', 'T2', 'Both'];
const GENDERS: ClientGender[] = ['Male', 'Female', 'Other', 'Unspecified'];
const INSURANCE_PRODUCT_TYPES: InsuranceProductType[] = [
  'Life',
  'Critical Illness',
  'Disability',
  'Super Visa',
  'Visitor Insurance',
  'RRSP',
  'TFSA',
  'FHSA',
  'RESP',
];

function newId(): string {
  return crypto.randomUUID();
}

function todayIso(): string {
  return localIsoDate();
}

export function ClientFormModal({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: ClientRecord | null;
}) {
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [companyFilePath, setCompanyFilePath] = useState<string>('');
  const [fiscalMonth, setFiscalMonth] = useState(12);
  const [fiscalDay, setFiscalDay] = useState(31);
  const [hstFrequency, setHstFrequency] = useState<HstFilingFrequency>('Quarterly');
  const [notes, setNotes] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Personal taxpayer details ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [address, setAddress] = useState('');
  const [sin, setSin] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<ClientGender>('Unspecified');
  const [maritalStatus, setMaritalStatus] = useState<MaritalStatus | ''>('');
  const [spouseFirstName, setSpouseFirstName] = useState('');
  const [spouseLastName, setSpouseLastName] = useState('');
  const [spouseSin, setSpouseSin] = useState('');
  const [spouseDateOfBirth, setSpouseDateOfBirth] = useState('');
  const [dependents, setDependents] = useState<DependentInfo[]>([]);
  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatus | ''>('');
  const [homeOwnership, setHomeOwnership] = useState<HomeOwnership | ''>('');
  const [returnType, setReturnType] = useState<TaxReturnType | ''>('');
  const [returnCompleted, setReturnCompleted] = useState(false);
  const [returnFiled, setReturnFiled] = useState(false);
  const [outstandingDocuments, setOutstandingDocuments] = useState<OutstandingDocumentItem[]>([]);
  const [newDocLabel, setNewDocLabel] = useState('');
  const [insuranceTypes, setInsuranceTypes] = useState<InsuranceProductType[]>([]);
  const [policyExpiryDate, setPolicyExpiryDate] = useState('');
  const [comments, setComments] = useState<ClientCommentEntry[]>([]);
  const [newCommentText, setNewCommentText] = useState('');

  const isSpouseRelevant = maritalStatus === 'Married' || maritalStatus === 'Common-Law';

  useEffect(() => {
    if (!open) return;
    setError(null);
    window.api.company.listRecent().then((r) => r.ok && setRecents(r.data));
    setClientName(editing?.clientName ?? '');
    setPhone(editing?.phone ?? '');
    setEmail(editing?.email ?? '');
    setCompanyFilePath(editing?.companyFilePath ?? '');
    setFiscalMonth(editing?.fiscalYearEndMonth ?? 12);
    setFiscalDay(editing?.fiscalYearEndDay ?? 31);
    setHstFrequency(editing?.hstFilingFrequency ?? 'Quarterly');
    setNotes(editing?.notes ?? '');

    setFirstName(editing?.firstName ?? '');
    setLastName(editing?.lastName ?? '');
    setAddress(editing?.address ?? '');
    setSin(editing?.sin ?? '');
    setDateOfBirth(editing?.dateOfBirth ?? '');
    setGender(editing?.gender ?? 'Unspecified');
    setMaritalStatus(editing?.maritalStatus ?? '');
    setSpouseFirstName(editing?.spouseFirstName ?? '');
    setSpouseLastName(editing?.spouseLastName ?? '');
    setSpouseSin(editing?.spouseSin ?? '');
    setSpouseDateOfBirth(editing?.spouseDateOfBirth ?? '');
    setDependents(editing?.dependents ?? []);
    setEmploymentStatus(editing?.employmentStatus ?? '');
    setHomeOwnership(editing?.homeOwnership ?? '');
    setReturnType(editing?.returnType ?? '');
    setReturnCompleted(editing?.returnCompleted ?? false);
    setReturnFiled(editing?.returnFiled ?? false);
    setOutstandingDocuments(editing?.outstandingDocuments ?? []);
    setNewDocLabel('');
    setInsuranceTypes(editing?.insuranceTypes ?? []);
    setPolicyExpiryDate(editing?.policyExpiryDate ?? '');
    setComments(editing?.comments ?? []);
    setNewCommentText('');
  }, [open, editing]);

  function toggleInsuranceType(type: InsuranceProductType) {
    setInsuranceTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  function addComment() {
    if (!newCommentText.trim()) return;
    setComments((prev) => [{ id: newId(), date: todayIso(), text: capitalizeWords(newCommentText.trim()) }, ...prev]);
    setNewCommentText('');
  }
  function removeComment(id: string) {
    setComments((prev) => prev.filter((c) => c.id !== id));
  }

  function addDependent() {
    setDependents((prev) => [...prev, { id: newId(), firstName: '', lastName: '', dateOfBirth: null }]);
  }
  function updateDependent(id: string, patch: Partial<DependentInfo>) {
    setDependents((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }
  function removeDependent(id: string) {
    setDependents((prev) => prev.filter((d) => d.id !== id));
  }

  function addOutstandingDocument() {
    if (!newDocLabel.trim()) return;
    setOutstandingDocuments((prev) => [...prev, { id: newId(), label: capitalizeWords(newDocLabel.trim()), received: false }]);
    setNewDocLabel('');
  }
  function toggleOutstandingDocument(id: string) {
    setOutstandingDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, received: !d.received } : d)));
  }
  function removeOutstandingDocument(id: string) {
    setOutstandingDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    // Capitalized here rather than relying solely on each field's onBlur — clicking Save right
    // after typing the last field fires blur and click in the same event batch, so this
    // component's own state wouldn't reflect the blur's capitalization yet by the time this
    // closure reads it. Capitalizing the raw values directly at save time is correct regardless.
    const result = await window.api.clients.save({
      id: editing?.id,
      clientName: capitalizeWords(clientName),
      phone: phone || null,
      email: email || null,
      companyFilePath: companyFilePath || null,
      fiscalYearEndMonth: fiscalMonth,
      fiscalYearEndDay: fiscalDay,
      hstFilingFrequency: hstFrequency,
      notes: capitalizeWords(notes),

      firstName: firstName ? capitalizeWords(firstName) : null,
      lastName: lastName ? capitalizeWords(lastName) : null,
      address: address.trim() || null,
      sin: sin || null,
      dateOfBirth: dateOfBirth || null,
      gender,
      maritalStatus: maritalStatus || null,
      spouseFirstName: isSpouseRelevant && spouseFirstName ? capitalizeWords(spouseFirstName) : null,
      spouseLastName: isSpouseRelevant && spouseLastName ? capitalizeWords(spouseLastName) : null,
      spouseSin: isSpouseRelevant ? spouseSin || null : null,
      spouseDateOfBirth: isSpouseRelevant ? spouseDateOfBirth || null : null,
      dependents: dependents
        .filter((d) => d.firstName.trim() || d.lastName.trim())
        .map((d) => ({ ...d, firstName: capitalizeWords(d.firstName), lastName: capitalizeWords(d.lastName) })),
      employmentStatus: employmentStatus || null,
      homeOwnership: homeOwnership || null,
      returnType: returnType || null,
      returnCompleted,
      returnFiled,
      outstandingDocuments,
      insuranceTypes,
      policyExpiryDate: policyExpiryDate || null,
      comments,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onSaved();
    onClose();
  }

  return (
    <Modal fullScreen
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Client' : 'Add Client'}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !clientName.trim()}
            onClick={handleSave}
            className="rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200 disabled:opacity-50"
          >
            Save
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Client / Business</h3>
          <label className="block text-sm">
            <span className="text-gray-600">Client Name</span>
            <input
              list={suggestionListId('client-name')}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              onBlur={suggestOnBlur('client-name', setClientName)}
              placeholder="Coriander Kitchen To Go"
            />
            <SuggestionDatalist fieldKey="client-name" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-gray-600">Phone (optional)</span>
              <input
                list={suggestionListId('phone-number')}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                onBlur={(e) => recordSuggestion('phone-number', e.target.value)}
                placeholder="416-555-1234"
              />
              <SuggestionDatalist fieldKey="phone-number" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Email (optional)</span>
              <input
                list={suggestionListId('email-address')}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => recordSuggestion('email-address', e.target.value)}
                placeholder="client@example.com"
              />
              <SuggestionDatalist fieldKey="email-address" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-gray-600">Linked Company File (optional)</span>
            <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={companyFilePath} onChange={(e) => setCompanyFilePath(e.target.value)}>
              <option value="">Not linked</option>
              {recents.map((p) => (
                <option key={p} value={p}>
                  {p.split(/[\\/]/).pop()}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-gray-600">Fiscal Year-End Month</span>
              <input type="number" min={1} max={12} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={fiscalMonth} onChange={(e) => setFiscalMonth(Number(e.target.value))} />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Fiscal Year-End Day</span>
              <input type="number" min={1} max={31} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={fiscalDay} onChange={(e) => setFiscalDay(Number(e.target.value))} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-gray-600">GST/HST Filing Frequency</span>
            <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={hstFrequency} onChange={(e) => setHstFrequency(e.target.value as HstFilingFrequency)}>
              {HST_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="space-y-3 border-t border-gray-100 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Personal Details</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-gray-600">First Name</span>
              <input
                list={suggestionListId('person-first-name')}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onBlur={suggestOnBlur('person-first-name', setFirstName)}
              />
              <SuggestionDatalist fieldKey="person-first-name" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Last Name</span>
              <input
                list={suggestionListId('person-last-name')}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                onBlur={suggestOnBlur('person-last-name', setLastName)}
              />
              <SuggestionDatalist fieldKey="person-last-name" />
            </label>
          </div>
          <StructuredAddressFields value={address} onChange={setAddress} />
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="text-gray-600">SIN Number</span>
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={sin} onChange={(e) => setSin(maskSin(e.target.value))} placeholder="000-000-000" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Date of Birth</span>
              <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={dateOfBirth} onChange={(e) => setDateOfBirth(clampIsoDate(e.target.value))} />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Gender</span>
              <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={gender} onChange={(e) => setGender(e.target.value as ClientGender)}>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-gray-400">Just colors the client list for quick recognition.</span>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="text-gray-600">Marital Status</span>
              <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value as MaritalStatus | '')}>
                <option value="">— Not set —</option>
                {MARITAL_STATUSES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Employed / Self-Employed</span>
              <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={employmentStatus} onChange={(e) => setEmploymentStatus(e.target.value as EmploymentStatus | '')}>
                <option value="">— Not set —</option>
                {EMPLOYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Owns Home or Leases</span>
              <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={homeOwnership} onChange={(e) => setHomeOwnership(e.target.value as HomeOwnership | '')}>
                <option value="">— Not set —</option>
                {HOME_OWNERSHIP_TYPES.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isSpouseRelevant && (
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <h4 className="mb-2 text-xs font-semibold text-gray-500">Spouse Details</h4>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  <span className="text-gray-600">First Name</span>
                  <input
                    list={suggestionListId('person-first-name')}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                    value={spouseFirstName}
                    onChange={(e) => setSpouseFirstName(e.target.value)}
                    onBlur={suggestOnBlur('person-first-name', setSpouseFirstName)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Last Name</span>
                  <input
                    list={suggestionListId('person-last-name')}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                    value={spouseLastName}
                    onChange={(e) => setSpouseLastName(e.target.value)}
                    onBlur={suggestOnBlur('person-last-name', setSpouseLastName)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">SIN Number</span>
                  <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={spouseSin} onChange={(e) => setSpouseSin(maskSin(e.target.value))} placeholder="000-000-000" />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Date of Birth</span>
                  <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={spouseDateOfBirth} onChange={(e) => setSpouseDateOfBirth(clampIsoDate(e.target.value))} />
                </label>
              </div>
            </div>
          )}

          <details className="rounded border border-gray-200 bg-gray-50 p-3">
            <summary className="cursor-pointer select-none text-xs font-semibold text-gray-500">
              Dependents {dependents.length > 0 && `(${dependents.length})`}
            </summary>
            <div className="mt-3 space-y-2">
              {dependents.map((d) => (
                <div key={d.id} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                  <label className="block text-sm">
                    <span className="text-gray-600">First Name</span>
                    <input
                      list={suggestionListId('person-first-name')}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                      value={d.firstName}
                      onChange={(e) => updateDependent(d.id, { firstName: e.target.value })}
                      onBlur={(e) => {
                        const capitalized = capitalizeWords(e.target.value);
                        updateDependent(d.id, { firstName: capitalized });
                        recordSuggestion('person-first-name', capitalized);
                      }}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-gray-600">Last Name</span>
                    <input
                      list={suggestionListId('person-last-name')}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                      value={d.lastName}
                      onChange={(e) => updateDependent(d.id, { lastName: e.target.value })}
                      onBlur={(e) => {
                        const capitalized = capitalizeWords(e.target.value);
                        updateDependent(d.id, { lastName: capitalized });
                        recordSuggestion('person-last-name', capitalized);
                      }}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-gray-600">Date of Birth</span>
                    <input type="date" min={DATE_MIN} max={DATE_MAX} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" value={d.dateOfBirth ?? ''} onChange={(e) => updateDependent(d.id, { dateOfBirth: clampIsoDate(e.target.value) || null })} />
                  </label>
                  <button type="button" onClick={() => removeDependent(d.id)} className="mb-0.5 h-fit rounded-full px-2 py-1.5 text-xs text-red-500 hover:bg-red-50" aria-label="Remove dependent">
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" onClick={addDependent} className="text-xs font-medium text-brand-600 hover:underline">
                + Add Dependent
              </button>
            </div>
          </details>
        </section>

        <section className="space-y-3 border-t border-gray-100 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Tax Return</h3>
          <label className="block text-sm">
            <span className="text-gray-600">Income Tax Return Type</span>
            <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={returnType} onChange={(e) => setReturnType(e.target.value as TaxReturnType | '')}>
              <option value="">— Not set —</option>
              {RETURN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'Both' ? 'Both (T1 + T2)' : t}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={returnCompleted} onChange={(e) => setReturnCompleted(e.target.checked)} />
              Return Completed
            </label>
            <label className="flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={returnFiled} onChange={(e) => setReturnFiled(e.target.checked)} />
              Return Filed
            </label>
          </div>

          <div>
            <span className="text-sm text-gray-600">Outstanding Documents</span>
            <div className="mt-1.5 space-y-1.5">
              {outstandingDocuments.map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-1.5 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={d.received} onChange={() => toggleOutstandingDocument(d.id)} />
                  <span className={`flex-1 ${d.received ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{d.label}</span>
                  <button type="button" onClick={() => removeOutstandingDocument(d.id)} className="text-xs text-gray-400 hover:text-red-500" aria-label={`Remove ${d.label}`}>
                    ✕
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  list={suggestionListId('client-document-label')}
                  className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  value={newDocLabel}
                  onChange={(e) => setNewDocLabel(e.target.value)}
                  onBlur={(e) => recordSuggestion('client-document-label', capitalizeWords(e.target.value))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOutstandingDocument())}
                  placeholder="e.g. T4 slip, RRSP receipt…"
                />
                <SuggestionDatalist fieldKey="client-document-label" />
                <button type="button" onClick={addOutstandingDocument} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200">
                  + Add
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3 border-t border-gray-100 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Insurance / Investment</h3>
          <div>
            <span className="text-sm text-gray-600">Type of Insurance / Product (select all that apply)</span>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {INSURANCE_PRODUCT_TYPES.map((t) => (
                <label
                  key={t}
                  className={`flex items-center gap-2 rounded border px-2 py-1.5 text-sm ${
                    insuranceTypes.includes(t) ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-gray-200 bg-white text-gray-700'
                  }`}
                >
                  <input type="checkbox" className="h-4 w-4" checked={insuranceTypes.includes(t)} onChange={() => toggleInsuranceType(t)} />
                  {t}
                </label>
              ))}
            </div>
            <span className="mt-1 block text-[11px] text-gray-400">Sets this client's products and lists them under the Insurance Clients tab.</span>
          </div>
          <label className="block text-sm">
            <span className="text-gray-600">Policy Expiry Date (optional)</span>
            <input
              type="date" min={DATE_MIN} max={DATE_MAX}
              className="mt-1 w-full max-w-xs rounded border border-gray-300 px-2 py-1.5"
              value={policyExpiryDate}
              onChange={(e) => setPolicyExpiryDate(clampIsoDate(e.target.value))}
            />
            <span className="mt-1 block text-[11px] text-gray-400">
              Highlights on the Insurance Clients tab as it approaches, with quick-send renewal reminder and thank-you messages.
            </span>
          </label>
        </section>

        <section className="space-y-3 border-t border-gray-100 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Comments</h3>
          <div>
            <span className="text-sm text-gray-600">Last Talk With Client</span>
            <div className="mt-1.5 flex gap-2">
              <textarea
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                rows={2}
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                onBlur={(e) => recordSuggestion('client-comment', capitalizeWords(e.target.value))}
                placeholder="e.g. Called about renewal, will follow up next week…"
              />
              <button
                type="button"
                onClick={addComment}
                disabled={!newCommentText.trim()}
                className="h-fit rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50"
              >
                + Add
              </button>
            </div>
            {comments.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm">
                    <span className="mt-0.5 flex-shrink-0 text-xs font-medium text-gray-400">{c.date}</span>
                    <span className="flex-1 text-gray-700">{c.text}</span>
                    <button type="button" onClick={() => removeComment(c.id)} className="text-xs text-gray-400 hover:text-red-500" aria-label="Remove comment">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <label className="block text-sm">
          <span className="text-gray-600">Notes (optional)</span>
          <textarea
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={(e) => {
              const capitalized = capitalizeWords(e.target.value);
              setNotes(capitalized);
              recordSuggestion('client-notes', capitalized);
            }}
          />
        </label>
        <p className="text-xs text-gray-400">
          Filing deadlines are computed as general guidance from the fiscal year-end and filing frequency — always confirm exact dates
          with the CRA or the client's Notice of Assessment.
        </p>
      </div>
    </Modal>
  );
}
