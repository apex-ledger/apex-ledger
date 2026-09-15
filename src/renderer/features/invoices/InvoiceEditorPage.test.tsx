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

  it('shows Print, PDF and Email on an empty invoice, greyed with the reason until it is saved', async () => {
    mockApi('invoices', 'nextNumber', 'INV-2026-0001');
    mockApi('invoices', 'list', []);
    mockApi('customers', 'list', []);
    mockApi('accounts', 'list', []);
    mockApi('products', 'list', []);

    render(<InvoiceEditorPage id="new" />);

    // Nothing entered yet: the three are on screen rather than appearing only after a save, which
    // is what made them impossible to find.
    for (const label of ['Print', 'PDF', 'Email']) {
      const button = await screen.findByRole('button', { name: label });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', expect.stringContaining('Save the invoice first'));
    }
    expect(screen.getByText('Email to')).toBeInTheDocument();
  });
});

describe('editing a saved invoice', () => {
  const saved = {
    id: 5, customerId: 3, invoiceNumber: 'INV-2026-0002', invoiceDate: '2026-09-15', dueDate: '2026-10-15', paymentTerms: 'net30',
    memo: null, customerPoNumber: null, shippingAddress: null, discountCents: 0, totalCents: 28_250, paidCents: 0, balanceDueCents: 28_250,
    status: 'unpaid', writtenOffCents: 0, invoiceJournalEntryId: 40, paymentJournalEntryId: null, foreignCurrency: null, foreignAmountCents: null, exchangeRate: null,
    lines: [{ id: 1, invoiceId: 5, lineOrder: 0, description: 'Accounting policy review', quantity: 1, unitPriceCents: 25_000, amountCents: 25_000, revenueAccountId: 9, productId: null, taxCode: 'HST', manualHstCents: null }],
  };
  function mockCommon() {
    mockApi('invoices', 'list', [saved]);
    mockApi('customers', 'list', [{ id: 3, name: 'Om Financial', email: 'om@example.com', isActive: true }]);
    mockApi('accounts', 'list', [{ id: 9, code: '4000', name: 'Service Revenue', accountType: 'Revenue', accountSubtype: null, normalBalance: 'Credit', parentId: null, gifiCode: null, isActive: true, isSystem: false, description: null, accountNumber: null, isTransferEligible: false }]);
    mockApi('products', 'list', []);
    mockApi('invoices', 'lineTags', [[]]);
  }

  it('reopens an unpaid invoice in the form and saves it back as the same invoice', async () => {
    mockCommon();
    mockApi('invoices', 'get', saved);
    mockApi('invoices', 'payments', []);
    mockApi('invoices', 'update', { ...saved, totalCents: 28_250 });

    render(<InvoiceEditorPage id={5} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Edit invoice' }));
    expect(await screen.findByText('Editing INV-2026-0002')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Accounting policy review')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(window.api.invoices.update).toHaveBeenCalledWith(expect.objectContaining({ id: 5, invoiceNumber: 'INV-2026-0002', lines: [expect.objectContaining({ description: 'Accounting policy review', unitPriceCents: 25_000 })] })));
    expect(window.api.invoices.create).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Edit invoice' })).toBeInTheDocument();
  });

  it('keeps a paid invoice closed to edits and says why', async () => {
    mockCommon();
    mockApi('invoices', 'get', { ...saved, paidCents: 28_250, balanceDueCents: 0, status: 'paid' });
    mockApi('invoices', 'payments', [{ id: 1, invoiceId: 5, paymentDate: '2026-09-20', amountCents: 28_250 }]);

    render(<InvoiceEditorPage id={5} />);

    const edit = await screen.findByRole('button', { name: 'Edit invoice' });
    await waitFor(() => expect(edit).toBeDisabled());
    expect(edit).toHaveAttribute('title', expect.stringContaining('payment has been received'));
  });
});
