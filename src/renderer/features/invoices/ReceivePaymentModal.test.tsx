import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../test/setup';
import { ReceivePaymentModal } from './ReceivePaymentModal';

const invoices = [
  { id: 1, customerId: 7, invoiceNumber: 'INV-1001', invoiceDate: '2026-02-01', dueDate: '2026-03-03', totalCents: 50_000, paidCents: 0, balanceDueCents: 50_000, status: 'unpaid' },
  { id: 2, customerId: 7, invoiceNumber: 'INV-1002', invoiceDate: '2026-03-01', dueDate: '2099-03-31', totalCents: 20_000, paidCents: 5_000, balanceDueCents: 15_000, status: 'unpaid' },
  { id: 3, customerId: 7, invoiceNumber: 'INV-0900', invoiceDate: '2026-01-01', dueDate: '2026-01-31', totalCents: 9_000, paidCents: 9_000, balanceDueCents: 0, status: 'paid' },
  { id: 4, customerId: 8, invoiceNumber: 'INV-1003', invoiceDate: '2026-03-02', dueDate: '2099-04-01', totalCents: 1_000, paidCents: 0, balanceDueCents: 1_000, status: 'unpaid' },
];

describe('receiving a payment from the toolbar', () => {
  it('lists only the chosen customer\'s unpaid invoices, with what is still owed, and pays the one picked', async () => {
    mockApi('accounts', 'list', []);
    mockApi('invoices', 'list', invoices);
    mockApi('customers', 'list', [{ id: 7, name: 'Acme Ltd', isActive: true }, { id: 8, name: 'Bell', isActive: true }]);
    mockApi('invoices', 'receivePayment', { id: 2 });
    const onReceived = vi.fn();
    render(<ReceivePaymentModal open onClose={vi.fn()} onReceived={onReceived} invoiceId={null} />);

    const invoiceSelect = await screen.findByRole('combobox', { name: 'Invoice' });
    expect(invoiceSelect).toBeDisabled();

    await userEvent.click(screen.getByPlaceholderText('Who is paying?'));
    await userEvent.click(await screen.findByText('Acme Ltd'));

    await waitFor(() => expect(invoiceSelect).toBeEnabled());
    const labels = screen.getAllByRole('option').map((option) => option.textContent);
    expect(labels).toContain('INV-1001 — 2026-02-01 — $500.00 due');
    expect(labels).toContain('INV-1002 — 2026-03-01 — $150.00 due of $200.00');
    expect(labels.some((label) => label?.includes('INV-0900'))).toBe(false);
    expect(labels.some((label) => label?.includes('INV-1003'))).toBe(false);

    await userEvent.selectOptions(invoiceSelect, '2');
    await userEvent.click(screen.getByRole('button', { name: 'Receive Payment' }));

    await waitFor(() => expect(window.api.invoices.receivePayment).toHaveBeenCalledWith(expect.objectContaining({ id: 2, amountCents: 15_000, bankAccountId: null })));
    expect(onReceived).toHaveBeenCalled();
  });

  it('opens straight on the invoice when one is given', async () => {
    mockApi('accounts', 'list', []);
    mockApi('invoices', 'list', invoices);
    mockApi('customers', 'list', [{ id: 7, name: 'Acme Ltd', isActive: true }]);
    render(<ReceivePaymentModal open onClose={vi.fn()} onReceived={vi.fn()} invoiceId={1} />);

    expect(await screen.findByRole('combobox', { name: 'Invoice' })).toHaveValue('1');
    expect(screen.getByText(/overdue since 2026-03-03/)).toBeInTheDocument();
  });
});
