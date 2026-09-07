import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ProductsPage } from './ProductsPage';
import { mockApi } from '../../test/setup';

/** The products screen, rendered.
 *
 * This is the test that would have caught today's defect. Inventory posting needs a product to
 * carry an inventory account and a cost-of-goods-sold account, and the grid offered neither — so
 * every movement silently posted nothing while the screen looked entirely healthy. The feature was
 * unreachable and nothing said so.
 */

const PRODUCT = {
  id: 1,
  sku: null,
  name: 'Glass',
  description: null,
  unit: 'each',
  salePriceCents: 42_00,
  purchasePriceCents: 25_00,
  incomeAccountId: 5,
  cogsAccountId: null,
  assetAccountId: null,
  trackQuantity: true,
  isActive: true,
  createdAt: '2025-01-01',
};

function withProducts(products: unknown[]) {
  mockApi('products', 'list', products);
  mockApi('accounts', 'list', []);
  mockApi('inventory', 'status', { asOfDate: '2025-01-01', rows: [], totalValueCents: 0, negativeStockCount: 0 });
}

describe('the columns a product needs to post', () => {
  it('offers all three account columns', async () => {
    // Income alone is not enough: without inventory and cost of goods sold, a movement changes the
    // quantity and posts nothing to the books.
    withProducts([PRODUCT]);
    render(<ProductsPage />);

    await waitFor(() => expect(screen.getByDisplayValue('Glass')).toBeInTheDocument());
    // Scoped to the header row: the warning banner names these accounts too, and matching page
    // text alone would pass on the banner while the columns were missing — which is the exact
    // failure this test exists to catch.
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.toLowerCase() ?? '');
    expect(headers.some((h) => h.includes('income account'))).toBe(true);
    expect(headers.some((h) => h.includes('inventory account'))).toBe(true);
    expect(headers.some((h) => h.includes('cost of goods sold'))).toBe(true);
    expect(headers.some((h) => h.includes('purchase cost'))).toBe(true);
  });

  it('warns when a tracked product cannot post', async () => {
    // Silence here is the whole failure: the numbers on screen look right while the balance sheet
    // knows nothing about the stock.
    withProducts([PRODUCT]);
    render(<ProductsPage />);

    await waitFor(() => expect(screen.getByText(/post nothing to the books/i)).toBeInTheDocument());
  });

  it('says nothing once both accounts are set', async () => {
    withProducts([{ ...PRODUCT, assetAccountId: 10, cogsAccountId: 20 }]);
    render(<ProductsPage />);

    await waitFor(() => expect(screen.getByDisplayValue('Glass')).toBeInTheDocument());
    expect(screen.queryByText(/post nothing to the books/i)).not.toBeInTheDocument();
  });

  it('leaves an untracked product out of the warning', async () => {
    // A service has no stock, so it needs no inventory account and is not a problem.
    withProducts([{ ...PRODUCT, trackQuantity: false }]);
    render(<ProductsPage />);

    await waitFor(() => expect(screen.getByDisplayValue('Glass')).toBeInTheDocument());
    expect(screen.queryByText(/post nothing to the books/i)).not.toBeInTheDocument();
  });
});

describe('the empty state', () => {
  it('tells you what to do rather than showing a blank grid', async () => {
    withProducts([]);
    render(<ProductsPage />);

    await waitFor(() => expect(screen.getByText(/no products yet/i)).toBeInTheDocument());
  });
});

describe('quantity is never typed', () => {
  it('gives the new-product row no quantity field', async () => {
    // Stock on hand comes from movements. A quantity box here would let someone set a figure the
    // history does not support, which is how inventory reports start disagreeing with themselves.
    withProducts([]);
    render(<ProductsPage />);

    await waitFor(() => expect(screen.getByPlaceholderText(/new product/i)).toBeInTheDocument());
    expect(screen.queryByPlaceholderText(/quantity/i)).not.toBeInTheDocument();
  });

  it('labels the unit field so it is not mistaken for a quantity', async () => {
    withProducts([]);
    render(<ProductsPage />);

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveValue('each'));
  });
});
