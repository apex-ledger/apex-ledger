import { getCurrentDb } from '../companyFile';

/** Tag groups, tags, and what each journal line carries.
 *
 * Groups are the structural idea: "Store" is a group, Dundas and Kipling are tags within it. A line
 * carries at most one tag per group, which is what lets a report put the group's tags across the
 * top and have the columns add up. Without that rule tags are a pile of labels that double-count.
 */

export interface TagGroupInput {
  name: string;
  description: string | null;
}

export async function tagGroupsList(filter?: { activeOnly?: boolean }) {
  const db = getCurrentDb();
  let query = db.selectFrom('tagGroups').selectAll();
  if (filter?.activeOnly) query = query.where('isActive', '=', 1);
  const groups = await query.orderBy('name').execute();
  const tags = await db.selectFrom('tags').selectAll().orderBy('name').execute();

  return groups.map((g) => ({
    ...g,
    isActive: Boolean(g.isActive),
    tags: tags.filter((t) => t.tagGroupId === g.id).map((t) => ({ ...t, isActive: Boolean(t.isActive) })),
  }));
}

export async function tagGroupsCreate(input: unknown) {
  const payload = input as TagGroupInput;
  if (!payload.name?.trim()) throw new Error('A tag group needs a name.');

  const db = getCurrentDb();
  const clash = await db.selectFrom('tagGroups').select('id').where('name', '=', payload.name.trim()).executeTakeFirst();
  if (clash) throw new Error(`There is already a tag group called "${payload.name.trim()}".`);

  const inserted = await db
    .insertInto('tagGroups')
    .values({ name: payload.name.trim(), description: payload.description?.trim() || null })
    .returningAll()
    .executeTakeFirstOrThrow();

  return { ...inserted, isActive: Boolean(inserted.isActive), tags: [] };
}

export async function tagGroupsUpdate(input: unknown) {
  const { id, patch } = input as { id: number; patch: Partial<TagGroupInput> & { isActive?: boolean } };
  const db = getCurrentDb();

  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new Error('A tag group needs a name.');
    const clash = await db
      .selectFrom('tagGroups')
      .select(['id'])
      .where('name', '=', patch.name.trim())
      .where('id', '!=', id)
      .executeTakeFirst();
    if (clash) throw new Error(`There is already a tag group called "${patch.name.trim()}".`);
  }

  const updated = await db
    .updateTable('tagGroups')
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive ? 1 : 0 } : {}),
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();

  return { ...updated, isActive: Boolean(updated.isActive) };
}

/** Deleting a group takes its tags and every assignment with it (ON DELETE CASCADE).
 *
 * Refused once anything is tagged. The rows would vanish from history silently, and a P&L run last
 * month would stop reproducing with no visible reason. Deactivating keeps the past readable while
 * removing the group from the pickers. */
export async function tagGroupsDelete(id: number) {
  const db = getCurrentDb();
  const inUse = await db
    .selectFrom('journalEntryLineTags')
    .innerJoin('tags', 'tags.id', 'journalEntryLineTags.tagId')
    .select('journalEntryLineTags.id')
    .where('tags.tagGroupId', '=', id)
    .executeTakeFirst();

  if (inUse) {
    throw new Error('This group is already used on transactions. Make it inactive instead, so past reports still work.');
  }

  await db.deleteFrom('tagGroups').where('id', '=', id).execute();
  return { deleted: true } as const;
}

export async function tagsCreate(input: unknown) {
  const { tagGroupId, name } = input as { tagGroupId: number; name: string };
  if (!name?.trim()) throw new Error('A tag needs a name.');

  const db = getCurrentDb();
  const clash = await db
    .selectFrom('tags')
    .select('id')
    .where('tagGroupId', '=', tagGroupId)
    .where('name', '=', name.trim())
    .executeTakeFirst();
  // Unique within the group, not globally: two groups can each have a "Head Office".
  if (clash) throw new Error(`This group already has a tag called "${name.trim()}".`);

  const inserted = await db
    .insertInto('tags')
    .values({ tagGroupId, name: name.trim() })
    .returningAll()
    .executeTakeFirstOrThrow();

  return { ...inserted, isActive: Boolean(inserted.isActive) };
}

