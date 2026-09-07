import { useEffect, useState } from 'react';
import { CurrencyInput } from './CurrencyInput';
import { taxCentsForCustomRate } from '@shared/domain/ledger/customTaxRate';

/** Custom percentage plus the resulting editable amount. The percentage is a data-entry aid;
 * the exact cents remain the accounting source of truth saved with the transaction. */
export function CustomTaxRateInput({
  baseCents,
  taxCents,
  onTaxCentsChange,
}: {
  baseCents: number;
  taxCents: number;
  onTaxCentsChange: (cents: number) => void;
}) {
  const [rateText, setRateText] = useState('');

  useEffect(() => {
    const rate = Number(rateText);
    if (rateText !== '' && Number.isFinite(rate) && rate >= 0) onTaxCentsChange(taxCentsForCustomRate(baseCents, rate));
    // onTaxCentsChange is intentionally omitted: parent line-update closures change every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCents, rateText]);

  return (
    <div className="flex min-w-40 items-center gap-1.5">
      <label className="flex items-center gap-1" title="Custom tax percentage">
        <input
          aria-label="Custom tax rate"
          type="number"
          min={0}
          max={100}
          step="0.01"
          className="w-16 rounded border border-gray-300 px-1.5 py-1 text-right"
          value={rateText}
          onChange={(event) => setRateText(event.target.value)}
          placeholder="Rate"
        />
        <span className="text-xs text-gray-500">%</span>
      </label>
      <div className="min-w-24 flex-1" title="Calculated tax amount; you may adjust the exact cents">
        <CurrencyInput valueCents={taxCents} onChange={onTaxCentsChange} />
      </div>
    </div>
  );
}
