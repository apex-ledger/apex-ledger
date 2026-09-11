import type { Account, JournalEntry } from '../types';
import { computeAccountBalances, filterEntriesByDateRange } from './../ledger/computeAccountBalances';

/** T2125 — Statement of Business or Professional Activities.
 *
 * The form a sole proprietor files with their T1, and the reason this app is not corporations-only.
 * A corporation files a T2 with GIFI codes, which is already here; an unincorporated business puts
 * the same numbers on a T2125 instead, in the CRA's own line order.
 *
 * Two things make it more than a relabelled income statement:
 *
 *   - Business-use-of-home and vehicle costs are claimed at a PERCENTAGE. The books hold the whole
 *     cost; the form takes the business share, and the personal share is not deductible.
 *   - The claim is capped so that home-office expenses cannot create or increase a loss. The excess
 *     is not lost — it carries forward — but it cannot be deducted this year, and software that
 *     ignores that produces a return the CRA will reassess.
 */

/** The expense lines as the CRA numbers them on the T2125. Kept in form order rather than
 * alphabetically, because the point of this report is to be read alongside the form. */
export const T2125_EXPENSE_LINES: { line: string; label: string; match: RegExp }[] = [
  { line: '8521', label: 'Advertising', match: /advertis|promotion|marketing/i },
  { line: '8523', label: 'Meals and entertainment', match: /meal|entertain/i },
  { line: '8590', label: 'Bad debts', match: /bad debt/i },
  { line: '8690', label: 'Insurance', match: /insurance/i },
  { line: '8710', label: 'Interest and bank charges', match: /interest|bank charge|bank fee/i },
  { line: '8760', label: 'Business taxes, licences, memberships', match: /licence|license|membership|business tax|dues/i },
  { line: '8810', label: 'Office expenses', match: /office (expense|supplies)|stationery|postage/i },
  { line: '8811', label: 'Office stationery and supplies', match: /supplies/i },
  { line: '8860', label: 'Professional fees', match: /professional|legal|account(ing|ant)|bookkeep/i },
  { line: '8871', label: 'Management and administration fees', match: /management fee|admin(istration)? fee/i },
  { line: '8910', label: 'Rent', match: /^(?!.*(vehicle|auto|car\b|truck)).*(^rent|premises|lease(?! improve))/i },
  { line: '8960', label: 'Repairs and maintenance', match: /repair|maintenance/i },
  { line: '9060', label: 'Salaries, wages, and benefits', match: /salar|wage|payroll|benefit|cpp|ei /i },
  { line: '9180', label: 'Property taxes', match: /property tax/i },
  { line: '9200', label: 'Travel', match: /travel|airfare|hotel|accommodation/i },
  // CRA's T4002 guide puts telephone and internet on the utilities line.
  { line: '9220', label: 'Utilities', match: /utilit|hydro|electric|gas|water|heat|telephone|phone|internet|cell|mobile/i },
  // Line 9224 is fuel that is NOT motor vehicle fuel — furnace oil, propane for equipment. The
  // exclusion has to look at the whole account name, not just what follows the word: "Vehicle &
  // Fuel" would otherwise land here instead of on the motor vehicle line below it.
  { line: '9224', label: 'Fuel costs (except motor vehicle)', match: /^(?!.*(vehicle|auto|car|mileage)).*fuel/i },
  { line: '9275', label: 'Delivery, freight, and express', match: /deliver|freight|courier|shipping/i },
  { line: '9281', label: 'Motor vehicle expenses', match: /vehicle|automobile|mileage|car /i },
  { line: '9270', label: 'Other expenses', match: /.^/ }, // never matches; the catch-all is explicit
];

export interface T2125ExpenseRow {
  line: string;
  label: string;
  amountCents: number;
  accountIds: number[];
}

export interface T2125Input {
  /** Business share of home costs, 0–1. The books hold the whole cost. */
  homeUsePercent: number;
  /** Total home costs for the year — heat, hydro, insurance, mortgage interest, property tax. */
  homeCostsCents: number;
  /** Business share of vehicle running costs, 0–1: business kilometres over total kilometres. */
  vehicleUsePercent: number;
  vehicleCostsCents: number;
  /** Home-office amount carried in from last year, which was capped then and is claimable now. */
  homeCarryForwardInCents: number;
  /** CCA claimed, from the CCA schedule. */
  ccaClaimedCents: number;
}

/** Book expenses that are not deductible on a T2125 as such: amortization is replaced by the CCA
 * claim (line 9936), and a sole proprietor's donations are a personal credit, not a business
 * expense. They are listed rather than dropped so the reconciliation to the books is visible. */
export const T2125_NOT_DEDUCTIBLE = /amortization|depreciation|charitable|donation|income tax(?!es payable)/i;

export interface T2125ExcludedRow {
  accountId: number;
  name: string;
  amountCents: number;
  reason: string;
}

