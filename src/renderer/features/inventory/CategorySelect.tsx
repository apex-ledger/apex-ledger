import { useEffect, useRef, useState } from 'react';
import { STANDARD_PRODUCT_CATEGORIES } from '@shared/domain/inventory/productCatalogue';

/** The product category picker: the categories this company already uses first, then a standard
 * list a business of any trade can start from, then "Add new category…", which turns the field
 * into a text box for a name of the firm's own. Blank is allowed: a category is optional. */
const ADD = '__add__';

export function CategorySelect({ value, onChange, inUse, className, ariaLabel, placeholder }: {
  value: string;
  onChange: (next: string) => void;
  inUse: string[];
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  const used = new Set(inUse.map((c) => c.trim()).filter(Boolean));
  const standard = STANDARD_PRODUCT_CATEGORIES.filter((c) => !used.has(c));
  const current = value.trim();
  const known = used.has(current) || STANDARD_PRODUCT_CATEGORIES.includes(current);

  function commit() {
    const name = draft.trim();
    setAdding(false);
    setDraft('');
    if (name) onChange(name);
  }

  if (adding) {
    return (
      <input
        ref={inputRef}
        className={className}
        value={draft}
        placeholder={placeholder ?? 'New category name'}
        aria-label={ariaLabel ? `${ariaLabel} (new)` : 'New category name'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setAdding(false); setDraft(''); } }}
      />
    );
  }

  return (
    <select
      className={className}
      value={current}
      aria-label={ariaLabel}
      onChange={(e) => { if (e.target.value === ADD) setAdding(true); else onChange(e.target.value); }}
    >
      <option value="">{placeholder ?? 'No category'}</option>
      {current && !known && <option value={current}>{current}</option>}
      {used.size > 0 && <optgroup label="In use">{[...used].sort((a, b) => a.localeCompare(b)).map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>}
      <optgroup label="Suggested">{standard.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
      <option value={ADD}>+ Add new category…</option>
    </select>
  );
}
