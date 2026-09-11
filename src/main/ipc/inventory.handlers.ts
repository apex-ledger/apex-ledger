import { getCurrentDb } from '../companyFile';
import { inventoryStatus, valueProduct, type InventoryMovement } from '@shared/domain/inventory/inventoryValuation';
import { buildInventoryJournalLines, inventoryPostingMemo } from '@shared/domain/inventory/buildInventoryJournalLines';
import { journalCreate, journalPost, journalVoid } from './journal.handlers';
import { TAX_CODE_DEFINITIONS } from '@shared/domain/ledger/taxCodes';
import type { TaxCode } from '@shared/domain/types';
import { localIsoDate } from '@shared/domain/dates/localDate';
import { isProductType, type BundleComponent, type ProductType } from '@shared/domain/inventory/productCatalogue';

/** Products and stock movements.
 *
 * Stock on hand is always derived from the movement rows, never stored on the product. A stored
 * total drifts the moment a movement is edited or deleted, and it cannot answer "what was on hand
 * at last year end" — which is exactly the figure a balance sheet needs.
 */

export interface ProductInput {
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: string;
  salePriceCents: number;
  purchasePriceCents: number;
  incomeAccountId: number | null;
  cogsAccountId: number | null;
  assetAccountId: number | null;
  trackQuantity: boolean;
  defaultTaxCode: TaxCode | null;
  reorderPoint: number;
  productType?: ProductType;
  category?: string | null;
  /** Bundles only: the components and how many of each one bundle holds. */
  bundleItems?: BundleComponent[];
  preferredVendorId?: number | null;
  leadTimeDays?: number;
  minimumOrderQuantity?: number;
  reorderQuantity?: number;
  binLocation?: string | null;
  manufacturer?: string | null;
  manufacturerPartNumber?: string | null;
  weightKg?: number | null;
  notes?: string | null;
}

function validateProductInput(payload: Partial<ProductInput>) {
  if (payload.reorderPoint !== undefined && (!Number.isFinite(payload.reorderPoint) || payload.reorderPoint < 0)) throw new Error('Reorder point cannot be negative.');
  if (payload.defaultTaxCode && !TAX_CODE_DEFINITIONS.some((definition) => definition.code === payload.defaultTaxCode)) throw new Error('Select a valid default tax code.');
  if (payload.productType !== undefined && !isProductType(payload.productType)) throw new Error('Select a valid product type.');
  if (payload.bundleItems) {
    for (const item of payload.bundleItems) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error('Each bundle component needs a quantity above zero.');
    }
  }
}

type ProductRow = { id: number; trackQuantity: number; isActive: number; productType: string; category: string | null } & Record<string, unknown>;

async function attachBundleItems<T extends ProductRow>(db: ReturnType<typeof getCurrentDb>, rows: T[]) {
  const bundleIds = rows.filter((r) => r.productType === 'bundle').map((r) => r.id);
  const items = bundleIds.length > 0 ? await db.selectFrom('productBundleItems').selectAll().where('bundleProductId', 'in', bundleIds).orderBy('id').execute() : [];
  return rows.map((r) => {
    const { trackQuantity, isActive, ...rest } = r;
    return {
      ...rest,
      trackQuantity: Boolean(trackQuantity),
      isActive: Boolean(isActive),
      bundleItems: r.productType === 'bundle' ? items.filter((i) => i.bundleProductId === r.id).map((i) => ({ componentProductId: i.componentProductId, quantity: i.quantity })) : [],
    };
  });
}

async function replaceBundleItems(db: ReturnType<typeof getCurrentDb>, bundleProductId: number, items: BundleComponent[]) {
  if (items.some((i) => i.componentProductId === bundleProductId)) throw new Error('A bundle cannot contain itself.');
  await db.deleteFrom('productBundleItems').where('bundleProductId', '=', bundleProductId).execute();
  if (items.length > 0) await db.insertInto('productBundleItems').values(items.map((i) => ({ bundleProductId, componentProductId: i.componentProductId, quantity: i.quantity }))).execute();
}

async function assertBarcodeAvailable(db: ReturnType<typeof getCurrentDb>, barcode: string | null | undefined, excludeId?: number) {
  const normalized = barcode?.trim();
  if (!normalized) return;
  let query = db.selectFrom('products').select(['id', 'name']).where('barcode', '=', normalized);
  if (excludeId !== undefined) query = query.where('id', '!=', excludeId);
  const clash = await query.executeTakeFirst();
  if (clash) throw new Error(`Barcode ${normalized} is already used by "${clash.name}".`);
}

function toDomainMovements(rows: { id: number; productId: number; movementDate: string; quantityDelta: number; unitCostCents: number | null; kind: string; journalEntryId: number | null; note: string | null }[]): InventoryMovement[] {
  return rows.map((r) => ({ ...r, kind: r.kind as InventoryMovement['kind'] }));
}