export interface T2125Result {
  periodStart: string;
  periodEnd: string;
  grossRevenueCents: number;
  costOfGoodsSoldCents: number;
  grossProfitCents: number;
  expenses: T2125ExpenseRow[];
  totalExpensesCents: number;
  /** Book expenses left off the form: amortization (CCA is claimed instead) and donations. */
  excluded: T2125ExcludedRow[];
  /** The books' meal and entertainment total; line 8523 carries half of it. */
  mealsBookAmountCents: number;
  ccaClaimedCents: number;
  vehicleClaimCents: number;
  /** Net income before the home-office claim — the figure the home cap is measured against. */
  netBeforeHomeCents: number;
  /** Home costs × business share, plus anything carried forward. */
  homeClaimAvailableCents: number;
  /** What can actually be deducted this year: never more than the profit before it. */
  homeClaimAllowedCents: number;
  /** The part that cannot be claimed this year but is not lost — it carries to next year. */
  homeCarryForwardOutCents: number;
  netIncomeCents: number;
}

function amountFor(account: Account, balances: ReturnType<typeof computeAccountBalances>): number {
  return balances.get(account.id)?.balanceCents ?? 0;
}

/** Maps an expense account to a T2125 line by name.
 *
 * Name matching is a heuristic, and the report says so on screen rather than pretending otherwise.
 * The alternative — asking a sole proprietor to hand-map forty accounts before seeing anything —
 * gets abandoned halfway through. Anything unmatched lands in "Other expenses" (9270), which is a
 * real line on the form, so nothing is dropped. */
export function t2125LineFor(account: Account): { line: string; label: string } {
  // The chart's own GIFI item is a deliberate mapping; when it is one of the T2125 lines it beats
  // any guess from the name ("Postage & Delivery" filed on 9275 stays on 9275).
  const byGifi = account.gifiCode ? T2125_EXPENSE_LINES.find((c) => c.line === account.gifiCode && c.line !== '9270') : undefined;
  if (byGifi) return { line: byGifi.line, label: byGifi.label };
  for (const candidate of T2125_EXPENSE_LINES) {
    if (candidate.line === '9270') continue;
    if (candidate.match.test(account.name)) return { line: candidate.line, label: candidate.label };
  }
  return { line: '9270', label: 'Other expenses' };
}

export function computeT2125(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart: string,
  periodEnd: string,
  input: T2125Input,
): T2125Result {
  const balances = computeAccountBalances(accounts, filterEntriesByDateRange(entries, periodStart, periodEnd));

  let grossRevenueCents = 0;
  let costOfGoodsSoldCents = 0;
  let mealsBookAmountCents = 0;
  const byLine = new Map<string, T2125ExpenseRow>();
  const excluded: T2125ExcludedRow[] = [];

  for (const account of accounts) {
    const amountCents = amountFor(account, balances);
    if (amountCents === 0) continue;

    if (account.accountType === 'Revenue') {
      grossRevenueCents += amountCents;
      continue;
    }
    if (account.accountType !== 'Expense') continue;

    // Cost of sales is reported separately above gross profit, not among the expense lines.
    if (account.accountSubtype === 'Cost of Sales') {
      costOfGoodsSoldCents += amountCents;
      continue;
    }

    if (T2125_NOT_DEDUCTIBLE.test(account.name)) {
      const reason = /amortization|depreciation/i.test(account.name)
        ? 'Not deductible: capital cost allowance is claimed on line 9936 instead'
        : /income tax/i.test(account.name)
          ? 'Not deductible: income tax is not a business expense'
          : 'Not deductible: donations are claimed as a personal credit on the T1';
      excluded.push({ accountId: account.id, name: account.name, amountCents, reason });
      continue;
    }

    const { line, label } = t2125LineFor(account);
    if (!byLine.has(line)) byLine.set(line, { line, label, amountCents: 0, accountIds: [] });
    const row = byLine.get(line)!;
    // Meals and entertainment: the form takes 50% of the books' figure (T4002, line 8523).
    if (line === '8523') mealsBookAmountCents += amountCents;
    row.amountCents += line === '8523' ? Math.round(amountCents / 2) : amountCents;
    row.accountIds.push(account.id);
  }

  const expenses = [...byLine.values()].sort((a, b) => a.line.localeCompare(b.line));
  const totalExpensesCents = expenses.reduce((sum, r) => sum + r.amountCents, 0);

  const grossProfitCents = grossRevenueCents - costOfGoodsSoldCents;
  const vehicleClaimCents = Math.round(input.vehicleCostsCents * input.vehicleUsePercent);

  const netBeforeHomeCents = grossProfitCents - totalExpensesCents - input.ccaClaimedCents - vehicleClaimCents;

  const homeClaimAvailableCents =
    Math.round(input.homeCostsCents * input.homeUsePercent) + input.homeCarryForwardInCents;
  // Home-office expenses cannot create or increase a loss. The excess is not lost — it carries
  // forward — but claiming it this year would produce a return that gets reassessed.
  const homeClaimAllowedCents = Math.max(0, Math.min(homeClaimAvailableCents, Math.max(0, netBeforeHomeCents)));
  const homeCarryForwardOutCents = homeClaimAvailableCents - homeClaimAllowedCents;

  return {
    periodStart,
    periodEnd,
    grossRevenueCents,
    costOfGoodsSoldCents,
    grossProfitCents,
    expenses,
    totalExpensesCents,
    excluded,
    mealsBookAmountCents,
    ccaClaimedCents: input.ccaClaimedCents,
    vehicleClaimCents,
    netBeforeHomeCents,
    homeClaimAvailableCents,
    homeClaimAllowedCents,
    homeCarryForwardOutCents,
    netIncomeCents: netBeforeHomeCents - homeClaimAllowedCents,
  };
}
