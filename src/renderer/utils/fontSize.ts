export type FontSizeId = 'small' | 'normal' | 'large';

export const FONT_SIZES: { id: FontSizeId; label: string; rootPx: number }[] = [
  { id: 'small', label: 'Small', rootPx: 14 },
  { id: 'normal', label: 'Normal', rootPx: 16 },
  { id: 'large', label: 'Large', rootPx: 19 },
];

export const DEFAULT_FONT_SIZE: FontSizeId = 'normal';
const STORAGE_KEY = 'northLedger.fontSize';

export function loadStoredFontSize(): FontSizeId {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return FONT_SIZES.some((f) => f.id === stored) ? (stored as FontSizeId) : DEFAULT_FONT_SIZE;
}

export function storeFontSize(id: FontSizeId): void {
  window.localStorage.setItem(STORAGE_KEY, id);
}
