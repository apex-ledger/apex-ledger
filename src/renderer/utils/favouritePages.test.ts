import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../app/store/uiStore';
import { loadFavouritePages, navFavouriteKey, navFavouriteLabel, toggleFavouritePage, type FavouritePage } from './favouritePages';

describe('favourites per company', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.getState().setCompany(null, null);
  });

  it('keeps each company file on its own bar', () => {
    useUiStore.getState().setCompany('C:/clients/A/A.company', 'A');
    let a = loadFavouritePages();
    a = toggleFavouritePage(a, 'nav:Payroll');
    expect(a.has('nav:Payroll')).toBe(true);

    useUiStore.getState().setCompany('C:/clients/B/B.company', 'B');
    expect(loadFavouritePages().has('nav:Payroll')).toBe(false);

    useUiStore.getState().setCompany('C:/clients/A/A.company', 'A');
    expect(loadFavouritePages().has('nav:Payroll')).toBe(true);
  });

  it('treats the same file spelled with other slashes or case as the same company', () => {
    useUiStore.getState().setCompany('C:/clients/A/A.company', 'A');
    toggleFavouritePage(loadFavouritePages(), 'nav:Payroll');

    useUiStore.getState().setCompany('c:\\clients\\a\\A.company', 'A');
    expect(loadFavouritePages().has('nav:Payroll')).toBe(true);
  });

  it('still finds a bar saved under the exact path before keys were normalised', () => {
    window.localStorage.setItem('northLedger.favouritePages:C:\\Clients\\Old\\Old.company', JSON.stringify(['nav:Payroll']));
    useUiStore.getState().setCompany('C:\\Clients\\Old\\Old.company', 'Old');
    expect(loadFavouritePages().has('nav:Payroll')).toBe(true);
  });

  it('starts a brand-new company from the machine-wide bar, then keeps it separate', () => {
    window.localStorage.setItem('northLedger.favouritePages', JSON.stringify(['nav:Dashboard']));
    useUiStore.getState().setCompany('C:/clients/New/New.company', 'New');
    const fresh = loadFavouritePages();
    expect(fresh.has('nav:Dashboard')).toBe(true);
    toggleFavouritePage(fresh, 'nav:Dashboard');
    expect(loadFavouritePages().has('nav:Dashboard')).toBe(false);
    useUiStore.getState().setCompany(null, null);
    expect(loadFavouritePages().has('nav:Dashboard')).toBe(true);
  });
});

describe('accountant favourite pages', () => {
  beforeEach(() => { window.localStorage.clear(); useUiStore.getState().setCompany(null, null); });

  it('persists report and form favourites together', () => {
    let favourites = new Set<FavouritePage>();
    favourites = toggleFavouritePage(favourites, 'report:balanceSheetSummary');
    favourites = toggleFavouritePage(favourites, 'form:new_client_intake');
    expect([...loadFavouritePages()]).toEqual(['report:balanceSheetSummary', 'form:new_client_intake']);
  });

  it('removes a favourite when starred again', () => {
    let favourites = toggleFavouritePage(new Set<FavouritePage>(), 'report:trialBalance');
    favourites = toggleFavouritePage(favourites, 'report:trialBalance');
    expect(favourites.size).toBe(0);
    expect(loadFavouritePages().size).toBe(0);
  });

  it('persists a sidebar tab with a reversible stable key', () => {
    const key = navFavouriteKey('Chart of Accounts');
    const favourites = toggleFavouritePage(new Set<FavouritePage>(), key);
    expect([...loadFavouritePages()]).toEqual([key]);
    expect(navFavouriteLabel(key)).toBe('Chart of Accounts');
  });
});