export async function productsList(filter?: { activeOnly?: boolean }) {
  const db = getCurrentDb();
  let query = db.selectFrom('products').selectAll();
  if (filter?.activeOnly) query = query.where('isActive', '=', 1);
  const rows = await query.orderBy('name').execute();
  return attachBundleItems(db, rows);
}

export async function productsCreate(input: unknown) {
  const payload = input as ProductInput;
  if (!payload.name?.trim()) throw new Error('Product name is required.');
  validateProductInput(payload);
  const db = getCurrentDb();
  await assertBarcodeAvailable(db, payload.barcode);
  if (payload.sku?.trim()) {
    const clash = await db.selectFrom('products').select(['id', 'name']).where('sku', '=', payload.sku.trim()).executeTakeFirst();
    if (clash) throw new Error(`SKU ${payload.sku.trim()} is already used by "${clash.name}".`);
  }
  const inserted = await db
    .insertInto('products')
    .values({
      sku: payload.sku?.trim() || null,
      barcode: payload.barcode?.trim() || null,
      name: payload.name.trim(),
      description: payload.description ?? null,
      unit: payload.unit?.trim() || 'each',
      salePriceCents: payload.salePriceCents ?? 0,
      purchasePriceCents: payload.purchasePriceCents ?? 0,
      incomeAccountId: payload.incomeAccountId ?? null,
      cogsAccountId: payload.cogsAccountId ?? null,
      assetAccountId: payload.assetAccountId ?? null,
      trackQuantity: payload.productType === 'bundle' ? 0 : payload.trackQuantity === false ? 0 : 1,
      defaultTaxCode: payload.defaultTaxCode ?? null,
      reorderPoint: payload.reorderPoint ?? 0,
      productType: payload.productType ?? (payload.trackQuantity === false ? 'service' : 'inventory'),
      category: payload.category?.trim() || null,
      preferredVendorId: payload.preferredVendorId ?? null,
      leadTimeDays: payload.leadTimeDays ?? 0,
      minimumOrderQuantity: payload.minimumOrderQuantity ?? 0,
      reorderQuantity: payload.reorderQuantity ?? 0,
      binLocation: payload.binLocation?.trim() || null,
      manufacturer: payload.manufacturer?.trim() || null,
      manufacturerPartNumber: payload.manufacturerPartNumber?.trim() || null,
      weightKg: payload.weightKg ?? null,
      notes: payload.notes?.trim() || null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  if (payload.productType === 'bundle') await replaceBundleItems(db, inserted.id, payload.bundleItems ?? []);
  return (await attachBundleItems(db, [inserted]))[0];
}

export async function productsUpdate(input: unknown) {
  const { id, patch } = input as { id: number; patch: Partial<ProductInput> & { isActive?: boolean } };
  const db = getCurrentDb();
  validateProductInput(patch);
  if (patch.barcode !== undefined) await assertBarcodeAvailable(db, patch.barcode, id);

  if (patch.sku !== undefined && patch.sku?.trim()) {
    const clash = await db
      .selectFrom('products')
      .select(['id', 'name'])
      .where('sku', '=', patch.sku.trim())
      .where('id', '!=', id)
      .executeTakeFirst();
    if (clash) throw new Error(`SKU ${patch.sku.trim()} is already used by "${clash.name}".`);
  }

  const values: Record<string, unknown> = {};
  if (patch.sku !== undefined) values.sku = patch.sku?.trim() || null;
  if (patch.barcode !== undefined) values.barcode = patch.barcode?.trim() || null;
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new Error('Product name is required.');
    values.name = patch.name.trim();
  }
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.unit !== undefined) values.unit = patch.unit?.trim() || 'each';
  if (patch.salePriceCents !== undefined) values.salePriceCents = patch.salePriceCents;
  if (patch.purchasePriceCents !== undefined) values.purchasePriceCents = patch.purchasePriceCents;
  if (patch.incomeAccountId !== undefined) values.incomeAccountId = patch.incomeAccountId;
  if (patch.cogsAccountId !== undefined) values.cogsAccountId = patch.cogsAccountId;
  if (patch.assetAccountId !== undefined) values.assetAccountId = patch.assetAccountId;
  if (patch.trackQuantity !== undefined) values.trackQuantity = patch.trackQuantity ? 1 : 0;
  if (patch.defaultTaxCode !== undefined) values.defaultTaxCode = patch.defaultTaxCode;
  if (patch.reorderPoint !== undefined) values.reorderPoint = patch.reorderPoint;
  if (patch.isActive !== undefined) values.isActive = patch.isActive ? 1 : 0;
  if (patch.productType !== undefined) {
    values.productType = patch.productType;
    if (patch.productType === 'bundle') values.trackQuantity = 0;
  }
  if (patch.category !== undefined) values.category = patch.category?.trim() || null;
  if (patch.preferredVendorId !== undefined) values.preferredVendorId = patch.preferredVendorId;
  if (patch.leadTimeDays !== undefined) values.leadTimeDays = Math.max(0, Math.round(patch.leadTimeDays));
  if (patch.minimumOrderQuantity !== undefined) values.minimumOrderQuantity = Math.max(0, patch.minimumOrderQuantity);
  if (patch.reorderQuantity !== undefined) values.reorderQuantity = Math.max(0, patch.reorderQuantity);
  if (patch.binLocation !== undefined) values.binLocation = patch.binLocation?.trim() || null;
  if (patch.manufacturer !== undefined) values.manufacturer = patch.manufacturer?.trim() || null;
  if (patch.manufacturerPartNumber !== undefined) values.manufacturerPartNumber = patch.manufacturerPartNumber?.trim() || null;
  if (patch.weightKg !== undefined) values.weightKg = patch.weightKg;
  if (patch.notes !== undefined) values.notes = patch.notes?.trim() || null;

  if (Object.keys(values).length > 0) {
    await db.updateTable('products').set(values).where('id', '=', id).execute();
  }
  if (patch.bundleItems !== undefined) await replaceBundleItems(db, id, patch.bundleItems);
  const row = await db.selectFrom('products').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  return (await attachBundleItems(db, [row]))[0];
}

