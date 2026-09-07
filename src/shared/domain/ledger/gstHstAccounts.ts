import type { Account, TaxCode } from '../types';
import { taxCodeReportsGstHst } from './taxCodes';

/** The two GST/HST control accounts, matched by their exact preset names.
 *
 * These are the accounts a filed return is actually built from: tax collected accumulates on
 * GST/HST Payable, input tax credits on GST/HST Recoverable. Anything posted to them after a return
 * is filed changes numbers already sent to the CRA.
 *
 * Exact-name matching, not a substring: an expense account called "GST/HST instalments" or a
 * customer's "HST holdback" is an ordinary account, and treating it as a control account would
 * quietly lock entries that have nothing to do with the return.
 */
export function isGstHstControlAccount(account: Pick<Account, 'name'>): boolean {
  const name = account.name.trim().toLowerCase();
  return name === 'gst/hst payable' || name === 'gst/hst recoverable';
}

/** Which of the two control accounts a posting will use, found from the chart rather than fetched:
 * the renderer already holds the account list, and asking the main process for an id it could
 * derive itself is a round trip that can be stale by the time it arrives. Null when the company
 * has not got that account yet — the main process creates it on first use. */
export function gstHstControlAccountId(accounts: Pick<Account, 'id' | 'name'>[], side: 'payable' | 'recoverable'): number | null {
  const wanted = side === 'payable' ? 'gst/hst payable' : 'gst/hst recoverable';
  return accounts.find((account) => account.name.trim().toLowerCase() === wanted)?.id ?? null;
}

/** Whether this one line would change the GST/HST return for its period.
 *
 * Two ways a line reaches the return, mirroring exactly how HST Centre reads it (hstSummary.ts):
 *   - it posts to a GST/HST control account — the tax itself, split onto its own line; or
 *   - it is a tax-coded category line from BEFORE tax was split out (`baseCents` null), whose tax
 *     the return still derives from the amount, because nothing else records it.
 * A split-era category line (`baseCents` set) contributes nothing on its own: its tax, if any, is
 * the control-account line beside it. So a Quick Entry with an HST code and the tax deliberately
 * set to zero neither changes the return nor is refused inside a filed period. */
export function lineAffectsGstHstReturn(
  line: { accountId: number; taxCode?: TaxCode | null; baseCents?: number | null },
  controlAccountIds: ReadonlySet<number>,
): boolean {
  if (controlAccountIds.has(line.accountId)) return true;
  if (line.baseCents !== null && line.baseCents !== undefined) return false;
  return taxCodeReportsGstHst(line.taxCode ?? null);
}

/** The accounts a filed return moves balances between: the two control accounts plus the "filed"
 * liability and "refund receivable" asset the filing journal posts to. An entry that touches only
 * these is the clearing entry for a return — it records that a return was filed, not that any tax
 * was collected or paid, and must not be read as activity in the period it happens to be dated. */
export function isGstHstReturnAccount(account: Pick<Account, 'name'>): boolean {
  const name = account.name.trim().toLowerCase();
  return isGstHstControlAccount(account) || name === 'gst/hst filed payable' || name === 'gst/hst refund receivable';
}
