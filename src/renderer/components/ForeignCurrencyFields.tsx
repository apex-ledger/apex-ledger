import { useEffect, useState } from 'react';
import { CurrencyInput } from './CurrencyInput';
import { Money } from './Money';
import type { ForeignCurrencyAmountState } from '../hooks/useForeignCurrencyAmount';
import { FOREIGN_CURRENCY_CODES, FOREIGN_CURRENCY_LABELS, type ForeignCurrencyCode } from '@shared/domain/types';

function rateToText(rate: number | null): string {
  return rate === null ? '' : String(rate);
}

/** A plain decimal input (not cents-based, unlike CurrencyInput) for an exchange rate like
 * "1.3542". */
function RateInput({ value, onChange }: { value: number | null; onChange: (rate: number | null) => void }) {
  const [text, setText] = useState(rateToText(value));

  useEffect(() => {
    setText(rateToText(value));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      className="w-full rounded border border-gray-300 px-2 py-1 text-right tabular-nums focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      placeholder="1.0000"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = Number.parseFloat(text);
        const rate = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        onChange(rate);
        setText(rateToText(rate));
      }}
    />
  );
}

/** Compact selector intended for a transaction page's action/header row. */
export function ForeignCurrencySelector({ fx, disabled = false }: { fx: ForeignCurrencyAmountState; disabled?: boolean }) {
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-xs text-gray-600">
      <span>Currency</span>
      <select
        aria-label="Currency"
        className="w-44 rounded-full border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 disabled:bg-gray-100 disabled:text-gray-400"
        value={fx.currency}
        disabled={disabled}
        onChange={(e) => fx.setCurrency(e.target.value as 'CAD' | ForeignCurrencyCode)}
      >
        <option value="CAD">CAD — Canadian dollar (base)</option>
        {FOREIGN_CURRENCY_CODES.map((currency) => <option key={currency} value={currency}>{currency} — {FOREIGN_CURRENCY_LABELS[currency]}</option>)}
      </select>
    </label>
  );
}

/** Exchange-rate controls stay out of the way for ordinary CAD entries. */
export function ForeignCurrencyDetails({ fx, showAmountField = true }: { fx: ForeignCurrencyAmountState; showAmountField?: boolean }) {
  if (!fx.isForeign) return null;

  return (
    <div className="mt-2 flex flex-wrap items-end gap-3 rounded border border-dashed border-gray-300 bg-gray-50 p-3">
          {showAmountField && (
            <label className="block text-sm">
              <span className="text-gray-600">{fx.currency} Amount</span>
              <div className="mt-1 w-32">
                <CurrencyInput valueCents={fx.foreignAmountCents} onChange={fx.setForeignAmountCents} />
              </div>
            </label>
          )}
          <label className="block text-sm">
            <span className="text-gray-600">Exchange Rate (CAD per {fx.currency})</span>
            <div className="mt-1 w-28">
              <RateInput value={fx.exchangeRate} onChange={fx.setExchangeRate} />
            </div>
          </label>
          <button
            type="button"
            disabled={fx.fetching}
            onClick={fx.fetchRate}
            className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            {fx.fetching ? 'Fetching…' : 'Fetch Bank of Canada Rate'}
          </button>
          {showAmountField && (
            <div className="text-sm text-gray-600">
              {fx.cadAmountCents !== null ? (
                <>
                  ≈ <Money cents={fx.cadAmountCents} className="font-medium text-gray-800" /> CAD
                </>
              ) : (
                <span className="text-gray-400">Enter a rate to see the CAD amount</span>
              )}
            </div>
          )}
          {fx.rateDate && <p className="w-full text-xs text-gray-400">Bank of Canada rate for {fx.rateDate}.</p>}
          {fx.fetchError && <p className="w-full text-xs text-red-600">{fx.fetchError}</p>}
    </div>
  );
}

/** Backward-compatible combined layout for any external use. New transaction forms should place
 * the selector in their header and the details near the amount fields. */
export function ForeignCurrencyFields({ fx, showAmountField = true }: { fx: ForeignCurrencyAmountState; showAmountField?: boolean }) {
  return (
    <div>
      <ForeignCurrencySelector fx={fx} />
      <ForeignCurrencyDetails fx={fx} showAmountField={showAmountField} />
    </div>
  );
}