export async function tagsUpdate(input: unknown) {
  const { id, patch } = input as { id: number; patch: { name?: string; isActive?: boolean } };
  const db = getCurrentDb();

  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new Error('A tag needs a name.');
    const tag = await db.selectFrom('tags').select('tagGroupId').where('id', '=', id).executeTakeFirst();
    if (!tag) throw new Error(`Tag ${id} not found.`);
    const clash = await db
      .selectFrom('tags')
      .select('id')
      .where('tagGroupId', '=', tag.tagGroupId)
      .where('name', '=', patch.name.trim())
      .where('id', '!=', id)
      .executeTakeFirst();
    if (clash) throw new Error(`This group already has a tag called "${patch.name.trim()}".`);
  }

  const updated = await db
    .updateTable('tags')
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive ? 1 : 0 } : {}),
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();

  return { ...updated, isActive: Boolean(updated.isActive) };
}

export async function tagsDelete(id: number) {
  const db = getCurrentDb();
  const inUse = await db.selectFrom('journalEntryLineTags').select('id').where('tagId', '=', id).executeTakeFirst();
  if (inUse) {
    throw new Error('This tag is already used on transactions. Make it inactive instead, so past reports still work.');
  }
  await db.deleteFrom('tags').where('id', '=', id).execute();
  return { deleted: true } as const;
}

/** Which tags sit on the lines of one entry, keyed by line id — what the entry form reads back. */
export async function tagsForEntry(journalEntryId: number) {
  const db = getCurrentDb();
  const rows = await db
    .selectFrom('journalEntryLineTags')
    .innerJoin('journalEntryLines', 'journalEntryLines.id', 'journalEntryLineTags.journalEntryLineId')
    .select(['journalEntryLineTags.journalEntryLineId as lineId', 'journalEntryLineTags.tagId as tagId'])
    .where('journalEntryLines.journalEntryId', '=', journalEntryId)
    .execute();

  const byLine: Record<number, number[]> = {};
  for (const r of rows) (byLine[r.lineId] ??= []).push(r.tagId);
  return byLine;
}

/** Replaces the tags on one line.
 *
 * Replace rather than add, because the picker sends the line's whole state. Enforces one tag per
 * group here as well as in the UI: a line carrying two tags from the same group would be counted
 * twice by every report that puts that group across the top.
 */
export async function tagsSetForLine(input: unknown) {
  const { journalEntryLineId, tagIds } = input as { journalEntryLineId: number; tagIds: number[] };
  const db = getCurrentDb();
  const wanted = [...new Set(tagIds ?? [])];

  if (wanted.length > 0) {
    const chosen = await db.selectFrom('tags').select(['id', 'tagGroupId', 'name']).where('id', 'in', wanted).execute();
    if (chosen.length !== wanted.length) throw new Error('One of those tags no longer exists.');

    const seen = new Map<number, string>();
    for (const tag of chosen) {
      const already = seen.get(tag.tagGroupId);
      if (already) {
        throw new Error(`A line can carry only one tag from each group — "${already}" and "${tag.name}" are in the same group.`);
      }
      seen.set(tag.tagGroupId, tag.name);
    }
  }

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('journalEntryLineTags').where('journalEntryLineId', '=', journalEntryLineId).execute();
    if (wanted.length > 0) {
      await trx
        .insertInto('journalEntryLineTags')
        .values(wanted.map((tagId) => ({ journalEntryLineId, tagId })))
        .execute();
    }
  });

  return { journalEntryLineId, tagIds: wanted };
}

/** Every line's tags, for the reports. */
export async function tagsAllLineAssignments() {
  const db = getCurrentDb();
  const rows = await db.selectFrom('journalEntryLineTags').select(['journalEntryLineId', 'tagId']).execute();
  const byLine: Record<number, number[]> = {};
  for (const r of rows) (byLine[r.journalEntryLineId] ??= []).push(r.tagId);
  return byLine;
}
