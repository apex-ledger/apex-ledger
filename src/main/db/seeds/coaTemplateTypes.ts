import { normalBalanceForType, type AccountType } from '@shared/domain/types';
import type { AppDb } from '../schema';

export interface CoaTemplateAccount {
  code: string;
  name: string;
  accountType: AccountType;
  accountSubtype: string;
  /** Suggested GIFI mapping — a starting point the accountant can change per company. */
  gifiCode: string | null;
}

export interface CoaTemplate {
  id: string;
  label: string;
  description: string;
  accounts: CoaTemplateAccount[];
}

/**
 * Inserts a template's accounts. normalBalance is always derived from accountType here (never
 * taken from the caller) — the report engine's section totals depend on every account within a
 * type using that type's natural debit/credit convention, including contra accounts, which get
 * their reducing effect from actually being credited/debited in the "wrong" direction, not from
 * an overridden normalBalance.
 */
export async function seedChartOfAccounts(db: AppDb, template: CoaTemplate): Promise<void> {
  for (const account of template.accounts) {
    await db
      .insertInto('accounts')
      .values({
        code: account.code,
        name: account.name,
        accountType: account.accountType,
        accountSubtype: account.accountSubtype,
        normalBalance: normalBalanceForType(account.accountType),
        parentId: null,
        gifiCode: account.gifiCode,
        isActive: 1,
        isSystem: 1,
        description: null,
        isTransferEligible: 0,
      })
      .onConflict((oc) => oc.column('code').doNothing())
      .execute();
  }
}
