import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUiStore } from '../app/store/uiStore';
import { mockApi } from '../test/setup';
import { QuickSearchPalette } from './QuickSearchPalette';

describe('search everything', () => {
  beforeEach(() => {
    useUiStore.setState({ view: { kind: 'dashboard' }, pendingSearchTerm: null });
    mockApi('customers', 'list', [{ id: 7, name: 'Acme Ltd', email: 'ap@acme.example', phone: null, isActive: true }]);
    mockApi('vendors', 'list', [{ id: 3, name: 'Bell Canada', email: null, phone: '416-555-0100', isActive: true }]);
    mockApi('invoices', 'list', [{ id: 42, customerId: 7, invoiceNumber: 'INV-1042', memo: 'Tower repair', totalCents: 113_000, status: 'unpaid' }]);
    mockApi('bills', 'list', [{ id: 9, vendorId: 3, billNumber: 'B-77', memo: null, amountCents: 5_650, status: 'paid' }]);
    mockApi('journal', 'list', [{ id: 15, entryDate: '2026-03-01', memo: 'Opening balances', reference: 'OB-1', status: 'posted' }]);
    mockApi('products', 'list', [{ id: 2, name: 'Widget', sku: 'WGT-1', barcode: null, description: null, salePriceCents: 1_000 }]);
  });

  it('finds an invoice by its number and opens it', async () => {
    render(<QuickSearchPalette open onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Search everything' }), '1042');

    const hit = await screen.findByRole('button', { name: /INV-1042 — Acme Ltd/ });
    await userEvent.click(hit);
    expect(useUiStore.getState().view).toEqual({ kind: 'invoiceEditor', id: 42 });
  });

  it('finds a vendor by phone number and hands the name to the vendor list', async () => {
    render(<QuickSearchPalette open onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Search everything' }), '555-0100');

    await userEvent.click(await screen.findByRole('button', { name: /Bell Canada/ }));
    await waitFor(() => expect(useUiStore.getState().view).toMatchObject({ kind: 'expenses', tab: 'vendors', vendorId: 3 }));
    expect(useUiStore.getState().pendingSearchTerm).toBe('Bell Canada');
  });

  it('finds a paid bill and lands on the Paid tab with it selected', async () => {
    render(<QuickSearchPalette open onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Search everything' }), 'B-77');

    await userEvent.click(await screen.findByRole('button', { name: /Vendor invoice B-77/ }));
    expect(useUiStore.getState().view).toMatchObject({ kind: 'expenses', tab: 'paid', billId: 9 });
  });

  it('finds a journal entry by memo, a product by SKU, and a report by name', async () => {
    render(<QuickSearchPalette open onClose={vi.fn()} />);
    const box = screen.getByRole('textbox', { name: 'Search everything' });

    await userEvent.type(box, 'opening');
    expect(await screen.findByRole('button', { name: /Opening balances/ })).toBeInTheDocument();

    await userEvent.clear(box);
    await userEvent.type(box, 'wgt');
    expect(await screen.findByRole('button', { name: /Widget/ })).toBeInTheDocument();

    await userEvent.clear(box);
    await userEvent.type(box, 'receivable ageing');
    expect(await screen.findByRole('button', { name: /Accounts Receivable Ageing/ })).toBeInTheDocument();
  });

  it('opens the selected result with Enter', async () => {
    const onClose = vi.fn();
    render(<QuickSearchPalette open onClose={onClose} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Search everything' }), 'INV-1042');
    await screen.findByRole('button', { name: /INV-1042/ });
    await userEvent.keyboard('{Enter}');

    expect(useUiStore.getState().view).toEqual({ kind: 'invoiceEditor', id: 42 });
    expect(onClose).toHaveBeenCalled();
  });
});
