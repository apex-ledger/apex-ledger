/**
 * Product types, categories and bundles — what makes the product dropdown on an invoice, sales
 * receipt or bill read like a catalogue instead of a flat list.
 *
 *   - inventory: stock is counted; needs asset and COGS accounts.
 *   - nonInventory: bought and sold but not counted (packaging, parts billed through).
 *   - service: hours, fees, labour.
 *   - bundle: a kit of other products sold as one line on the form, expanded into its components
 *     when picked so each component is priced, taxed and (for stock) relieved on its own.
 */
export type ProductType = 'inventory' | 'nonInventory' | 'service' | 'bundle';

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  inventory: 'Inventory',
  nonInventory: 'Non-inventory',
  service: 'Service',
  bundle: 'Bundle',
};

export const PRODUCT_TYPES = Object.keys(PRODUCT_TYPE_LABELS) as ProductType[];

export function isProductType(value: unknown): value is ProductType {
  return typeof value === 'string' && (PRODUCT_TYPES as string[]).includes(value);
}

/** Older products carry only the track-quantity flag; read a type from it. */
export function productTypeOf(product: { productType?: string | null; trackQuantity: boolean }): ProductType {
  if (isProductType(product.productType)) return product.productType;
  return product.trackQuantity ? 'inventory' : 'service';
}

export interface BundleComponent {
  componentProductId: number;
  quantity: number;
}

export interface CatalogueProduct {
  id: number;
  name: string;
  sku: string | null;
  description: string | null;
  unit: string;
  salePriceCents: number;
  purchasePriceCents: number;
  incomeAccountId: number | null;
  assetAccountId: number | null;
  trackQuantity: boolean;
  defaultTaxCode: string | null;
  isActive: boolean;
  productType?: string | null;
  category?: string | null;
  bundleItems?: BundleComponent[];
  preferredVendorId?: number | null;
  binLocation?: string | null;
}

export interface PickerOption {
  value: string;
  label: string;
  sublabel?: string;
  group?: string;
}

function money(cents: number): string {
  return (cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Dropdown rows for the product picker. Grouped by category (falling back to the type), each row
 * showing SKU, the price for this side of the transaction, and — for counted stock — what is on
 * hand, so the person entering the line sees the shortage before the sale is saved.
 */
export function productPickerOptions(
  products: CatalogueProduct[],
  side: 'sale' | 'purchase',
  onHand?: Map<number, number>,
  /** On a bill: the items this vendor is the preferred vendor for float to the top under one heading. */
  preferred?: { label: string; matches: (product: CatalogueProduct) => boolean },
): PickerOption[] {
  const rows = products.filter((p) => p.isActive).map((p) => {
    const type = productTypeOf(p);
    const price = side === 'sale' ? p.salePriceCents : p.purchasePriceCents;
    const parts: string[] = [];
    if (p.sku) parts.push(p.sku);
    if (price > 0) parts.push(`$${money(price)}${p.unit && p.unit !== 'each' ? ` / ${p.unit}` : ''}`);
    if (type === 'inventory' && onHand?.has(p.id)) parts.push(`${onHand.get(p.id)} on hand`);
    if (type === 'bundle') parts.push(`${(p.bundleItems ?? []).length} items`);
    const category = p.category?.trim() || '';
    const pinned = preferred?.matches(p) ?? false;
    return { value: String(p.id), label: p.name, sublabel: parts.join(' · ') || undefined, group: pinned ? preferred!.label : category || PRODUCT_TYPE_LABELS[type], categorized: pinned ? -1 : category ? 0 : 1 };
  });
  // Named categories first, then the type headings; names alphabetical within each.
  const cmp = (a: string, b: string) => a.localeCompare(b, 'en-CA', { sensitivity: 'base' });
  rows.sort((a, b) => a.categorized - b.categorized || cmp(a.group, b.group) || cmp(a.label, b.label));
  return rows.map(({ categorized: _c, ...option }) => option);
}

export interface BundleLine {
  product: CatalogueProduct;
  quantity: number;
}

/** The component lines a bundle turns into when picked. Quantities multiply by the number of
 * bundles; components that no longer exist or are inactive are skipped and named in `missing`. */
export function expandBundle(bundle: CatalogueProduct, products: CatalogueProduct[], bundles = 1): { lines: BundleLine[]; missing: number[] } {
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: BundleLine[] = [];
  const missing: number[] = [];
  for (const item of bundle.bundleItems ?? []) {
    const product = byId.get(item.componentProductId);
    if (!product || !product.isActive) {
      missing.push(item.componentProductId);
      continue;
    }
    lines.push({ product, quantity: item.quantity * bundles });
  }
  return { lines, missing };
}

/** A starting set of product and service categories a business of any kind can pick from. Broad
 * enough to cover a plumber, a retailer, a clinic or a consultancy without reading like someone
 * else's chart, following the segments the UNSPSC classification and common point-of-sale systems
 * use. A firm adds its own beside these; a category is never required. */
export const STANDARD_PRODUCT_CATEGORIES: readonly string[] = [
  // Goods sold or used
  'Finished goods', 'Raw materials', 'Parts & components', 'Materials & supplies', 'Consumables', 'Packaging',
  'Tools & equipment', 'Hardware', 'Electrical', 'Plumbing', 'HVAC & refrigeration', 'Building materials', 'Paint & finishes',
  'Automotive parts', 'Electronics', 'Computers & accessories', 'Software & licences', 'Office supplies', 'Furniture & fixtures',
  'Food & beverage', 'Health & beauty', 'Medical & dental supplies', 'Pharmacy', 'Apparel & footwear', 'Home & garden', 'Pet supplies',
  'Cleaning & janitorial', 'Safety & PPE', 'Books & media', 'Gift cards',
  // Services
  'Labour', 'Installation', 'Repair & maintenance', 'Consulting & professional fees', 'Design & creative', 'Training & education',
  'Bookkeeping & accounting', 'Tax preparation', 'Payroll services', 'Delivery & freight', 'Rentals', 'Subscriptions & memberships',
  // Other lines
  'Bundles & kits', 'Shipping & handling', 'Deposits & retainers',
];

/** Distinct categories in use, for the category field's suggestions. */
export function categoriesInUse(products: Array<{ category?: string | null }>): string[] {
  return [...new Set(products.map((p) => p.category?.trim()).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b));
}
