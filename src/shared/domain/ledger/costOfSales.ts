import type { Account } from '../types';

/** Which expenses are the cost of what was sold, as opposed to the cost of being in business.
 *
 * This is the split that turns a flat list of expenses into a real profit and loss:
 *
 *   Revenue − Cost of sales      = Gross profit
 *   Gross profit − Operating     = Net profit
 *
 * Gross profit is the number that says whether the thing being sold is sold at a sensible margin,
 * and it is invisible without the split. A P&L that only nets every expense off revenue can show a
 * healthy bottom line while every sale loses money, which is a fact worth being able to see.
 */

/** Sub-types that mean cost of sales. Matched first, because the subtype is what the chart of
 * accounts template sets and it is the reliable signal. */
const COST_OF_SALES_SUBTYPES = ['cost of sales', 'cost of goods sold', 'cogs', 'direct cost', 'direct costs'];

/** Names that mean cost of sales, for accounts created by hand or imported with no useful subtype.
 *
 * Deliberately narrow. Anything that is merely *related* to what is sold — delivery, packaging,
 * commissions — is left as operating unless the account is explicitly named as a direct cost,
 * because guessing wrong moves money across the gross profit line and changes the margin. */
const COST_OF_SALES_NAMES = /\b(cost of goods sold|cost of sales|cogs|direct costs?|purchases?|materials?|inventory adjustment|freight[- ]in|subcontract costs?)\b/i;

export function isCostOfSalesAccount(account: Account): boolean {
  if (account.accountType !== 'Expense') return false;

  const subtype = (account.accountSubtype ?? '').trim().toLowerCase();
  if (COST_OF_SALES_SUBTYPES.includes(subtype)) return true;

  return COST_OF_SALES_NAMES.test(account.name);
}

export interface ExpenseSplit {
  costOfSales: Account[];
  operating: Account[];
}

/** Splits expense accounts into the two halves of a profit and loss. */
export function splitExpenseAccounts(accounts: Account[]): ExpenseSplit {
  const expenses = accounts.filter((a) => a.accountType === 'Expense');
  return {
    costOfSales: expenses.filter(isCostOfSalesAccount),
    operating: expenses.filter((a) => !isCostOfSalesAccount(a)),
  };
}

/** Gross margin as a percentage of revenue, or null when there is no revenue to be a share of.
 *
 * Null rather than zero: a period with no sales has no margin, and printing 0% would read as
 * "everything sold at cost" rather than "nothing was sold". */
export function grossMarginPercent(revenueCents: number, grossProfitCents: number): number | null {
  if (revenueCents === 0) return null;
  return (grossProfitCents / revenueCents) * 100;
}
