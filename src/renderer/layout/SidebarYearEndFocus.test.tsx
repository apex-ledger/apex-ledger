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
    useUiStore.setState({ view: { kind: 'yearEndWorkspace' } });

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

    await userEvent.click(screen.getByText('Vendor Bills'));
    expect(useUiStore.getState().view).toEqual({ kind: 'expenses', tab: 'bills' });

    useUiStore.setState({ view: { kind: 'yearEndWorkspace' } });
    await userEvent.click(await screen.findByText('← Full menu'));
    expect(useUiStore.getState().view.kind).toBe('dashboard');
  });
});
