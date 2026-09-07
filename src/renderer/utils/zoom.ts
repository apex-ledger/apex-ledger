export const ZOOM_LEVELS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];
export const MIN_ZOOM_PERCENT = ZOOM_LEVELS[0];
export const MAX_ZOOM_PERCENT = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
export const DEFAULT_ZOOM_PERCENT = 100;
export const ZOOM_STEP_PERCENT = 10;

const STORAGE_KEY = 'northLedger.zoomPercent';

export function clampZoomPercent(percent: number): number {
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, percent));
}

export function loadStoredZoomPercent(): number {
  const stored = Number(window.localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0 ? clampZoomPercent(stored) : DEFAULT_ZOOM_PERCENT;
}

export function storeZoomPercent(percent: number): void {
  window.localStorage.setItem(STORAGE_KEY, String(percent));
}
