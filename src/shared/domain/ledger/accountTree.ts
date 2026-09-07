import type { Account } from '../types';

/** Sub-account ordering and roll-up.
 *
 * `parentId` has been on the accounts table all along, but nothing ever walked it: a parent showed
 * only the balance of entries posted directly to it, and children were listed wherever code-order
 * happened to put them. That reads wrong to anyone coming from QuickBooks, where a parent such as
 * "Cash & Bank" carries the total of everything beneath it and its children sit indented under it.
 *
 * Both helpers here are pure so they can be unit-tested and reused by the reports, rather than the
 * tree being rebuilt ad hoc in each page that happens to need it.
 */

export interface AccountTreeNode {
  account: Account;
  /** 0 for a top-level account, 1 for its child, and so on. Drives indentation. */
  depth: number;
  /** True when at least one other account names this one as its parent. */
  hasChildren: boolean;
}

/** Returns every account in parent-then-children order, each tagged with its depth.
 *
 * An account whose `parentId` points at something missing (deleted, or filtered out by an
 * activeOnly query) is treated as top level rather than dropped — losing an account from the chart
 * because its parent was hidden would be a silent, and much worse, failure. Cycles are broken the
 * same way: any account not reached by walking down from the roots is appended at depth 0, so a
 * corrupt parent chain still renders instead of hanging the page. */
export function buildAccountTree(accounts: Account[]): AccountTreeNode[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const childrenOf = new Map<number | null, Account[]>();
  const hasChildren = new Set<number>();

  for (const a of accounts) {
    const parentExists = a.parentId != null && byId.has(a.parentId);
    const key = parentExists ? a.parentId! : null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(a);
    if (parentExists) hasChildren.add(a.parentId!);
  }
  for (const list of childrenOf.values()) list.sort((x, y) => x.code.localeCompare(y.code));

  const out: AccountTreeNode[] = [];
  const seen = new Set<number>();

  function walk(parentKey: number | null, depth: number) {
    for (const a of childrenOf.get(parentKey) ?? []) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push({ account: a, depth, hasChildren: hasChildren.has(a.id) });
      walk(a.id, depth + 1);
    }
  }
  walk(null, 0);

  // Anything unreachable from a root — only possible via a parent cycle — still gets listed.
  for (const a of accounts) {
    if (!seen.has(a.id)) out.push({ account: a, depth: 0, hasChildren: hasChildren.has(a.id) });
  }
  return out;
}

/** Maps each account id to its own balance plus every descendant's.
 *
 * Accounts with no children come back unchanged, so callers can use this map everywhere rather
 * than branching on whether a given account is a parent. Amounts are summed as signed cents in
 * whatever convention the caller passed in — this does no normal-balance flipping, because the
 * trial balance and the balance sheet already hand over figures in different conventions and
 * silently re-signing one of them here would corrupt it. */
export function rollUpBalances(accounts: Account[], own: Map<number, number>): Map<number, number> {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const rolled = new Map<number, number>();

  function totalFor(id: number, guard: Set<number>): number {
    if (rolled.has(id)) return rolled.get(id)!;
    if (guard.has(id)) return own.get(id) ?? 0; // cycle — count this account once, don't recurse
    guard.add(id);
    let sum = own.get(id) ?? 0;
    for (const a of accounts) {
      if (a.parentId === id && byId.has(a.id)) sum += totalFor(a.id, guard);
    }
    guard.delete(id);
    rolled.set(id, sum);
    return sum;
  }

  for (const a of accounts) totalFor(a.id, new Set());
  return rolled;
}
