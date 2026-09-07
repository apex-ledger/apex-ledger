import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUiStore } from '../app/store/uiStore';
import { mockApi } from '../test/setup';
import { ContactPaymentHistory } from './ContactPaymentHistory';

describe('a customer\'s invoices and payments together', () => {
  it('shows each invoice with what was paid against it, and opens the payments beneath', async () => {
    mockApi('invoices', 'list', [
      { id: 1, customerId: 7, invoiceNumber: 'INV-1001', invoiceDate: '2026-01-10', dueDate: '2026-02-09', totalCents: 50_000, paidCents: 50_000, balanceDueCents: 0, status: 'paid' },
      { id: 2, customerId: 7, invoiceNumber: 'INV-1002', invoiceDate: '2026-02-10', dueDate: '2026-02-20', totalCents: 20_000, paidCents: 5_000, balanceDueCents: 15_000, status: 'unpaid' },
      { id: 3, customerId: 8, invoiceNumber: 'INV-1003', invoiceDate: '2026-02-11', dueDate: '2026-03-20', totalCents: 1_000, paidCents: 0, balanceDueCents: 1_000, status: 'unpaid' },
    ]);
    mockApi('invoices', 'payments', [
      { id: 11, invoiceId: 1, paymentDate: '2026-02-01', amountCents: 50_000, moneyAccountId: 100, journalEntryId: 501, depositId: null, memo: 'e-transfer' },
      { id: 12, invoiceId: 2, paymentDate: '2026-02-15', amountCents: 5_000, moneyAccountId: 100, journalEntryId: 502, depositId: null, memo: null },
    ]);
    mockApi('accounts', 'list', [{ id: 100, name: 'Chequing' }]);
    const onPay = vi.fn();
    render(<ContactPaymentHistory kind="customer" contactId={7} contactName="Acme Ltd" onPay={onPay} />);

    expect(await screen.findByRole('button', { name: 'INV-1002' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'INV-1003' })).not.toBeInTheDocument();
    expect(screen.getByText('700.00')).toBeInTheDocument();
    expect(screen.getByText('550.00')).toBeInTheDocument();

    // Both invoices carry one payment; INV-1001 (the older one, listed second) is the e-transfer.
    await userEvent.click(screen.getAllByRole('button', { name: /1 payment ▸/ })[1]);
    expect(await screen.findByText('e-transfer')).toBeInTheDocument();
    expect(screen.getByText('Received into Chequing')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Receive' }));
    expect(onPay).toHaveBeenCalledWith(2);

    await userEvent.click(screen.getByRole('button', { name: 'INV-1001' }));
    expect(useUiStore.getState().view).toEqual({ kind: 'invoiceEditor', id: 1 });
  });
});
