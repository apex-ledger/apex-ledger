import type { Account } from '@shared/domain/types';

export const AR_CONTROL_NAME = 'Accounts Receivable';
export const AP_CONTROL_NAME = 'Accounts Payable';
export const MISC_AR_NAME = 'Miscellaneous Accounts Receivable';
export const MISC_AP_NAME = 'Miscellaneous Accounts Payable';

export type ContactOpeningKind = 'receivable' | 'payable';

/** Includes the control account and every depth of sub-account so none can accidentally reappear
 * in the generic opening-balance grid without customer/vendor detail. */
export function accountFamilyIds(accounts: Account[], rootId: number | null): Set<number> {
  if (rootId === null) return new Set();
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const account of accounts) {
      if (account.parentId !== null && ids.has(account.parentId) && !ids.has(account.id)) {
        ids.add(account.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function nextContactSubaccountCode(accounts: Account[], kind: ContactOpeningKind): string {
  const used = new Set(accounts.map((account) => account.code));
  let candidate = kind === 'receivable' ? 1202 : 2102;
  while (used.has(String(candidate))) candidate += 1;
  return String(candidate);
}

export function contactOpeningSubaccountName(contactName: string, kind: ContactOpeningKind): string {
  return `${contactName} — ${kind === 'receivable' ? AR_CONTROL_NAME : AP_CONTROL_NAME}`;
}
