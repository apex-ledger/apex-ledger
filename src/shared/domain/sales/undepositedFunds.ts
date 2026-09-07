/** Which received payments are still sitting in Undeposited Funds, waiting to be banked.
 *
 * Extracted from the deposit handler because getting it wrong double-counts cash, and a rule that
 * can double-count cash should be testable on its own rather than only reachable through a
 * database.
 *
 * The failure it exists to prevent: an invoice paid straight into a bank account was still offered
 * on the "Make Deposit" screen, and depositing it posted Debit Bank / Credit Undeposited Funds a
 * second time — overstating the bank and driving Undeposited Funds negative.
 */

export interface DepositCandidate {
  status: 'paid' | 'unpaid';
  /** Set once this payment has been batched into a bank deposit. */
  depositId: number | null;
  /** Where the money landed. Null on rows written before this was recorded — see below. */
  paymentAccountId: number | null;
  /** True when the balance was cleared by applying a credit note rather than by receiving money.
   * Such an invoice is "paid" with a null payment account — the exact shape of a legacy cash
   * payment — but there is nothing in Undeposited Funds to bank, because no cash ever arrived.
   * Optional so older callers keep compiling; absent means "settled with money". */
  settledByCreditNote?: boolean;
}

/**
 * Whether this payment is still in Undeposited Funds.
 *
 * A null `paymentAccountId` counts as undeposited. Those rows were written before the account was
 * recorded, and every one of them did go to Undeposited Funds, so reading null this way leaves
 * historical data behaving exactly as it already does. Guessing otherwise would silently change
 * what past deposits mean.
 */
export function isAwaitingDeposit(candidate: DepositCandidate, undepositedFundsAccountId: number): boolean {
  if (candidate.status !== 'paid') return false;
  if (candidate.depositId !== null) return false;
  if (candidate.settledByCreditNote) return false;
  return candidate.paymentAccountId === null || candidate.paymentAccountId === undepositedFundsAccountId;
}

/** Why a payment cannot be deposited, or null if it can. Worded for the person who clicked. */
export function depositRefusalReason(
  candidate: DepositCandidate,
  undepositedFundsAccountId: number,
  documentNumber: string,
): string | null {
  if (candidate.status !== 'paid') return `${documentNumber} has not been paid yet.`;
  if (candidate.depositId !== null) return `${documentNumber} has already been deposited.`;
  if (candidate.settledByCreditNote) return `${documentNumber} was settled by a credit note, so no money arrived to deposit.`;
  if (candidate.paymentAccountId !== null && candidate.paymentAccountId !== undepositedFundsAccountId) {
    return `${documentNumber} was paid straight into a bank account, so it is not waiting in Undeposited Funds.`;
  }
  return null;
}
