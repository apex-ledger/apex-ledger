import type { Account, JournalEntry, JournalEntryLine, TaxCode } from '../types';
import { gstHstPortionOfInclusive, taxCodeReportsGstHst, taxPortionOfInclusive } from './taxCodes';
import { isGstHstControlAccount, isGstHstReturnAccount } from './gstHstAccounts';

/**
 * Flat-rate assumption: every line tagged 'HST' represents a tax-INCLUSIVE amount at 13%
 * (the Ontario/most-common HST rate). The embedded tax is amount * 13/113. This is a bookkeeping
 * estimate, not a province-aware or filing-ready calculation — provinces with a different rate
 * (5% GST-only, 15% Atlantic HST, etc.) or non-standard treatment should use 'Manual' instead.
 * 'Manual' lines are excluded from the automatic calculation UNTIL the accountant enters the real
 * HST amount they calculated from the source invoice (see manualHstCents) — once entered, that
 * figure is used exactly as given, folded into the totals the same way an 'HST' line would be.
 */
const HST_RATE_NUMERATOR = 13;
const HST_RATE_DENOMINATOR = 113;

export function hstPortionCents(amountCents: number): number {
  return Math.round((amountCents * HST_RATE_NUMERATOR) / HST_RATE_DENOMINATOR);
}

/**
 * US sales tax, flat-rate assumption at 8%, same tax-inclusive treatment as HST above (the
 * entered amount is what was actually paid, tax embedded). This is a bookkeeping estimate for a
 * client with US vendors/customers — actual US sales tax rates vary by state/locality, so this
 * is not filing-ready for a US sales tax return. Intentionally kept out of computeHstSummary
 * below: that report is specifically for CRA GST/HST remittance, and US sales tax is a different
 * tax system entirely.
 */
const US_TAX_RATE_NUMERATOR = 8;
const US_TAX_RATE_DENOMINATOR = 108;

export function usTaxPortionCents(amountCents: number): number {
  return Math.round((amountCents * US_TAX_RATE_NUMERATOR) / US_TAX_RATE_DENOMINATOR);
}

/** Embedded-tax portion for whichever rate-based code applies, or 0 for 'NonHST'/'Manual'/null
 * ('Manual' has its own hand-entered manualHstCents instead — see computeHstSummary). */
export function taxPortionCents(taxCode: TaxCode | null, amountCents: number): number {
  // Rate-driven rather than a two-code special case, so the provincial codes show their embedded
  // tax too. 'HST' and 'USTax' still come out as 13/113 and 8/108 exactly as they always did.
  return taxPortionOfInclusive(taxCode, amountCents);
}

/**
 * The amount a line contributes to its direction's running total, SIGNED so reversals subtract.
 *
 * Tax collected accumulates on the credit side of GST/HST Payable, so a debit there — remitting to
 * CRA, a credit note, a customer refund, a correcting entry — is negative collected tax, not extra
 * collected tax. Input tax credits are the mirror image on GST/HST Recoverable. Taking whichever
 * side happened to be non-zero (as this used to) counted every remittance as another sale's worth
 * of tax and overstated the next period's net payable.
 */
export function signedAmountCents(line: JournalEntryLine, direction: HstDirection): number {
  return direction === 'collected' ? line.creditCents - line.debitCents : line.debitCents - line.creditCents;
}

/**
 * Splits one combined GST/HST line across the category lines that produced it, in proportion to
 * each line's base amount. A 3-line invoice posts a single GST/HST Payable credit covering all
 * three, so attributing the whole amount to the first tax-coded line (as this used to) reported
 * 100% of the tax against one revenue account. Period totals were unaffected; the by-account
 * breakdown was not. The largest share absorbs any rounding remainder so the parts always sum back
 * to the posted total exactly.
 */
export function allocateByBase(totalCents: number, baseCents: number[]): number[] {
  const baseSum = baseCents.reduce((sum, b) => sum + b, 0);
  if (baseSum <= 0) {
    // No usable bases to weight by (all zero, or a reversal that nets out) — put it all on the
    // first line rather than silently dropping the amount.
    return baseCents.map((_, i) => (i === 0 ? totalCents : 0));
  }
  const shares = baseCents.map((b) => Math.round((totalCents * b) / baseSum));
  const remainder = totalCents - shares.reduce((sum, s) => sum + s, 0);
  if (remainder !== 0) {
    let largest = 0;
    for (let i = 1; i < baseCents.length; i += 1) if (baseCents[i] > baseCents[largest]) largest = i;
    shares[largest] += remainder;
  }
  return shares;
}

