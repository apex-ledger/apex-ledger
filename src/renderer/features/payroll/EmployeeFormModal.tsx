import { formatSin, isValidSin } from '@shared/domain/contacts/identifiers';
import { useEffect, useState } from 'react';
import type { Employee, PayType } from '@shared/domain/types';
import {
  ALBERTA_BPA_2026_CENTS,
  BRITISH_COLUMBIA_BPA_2026_CENTS,
  FEDERAL_BPAF_2026,
  MANITOBA_BPA_2026,
  NEW_BRUNSWICK_BPA_2026_CENTS,
  NOVA_SCOTIA_BPA_2026_CENTS,
  ONTARIO_BPA_2026_CENTS,
  SASKATCHEWAN_BPA_2026_CENTS,
} from '@shared/domain/payroll/craIncomeTax2026';
import { isSupportedAutoTaxProvince, SUPPORTED_AUTO_TAX_PROVINCE_NAMES, type SupportedAutoTaxProvince } from '@shared/domain/payroll/calculateIncomeTax';
import { Modal } from '../../components/Modal';
import { CurrencyInput } from '../../components/CurrencyInput';
import { capitalizeWords, suggestOnBlur } from '../../utils/textCase';
import { SuggestionDatalist } from '../../components/SuggestionDatalist';
import { provinceToFill, recordSuggestion, rememberCityProvince, suggestionListId } from '../../utils/textSuggestions';
import { maskCanadianPostalCode, maskSin } from '@shared/domain/forms/fieldMasks';

