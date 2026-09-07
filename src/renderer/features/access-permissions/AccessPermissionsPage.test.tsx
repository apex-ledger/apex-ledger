import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi } from '../../test/setup';
import { AccessPermissionsPage } from './AccessPermissionsPage';

describe('Users & Access', () => {
  it('shows an administrator when each person signed in and out', async () => {
    mockApi('access', 'usersList', []);
    mockApi('access', 'signInHistory', [
      { id: 1, actorKey: 'company-user:2', actorName: 'Kim Lee', actorEmail: 'kim@example.ca', role: 'bookkeeper', windowId: 1, signedInAt: new Date(Date.now() - 3_600_000).toISOString(), signedOutAt: new Date().toISOString(), endReason: 'locked' },
      { id: 2, actorKey: 'local:administrator', actorName: 'Local Administrator', actorEmail: null, role: 'administrator', windowId: 1, signedInAt: new Date().toISOString(), signedOutAt: null, endReason: null },
    ]);
    render(<AccessPermissionsPage />);

    expect(await screen.findByRole('heading', { name: 'Sign-in history' })).toBeInTheDocument();
    expect(await screen.findByText('Locked the screen')).toBeInTheDocument();
    expect(screen.getByText('1h 00m')).toBeInTheDocument();
    expect(screen.getAllByText(/signed in now/).length).toBeGreaterThan(0);
  });

  it('creates a named company invitation with a selected access level', async () => {
    mockApi('access', 'usersList', []);
    mockApi('access', 'usersInvite', { user: { id: 1 }, inviteUrl: 'apex-ledger://invite/test-token' });
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<AccessPermissionsPage />);

    await userEvent.click(screen.getByRole('button', { name: '+ Add User' }));
    await userEvent.type(screen.getByLabelText('First name'), 'Krishan');
    await userEvent.type(screen.getByLabelText('Last name'), 'Prabhakar');
    await userEvent.type(screen.getByLabelText('Email'), 'krishan@example.ca');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Role' }), 'accountant');
    await userEvent.click(screen.getByRole('button', { name: 'Create Invite' }));

    expect(window.api.access.usersInvite).toHaveBeenCalledWith(expect.objectContaining({
      firstName: 'Krishan', lastName: 'Prabhakar', email: 'krishan@example.ca', role: 'accountant',
    }));
    expect(clipboard).toHaveBeenCalledWith('apex-ledger://invite/test-token');
  });
});
