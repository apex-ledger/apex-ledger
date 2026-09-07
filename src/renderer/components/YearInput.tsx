import { useEffect, useState } from 'react';
import { maskYear, parseYear, YEAR_MAX, YEAR_MIN } from '@shared/domain/forms/fieldMasks';

/** A four-digit year and nothing else. Typing stops at four digits; the value is handed back
 * only once it is a real year the books can hold (1900–2100), so a half-typed year never
 * reaches the page's state. */
export function YearInput({ value, onChange, className = '', ...rest }: { value: number; onChange: (year: number) => void; className?: string; 'aria-label'?: string; id?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      maxLength={4}
      min={YEAR_MIN}
      max={YEAR_MAX}
      value={text}
      onChange={(e) => {
        const next = maskYear(e.target.value);
        setText(next);
        const year = parseYear(next);
        if (year !== null) onChange(year);
      }}
      onBlur={() => {
        if (parseYear(text) === null) setText(String(value));
      }}
      className={className}
    />
  );
}
