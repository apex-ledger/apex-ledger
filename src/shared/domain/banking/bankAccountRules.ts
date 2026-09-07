/** Where money is allowed to land.
 *
 * Several screens take "a bank account" — paying a bill, receiving a payment, making a deposit,
 * refunding a credit, recording a sales receipt. Only some of them checked what they were given.
 * A deposit posted into Undeposited Funds nets to zero and marks every payment in it as banked
 * while the money never reaches a bank; a refund paid out of Sales Revenue is an expense nobody
 * will find. One rule, applied everywhere money moves, is how that stays impossible.
 */

export interface MoneyAccountCandidate {
  id: number;
  name: string;
  accountSubtype: string | null;
  isActive: boolean;
}

export interface MoneyAccountOptions {
  /** The Undeposited Funds account id, when the caller may post there (sales receipts and
   * receive-payment, which park cash until a deposit). Everywhere else it is refused, because
   * Undeposited Funds is not a bank. */
  undepositedFundsAccountId?: number | null;
}

export const CASH_AND_BANK_SUBTYPE = 'Cash and Bank';

/** Why a document in one currency cannot be settled through this account, or null if it can.
 *
 * The ledger holds CAD, so a Canadian-dollar account can take money from any document — the
 * payment carries the rate it converted at. An account held in a foreign currency is different:
 * its foreign balance is rebuilt from the foreign amounts on its lines (see foreignBalances.ts),
 * so a CAD invoice paid into a USD account, or a EUR bill paid from it, would move CAD through
 * the account with no USD figure at all and the USD balance would quietly drift from the bank's.
 * `documentCurrency` null means a Canadian-dollar document. `documentLabel` names it for the
 * message — "invoice INV-1042", "this sales receipt". */
export function currencyMatchRefusalReason(
  account: { name: string; currency?: string | null },
  documentCurrency: string | null | undefined,
  documentLabel: string,
): string | null {
  const accountCurrency = account.currency ?? 'CAD';
  const docCurrency = documentCurrency ?? 'CAD';
  if (accountCurrency === 'CAD' || accountCurrency === docCurrency) return null;
  const pick = docCurrency === 'CAD' ? 'a Canadian-dollar account' : `a ${docCurrency} or Canadian-dollar account`;
  return `${account.name} is held in ${accountCurrency}, but ${documentLabel} is in ${docCurrency}. Choose ${pick} instead.`;
}

/** Why this account cannot take the money, or null if it can. `purpose` is the verb for the
 * message — "pay this bill", "make this deposit" — so the reason reads as a sentence. */
export function moneyAccountRefusalReason(
  account: MoneyAccountCandidate | undefined,
  purpose: string,
  options: MoneyAccountOptions = {},
): string | null {
  if (!account) return `Choose an account to ${purpose}.`;
  if (account.id === options.undepositedFundsAccountId) return null;
  if (!account.isActive) return `${account.name} is inactive. Reactivate it in the Chart of Accounts or choose another account to ${purpose}.`;
  if (account.accountSubtype !== CASH_AND_BANK_SUBTYPE) {
    const hint = options.undepositedFundsAccountId ? ' or Undeposited Funds' : '';
    return `${account.name} is not a bank account. Choose an active Cash and Bank account${hint} to ${purpose}.`;
  }
  return null;
}
