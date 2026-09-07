export type TickerMode = 'stocks' | 'news';

const ENABLED_KEY = 'northLedger.ticker.enabled';
const MODE_KEY = 'northLedger.ticker.mode';

export function loadTickerEnabled(): boolean {
  const stored = window.localStorage.getItem(ENABLED_KEY);
  return stored === null ? true : stored === 'true';
}

export function storeTickerEnabled(enabled: boolean): void {
  window.localStorage.setItem(ENABLED_KEY, String(enabled));
}

export function loadTickerMode(): TickerMode {
  return window.localStorage.getItem(MODE_KEY) === 'news' ? 'news' : 'stocks';
}

export function storeTickerMode(mode: TickerMode): void {
  window.localStorage.setItem(MODE_KEY, mode);
}
