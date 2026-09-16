/**
 * Number boxes that start at 0 behave the way people expect, everywhere in the app.
 *
 * A box showing 0 (or 0.00) selects its contents when it gets focus, so typing replaces the zero
 * instead of landing beside it. And a leading zero left in front of a whole number ("05", "0012")
 * is dropped as it is typed, before the screen reads the value; "0.5" and "0" alone are left as they
 * are. One listener on the document covers every number box, present and future.
 */
const ZERO = /^0+(\.0+)?$/;
const LEADING_ZERO = /^(-?)0+(?=\d)/;
const nativeValueSetter = typeof HTMLInputElement === 'undefined' ? undefined : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

function isNumberBox(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement) || el.readOnly || el.disabled) return false;
  if (el.type === 'number') return true;
  return el.type === 'text' && (el.inputMode === 'numeric' || el.inputMode === 'decimal');
}

/** The value with a redundant leading zero removed, or null when there is nothing to remove. */
export function withoutLeadingZero(value: string): string | null {
  if (!LEADING_ZERO.test(value)) return null;
  return value.replace(LEADING_ZERO, '$1');
}

export function installZeroFriendlyNumbers(doc: Document = document): () => void {
  let selectedByFocus: HTMLInputElement | null = null;

  const onFocus = (e: FocusEvent) => {
    const el = e.target;
    if (!isNumberBox(el) || !ZERO.test(el.value.trim())) return;
    el.select();
    selectedByFocus = el;
  };
  // A click that gave the focus would otherwise drop the selection when the mouse button comes up.
  const onMouseUp = (e: MouseEvent) => {
    if (selectedByFocus && e.target === selectedByFocus) e.preventDefault();
    selectedByFocus = null;
  };
  const onInput = (e: Event) => {
    const el = e.target;
    // Only true number boxes: a numeric text box may hold a code where the zero matters (a bank
    // institution "002", a transit number, a SIN).
    if (!(el instanceof HTMLInputElement) || el.type !== 'number' || el.readOnly || el.disabled) return;
    const cleaned = withoutLeadingZero(el.value);
    // Through the prototype's setter: React tracks assignments to the element's own value property,
    // and one it tracked would make it think nothing changed and skip the screen's onChange.
    if (cleaned !== null) nativeValueSetter?.call(el, cleaned);
  };

  doc.addEventListener('focusin', onFocus, true);
  doc.addEventListener('mouseup', onMouseUp, true);
  // Capture on the document runs before React's own listener on the root, so the screen reads the
  // cleaned value and the box shows it.
  doc.addEventListener('input', onInput, true);
  return () => {
    doc.removeEventListener('focusin', onFocus, true);
    doc.removeEventListener('mouseup', onMouseUp, true);
    doc.removeEventListener('input', onInput, true);
  };
}
