import type { Account } from '../types';

/** Which kind of name belongs against a given account.
 *
 * Accounts Payable is what the business owes its vendors, so a customer's name on an AP line is
 * always wrong — it makes the payables ageing and the vendor statement disagree with the ledger,
 * and nothing on screen says why. Accounts Receivable is the same mistake the other way round.
 *
 * Every other account takes either: a bank line, an expense line or a revenue line can legitimately
 * carry a vendor or a customer, and guessing beyond the two control accounts would start refusing
 * entries that are perfectly correct.
 */
export type NameScope = 'vendor' | 'customer' | 'both';

/** Matched on subtype first, then on name.
 *
 * The subtype is the reliable signal — it is what the Chart of Accounts template sets — but a file
 * whose AP account was created by hand or imported may only have the name to go on. */
export function nameScopeForAccount(account: Account | null | undefined): NameScope {
  if (!account) return 'both';

  const name = account.name.toLowerCase();

  if (account.accountType === 'Liability' && /accounts?\s+payable/.test(name)) return 'vendor';
  if (account.accountType === 'Asset' && /accounts?\s+receivable/.test(name)) return 'customer';

  return 'both';
}

/** Whether a name already on a line still belongs there after the account changed.
 *
 * Used to clear a name that has become wrong rather than leaving it in place: an AP line still
 * showing a customer's name after the account was switched is the exact state this is meant to
 * prevent. */
export function nameStillValid(scope: NameScope, vendorId: number | null, customerId: number | null): boolean {
  if (scope === 'vendor') return customerId === null;
  if (scope === 'customer') return vendorId === null;
  return true;
}

export function nameScopeHint(scope: NameScope): string | null {
  if (scope === 'vendor') return 'Accounts Payable is what you owe vendors, so only vendors are offered here.';
  if (scope === 'customer') return 'Accounts Receivable is what customers owe you, so only customers are offered here.';
  return null;
}
