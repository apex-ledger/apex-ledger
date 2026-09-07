import { forwardRef, useEffect, useState } from 'react';

interface CurrencyInputProps {
  valueCents: number;
  onChange: (cents: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Accessible name for a bare amount box inside a table row ("Line 1 amount"). */
  'aria-label'?: string;
}

function centsToText(cents: number): string {
  return cents === 0 ? '' : (cents / 100).toFixed(2);
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(function CurrencyInput(
  { valueCents, onChange, className = '', placeholder, disabled = false, 'aria-label': ariaLabel },
  forwardedRef,
) {
  const [text, setText] = useState(centsToText(valueCents));

  useEffect(() => {
    setText(centsToText(valueCents));
  }, [valueCents]);

  return (
    <input
      ref={forwardedRef}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      disabled={disabled}
      className={`w-full rounded border border-gray-300 px-2 py-1 text-right tabular-nums focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-100 ${className}`}
      placeholder={placeholder ?? '0.00'}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = Number.parseFloat(text.replace(/,/g, ''));
        const cents = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
        // Only fire onChange when the value actually changed — just clicking into the field and
        // back out (or tabbing past it) blurs it without editing anything, and callers commonly
        // wire onChange straight to a markDirty() call (see useUnsavedGuard). Firing on every blur
        // regardless meant simply tabbing through an otherwise-untouched form could arm the
        // "Unsaved Changes" prompt, which then failed to save since there was nothing real to save.
        if (cents !== valueCents) onChange(cents);
        setText(centsToText(cents));
      }}
    />
  );
});
