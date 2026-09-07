import { useEffect, useMemo, useRef, useState } from 'react';
import type { Feature } from '@shared/domain/licensing/editions';
import { useUiStore } from '../app/store/uiStore';
import { useEdition } from '../hooks/useEdition';
import {
  FAVOURITES_CHANGED_EVENT,
  loadFavouritePages,
  navFavouriteKey,
  navFavouriteLabel,
  storeFavouritePages,
  toggleFavouritePage,
  type FavouritePage,
} from '../utils/favouritePages';
import { BOOKKEEPING_NAV, MAIN_NAV, QUICK_ENTRY_NAV_ITEM, type NavItem } from './Sidebar';

function flattenNavigation(items: NavItem[], can: (feature: Feature) => boolean): NavItem[] {
  const rows: NavItem[] = [];
  for (const item of items) {
    if (item.feature && !can(item.feature)) continue;
    rows.push(item);
    if (item.children) rows.push(...flattenNavigation(item.children, can));
  }
  return rows;
}

import { usePageBreadcrumb } from './pageTitles';

/** The first two words of the company name, enough to tell clients apart on a narrow bar. The
 * full name is on the button's tooltip and inside the picker. */
export function shortCompanyName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).join(' ');
}

export function favouriteNavigationItems(
  favourites: Set<FavouritePage>,
  items: NavItem[],
): NavItem[] {
  const byLabel = new Map(items.map((item) => [item.label, item]));
  return [...favourites]
    .map(navFavouriteLabel)
    .filter((label): label is string => label !== null)
    .map((label) => byLabel.get(label))
    .filter((item): item is NavItem => item !== undefined);
}

/** The shared light-green strip above every working sheet. The sidebar stays uncluttered: this one
 * top-right picker owns the complete favourite list. */
export function TopBar() {
  const setView = useUiStore((state) => state.setView);
  const companyPath = useUiStore((state) => state.companyPath);
  const companyLegalName = useUiStore((state) => state.companyLegalName);
  const { can } = useEdition();
  const { section, title } = usePageBreadcrumb();
  const [favourites, setFavourites] = useState<Set<FavouritePage>>(() => loadFavouritePages());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const navigation = useMemo(
    () => flattenNavigation([QUICK_ENTRY_NAV_ITEM, ...MAIN_NAV, ...BOOKKEEPING_NAV], can),
    [can],
  );
  const favouriteItems = favouriteNavigationItems(favourites, navigation);

  // A different client file means a different bar.
  useEffect(() => {
    setFavourites(loadFavouritePages());
    // Other screens that show stars (Reports hub, Forms) reload on this event.
    window.dispatchEvent(new Event(FAVOURITES_CHANGED_EVENT));
  }, [companyPath]);

  useEffect(() => {
    const refresh = () => setFavourites(loadFavouritePages());
    window.addEventListener(FAVOURITES_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(FAVOURITES_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const close = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [pickerOpen]);

  const pickerItems = navigation.filter((item, index) =>
    navigation.findIndex((candidate) => candidate.label === item.label) === index &&
    item.label.toLowerCase().includes(pickerSearch.trim().toLowerCase()),
  );

  function toggle(item: NavItem) {
    setFavourites((current) => toggleFavouritePage(current, navFavouriteKey(item.label)));
  }

  return (
    <>
    {/* One strip: the sheet you are on, then the shortcuts. The title sits apart at the left edge,
        behind a divider and not styled as a pill, so it never reads as a favourite. A title strip
        of its own above this was an empty band on most pages. */}
    <div className="sticky top-0 z-20 flex min-h-8 flex-shrink-0 items-center gap-2 overflow-visible border-b border-emerald-200 bg-emerald-50 px-2 py-1">
      {title && section && <span className="shrink-0 text-xs text-brand-700" data-testid="open-page-section">{section} ›</span>}
      {title && (
        <h1 className="shrink-0 rounded-full bg-brand-100 px-3 py-0.5 text-sm font-semibold text-brand-900" data-testid="open-page-indicator" title="The page you are on">
          {title}
        </h1>
      )}
      <div ref={pickerRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
          title={companyLegalName ? `Favourites saved for ${companyLegalName}` : 'Favourites'}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100"
        >
          Favorite Bar{companyLegalName ? <span className="font-normal text-emerald-700"> · {shortCompanyName(companyLegalName)}</span> : null} <span aria-hidden="true">▾</span>
        </button>
        {pickerOpen && (
          <div role="menu" aria-label="Choose favorite bar items" className="absolute left-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
            <div className="border-b border-gray-100 p-2">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">Choose sidebar options</div>
              {companyLegalName && <div className="mb-1 text-[11px] text-gray-500">Saved for {companyLegalName} only. Other companies keep their own bar.</div>}
              <input
                autoFocus
                value={pickerSearch}
                onChange={(event) => setPickerSearch(event.target.value)}
                placeholder="Search all sidebar options…"
                className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-center gap-3 border-b border-gray-100 px-2.5 py-1.5 text-xs">
              <button type="button" onClick={() => { const next = new Set<FavouritePage>(favourites); for (const item of pickerItems) next.add(navFavouriteKey(item.label)); storeFavouritePages(next); setFavourites(next); }} className="font-semibold text-emerald-700 hover:underline">
                Select all{pickerSearch.trim() ? ' shown' : ''}
              </button>
              <button type="button" onClick={() => { const next = new Set<FavouritePage>(favourites); for (const item of pickerItems) next.delete(navFavouriteKey(item.label)); storeFavouritePages(next); setFavourites(next); }} className="font-semibold text-gray-600 hover:underline">
                Clear{pickerSearch.trim() ? ' shown' : ' all'}
              </button>
              <span className="ml-auto text-gray-400">{favouriteItems.length} on bar</span>
            </div>
            <div className="max-h-[28rem] overflow-y-auto p-1.5">
              {pickerItems.map((item) => {
                const key = navFavouriteKey(item.label);
                const selected = favourites.has(key);
                return (
                  <label key={item.label} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-gray-800 hover:bg-emerald-50">
                    <input type="checkbox" checked={selected} onChange={() => toggle(item)} />
                    <span className="text-gray-500">{item.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {selected && <span className="text-xs font-semibold text-emerald-700">On bar</span>}
                  </label>
                );
              })}
              {pickerItems.length === 0 && <p className="p-3 text-sm text-gray-400">No matching sidebar option.</p>}
            </div>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Favourite pages">
        {favouriteItems.length === 0 ? (
          <span className="whitespace-nowrap text-xs text-emerald-700/70">Use Favorite Bar to choose shortcuts</span>
        ) : (
          favouriteItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setView(item.view)}
              aria-label={`Open ${item.label}`}
              title={`Open ${item.label}`}
              className="flex shrink-0 items-center gap-0.5 rounded-full border border-emerald-200 bg-white px-1.5 py-0.5 text-[11px] font-medium leading-tight text-emerald-900 hover:bg-emerald-100"
            >
              <span className="text-[9px] text-gold-500">★</span>
              {item.label}
            </button>
          ))
        )}
      </div>
    </div>
    </>
  );
}
