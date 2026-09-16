import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useUiStore } from '../app/store/uiStore';
import { CustomWorkspaceButton, WorkspaceModeSwitch } from './WorkspaceModeSwitch';

describe('the Daily Books / Custom Workspace switch', () => {
  it('turns the workspace on and back off, showing which is on', async () => {
    useUiStore.setState({ view: { kind: 'dashboard' }, yearEndMode: false });
    render(<WorkspaceModeSwitch />);
    expect(screen.getByRole('button', { name: 'Daily Books' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Custom Workspace' }));
    expect(useUiStore.getState().view.kind).toBe('yearEndWorkspace');
    expect(useUiStore.getState().yearEndMode).toBe(true);
    expect(screen.getByRole('button', { name: 'Custom Workspace' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Daily Books' }));
    expect(useUiStore.getState().yearEndMode).toBe(false);
    expect(useUiStore.getState().view.kind).toBe('dashboard');
  });

  it('opens the workspace from the button at the top of the sidebar', async () => {
    useUiStore.setState({ view: { kind: 'dashboard' }, yearEndMode: false });
    render(<CustomWorkspaceButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Custom Workspace' }));
    expect(useUiStore.getState().view.kind).toBe('yearEndWorkspace');
  });
});
