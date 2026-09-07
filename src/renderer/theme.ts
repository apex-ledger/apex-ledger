export type ColorSchemeId = 'forest' | 'ocean' | 'slate' | 'burgundy' | 'indigo';

export interface ColorScheme {
  id: ColorSchemeId;
  label: string;
  /** Representative hex swatches for the picker UI — independent of the live CSS variables (see
   * themes.css) so every option previews correctly no matter which scheme is currently active. */
  brandSwatch: string;
  goldSwatch: string;
}

export const COLOR_SCHEMES: ColorScheme[] = [
  { id: 'forest', label: 'Forest', brandSwatch: '#1c633c', goldSwatch: '#dfa931' },
  { id: 'ocean', label: 'Ocean', brandSwatch: '#1c3c63', goldSwatch: '#df7f31' },
  { id: 'slate', label: 'Slate', brandSwatch: '#2c3a53', goldSwatch: '#3ed2c3' },
  { id: 'burgundy', label: 'Burgundy', brandSwatch: '#631c2d', goldSwatch: '#dfab31' },
  { id: 'indigo', label: 'Indigo', brandSwatch: '#251c63', goldSwatch: '#df318e' },
];

export const DEFAULT_COLOR_SCHEME: ColorSchemeId = 'forest';
const STORAGE_KEY = 'northLedger.colorScheme';

export function loadStoredColorScheme(): ColorSchemeId {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return COLOR_SCHEMES.some((s) => s.id === stored) ? (stored as ColorSchemeId) : DEFAULT_COLOR_SCHEME;
}

export function storeColorScheme(id: ColorSchemeId): void {
  window.localStorage.setItem(STORAGE_KEY, id);
}
