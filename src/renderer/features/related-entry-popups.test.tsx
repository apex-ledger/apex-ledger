import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../test/setup';
import { EstimateEditorPage } from './estimates/EstimateEditorPage';
import { PurchaseOrderEditorPage } from './purchase-orders/PurchaseOrderEditorPage';
import { CreditNoteFormModal } from './credit-notes/CreditNoteFormModal';
import { InvoiceEditorPage } from './invoices/InvoiceEditorPage';

function commonMocks() {
  mockApi('accounts', 'list', []);
  mockApi('customers', 'list', []);
  mockApi('vendors', 'list', []);
  mockApi('products', 'list', []);
  mockApi('company', 'get', null);
}

describe('related records stay inside the current entry flow', () => {
  it('offers compact customer and product creation from a new estimate', async () => {
    commonMocks();
    mockApi('estimates', 'list', []);
    mockApi('estimates', 'nextNumber', 'EST-2026-0001');
    render(<EstimateEditorPage id="new" />);

    await userEvent.click(screen.getByPlaceholderText('Select a customer…'));
    expect(await screen.findByRole('button', { name: '+ Add New Customer' })).toBeInTheDocument();

    await userEvent.click(screen.getByPlaceholderText('Optional product…'));
    expect(await screen.findByRole('button', { name: '+ New Product or Service' })).toBeInTheDocument();
  });

  it('offers compact supplier, product, and category creation from a purchase order', async () => {
    commonMocks();
    mockApi('purchaseOrders', 'list', []);
    mockApi('purchaseOrders', 'nextNumber', 'PO-2026-0001');
    render(<PurchaseOrderEditorPage id="new" />);

    await userEvent.click(screen.getByPlaceholderText('Select a vendor…'));
    expect(await screen.findByRole('button', { name: '+ Add New Vendor' })).toBeInTheDocument();

    await userEvent.click(screen.getByPlaceholderText('Optional product…'));
    expect(await screen.findByRole('button', { name: '+ New Product or Service' })).toBeInTheDocument();

    await userEvent.click(screen.getByPlaceholderText('Category…'));
    expect(await screen.findByRole('button', { name: '+ New expense or asset category' })).toBeInTheDocument();
  });

  it('saves a product created from an invoice into Products & Inventory and selects it immediately', async () => {
    commonMocks();
    mockApi('accounts', 'list', [{
      id: 41,
      code: '4000',
      name: 'Sales',
      accountType: 'Revenue',
      accountSubtype: null,
      normalBalance: 'Credit',
      parentId: null,
      gifiCode: null,
      isActive: true,
      isSystem: false,
      description: null,
      accountNumber: null,
      isTransferEligible: false,
    }]);
    mockApi('invoices', 'list', []);
    mockApi('invoices', 'nextNumber', 'INV-2026-0001');
    mockApi('products', 'create', {
      id: 71,
      sku: null,
      name: 'Glass',
      description: null,
      unit: 'each',
      salePriceCents: 0,
      incomeAccountId: 41,
      cogsAccountId: null,
      assetAccountId: null,
      trackQuantity: false,
      isActive: true,
      createdAt: '2026-09-01T00:00:00.000Z',
    });

    render(<InvoiceEditorPage id="new" />);

    const productPicker = await screen.findByPlaceholderText('Service — no stock');
    await userEvent.click(productPicker);
    await userEvent.type(productPicker, 'Glass');
    await userEvent.click(await screen.findByRole('button', { name: '+ New Product “Glass”' }));

    expect(await screen.findByText('Saving here adds this item to Products & Inventory and selects it on the current transaction.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add Product / Service' }));

    await waitFor(() => expect(window.api.products.create).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByPlaceholderText('Service — no stock')).toHaveValue('Glass'));
  });

  it('offers related customer and revenue-account popups from a customer credit note', async () => {
    commonMocks();
    mockApi('creditNotes', 'nextNumber', 'CN-2026-0001');
    render(<CreditNoteFormModal open kind="customer" contacts={[]} accounts={[]} onClose={() => undefined} onSaved={() => undefined} />);

    await userEvent.click(screen.getByPlaceholderText('Select…'));
    expect(await screen.findByRole('button', { name: '+ Add New Customer' })).toBeInTheDocument();

    await userEvent.click(screen.getByPlaceholderText('Revenue account…'));
    expect(await screen.findByRole('button', { name: '+ New revenue account' })).toBeInTheDocument();
  });
});
