import { useUiStore, type ReportKind } from '../app/store/uiStore';

export type FavouritePage = `report:${ReportKind}` | `form:${string}` | `nav:${string}`;

const STORAGE_KEY = 'northLedger.favouritePages';

/** Favourites belong to the client: each company file keeps its own bar, keyed by its path, so a
 * payroll-only client and a retail client open with the shortcuts they each use. The first time a
 * company is opened its bar starts from the machine-wide list, which stays as the fallback when
 * no company is open. */
function companyStorageKey(): string {
  const path = useUiStore.getState().companyPath;
  return path ? `${STORAGE_KEY}:${normalisePath(path)}` : STORAGE_KEY;
}

/** The same file reached as C:\Clients\A.company and c:/clients/a.company is one company, not
 * two bars. Windows paths are case-insensitive and either slash is accepted, so the key ignores
 * both. */
function normalisePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

function readList(key: string): FavouritePage[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is FavouritePage => typeof value === 'string' && /^(report|form|nav):.+/.test(value));
  } catch {
    return [];
  }
}
export const FAVOURITES_CHANGED_EVENT = 'apex-ledger:favourites-changed';

export function navFavouriteKey(label: string): `nav:${string}` {
  return `nav:${encodeURIComponent(label)}`;
}

export function navFavouriteLabel(page: FavouritePage): string | null {
  if (!page.startsWith('nav:')) return null;
  try {
    return decodeURIComponent(page.slice(4));
  } catch {
    return null;
  }
}

export function loadFavouritePages(): Set<FavouritePage> {
  const key = companyStorageKey();
  const own = readList(key) ?? legacyList();
  if (own !== null) return new Set(own);
  // New client: start from the machine-wide bar and save it under the client's own key.
  const seed = readList(STORAGE_KEY) ?? [];
  if (key !== STORAGE_KEY && seed.length > 0) {
    try {
      window.localStorage.setItem(key, JSON.stringify(seed));
    } catch {
      /* storage unavailable: fall back to the shared list */
    }
  }
  return new Set(seed);
}

/** Bars saved before paths were normalised sit under the path exactly as it was spelled then. */
function legacyList(): FavouritePage[] | null {
  const path = useUiStore.getState().companyPath;
  if (!path) return null;
  const list = readList(`${STORAGE_KEY}:${path}`);
  if (list !== null) {
    try {
      window.localStorage.setItem(companyStorageKey(), JSON.stringify(list));
    } catch {
      /* keep reading the old key */
    }
  }
  return list;
}

export function storeFavouritePages(favourites: Set<FavouritePage>): void {
  window.localStorage.setItem(companyStorageKey(), JSON.stringify([...favourites]));
  window.dispatchEvent(new Event(FAVOURITES_CHANGED_EVENT));
}

export function toggleFavouritePage(favourites: Set<FavouritePage>, page: FavouritePage): Set<FavouritePage> {
  const next = new Set(favourites);
  if (next.has(page)) next.delete(page);
  else next.add(page);
  storeFavouritePages(next);
  return next;
}
