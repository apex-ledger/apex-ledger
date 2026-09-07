import { normalBalanceForType, type AccountType } from '@shared/domain/types';
import type { AppDb } from './schema';

/** Finds an account by exact name (case-insensitive) and type, creating it with a sensible
 * default code and GIFI mapping if this company doesn't have one yet (e.g. a blank company, or
 * one where the accountant renamed/removed the template default). Used by features (Payroll,
 * Purchases) that need a specific GL account to always exist before posting to it. */
export async function ensureAccountByName(
  db: AppDb,
  name: string,
  accountType: AccountType,
  fallbackCode: string,
  gifiCode: string | null,
  accountSubtype: string,
): Promise<number> {
  const existing = await db
    .selectFrom('accounts')
    .select('id')
    .where('name', 'like', name)
    .where('accountType', '=', accountType)
    .executeTakeFirst();
  if (existing) return existing.id;

  // The fallback code may already be taken by an unrelated account — a company whose chart puts
  // GST/HST Recoverable at 1200, say. Returning whichever account holds the code would post
  // receivables into it silently, so a taken code is stepped past instead: the NAME is what the
  // caller asked for, and the code is only a place to file it.
  for (const code of candidateCodes(fallbackCode)) {
    const inserted = await db
      .insertInto('accounts')
      .values({
        code,
        name,
        accountType,
        accountSubtype,
        normalBalance: normalBalanceForType(accountType),
        parentId: null,
        gifiCode,
        isActive: 1,
        isSystem: 1,
        description: 'Auto-created for posting.',
        isTransferEligible: 0,
      })
      .onConflict((oc) => oc.column('code').doNothing())
      .returningAll()
      .executeTakeFirst();
    if (inserted) return inserted.id;

    // Lost a race with another request creating the very same account? Then it exists now.
    const holder = await db.selectFrom('accounts').select(['id', 'name', 'accountType']).where('code', '=', code).executeTakeFirst();
    if (holder && holder.accountType === accountType && holder.name.trim().toLowerCase() === name.trim().toLowerCase()) return holder.id;
  }
  throw new Error(`Could not create the "${name}" account: every code near ${fallbackCode} is already in use. Add it to the Chart of Accounts by hand.`);
}

/** The fallback code first, then numbered alternatives beside it. */
function* candidateCodes(fallbackCode: string): Generator<string> {
  yield fallbackCode;
  for (let n = 2; n <= 50; n += 1) yield `${fallbackCode}-${n}`;
}