export async function productsDelete(id: number) {
  const db = getCurrentDb();
  // A product with movement history is never removed — deleting it would silently rewrite past
  // stock valuations and any cost of goods sold derived from them. Retired instead.
  const movement = await db.selectFrom('inventoryMovements').select('id').where('productId', '=', id).executeTakeFirst();
  if (movement) {
    await db.updateTable('products').set({ isActive: 0 }).where('id', '=', id).execute();
    return { deleted: false as const, deactivated: true as const };
  }
  await db.deleteFrom('products').where('id', '=', id).execute();
  return { deleted: true as const, deactivated: false as const };
}

export async function movementsList(filter?: { productId?: number }) {
  const db = getCurrentDb();
  let query = db.selectFrom('inventoryMovements').selectAll();
  if (filter?.productId != null) query = query.where('productId', '=', filter.productId);
  return query.orderBy('movementDate').orderBy('id').execute();
}

export async function movementsCreate(input: unknown) {
  const payload = input as {
    productId: number;
    movementDate: string;
    quantityDelta: number;
    unitCostCents: number | null;
    kind: InventoryMovement['kind'];
    note: string | null;
    /** What paid for inbound stock — bank, or accounts payable. Not used on the way out. */
    counterAccountId?: number | null;
  };
  if (!payload.quantityDelta) throw new Error('Enter a quantity — a movement of zero records nothing.');
  const db = getCurrentDb();
  // Cost is meaningless on the way out: an issue leaves at the running weighted average, so a
  // figure stored here would be ignored by the valuation and only mislead whoever read it later.
  const unitCostCents = payload.quantityDelta > 0 ? payload.unitCostCents ?? 0 : null;

  const product = await db.selectFrom('products').selectAll().where('id', '=', payload.productId).executeTakeFirstOrThrow();

  // A tracked movement must never create quantity/value history that the GL cannot represent.
  // Zero-cost receipts and zero-cost issues are legitimate and can have no journal amount; missing
  // posting accounts are setup errors and must be fixed before stock is allowed to move.
  if (product.assetAccountId === null) {
    throw new Error(`Set an Inventory Asset account on ${product.name} before recording stock.`);
  }
  if (payload.quantityDelta < 0 && product.cogsAccountId === null) {
    throw new Error(`Set a Cost of Goods Sold account on ${product.name} before reducing stock.`);
  }
  if (payload.quantityDelta > 0 && (unitCostCents ?? 0) > 0 && (payload.counterAccountId ?? null) === null) {
    throw new Error('Choose the bank, Accounts Payable, or other account that funded this inventory receipt.');
  }

  // The average a sale leaves at depends on everything that came before it BY DATE, so the prior
  // movements are read before this one is written and limited to its date: a sale entered today
  // but dated in February must not be costed at an average that includes a May purchase, or the
  // ledger's cost of sales drifts from the valuation report, which replays movements in date order.
  const priorRows = await db
    .selectFrom('inventoryMovements')
    .selectAll()
    .where('productId', '=', payload.productId)
    .where('movementDate', '<=', payload.movementDate)
    .execute();

  if (payload.quantityDelta < 0) {
    const before = valueProduct(payload.productId, toDomainMovements(priorRows));
    const requested = Math.abs(payload.quantityDelta);
    if (requested > before.quantityOnHand + 1e-9) {
      throw new Error(
        `Not enough stock for ${product.name}. On hand: ${before.quantityOnHand}; requested: ${requested}. Record the missing receipt or an inventory adjustment first.`,
      );
    }
  }

  const posting = buildInventoryJournalLines({
    productId: payload.productId,
    productName: product.name,
    kind: payload.kind,
    movementDate: payload.movementDate,
    quantityDelta: payload.quantityDelta,
    unitCostCents,
    assetAccountId: product.assetAccountId,
    cogsAccountId: product.cogsAccountId,
    counterAccountId: payload.counterAccountId ?? null,
    priorMovements: toDomainMovements(priorRows),
  });

  // The GL entry and the inventory movement are one accounting event. They commit together so a
  // crash or validation failure cannot leave the stock subledger disagreeing with the general ledger.
  return db.transaction().execute(async (trx) => {
    let journalEntryId: number | null = null;
    if (posting.lines.length > 0) {
      const entry = await journalCreate(
        {
          entryDate: payload.movementDate,
          memo: inventoryPostingMemo({ kind: payload.kind, productName: product.name }),
          reference: null,
          lines: posting.lines,
          source: 'manual',
          sourceReference: null,
        },
        trx,
      );
      const posted = await journalPost(entry.id, trx);
      journalEntryId = posted.id;
    }

    const movement = await trx
      .insertInto('inventoryMovements')
      .values({
        productId: payload.productId,
        movementDate: payload.movementDate,
        quantityDelta: payload.quantityDelta,
        unitCostCents,
        kind: payload.kind,
        journalEntryId,
        note: payload.note ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return { ...movement, postedEntryId: journalEntryId, notPostedReason: posting.skippedReason };
  });
}

export async function movementsDelete(id: number) {
  const db = getCurrentDb();
  const movement = await db.selectFrom('inventoryMovements').selectAll().where('id', '=', id).executeTakeFirst();
  if (!movement) throw new Error(`Inventory movement ${id} not found.`);

  // Once a stock movement has posted to the GL, deleting only the subledger row would make the
  // inventory valuation disagree with Inventory Asset/COGS. Preserve history and require a dated
  // reversing adjustment instead. Zero-value movements with no GL posting can still be removed.
  if (movement.journalEntryId !== null) {
    throw new Error('This inventory movement has a posted journal entry. Record a reversing inventory adjustment instead of deleting it.');
  }

  await db.deleteFrom('inventoryMovements').where('id', '=', id).execute();
  return { deleted: true as const, orphanedJournalEntryId: null };
}

/** Corrects a manual posted movement without guessing an inverse weighted-average cost. */
export async function movementsReverse(id: number) {
  const db = getCurrentDb();
  const movement = await db.selectFrom('inventoryMovements').selectAll().where('id', '=', id).executeTakeFirst();
  if (!movement) throw new Error(`Inventory movement ${id} not found.`);
  if (movement.journalEntryId === null) throw new Error('This zero-value movement has no journal; use Delete instead.');
  if (movement.sourceDocumentType !== null) throw new Error('This stock movement belongs to another document. Reverse it from the original invoice or purchase order so every linked row stays together.');
  await db.transaction().execute(async (trx) => {
    await journalVoid(movement.journalEntryId!, false, trx, true);
    await trx.deleteFrom('inventoryMovements').where('id', '=', id).execute();
  });
  return { reversed: true as const, journalEntryId: movement.journalEntryId };
}

/** Stock and value for every tracked product as of a date. */
export async function inventoryStatusReport(input: unknown) {
  const { asOfDate } = (input ?? {}) as { asOfDate?: string };
  const date = asOfDate ?? localIsoDate();
  const db = getCurrentDb();
  const [products, movements] = await Promise.all([
    db.selectFrom('products').selectAll().where('trackQuantity', '=', 1).where('isActive', '=', 1).orderBy('name').execute(),
    db.selectFrom('inventoryMovements').selectAll().execute(),
  ]);

  const status = inventoryStatus(
    products.map((p) => p.id),
    toDomainMovements(movements),
    date,
  );
  const byId = new Map(products.map((p) => [p.id, p]));
  return {
    ...status,
    rows: status.rows.map((r) => {
      const product = byId.get(r.productId);
      return {
        ...r,
        sku: product?.sku ?? null,
        name: product?.name ?? 'Unknown product',
        unit: product?.unit ?? 'each',
        salePriceCents: product?.salePriceCents ?? 0,
        purchasePriceCents: product?.purchasePriceCents ?? 0,
      };
    }),
  };
}

/** One product's full movement history with the running valuation after each step. */
export async function productValuation(input: unknown) {
  const { productId } = input as { productId: number };
  const db = getCurrentDb();
  const movements = await db.selectFrom('inventoryMovements').selectAll().where('productId', '=', productId).execute();
  return valueProduct(productId, toDomainMovements(movements));
}
