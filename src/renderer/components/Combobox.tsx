import { Fragment, forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
  /** Makes important rows, such as master accounts, visually distinct in the field and list. */
  emphasized?: boolean;
  /** Optional heading this row sits under (e.g. "Expense"). Rows carrying the same group are shown
   * together beneath one heading, which is what makes a long list scannable — finding an expense
   * category in a flat list of ninety accounts means reading all ninety. */
  group?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  /** When provided, a pinned "+ Add New…" row appears at the top of the dropdown (regardless of
   * the current search text) — lets the user create a new account (or vendor/customer) without
   * leaving the row they're on. */
  /** Receives whatever the user had typed, so "add new" can prefill from it rather than opening a
   * blank form for a name they just finished typing. */
  onAddNew?: (query: string) => void;
  /** Either a fixed label, or one built from the current search text. */
  addNewLabel?: string | ((query: string) => string);
  /** When provided, every row in the dropdown gains a "+ sub" button revealed on hover, which
   * creates a new account nested under THAT row rather than at the top level. Categorizing is
   * where the need for a sub-account is actually felt — you go to book a cost, find only the
   * broad parent ("Utilities") and want the specific one ("Hydro") — so the split is offered at
   * the moment of picking instead of sending the user off to the Chart of Accounts and back. */
  onAddSub?: (option: ComboboxOption) => void;
  /** Limits which rows offer "+ sub". Some lists mix accounts with other things entirely — Bank
   * Import puts open invoices and bills in the same dropdown as categories — and nesting an
   * account under an invoice is meaningless. Defaults to every row when omitted. */
  canAddSub?: (option: ComboboxOption) => boolean;
}

/** Where the open dropdown should render, in viewport coordinates — computed fresh each time it
 * opens (and kept in sync with scroll/resize while open) so `position: fixed` places it correctly
 * regardless of what the input is nested inside. */
interface DropdownRect {
  top: number;
  left: number;
  width: number;
}

export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  { options, value, onChange, placeholder = 'Search…', allowClear = true, onAddNew, addNewLabel = '+ Add New', onAddSub, canAddSub },
  forwardedRef,
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [rect, setRect] = useState<DropdownRect | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  /** How many rows the dropdown will render at once.
   *
   * This was 50, which silently truncated a real chart of accounts: with ~86 accounts ordered by
   * code, everything from 5000 up — every expense category — fell off the end and simply could not
   * be picked unless you already knew what to type. A cap is still worth having so a pathological
   * list cannot hang the UI, but it has to sit well above any plausible chart. */
  const MAX_VISIBLE = 500;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    // The value is an internal id and is deliberately not searched — typing "42" should not match
    // whichever account happens to hold that row id.
    if (!term) return options.slice(0, MAX_VISIBLE);
    return options
      .filter((o) => o.label.toLowerCase().includes(term) || (o.sublabel?.toLowerCase().includes(term) ?? false))
      .slice(0, MAX_VISIBLE);
  }, [options, query]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filtered]);

  // The dropdown is portaled to <body> (see the render below) precisely so it can't be clipped by
  // a scrolling/overflow ancestor — a table cell, a modal's scrollable body, etc. That means it no
  // longer inherits position from a `position: relative` wrapper, so its screen position has to be
  // computed from the input's own bounding box instead, and kept in sync while open.
  useEffect(() => {
    if (!open) return;
    function updateRect() {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 256) });
    }
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [open]);

  function commitHighlighted() {
    const option = filtered[highlightedIndex];
    if (option) onChange(option.value);
    setOpen(false);
  }

  function setInputRef(el: HTMLInputElement | null) {
    inputRef.current = el;
    if (typeof forwardedRef === 'function') forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  }

  return (
    <div className="relative">
      <input
        ref={setInputRef}
        type="text"
        className={`w-full rounded border border-gray-300 px-2 py-1 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
          selected?.emphasized ? 'font-bold text-brand-900' : ''
        }`}
        placeholder={placeholder}
        // `value` is an internal database key used only for saving the selection. Showing it here
        // leaked labels such as "1 — Castle Hill" and "1 — Checking Account" across every picker.
        value={open ? query : selected?.label ?? ''}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() =>
          window.setTimeout(() => {
            // Typing an existing vendor/customer/account name exactly is a valid selection. Before
            // this, moving to the next field discarded the name unless the dropdown row was clicked.
            const typed = query.trim();
            const exact = typed ? options.find((option) => option.label.localeCompare(typed, undefined, { sensitivity: 'accent' }) === 0) : null;
            if (exact) onChange(exact.value);
            setOpen(false);
          }, 120)
        }
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            // Consumed here (and not allowed to bubble) so a row-level "Enter adds a new line"
            // handler doesn't also fire on the same keystroke that's just picking an account.
            e.preventDefault();
            e.stopPropagation();
            commitHighlighted();
          } else if (e.key === 'Tab' && filtered.length > 0) {
            // Tab both selects the highlighted match AND continues on to the next field, so typing
            // an account name and tabbing away works like a spreadsheet — no mouse click needed.
            commitHighlighted();
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open &&
        rect &&
        createPortal(
          <div
            style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
            className="z-[100] max-h-64 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg"
          >
            {onAddNew && (
              <button
                type="button"
                className="block w-full border-b border-gray-100 px-3 py-1.5 text-left text-sm font-medium text-brand-600 hover:bg-brand-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const typed = query.trim();
                  setOpen(false);
                  onAddNew(typed);
                }}
              >
                {typeof addNewLabel === 'function' ? addNewLabel(query.trim()) : addNewLabel}
              </button>
            )}
            {allowClear && value !== null && (
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm text-gray-500 hover:bg-gray-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(null);
                  setOpen(false);
                }}
              >
                Clear selection
              </button>
            )}
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">No matches</div>}
            {filtered.map((option, i) => (
              <Fragment key={option.value}>
                {option.group && option.group !== filtered[i - 1]?.group && (
                  <div className="sticky top-0 bg-gray-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {option.group}
                  </div>
                )}
              <div
                className={`group flex w-full items-center hover:bg-brand-50 ${
                  i === highlightedIndex ? 'bg-brand-100' : option.value === value ? 'bg-brand-50' : ''
                }`}
                onMouseEnter={() => setHighlightedIndex(i)}
              >
                <button
                  type="button"
                  className={`min-w-0 flex-1 px-3 py-1.5 text-left text-sm ${
                    option.emphasized ? 'font-bold text-brand-900' : option.value === value ? 'font-medium' : ''
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <div>{option.label}</div>
                  {option.sublabel && <div className="text-xs text-gray-400">{option.sublabel}</div>}
                </button>
                {onAddSub && (canAddSub?.(option) ?? true) && (
                  <button
                    type="button"
                    title={`Add a sub-account under ${option.label}`}
                    className="mr-1 shrink-0 rounded px-2 py-1 text-xs font-medium text-brand-600 opacity-0 hover:bg-brand-100 focus:opacity-100 group-hover:opacity-100"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOpen(false);
                      onAddSub(option);
                    }}
                  >
                    + sub
                  </button>
                )}
              </div>
              </Fragment>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
});
