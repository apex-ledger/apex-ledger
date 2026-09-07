export type FontFamilyId = 'system' | 'classic' | 'calibri' | 'serif' | 'mono';

/** App-wide font choices. Stacks use fonts already present on the OS (no bundled web fonts — the
 * app runs offline under a strict CSP), so every option renders without a download. `stack` is
 * applied to <html> so the whole UI inherits it. */
export const FONT_FAMILIES: { id: FontFamilyId; label: string; stack: string }[] = [
  { id: 'system', label: 'System', stack: "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif" },
  { id: 'classic', label: 'Classic', stack: 'Arial, Helvetica, sans-serif' },
  { id: 'calibri', label: 'Calibri', stack: "Calibri, 'Segoe UI', sans-serif" },
  { id: 'serif', label: 'Serif', stack: "Georgia, 'Times New Roman', serif" },
  { id: 'mono', label: 'Mono', stack: "Consolas, 'Courier New', monospace" },
];

export const DEFAULT_FONT_FAMILY: FontFamilyId = 'system';
const STORAGE_KEY = 'northLedger.fontFamily';

export function loadStoredFontFamily(): FontFamilyId {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return FONT_FAMILIES.some((f) => f.id === stored) ? (stored as FontFamilyId) : DEFAULT_FONT_FAMILY;
}

export function storeFontFamily(id: FontFamilyId): void {
  window.localStorage.setItem(STORAGE_KEY, id);
}

export function fontStackFor(id: FontFamilyId): string {
  return FONT_FAMILIES.find((f) => f.id === id)?.stack ?? FONT_FAMILIES[0].stack;
}
