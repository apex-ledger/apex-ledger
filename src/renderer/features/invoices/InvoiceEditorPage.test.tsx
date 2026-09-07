import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../test/setup';
import { InvoiceEditorPage } from './InvoiceEditorPage';

describe('InvoiceEditorPage save guidance', () => {
  it('keeps Save actionable and explains the first missing requirement', async () => {
    mockApi('invoices', 'nextNumber', 'INV-2026-0001');
    mockApi('invoices', 'list', []);
    mockApi('customers', 'list', []);
    mockApi('accounts', 'list', []);
    mockApi('products', 'list', []);

    render(<InvoiceEditorPage id="new" />);

    expect(await screen.findByDisplayValue('INV-2026-0001')).toBeInTheDocument();
    const details = screen.getByTestId('invoice-details-grid');
    expect(details).toHaveClass('md:grid-cols-3', 'xl:grid-cols-6', 'gap-2', 'p-3');
    expect(screen.getByText('Due Date').closest('label')?.className).not.toContain('row-start');
    expect(screen.getByText('Terms').closest('label')?.className).not.toContain('row-start');
    expect(screen.getByText('Memo (optional)').closest('label')?.className).not.toContain('row-start');
    expect(screen.queryByRole('button', { name: 'New invoice' })).not.toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save Invoice' });
    expect(save).toBeEnabled();
    expect(screen.getByText(/To save: Select a customer from the list/)).toBeInTheDocument();

    await userEvent.click(save);
    await waitFor(() => expect(screen.getAllByText(/Select a customer from the list, or use/)).toHaveLength(2));
  });
});
