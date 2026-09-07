import type { Account } from '@shared/domain/types';

// North Ledger's account "subtype" is a FREE-TEXT field (see AccountFormModal) — a user can type
// "Bank", "Chequing", "Current Asset", or leave it blank. So the money-account pickers must NOT
// require the exact string 'Cash and Bank' to recognise a bank/cash account, or a user's real
// chequing/savings simply never appears. These helpers recognise the account by any reliable
// signal, and callers fall back to a broad set so the picker is never empty.

/** True for an asset account that is (or looks like) a cash / bank account. */
export function isBankLikeAccount(a: Account): boolean {
  if (a.accountType !== 'Asset') return false;
  if (a.isTransferEligible) return true;
  const subtype = (a.accountSubtype ?? '').toLowerCase();
  if (/cash|bank|chequ|check|saving/.test(subtype)) return true;
  return /chequ|check|saving|\bbank\b|cash|petty|paypal|stripe|wise|e-?transfer|undeposited/.test(a.name.toLowerCase());
}

/** True for a liability account that is (or looks like) a credit card. */
export function isCreditCardLikeAccount(a: Account): boolean {
  if (a.accountType !== 'Liability') return false;
  const subtype = (a.accountSubtype ?? '').toLowerCase();
  if (/credit/.test(subtype)) return true;
  return /credit card|\bvisa\b|mastercard|amex|american express|\bcard\b/.test(a.name.toLowerCase());
}

/** Walks up the parent chain, returning true if the account OR any ancestor satisfies `test`. This
 * keeps sub-accounts (e.g. "Operating" nested under a "Chequing Account" parent) matching even when
 * the child's own name/subtype gives no clue — it inherits its parent's nature. */
function selfOrAncestor(a: Account, byId: Map<number, Account>, test: (x: Account) => boolean): boolean {
  let cur: Account | undefined = a;
  let guard = 0;
  while (cur && guard++ < 32) {
    if (test(cur)) return true;
    cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

/** Accounts to offer for "deposit to" / "pay from" pickers — bank/cash accounts AND their
 * sub-accounts. Falls back to every asset account when nothing looks bank-like, so the picker
 * always shows something the user can pick. */
export function depositableAccounts(accounts: Account[]): Account[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const bankLike = accounts.filter((a) => selfOrAncestor(a, byId, isBankLikeAccount));
  return bankLike.length > 0 ? bankLike : accounts.filter((a) => a.accountType === 'Asset');
}

/** Accounts to offer for bank/credit-card reconciliation — bank/credit-card accounts AND their
 * sub-accounts. Falls back to assets + liabilities. */
export function reconcilableAccounts(accounts: Account[]): Account[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const matched = accounts.filter((a) => selfOrAncestor(a, byId, isBankLikeAccount) || selfOrAncestor(a, byId, isCreditCardLikeAccount));
  return matched.length > 0 ? matched : accounts.filter((a) => a.accountType === 'Asset' || a.accountType === 'Liability');
}

/** Everywhere money can be moved TO — bank-like accounts first, then every other asset account.
 *
 * Deliberately wider than depositableAccounts. Depositing undeposited funds is not always a walk to
 * the bank: takings go to a card processor's holding account, into a cash float, or against a
 * shareholder loan, and a picker that only lists chequing accounts forces the entry somewhere it
 * does not belong. Bank-like ones stay at the top because they are still the common case. */
export function allDepositTargets(accounts: Account[]): Account[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const assets = accounts.filter((a) => a.accountType === 'Asset');
  const bankLike = assets.filter((a) => selfOrAncestor(a, byId, isBankLikeAccount));
  const bankLikeIds = new Set(bankLike.map((a) => a.id));
  return [...bankLike, ...assets.filter((a) => !bankLikeIds.has(a.id))];
}

/** True for the Undeposited Funds holding account.
 *
 * Matched by name because it is created on demand rather than being part of any template, so there
 * is no code or subtype that reliably marks it. */
export function isUndepositedFundsAccount(a: Account): boolean {
  return a.accountType === 'Asset' && /undeposited/i.test(a.name);
}

/** Accounts money can be paid OUT of — bank and cash accounts, minus Undeposited Funds.
 *
 * Undeposited Funds is a receipts holding account: it carries customer money taken but not yet
 * banked. Paying a supplier, a payroll run or a dividend from it credits an account that only ever
 * legitimately holds incoming money, driving it negative and corrupting the deposit workflow, since
 * the balance there is supposed to be exactly what is waiting to be banked.
 *
 * It appeared in these pickers because isBankLikeAccount matches the word "undeposited" — correct
 * for deciding what looks like a money account, wrong for deciding what can fund a payment. */
export function paymentSourceAccounts(accounts: Account[]): Account[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const usable = accounts.filter((a) => !isUndepositedFundsAccount(a));

  // The fallback is applied AFTER the exclusion, not before. Filtering a fallback that already
  // succeeded can empty the list completely — a file whose only bank-like account is Undeposited
  // Funds would leave the picker with nothing in it and no explanation.
  const bankLike = usable.filter((a) => selfOrAncestor(a, byId, isBankLikeAccount));
  return bankLike.length > 0 ? bankLike : usable.filter((a) => a.accountType === 'Asset');
}