const PROVINCES = ['ON', 'BC', 'AB', 'SK', 'MB', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU'];

// Manitoba's BPAMB phases down above $200,000 net income; the max is used here as the starting
// point shown when the "basic amount only" checkbox is used, matching every other province.
const PROVINCIAL_BPA_CENTS: Record<SupportedAutoTaxProvince, number> = {
  ON: ONTARIO_BPA_2026_CENTS,
  NS: NOVA_SCOTIA_BPA_2026_CENTS,
  AB: ALBERTA_BPA_2026_CENTS,
  BC: BRITISH_COLUMBIA_BPA_2026_CENTS,
  NB: NEW_BRUNSWICK_BPA_2026_CENTS,
  MB: MANITOBA_BPA_2026.maxCents,
  SK: SASKATCHEWAN_BPA_2026_CENTS,
};

export function EmployeeFormModal({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: Employee | null;
}) {
  const [name, setName] = useState('');
  const [province, setProvince] = useState('ON');
  const [payType, setPayType] = useState<PayType>('Hourly');
  const [hourlyRateCents, setHourlyRateCents] = useState(0);
  const [annualSalaryCents, setAnnualSalaryCents] = useState(0);
  const [payPeriodsPerYear, setPayPeriodsPerYear] = useState(26);
  const [vacationPayRate, setVacationPayRate] = useState(4);
  const [vacationPayAccrued, setVacationPayAccrued] = useState(false);
  const [federalTotalClaimCents, setFederalTotalClaimCents] = useState<number | null>(null);
  const [provincialTotalClaimCents, setProvincialTotalClaimCents] = useState<number | null>(null);
  const [additionalTaxCents, setAdditionalTaxCents] = useState(0);
  const [rrspEmployerMatchCents, setRrspEmployerMatchCents] = useState(0);
  const [healthBenefitCents, setHealthBenefitCents] = useState(0);
  const [sin, setSin] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressProvince, setAddressProvince] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [bankInstitution, setBankInstitution] = useState('');
  const [bankTransit, setBankTransit] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [addressProvinceChosen, setAddressProvinceChosen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provincialBpaCents = isSupportedAutoTaxProvince(province) ? PROVINCIAL_BPA_CENTS[province] : ONTARIO_BPA_2026_CENTS;
  const provincialClaimLabel = isSupportedAutoTaxProvince(province) ? `${SUPPORTED_AUTO_TAX_PROVINCE_NAMES[province]} (TD1${province})` : `${province} (TD1${province})`;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(editing?.name ?? '');
    setProvince(editing?.province ?? 'ON');
    setPayType(editing?.payType ?? 'Hourly');
    setHourlyRateCents(editing?.hourlyRateCents ?? 0);
    setAnnualSalaryCents(editing?.annualSalaryCents ?? 0);
    setPayPeriodsPerYear(editing?.payPeriodsPerYear ?? 26);
    setVacationPayRate((editing?.vacationPayRate ?? 0.04) * 100);
    setVacationPayAccrued(editing?.vacationPayAccrued ?? false);
    setFederalTotalClaimCents(editing?.federalTotalClaimCents ?? null);
    setProvincialTotalClaimCents(editing?.provincialTotalClaimCents ?? null);
    setAdditionalTaxCents(editing?.additionalTaxCents ?? 0);
    setRrspEmployerMatchCents(editing?.rrspEmployerMatchCents ?? 0);
    setHealthBenefitCents(editing?.healthBenefitCents ?? 0);
    setSin(editing?.sin ?? '');
    setAddressLine1(editing?.addressLine1 ?? '');
    setAddressLine2(editing?.addressLine2 ?? '');
    setAddressCity(editing?.addressCity ?? '');
    // New employees default the address province to their province of employment — usually the
    // same, and easily changed for anyone who lives across a provincial line from where they work.
    setAddressProvince(editing ? (editing.addressProvince ?? '') : 'ON');
    setAddressProvinceChosen(Boolean(editing?.addressProvince));
    setAddressPostalCode(editing?.addressPostalCode ?? '');
    setBankInstitution(editing?.bankInstitution ?? ''); setBankTransit(editing?.bankTransit ?? ''); setBankAccount(editing?.bankAccount ?? '');
  }, [open, editing]);

  function prepareNextEmployee() {
    setName(''); setProvince('ON'); setPayType('Hourly'); setHourlyRateCents(0); setAnnualSalaryCents(0);
    setPayPeriodsPerYear(26); setVacationPayRate(4); setVacationPayAccrued(false);
    setFederalTotalClaimCents(null); setProvincialTotalClaimCents(null); setAdditionalTaxCents(0);
    setRrspEmployerMatchCents(0); setHealthBenefitCents(0); setSin('');
    setAddressLine1(''); setAddressLine2(''); setAddressCity(''); setAddressProvince('ON'); setAddressPostalCode('');
  }

  async function handleSave(after: 'close' | 'next') {
    if (sin.trim() && !isValidSin(sin)) return setError('That SIN is not valid — it must be nine digits and pass the CRA check digit. Re-enter it from the card before it reaches a T4.');
    setBusy(true);
    setError(null);
    const payload = {
      name: capitalizeWords(name),
      province,
      payType,
      hourlyRateCents: payType === 'Hourly' ? hourlyRateCents : null,
      annualSalaryCents: payType === 'Salary' ? annualSalaryCents : null,
      payPeriodsPerYear,
      vacationPayRate: vacationPayRate / 100,
      vacationPayAccrued,
      federalTotalClaimCents,
      provincialTotalClaimCents,
      additionalTaxCents: additionalTaxCents > 0 ? additionalTaxCents : null,
      rrspEmployerMatchCents: rrspEmployerMatchCents > 0 ? rrspEmployerMatchCents : null,
      healthBenefitCents: healthBenefitCents > 0 ? healthBenefitCents : null,
      sin: sin.trim() ? formatSin(sin) : null,
      sinLastFour: sin.trim() ? sin.trim().replace(/\D/g, '').slice(-4) : null,
      addressLine1: addressLine1.trim() ? capitalizeWords(addressLine1) : null,
      addressLine2: addressLine2.trim() ? capitalizeWords(addressLine2) : null,
      addressCity: addressCity.trim() ? capitalizeWords(addressCity) : null,
      addressProvince: addressProvince || null,
      addressPostalCode: addressPostalCode.trim() || null,
      bankInstitution: bankInstitution.replace(/\D/g, '') || null,
      bankTransit: bankTransit.replace(/\D/g, '') || null,
      bankAccount: bankAccount.replace(/\D/g, '') || null,
    };
    const result = editing ? await window.api.employees.update({ id: editing.id, patch: payload }) : await window.api.employees.create(payload);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onSaved();
    if (after === 'close' || editing) return onClose();
    prepareNextEmployee();
  }

  return (
    <Modal fullScreen
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Employee' : 'Add Employee'}
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
          <span className="text-gray-600">Employee Name</span>
          <input
            list={suggestionListId('employee-name')}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={suggestOnBlur('employee-name', setName)}
          />
          <SuggestionDatalist fieldKey="employee-name" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Province</span>
            <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={province} onChange={(e) => setProvince(e.target.value)}>
              {PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Pay Type</span>
            <select className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" value={payType} onChange={(e) => setPayType(e.target.value as PayType)}>
              <option value="Hourly">Hourly</option>
              <option value="Salary">Salary</option>
            </select>
          </label>
        </div>
        {payType === 'Hourly' ? (
          <label className="block text-sm">
            <span className="text-gray-600">Hourly Rate</span>
            <CurrencyInput valueCents={hourlyRateCents} onChange={setHourlyRateCents} />
          </label>
        ) : (
          <label className="block text-sm">
            <span className="text-gray-600">Annual Salary</span>
            <CurrencyInput valueCents={annualSalaryCents} onChange={setAnnualSalaryCents} />
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Pay Schedule</span>
            <select
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5"
              value={payPeriodsPerYear}
              onChange={(e) => setPayPeriodsPerYear(Number(e.target.value))}
            >
              {payPeriodsPerYear === 52 && <option value={52}>Weekly (existing employee)</option>}
              <option value={26}>Biweekly (26/year)</option>
              <option value={24}>Semi-monthly (24/year)</option>
              <option value={12}>Monthly (12/year)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Vacation Pay %</span>
            <input inputMode="decimal" maxLength={7}
              type="number"
              step="0.1"
              min={0}
              max={100}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={vacationPayRate}
              onChange={(e) => setVacationPayRate(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={vacationPayAccrued} onChange={(e) => setVacationPayAccrued(e.target.checked)} />
            <span>
              <span className="font-medium text-gray-700">Accrue vacation pay instead of paying it each period</span>
              <span className="mt-0.5 block text-xs text-gray-400">
                Vacation pay builds up in a Vacation Pay Payable liability and CPP/EI/income tax are deferred until it&apos;s actually paid out — CRA&apos;s
                treatment for vacation pay held in trust. Leave unchecked to keep paying it out with every cheque (the default).
              </span>
            </span>
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-gray-600">SIN (optional)</span>
          <input inputMode="numeric" maxLength={11}
            className={`mt-1 w-full rounded border px-2 py-1.5 ${sin.trim() && !isValidSin(sin) ? 'border-amber-400' : 'border-gray-300'}`}
            placeholder="123 456 789"
            value={sin}
            onChange={(e) => setSin(maskSin(e.target.value))}
            onBlur={(e) => setSin(formatSin(e.target.value))}
          />
          <span className="mt-1 block text-xs text-gray-400">Only used to print T4 slips at year end — pay stubs still show just the last 4 digits.</span>
        </label>

        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-600">Mailing Address (optional)</p>
          <p className="mt-0.5 text-xs text-gray-400">
            Printed in the employee block of the T4 slip. This is where the employee lives — it can differ from the province of employment
            selected above, which is used for payroll.
          </p>
          <div className="mt-2 space-y-2">
            <input
              list={suggestionListId('address-line1')}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              placeholder="Address line 1"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              onBlur={suggestOnBlur('address-line1', setAddressLine1)}
            />
            <input
              list={suggestionListId('address-line2')}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              placeholder="Address line 2 (optional)"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              onBlur={suggestOnBlur('address-line2', setAddressLine2)}
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                list={suggestionListId('city')}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                placeholder="City"
                value={addressCity}
                onChange={(e) => setAddressCity(e.target.value)}
                onBlur={(e) => {
                  suggestOnBlur('city', setAddressCity)(e);
                  if (addressProvinceChosen) rememberCityProvince(e.target.value, addressProvince);
                  else {
                    const province = provinceToFill(e.target.value, addressPostalCode);
                    if (province) setAddressProvince(province);
                  }
                }}
              />
              <select
                className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                value={addressProvince}
                onChange={(e) => {
                  setAddressProvince(e.target.value);
                  setAddressProvinceChosen(true);
                  if (e.target.value) rememberCityProvince(addressCity, e.target.value);
                }}
              >
                <option value="">Province</option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input
                list={suggestionListId('postal-code')}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                placeholder="Postal Code"
                value={addressPostalCode}
                onChange={(e) => setAddressPostalCode(maskCanadianPostalCode(e.target.value))}
                onBlur={(e) => {
                  recordSuggestion('postal-code', e.target.value);
                  if (!addressProvinceChosen) {
                    const province = provinceToFill(addressCity, e.target.value);
                    if (province) setAddressProvince(province);
                  }
                }}
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <label className="block text-sm"><span className="text-gray-600">Bank institution (3 digits)</span><input inputMode="numeric" maxLength={3} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" placeholder="e.g. 004" value={bankInstitution} onChange={(e) => setBankInstitution(e.target.value.replace(/\D/g, '').slice(0, 3))} /></label>
              <label className="block text-sm"><span className="text-gray-600">Transit (5 digits)</span><input inputMode="numeric" maxLength={5} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" placeholder="e.g. 12345" value={bankTransit} onChange={(e) => setBankTransit(e.target.value.replace(/\D/g, '').slice(0, 5))} /></label>
              <label className="block text-sm"><span className="text-gray-600">Account number (direct deposit)</span><input inputMode="numeric" maxLength={12} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" placeholder="up to 12 digits" value={bankAccount} onChange={(e) => setBankAccount(e.target.value.replace(/\D/g, '').slice(0, 12))} /></label>
            </div>
          </div>
          <SuggestionDatalist fieldKey="address-line1" />
          <SuggestionDatalist fieldKey="address-line2" />
          <SuggestionDatalist fieldKey="city" />
          <SuggestionDatalist fieldKey="postal-code" />
        </div>

        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-600">Payroll Tax Settings</p>
          <p className="mt-0.5 text-xs text-gray-400">
            Leave the basic amounts selected unless the employee has provided different federal or provincial claim amounts.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-gray-600">Federal (TD1)</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={federalTotalClaimCents === null}
                  onChange={(e) => setFederalTotalClaimCents(e.target.checked ? null : FEDERAL_BPAF_2026.maxCents)}
                />
                <span className="text-xs text-gray-500">Basic amount only (${(FEDERAL_BPAF_2026.maxCents / 100).toFixed(2)})</span>
              </div>
              {federalTotalClaimCents !== null && (
                <div className="mt-1">
                  <CurrencyInput valueCents={federalTotalClaimCents} onChange={setFederalTotalClaimCents} />
                </div>
              )}
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">{provincialClaimLabel}</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={provincialTotalClaimCents === null}
                  onChange={(e) => setProvincialTotalClaimCents(e.target.checked ? null : provincialBpaCents)}
                />
                <span className="text-xs text-gray-500">Basic amount only (${(provincialBpaCents / 100).toFixed(2)})</span>
              </div>
              {provincialTotalClaimCents !== null && (
                <div className="mt-1">
                  <CurrencyInput valueCents={provincialTotalClaimCents} onChange={setProvincialTotalClaimCents} />
                </div>
              )}
            </label>
          </div>
          <label className="mt-3 block text-sm">
            <span className="text-gray-600">Additional Tax Per Pay Period (optional)</span>
            <div className="mt-1 w-40">
              <CurrencyInput valueCents={additionalTaxCents} onChange={setAdditionalTaxCents} />
            </div>
          </label>
        </div>

        <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Employer Benefits (per pay period)</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-gray-600">Default Employer RRSP Contribution (optional)</span>
              <div className="mt-1">
                <CurrencyInput valueCents={rrspEmployerMatchCents} onChange={setRrspEmployerMatchCents} />
              </div>
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Health/Dental Benefit (optional)</span>
              <div className="mt-1">
                <CurrencyInput valueCents={healthBenefitCents} onChange={setHealthBenefitCents} />
              </div>
            </label>
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            The RRSP amount is an employer-paid taxable benefit remitted directly to the employee's RRSP. You can change it for an individual payroll run.
          </p>
        </div>
      </div>
    </Modal>
  );
}
