import { newFiscalPeriodSchema } from '@shared/validation/schemas';
import { getCurrentDb } from '../companyFile';
import { getAllFiscalPeriods } from '../db/queries';
import { mapFiscalPeriodRow } from '../db/mappers';

export async function fiscalPeriodsList() {
  const db = getCurrentDb();
  return getAllFiscalPeriods(db);
}

export async function fiscalPeriodsCreate(input: unknown) {
  const payload = newFiscalPeriodSchema.parse(input);
  if (payload.periodEnd < payload.periodStart) {
    throw new Error('Period end date must be on or after the start date.');
  }
  const db = getCurrentDb();
  const inserted = await db
    .insertInto('fiscalPeriods')
    .values({
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      label: payload.label,
      isLocked: 0,
      lockedAt: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return mapFiscalPeriodRow(inserted);
}

export async function fiscalPeriodsLock(id: number) {
  const db = getCurrentDb();
  await db
    .updateTable('fiscalPeriods')
    .set({ isLocked: 1, lockedAt: new Date().toISOString() })
    .where('id', '=', id)
    .execute();
  const row = await db.selectFrom('fiscalPeriods').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  return mapFiscalPeriodRow(row);
}

export async function fiscalPeriodsUnlock(id: number) {
  const db = getCurrentDb();
  const filing = await db.selectFrom('hstFilings').select(['id', 'periodStart', 'periodEnd']).where('fiscalPeriodId', '=', id).executeTakeFirst();
  if (filing) {
    throw new Error(`This period protects the filed GST/HST return for ${filing.periodStart} to ${filing.periodEnd}. Void that return from GST/HST Centre before unlocking its period.`);
  }
  await db.updateTable('fiscalPeriods').set({ isLocked: 0, lockedAt: null }).where('id', '=', id).execute();
  const row = await db.selectFrom('fiscalPeriods').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  return mapFiscalPeriodRow(row);
}
