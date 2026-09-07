import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUiStore } from '../app/store/uiStore';
import { loadFavouritePages, navFavouriteKey, toggleFavouritePage } from '../utils/favouritePages';
import { mockApi } from '../test/setup';
import { TopBar } from './TopBar';

describe('favourite bar picker', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState({ view: { kind: 'dashboard' } });
    mockApi('license', 'status', { edition: 'full' });
  });

  it('selects a sidebar destination from the top-right picker', async () => {
    render(<TopBar />);
    await userEvent.click(screen.getByRole('button', { name: /Favorite Bar/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Dashboard/i }));

    expect(loadFavouritePages().has(navFavouriteKey('Dashboard'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Open Dashboard' })).toBeInTheDocument();
  });

  it('shows starred tabs in the light-green bar and navigates from the shortcut', async () => {
    toggleFavouritePage(new Set(), navFavouriteKey('Chart of Accounts'));
    render(<TopBar />);

    const shortcut = screen.getByRole('button', { name: 'Open Chart of Accounts' });
    expect(shortcut).toBeInTheDocument();
    await userEvent.click(shortcut);

    await waitFor(() => expect(useUiStore.getState().view).toEqual({ kind: 'chartOfAccounts' }));
  });
});
