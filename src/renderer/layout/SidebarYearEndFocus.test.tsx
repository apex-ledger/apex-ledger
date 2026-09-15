import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../test/setup';
import { useUiStore } from '../app/store/uiStore';
import { Sidebar } from './Sidebar';

describe('Sidebar in Year-End Workspace focus mode', () => {
  it('hides the day-to-day nav and shows only the workspace sections, with a way back to the full menu', async () => {
    mockApi('receiptInbox', 'list', []);
    mockApi('actionCentre', 'items', { counts: { overdue: 0, today: 0, soon: 0 } });
    useUiStore.setState({ view: { kind: 'welcome' }, yearEndMode: false });
    useUiStore.getState().setView({ kind: 'yearEndWorkspace' });

    render(<Sidebar />);

    expect(screen.getByText('Sign-off checklist')).toBeInTheDocument();
    expect(screen.getByText('Payroll & regional filings')).toBeInTheDocument();
    expect(screen.getByText('Final statements')).toBeInTheDocument();
    expect(screen.getByText('All Sales')).toBeInTheDocument();
    expect(screen.getByText('Vendor Bills')).toBeInTheDocument();
    expect(screen.getByText('Expense Transactions')).toBeInTheDocument();
    expect(screen.getByText('Bank Transactions')).toBeInTheDocument();
    expect(screen.getByText('Journal Entries')).toBeInTheDocument();
    expect(screen.queryByText('Sales & Payments')).not.toBeInTheDocument();
    expect(screen.queryByText('Quick Entry')).not.toBeInTheDocument();

    // The whole point of the mode: opening the client's bills does NOT spring the day-to-day
    // sidebar back, which is what it did when focus was tied to the workspace view alone.
    await userEvent.click(screen.getByText('Vendor Bills'));
    expect(useUiStore.getState().view).toEqual({ kind: 'expenses', tab: 'bills' });
    expect(useUiStore.getState().yearEndMode).toBe(true);
    expect(await screen.findByText("Client's data entry — the whole year")).toBeInTheDocument();
    expect(screen.queryByText('Sales & Payments')).not.toBeInTheDocument();
    // The workspace itself stays one click away, while the on-page jump links drop out.
    expect(screen.getByText('Year-End Workspace')).toBeInTheDocument();
    expect(screen.queryByText('Sign-off checklist')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('← Full menu'));
    expect(useUiStore.getState().view.kind).toBe('dashboard');
    expect(useUiStore.getState().yearEndMode).toBe(false);
    expect(await screen.findByText('Sales & Payments')).toBeInTheDocument();
  });

  it('lets the reviewer pin an extra tab of their own into the focused nav', async () => {
    mockApi('receiptInbox', 'list', []);
    mockApi('actionCentre', 'items', { counts: { overdue: 0, today: 0, soon: 0 } });
    window.localStorage.clear();
    useUiStore.setState({ view: { kind: 'welcome' }, yearEndMode: false });
    useUiStore.getState().setView({ kind: 'yearEndWorkspace' });

    render(<Sidebar />);

    expect(screen.queryByText('Fixed Assets')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('+ Add a tab'));
    await userEvent.click(screen.getByLabelText('Fixed Assets'));
    await userEvent.click(screen.getByText('Done adding'));

    expect(screen.getByText('Fixed Assets')).toBeInTheDocument();
  });
});
