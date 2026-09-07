import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseOrdersPage } from './PurchaseOrdersPage';
import { mockApi } from '../../test/setup';

/** The purchase orders list, rendered.
 *
 * Same guard as estimates, pointed the other way: "Enter bill" is the only control here that
 * reaches accounts payable, and offering it twice would put the supplier's invoice on the books
 * twice for one order.
 */

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    vendorId: 3,
    poNumber: 'PO-2026-0001',
    orderDate: '2026-02-01',
    expectedDate: '2026-02-14',
    memo: null,
    totalCents: 120_000,
    status: 'sent',
    convertedBillId: null,
    convertedAt: null,
    createdAt: '2026-02-01',
    ...overrides,
  };
}

function withOrders(rows: ReturnType<typeof order>[]) {
  mockApi('purchaseOrders', 'list', rows);
  mockApi('vendors', 'list', [{ id: 3, name: 'Wolseley Supply', isActive: true }]);
}

describe('the list', () => {
  it('shows an order with its supplier', async () => {
    withOrders([order()]);
    render(<PurchaseOrdersPage />);

    expect(await screen.findByText('PO-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Wolseley Supply')).toBeInTheDocument();
  });

  it('totals what is on order and not yet billed', async () => {
    withOrders([order()]);
    render(<PurchaseOrdersPage />);

    expect(await screen.findByText(/on order, not yet billed/i)).toBeInTheDocument();
  });

  it('explains an empty file', async () => {
    withOrders([]);
    render(<PurchaseOrdersPage />);

    expect(await screen.findByText(/no purchase orders yet/i)).toBeInTheDocument();
  });
});

describe('entering the supplier bill', () => {
  it('is offered on an open order', async () => {
    withOrders([order()]);
    render(<PurchaseOrdersPage />);

    expect(await screen.findByRole('button', { name: /enter bill/i })).toBeInTheDocument();
  });

  it('is NOT offered on one already billed', async () => {
    // The failure this prevents: the same order on the books twice.
    withOrders([order({ status: 'converted', convertedBillId: 4 })]);
    render(<PurchaseOrdersPage />);

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'all');
    await waitFor(() => expect(screen.getByText('PO-2026-0001')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /enter bill/i })).not.toBeInTheDocument();
  });

  it('is NOT offered on a cancelled order', async () => {
    withOrders([order({ status: 'cancelled' })]);
    render(<PurchaseOrdersPage />);

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'all');
    expect(screen.queryByRole('button', { name: /enter bill/i })).not.toBeInTheDocument();
  });

  it('says when categories had to be combined', async () => {
    // A bill carries one category; an order can carry several. Better said out loud than found
    // later on the general ledger.
    withOrders([order()]);
    mockApi('purchaseOrders', 'convertToBill', {
      purchaseOrder: order({ status: 'converted', convertedBillId: 4 }),
      bill: { id: 4 },
      combinedCategories: 3,
    });
    vi.spyOn(window, 'prompt').mockReturnValue('SUP-1001');
    render(<PurchaseOrdersPage />);

    await userEvent.click(await screen.findByRole('button', { name: /enter bill/i }));
    expect(await screen.findByText(/3 categories were combined/i)).toBeInTheDocument();
  });

  it('stays quiet when there was only one category', async () => {
    withOrders([order()]);
    mockApi('purchaseOrders', 'convertToBill', {
      purchaseOrder: order({ status: 'converted', convertedBillId: 4 }),
      bill: { id: 4 },
      combinedCategories: null,
    });
    vi.spyOn(window, 'prompt').mockReturnValue('SUP-1001');
    render(<PurchaseOrdersPage />);

    await userEvent.click(await screen.findByRole('button', { name: /enter bill/i }));
    await waitFor(() => expect(screen.queryByText(/categories were combined/i)).not.toBeInTheDocument());
  });

  it('surfaces a refusal rather than appearing to work', async () => {
    withOrders([order()]);
    mockApi('purchaseOrders', 'convertToBill', { ok: false, error: 'This purchase order has already been billed.' });
    vi.spyOn(window, 'prompt').mockReturnValue('SUP-1001');
    render(<PurchaseOrdersPage />);

    await userEvent.click(await screen.findByRole('button', { name: /enter bill/i }));
    expect(await screen.findByText(/already been billed/i)).toBeInTheDocument();
  });
});

describe('filtering', () => {
  it('hides settled orders by default', async () => {
    withOrders([order({ id: 1 }), order({ id: 2, poNumber: 'PO-2026-0002', status: 'cancelled' })]);
    render(<PurchaseOrdersPage />);

    await waitFor(() => expect(screen.getByText('PO-2026-0001')).toBeInTheDocument());
    expect(screen.queryByText('PO-2026-0002')).not.toBeInTheDocument();
  });
});
