import { newGifiCodeSchema, updateGifiCodeSchema } from '@shared/validation/schemas';
import { getCurrentDb } from '../companyFile';
import { getAllGifiCodes } from '../db/queries';
import { mapGifiCodeRow } from '../db/mappers';

export interface GifiListFilter {
  statementType?: string;
  search?: string;
}

export async function gifiList(filter?: GifiListFilter) {
  const db = getCurrentDb();
  let all = await getAllGifiCodes(db);
  if (filter?.statementType) all = all.filter((g) => g.statementType === filter.statementType);
  if (filter?.search) {
    const term = filter.search.toLowerCase();
    all = all.filter((g) => g.code.includes(term) || g.description.toLowerCase().includes(term));
  }
  return all;
}

export async function gifiGet(code: string) {
  const db = getCurrentDb();
  const row = await db.selectFrom('gifiCodes').selectAll().where('code', '=', code).executeTakeFirst();
  if (!row) throw new Error(`GIFI code ${code} not found.`);
  return mapGifiCodeRow(row);
}

export async function gifiCreateCustom(input: unknown) {
  const payload = newGifiCodeSchema.parse(input);
  const db = getCurrentDb();
  const existing = await db.selectFrom('gifiCodes').select('code').where('code', '=', payload.code).executeTakeFirst();
  if (existing) throw new Error(`GIFI code ${payload.code} already exists.`);

  const inserted = await db
    .insertInto('gifiCodes')
    .values({
      code: payload.code,
      description: payload.description,
      statementType: payload.statementType,
      category: payload.category ?? null,
      isCustom: 1,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return mapGifiCodeRow(inserted);
}

export async function gifiUpdate(input: unknown) {
  const { code, patch } = updateGifiCodeSchema.parse(input);
  const db = getCurrentDb();

  // Any edit marks the row is_custom=1, protecting it from future starter-set refresh upserts.
  const updateValues: Record<string, unknown> = { isCustom: 1 };
  if (patch.description !== undefined) updateValues.description = patch.description;
  if (patch.statementType !== undefined) updateValues.statementType = patch.statementType;
  if (patch.category !== undefined) updateValues.category = patch.category;

  await db.updateTable('gifiCodes').set(updateValues).where('code', '=', code).execute();
  return gifiGet(code);
}
