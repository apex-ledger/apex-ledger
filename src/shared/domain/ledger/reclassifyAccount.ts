import { normalBalanceForType, type Account, type AccountType, type NormalBalance } from '../types';

/** Changing an account's type after it has been created.
 *
 * Blocked outright until now, on the reasoning that the type drives normalBalance and every report
 * total, so changing it reinterprets historical balances. That is true — but it leaves a misfiled
 * account permanently misfiled, which is worse: an "Other Income" account created as an Expense
 * understates income and overstates costs on every statement, for as long as the file exists, and
 * the only escape was to abandon the account and re-enter its history somewhere else.
 *
 * So it is allowed, and the reinterpretation is the point. What matters is that it happens
 * deliberately, with the consequences stated, and that it cannot leave the chart inconsistent.
 */

export type ReclassifyBlockReason = 'system' | 'parentMismatch';

export interface ReclassifyPlan {
  /** Accounts whose type and normal balance will change — the account plus every descendant. */
  changes: { accountId: number; from: AccountType; to: AccountType; normalBalance: NormalBalance }[];
  /** Why this cannot go ahead, if it cannot. */
  blockedBy: ReclassifyBlockReason | null;
  blockedMessage: string | null;
  /** What the person should understand before confirming. Empty when there is nothing at stake. */
  warnings: string[];
}

function descendantsOf(accounts: Account[], rootId: number): Account[] {
  const childrenOf = new Map<number, Account[]>();
  for (const a of accounts) {
    if (a.parentId == null) continue;
    childrenOf.set(a.parentId, [...(childrenOf.get(a.parentId) ?? []), a]);
  }

  const out: Account[] = [];
  const queue = [rootId];
  let guard = 0;
  while (queue.length > 0 && guard++ < 1000) {
    const id = queue.shift() as number;
    for (const child of childrenOf.get(id) ?? []) {
      out.push(child);
      queue.push(child.id);
    }
  }
  return out;
}

/**
 * Works out what changing one account's type would do.
 *
 * Sub-accounts move with their parent. A chart where "Office Supplies" sits as an Expense beneath
 * an Asset parent is not a thing any report can render sensibly, and leaving the children behind is
 * how that state gets created.
 */
export function planReclassification(
  accounts: Account[],
  accountId: number,
  toType: AccountType,
  postedLineCount: number,
): ReclassifyPlan {
  const account = accounts.find((a) => a.id === accountId);

  if (!account) {
    return { changes: [], blockedBy: 'system', blockedMessage: `Account ${accountId} not found.`, warnings: [] };
  }

  if (account.accountType === toType) {
    return { changes: [], blockedBy: null, blockedMessage: null, warnings: [] };
  }

  // System accounts are wired into posting code by name and type — Accounts Payable has to stay a
  // liability, or bills post into something that is no longer a liability.
  if (account.isSystem) {
    return {
      changes: [],
      blockedBy: 'system',
      blockedMessage: `"${account.name}" is a built-in account that other parts of the app post to by name. Its type cannot be changed.`,
      warnings: [],
    };
  }

  const parent = account.parentId != null ? accounts.find((a) => a.id === account.parentId) : undefined;
  if (parent && parent.accountType !== toType) {
    return {
      changes: [],
      blockedBy: 'parentMismatch',
      blockedMessage: `"${account.name}" sits under "${parent.name}", which is ${parent.accountType}. Move it out from under its parent first, or change the parent too.`,
      warnings: [],
    };
  }

  const moving = [account, ...descendantsOf(accounts, accountId)];
  const changes = moving.map((a) => ({
    accountId: a.id,
    from: a.accountType,
    to: toType,
    normalBalance: normalBalanceForType(toType),
  }));

  const warnings: string[] = [];

  if (postedLineCount > 0) {
    warnings.push(
      `${postedLineCount} posted ${postedLineCount === 1 ? 'line uses' : 'lines use'} this account. Their amounts do not change, but they will now be read as ${toType.toLowerCase()} — which is the point of the correction, and it will move figures on statements already produced.`,
    );
  }

  if (moving.length > 1) {
    warnings.push(
      `${moving.length - 1} sub-${moving.length - 1 === 1 ? 'account moves' : 'accounts move'} with it, so the chart stays consistent.`,
    );
  }

  if (normalBalanceForType(account.accountType) !== normalBalanceForType(toType)) {
    warnings.push(
      `Its normal balance changes from ${normalBalanceForType(account.accountType)} to ${normalBalanceForType(toType)}, so existing balances will show on the opposite side.`,
    );
  }

  return { changes, blockedBy: null, blockedMessage: null, warnings };
}
