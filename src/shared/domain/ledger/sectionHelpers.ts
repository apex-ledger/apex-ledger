import type { Account } from '../types';
import type { AccountBalance } from './computeAccountBalances';

export interface SectionLine {
  account: Account;
  amountCents: number;
  comparativeAmountCents?: number;
  /** This line's amountCents already includes any adjusting entries — this is just the isolated
   * portion contributed by entries flagged "Is Adjusting Journal Entry?", so a reviewer can see
   * pre-adjustment balance (amountCents - adjustingAmountCents), the adjustment itself, and the
   * final balance side by side, same as an accountant's year-end workpapers. Only present when the
   * caller asked for the split (see buildSection's adjustingBalances param). */
  adjustingAmountCents?: number;
}

export interface Section {
  label: string;
  lines: SectionLine[];
  totalCents: number;
  comparativeTotalCents?: number;
  adjustingTotalCents?: number;
}

/** Builds a report section (e.g. Assets, Revenue) from account balances, skipping zero-balance
 * accounts. Pass `adjustingBalances` (same accounts, but computed from only the adjusting-entry
 * subset of posted entries) to also break out each line's adjusting-entry contribution. */
export function buildSection(
  label: string,
  accounts: Account[],
  balances: Map<number, AccountBalance>,
  comparativeBalances?: Map<number, AccountBalance>,
  adjustingBalances?: Map<number, AccountBalance>,
): Section {
  const lines: SectionLine[] = [];
  let totalCents = 0;
  let comparativeTotalCents = comparativeBalances ? 0 : undefined;
  let adjustingTotalCents = adjustingBalances ? 0 : undefined;

  for (const account of accounts) {
    const amountCents = balances.get(account.id)?.balanceCents ?? 0;
    const comparativeAmountCents = comparativeBalances
      ? comparativeBalances.get(account.id)?.balanceCents ?? 0
      : undefined;
    const adjustingAmountCents = adjustingBalances ? adjustingBalances.get(account.id)?.balanceCents ?? 0 : undefined;
    if (amountCents === 0 && (comparativeAmountCents ?? 0) === 0) continue;
    lines.push({ account, amountCents, comparativeAmountCents, adjustingAmountCents });
    totalCents += amountCents;
    if (comparativeTotalCents !== undefined) comparativeTotalCents += comparativeAmountCents ?? 0;
    if (adjustingTotalCents !== undefined) adjustingTotalCents += adjustingAmountCents ?? 0;
  }

  lines.sort((a, b) => a.account.code.localeCompare(b.account.code));
  return { label, lines, totalCents, comparativeTotalCents, adjustingTotalCents };
}
