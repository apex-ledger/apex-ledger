/** The accounts the sales and purchase cycles post to, defined once.
 *
 * Every handler that needs Accounts Receivable used to carry its own copy of these arguments, and
 * two of them disagreed on the fallback code. Lookup is by name, so nothing went wrong in
 * practice — but two definitions of one account is a bug waiting for the first company where the
 * name is missing. The codes match the chart-of-accounts templates (1200 / 2100) so an
 * auto-created account lands where a bookkeeper expects it.
 */

export const ACCOUNTS_RECEIVABLE_ARGS = ['Accounts Receivable', 'Asset', '1200', '1060', 'Current Asset'] as const;
export const ACCOUNTS_PAYABLE_ARGS = ['Accounts Payable', 'Liability', '2100', '2621', 'Current Liability'] as const;
/** Not "Cash and Bank" on purpose — it must stay out of every "pick a bank account" picker in the
 * app (paying bills, other deposits, bank reconciliation) since it isn't a real bank account,
 * exactly like QuickBooks Desktop's own Undeposited Funds account. */
export const UNDEPOSITED_FUNDS_ACCOUNT_ARGS = ['Undeposited Funds', 'Asset', 'UNDEP-FUNDS', '1001', 'Current Asset'] as const;

/** Where realized (and, at period end, unrealized) foreign exchange differences post. GIFI 8231
 * is CRA's foreign exchange gains/losses line. */
export const EXCHANGE_GAIN_LOSS_ACCOUNT_ARGS = ['Exchange Gain/Loss', 'Expense', '5950', '8231', 'Other Expense'] as const;
