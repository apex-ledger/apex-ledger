import { useEffect, useRef, useState } from 'react';
import {
  CANADIAN_PROVINCES,
  emptyStructuredAddress,
  formatStructuredAddress,
  parseStructuredAddress,
  type StructuredAddress,
} from '@shared/domain/contacts/structuredAddress';
import { capitalizeWords } from '../utils/textCase';
import { COUNTRIES, isListedCountry } from '@shared/domain/contacts/countries';
import { formatCanadianPostalCode } from '@shared/domain/contacts/identifiers';
import { SuggestionDatalist } from './SuggestionDatalist';
import { provinceToFill, recordSuggestion, rememberCityProvince, suggestionListId } from '../utils/textSuggestions';
import { maskCanadianPostalCode } from '@shared/domain/forms/fieldMasks';

const OTHER_COUNTRY = '__other';

export function StructuredAddressFields({ value, onChange, legend = 'Mailing address', namePrefix = 'address' }: { value: string; onChange: (value: string) => void; legend?: string; namePrefix?: string }) {
  const [fields, setFields] = useState<StructuredAddress>(() => parseStructuredAddress(value));
  const lastEmittedValue = useRef<string | null>(null);
  // "Other…" keeps a country that is not in the list typeable, and keeps an unlisted saved country
  // as it was rather than silently changing it to the first option.
  const [otherCountry, setOtherCountry] = useState(() => fields.country.trim() !== '' && !isListedCountry(fields.country));

  useEffect(() => {
    // `value` is the serialized form of these same fields. Re-parsing our own partial value on
    // every keypress turns "2" into "2, Canada", then "2, Canada, Canada" on the next keypress.
    // Only re-parse a genuinely external change (opening another contact or resetting the form).
    if (value === lastEmittedValue.current) {
      lastEmittedValue.current = null;
      return;
    }
    setFields(value ? parseStructuredAddress(value) : emptyStructuredAddress());
  }, [value]);

  function update(patch: Partial<StructuredAddress>) {
    const next = { ...fields, ...patch };
    const serialized = formatStructuredAddress(next);
    lastEmittedValue.current = serialized;
    setFields(next);
    onChange(serialized);
  }

  const isCanada = fields.country.trim() === '' || fields.country.trim().toLowerCase() === 'canada';

  /** Leaving the city or postal code: remember what was typed, and if the province is still
   * blank, fill it from what the app knows (learned cities, the built-in list, the postal code).
   * A province the person already chose is never changed. */
  function settleCity(city: string) {
    const tidy = capitalizeWords(city);
    recordSuggestion('city', tidy);
    const patch: Partial<StructuredAddress> = { city: tidy };
    if (fields.province) rememberCityProvince(tidy, fields.province);
    else if (isCanada) {
      const province = provinceToFill(tidy, fields.postalCode);
      if (province) patch.province = province;
    }
    update(patch);
  }

  function settlePostalCode() {
    const patch: Partial<StructuredAddress> = {};
    if (isCanada) patch.postalCode = formatCanadianPostalCode(fields.postalCode);
    recordSuggestion('postal-code', patch.postalCode ?? fields.postalCode);
    if (!fields.province && isCanada) {
      const province = provinceToFill(fields.city, fields.postalCode);
      if (province) patch.province = province;
    }
    update(patch);
  }

  const inputClass = 'mt-1 w-full rounded border border-gray-300 px-2 py-1.5';
  return (
    <fieldset className="rounded border border-gray-200 bg-gray-50 p-3">
      <legend className="px-1 text-sm font-medium text-gray-600">{legend}</legend>
      <SuggestionDatalist fieldKey="address-line1" />
      <SuggestionDatalist fieldKey="address-line2" />
      <SuggestionDatalist fieldKey="city" />
      <SuggestionDatalist fieldKey="postal-code" />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="text-gray-600">Street number and street address</span>
          <input
            name={`${namePrefix}-street-address`}
            autoComplete="address-line1"
            list={suggestionListId('address-line1')}
            className={inputClass}
            value={fields.streetAddress}
            onChange={(event) => update({ streetAddress: event.target.value })}
            onBlur={() => {
              recordSuggestion('address-line1', fields.streetAddress);
              update({ streetAddress: capitalizeWords(fields.streetAddress) });
            }}
            placeholder="123 King Street West"
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="text-gray-600">Unit, suite or floor (optional)</span>
          <input
            name={`${namePrefix}-unit`}
            autoComplete="address-line2"
            list={suggestionListId('address-line2')}
            className={inputClass}
            value={fields.unit}
            onChange={(event) => update({ unit: event.target.value })}
            onBlur={() => update({ unit: capitalizeWords(fields.unit) })}
            placeholder="Suite 400"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">City</span>
          <input
            name={`${namePrefix}-city`}
            autoComplete="address-level2"
            list={suggestionListId('city')}
            className={inputClass}
            value={fields.city}
            onChange={(event) => update({ city: event.target.value })}
            onBlur={() => settleCity(fields.city)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-gray-600">Province</span>
            <select
              name={`${namePrefix}-province`}
              autoComplete="address-level1"
              className={`${inputClass} bg-white`}
              value={fields.province}
              onChange={(event) => {
                update({ province: event.target.value });
                if (event.target.value) rememberCityProvince(fields.city, event.target.value);
              }}
            >
              <option value="">— Select —</option>
              {CANADIAN_PROVINCES.map((province) => (
                <option key={province} value={province}>{province}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Postal code</span>
            <input maxLength={12}
              name={`${namePrefix}-postal-code`}
              autoComplete="postal-code"
              list={suggestionListId('postal-code')}
              className={inputClass}
              value={fields.postalCode}
              onChange={(event) => update({ postalCode: isCanada ? maskCanadianPostalCode(event.target.value) : event.target.value.toUpperCase().slice(0, 12) })}
              onBlur={settlePostalCode}
              placeholder="M5V 1J2"
            />
          </label>
        </div>
        <label className="block text-sm md:col-span-2">
          <span className="text-gray-600">Country</span>
          {otherCountry ? (
            <div className="mt-1 flex gap-1">
              <input
                name={`${namePrefix}-country`}
                autoComplete="country-name"
                aria-label="Country"
                autoFocus
                className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5"
                value={fields.country}
                onChange={(event) => update({ country: event.target.value })}
                onBlur={() => update({ country: capitalizeWords(fields.country) })}
              />
              <button type="button" onClick={() => { setOtherCountry(false); update({ country: 'Canada' }); }} className="shrink-0 rounded border border-gray-300 px-2 text-xs text-gray-600 hover:bg-gray-50" title="Choose from the list instead">
                List
              </button>
            </div>
          ) : (
            <select
              name={`${namePrefix}-country`}
              autoComplete="country-name"
              aria-label="Country"
              className={`${inputClass} bg-white`}
              value={isListedCountry(fields.country) ? COUNTRIES.find((c) => c.toLowerCase() === fields.country.trim().toLowerCase()) : ''}
              onChange={(event) => {
                if (event.target.value === OTHER_COUNTRY) {
                  setOtherCountry(true);
                  update({ country: '' });
                  return;
                }
                update({ country: event.target.value });
              }}
            >
              <option value="">— Select —</option>
              {COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}
              <option value={OTHER_COUNTRY}>Other…</option>
            </select>
          )}
        </label>
      </div>
    </fieldset>
  );
}