export interface HstPeriodSummary {
  /** 'YYYY-MM' for monthly, 'YYYY-Q#' for quarterly, 'YYYY' for annual. */
  period: string;
  /** HST collected from customers (output tax) — Revenue-type accounts tagged 'HST'. */
  collectedCents: number;
  /** Input Tax Credits — HST paid on Expense/Asset-type accounts tagged 'HST'. */
  itcCents: number;
  /** collected - itc. Positive = owed to CRA, negative = refund. */
  netPayableCents: number;
  /** Lines tagged 'Manual' in this period that still have no entered amount — excluded from the
   * totals above, pending the accountant's calculation. */
  manualCount: number;
  manualAmountCents: number;
}

export type HstDirection = 'collected' | 'itc';

export interface HstAccountBreakdownRow {
  account: Account;
  direction: HstDirection;
  hstCents: number;
  baseAmountCents: number;
}

export interface HstManualReviewLine {
  lineId: number;
  entryId: number;
  entryDate: string;
  /** When the entry was keyed in (stored UTC) — the Entered column beside Date. */
  createdAt: string;
  account: Account;
  description: string | null;
  baseAmountCents: number;
  /** The accountant's entered HST amount for this line, or null if not yet entered. */
  manualHstCents: number | null;
}

export interface HstSummaryResult {
  monthly: HstPeriodSummary[];
  quarterly: HstPeriodSummary[];
  annual: HstPeriodSummary[];
  byAccount: HstAccountBreakdownRow[];
  /** Every 'Manual' line in range, entered or not — the input tab uses this list directly. */
  manualReviewLines: HstManualReviewLine[];
}

function emptyPeriod(period: string): HstPeriodSummary {
  return { period, collectedCents: 0, itcCents: 0, netPayableCents: 0, manualCount: 0, manualAmountCents: 0 };
}

/**
 * Builds the HST/GST payable picture for a date range: collected vs. ITC by month/quarter/year,
 * a by-account breakdown (which categories are driving output tax vs. input tax credits), and a
 * list of every 'Manual' line — entered ones are already folded into the totals above; pending
 * ones are called out via manualCount/manualAmountCents for the accountant to still calculate.
 */
