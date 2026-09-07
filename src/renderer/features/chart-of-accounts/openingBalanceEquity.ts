import type { AccountType } from '@shared/domain/types';

const OPENING_BALANCE_EQUITY_NAME = 'Opening Balance Equity';

/** Finds the standing "Opening Balance Equity" account (same convention QuickBooks uses as the
 * balancing side of a starting balance), creating it if this is the first time it's needed. */
export async function ensureOpeningBalanceEquityAccountId(): Promise<number | null> {
  const existingResult = await window.api.accounts.list({});
  if (!existingResult.ok) return null;
  const existing = existingResult.data.find((a) => a.name.toLowerCase() === OPENING_BALANCE_EQUITY_NAME.toLowerCase());
  if (existing) return existing.id;

  const existingCodes = new Set(existingResult.data.map((a) => a.code));
  let nextCode = 3900;
  while (existingCodes.has(String(nextCode))) nextCode++;
  const created = await window.api.accounts.create({
    code: String(nextCode),
    name: OPENING_BALANCE_EQUITY_NAME,
    accountType: 'Equity',
    accountSubtype: null,
    // No CRA-confirmed GIFI code for this — it's a bookkeeping convention (a temporary clearing
    // account), not a category that appears on a GIFI schedule. Left unmapped rather than guessed.
    gifiCode: null,
    description: 'Balances the starting balance entered for a bank/credit card account when bookkeeping begins partway through its history.',
  });
  return created.ok ? created.data.id : null;
}

/** Posts a starting balance for a bank/credit card/other Asset, Liability, or Equity account
 * against Opening Balance Equity, and posts the entry immediately — the same convention QuickBooks
 * uses so an account's balance is correct from day one without a fabricated "first transaction"
 * standing in for history that predates this software.
 *
 * For Asset/Liability, `amountCents` is the account's own balance as shown on a statement — always
 * positive (a bank account showing a genuine negative/overdrawn balance isn't handled here).
 *
 * For Equity, `amountCents` is signed to match exactly how the account reads on a real Balance
 * Sheet: positive means a normal credit balance (Common Shares, Retained Earnings), negative means
 * a contra-equity account whose own balance is a debit (Dividends Paid, which a real statement
 * shows as e.g. "-20,000.00" under Equity). The sign is resolved into a genuine debit/credit pair
 * here — journal entry lines themselves are never negative (double-entry doesn't work that way);
 * only the STARTING VALUE the reviewer types, matching what they're reading off their old
 * statement, is allowed to be signed. */
export async function postOpeningBalance(input: {
  accountId: number;
  accountName: string;
  accountType: AccountType;
  amountCents: number;
  asOfDate: string;
  /** A/R and A/P opening balances keep the customer/vendor on the control-account line so contact
   * statements and supplier history agree with the general ledger from the first day. */
  customerId?: number | null;
  vendorId?: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const equityAccountId = await ensureOpeningBalanceEquityAccountId();
  if (equityAccountId === null) {
    return { ok: false, error: 'Opening Balance Equity account could not be resolved.' };
  }
  let accountDebitCents: number;
  let accountCreditCents: number;
  if (input.accountType === 'Equity') {
    const magnitude = Math.abs(input.amountCents);
    const isDebitBalance = input.amountCents < 0;
    accountDebitCents = isDebitBalance ? magnitude : 0;
    accountCreditCents = isDebitBalance ? 0 : magnitude;
  } else {
    const isAsset = input.accountType === 'Asset';
    accountDebitCents = isAsset ? input.amountCents : 0;
    accountCreditCents = isAsset ? 0 : input.amountCents;
  }
  const postResult = await window.api.journal.createAndPost({
    entryDate: input.asOfDate,
    memo: `Opening balance — ${input.accountName}`,
    reference: null,
    lines: [
      {
        accountId: input.accountId,
        debitCents: accountDebitCents,
        creditCents: accountCreditCents,
        customerId: input.customerId ?? null,
        vendorId: input.vendorId ?? null,
      },
      { accountId: equityAccountId, debitCents: accountCreditCents, creditCents: accountDebitCents },
    ],
  });
  if (!postResult.ok) return { ok: false, error: postResult.error };
  return { ok: true };
}
