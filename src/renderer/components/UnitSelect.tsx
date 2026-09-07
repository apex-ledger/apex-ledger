import { useState } from 'react';
import { DEFAULT_UNIT, isListedUnit, PRODUCT_UNIT_GROUPS } from '@shared/domain/inventory/units';

const OTHER = '__other';

/** The unit a product is sold in, chosen from the list — with "Other…" turning into a text box for
 * the genuinely unusual, so the list guides without refusing. A saved unit that is not in the
 * list (an older file, a custom one) opens in the text box rather than being silently changed. */
export function UnitSelect({ value, onChange, className = '', autoFocus = false }: { value: string; onChange: (unit: string) => void; className?: string; autoFocus?: boolean }) {
  const [custom, setCustom] = useState(() => value.trim() !== '' && !isListedUnit(value));
  const selected = custom ? OTHER : (isListedUnit(value) ? value.trim().toLowerCase() : DEFAULT_UNIT);

  if (custom) {
    return (
      <div className="flex gap-1">
        <input
          autoFocus={autoFocus}
          aria-label="Unit"
          value={value}
          placeholder="e.g. pallet"
          onChange={(event) => onChange(event.target.value)}
          className={`min-w-0 flex-1 ${className}`}
        />
        <button type="button" onClick={() => { setCustom(false); onChange(DEFAULT_UNIT); }} className="shrink-0 rounded border border-gray-300 px-2 text-xs text-gray-600 hover:bg-gray-50" title="Choose from the list instead">
          List
        </button>
      </div>
    );
  }

  return (
    <select
      aria-label="Unit"
      value={selected}
      onChange={(event) => {
        if (event.target.value === OTHER) {
          setCustom(true);
          onChange('');
          return;
        }
        onChange(event.target.value);
      }}
      className={`bg-white ${className}`}
    >
      {PRODUCT_UNIT_GROUPS.map((group) => (
        <optgroup key={group.group} label={group.group}>
          {group.units.map((unit) => <option key={unit} value={unit.toLowerCase()}>{unit}</option>)}
        </optgroup>
      ))}
      <option value={OTHER}>Other…</option>
    </select>
  );
}
