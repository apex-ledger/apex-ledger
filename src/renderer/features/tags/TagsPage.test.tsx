import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagsPage } from './TagsPage';
import { mockApi } from '../../test/setup';

/** Tag management, rendered.
 *
 * Tags are useless without somewhere to create them, and a P&L by Tag Group with no groups in the
 * file is an empty screen with no explanation. This is the screen that makes the rest reachable.
 */

const GROUP = {
  id: 1,
  name: 'Store',
  description: null,
  isActive: true,
  createdAt: '2025-01-01',
  tags: [
    { id: 10, tagGroupId: 1, name: 'Dundas', isActive: true, createdAt: '2025-01-01' },
    { id: 11, tagGroupId: 1, name: 'Kipling', isActive: true, createdAt: '2025-01-01' },
  ],
};

describe('the groups and their tags', () => {
  it('shows a group with its tags', async () => {
    mockApi('tags', 'groups', [GROUP]);
    render(<TagsPage />);

    expect(await screen.findByText('Store')).toBeInTheDocument();
    expect(screen.getByText('Dundas')).toBeInTheDocument();
    expect(screen.getByText('Kipling')).toBeInTheDocument();
  });

  it('explains an empty file rather than showing a blank page', async () => {
    mockApi('tags', 'groups', []);
    render(<TagsPage />);

    expect(await screen.findByText(/no tag groups yet/i)).toBeInTheDocument();
  });

  it('creates a group', async () => {
    mockApi('tags', 'groups', []);
    render(<TagsPage />);

    await waitFor(() => expect(screen.getByPlaceholderText(/new group/i)).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText(/new group/i), 'Vehicle');
    await userEvent.click(screen.getByRole('button', { name: /add group/i }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).api.tags.createGroup).toHaveBeenCalledWith(expect.objectContaining({ name: 'Vehicle' }));
  });

  it('adds a tag into a specific group', async () => {
    mockApi('tags', 'groups', [GROUP]);
    render(<TagsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /add tag/i }));
    await userEvent.type(screen.getByPlaceholderText(/new tag in store/i), 'Malton');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).api.tags.create).toHaveBeenCalledWith({ tagGroupId: 1, name: 'Malton' });
  });

  it('will not create a group with no name', async () => {
    mockApi('tags', 'groups', []);
    render(<TagsPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /add group/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /add group/i }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).api.tags.createGroup).not.toHaveBeenCalled();
  });
});

describe('keeping history readable', () => {
  it('offers deactivation alongside deletion', async () => {
    // Deleting a group that is already used would remove it from past reports with no visible
    // reason; deactivating is the move that keeps history intact, so it has to be on screen.
    mockApi('tags', 'groups', [GROUP]);
    render(<TagsPage />);

    expect(await screen.findByRole('button', { name: /make inactive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('surfaces a refused delete instead of appearing to work', async () => {
    mockApi('tags', 'groups', [GROUP]);
    mockApi('tags', 'deleteGroup', { ok: false, error: 'This group is already used on transactions.' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TagsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /delete/i }));
    expect(await screen.findByText(/already used on transactions/i)).toBeInTheDocument();
  });

  it('marks an inactive group as such', async () => {
    mockApi('tags', 'groups', [{ ...GROUP, isActive: false }]);
    render(<TagsPage />);

    expect(await screen.findByText(/\(inactive\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reactivate/i })).toBeInTheDocument();
  });
});
