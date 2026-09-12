import { describe, expect, it } from 'vitest';
import { categoriesInUse, expandBundle, productPickerOptions, productTypeOf, type CatalogueProduct } from './productCatalogue';

const p = (partial: Partial<CatalogueProduct> & Pick<CatalogueProduct, 'id' | 'name'>): CatalogueProduct => ({
  sku: null, description: null, unit: 'each', salePriceCents: 0, purchasePriceCents: 0, incomeAccountId: null, assetAccountId: null, trackQuantity: false, defaultTaxCode: null, isActive: true, productType: null, category: null, ...partial,
});

describe('product catalogue', () => {
  it('reads a type from older rows that only have the track-quantity flag', () => {
    expect(productTypeOf({ trackQuantity: true })).toBe('inventory');
    expect(productTypeOf({ trackQuantity: false })).toBe('service');
    expect(productTypeOf({ trackQuantity: true, productType: 'bundle' })).toBe('bundle');
  });

  it('groups picker rows by category then type, and shows SKU, price and on-hand', () => {
    const products = [
      p({ id: 1, name: 'Widget', sku: 'W-1', salePriceCents: 1250, trackQuantity: true, category: 'Hardware' }),
      p({ id: 2, name: 'Consulting hour', salePriceCents: 15000, unit: 'hour' }),
      p({ id: 3, name: 'Starter kit', productType: 'bundle', bundleItems: [{ componentProductId: 1, quantity: 2 }] }),
      p({ id: 4, name: 'Old thing', isActive: false }),
    ];
    const options = productPickerOptions(products, 'sale', new Map([[1, 7]]));
    expect(options.map((o) => o.label)).toEqual(['Widget', 'Starter kit', 'Consulting hour']);
    expect(options[0]).toMatchObject({ group: 'Hardware', sublabel: 'W-1 · $12.50 · 7 on hand' });
    expect(options[1]).toMatchObject({ group: 'Bundle', sublabel: '1 items' });
    expect(options[2]).toMatchObject({ group: 'Service', sublabel: '$150.00 / hour' });
    expect(productPickerOptions(products, 'purchase')[0].sublabel).toBe('W-1');
  });

  it('expands a bundle into its component lines, multiplying by the bundle quantity', () => {
    const widget = p({ id: 1, name: 'Widget', salePriceCents: 1250 });
    const gone = p({ id: 9, name: 'Gone', isActive: false });
    const kit = p({ id: 3, name: 'Kit', productType: 'bundle', bundleItems: [{ componentProductId: 1, quantity: 2 }, { componentProductId: 9, quantity: 1 }, { componentProductId: 42, quantity: 1 }] });
    const { lines, missing } = expandBundle(kit, [widget, gone, kit], 3);
    expect(lines).toEqual([{ product: widget, quantity: 6 }]);
    expect(missing).toEqual([9, 42]);
  });

  it('lists the categories in use, trimmed and sorted', () => {
    expect(categoriesInUse([{ category: ' Tools ' }, { category: 'Hardware' }, { category: null }, { category: 'Tools' }])).toEqual(['Hardware', 'Tools']);
  });
});

describe('standard product categories', () => {
  it('offers a broad, de-duplicated starting list that covers goods, services and other lines', async () => {
    const { STANDARD_PRODUCT_CATEGORIES } = await import('./productCatalogue');
    expect(STANDARD_PRODUCT_CATEGORIES.length).toBeGreaterThan(35);
    expect(new Set(STANDARD_PRODUCT_CATEGORIES).size).toBe(STANDARD_PRODUCT_CATEGORIES.length);
    expect(STANDARD_PRODUCT_CATEGORIES).toEqual(expect.arrayContaining(['Parts & components', 'Labour', 'Bundles & kits', 'Plumbing', 'Consulting & professional fees']));
  });
});
