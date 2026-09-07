import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Contact } from '@shared/domain/types';
import { mockApi } from '../../test/setup';
import { BillFormModal } from './BillFormModal';

const vendor = {
  id: 31,
  name: 'Castle Hill',
  isActive: true,
  paymentTerms: 'net30',
  defaultExpenseAccountId: null,
} as Contact;

describe('BillFormModal vendor selection', () => {
  it('keeps entered bill data when the vendor list refreshes and selects the newly available vendor', async () => {
    mockApi('accounts', 'list', []);
    mockApi('bills', 'list', []);
    mockApi('products', 'list', []);
    const props = { open: true, onClose: vi.fn(), onSaved: vi.fn() };
    const { rerender } = render(<BillFormModal {...props} vendors={[]} />);

    const invoiceNumber = screen.getByPlaceholderText('e.g. INV-10482');
    await userEvent.type(invoiceNumber, 'inv-12345');
    rerender(<BillFormModal {...props} vendors={[vendor]} />);

    await waitFor(() => expect(screen.getByDisplayValue('Castle Hill')).toBeInTheDocument());
    expect(invoiceNumber).toHaveValue('inv-12345');
  });

  it('explains that a vendor must be selected instead of silently disabling Save', async () => {
    mockApi('accounts', 'list', []);
    mockApi('bills', 'list', []);
    mockApi('products', 'list', []);
    render(<BillFormModal open onClose={vi.fn()} onSaved={vi.fn()} vendors={[]} />);

    const save = screen.getByRole('button', { name: 'Save & Close' });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(await screen.findByText(/Select a vendor from the list/)).toBeInTheDocument();
  });
});

describe('entering a bill from a receipt that shows the total and the tax', () => {
  it('keeps the typed total and tax and derives the base — no formula overrides the tax', async () => {
    mockApi('accounts', 'list', []);
    mockApi('bills', 'list', []);
    mockApi('products', 'list', []);
    render(<BillFormModal open onClose={vi.fn()} onSaved={vi.fn()} vendors={[]} />);
    await userEvent.selectOptions(screen.getByLabelText('Amounts are'), 'inclusive');
    const amount = screen.getByLabelText('Line 1 amount') as HTMLInputElement;
    await userEvent.clear(amount);
    await userEvent.type(amount, '137.50');
    await userEvent.tab();
    const tax = screen.getByLabelText('Line 1 tax amount') as HTMLInputElement;
    await userEvent.clear(tax);
    await userEvent.type(tax, '5.72');
    await userEvent.tab();
    await waitFor(() => expect(screen.getByTestId('bill-subtotal')).toHaveTextContent('131.78'));
    expect(screen.getByTestId('bill-tax')).toHaveTextContent('5.72');
    expect(screen.getByTestId('bill-total')).toHaveTextContent('137.50');
    expect(tax).toHaveValue('5.72');
  });

  it('opens full screen with a close control at the top right', () => {
    mockApi('accounts', 'list', []);
    mockApi('bills', 'list', []);
    mockApi('products', 'list', []);
    render(<BillFormModal open onClose={vi.fn()} onSaved={vi.fn()} vendors={[]} />);
    expect(screen.getByRole('dialog')).toHaveClass('fixed', 'inset-0');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add line' })).toBeInTheDocument();
  });
});
