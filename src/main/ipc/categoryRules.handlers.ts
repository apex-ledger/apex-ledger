import { newCategoryRuleSchema, updateCategoryRuleSchema } from '@shared/validation/schemas';
import { getCurrentDb } from '../companyFile';
import { mapCategoryRuleRow } from '../db/mappers';

export async function categoryRulesList() {
  const db = getCurrentDb();
  const rows = await db.selectFrom('categoryRules').selectAll().orderBy('pattern').execute();
  return rows.map(mapCategoryRuleRow);
}

export async function categoryRulesCreate(input: unknown) {
  const payload = newCategoryRuleSchema.parse(input);
  const db = getCurrentDb();
  const inserted = await db
    .insertInto('categoryRules')
    .values({
      pattern: payload.pattern,
      accountId: payload.accountId,
      taxCode: payload.taxCode ?? null,
      priority: payload.priority ?? 0,
      isActive: 1,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return mapCategoryRuleRow(inserted);
}

export async function categoryRulesUpdate(input: unknown) {
  const { id, patch } = updateCategoryRuleSchema.parse(input);
  const db = getCurrentDb();
  const updateValues: Record<string, unknown> = {};
  if (patch.pattern !== undefined) updateValues.pattern = patch.pattern;
  if (patch.accountId !== undefined) updateValues.accountId = patch.accountId;
  if (patch.taxCode !== undefined) updateValues.taxCode = patch.taxCode;
  if (patch.priority !== undefined) updateValues.priority = patch.priority;
  if (Object.keys(updateValues).length > 0) {
    await db.updateTable('categoryRules').set(updateValues).where('id', '=', id).execute();
  }
  const row = await db.selectFrom('categoryRules').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  return mapCategoryRuleRow(row);
}

export async function categoryRulesDelete(id: number) {
  const db = getCurrentDb();
  await db.deleteFrom('categoryRules').where('id', '=', id).execute();
  return { deleted: true };
}