export function computeHstSummary(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart: string,
  periodEnd: string,
): HstSummaryResult {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const monthly = new Map<string, HstPeriodSummary>();
  const quarterly = new Map<string, HstPeriodSummary>();
  const annual = new Map<string, HstPeriodSummary>();
  const byAccountMap = new Map<string, HstAccountBreakdownRow>();
  const manualReviewLines: HstManualReviewLine[] = [];

  function bucket(map: Map<string, HstPeriodSummary>, key: string): HstPeriodSummary {
    let existing = map.get(key);
    if (!existing) {
      existing = emptyPeriod(key);
      map.set(key, existing);
    }
    return existing;
  }

  function applyHst(periodKeys: [Map<string, HstPeriodSummary>, string][], account: Account, direction: HstDirection, hstCents: number, baseCents: number) {
    for (const [map, key] of periodKeys) {
      const p = bucket(map, key);
      if (direction === 'collected') p.collectedCents += hstCents;
      else p.itcCents += hstCents;
      p.netPayableCents = p.collectedCents - p.itcCents;
    }
    const acctKey = `${account.id}:${direction}`;
    let row = byAccountMap.get(acctKey);
    if (!row) {
      row = { account, direction, hstCents: 0, baseAmountCents: 0 };
      byAccountMap.set(acctKey, row);
    }
    row.hstCents += hstCents;
    row.baseAmountCents += baseCents;
  }

  const isGstHstAccountName = (name: string) => isGstHstControlAccount({ name });

  for (const entry of entries) {
    if (entry.status !== 'posted') continue;
    if (entry.entryDate < periodStart || entry.entryDate > periodEnd) continue;
    // Filing a return clears the control accounts into "filed payable" / "refund receivable". That
    // journal is dated the day the return was filed — usually inside the NEXT period — and reading
    // its debit to GST/HST Payable as "tax collected went down" would show the next quarter with
    // negative figures. It is bookkeeping about a return, not tax activity: skip it.
    const isFilingEntry = entry.lines.length > 0 && entry.lines.every((line) => {
      const account = accountById.get(line.accountId);
      return account !== undefined && isGstHstReturnAccount(account);
    });
    if (isFilingEntry) continue;

    const year = Number(entry.entryDate.slice(0, 4));
    const month = Number(entry.entryDate.slice(5, 7));
    const monthKey = entry.entryDate.slice(0, 7);
    const quarterKey = `${year}-Q${Math.ceil(month / 3)}`;
    const yearKey = String(year);
    const periodKeys: [Map<string, HstPeriodSummary>, string][] = [
      [monthly, monthKey],
      [quarterly, quarterKey],
      [annual, yearKey],
    ];

    // Entries created after tax was split onto its own GST/HST Payable/Recoverable line (see
    // buildTaxSplitLines.ts) carry the real posted tax amount directly — use that instead of
    // re-deriving it from the category line, which no longer holds the tax embedded. Older
    // entries (pre-dating that change) have no such line and fall through to the legacy
    // embedded-tax extraction below, so historical HST Centre figures stay correct too.
    const gstLines = entry.lines.filter((l) => {
      const account = accountById.get(l.accountId);
      return account && isGstHstAccountName(account.name);
    });

    if (gstLines.length > 0) {
      const gstAccountIds = new Set(gstLines.map((l) => l.accountId));
      for (const gstLine of gstLines) {
        const gstAccount = accountById.get(gstLine.accountId)!;
        const direction: HstDirection = gstAccount.name.toLowerCase() === 'gst/hst payable' ? 'collected' : 'itc';
        const hstCents = signedAmountCents(gstLine, direction);
        if (hstCents === 0) continue;

        // Every tax-coded line that isn't itself a GST/HST line — i.e. the revenue/expense lines
        // this tax was charged on. Excluding both GST/HST accounts matters for entries that touch
        // payable and recoverable at once (an HST filing), where one would otherwise be mistaken
        // for the other's category line.
        const categoryLines = entry.lines.filter((l) => !gstAccountIds.has(l.accountId) && l.taxCode);
        if (categoryLines.length === 0) {
          applyHst(periodKeys, gstAccount, direction, hstCents, 0);
          continue;
        }

        const bases = categoryLines.map((l) => signedAmountCents(l, direction));
        const shares = allocateByBase(hstCents, bases);
        categoryLines.forEach((categoryLine, i) => {
          const account = accountById.get(categoryLine.accountId) ?? gstAccount;
          applyHst(periodKeys, account, direction, shares[i], bases[i]);
        });
      }
      continue;
    }

    for (const line of entry.lines) {
      const account = accountById.get(line.accountId);
      if (!account || !line.taxCode) continue;
      // A line written by the tax split (baseCents recorded) carries no embedded tax: whatever tax
      // it had went onto a control-account line, and this entry has none. Deriving tax from its
      // amount would report GST/HST that was never posted — a Quick Entry with an HST code and the
      // tax deliberately set to zero is exactly that case.
      if (line.baseCents !== null) continue;
      const direction: HstDirection = account.accountType === 'Revenue' ? 'collected' : 'itc';
      // Signed for the same reason as the split-tax path above — a reversing entry against a
      // legacy embedded-tax line has to subtract from the period rather than add to it.
      const base = signedAmountCents(line, direction);

      if (line.taxCode === 'Manual') {
        manualReviewLines.push({
          lineId: line.id,
          entryId: entry.id,
          entryDate: entry.entryDate,
          createdAt: entry.createdAt,
          account,
          description: line.description,
          baseAmountCents: base,
          manualHstCents: line.manualHstCents,
        });

        if (line.manualHstCents !== null) {
          // manualHstCents is stored as a positive figure against the line, so a reversing line
          // (negative base) has to flip it to subtract from the period.
          applyHst(periodKeys, account, direction, base < 0 ? -line.manualHstCents : line.manualHstCents, base);
        } else {
          for (const [map, key] of periodKeys) {
            const p = bucket(map, key);
            p.manualCount += 1;
            p.manualAmountCents += base;
          }
        }
        continue;
      }

      // Every code with a federal component belongs on a GST/HST return — not just Ontario's 13%.
      // For BC/SK/MB only the 5% GST slice counts, because PST and RST are filed with the province;
      // likewise Quebec, whose QST goes to Revenu Quebec. Meals stays out, as it always has: its
      // 50% restriction is applied when the claim is prepared, not when the tax is recorded.
      if (!taxCodeReportsGstHst(line.taxCode)) continue;
      applyHst(periodKeys, account, direction, gstHstPortionOfInclusive(line.taxCode, base), base);
    }
  }

  const byPeriod = (a: HstPeriodSummary, b: HstPeriodSummary) => a.period.localeCompare(b.period);

  return {
    monthly: Array.from(monthly.values()).sort(byPeriod),
    quarterly: Array.from(quarterly.values()).sort(byPeriod),
    annual: Array.from(annual.values()).sort(byPeriod),
    byAccount: Array.from(byAccountMap.values()).sort((a, b) => b.hstCents - a.hstCents),
    manualReviewLines: manualReviewLines.sort((a, b) => a.entryDate.localeCompare(b.entryDate)),
  };
}
